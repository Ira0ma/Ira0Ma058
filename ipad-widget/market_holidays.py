"""Writes market_holidays.json: the main US (NYSE) and UK (London Stock Exchange) market holidays, last year to
next year, worked out from the published rules (no outside source). One-off closures (state funerals, coronations)
and early closes are not in it, so the desk calls these days a guide (目安).

{"2026-11-26": [["US", "感謝祭"]], "2026-12-25": [["US", "クリスマス"], ["UK", "クリスマス"]], ...}
"""
import json
import sys
from datetime import date, timedelta


def easter(y):  # Anonymous Gregorian algorithm
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    return date(y, month, (h + l - 7 * m + 114) % 31 + 1)


def nth(y, m, wd, n):  # n-th weekday (Mon=0) of a month; n=-1 for the last
    if n > 0:
        d = date(y, m, 1)
        d += timedelta((wd - d.weekday()) % 7)
        return d + timedelta(7 * (n - 1))
    d = date(y, m + 1, 1) - timedelta(1) if m < 12 else date(y, 12, 31)
    return d - timedelta((d.weekday() - wd) % 7)


def us_observed(d):  # NYSE: Saturday -> Friday before, Sunday -> Monday after
    return d - timedelta(1) if d.weekday() == 5 else d + timedelta(1) if d.weekday() == 6 else d


def us(y):
    out = []
    ny = date(y, 1, 1)
    if ny.weekday() != 5:  # NYSE does not close on the Friday before a Saturday New Year's Day
        out.append((us_observed(ny), "元日"))
    out += [(nth(y, 1, 0, 3), "キング牧師記念日"), (nth(y, 2, 0, 3), "大統領の日"), (easter(y) - timedelta(2), "聖金曜日"),
            (nth(y, 5, 0, -1), "戦没将兵追悼記念日")]
    if y >= 2022:
        out.append((us_observed(date(y, 6, 19)), "ジューンティーンス"))
    out += [(us_observed(date(y, 7, 4)), "独立記念日"), (nth(y, 9, 0, 1), "レイバーデー"), (nth(y, 11, 3, 4), "感謝祭"),
            (us_observed(date(y, 12, 25)), "クリスマス")]
    return out


def uk(y):
    out = []
    ny = date(y, 1, 1)
    out.append((ny + timedelta({5: 2, 6: 1}.get(ny.weekday(), 0)), "元日"))
    e = easter(y)
    out += [(e - timedelta(2), "聖金曜日"), (e + timedelta(1), "イースターマンデー"), (nth(y, 5, 0, 1), "アーリーメイ・バンクホリデー"),
            (nth(y, 5, 0, -1), "スプリング・バンクホリデー"), (nth(y, 8, 0, -1), "サマー・バンクホリデー")]
    xmas, box = date(y, 12, 25), date(y, 12, 26)
    if xmas.weekday() == 5:    # Saturday: both move to Monday 27 and Tuesday 28
        xmas, box = date(y, 12, 27), date(y, 12, 28)
    elif xmas.weekday() == 6:  # Sunday: Boxing Day stays on Monday 26, Christmas moves to Tuesday 27
        xmas = date(y, 12, 27)
    elif box.weekday() == 5:   # Christmas on Friday: Boxing Day moves to Monday 28
        box = date(y, 12, 28)
    out += [(xmas, "クリスマス"), (box, "ボクシングデー")]
    return out


def build(years):
    days = {}
    for y in years:
        for mk, f in (("US", us), ("UK", uk)):
            for d, name in f(y):
                days.setdefault(d.isoformat(), []).append([mk, name])
    return dict(sorted(days.items()))


if __name__ == "__main__":
    y = date.today().year
    data = build(range(y - 1, y + 2))
    json.dump(data, open(sys.argv[1] if len(sys.argv) > 1 else "market_holidays.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(data), "market holiday dates")
