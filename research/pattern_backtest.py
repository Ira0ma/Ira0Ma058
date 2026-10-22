"""Backtest of double bottom / top and (inverse) head and shoulders on XAU/USD, 10 years.

Uses the same HistData 1-minute bars as cup_backtest.py (2016-2025), builds 15-minute and 1-hour candles
and, for each pattern and timeframe, trades every first close beyond the neckline over a grid of thresholds:
entry at that close, stop just beyond the pattern's last low (high for sells), target one pattern height
past the neckline, $0.30 spread, at most 3 days. Settings are chosen on 2016-2022 and checked on 2023-2025.
Sell patterns are the buy patterns on prices turned upside down.

Usage: python3 pattern_backtest.py CACHE_DIR      (HistData files, as cup_backtest.py)
       python3 pattern_backtest.py --synthetic
"""
import itertools
import json
import sys
import time
from datetime import datetime, timezone

import numpy as np
from numba import njit

from cup_backtest import YEARS, TRAIN_END, SPREAD, MIN_TP, SL_MIN, atr14, histdata_year, h1_sma, stats, to_m15

MAX_HOLD = {"m15": 288, "h1": 72}  # 3 days


def to_h1(t, o, h, l, c):
    k = t - t % 3600
    starts = np.flatnonzero(np.r_[True, k[1:] != k[:-1]])
    ends = np.r_[starts[1:], len(k)]
    return (k[starts], o[starts], np.maximum.reduceat(h, starts), np.minimum.reduceat(l, starts), c[ends - 1])


@njit(cache=True)
def pivots_low(l, k):
    """Indices j where l[j] is the lowest of j-k..j+k (known at candle j+k)."""
    n = len(l)
    out = np.zeros(n, np.int64)
    m = 0
    for j in range(k, n - k):
        ok = True
        for q in range(j - k, j + k + 1):
            if l[q] < l[j] or (l[q] == l[j] and q < j):
                ok = False
                break
        if ok:
            out[m] = j
            m += 1
    return out[:m]


@njit(cache=True)
def double_bottom(h, l, c, a, sma, piv, use_sma, k, sep_min, sep_max, tol, dep_min, dep_max, prior, wait):
    """First closes above the neckline of a double bottom. Returns (i, neckline, stop level, height)."""
    n = len(c)
    oi = np.zeros(n, np.int64); on = np.zeros(n); osl = np.zeros(n); oh = np.zeros(n)
    m = 0
    p0 = 0
    for i in range(sep_max + wait + 60, n):
        if a[i] <= 0 or c[i] <= c[i - 1] or (use_sma and c[i] < sma[i]):
            continue
        # pivots known by candle i: index <= i-k
        while p0 < len(piv) and piv[p0] <= i - k - wait - 1:
            p0 += 1
        hit = False
        for pb in range(p0, len(piv)):
            b = piv[pb]
            if b > i - k:
                break
            for pa in range(pb - 1, -1, -1):
                aa = piv[pa]
                if b - aa > sep_max:
                    break
                if b - aa < sep_min:
                    continue
                neck = -1e18
                for q in range(aa + 1, b):
                    neck = max(neck, h[q])
                low = min(l[aa], l[b])
                height = neck - low
                if height < a[i] * dep_min or height > a[i] * dep_max:
                    continue
                if abs(l[aa] - l[b]) > tol * height:
                    continue
                mn = 1e18
                for q in range(aa, b + 1):
                    mn = min(mn, l[q])
                if mn < low - 1e-9:
                    continue  # the two bottoms are the lows of the pattern
                if prior:
                    hh = -1e18
                    for q in range(max(0, aa - sep_max), aa):
                        hh = max(hh, h[q])
                    if hh < neck:
                        continue  # came down into the first bottom
                if c[i] <= neck or c[i - 1] > neck or c[i] > neck + height * 0.5:
                    continue
                broke = False
                for q in range(b + 1, i):
                    if c[q] > neck:
                        broke = True
                        break
                if broke:
                    continue
                oi[m] = i; on[m] = neck; osl[m] = min(l[aa], l[b]); oh[m] = height
                m += 1
                hit = True
                break
            if hit:
                break
    return oi[:m], on[:m], osl[:m], oh[:m]


