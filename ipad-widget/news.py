"""Recent remarks by central bankers and officials, for the GOLD and USD/JPY pages (news.json).

Searches Google News (Japanese) per speaker group, keeps the last 48 hours, and tags each headline with a
rough tone from its wording (hawkish, dovish, intervention warning) and what that tone usually does to
USD/JPY and gold. The tone is a keyword reading of the headline, not of the speech itself.

Usage: python3 news.py OUT.json [PREV.json]   (keeps PREV when every search fails)
"""
import email.utils
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "Mozilla/5.0 (TradeDeskWidget)"}
HOURS = 48
# group: (search words, the pages it matters to)
GROUPS = {
    "FRB": ("パウエル OR FRB議長 OR FRB理事 OR FOMC OR 米地区連銀総裁", ("gold", "usdjpy")),
    "米政権": ("トランプ 利下げ OR トランプ ドル OR 米財務長官 OR ベッセント", ("gold", "usdjpy")),
    "日銀": ("植田総裁 OR 日銀総裁 OR 日銀副総裁 OR 日銀審議委員", ("usdjpy",)),
    "財務省": ("為替介入 OR 財務相 為替 OR 財務官 為替 OR 三村財務官", ("usdjpy", "gold")),
    "ECB・その他": ("ラガルド OR ECB総裁 OR 英中銀総裁 OR 中国人民銀行 総裁", ("gold", "usdjpy")),
}
TONES = [  # first match wins
    ("intervention", ("介入", "過度な変動", "投機的", "憂慮", "緊張感", "断固たる", "あらゆる措置")),
    ("hawkish", ("利上げ", "引き締め", "タカ派", "インフレ警戒", "インフレ懸念", "利下げ慎重", "利下げに慎重", "早期利下げ否定")),
    ("dovish", ("利下げ", "緩和", "ハト派", "景気下支え", "利下げ示唆", "利下げ支持", "利下げ要求")),
]
# what the tone tends to do: (USD/JPY, gold)
EFFECT = {
    ("FRB", "hawkish"): ("ドル高（ドル円↑）", "金↓"), ("FRB", "dovish"): ("ドル安（ドル円↓）", "金↑"),
    ("米政権", "dovish"): ("ドル安（ドル円↓）", "金↑"), ("米政権", "hawkish"): ("ドル高（ドル円↑）", "金↓"),
    ("日銀", "hawkish"): ("円高（ドル円↓）", ""), ("日銀", "dovish"): ("円安（ドル円↑）", ""),
    ("財務省", "intervention"): ("円高警戒（ドル円↓）", ""),
}


def search(words):
    q = urllib.parse.quote(f"({words}) when:2d")
    url = f"https://news.google.com/rss/search?q={q}&hl=ja&gl=JP&ceid=JP:ja"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        root = ET.fromstring(r.read())
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src = (it.findtext("source") or "").strip()
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3]
        try:
            t = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp())
        except Exception:
            continue
        yield {"t": t, "title": title, "source": src, "link": it.findtext("link") or ""}


def tone(title):
    if "利下げ" in title and any(w in title for w in ("慎重", "否定", "見送", "急がない")):
        return "hawkish"  # "cautious about cutting" reads hawkish although it says 利下げ
    if "利上げ" in title and any(w in title for w in ("慎重", "否定", "見送", "急がない")):
        return "dovish"
    for name, words in TONES:
        if any(w in title for w in words):
            return name
    return ""


def main():
    out_path = sys.argv[1]
    prev = []
    if len(sys.argv) > 2:
        try:
            prev = json.load(open(sys.argv[2])).get("items", [])
        except Exception:
            pass
    items, seen, ok = [], set(), 0
    cutoff = time.time() - HOURS * 3600
    for group, (words, pages) in GROUPS.items():
        try:
            rows = list(search(words))
            ok += 1
        except Exception as e:
            print(group, "search failed:", e)
            continue
        for r in rows:
            key = re.sub(r"\W", "", r["title"])[:40]
            if r["t"] < cutoff or key in seen:
                continue
            seen.add(key)
            tn = tone(r["title"])
            uj, gold = EFFECT.get((group, tn), ("", ""))
            items.append({**r, "who": group, "pages": list(pages), "tone": tn, "usdjpy": uj, "gold": gold})
        time.sleep(1)
    if not ok:
        print("every search failed; keeping the previous headlines")
        items = [i for i in prev if i.get("t", 0) >= cutoff]
    items.sort(key=lambda i: -i["t"])
    json.dump({"updated": int(time.time()), "items": items[:60]}, open(out_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(items), "headlines;", sum(1 for i in items if i["tone"]), "with a tone")
    for i in items[:8]:
        print(time.strftime("%m/%d %H:%M", time.gmtime(i["t"] + 9 * 3600)), i["who"], i["tone"] or "-", i["title"][:60])


if __name__ == "__main__":
    main()
