"""Builds market.json for the widget: real candles for USD/JPY and gold plus an automatic
technical read (trend from moving averages, levels from daily pivots, RSI, ATR).

Usage: python3 analyze.py OUT.json            (fetches from Yahoo Finance / gold-api.com)
       python3 analyze.py OUT.json FIXTURE    (FIXTURE: JSON {symbol: yahoo-chart-json} for tests)
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "Mozilla/5.0 (TradeDeskWidget)"}
SYMBOLS = {"usdjpy": "JPY=X", "gold": "GC=F"}
NAMES = {"usdjpy": "ドル円", "gold": "ゴールド"}
TICK = {"usdjpy": 0.05, "gold": 5.0}  # levels are rounded to these steps
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
    step = TICK[key]
    v = round(v / step) * step
    return f"{v:.2f}" if key == "usdjpy" else f"{v:,.0f}"


def analyze(key, daily, price):
    closes = [r[4] for r in daily]
    s20, s50 = sma(closes, 20), sma(closes, 50)
    # previous completed day for pivots
    _, _, h, l, c = daily[-2]
    p = (h + l + c) / 3
    levels = sorted({p - (h - l), 2 * p - h, p, 2 * p - l, p + (h - l)})  # S2,S1,P,R1,R2
    below = [x for x in levels if x < price]
    above = [x for x in levels if x > price]
    sup = below[-1] if below else price - (h - l) / 2
    sup2 = below[-2] if len(below) > 1 else sup - (h - l) / 2
    res = above[0] if above else price + (h - l) / 2
    res2 = above[1] if len(above) > 1 else res + (h - l) / 2

    if s20 and s50 and s20 > s50 and price > s20:
        trend = "up"
    elif s20 and s50 and s20 < s50 and price < s20:
        trend = "down"
    else:
        trend = "range"

    name = NAMES[key]
    f = lambda v: fmt(key, v)
    if trend == "up":
        title = f"{name}：押し目買い目線"
        body = f"{f(sup)}付近の押し目に注目。\n{f(res)}を上抜ければ{f(res2)}が視野。"
    elif trend == "down":
        title = f"{name}：戻り売り目線"
        body = f"{f(res)}付近の戻りに注目。\n{f(sup)}を割り込めば{f(sup2)}が視野。"
    else:
        title = f"{name}：レンジ内の攻防"
        body = f"{f(sup)}〜{f(res)}のレンジを想定。\n抜けた方向へついていく。"
    return {
        "title": title, "body": body, "trend": trend,
        "rsi": rsi(closes), "atr": atr(daily),
        "support": sup, "resistance": res,
    }


def build(fixture=None):
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    spot_gold = None
    if fixture is None:
        try:
            spot_gold = float(get_json("https://api.gold-api.com/price/XAU")["price"])
        except Exception as e:  # futures prices are still usable on their own
            print("gold spot unavailable:", e)
    for key, sym in SYMBOLS.items():
        h1 = yahoo(sym, "60m", "1mo", fixture)
        d1 = yahoo(sym, "1d", "6mo", fixture)
        w1 = yahoo(sym, "1wk", "2y", fixture)
        shift = 0.0
        if key == "gold" and spot_gold and h1:
            # GC=F is the futures contract; move it onto the spot price shown in the widget
            shift = spot_gold - h1[-1][4]
            for rows in (h1, d1, w1):
                for r in rows:
                    r[1:] = [v + shift for v in r[1:]]
        price = h1[-1][4]
        a = analyze(key, d1, price)
        today = datetime.now(timezone.utc).date()
        last_day = datetime.fromtimestamp(d1[-1][0], timezone.utc).date()
        prev_close = d1[-2][4] if last_day >= today else d1[-1][4]
        out[key] = {
            "price": price, "prevClose": prev_close, "analysis": a,
            "candles": {
                "1h": h1[-N_CANDLES:],
                "4h": aggregate(h1, 4 * 3600)[-N_CANDLES:],
                "1d": d1[-N_CANDLES:],
                "1w": w1[-N_CANDLES:],
            },
        }
        print(key, round(price, 3), a["trend"], a["title"])
    return out


if __name__ == "__main__":
    fixture = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
    json.dump(build(fixture), open(sys.argv[1], "w"), ensure_ascii=False, separators=(",", ":"))
