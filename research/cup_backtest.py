"""Backtest of the GOLD page's M15 cup-with-handle condition on 10 years of XAU/USD.

Downloads HistData's free 1-minute XAU/USD bars (2016-2025), builds 15-minute candles, runs the same
detector as gold.html (cupHandle) for a grid of thresholds and trades every first breakout:
entry at the breakout candle's close, stop just beyond the handle (0.2 M15 ATR, at least $2), target one
cup depth past the breakout line, 3 days at most, $0.30 spread taken off every trade.
Thresholds are chosen on 2016-2022 and checked on 2023-2025.

Usage: python3 cup_backtest.py CACHE_DIR            (downloads into CACHE_DIR, skips years already there)
       python3 cup_backtest.py --synthetic           (self-test on generated prices)
"""
import http.cookiejar
import io
import itertools
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

import numpy as np
from numba import njit

YEARS = range(2016, 2026)
TRAIN_END = 2023  # 2016-2022 train, 2023-2025 test
EST = 5 * 3600    # HistData times are EST without daylight saving
SPREAD = 0.30
MIN_TP = 5.0      # take-profit room rule: 50 pips = $5
SL_MIN = 2.0
MAX_HOLD = 288    # 3 days of 15-minute candles


# ---------- data ----------

def histdata_year(year, cache):
    path = os.path.join(cache, f"XAUUSD_M1_{year}.zip")
    if not os.path.exists(path):
        jar = http.cookiejar.CookieJar()
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        ua = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
        ref = f"https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/xauusd/{year}"
        page = op.open(urllib.request.Request(ref, headers=ua), timeout=60).read().decode("utf-8", "replace")
        tk = re.search(r'id="tk"\s+value="([^"]+)"', page) or re.search(r'name="tk"\s+value="([^"]+)"', page)
        if not tk:
            raise RuntimeError(f"{year}: no download token on the page")
        form = urllib.parse.urlencode({"tk": tk.group(1), "date": str(year), "datemonth": str(year),
                                       "platform": "ASCII", "timeframe": "M1", "fxpair": "XAUUSD"}).encode()
        req = urllib.request.Request("https://www.histdata.com/get.php", data=form,
                                     headers={**ua, "Referer": ref, "Content-Type": "application/x-www-form-urlencoded"})
        data = op.open(req, timeout=300).read()
        if not data.startswith(b"PK"):
            raise RuntimeError(f"{year}: not a zip ({data[:80]!r})")
        os.makedirs(cache, exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        time.sleep(2)
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        raw = z.read(name).decode()
    t, o, h, l, c = [], [], [], [], []
    for line in raw.splitlines():
        p = line.split(";")
        if len(p) < 5:
            continue
        dt = datetime.strptime(p[0], "%Y%m%d %H%M%S").replace(tzinfo=timezone.utc)
        t.append(int(dt.timestamp()) + EST)
        o.append(float(p[1])); h.append(float(p[2])); l.append(float(p[3])); c.append(float(p[4]))
    return np.array(t, np.int64), np.array(o), np.array(h), np.array(l), np.array(c)


def to_m15(t, o, h, l, c):
    k = t - t % 900
    starts = np.flatnonzero(np.r_[True, k[1:] != k[:-1]])
    ends = np.r_[starts[1:], len(k)]
    return (k[starts], o[starts], np.maximum.reduceat(h, starts), np.minimum.reduceat(l, starts), c[ends - 1])


def synthetic(n=60000, seed=7):
    """Random walk with cup-with-handle shapes pasted in, to exercise the code without the network."""
    rng = np.random.default_rng(seed)
    t = 1451606400 + np.arange(n, dtype=np.int64) * 900
    c = 1100 + np.cumsum(rng.normal(0, 0.8, n))
    for s in range(500, n - 400, 900):
        base, d = c[s], rng.uniform(8, 25)
        cup = base - d * np.sin(np.linspace(0, np.pi, 40))
        hdl = base - np.linspace(0, d * 0.35, 8)
        run = base + np.linspace(1, d * (1.3 if rng.random() < 0.6 else -0.3), 60)
        seg = np.r_[cup, hdl, run]
        c[s:s + len(seg)] = seg + rng.normal(0, 0.3, len(seg))
        c[s + len(seg):] += c[s + len(seg) - 1] - c[s + len(seg)]
    o = np.r_[c[0], c[:-1]]
    w = np.abs(rng.normal(0, 0.6, n))
    return t, o, np.maximum(o, c) + w, np.minimum(o, c) - w, c


# ---------- detector (same rules as gold.html cupHandle, thresholds as parameters) ----------

@njit(cache=True)
def atr14(h, l, c):
    n = len(c)
    tr = np.zeros(n)
    for i in range(1, n):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    out = np.zeros(n)
    s = 0.0
    for i in range(1, n):
        s += tr[i]
        if i > 14:
            s -= tr[i - 14]
        if i >= 14:
            out[i] = s / 14
    return out


@njit(cache=True)
def detect(h, l, c, a, sma, use_sma, cup_min, cup_max, dep_min, dep_max, rim_tol, pos_lo, round_frac,
           h_min, h_max, pull_min, pull_max):
    """For every candle i whose close is the first close beyond a valid pattern's breakout line, return
    (i, line, handle extreme, depth). Prices are already flipped for sells (high<->-low)."""
    n = len(c)
    out_i = np.zeros(n, np.int64)
    out_line = np.zeros(n)
    out_hl = np.zeros(n)
    out_dep = np.zeros(n)
    m = 0
    for i in range(cup_max + h_max + 20, n):
        if a[i] <= 0:
            continue
        if use_sma and c[i] < sma[i]:
            continue
        # a breakout close must clear the last few highs
        if c[i] <= max(h[i - 1], h[i - 2], h[i - 3]):
            continue
        hit = False
        for r in range(i - 1 - h_min, i - 2 - h_max, -1):   # handle = r+1 .. i-1
            hl_len = i - 1 - r
            if h[r - 1] > h[r] or h[r - 2] > h[r] or h[r - 3] > h[r]:
                continue  # the right rim is a peak
            hh = -1e18
            hlow = 1e18
            for k in range(r + 1, i):
                hh = max(hh, h[k])
                hlow = min(hlow, l[k])
            cmax = h[r]
            bot = 1e18
            bi = r
            for ln in range(2, cup_max + 1):  # cup = l .. r, ln candles
                li = r - ln + 1
                if h[li] > cmax:
                    cmax = h[li]
                if l[li] < bot:
                    bot = l[li]
                    bi = li
                if ln < cup_min:
                    continue
                hlft, hrt = h[li], h[r]
                rim_max = max(hlft, hrt)
                if cmax > rim_max + 1e-9:
                    continue
                rim = min(hlft, hrt)
                depth = rim - bot
                if depth < a[i] * dep_min or depth > a[i] * dep_max or abs(hlft - hrt) > depth * rim_tol:
                    continue
                pos = (bi - li) / (r - li)
                if pos < pos_lo or pos > 1 - pos_lo:
                    continue
                cnt = 0
                for k in range(li, r + 1):
                    if l[k] <= bot + depth * 0.2:
                        cnt += 1
                if cnt < max(4, ln * round_frac):
                    continue
                if hl_len > ln / 2:
                    continue
                pull = hrt - hlow
                if hh > hrt + depth * 0.1 or pull < depth * pull_min or pull > depth * pull_max:
                    continue
                line = max(hrt, hh)
                if c[i] > line + depth * 0.5 or c[i] <= line or c[i - 1] > line:
                    continue  # only the first close beyond the line
                out_i[m] = i
                out_line[m] = line
                out_hl[m] = hlow
                out_dep[m] = depth
                m += 1
                hit = True
                break
            if hit:
                break
    return out_i[:m], out_line[:m], out_hl[:m], out_dep[:m]


@njit(cache=True)
def simulate(h, l, c, a, idx, line, hlow, dep, spread, min_tp, sl_min, max_hold):
    """One trade at a time; returns (entry index, R) per trade."""
    res_i = np.zeros(len(idx), np.int64)
    res_r = np.zeros(len(idx))
    m = 0
    busy = -1
    for k in range(len(idx)):
        i = idx[k]
        if i <= busy:
            continue
        entry = c[i]
        tp = line[k] + dep[k]
        if tp - entry < min_tp:
            continue
        sl = hlow[k] - a[i] * 0.2
        risk = max(entry - sl, sl_min)
        sl = entry - risk
        r = 0.0
        j = i + 1
        end = min(len(c) - 1, i + max_hold)
        done = False
        while j <= end:
            if l[j] <= sl:
                r = -1.0
                done = True
                break
            if h[j] >= tp:
                r = (tp - entry) / risk
                done = True
                break
            j += 1
        if not done:
            j = end
            r = (c[j] - entry) / risk
        r -= spread / risk
        res_i[m] = i
        res_r[m] = r
        m += 1
        busy = j
    return res_i[:m], res_r[:m]


# ---------- grid ----------

def h1_sma(t, c, length=120):
    """H1 120SMA at each M15 candle, the current hour counted with the candle's close (as the page does)."""
    hour = t - t % 3600
    starts = np.flatnonzero(np.r_[True, hour[1:] != hour[:-1]])
    ends = np.r_[starts[1:], len(t)]
    hc = c[ends - 1]
    cs = np.r_[0, np.cumsum(hc)]
    hidx = np.cumsum(np.r_[True, hour[1:] != hour[:-1]]) - 1
    out = np.full(len(c), np.nan)
    for i in range(len(c)):
        k = hidx[i]
        if k >= length - 1:
            out[i] = (cs[k] - cs[k - length + 1] + c[i]) / length
    return out


def stats(r, years, mask=None):
    if mask is not None:
        r, years = r[mask], years[mask]
    if not len(r):
        return {"n": 0}
    win = r > 0
    gp, gl = r[win].sum(), -r[~win].sum()
    yr = {int(y): round(float(r[years == y].mean()), 3) for y in np.unique(years)}
    return {"n": int(len(r)), "win": round(float(win.mean()) * 100, 1), "avgR": round(float(r.mean()), 3),
            "sumR": round(float(r.sum()), 1), "pf": round(float(gp / gl), 2) if gl else None,
            "posYears": sum(v > 0 for v in yr.values()), "years": yr}


def run(t, o, h, l, c):
    a = atr14(h, l, c)
    sma = h1_sma(t, c)
    sma_f = np.nan_to_num(sma, nan=1e18)
    sma_s = -np.nan_to_num(sma, nan=-1e18)
    years = np.array([datetime.fromtimestamp(int(x), timezone.utc).year for x in t])
    flip = (-l, -h, -c)
    base = dict(cup_min=15, cup_max=80, dep_min=1.5, dep_max=12.0, rim_tol=0.25, pos_lo=0.25, round_frac=0.3,
                h_min=3, h_max=15, pull_min=0.1, pull_max=0.5, use_sma=1)
    grid = dict(cup_min=[15, 25, 40], cup_max=[80, 160], dep_min=[1.5, 2.5, 4.0], dep_max=[12.0, 20.0],
                rim_tol=[0.1, 0.25, 0.4], pos_lo=[0.25, 0.35], round_frac=[0.2, 0.3, 0.4], h_max=[15, 24],
                pull_max=[0.33, 0.5], use_sma=[1, 0])

    def evaluate(p):
        rs, ys = [], []
        for side in (1, -1):
            hh, ll, cc = (h, l, c) if side > 0 else flip
            sm = sma_f if side > 0 else sma_s
            idx, line, hl, dep = detect(hh, ll, cc, a, sm, p["use_sma"], p["cup_min"], p["cup_max"], p["dep_min"],
                                        p["dep_max"], p["rim_tol"], p["pos_lo"], p["round_frac"], p["h_min"],
                                        p["h_max"], p["pull_min"], p["pull_max"])
            ti, tr = simulate(hh, ll, cc, a, idx, line, hl, dep, SPREAD, MIN_TP, SL_MIN, MAX_HOLD)
            rs.append(tr); ys.append(years[ti])
        r, y = np.concatenate(rs), np.concatenate(ys)
        return {"all": stats(r, y), "train": stats(r, y, y < TRAIN_END), "test": stats(r, y, y >= TRAIN_END)}

    t0 = time.time()
    current = evaluate(base)
    print("CURRENT", json.dumps({"params": base, **current}, ensure_ascii=False), flush=True)
    keys = list(grid)
    results = []
    for vals in itertools.product(*grid.values()):
        p = {**base, **dict(zip(keys, vals))}
        if p["cup_min"] * 2 > p["cup_max"]:
            continue
        results.append({"params": p, **evaluate(p)})
    print(f"grid: {len(results)} settings in {time.time() - t0:.0f}s", flush=True)
    ok = [x for x in results if x["train"]["n"] >= 120 and x["test"]["n"] >= 30]
    ok.sort(key=lambda x: x["train"]["avgR"], reverse=True)
    for x in ok[:15]:
        print("TOP", json.dumps(x, ensure_ascii=False))
    robust = [x for x in ok if x["test"]["avgR"] > 0 and x["train"]["avgR"] > 0]
    best = max(robust, key=lambda x: min(x["train"]["avgR"], x["test"]["avgR"])) if robust else None
    print("BEST", json.dumps(best, ensure_ascii=False))
    print("COUNTS", json.dumps({"settings": len(results), "eligible": len(ok), "robust": len(robust)}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--synthetic"]:
        t, o, h, l, c = synthetic()
        t = 1451606400 + np.arange(len(t), dtype=np.int64) * (315360000 // len(t))  # spread over ten "years"
        run(t, o, h, l, c)
    else:
        cache = sys.argv[1]
        parts = []
        for y in YEARS:
            try:
                parts.append(histdata_year(y, cache))
                print(y, "minutes", len(parts[-1][0]), flush=True)
            except Exception as e:
                print(y, "download failed:", e, flush=True)
        if not parts:
            sys.exit("no data")
        t, o, h, l, c = (np.concatenate(x) for x in zip(*parts))
        order = np.argsort(t, kind="stable")
        m15 = to_m15(*(x[order] for x in (t, o, h, l, c)))
        print("M15 candles", len(m15[0]), datetime.fromtimestamp(int(m15[0][0]), timezone.utc),
              "..", datetime.fromtimestamp(int(m15[0][-1]), timezone.utc), flush=True)
        run(*m15)
