"""Past reactions to economic releases (追加D).

For each released USD/JPY event of the week's calendar (★2 and ★3) whose hour has passed, the size of the
move in its affected instruments: from the close just before the release, the high and low of the following
hour (60 minutes). Measured on the site's own candles (market.json, the same prices the pages chart): 5-minute
candles when they cover the hour, else 15-minute ones. Earlier results are carried over from the published
copy, so the history only starts from when this began; nothing before that is made up.

    python3 reactions.py _site/reactions.json _site/market.json _site/calendar.json [--prev=prev/reactions.json]
                         [--backfill=ipad-widget/reaction_backfill.json]

--backfill (one time): past releases whose date and time were read on official schedule pages, measured with the
same hour and method on Yahoo's 5-minute candles (about 60 days back; 15-minute ones if a 5-minute hour is
incomplete). The same Yahoo symbols the site's own candles come from (JPY=X, GC=F, CL=F). A record measured live is
never replaced; backfilled records carry "backfill": true, and the file's version is stored so it runs only once.

Units: USD/JPY in pips (0.01 yen), gold and oil in US dollars.
Oil is measured on the site's US oil candles, which are the WTI futures (CL=F): the published OILCash quote has no
public price history, so these are not OILCash moves. The US indicators are measured on oil too (measured()), with
the same hour and the same method; the 影響 tags (affected()) stay as they are.
"""
import json
import re
import urllib.request
import sys
import time
from datetime import datetime, timezone

IMPACT = {"High": 3, "Medium": 2}
KEEP_DAYS = 200
UNIT = {"usdjpy": 0.01, "gold": 1.0, "usoil": 1.0}


def affected(country, title):
    """Which of the desk's instruments an event moves (the same table as the pages' 影響 tags)."""
    if re.search(r"Crude Oil Inventories", title, re.I):
        return ["usoil"]
    if country == "USD":
        return ["usdjpy", "gold"]
    if country == "JPY":
        return ["usdjpy"]
    return []


def measured(country, title):
    """The instruments whose reaction is recorded: the affected ones, plus oil (CL=F) for the other US indicators."""
    insts = affected(country, title)
    if country == "USD" and "usoil" not in insts:
        insts = insts + ["usoil"]
    return insts


def measure(rows, step, t):
    """Close before t, then the high and low of [t, t+60m). None unless the candles cover the whole hour."""
    by = {r[0]: r for r in rows}
    start = t - t % step
    before = by.get(start - step)
    hour = [by.get(start + i * step) for i in range(3600 // step)]
    if not before or any(r is None for r in hour):
        return None
    pre = before[4]
    hi = max([pre] + [r[2] for r in hour])
    lo = min([pre] + [r[3] for r in hour])
    return pre, hi, lo


YAHOO = {"usdjpy": "JPY=X", "gold": "GC=F", "usoil": "CL=F"}


def yahoo_rows(symbol, interval):
    req = urllib.request.Request(f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&range=60d",
                                 headers={"User-Agent": "Mozilla/5.0 (TradeDeskWidget)"})
    res = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    return [[t, q["open"][i], q["high"][i], q["low"][i], q["close"][i]] for i, t in enumerate(res.get("timestamp") or [])
            if None not in (q["open"][i], q["high"][i], q["low"][i], q["close"][i])]


def backfill(path, events, prev_mark, now):
    """Add the past releases listed in `path` that are not recorded yet. Returns the mark to store, or the old one."""
    doc = json.load(open(path))
    if prev_mark and prev_mark.get("version") == doc["version"]:
        return prev_mark
    candles = {}
    for k, sym in YAHOO.items():
        for tf in ("5m", "15m"):
            try:
                candles[(k, tf)] = yahoo_rows(sym, tf)
            except Exception as e:
                print("backfill: no", sym, tf, e)
    if not all((k, "5m") in candles for k in YAHOO):
        print("backfill: not every instrument's candles came this run; will try again next run")
        return prev_mark
    added = 0
    for r in doc["events"]:
        t = int(datetime.fromisoformat(r["date"]).timestamp())
        key = f'{r["country"]}|{r["title"]}|{t}'
        if key in events or now < t + 3600 + 300:
            continue
        rec = {"title": r["title"], "country": r["country"], "t": t, "move": {}, "backfill": True}
        for k in measured(r["country"], r["title"]):
            for tf, step in (("5m", 300), ("15m", 900)):
                m = measure(candles.get((k, tf), []), step, t)
                if m:
                    pre, hi, lo = m
                    rec["move"][k] = {"size": round((hi - lo) / UNIT[k], 1), "up": round((hi - pre) / UNIT[k], 1),
                                      "down": round((pre - lo) / UNIT[k], 1), "tf": tf}
                    break
        if rec["move"]:
            events[key] = rec
            added += 1
            print("backfill", datetime.fromtimestamp(t, timezone.utc).strftime("%m-%d %H:%M UTC"), r["title"],
                  {k: v["size"] for k, v in rec["move"].items()})
    print("backfill:", added, "past releases added from", path)
    return {"version": doc["version"], "added": added, "at": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds")}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    prev_path = next((a[7:] for a in sys.argv[1:] if a.startswith("--prev=")), None)
    bf_path = next((a[11:] for a in sys.argv[1:] if a.startswith("--backfill=")), None)
    mark = None
    out_path, market_path, cal_path = args
    events = {}
    if prev_path:
        try:
            prev = json.load(open(prev_path))
            events, mark = prev.get("events", {}), prev.get("backfill")
        except Exception as e:
            print("no previous reactions.json:", e)
    market = json.load(open(market_path))["instruments"]
    cal = json.load(open(cal_path))
    now = time.time()
    added = 0
    for r in cal:
        if r.get("country") not in ("USD", "JPY") or r.get("impact") not in IMPACT:
            continue
        try:
            t = int(datetime.fromisoformat(r["date"]).timestamp())
        except Exception:
            continue
        insts = measured(r["country"], r.get("title", ""))
        key = f'{r["country"]}|{r["title"]}|{t}'
        if not insts or now < t + 3600 + 300 or (key in events and len(events[key]["move"]) == len(insts)):
            continue
        rec = events.get(key) or {"title": r["title"], "country": r["country"], "t": t, "stars": IMPACT[r["impact"]], "move": {}}
        for k in insts:
            if k in rec["move"] or k not in market:
                continue
            for tf, step in (("5m", 300), ("15m", 900)):
                m = measure(market[k]["candles"].get(tf, []), step, t)
                if m:
                    pre, hi, lo = m
                    rec["move"][k] = {"size": round((hi - lo) / UNIT[k], 1), "up": round((hi - pre) / UNIT[k], 1),
                                      "down": round((pre - lo) / UNIT[k], 1), "tf": tf}
                    break
        if rec["move"]:
            events[key] = rec
            added += 1
            print("reaction", datetime.fromtimestamp(t, timezone.utc).strftime("%m-%d %H:%M UTC"), r["country"], r["title"],
                  {k: v["size"] for k, v in rec["move"].items()})
    if bf_path:
        try:
            mark = backfill(bf_path, events, mark, now)
        except Exception as e:
            print("backfill failed:", e)
    cut = now - KEEP_DAYS * 86400
    events = {k: v for k, v in events.items() if v["t"] >= cut}
    json.dump({"updated": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"),
               "units": {"usdjpy": "pips", "gold": "USD", "usoil": "USD"}, "events": events,
               **({"backfill": mark} if mark else {})},
              open(out_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(events), "reactions kept,", added, "new or completed this run")


if __name__ == "__main__":
    main()
