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
}
N_CANDLES = 38


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
    if trend == "up":
        title = f"{name}：押し目買い目線"
        body = f"{f(sup)}付近の押し目に注目。\n{f(res)}を上抜ければ{f(res2)}が視野。"
    elif trend == "down":
        title = f"{name}：戻り売り目線"
        body = f"{f(res)}付近の戻りに注目。\n{f(sup)}を割り込めば{f(sup2)}が視野。"
    else:
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


def one(key, sym, spot_sym, fixture):
    h1 = yahoo(sym, "60m", "1mo", fixture)
    d1 = yahoo(sym, "1d", "6mo", fixture)
    w1 = yahoo(sym, "1wk", "2y", fixture)
    spot = None
    if spot_sym and fixture is None:
        try:
            spot = float(get_json(f"https://api.gold-api.com/price/{spot_sym}")["price"])
        except Exception as e:  # futures prices are still usable on their own
            print(key, "spot unavailable:", e)
    if spot and h1:
        # futures contract; move it onto the spot price shown in the widget
        shift = spot - h1[-1][4]
        for rows in (h1, d1, w1):
            for r in rows:
                r[1:] = [v + shift for v in r[1:]]
    price = h1[-1][4]
    today = datetime.now(timezone.utc).date()
    last_day = datetime.fromtimestamp(d1[-1][0], timezone.utc).date()
    done = d1[:-1] if last_day >= today else d1  # drop today's unfinished candle
    a = analyze(key, done, price)
    prev_close = done[-1][4]
    print(key, round(price, 5), a["trend"], a["title"])
    return {
        "price": price, "prevClose": prev_close, "analysis": a,
        "candles": {
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
