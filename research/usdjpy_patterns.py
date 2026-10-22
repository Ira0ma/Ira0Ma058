"""Which USD/JPY chart patterns ran 30 pips or more, M15 and H1, 10 years (2016-2025).

HistData's free 1-minute USD/JPY bars, built into 15-minute and 1-hour candles. Patterns, buy and sell
(sells are the buy detectors on prices turned upside down):
  db   double bottom / double top                 (pattern_backtest.py)
  ihs  inverse head and shoulders / head and shoulders  (pattern_backtest.py)
  cup  cup with handle / inverted cup             (cup_backtest.py)
  box  range (rectangle) breakout                 (here)
Every first close beyond the neckline is a breakout. For each, over a grid of thresholds:
  - mfe30: did price run 30 pips past the entry within 3 days (whatever happened in between);
  - hit30: did it reach +30 pips before the stop (just beyond the pattern's last low/high);
  - pips: result of the trade "take profit at +30 pips, stop beyond the pattern", 0.8 pip spread;
  - R with the classic target (one pattern height past the neckline), as for GOLD.
Settings are chosen on 2016-2022 and checked on 2023-2025 (pips per trade positive in both).

Usage: python3 usdjpy_patterns.py CACHE_DIR [TF PATTERN [SIDE]]   (TF m15|h1, PATTERN db|ihs|cup|box, SIDE 1|-1; default all)
       python3 usdjpy_patterns.py --synthetic
"""
import itertools
import json
import sys
import time
from datetime import datetime, timezone

import numpy as np
from numba import njit

from cup_backtest import YEARS, TRAIN_END, atr14, detect as cup_detect, h1_sma, histdata_year, to_m15
from pattern_backtest import GRID as PAT_GRID, double_bottom, inv_head_shoulders, pivots_low, to_h1

PIP = 0.01
TARGET = 30 * PIP
SPREAD = 0.8 * PIP
SL_MIN = 5 * PIP
MAX_HOLD = {"m15": 288, "h1": 72}  # 3 days
MIN_N = {"m15": (100, 30), "h1": (40, 12)}


@njit(cache=True)
def box_breakout(h, l, c, a, sma, use_sma, length, dep_min, dep_max, touches):
    """First closes above a range of `length` candles whose top and bottom were each touched `touches` times."""
    n = len(c)
    oi = np.zeros(n, np.int64); on = np.zeros(n); osl = np.zeros(n); oh = np.zeros(n)
    m = 0
    for i in range(length + 20, n):
        if a[i] <= 0 or (use_sma and c[i] < sma[i]):
            continue
        hi = -1e18; lo = 1e18
        for q in range(i - length, i):
            hi = max(hi, h[q]); lo = min(lo, l[q])
        height = hi - lo
        if c[i] <= hi or c[i - 1] > hi or c[i] > hi + height * 0.5:
            continue
        if height < a[i] * dep_min or height > a[i] * dep_max:
            continue
        nt = 0; nb = 0
        q = i - length
        while q < i:  # touches at least 3 candles apart
            if h[q] >= hi - height * 0.1:
                nt += 1; q += 3
            else:
                q += 1
        q = i - length
        while q < i:
            if l[q] <= lo + height * 0.1:
                nb += 1; q += 3
            else:
                q += 1
        if nt < touches or nb < touches:
            continue
        oi[m] = i; on[m] = hi; osl[m] = lo; oh[m] = height
        m += 1
    return oi[:m], on[:m], osl[:m], oh[:m]