@njit(cache=True)
def inv_head_shoulders(h, l, c, a, sma, piv, use_sma, k, sep_min, sep_max, tol, dep_min, dep_max, prior, wait):
    """First closes above the (possibly sloped) neckline of an inverse head and shoulders."""
    n = len(c)
    oi = np.zeros(n, np.int64); on = np.zeros(n); osl = np.zeros(n); oh = np.zeros(n)
    m = 0
    p0 = 0
    for i in range(2 * sep_max + wait + 60, n):
        if a[i] <= 0 or c[i] <= c[i - 1] or (use_sma and c[i] < sma[i]):
            continue
        while p0 < len(piv) and piv[p0] <= i - k - wait - 1:
            p0 += 1
        hit = False
        for pc in range(p0, len(piv)):
            rs = piv[pc]
            if rs > i - k:
                break
            for pb in range(pc - 1, -1, -1):
                hd = piv[pb]
                if rs - hd > sep_max:
                    break
                if rs - hd < sep_min:
                    continue
                for pa in range(pb - 1, -1, -1):
                    ls = piv[pa]
                    if hd - ls > sep_max:
                        break
                    if hd - ls < sep_min:
                        continue
                    r = (rs - hd) / (hd - ls)
                    if r < 0.5 or r > 2.0:
                        continue
                    # neckline through the highest highs between the shoulders and the head
                    v1 = -1e18; i1 = ls
                    for q in range(ls + 1, hd):
                        if h[q] > v1:
                            v1 = h[q]; i1 = q
                    v2 = -1e18; i2 = hd
                    for q in range(hd + 1, rs):
                        if h[q] > v2:
                            v2 = h[q]; i2 = q
                    s = (v2 - v1) / (i2 - i1)
                    neck_hd = v1 + s * (hd - i1)
                    height = neck_hd - l[hd]
                    if height < a[i] * dep_min or height > a[i] * dep_max:
                        continue
                    if abs(s) * (rs - ls) > height * 0.5:
                        continue  # neckline too steep
                    if l[hd] > min(l[ls], l[rs]) - height * 0.15:
                        continue  # the head clearly below both shoulders
                    if abs(l[ls] - l[rs]) > tol * height:
                        continue
                    mn = 1e18
                    for q in range(ls, rs + 1):
                        mn = min(mn, l[q])
                    if mn < l[hd] - 1e-9:
                        continue
                    if prior:
                        hh = -1e18
                        for q in range(max(0, ls - sep_max), ls):
                            hh = max(hh, h[q])
                        if hh < v1:
                            continue
                    nk = v2 + s * (i - i2)
                    nk1 = v2 + s * (i - 1 - i2)
                    if c[i] <= nk or c[i - 1] > nk1 or c[i] > nk + height * 0.5:
                        continue
                    broke = False
                    for q in range(rs + 1, i):
                        if c[q] > v2 + s * (q - i2):
                            broke = True
                            break
                    if broke:
                        continue
                    oi[m] = i; on[m] = nk; osl[m] = l[rs]; oh[m] = height
                    m += 1
                    hit = True
                    break
                if hit:
                    break
            if hit:
                break
    return oi[:m], on[:m], osl[:m], oh[:m]


@njit(cache=True)
def simulate(h, l, c, a, idx, neck, slv, height, spread, min_tp, sl_min, max_hold):
    ri = np.zeros(len(idx), np.int64); rr = np.zeros(len(idx))
    m = 0
    busy = -1
    for k in range(len(idx)):
        i = idx[k]
        if i <= busy:
            continue
        entry = c[i]
        tp = neck[k] + height[k]
        if tp - entry < min_tp:
            continue
        risk = max(entry - (slv[k] - a[i] * 0.2), sl_min)
        sl = entry - risk
        r = 0.0
        j = i + 1
        end = min(len(c) - 1, i + max_hold)
        done = False
        while j <= end:
            if l[j] <= sl:
                r = -1.0; done = True; break
            if h[j] >= tp:
                r = (tp - entry) / risk; done = True; break
            j += 1
        if not done:
            j = end
            r = (c[j] - entry) / risk
        r -= spread / risk
        ri[m] = i; rr[m] = r; m += 1
        busy = j
    return ri[:m], rr[:m]


DETECT = {"db": double_bottom, "ihs": inv_head_shoulders}
NAMES = {("db", 1): "double bottom (buy)", ("ihs", 1): "inverse head and shoulders (buy)",
         ("db", -1): "double top (sell)", ("ihs", -1): "head and shoulders (sell)"}
