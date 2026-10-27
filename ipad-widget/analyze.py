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
import urllib.error
import urllib.parse
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
TF_FETCH = [("1m", "1m", "5d"), ("5m", "5m", "5d"), ("15m", "15m", "5d"), ("1h", "60m", "1y"), ("1d", "1d", "1y"), ("1w", "1wk", "5y"), ("1mo", "1mo", "10y")]
# Markets that trade nearly 24 hours roll their day at 17:00 New York (the FX convention MT4/TradingView use).
# Their daily candles, previous close and pivots are rebuilt from hourly data on that boundary.
# Bitcoin follows the same server days (MT4/MT5 cut every chart there, weekends included); VIX keeps its exchange close.
NY = ZoneInfo("America/New_York")
UTC_DAY = {"vix"}


def ny_day(t):
    return (datetime.fromtimestamp(t, NY) + timedelta(hours=7)).date()  # 17:00 NY -> next calendar day


def regroup(daily, keyf):
    """Daily candles grouped into longer ones by keyf(server date): weeks, months."""
    out, key = [], None
    for t, o, h, l, c in daily:
        k = keyf(ny_day(t))
        if k == key:
            r = out[-1]
            r[2], r[3], r[4] = max(r[2], h), min(r[3], l), c
        else:
            out.append([t, o, h, l, c]); key = k
    return out


WEEK = lambda d: d - timedelta(days=d.weekday())  # the server week starts on Monday (Sunday 17:00 New York)
MONTH = lambda d: (d.year, d.month)


