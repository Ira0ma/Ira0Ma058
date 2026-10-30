"""Typhoon and pollen data for the desk's weather card (typhoon.json, pollen.json).

Typhoons: JMA's bosai feed lists the tropical cyclones it is tracking (targetTc.json); each one's
specifications.json holds the analysis and forecast positions. Pollen: Weathernews' open pollen data
(pollen robots, hourly counts per city) for each prefectural capital, only in the pollen season and at
most once an hour. Either file keeps the previously published copy when its source fails.

usage: hazards.py OUT_DIR PREV_DIR
"""
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

OUT, PREV = sys.argv[1], sys.argv[2]
JST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (TradeDeskWidget)"}


def get(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def prev(name):
    try:
        return json.load(open(f"{PREV}/{name}", encoding="utf-8"))
    except Exception:
        return None


def save(name, data):
    json.dump(data, open(f"{OUT}/{name}", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def pick(d, *path):
    for k in path:
        if isinstance(d, dict):
            d = d.get(k)
        elif isinstance(d, list) and isinstance(k, int) and len(d) > k:
            d = d[k]
        else:
            return None
    return d


def typhoons():
    base = "https://www.jma.go.jp/bosai/typhoon/data/"
    ids = sorted(set(re.findall(r"TC\d{4}", get(base + "targetTc.json"))))
    out = []
    for tc in ids:
        spec = json.loads(get(f"{base}{tc}/specifications.json"))
        parts = spec if isinstance(spec, list) else [spec]
        if not out:  # the fields of the analysis part and of the last forecast part, for checking
            for p in (parts[1:2] + parts[-1:]):
                if isinstance(p, dict):
                    print("typhoon", tc, "part", pick(p, "part", "jp"), "keys:", {k: (v if not isinstance(v, (dict, list)) else (list(v.keys()) if isinstance(v, dict) else len(v))) for k, v in p.items()})
        track = []
        head = None
        for p in parts:
            if not isinstance(p, dict):
                continue
            pos = pick(p, "position", "deg") or pick(p, "center", "deg")
            vt = p.get("validtime") or p.get("time")
            pt = {"t": vt.get("JST") if isinstance(vt, dict) else vt,
                  "part": pick(p, "part", "jp") or p.get("part"),
                  "pos": pos,
                  "loc": p.get("location"),
                  "pressure": p.get("pressure"),
                  "wind": pick(p, "maximumWind", "sustained", "m/s") or pick(p, "maximumWind", "sustained", "ms"),
                  "course": p.get("course"),
                  "speed": pick(p, "speed", "km/h") or pick(p, "speed", "km_h"),
                  "circle": (pick(p, "probabilityCircleRadius", "km") or pick(p, "probabilityCircle", "radius", "km") or pick(p, "forecastCircle", "radius", "km")
                             or pick(p, "probabilityCircle", "radius") or pick(p, "forecastCircle", "radius")),
                  "storm": pick(p, "stormWarning", "radius", "km") or pick(p, "stormArea", "radius", "km")}
            if head is None and (p.get("name") or p.get("typhoonNumber")):
                head = {"id": tc, "number": p.get("typhoonNumber") or tc[2:],
                        "name": pick(p, "name", "jp") or pick(p, "name", "en") or "",
                        "category": pick(p, "category", "jp") or "",
                        "size": "", "strength": ""}
            if head is not None and pos and not head["size"] and not head["strength"]:
                txt = lambda v: (v.get("jp") if isinstance(v, dict) else v) if v not in (None, "-") else ""
                head["size"], head["strength"] = txt(p.get("scale")) or "", txt(p.get("intensity")) or ""
            if pos:
                track.append(pt)
        if head is None:
            head = {"id": tc, "number": tc[2:], "name": "", "category": "", "size": "", "strength": ""}
        head["track"] = track
        head["raw"] = parts[:1]  # the first part as published, for checking the fields
        out.append(head)
        print("typhoon", tc, head["number"], head["name"], head["category"], len(track), "points", track[0] if track else "")
    return out


# 都道府県庁所在地（全国地方公共団体コード）。ポールンロボの観測地点の市区町村コードで引く
CAPITALS = [
    ("01101", "札幌", 43.06, 141.35), ("02201", "青森", 40.82, 140.74), ("03201", "盛岡", 39.70, 141.15),
    ("04101", "仙台", 38.27, 140.87), ("05201", "秋田", 39.72, 140.10), ("06201", "山形", 38.24, 140.36),
    ("07201", "福島", 37.75, 140.47), ("08201", "水戸", 36.34, 140.45), ("09201", "宇都宮", 36.57, 139.88),
    ("10201", "前橋", 36.39, 139.06), ("11101", "さいたま", 35.86, 139.65), ("12101", "千葉", 35.61, 140.12),
    ("13101", "東京", 35.69, 139.75), ("14101", "横浜", 35.44, 139.64), ("15101", "新潟", 37.90, 139.02),
    ("16201", "富山", 36.70, 137.21), ("17201", "金沢", 36.59, 136.63), ("18201", "福井", 36.07, 136.22),
    ("19201", "甲府", 35.66, 138.57), ("20201", "長野", 36.65, 138.18), ("21201", "岐阜", 35.39, 136.72),
    ("22101", "静岡", 34.98, 138.38), ("23101", "名古屋", 35.18, 136.91), ("24201", "津", 34.73, 136.51),
    ("25201", "大津", 35.00, 135.87), ("26101", "京都", 35.02, 135.76), ("27128", "大阪", 34.69, 135.50),
    ("28110", "神戸", 34.69, 135.18), ("29201", "奈良", 34.69, 135.83), ("30201", "和歌山", 34.23, 135.17),
    ("31201", "鳥取", 35.50, 134.24), ("32201", "松江", 35.47, 133.05), ("33101", "岡山", 34.66, 133.93),
    ("34101", "広島", 34.40, 132.46), ("35203", "山口", 34.19, 131.47), ("36201", "徳島", 34.07, 134.56),
    ("37201", "高松", 34.34, 134.04), ("38201", "松山", 33.84, 132.77), ("39201", "高知", 33.56, 133.53),
    ("40133", "福岡", 33.59, 130.40), ("41201", "佐賀", 33.25, 130.30), ("42201", "長崎", 32.74, 129.87),
    ("43101", "熊本", 32.79, 130.74), ("44201", "大分", 33.24, 131.61), ("45201", "宮崎", 31.91, 131.42),
    ("46201", "鹿児島", 31.56, 130.56), ("47201", "那覇", 26.21, 127.68)]
WN = "https://wxtech.weathernews.com/opendata/v1/pollen?citycode={c}&start={d}&end={d}"


def pollen_rows(code, day):
    rows = []
    for line in get(WN.format(c=code, d=day)).splitlines()[1:]:
        f = line.split(",")
        if len(f) >= 3:
            try:
                v = int(float(f[2]))
            except ValueError:
                continue
            if v >= 0:  # -9999 = no data
                rows.append([f[1][11:16] if len(f[1]) > 15 else f[1], v])
    return rows


def pollen(old):
    now = datetime.now(JST)
    if not (2 <= now.month <= 5):
        # 季節外：観測はない。地点コードが使えるかを過去の日付で1件だけ確かめてログに残す
        try:
            r = pollen_rows("13101", "20250315")
            print("pollen off-season; probe Tokyo 2025-03-15:", len(r), "hours", r[:3])
        except Exception as e:
            print("pollen off-season; probe failed:", e)
        return {"season": False, "updated": int(time.time())}
    if old and old.get("season") and old.get("date") == now.strftime("%Y%m%d") and time.time() - old.get("updated", 0) < 3600:
        print("pollen: keeping the copy from", datetime.fromtimestamp(old["updated"], JST).strftime("%H:%M"))
        return old
    day, cities, fails = now.strftime("%Y%m%d"), [], 0
    for code, name, lat, lon in CAPITALS:
        try:
            rows = pollen_rows(code, day)
        except Exception:
            fails += 1
            continue
        cities.append({"code": code, "name": name, "lat": lat, "lon": lon, "hours": rows,
                       "max": max([v for _, v in rows], default=None), "sum": sum(v for _, v in rows)})
    print("pollen", day, len(cities), "cities,", fails, "failed; Tokyo:", next((c for c in cities if c["code"] == "13101"), None))
    if not cities:
        raise RuntimeError("no pollen data")
    return {"season": True, "date": day, "updated": int(time.time()), "cities": cities}


for name, fn in (("typhoon.json", lambda: {"updated": int(time.time()), "items": typhoons()}),
                 ("pollen.json", lambda: pollen(prev("pollen.json")))):
    try:
        save(name, fn())
    except Exception as e:
        print(name, "failed:", e)
        old = prev(name)
        if old is not None:
            save(name, old)
