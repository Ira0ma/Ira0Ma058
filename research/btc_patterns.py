"""Backtest of double bottom / top and (inverse) head and shoulders on BTC/USD, M15 and H1, 2018-2026.

Binance's public BTCUSDT 15-minute klines (data.binance.vision, monthly files), with 1-hour candles built
from them. The same detectors and trade rules as the GOLD backtest (pattern_backtest.py): entry at the
first close beyond the neckline, stop just beyond the pattern's last low (high for sells), target one
pattern height past the neckline, at most 3 days, one position at a time; sells are the buy patterns on
prices turned upside down. BTC went from about $6,000 to over $100,000 in these years, so everything runs
on log prices: the spread (0.03%), the smallest stop (0.05%) and the smallest target room (0.35%, about the
page's $300 at $85,000) are fractions of the price, and results are in R (stop distance = 1).
Settings are chosen on 2018-2023 and checked on 2024-2026.
Each trade also records how far price went against it before the exit (MAE) and how far it ran in its favour
within the 3 days (MFE), both in R, and every setting is run with the target at one and at two pattern heights,
to single out the patterns that barely go against the entry and then run far.

Usage: python3 btc_patterns.py CACHE_DIR download
       python3 btc_patterns.py CACHE_DIR [PATTERN SIDE TF]   (db|ihs, 1|-1, m15|h1; default all)
       python3 btc_patterns.py --synthetic
"""
import csv
import io
import itertools
import json
import os
import sys
import time
import urllib.request
import zipfile
from datetime import datetime, timezone

import numpy as np
from numba import njit

from cup_backtest import atr14, h1_sma, stats
from pattern_backtest import GRID, MAX_HOLD, double_bottom, inv_head_shoulders, pivots_low, to_h1

MONTHS = [(y, m) for y in range(2018, 2027) for m in range(1, 13) if (y, m) <= (2026, 9)]
TRAIN_END = 2024  # 2018-2023 train, 2024-2026 test
SPREAD = 0.0003
MIN_TP = 0.0035
SL_MIN = 0.0005
MIN_N = {"m15": (120, 30), "h1": (50, 15)}
DETECT = {"db": double_bottom, "ihs": inv_head_shoulders}
NAMES = {("db", 1): "double bottom (buy)", ("db", -1): "double top (sell)",
         ("ihs", 1): "inverse head and shoulders (buy)", ("ihs", -1): "head and shoulders (sell)"}
TP_MULT = (1.0, 2.0)  # target = this many pattern heights past the neckline


@njit(cache=True)
def simulate(h, l, c, a, idx, neck, slv, height, spread, min_tp, sl_min, max_hold, tp_mult):
    """pattern_backtest.simulate with the target at tp_mult heights, plus MAE (to the exit) and MFE (over the
    whole hold) of each trade in R."""
    k_n = len(idx)
    ri = np.zeros(k_n, np.int64); rr = np.zeros(k_n); mae = np.zeros(k_n); mfe = np.zeros(k_n)
    m = 0
    busy = -1
    for k in range(k_n):
        i = idx[k]
        if i <= busy or i + 1 >= len(c):
            continue
        entry = c[i]
        tp = neck[k] + height[k] * tp_mult
        if tp - entry < min_tp:
            continue
        risk = max(entry - (slv[k] - a[i] * 0.2), sl_min)
        sl = entry - risk
        r = 0.0
        j = i + 1
        end = min(len(c) - 1, i + max_hold)
        done = False
        lo = entry
        while j <= end:
            lo = min(lo, l[j])
            if l[j] <= sl:
                r = -1.0; done = True; break
            if h[j] >= tp:
                r = (tp - entry) / risk; done = True; break
            j += 1
        if not done:
            j = end
            r = (c[j] - entry) / risk
        hi = entry
        for q in range(i + 1, end + 1):
            hi = max(hi, h[q])
        ri[m] = i; rr[m] = r - spread / risk; mae[m] = min((entry - lo) / risk, 1.0); mfe[m] = (hi - entry) / risk
        m += 1
        busy = j
    return ri[:m], rr[:m], mae[:m], mfe[:m]


def excursions(mae, mfe, mask=None):
    if mask is not None:
        mae, mfe = mae[mask], mfe[mask]
    if not len(mae):
        return {}
    return {"maeMed": round(float(np.median(mae)), 2), "shallow": round(float((mae < 0.3).mean()) * 100, 1),
            "mfeMed": round(float(np.median(mfe)), 2), "run2R": round(float((mfe >= 2).mean()) * 100, 1),
            "run3R": round(float((mfe >= 3).mean()) * 100, 1)}


URL = "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/15m/BTCUSDT-15m-{y}-{m:02d}.zip"