def splice_long(key, label, yahoo_rows, daily, keyf):
    """Weekly/monthly candles on the XM/XS server calendar: the periods the daily candles cover entirely are
    built from them (spot for metals, server-day boundaries), older ones stay Yahoo's. Logs how far apart the
    two are where both exist, and the latest candles."""
    groups = regroup(daily, keyf)
    if len(groups) < 2:
        return yahoo_rows
    derived = [r[:] for r in groups[1:]]  # the first period is only partly covered by the daily candles
    older = [r[:] for r in yahoo_rows if r[0] < derived[0][0]]
    # Yahoo's weekly/monthly FX candles carry the odd bad tick (a USD/JPY week of Dec 2024 with a low 10 yen
    # under the real one). A wick over 3x the median candle range that is also most of its candle is cut back
    # to a median-sized wick.
    rngs = sorted(r[2] - r[3] for r in older + derived)
    med = rngs[len(rngs) // 2] if rngs else 0
    wicks = sorted(min(r[1], r[4]) - r[3] for r in derived) or [0]
    mw = wicks[len(wicks) // 2]
    tops = sorted(r[2] - max(r[1], r[4]) for r in derived) or [0]
    mt = tops[len(tops) // 2]
    fixed = []
    for r in older:
        lo, hi = min(r[1], r[4]) - r[3], r[2] - max(r[1], r[4])
        if med and lo > 3 * med and lo > 0.7 * (r[2] - r[3]):
            fixed.append(f"{ny_day(r[0])} low {r[3]:.5g}"); r[3] = min(r[1], r[4]) - mw
        if med and hi > 3 * med and hi > 0.7 * (r[2] - r[3]):
            fixed.append(f"{ny_day(r[0])} high {r[2]:.5g}"); r[2] = max(r[1], r[4]) + mt
    if fixed and key in CHECK:
        print(key, f"{label}: cut back bad Yahoo wicks:", "; ".join(fixed))
    if key in CHECK:
        by = {keyf(ny_day(r[0])): r for r in yahoo_rows}
        diffs = [(abs(by[k][2] - r[2]), abs(by[k][3] - r[3])) for r in derived if (k := keyf(ny_day(r[0]))) in by]
        fmt = lambda r: f"{ny_day(r[0])} {r[1]:.5g}/{r[2]:.5g}/{r[3]:.5g}/{r[4]:.5g}"
        print(key, f"{label}: {len(older)} from Yahoo + {len(derived)} from daily candles;",
              f"Yahoo vs daily-built over {len(diffs)} periods: max high diff {max(d[0] for d in diffs):.4g}, max low diff {max(d[1] for d in diffs):.4g};" if diffs else "",
              "latest (server date o/h/l/c):", "; ".join(fmt(r) for r in derived[-3:]))
        worst = max((r for r in derived if keyf(ny_day(r[0])) in by),
                    key=lambda r: max(abs(by[keyf(ny_day(r[0]))][2] - r[2]), abs(by[keyf(ny_day(r[0]))][3] - r[3])), default=None)
        if worst:
            print(key, f"{label} largest gap: daily-built {fmt(worst)} vs Yahoo {fmt(by[keyf(ny_day(worst[0]))])}")
    return older + derived


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
    """Spot price of a metal (XAU/XAG in USD) and when it was quoted (unix seconds): Swissquote's public
    quote feed first (its bid, the side MT4/MT5 charts at XM/XS are drawn from, with an exact quote time),
    then gold-api.com, whose time stamp can trail its price by minutes in a fast market."""
    errs = []
    try:
        feed = get_json(f"https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/{spot_sym}/USD")
        bids = sorted(p["bid"] for q in feed for p in q.get("spreadProfilePrices", [])[:1])
        if bids:
            ts = max((q.get("ts") or 0) for q in feed) / 1000 or time.time()
            return bids[len(bids) // 2], "swissquote bid", int(ts)  # median across Swissquote's platforms
        errs.append("swissquote: no prices")
    except Exception as e:
        errs.append(f"swissquote: {e}")
    try:
        d = get_json(f"https://api.gold-api.com/price/{spot_sym}")
        try:
            ts = datetime.fromisoformat(d["updatedAt"].replace("Z", "+00:00")).timestamp()
        except Exception:
            ts = time.time()
        return float(d["price"]), "gold-api", int(ts)
    except Exception as e:
        errs.append(f"gold-api: {e}")
    raise RuntimeError("; ".join(errs))


def yahoo(symbol, interval, rng, fixture=None):
    key = f"{symbol}|{interval}|{rng}"
    if fixture is not None:
        data = fixture[key]
    else:
        data = get_json(f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&range={rng}")
    res = data["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    rows, vol = [], {}
    for i, t in enumerate(res.get("timestamp") or []):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, l, c):
            continue
        rows.append([t, o, h, l, c])
        v = (q.get("volume") or [None] * (i + 1))[i]
        if v:
            vol[t] = v
    # Yahoo ends intraday series with the latest quote stamped at the current minute (e.g. 12:04 after the 12:00
    # candle). Fold it into the candle it belongs to, or start that candle on its boundary, so no extra one-tick
    # candle appears and later candles stay on the quarter-hours / hours.
    sec = {"1m": 60, "2m": 120, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600, "90m": 5400, "1h": 3600}.get(interval)
    if sec and rows:
        t, o, h, l, c = rows[-1]
        b = t - t % sec
        if b != t:
            if len(rows) >= 2 and rows[-2][0] == b:
                p = rows[-2]
                p[2], p[3], p[4] = max(p[2], h), min(p[3], l), c
                rows.pop()
            else:
                rows[-1][0] = b
            if t in vol:
                vol[b] = vol.get(b, 0) + vol.pop(t)
    VOLUME[(symbol, interval)] = vol
    return rows


VOLUME = {}  # (Yahoo symbol, interval) -> {candle time: traded volume}; futures only (FX has none)


def volumes(rows, vol):
    """Volume of each candle: the source candles' volumes from its start up to the next candle's start."""
    ts = sorted(vol)
    out = []
    for i, r in enumerate(rows):
        end = rows[i + 1][0] if i + 1 < len(rows) else float("inf")
        out.append(int(sum(vol[t] for t in ts[bisect.bisect_left(ts, r[0]):bisect.bisect_left(ts, end)])))
    return out


def server_offset(t):
    """Seconds the XM/XS server clock runs ahead of UTC: New York time + 7 hours (GMT+3, GMT+2 in US winter)."""
    return int(datetime.fromtimestamp(t, NY).utcoffset().total_seconds()) + 7 * 3600


def aggregate(rows, seconds, server=False):
    """Candles of `seconds`; server=True starts them on the XM/XS server clock (4h candles at 21:00, 1:00 ... UTC)."""
    out = []
    for t, o, h, l, c in rows:
        b = t - (t + (server_offset(t) if server else 0)) % seconds
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
    # a source candle now and then has its high below the open/close (seen on Yahoo's weekly USD/JPY);
    # widen the high/low to cover them so no page draws a broken candle
    return [[t] + [float(f"{v:.6g}") for v in (o, max(o, h, l, c), min(o, h, l, c), c)] for t, o, h, l, c in rows]


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
        _cache[sym] = {tf: yahoo(sym, iv, rng, fixture) for tf, iv, rng in TF_FETCH if tf != "1mo"}
        if fixture is None:  # two years of hours (Yahoo's limit) so two years of weeks and months follow the server days
            try:
                h2 = yahoo(sym, "60m", "2y")
                if len(h2) > len(_cache[sym]["1h"]):
                    _cache[sym]["1h"] = h2
            except Exception as e:
                print(sym, "two years of hours unavailable, keeping one:", e)
        try:  # monthly candles are for the charts only; without them the rest still counts
            _cache[sym]["1mo"] = yahoo(sym, "1mo", "10y", fixture)
        except Exception as e:
            print(sym, "monthly candles unavailable:", e)
            _cache[sym]["1mo"] = []
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


COINBASE = "https://api.coinbase.com/v2/exchange-rates?currency=USD"
SQ = "https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/"
CHECK = {"gold": "XAU/USD", "usdjpy": "USD/JPY", "btc": "BTC/USD"}  # dashboard instruments: log a sanity check each run


def check(key, price, h1, m15, as_of):
    """Log today's range, outsized candles and the gap to Swissquote's quote, for checking the dashboards."""
    day = [r for r in h1 if ny_day(r[0]) == ny_day(h1[-1][0])]
    hi, lo = max(r[2] for r in day), min(r[3] for r in day)
    rng = sorted(r[2] - r[3] for r in h1[-200:])
    med = rng[len(rng) // 2] or 1e-9
    odd = [(datetime.fromtimestamp(r[0], timezone.utc).strftime("%m-%d %H:%M"), round(r[2] - r[3], 5))
           for r in h1[-48:] + m15[-96:] if r[2] - r[3] > 8 * med]
    age = (time.time() - as_of) / 60 - 1  # minutes since the latest 1-minute candle closed (Yahoo's futures run late)
    msg = f"{key} check: today high {hi:.3f} low {lo:.3f} ({len(day)} H1 bars), last {price:.3f} (data ~{max(age, 0):.0f} min old)"
    if key == "btc":  # Swissquote has no BTC quote: set it against Coinbase, the BTC page's price source
        try:
            msg += f", coinbase {float(get_json('https://api.coinbase.com/v2/prices/BTC-USD/spot')['data']['amount']):.3f}"
        except Exception as e:
            msg += f", coinbase unavailable ({e})"
    else:
        try:
            feed = get_json(f"https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/{CHECK[key]}")
            mids = sorted((p["bid"] + p["ask"]) / 2 for q in feed for p in q.get("spreadProfilePrices", [])[:1])
            msg += f", swissquote {mids[len(mids) // 2]:.3f}"
        except Exception as e:
            msg += f", swissquote unavailable ({e})"
    if key == "usdjpy":  # the USD/JPY page's live price sources, side by side
        try:
            msg += f", coinbase {float(get_json(COINBASE)['data']['rates']['JPY']):.3f}"
        except Exception as e:
            msg += f", coinbase unavailable ({e})"
        try:  # can a browser page read the Swissquote feed (CORS)?
            req = urllib.request.Request(SQ + "USD/JPY", headers={**UA, "Origin": "https://ira0ma.github.io"})
            with urllib.request.urlopen(req, timeout=20) as r:
                msg += f", swissquote CORS {r.headers.get('Access-Control-Allow-Origin')!r}"
        except Exception as e:
            msg += f", swissquote CORS check failed ({e})"
    print(msg + (f"; outsized candles (>8x median range): {odd}" if odd else "; no outsized candles"))
    span = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%H:%M")
    print(key, "last 15m candles (UTC open/high/low/close):",
          "; ".join(f"{span(t)} {o:.2f}/{h:.2f}/{l:.2f}/{c:.2f}" for t, o, h, l, c in m15[-6:]))



def tf_check(key, candles):
    """Log whether the timeframes the GOLD/USD-JPY pages and the Trade Desk draw agree with each other:
    broken candles (high below open/close and the like), and the high/low of the same finished 12 hours
    on 5m, 15m, 30m, 1h and 4h. Tolerance: 0.5 dollars for gold, 0.5 pip for USD/JPY."""
    tol = 0.5 if key == "gold" else 0.005
    bad = {tf: sum(1 for t, o, h, l, c in rows if h < max(o, c) - 1e-9 or l > min(o, c) + 1e-9)
           for tf, rows in candles.items()}
    end = candles["4h"][-1][0]  # the 4h candle still forming is left out
    start = end - 12 * 3600
    ranges = {}
    for tf in ("5m", "15m", "30m", "1h", "4h"):
        rows = [r for r in candles[tf] if start <= r[0] < end]
        if rows and candles[tf][0][0] <= start:  # this timeframe covers the whole window
            ranges[tf] = (max(r[2] for r in rows), min(r[3] for r in rows))
    ref = ranges.get("1h")
    off = {tf: (round(h - ref[0], 5), round(l - ref[1], 5)) for tf, (h, l) in ranges.items()
           if ref and (abs(h - ref[0]) > tol or abs(l - ref[1]) > tol)}
    span = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%m-%d %H:%M")
    if off:  # which hours the 15m candles miss, and how many 15m candles each has
        why = []
        for r in candles["1h"]:
            if start <= r[0] < end:
                q = [x for x in candles["15m"] if r[0] <= x[0] < r[0] + 3600]
                if q and (abs(max(x[2] for x in q) - r[2]) > tol or abs(min(x[3] for x in q) - r[3]) > tol):
                    why.append(f"{span(r[0])} 1h {r[2]:.2f}/{r[3]:.2f} vs {len(q)}x15m {max(x[2] for x in q):.2f}/{min(x[3] for x in q):.2f}")
        print(key, "timeframe mismatch hours:", "; ".join(why) or "none hour by hour")
    print(key, f"timeframe check {span(start)}..{span(end)} UTC: 1h high/low {ref},",
          f"compared {sorted(ranges)};", f"mismatch (high, low vs 1h) {off}" if off else "all agree",
          f"; broken candles {dict((k, v) for k, v in bad.items() if v)}" if any(bad.values()) else "; no broken candles")


def coinbase_offset(price):
    """How far Coinbase's USD/JPY rate (the USD/JPY page's live price) sits from the chart's price, which
    follows the bid that XM/XS charts and quote first. Coinbase runs near the ask, about a pip higher;
    the page takes this offset off. It is measured against Swissquote's bid of the same moment (the chart's
    price can be minutes old), else against the chart's price. Median of the last 12 runs, so one stale
    minute does not move it."""
    SPOT_HIST.pop("usdjpy_coinbase", None)  # samples taken against the chart's price, replaced by these
    hist = SPOT_HIST.setdefault("usdjpy_coinbase_sq", [])
    try:
        feed = get_json(SQ + "USD/JPY")
        bids = sorted(p["bid"] for q in feed for p in q.get("spreadProfilePrices", [])[:1])
        if bids:
            price = bids[len(bids) // 2]
    except Exception as e:
        print("usdjpy swissquote unavailable for the coinbase offset:", e)
    try:
        off = float(get_json(COINBASE)["data"]["rates"]["JPY"]) - price
        if abs(off) < 0.1:  # a bigger gap is a stale or broken quote, not the spread
            hist.append([int(time.time()), round(off, 4)])
    except Exception as e:
        print("usdjpy coinbase unavailable:", e)
    del hist[:-12]
    # GMO Coin's FX feed (the pages' real-time USD/JPY over WebSocket): its bid against the same Swissquote bid
    gh = SPOT_HIST.setdefault("usdjpy_gmo_sq", [])
    try:
        gmo = next(float(x["bid"]) for x in get_json(GMO)["data"] if x["symbol"] == "USD_JPY")
        if abs(gmo - price) < 0.05:
            gh.append([int(time.time()), round(gmo - price, 4)])
    except Exception as e:
        print("usdjpy GMO unavailable:", e)
    del gh[:-12]
    global GMO_OFFSET
    if gh:
        go = sorted(o for _, o in gh)
        GMO_OFFSET = go[len(go) // 2]
        print("usdjpy GMO offset", f"{GMO_OFFSET:+.4f}", f"(median of {len(go)})")
    if not hist:
        return None
    offs = sorted(o for _, o in hist)
    print("usdjpy coinbase offset", f"{offs[len(offs) // 2]:+.4f}", f"(median of {len(offs)})")
    return offs[len(offs) // 2]


GMO = "https://forex-api.coin.z.com/public/v1/ticker"
GMO_OFFSET = None


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
    """Move each candle by the median gap of the samples around it (the nearest sample when none is near).
    Candles shorter than an hour take the gap of their hour, so 1m-30m highs and lows match the 1h candle."""
    ts = [t for t, _ in samples]
    for r in rows:
        start, seconds = (r[0] - r[0] % 3600, 3600) if seconds < 3600 else (r[0], seconds)
        lo = bisect.bisect_left(ts, start - GAP_WINDOW)
        hi = bisect.bisect_right(ts, start + seconds + GAP_WINDOW)
        if hi > lo:
            near = sorted(g for _, g in samples[lo:hi])
            g = near[len(near) // 2]
        else:
            mid = start + seconds / 2
            i = bisect.bisect_left(ts, mid)
            g = min(samples[max(i - 1, 0):i + 1], key=lambda s: abs(s[0] - mid))[1]
        r[1:] = [v + g for v in r[1:]]


def usual_step(rows, default):
    """The usual spacing of a series' candles (the live last candle sits off it, e.g. 18:01 after 18:00)."""
    tail = rows[-50:]
    diffs = [b[0] - a[0] for a, b in zip(tail, tail[1:]) if b[0] > a[0]]
    return max(set(diffs), key=diffs.count) if diffs else default


def fill_gaps(rows, finer, sec):
    """Add the candles missing from rows (Yahoo now and then leaves a 15m candle out) where all the finer
    candles of that period are there, built from them."""
    if len(finer) < 2 or not rows:
        return
    step = usual_step(finer, sec)
    have, groups = {r[0] for r in rows}, {}
    for r in finer:
        if r[0] >= rows[0][0]:
            groups.setdefault(r[0] - r[0] % sec, []).append(r)
    add = [[k, g[0][1], max(x[2] for x in g), min(x[3] for x in g), g[-1][4]] + list(g[-1][5:])
           for k, g in groups.items() if k not in have and len(g) >= sec // step and k + sec <= finer[-1][0]]
    if add:
        print("filled", len(add), f"missing {sec // 60}m candles from finer ones:",
              ", ".join(datetime.fromtimestamp(r[0], timezone.utc).strftime("%m-%d %H:%M") for r in add[-6:]))
        rows.extend(add)
        rows.sort(key=lambda r: r[0])


def widen_hours(h1, *finer, sec=3600):
    """Yahoo's hour candles sometimes miss an extreme its 5- and 15-minute candles of the same hour show
    (gold 22 Oct 16:00 UTC: the 1h low sat 1.55 above the 15m low), so 1h/4h disagreed with 5m-30m on
    the charts. Each hour is widened to the highs and lows of its finer candles. The same goes for 15m
    candles against 5m (gold 23 Oct: an hour widened by a 5m low left the 15m/30m low 1.15 above it)."""
    ext, full = {}, set()
    for rows in finer:
        if len(rows) > 1:
            step = usual_step(rows, sec)
            cnt = {}
            for r in rows:
                k = r[0] - r[0] % sec
                cnt[k] = cnt.get(k, 0) + 1
            full |= {k for k, c in cnt.items() if c >= sec // step}  # every finer candle of the period is there
        for r in rows:
            k = r[0] - r[0] % sec
            e = ext.get(k)
            ext[k] = (max(r[2], e[0]), min(r[3], e[1])) if e else (r[2], r[3])
    for r in h1:
        e = ext.get(r[0])
        if e and r[0] in full:
            # a complete set of finer candles is the more detailed record: the period takes exactly their
            # extremes (gold 23 Oct 14:00 UTC: the 1h low sat 1.35 below every 5m and 15m low of that hour)
            r[2], r[3] = e
        elif e:
            r[2], r[3] = max(r[2], e[0]), min(r[3], e[1])


def one(key, sym, spot_sym, fixture, prev=None):
    ser = jxy_series(fixture) if key == "jxy" else fetch_series(sym, fixture)
    m1, m5, m15, h1, d1, w1, mo = (ser[tf] for tf in ("1m", "5m", "15m", "1h", "1d", "1w", "1mo"))
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
            for rows, sec in ((m1, 60), (m5, 300), (m15, 900), (h1, 3600), (d1, 86400), (w1, 604800), (mo, 2629746)):
                shift_by_gaps(rows, sec, samples)
            shift = samples[-1][1]
        elif shift is not None:
            for rows in (m1, m5, m15, h1, d1, w1, mo):
                for r in rows:
                    r[1:] = [v + shift for v in r[1:]]
        adjusted = shift is not None
    fill_gaps(m15, m5, 900)  # a 15m candle Yahoo left out is built from its three 5m candles
    widen_hours(m15, m5, sec=900)  # first the 15m candles from 5m, then the hours from both
    widen_hours(h1, m5, m15)
    last = (m1 or m15 or h1)[-1]
    price, as_of = last[4], last[0]  # the freshest close and when it traded
    live_offset = coinbase_offset(price) if key == "usdjpy" and fixture is None else None
    if key in CHECK and fixture is None:
        try:
            check(key, price, h1, m15, as_of)
        except Exception as e:  # a log line must never cost the data
            print(key, "check failed:", e)
    if key not in UTC_DAY and len(h1) > 24 * 60:
        d1 = ny_daily(h1)
        if key in CHECK:  # daily candles far outside the usual range: a bad tick would carry into weeks and months
            rng = sorted(r[2] - r[3] for r in d1)
            med = rng[len(rng) // 2]
            odd = [r for r in d1 if r[2] - r[3] > 4 * med]
            print(key, f"daily candles: {len(d1)}, median range {med:.4g},", f"{len(odd)} over 4x:",
                  "; ".join(f"{ny_day(r[0])} {r[1]:.5g}/{r[2]:.5g}/{r[3]:.5g}/{r[4]:.5g}" for r in odd[-6:]))
        w1 = splice_long(key, "weekly", w1, d1, WEEK)
        mo = splice_long(key, "monthly", mo, d1, MONTH)
        current = ny_day(time.time())
        done = d1[:-1] if ny_day(d1[-1][0]) >= current else d1
    else:
        today = datetime.now(timezone.utc).date()
        last_day = datetime.fromtimestamp(d1[-1][0], timezone.utc).date()
        done = d1[:-1] if last_day >= today else d1  # drop today's unfinished candle
    a = analyze(key, done, price)
    prev_close = done[-1][4]
    print(key, round(price, 5), a["trend"], a["title"])
    candles = {
        "1m": r6(m1[-N_CANDLES:]),
        "5m": r6(m5[-N_CANDLES:]),
        "15m": r6(m15[-N_M15:]),
        "30m": r6(aggregate(m15, 1800)[-N_CANDLES:]),
        "1h": r6(h1[-N_H1:]),
        "4h": r6(aggregate(h1, 4 * 3600, server=True)[-N_CANDLES:]),
        "1d": r6(d1[-N_CANDLES:]),
        "1w": r6(w1[-N_CANDLES:]),
        "1mo": r6(mo[-N_CANDLES:]),
    }
    volume = None
    if key == "gold":  # futures volume, for the GOLD page's large-position exit marks
        src = {"5m": "5m", "15m": "15m", "30m": "15m", "1h": "60m", "4h": "60m", "1d": "60m"}
        volume = {tf: volumes(candles[tf], VOLUME.get((sym, iv), {})) for tf, iv in src.items()}
    if key in CHECK and fixture is None:
        try:
            tf_check(key, candles)
        except Exception as e:  # a log line must never cost the data
            print(key, "timeframe check failed:", e)
    return {
        "price": price, "asOf": as_of, "prevClose": prev_close, "analysis": a,
        **({} if live_offset is None else {"liveOffset": round(live_offset, 4)}),
        **({"liveOffsetGmo": round(GMO_OFFSET, 4)} if key == "usdjpy" and GMO_OFFSET is not None else {}),
        **({} if adjusted is None else {
            "spotAdjusted": adjusted,
            "basis": shift if adjusted else None,
            # when the gap was measured: a reused gap keeps its original time so it ages out
            "basisAt": (prev or {}).get("basisAt") if adjusted and spot is None else int(time.time()),
        }),
        "candles": candles,
        **({"volume": volume} if volume else {}),
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