@njit(cache=True)
def trades(h, l, c, a, idx, neck, slv, height, spread, target, sl_min, max_hold):
    """One position at a time. Per trade: entry index, net pips-trade result (price units), hit30, mfe30
    (ran `target` within max_hold at all), risk, R with the classic target, candles to +target (-1: never)."""
    k_n = len(idx)
    ri = np.zeros(k_n, np.int64); res = np.zeros(k_n); hit = np.zeros(k_n, np.bool_); mfe = np.zeros(k_n, np.bool_)
    rk = np.zeros(k_n); rr = np.zeros(k_n); tt = np.full(k_n, -1, np.int64)
    m = 0
    busy = -1
    n = len(c)
    for k in range(k_n):
        i = idx[k]
        if i <= busy or i + 1 >= n:
            continue
        entry = c[i]
        risk = max(entry - (slv[k] - a[i] * 0.2), sl_min)
        sl = entry - risk
        end = min(n - 1, i + max_hold)
        # +30 pips trade
        r = 0.0; done = False; j = i + 1
        while j <= end:
            if l[j] <= sl:
                r = -risk; done = True; break
            if h[j] >= entry + target:
                r = target; hit[m] = True; done = True; break
            j += 1
        if not done:
            j = end
            r = c[j] - entry
        busy = j
        res[m] = r - spread
        # ran 30 pips at all within the hold
        for q in range(i + 1, end + 1):
            if h[q] >= entry + target:
                mfe[m] = True; tt[m] = q - i; break
        # classic target: one height past the neckline
        tp = neck[k] + height[k]
        x = 0.0; done = False
        if tp > entry:
            for q in range(i + 1, end + 1):
                if l[q] <= sl:
                    x = -1.0; done = True; break
                if h[q] >= tp:
                    x = (tp - entry) / risk; done = True; break
            if not done:
                x = (c[end] - entry) / risk
            x -= spread / risk
        rr[m] = x
        ri[m] = i; rk[m] = risk
        m += 1
    return ri[:m], res[:m], hit[:m], mfe[:m], rk[:m], rr[:m], tt[:m]


def summary(t, years, res, hit, mfe, rk, rr, tt, mask=None):
    if mask is not None:
        t, years, res, hit, mfe, rk, rr, tt = (x[mask] for x in (t, years, res, hit, mfe, rk, rr, tt))
    if not len(res):
        return {"n": 0}
    win, loss = res[res > 0].sum(), -res[res <= 0].sum()
    yr = {int(y): round(float(res[years == y].mean() / PIP), 1) for y in np.unique(years)}
    return {"n": int(len(res)), "mfe30": round(float(mfe.mean()) * 100, 1), "hit30": round(float(hit.mean()) * 100, 1),
            "pips": round(float(res.mean() / PIP), 2), "sumPips": round(float(res.sum() / PIP)),
            "pf": round(float(win / loss), 2) if loss else None, "stopPips": round(float(np.median(rk) / PIP), 1),
            "avgR": round(float(rr.mean()), 3), "barsTo30": int(np.median(tt[tt >= 0])) if (tt >= 0).any() else None,
            "posYears": sum(v > 0 for v in yr.values()), "years": yr}


