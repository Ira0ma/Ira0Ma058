"""Builds market.json for the widget: real candles for each selectable instrument plus an automatic
technical read (trend from moving averages, levels from daily pivots, RSI, ATR).

Usage: python3 analyze.py OUT.json [--prev=OLD.json]   (fetches from Yahoo Finance / gold-api.com / Swissquote;
                                                         OLD.json fills in instruments that fail)
       python3 analyze.py OUT.json FIXTURE    (FIXTURE: JSON {symbol: yahoo-chart-json} for tests)
"""
import bisect
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UA = {"User-Agent": "Mozilla/5.0 (TradeDeskWidget)"}
# key: (Yahoo symbol, Japanese name, level step, decimals, gold-api spot symbol for futures)
INSTRUMENTS = {
    "usdjpy": ("JPY=X", "ドル円", 0.05, 2, None),
    "eurjpy": ("EURJPY=X", "ユーロ円", 0.05, 2, None),
    "gbpjpy": ("GBPJPY=X", "ポンド円", 0.05, 2, None),
    "audjpy": ("AUDJPY=X", "豪ドル円", 0.05, 2, None),
    "eurusd": ("EURUSD=X", "ユーロドル", 0.0005, 4, None),
    "gbpusd": ("GBPUSD=X", "ポンドドル", 0.0005, 4, None),
    "audusd": ("AUDUSD=X", "豪ドル米ドル", 0.0005, 4, None),
    "nzdusd": ("NZDUSD=X", "NZドル米ドル", 0.0005, 4, None),
    "usdchf": ("CHF=X", "ドルスイス", 0.0005, 4, None),
    "usdcad": ("CAD=X", "ドルカナダ", 0.0005, 4, None),
    "gold": ("GC=F", "ゴールド", 5.0, 0, "XAU"),
    "silver": ("SI=F", "シルバー", 0.05, 2, "XAG"),
    "usoil": ("CL=F", "USオイル", 0.05, 2, None),
    "btc": ("BTC-USD", "BTC/USD", 100.0, 0, None),
    "dxy": ("DX-Y.NYB", "ドル指数", 0.05, 2, None),
    "jxy": (None, "円指数", 0.05, 2, None),  # computed below from six yen crosses
    "vix": ("^VIX", "VIX", 0.1, 1, None),
}
KIND = {"dxy": "index", "jxy": "index", "vix": "vix"}  # wording of the automatic read
# JXY: a yen strength index, the geometric mean of the yen against six currencies,
# scaled to 100 at early-2020 rates. It is our own calculation, not TradingView's TVC:JXY.
JXY_BASKET = {"JPY=X": 108.6, "EURJPY=X": 121.6, "GBPJPY=X": 143.8, "AUDJPY=X": 76.2, "CADJPY=X": 83.6, "CHFJPY=X": 112.0}
TF_FETCH = [("1m", "1m", "5d"), ("5m", "5m", "5d"), ("15m", "15m", "5d"), ("1h", "60m", "1y"), ("1d", "1d", "1y"), ("1w", "1wk", "5y")]
# Markets that trade nearly 24 hours roll their day at 17:00 New York (the FX convention MT4/TradingView use).
# Their daily candles, previous close and pivots are rebuilt from hourly data on that boundary.
# Bitcoin keeps the UTC day; VIX keeps its exchange close.
NY = ZoneInfo("America/New_York")
UTC_DAY = {"btc", "vix"}


def ny_day(t):
    return (datetime.fromtimestamp(t, NY) + timedelta(hours=7)).date()  # 17:00 NY -> next calendar day


def ny_daily(h1):
    out, key = [], None
    for t, o, h, l, c in h1:
        k = ny_day(t)
        if k == key:
            r = out[-1]
            r[2], r[3], r[4] = max(r[2], h), min(r[3], l), c
        else:
            out.append([t, o, h, l, c]); key = k
    return out
