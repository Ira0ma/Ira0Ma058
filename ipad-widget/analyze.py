"""Builds market.json for the widget: real candles for each selectable instrument plus an automatic
technical read (trend from moving averages, levels from daily pivots, RSI, ATR).

Usage: python3 analyze.py OUT.json [--prev=OLD.json]   (fetches from Yahoo Finance / gold-api.com;
                                                         OLD.json fills in instruments that fail)
       python3 analyze.py OUT.json FIXTURE    (FIXTURE: JSON {symbol: yahoo-chart-json} for tests)
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

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
TF_FETCH = [("1m", "1m", "5d"), ("5m", "5m", "5d"), ("15m", "15m", "5d"), ("1h", "60m", "3mo"), ("1d", "1d", "1y"), ("1w", "1wk", "5y")]
N_CANDLES = 150  # per timeframe; the widget shows ~38 and lets you scroll back through the rest


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


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
                out["instruments"][key] = dict(one(key, sym, spot_sym, fixture), updated=now)
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


def one(key, sym, spot_sym, fixture):
    ser = jxy_series(fixture) if key == "jxy" else fetch_series(sym, fixture)
    m1, m5, m15, h1, d1, w1 = (ser[tf] for tf in ("1m", "5m", "15m", "1h", "1d", "1w"))
    spot = None
    if spot_sym and fixture is None:
        try:
            spot = float(get_json(f"https://api.gold-api.com/price/{spot_sym}")["price"])
        except Exception as e:  # futures prices are still usable on their own
            print(key, "spot unavailable:", e)
    if spot and h1:
        # futures contract; move it onto the spot price shown in the widget
        shift = spot - (m1 or m15 or h1)[-1][4]
        for rows in (m1, m5, m15, h1, d1, w1):
            for r in rows:
                r[1:] = [v + shift for v in r[1:]]
    price = (m1 or m15 or h1)[-1][4]  # the freshest close
    today = datetime.now(timezone.utc).date()
    last_day = datetime.fromtimestamp(d1[-1][0], timezone.utc).date()
    done = d1[:-1] if last_day >= today else d1  # drop today's unfinished candle
    a = analyze(key, done, price)
    prev_close = done[-1][4]
    print(key, round(price, 5), a["trend"], a["title"])
    return {
        "price": price, "prevClose": prev_close, "analysis": a,
        "candles": {
            "1m": r6(m1[-N_CANDLES:]),
            "5m": r6(m5[-N_CANDLES:]),
            "15m": r6(m15[-N_CANDLES:]),
            "30m": r6(aggregate(m15, 1800)[-N_CANDLES:]),
            "1h": r6(h1[-N_CANDLES:]),
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
    fixture = json.load(open(args[1])) if len(args) > 1 else None
    json.dump(build(fixture, prev), open(args[0], "w"), ensure_ascii=False, separators=(",", ":"))