JOBS = [("db", 1, "m15"), ("db", 1, "h1"), ("ihs", 1, "m15"), ("ihs", 1, "h1"), ("db", -1, "m15"), ("ihs", -1, "m15")]
GRID = dict(k=[2, 3, 5], sep=[(5, 40), (10, 80), (20, 120)], tol=[0.05, 0.1, 0.2],
            dep=[(1.5, 10.0), (3.0, 20.0), (1.5, 30.0)], use_sma=[0, 1], prior=[0, 1], wait=[10, 25])
MIN_N = {"m15": (120, 30), "h1": (50, 15)}


def run_tf(bars, tf, sma, jobs):
    t, o, h, l, c = bars
    a = atr14(h, l, c)
    years = np.array([datetime.fromtimestamp(int(x), timezone.utc).year for x in t])
    flipped = (-l, -h, -c)
    smas = {1: np.nan_to_num(sma, nan=1e18), -1: -np.nan_to_num(sma, nan=-1e18)}
    piv = {}
    out = {}
    for pat, side in jobs:
        hh, ll, cc = (h, l, c) if side > 0 else flipped
        res = []
        for vals in itertools.product(*GRID.values()):
            p = dict(zip(GRID, vals))
            if (side, p["k"]) not in piv:
                piv[(side, p["k"])] = pivots_low(ll, p["k"])
            idx, nk, slv, ht = DETECT[pat](hh, ll, cc, a, smas[side], piv[(side, p["k"])], p["use_sma"], p["k"],
                                          p["sep"][0], p["sep"][1], p["tol"], p["dep"][0], p["dep"][1],
                                          p["prior"], p["wait"])
            ti, tr = simulate(hh, ll, cc, a, idx, nk, slv, ht, SPREAD, MIN_TP, SL_MIN, MAX_HOLD[tf])
            y = years[ti]
            res.append({"params": p, "all": stats(tr, y), "train": stats(tr, y, y < TRAIN_END),
                        "test": stats(tr, y, y >= TRAIN_END)})
        nmin, tmin = MIN_N[tf]
        ok = [x for x in res if x["train"]["n"] >= nmin and x["test"]["n"] >= tmin]
        robust = [x for x in ok if x["train"]["avgR"] > 0 and x["test"]["avgR"] > 0]
        best = max(robust, key=lambda x: min(x["train"]["avgR"], x["test"]["avgR"])) if robust else None
        top = sorted(ok, key=lambda x: x["train"]["avgR"], reverse=True)[:3]
        name = f"{tf} {NAMES[(pat, side)]}"
        print("RESULT", json.dumps({"pattern": name, "settings": len(res), "eligible": len(ok),
                                    "robust": len(robust), "best": best}, ensure_ascii=False), flush=True)
        for x in top:
            print("TOP", name, json.dumps(x, ensure_ascii=False), flush=True)
        out[name] = best
    return out


def run(m15):
    t, o, h, l, c = m15
    h1 = to_h1(*m15)
    sma15 = h1_sma(t, c)
    sma60 = h1_sma(h1[0], h1[4])
    t0 = time.time()
    best = {}
    best.update(run_tf(m15, "m15", sma15, [(p, s) for p, s, tf in JOBS if tf == "m15"]))
    best.update(run_tf(h1, "h1", sma60, [(p, s) for p, s, tf in JOBS if tf == "h1"]))
    print(f"done in {time.time() - t0:.0f}s")
    print("SUMMARY", json.dumps({k: (v and {"params": v["params"], "all": {q: v["all"][q] for q in ("n", "win", "avgR", "pf", "posYears")},
                                          "train": v["train"]["avgR"], "test": v["test"]["avgR"]}) for k, v in best.items()},
                                ensure_ascii=False))


if __name__ == "__main__":
    if sys.argv[1:] == ["--synthetic"]:
        rng = np.random.default_rng(3)
        n = 120000
        t = 1451606400 + np.arange(n, dtype=np.int64) * (315360000 // n)
        c = 1100 + np.cumsum(rng.normal(0, 0.8, n))
        o = np.r_[c[0], c[:-1]]
        w = np.abs(rng.normal(0, 0.6, n))
        run((t, o, np.maximum(o, c) + w, np.minimum(o, c) - w, c))
    else:
        parts = []
        for y in YEARS:
            try:
                parts.append(histdata_year(y, sys.argv[1]))
            except Exception as e:
                print(y, "download failed:", e, flush=True)
        t, o, h, l, c = (np.concatenate(x) for x in zip(*parts))
        order = np.argsort(t, kind="stable")
        run(to_m15(*(x[order] for x in (t, o, h, l, c))))
