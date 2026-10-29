"""data/posts.csv を集計して Markdown の表を出す。

数字は必ずこのスクリプトで出し、手で書き換えない（調査担当・結果追跡担当の共通ルール）。

  python3 rakuten/tools/summarize.py --top 10              # 反応のよかった投稿
  python3 rakuten/tools/summarize.py --by hook_type        # 冒頭の型ごと
  python3 rakuten/tools/summarize.py --by genre --since 2026-09-01
  python3 rakuten/tools/summarize.py --post R0012          # 1投稿の推移
"""
import argparse
import csv
from collections import defaultdict
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "posts.csv"


def num(value):
    try:
        return float(str(value).replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def load(path):
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp932"):  # 楽天の管理画面CSVは Shift_JIS のことがある
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    return list(csv.DictReader(text.splitlines()))


def latest_per_post(rows):
    """同じ post_id が複数時点あるときは、いちばん新しい measured_at だけ使う。"""
    latest = {}
    for r in rows:
        key = r["post_id"]
        if key not in latest or r["measured_at"] > latest[key]["measured_at"]:
            latest[key] = r
    return list(latest.values())


def cvr(orders, clicks):
    return f"{orders / clicks:.1%}" if clicks else "-"


def table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", type=Path, default=CSV_PATH)
    p.add_argument("--since", help="posted_at がこの日付以降（YYYY-MM-DD）")
    p.add_argument("--by", help="この列でまとめる（genre, hook_type, channel, price_band …）")
    p.add_argument("--top", type=int, help="売上上位 N 件")
    p.add_argument("--post", help="1投稿の時点ごとの推移")
    args = p.parse_args()

    rows = load(args.csv)
    if args.since:
        rows = [r for r in rows if r["posted_at"] >= args.since]
    if not rows:
        print("データがありません（data/posts.csv に行を追加してください）")
        return

    if args.post:
        hist = sorted((r for r in rows if r["post_id"] == args.post), key=lambda r: r["measured_at"])
        print(table(
            ["時点", "クリック", "成約", "CVR", "売上(円)", "いいね", "コレ!"],
            [[r["measured_at"], int(num(r["clicks"])), int(num(r["orders"])),
              cvr(num(r["orders"]), num(r["clicks"])), int(num(r["revenue_yen"])),
              int(num(r["likes"])), int(num(r["collects"]))] for r in hist],
        ))
        return

    rows = latest_per_post(rows)
    print(f"対象：{len(rows)}投稿（各投稿の最新時点）\n")

    if args.by:
        groups = defaultdict(list)
        for r in rows:
            groups[r.get(args.by) or "(空欄)"].append(r)
        out = []
        for key, rs in groups.items():
            clicks = sum(num(r["clicks"]) for r in rs)
            orders = sum(num(r["orders"]) for r in rs)
            revenue = sum(num(r["revenue_yen"]) for r in rs)
            out.append([key, len(rs), int(clicks), int(clicks / len(rs)), int(orders),
                        cvr(orders, clicks), int(revenue), int(revenue / len(rs))])
        out.sort(key=lambda row: row[6], reverse=True)
        print(table([args.by, "投稿数", "クリック計", "クリック/投稿", "成約計", "CVR",
                     "売上計(円)", "売上/投稿(円)"], out))
        return

    rows.sort(key=lambda r: (num(r["revenue_yen"]), num(r["clicks"])), reverse=True)
    if args.top:
        rows = rows[: args.top]
    print(table(
        ["post_id", "商品", "ジャンル", "冒頭の型", "クリック", "成約", "CVR", "売上(円)"],
        [[r["post_id"], r["item_name"], r["genre"], r["hook_type"], int(num(r["clicks"])),
          int(num(r["orders"])), cvr(num(r["orders"]), num(r["clicks"])),
          int(num(r["revenue_yen"]))] for r in rows],
    ))


if __name__ == "__main__":
    main()