N_CANDLES = 150  # per timeframe; the widget shows ~38 and lets you scroll back through the rest
N_H1 = 300  # hourly keeps more history: a 120-hour average and 200 EMA across the whole visible chart, and H1 levels over ~12 days
N_M15 = 300  # likewise for the 200 EMA on the GOLD page's 15-minute chart


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def spot_price(spot_sym):
    """Spot price of a metal (XAU/XAG in USD) and when it was quoted (unix seconds):
    gold-api.com, then Swissquote's public quote feed."""
    errs = []
    try:
        d = get_json(f"https://api.gold-api.com/price/{spot_sym}")
        try:
            ts = datetime.fromisoformat(d["updatedAt"].replace("Z", "+00:00")).timestamp()
        except Exception:
            ts = time.time()
        return float(d["price"]), "gold-api", int(ts)
    except Exception as e:
        errs.append(f"gold-api: {e}")
    try:
        feed = get_json(f"https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/{spot_sym}/USD")
        mids = [(p["bid"] + p["ask"]) / 2 for q in feed for p in q.get("spreadProfilePrices", [])[:1]]
        if mids:
            mids.sort()
            ts = max((q.get("ts") or 0) for q in feed) / 1000 or time.time()
            return mids[len(mids) // 2], "swissquote", int(ts)  # median across Swissquote's platforms
    except Exception as e:
        errs.append(f"swissquote: {e}")
    raise RuntimeError("; ".join(errs))


def yahoo(symbol, interval, rng, fixture=None):
    key = f"{symbol}|{interval}|{rng}"
    if fixture is not None:
        data = fixture[key]
    else:
        data = get_json(f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&range={rng}")
    res = data["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    rows = []
    for i, t in enumerate(res.get("timestamp") or []):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, l, c):
            continue
        rows.append([t, o, h, l, c])
    return rows


def aggregate(rows, seconds):
    out = []
    for t, o, h, l, c in rows:
        b = t - t % seconds
        if out and out[-1][0] == b:
            k = out[-1]
            k[2], k[3], k[4] = max(k[2], h), min(k[3], l), c
        else:
            out.append([b, o, h, l, c])
    return out


def sma(values, n):
    return sum(values[-n:]) / n if len(values) >= n else None


def rsi(closes, n=14):
    if len(closes) <= n:
        return None
    gains = losses = 0.0
    for a, b in zip(closes[-n - 1:-1], closes[-n:]):
        d = b - a
        gains += max(d, 0)
        losses += max(-d, 0)
    if losses == 0:
        return 100.0
    rs = gains / losses
    return 100 - 100 / (1 + rs)


def atr(rows, n=14):
    if len(rows) <= n:
        return None
    trs = []
    for prev, cur in zip(rows[-n - 1:-1], rows[-n:]):
        trs.append(max(cur[2] - cur[3], abs(cur[2] - prev[4]), abs(cur[3] - prev[4])))
    return sum(trs) / n


def fmt(key, v):
    _, _, step, dec, _ = INSTRUMENTS[key]
    v = round(v / step) * step
    return f"{v:,.{dec}f}"


def analyze(key, done, price):
    """done: completed daily candles only (today's unfinished candle excluded)."""
    closes = [r[4] for r in done]
    s20, s50 = sma(closes, 20), sma(closes, 50)
    a = atr(done) or (done[-1][2] - done[-1][3])
    # classic pivots from the last completed day
    _, _, h, l, c = done[-1]
    p = (h + l + c) / 3
    s1, r1, s2, r2 = 2 * p - h, 2 * p - l, p - (h - l), p + (h - l)
    levels = sorted({s2, s1, p, r1, r2})
    gap = 0.15 * a  # ignore levels practically at the current price
    below = [x for x in levels if x <= price - gap]
    above = [x for x in levels if x >= price + gap]
    sup = below[-1] if below else price - a / 2
    sup2 = below[-2] if len(below) > 1 else sup - a / 2
    res = above[0] if above else price + a / 2
    res2 = above[1] if len(above) > 1 else res + a / 2

    if s20 and s50 and s20 > s50 and price > s20:
        trend = "up"
    elif s20 and s50 and s20 < s50 and price < s20:
        trend = "down"
    else:
        trend = "range"

    name = INSTRUMENTS[key][1]
    f = lambda v: fmt(key, v)
    kind = KIND.get(key)
    if kind == "vix":
        mood = "恐怖水準" if price >= 30 else "警戒水準" if price >= 20 else "平常水準"
        title = {"up": "VIX：上昇（リスクオフ警戒）", "down": "VIX：低下（リスクオン）", "range": "VIX：横ばい"}[trend]
        body = f"現在{f(price)}で{mood}。\n{f(res)}を上抜けると警戒感が強まる。"
    elif kind == "index":
        title = {"up": f"{name}：上昇トレンド", "down": f"{name}：下落トレンド", "range": f"{name}：レンジ内の推移"}[trend]
        if trend == "up":
            body = f"{f(sup)}付近が下値の目安。\n{f(res)}を上抜ければ{f(res2)}が視野。"
        elif trend == "down":
            body = f"{f(res)}付近が上値の目安。\n{f(sup)}を割り込めば{f(sup2)}が視野。"
        else:
            lo, hi = (s1, r1) if s1 < price < r1 else (sup, res)
            body = f"{f(lo)}〜{f(hi)}のレンジを想定。\n抜けた方向に注目。"
    elif trend == "up":
        title = f"{name}：押し目買い目線"
        body = f"{f(sup)}付近の押し目に注目。\n{f(res)}を上抜ければ{f(res2)}が視野。"
    elif trend == "down":
        title = f"{name}：戻り売り目線"
        body = f"{f(res)}付近の戻りに注目。\n{f(sup)}を割り込めば{f(sup2)}が視野。"
    elif kind is None:
        lo, hi = (s1, r1) if s1 < price < r1 else (sup, res)
        title = f"{name}：レンジ内の攻防"
        body = f"{f(lo)}〜{f(hi)}のレンジを想定。\n抜けた方向へついていく。"
    return {
        "title": title, "body": body, "trend": trend,
        "rsi": rsi(closes), "atr": a,
        "support": sup, "resistance": res,
    }


def r6(rows):
    return [[t] + [float(f"{v:.6g}") for v in r] for t, *r in rows]


def build(fixture=None, prev=None):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = {"updated": now, "instruments": {}}
    old = (prev or {}).get("instruments", {})
    fresh = 0
    for key, (sym, name, _, _, spot_sym) in INSTRUMENTS.items():
        for attempt in range(2):
            try:
                out["instruments"][key] = dict(one(key, sym, spot_sym, fixture, old.get(key)), updated=now)
                fresh += 1
                break
            except Exception as e:  # one failing symbol must not drop the others
                print(key, "failed:", e)
                if fixture is None:
                    time.sleep(2)
        else:
            if key in old:  # keep the last good data; the page shows its own timestamp
                out["instruments"][key] = old[key]
                print(key, "kept previous data from", old[key].get("updated"))
        if fixture is None:
            time.sleep(0.4)  # stay gentle with the data source
    if fresh == 0 and prev:
        return prev  # nothing new at all: republish the previous file unchanged
    return out


_cache = {}


def fetch_series(sym, fixture):
    """Raw candles per timeframe for one Yahoo symbol (cached within a run)."""
    if sym not in _cache:
        _cache[sym] = {tf: yahoo(sym, iv, rng, fixture) for tf, iv, rng in TF_FETCH}
    return {tf: [r[:] for r in rows] for tf, rows in _cache[sym].items()}


def jxy_series(fixture):
    comps = {s: fetch_series(s, fixture) for s in JXY_BASKET}
    out = {}
    for tf, _, _ in TF_FETCH:
        maps = [{r[0]: r for r in comps[s][tf]} for s in JXY_BASKET]
        common = sorted(set.intersection(*(set(m) for m in maps)))
        rows = []
        for t in common:
            o = h = l = c = 1.0
            for m, ref in zip(maps, JXY_BASKET.values()):
                _, po, ph, pl, pc = m[t]
                o *= ref / po; c *= ref / pc
                h *= ref / pl; l *= ref / ph  # yen strength moves opposite to the cross
            k = 1 / len(JXY_BASKET)
            rows.append([t, 100 * o ** k, 100 * h ** k, 100 * l ** k, 100 * c ** k])
        if tf in ("1h", "1d") and len(rows) < 30:
            raise ValueError(f"JXY: only {len(rows)} aligned {tf} candles")
        out[tf] = rows
    return out


CHECK = {"gold": "XAU/USD", "usdjpy": "USD/JPY"}  # dashboard instruments: log a sanity check each run


def check(key, price, h1, m15):
    """Log today's range, outsized candles and the gap to Swissquote's quote, for checking the dashboards."""
    day = [r for r in h1 if ny_day(r[0]) == ny_day(h1[-1][0])]
    hi, lo = max(r[2] for r in day), min(r[3] for r in day)
    rng = sorted(r[2] - r[3] for r in h1[-200:])
    med = rng[len(rng) // 2] or 1e-9
    odd = [(datetime.fromtimestamp(r[0], timezone.utc).strftime("%m-%d %H:%M"), round(r[2] - r[3], 5))
           for r in h1[-48:] + m15[-96:] if r[2] - r[3] > 8 * med]
    msg = f"{key} check: today high {hi:.3f} low {lo:.3f} ({len(day)} H1 bars), last {price:.3f}"
    try:
        feed = get_json(f"https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/{CHECK[key]}")
        mids = sorted((p["bid"] + p["ask"]) / 2 for q in feed for p in q.get("spreadProfilePrices", [])[:1])
        msg += f", swissquote {mids[len(mids) // 2]:.3f}"
    except Exception as e:
        msg += f", swissquote unavailable ({e})"
    print(msg + (f"; outsized candles (>8x median range): {odd}" if odd else "; no outsized candles"))


BASIS_MAX_AGE = 3 * 86400  # how long the last futures-to-spot gap may stand in when no spot source answers
# The futures-to-spot gap drifts during the day, and Yahoo's futures run about 10 minutes behind, so one gap
# taken "now" is off by a few dollars for earlier candles. Every run therefore keeps the spot quote with its
# time (spothist.json, next to market.json so the pages need not download it); each sample is set against the futures minute candle of that same minute,
# and every candle is moved by the gaps measured around its own time.
SPOT_HIST_DAYS = 14
SPOT_HIST = {}  # key -> [[t, spot], ...], read from and written to spothist.json by __main__
GAP_WINDOW = 1800  # samples within 30 minutes either side of a candle count toward its gap


def gap_samples(hist, m1):
    """[(t, spot - futures)] for the spot samples whose minute the futures 1-minute candles have."""
    fut = {r[0]: r[4] for r in m1}
    return [(t, p - fut[t - t % 60]) for t, p in hist if t - t % 60 in fut]


def shift_by_gaps(rows, seconds, samples):
    """Move each candle by the median gap of the samples around it (the nearest sample when none is near)."""
    ts = [t for t, _ in samples]
    for r in rows:
        lo = bisect.bisect_left(ts, r[0] - GAP_WINDOW)
        hi = bisect.bisect_right(ts, r[0] + seconds + GAP_WINDOW)
        if hi > lo:
            near = sorted(g for _, g in samples[lo:hi])
            g = near[len(near) // 2]
        else:
            mid = r[0] + seconds / 2
            i = bisect.bisect_left(ts, mid)
            g = min(samples[max(i - 1, 0):i + 1], key=lambda s: abs(s[0] - mid))[1]
        r[1:] = [v + g for v in r[1:]]


def one(key, sym, spot_sym, fixture, prev=None):
    ser = jxy_series(fixture) if key == "jxy" else fetch_series(sym, fixture)
    m1, m5, m15, h1, d1, w1 = (ser[tf] for tf in ("1m", "5m", "15m", "1h", "1d", "1w"))
    # Futures trade above spot (XM/XS quote spot), so metals are moved onto the spot price by the
    # futures-to-spot gap. Without a spot quote this hour, the last known gap is reused for a while.
    spot, shift, adjusted, hist = None, None, None, None
    if spot_sym and fixture is None and h1:
        hist = [h for h in SPOT_HIST.get(key, []) if h[0] > time.time() - SPOT_HIST_DAYS * 86400]
        SPOT_HIST[key] = hist
        try:
            spot, src, ts = spot_price(spot_sym)
            if not hist or ts > hist[-1][0]:
                hist.append([ts, round(spot, 3)])
            shift = spot - (m1 or m15 or h1)[-1][4]
            print(key, f"spot {spot} from {src}, futures gap now {shift:+.2f}")
        except Exception as e:
            print(key, "spot unavailable:", e)
            pb, pt = (prev or {}).get("basis"), (prev or {}).get("basisAt", 0)
            if pb is not None and time.time() - pt < BASIS_MAX_AGE:
                shift = pb
                print(key, f"reusing futures gap {pb:+.2f} from", datetime.fromtimestamp(pt, timezone.utc).isoformat())
        samples = gap_samples(hist, m1)
        if samples:
            gs = sorted(g for _, g in samples)
            print(key, f"{len(samples)} matched gap samples since",
                  datetime.fromtimestamp(samples[0][0], timezone.utc).strftime("%m-%d %H:%M"),
                  f"UTC, gap {gs[0]:+.2f}..{gs[-1]:+.2f}, latest {samples[-1][1]:+.2f}")
            for rows, sec in ((m1, 60), (m5, 300), (m15, 900), (h1, 3600), (d1, 86400), (w1, 604800)):
                shift_by_gaps(rows, sec, samples)
            shift = samples[-1][1]
        elif shift is not None:
            for rows in (m1, m5, m15, h1, d1, w1):
                for r in rows:
                    r[1:] = [v + shift for v in r[1:]]
        adjusted = shift is not None
    last = (m1 or m15 or h1)[-1]
    price, as_of = last[4], last[0]  # the freshest close and when it traded
    if key in CHECK and fixture is None:
        try:
            check(key, price, h1, m15)
        except Exception as e:  # a log line must never cost the data
            print(key, "check failed:", e)
    if key not in UTC_DAY and len(h1) > 24 * 60:
        d1 = ny_daily(h1)
        current = ny_day(time.time())
        done = d1[:-1] if ny_day(d1[-1][0]) >= current else d1
    else:
        today = datetime.now(timezone.utc).date()
        last_day = datetime.fromtimestamp(d1[-1][0], timezone.utc).date()
        done = d1[:-1] if last_day >= today else d1  # drop today's unfinished candle
    a = analyze(key, done, price)
    prev_close = done[-1][4]
    print(key, round(price, 5), a["trend"], a["title"])
    return {
        "price": price, "asOf": as_of, "prevClose": prev_close, "analysis": a,
        **({} if adjusted is None else {
            "spotAdjusted": adjusted,
            "basis": shift if adjusted else None,
            # when the gap was measured: a reused gap keeps its original time so it ages out
            "basisAt": (prev or {}).get("basisAt") if adjusted and spot is None else int(time.time()),
        }),
        "candles": {
            "1m": r6(m1[-N_CANDLES:]),
            "5m": r6(m5[-N_CANDLES:]),
            "15m": r6(m15[-N_M15:]),
            "30m": r6(aggregate(m15, 1800)[-N_CANDLES:]),
            "1h": r6(h1[-N_H1:]),
            "4h": r6(aggregate(h1, 4 * 3600)[-N_CANDLES:]),
            "1d": r6(d1[-N_CANDLES:]),
            "1w": r6(w1[-N_CANDLES:]),
        },
    }

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--prev=")]
    prev_path = next((a[7:] for a in sys.argv[1:] if a.startswith("--prev=")), None)
    prev = None
    if prev_path:
        try:
            prev = json.load(open(prev_path))
        except Exception as e:
            print("no previous market.json:", e)
    if prev_path:
        try:
            SPOT_HIST.update(json.load(open(os.path.join(os.path.dirname(prev_path), "spothist.json"))))
        except Exception as e:
            print("no previous spothist.json:", e)
    fixture = json.load(open(args[1])) if len(args) > 1 else None
    json.dump(build(fixture, prev), open(args[0], "w"), ensure_ascii=False, separators=(",", ":"))
    if fixture is None:
        json.dump(SPOT_HIST, open(os.path.join(os.path.dirname(args[0]), "spothist.json"), "w"), separators=(",", ":"))