def breakdown(t, res, hit, mfe, rk, height):
    """By pattern height and by the session of the breakout (Tokyo time)."""
    out = {}
    hp = height / PIP
    for lo, hi in ((0, 15), (15, 30), (30, 60), (60, 1e9)):
        s = (hp >= lo) & (hp < hi)
        if s.sum():
            out[f"height {lo}-{'' if hi > 1e8 else hi} pips"] = {"n": int(s.sum()), "mfe30": round(float(mfe[s].mean()) * 100, 1),
                                                                 "hit30": round(float(hit[s].mean()) * 100, 1),
                                                                 "pips": round(float(res[s].mean() / PIP), 2)}
    jst = ((t + 9 * 3600) // 3600) % 24
    for name, (a, b) in {"Tokyo 9-15": (9, 15), "London 16-21": (16, 21), "NY 21-2": (21, 26), "late 2-9": (2, 9)}.items():
        s = ((jst >= a) & (jst < b)) | ((jst + 24 >= a) & (jst + 24 < b))
        if s.sum():
            out[name] = {"n": int(s.sum()), "mfe30": round(float(mfe[s].mean()) * 100, 1),
                         "hit30": round(float(hit[s].mean()) * 100, 1), "pips": round(float(res[s].mean() / PIP), 2)}
    return out


CUP_GRID = dict(cup_min=[15, 40], cup_max=[80, 160], dep=[(1.5, 12.0), (1.5, 20.0), (3.0, 20.0)], rim_tol=[0.1, 0.25],
                round_frac=[0.2, 0.3], h_max=[15, 24], pull_max=[0.33, 0.5], use_sma=[0, 1])
BOX_GRID = dict(length=[12, 24, 48, 96], dep=[(1.0, 4.0), (2.0, 6.0), (3.0, 10.0)], touches=[2, 3], use_sma=[0, 1])
GRIDS = {"db": PAT_GRID, "ihs": PAT_GRID, "cup": CUP_GRID, "box": BOX_GRID}
NAMES = {("db", 1): "double bottom (buy)", ("db", -1): "double top (sell)",
         ("ihs", 1): "inverse head and shoulders (buy)", ("ihs", -1): "head and shoulders (sell)",
         ("cup", 1): "cup with handle (buy)", ("cup", -1): "inverted cup with handle (sell)",
         ("box", 1): "range breakout up (buy)", ("box", -1): "range breakout down (sell)"}


def detect(pat, p, hh, ll, cc, a, sm, piv):
    if pat in ("db", "ihs"):
        f = double_bottom if pat == "db" else inv_head_shoulders
        return f(hh, ll, cc, a, sm, piv[p["k"]], p["use_sma"], p["k"], p["sep"][0], p["sep"][1], p["tol"],
                 p["dep"][0], p["dep"][1], p["prior"], p["wait"])
    if pat == "cup":
        i, line, hl, dep = cup_detect(hh, ll, cc, a, sm, p["use_sma"], p["cup_min"], p["cup_max"], p["dep"][0], p["dep"][1],
                                      p["rim_tol"], 0.25, p["round_frac"], 3, p["h_max"], 0.1, p["pull_max"])
        return i, line, hl, dep
    return box_breakout(hh, ll, cc, a, sm, p["use_sma"], p["length"], p["dep"][0], p["dep"][1], p["touches"])


def run_tf(bars, tf, sma, pats, sides=(1, -1)):
    t, o, h, l, c = bars
    a = atr14(h, l, c)
    years = np.array([datetime.fromtimestamp(int(x), timezone.utc).year for x in t])
    flipped = (-l, -h, -c)
    smas = {1: np.nan_to_num(sma, nan=1e18), -1: -np.nan_to_num(sma, nan=-1e18)}
    for pat in pats:
        for side in sides:
            t0 = time.time()
            hh, ll, cc = (h, l, c) if side > 0 else flipped
            piv = {k: pivots_low(ll, k) for k in PAT_GRID["k"]} if pat in ("db", "ihs") else None
            res = []
            for vals in itertools.product(*GRIDS[pat].values()):
                p = dict(zip(GRIDS[pat], vals))
                if pat == "cup" and p["cup_min"] * 2 > p["cup_max"]:
                    continue
                idx, nk, slv, ht = detect(pat, p, hh, ll, cc, a, smas[side], piv)
                ri, pr, hit, mfe, rk, rr, tt = trades(hh, ll, cc, a, idx, nk, slv, ht, SPREAD, TARGET, SL_MIN, MAX_HOLD[tf])
                y = years[ri]
                arr = (t[ri], y, pr, hit, mfe, rk, rr, tt)
                hmap = dict(zip(idx.tolist(), ht.tolist()))
                res.append({"params": p, "all": summary(*arr), "train": summary(*arr, mask=y < TRAIN_END),
                            "test": summary(*arr, mask=y >= TRAIN_END),
                            "_bd": (t[ri], pr, hit, mfe, rk, np.array([hmap[i] for i in ri.tolist()]))})
            nmin, tmin = MIN_N[tf]
            ok = [x for x in res if x["train"]["n"] >= nmin and x["test"]["n"] >= tmin]
            robust = [x for x in ok if x["train"]["pips"] > 0 and x["test"]["pips"] > 0]
            best = max(robust, key=lambda x: min(x["train"]["pips"], x["test"]["pips"])) if robust else None
            most = max(ok, key=lambda x: x["all"]["mfe30"]) if ok else None  # highest share that ran 30 pips
            name = f"{tf} {NAMES[(pat, side)]}"
            loose = {"most breakouts": max((x["all"]["n"] for x in ok), default=0),
                     "mfe30 median of settings": float(np.median([x["all"]["mfe30"] for x in ok])) if ok else None,
                     "pips median of settings": float(np.median([x["all"]["pips"] for x in ok])) if ok else None}
            clean = lambda x: x and {k: v for k, v in x.items() if k != "_bd"}
            print("RESULT", json.dumps({"pattern": name, "settings": len(res), "eligible": len(ok), "robust": len(robust),
                                        "overall": loose, "best": clean(best),
                                        "bestBreakdown": best and breakdown(*best["_bd"]),
                                        "mostMfe30": clean(most)}, ensure_ascii=False), flush=True)
            # how many breakouts ran 30 pips: the setting with the most among those not losing in either period,
            # and the most of any setting (n x share, so a loose setting with many breakouts counts many)
            cnt = lambda x, k: round(x["all"]["n"] * x["all"][k] / 100)
            keep = max(robust, key=lambda x: cnt(x, "hit30")) if robust else None
            print("COUNT", json.dumps({"pattern": name, "robustMostHit30": keep and {"hit30Count": cnt(keep, "hit30"),
                                       "mfe30Count": cnt(keep, "mfe30"), **clean(keep)},
                                       "anyMostMfe30": ok and max(cnt(x, "mfe30") for x in ok),
                                       "anyMostHit30": ok and max(cnt(x, "hit30") for x in ok)}, ensure_ascii=False), flush=True)
            for x in sorted(ok, key=lambda x: x["train"]["pips"], reverse=True)[:3]:
                print("TOP", name, json.dumps(clean(x), ensure_ascii=False), flush=True)
            print(f"{name}: {time.time() - t0:.0f}s", flush=True)


def run(m15, tf_sel=None, pat_sel=None, side_sel=None):
    t, o, h, l, c = m15
    pats = [pat_sel] if pat_sel else ["db", "ihs", "cup", "box"]
    sides = (int(side_sel),) if side_sel else (1, -1)
    if tf_sel in (None, "m15"):
        run_tf(m15, "m15", h1_sma(t, c), pats, sides)
    if tf_sel in (None, "h1"):
        h1 = to_h1(*m15)
        run_tf(h1, "h1", h1_sma(h1[0], h1[4]), pats, sides)


if __name__ == "__main__":
    if sys.argv[1] == "--synthetic":
        rng = np.random.default_rng(5)
        n = 100000
        t = 1451606400 + np.arange(n, dtype=np.int64) * 900 * 3
        c = 110 + np.cumsum(rng.normal(0, 0.03, n))
        o = np.r_[c[0], c[:-1]]
        w = np.abs(rng.normal(0, 0.02, n))
        MIN_N.update(m15=(5, 2), h1=(5, 2))
        run((t, o, np.maximum(o, c) + w, np.minimum(o, c) - w, c), *sys.argv[2:5])
    else:
        parts = []
        for y in YEARS:
            try:
                parts.append(histdata_year(y, sys.argv[1], "usdjpy"))
                print(y, "minutes", len(parts[-1][0]), flush=True)
            except Exception as e:
                print(y, "download failed:", e, flush=True)
        if len(sys.argv) > 2 and sys.argv[2] == "download":
            sys.exit(0 if len(parts) == len(YEARS) else 1)
        t, o, h, l, c = (np.concatenate(x) for x in zip(*parts))
        order = np.argsort(t, kind="stable")
        m15 = to_m15(*(x[order] for x in (t, o, h, l, c)))
        print("M15 candles", len(m15[0]), flush=True)
        run(m15, *sys.argv[2:5])