def month(y, m, cache):
    path = os.path.join(cache, f"BTCUSDT-15m-{y}-{m:02d}.zip")
    if not os.path.exists(path):
        req = urllib.request.Request(URL.format(y=y, m=m), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    with zipfile.ZipFile(path) as z:
        rows = list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))))
    rows = [r for r in rows if r and r[0].isdigit()]  # some files carry a header line
    t = np.array([int(r[0]) for r in rows], np.int64)
    t = np.where(t > 10 ** 14, t // 1000, t) // 1000  # milliseconds, microseconds from 2025
    o, h, l, c = (np.array([float(r[k]) for r in rows]) for k in (1, 2, 3, 4))
    return t, o, h, l, c


def run_tf(bars, tf, sma, jobs):
    t, o, h, l, c = bars
    a = atr14(h, l, c)
    years = np.array([datetime.fromtimestamp(int(x), timezone.utc).year for x in t])
    flipped = (-l, -h, -c)
    smas = {1: np.nan_to_num(sma, nan=1e18), -1: -np.nan_to_num(sma, nan=-1e18)}
    for pat, side in jobs:
        t0 = time.time()
        hh, ll, cc = (h, l, c) if side > 0 else flipped
        piv = {k: pivots_low(ll, k) for k in GRID["k"]}
        res = []
        for vals in itertools.product(*GRID.values()):
            p = dict(zip(GRID, vals))
            idx, nk, slv, ht = DETECT[pat](hh, ll, cc, a, smas[side], piv[p["k"]], p["use_sma"], p["k"],
                                          p["sep"][0], p["sep"][1], p["tol"], p["dep"][0], p["dep"][1],
                                          p["prior"], p["wait"])
            for tm in TP_MULT:
                ti, tr, mae, mfe = simulate(hh, ll, cc, a, idx, nk, slv, ht, SPREAD, MIN_TP, SL_MIN, MAX_HOLD[tf], tm)
                y = years[ti]
                res.append({"params": {**p, "tpMult": tm}, "all": {**stats(tr, y), **excursions(mae, mfe)},
                            "train": {**stats(tr, y, y < TRAIN_END), **excursions(mae, mfe, y < TRAIN_END)},
                            "test": {**stats(tr, y, y >= TRAIN_END), **excursions(mae, mfe, y >= TRAIN_END)}})
        nmin, tmin = MIN_N[tf]
        ok = [x for x in res if x["train"]["n"] >= nmin and x["test"]["n"] >= tmin]
        robust = [x for x in ok if x["train"]["avgR"] > 0 and x["test"]["avgR"] > 0]
        best = max(robust, key=lambda x: min(x["train"]["avgR"], x["test"]["avgR"])) if robust else None
        name = f"{tf} {NAMES[(pat, side)]}"
        print("RESULT", json.dumps({"pattern": name, "settings": len(res), "eligible": len(ok), "robust": len(robust),
                                    "avgR median of settings": float(np.median([x["all"]["avgR"] for x in ok])) if ok else None,
                                    "best": best}, ensure_ascii=False), flush=True)
        for x in sorted(ok, key=lambda x: x["train"]["avgR"], reverse=True)[:3]:
            print("TOP", name, json.dumps(x, ensure_ascii=False), flush=True)
        # little adverse move and a long run: among settings positive in both periods, the shallowest median
        # MAE that still runs 2R or more half the time, scored by (median MFE / median MAE) on the weaker period
        clean = [x for x in robust if x["train"].get("maeMed") is not None and x["test"].get("maeMed") is not None]
        score = lambda x: min(x[q]["mfeMed"] / max(x[q]["maeMed"], 0.05) for q in ("train", "test"))
        for x in sorted(clean, key=score, reverse=True)[:5]:
            print("RUNNER", name, round(score(x), 2), json.dumps(x, ensure_ascii=False), flush=True)
        print(f"{name}: {time.time() - t0:.0f}s", flush=True)


def run(m15, pat=None, side=None, tf=None):
    jobs = [(p, s) for p in ([pat] if pat else ["db", "ihs"]) for s in ([int(side)] if side else [1, -1])]
    t, o, h, l, c = m15
    if tf in (None, "m15"):
        run_tf(m15, "m15", h1_sma(t, c), jobs)
    if tf in (None, "h1"):
        h1 = to_h1(*m15)
        run_tf(h1, "h1", h1_sma(h1[0], h1[4]), jobs)


if __name__ == "__main__":
    if sys.argv[1] == "--synthetic":
        rng = np.random.default_rng(7)
        n = 120000
        t = 1514764800 + np.arange(n, dtype=np.int64) * 900 * 2
        c = np.log(9000) + np.cumsum(rng.normal(0, 0.003, n))
        o = np.r_[c[0], c[:-1]]
        w = np.abs(rng.normal(0, 0.002, n))
        MIN_N.update(m15=(5, 2), h1=(5, 2))
        run((t, o, np.maximum(o, c) + w, np.minimum(o, c) - w, c), *sys.argv[2:5])
        sys.exit(0)
    cache = sys.argv[1]
    os.makedirs(cache, exist_ok=True)
    parts = []
    for y, m in MONTHS:
        try:
            parts.append(month(y, m, cache))
        except Exception as e:
            print(y, m, "download failed:", e, flush=True)
    print("months", len(parts), "of", len(MONTHS), flush=True)
    if sys.argv[2:3] == ["download"]:
        sys.exit(0 if len(parts) >= len(MONTHS) - 1 else 1)
    t, o, h, l, c = (np.concatenate(x) for x in zip(*parts))
    order = np.argsort(t, kind="stable")
    t, o, h, l, c = (x[order] for x in (t, o, h, l, c))
    keep = np.r_[True, t[1:] != t[:-1]]
    t, o, h, l, c = (x[keep] for x in (t, o, h, l, c))
    print("M15 candles", len(t), datetime.fromtimestamp(int(t[0]), timezone.utc).date(), "..",
          datetime.fromtimestamp(int(t[-1]), timezone.utc).date(), flush=True)
    run((t, np.log(o), np.log(h), np.log(l), np.log(c)), *sys.argv[2:5])
