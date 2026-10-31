"""One-time conversion of the learning handoff into the desk's book data.

Reads the handoff sources and writes:
  ipad-widget/learn/{pattern,usdjpy,fvg}.json   app data (edit these from now on)
  ipad-widget/learn/fig/{pattern,usdjpy,fvg}/   figures (SVG, fonts/background unified)
  ipad-widget/learn-src/                         copies of the source JSON/MD/HTML (not published)
  ipad-widget/learn-src/MAPPING.md               source item -> app destination table
"""
import json, os, re, shutil, sys

H = sys.argv[1]          # handoff dir
W = sys.argv[2]          # ipad-widget dir
OUT, FIG, SRC = f"{W}/learn", f"{W}/learn/fig", f"{W}/learn-src"
for d in (OUT, SRC, f"{FIG}/pattern", f"{FIG}/usdjpy", f"{FIG}/fvg"):
    os.makedirs(d, exist_ok=True)
VERSION = "アプリ版 2026-10-30"
FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic",sans-serif'


def fix_svg(s):
    """Unify the figure style: one font stack and one panel colour; keep everything else editable."""
    s = re.sub(r'font-family:[^;}]+', 'font-family:' + FONT, s)
    s = s.replace('fill="#f1f5fa"/>', 'fill="#f4f7f8"/>', 1)
    return s


def copy_fig(src, book, name):
    s = fix_svg(open(src, encoding="utf-8").read())
    alt = (re.search(r'aria-label="([^"]*)"', s) or [None, ""])[1]
    open(f"{FIG}/{book}/{name}", "w", encoding="utf-8").write(s)
    return {"src": f"learn/fig/{book}/{name}", "alt": alt}


def save(name, data):
    json.dump(data, open(f"{OUT}/{name}", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def strip_html(s):
    s = re.sub(r'<br\s*/?>', '\n', s)
    return re.sub(r'<[^>]+>', '', s).strip()


MAP = []  # (source, id, name, destination, how, note)

# ------------------------------------------------------------------ パターン図鑑（ゴールド超初心者版）
gold = json.load(open(f"{H}/01_gold_beginner/patterns-beginner.json", encoding="utf-8"))
ghtml = open(f"{H}/01_gold_beginner/gold-beginner.html", encoding="utf-8").read()


def gsec(sid):
    return re.search(r'<section[^>]*id="%s"[^>]*>(.*?)</section>' % sid, ghtml, re.S).group(1)


def intro_fig(sid, name):
    svg = re.search(r'<svg.*?</svg>', gsec(sid), re.S).group(0)
    if 'xmlns=' not in svg:
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    if '<style>' not in svg:  # the intro figures rely on the page's stylesheet for their text classes
        svg = svg.replace('>', '><style>text{font-family:%s}.axis{font-size:15px;fill:#607481}.point{font-size:16px;font-weight:700;fill:#173042}.lvl{font-size:16px;fill:#a57828}</style>' % FONT, 1)
    p = f"{FIG}/pattern/{name}"
    open(p, "w", encoding="utf-8").write(fix_svg(svg))
    alt = (re.search(r'aria-label="([^"]*)"', svg) or [None, ""])[1]
    return ["fig", f"learn/fig/pattern/{name}", alt]


ALIAS_SPLIT = re.compile(r'[・／]')
FX_REL = {1: ["fx:三尊（ヘッドアンドショルダー）", "fx:ネックライン"], 2: ["fx:逆三尊", "fx:ネックライン"], 3: ["fx:ダブルトップ", "fx:ネックライン"], 4: ["fx:ダブルボトム", "fx:ネックライン"],
          14: ["fx:三角保ち合い"], 15: ["fx:三角保ち合い"], 16: ["fx:三角保ち合い", "pattern:p20", "pattern:p21"], 17: ["fx:レンジ", "fx:サポート", "fx:レジスタンス"],
          18: ["fx:フラッグ・ペナント"], 19: ["fx:フラッグ・ペナント"], 20: ["fx:フラッグ・ペナント", "pattern:p16"], 21: ["fx:フラッグ・ペナント", "pattern:p16"],
          22: ["fx:カップウィズハンドル"], 11: ["pattern:p24"], 12: ["pattern:p25"], 24: ["fx:チャネル", "pattern:p11"], 25: ["fx:チャネル", "pattern:p12"],
          27: ["pattern:p28", "fx:カラカサ・トンカチ"], 28: ["pattern:p27"], 29: ["pattern:p30", "fx:カラカサ・トンカチ"], 30: ["pattern:p29", "fx:流れ星"], 31: ["pattern:p27", "pattern:p30"],
          32: ["fx:十字線", "pattern:p33", "pattern:p34"], 33: ["pattern:p32"], 34: ["pattern:p32"], 35: ["fx:コマ"], 36: ["fx:大陽線・大陰線", "fx:丸坊主"], 37: ["fx:大陽線・大陰線", "fx:丸坊主"],
          38: ["fx:包み足", "pattern:p53"], 39: ["fx:包み足", "pattern:p53"], 40: ["fx:はらみ足", "pattern:p52"], 41: ["pattern:p40", "pattern:p32"], 52: ["pattern:p40"], 53: ["pattern:p38", "pattern:p39"],
          46: ["fx:赤三兵・黒三兵"], 47: ["fx:赤三兵・黒三兵"], 48: ["fx:毛抜き底・毛抜き天井"], 49: ["fx:毛抜き底・毛抜き天井"],
          54: ["pattern:p55"], 55: ["pattern:p56", "pattern:p54"], 56: ["pattern:p55", "pattern:p57"], 57: ["pattern:p55", "pattern:p58"], 58: ["pattern:p59", "pattern:p57"], 59: ["pattern:p58"],
          64: ["fx:エリオット波動", "fx:エリオット波動の戻し"], 65: ["fx:押し目・戻り"], 66: ["fx:レジサポ転換", "fx:ブレイクアウト", "fvg:fvg-10"], 67: ["fx:ダマシ", "fx:ダマシの見分け方", "fx:ch:ゴールドでよくあるダマシ"],
          13: ["pattern:p26"], 26: ["pattern:p13"], 9: ["pattern:p10"], 10: ["pattern:p09"], 68: ["pattern:p69"], 69: ["pattern:p68"]}
# 同じ形でも違うものの区別（元の注意書きに足りない一言だけ）
DIFF = {27: "似た形：首吊り線（p28）は同じ形で上昇の後に出るもの。出た場所で名前と意味が変わる。",
        28: "似た形：ハンマー（p27）は同じ形で下落の後に出るもの。",
        29: "似た形：流れ星（p30）は同じ形で上昇の後に出るもの。",
        30: "似た形：逆ハンマー（p29）は同じ形で下落の後に出るもの。",
        38: "似た形：アウトサイドバー（p53）はヒゲも含めた高値・安値で比べる別の判定。",
        39: "似た形：アウトサイドバー（p53）はヒゲも含めた高値・安値で比べる別の判定。",
        53: "似た形：包み足（p38・p39）は実体（四角）どうしで比べる。アウトサイドバーはヒゲ込みの高値・安値で比べる。",
        40: "似た形：インサイドバー（p52）はヒゲも含めた高値・安値で比べる別の判定。",
        52: "似た形：はらみ足（p40）は実体（四角）どうしで比べる。インサイドバーはヒゲ込みで比べる。",
        16: "似た形：ペナント（p20・p21）は急な動き（旗竿）の直後の小さな三角形。旗竿がなければ対称三角形。",
        20: "似た形：対称三角形（p16）は旗竿がなくてもよい大きめの収束。",
        21: "似た形：対称三角形（p16）は旗竿がなくてもよい大きめの収束。",
        11: "似た形：上昇チャネル（p24）は上下の線がほぼ平行。ウェッジは上下の線が近づく（収束する）。",
        12: "似た形：下降チャネル（p25）は上下の線がほぼ平行。ウェッジは上下の線が近づく（収束する）。",
        24: "似た形：上昇ウェッジ（p11）は上下の線が近づく（収束する）。チャネルはほぼ平行。",
        25: "似た形：下降ウェッジ（p12）は上下の線が近づく（収束する）。チャネルはほぼ平行。"}
FX_SAME = {1: "三尊（ヘッドアンドショルダー）", 2: "逆三尊", 3: "ダブルトップ", 4: "ダブルボトム", 14: "三角保ち合い", 15: "三角保ち合い", 16: "三角保ち合い",
           18: "フラッグ・ペナント", 19: "フラッグ・ペナント", 20: "フラッグ・ペナント", 21: "フラッグ・ペナント", 22: "カップウィズハンドル", 24: "チャネル", 25: "チャネル",
           27: "カラカサ・トンカチ", 29: "カラカサ・トンカチ", 30: "流れ星", 32: "十字線", 35: "コマ", 36: "大陽線・大陰線／丸坊主", 37: "大陽線・大陰線／丸坊主",
           38: "包み足", 39: "包み足", 40: "はらみ足", 46: "赤三兵・黒三兵", 47: "赤三兵・黒三兵", 48: "毛抜き底・毛抜き天井", 49: "毛抜き底・毛抜き天井",
           64: "エリオット波動", 66: "レジサポ転換", 67: "ダマシ", 17: "レンジ"}
LEVEL_NOTE = {"まず覚える": "first", "少し慣れたら": "next", "あとで読む": "later"}

pchap = {}
for it in gold:
    pid = "p%02d" % it["id"]
    aka = [a.strip() for a in ALIAS_SPLIT.split(it.get("alt") or "") if a.strip() and a.strip() != it["name"]]
    fig = copy_fig(f"{H}/01_gold_beginner/{it['svg_file']}", "pattern", f"{pid}.svg")
    more = [["形", it["shape"]], ["成立の確認", it["confirm"]], ["注意", it["caution"]]]
    term = {"id": pid, "no": it["id"], "name": it["name"], "aka": aka, "level": it["level"],
            "simple": it["simple"], "look": it["look"], "wait": it["wait"], "fig": fig, "more": more}
    if it["id"] in DIFF:
        term["diff"] = DIFF[it["id"]]
    if it["id"] in FX_REL:
        term["rel"] = FX_REL[it["id"]]
    pchap.setdefault((it["ch"], it["chapter"]), []).append(term)
    same = FX_SAME.get(it["id"])
    MAP.append(("ゴールド超初心者版", pid, it["name"], f"パターン図鑑 {pid}", "新規（図鑑の正本）" + ("・既存と統合" if same else ""),
                (f"FX用語集「{same}」は短い説明＋図鑑への参照に整理" if same else "") + ("。似た形との違いを追記" if it["id"] in DIFF else "")))

EIGHT = [(17, "床と天井の間を行ったり来たり。"), (3, "Mの形。間の谷を下へ抜けるか。"), (4, "Wの形。間の山を上へ抜けるか。"), (1, "真ん中が高い3つの山。下の目印を見る。"),
         (2, "真ん中が深い3つの谷。上の目印を見る。"), (14, "同じ天井へ、谷を切り上げながら近づく。"), (15, "同じ床へ、山を切り下げながら近づく。"), (31, "片側へ動いたのに戻された、長いヒゲ。")]
gname = {i["id"]: i["name"] for i in gold}
intro = [
    {"id": "g-start", "name": "全部、覚えなくて大丈夫", "guide": True, "blocks": [
        ["p", "最初の目標は、「価格がどこで止まり、どこを超えたら見方が変わるか」を説明できるようになること。すぐに売買する必要はありません。"],
        ["table", ["段階", "やること"], [["1．土台を知る", "このあと4ページで、チャート・ローソク足・床と天井・完成の見方を学ぶ。"],
                                          ["2．8つだけ見る", "レンジ、ダブルトップとボトム、三尊と逆三尊、上昇・下降三角形、ピンバー。"],
                                          ["3．必要なときに引く", "残りの形は辞書として使う。比率や波の数え方は後回しでよい。"]]],
        ["h", "名前より先に、3つの質問"],
        ["ol", ["今までは上がっていた？ 下がっていた？", "何度も止まった場所はどこ？", "その場所を、本当に超えた？"]],
        ["note", "「この形なら必ず上がる・下がる」という形はありません。形の名前は値動きを整理するための道具です。図はすべて説明用の模式図で、濃紺の線＝これまでの動き、金色の線＝見る場所の目印、点線＝その後の動きの一例（予測ではありません）。"]]},
    {"id": "g-chart", "name": "チャートは「価格の足あと」", "guide": True, "blocks": [
        ["p", "時間とともに価格がどう動いたかを並べたもの。右に進むほど新しく、上ほど高く、下ほど安い。"], intro_fig("chart", "intro-chart.svg"),
        ["p", "上へ進んで折り返した場所が「山」、下へ進んで折り返した場所が「谷」。山も谷も前より高ければ、上向きの流れと考えます。"],
        ["p", "時間足は、ローソク足1本にまとめる時間のこと。15分足なら1本が15分。同じ銘柄でも、見る時間の長さで形が変わります。"],
        ["note", "練習：図を左から右へ指でたどり、「山」「谷」と声に出してみましょう。"]], "rel": ["fx:時間足", "fx:トレンド", "fx:ダウ理論"]},
    {"id": "g-candles", "name": "ローソク足は「4つの価格」", "guide": True, "blocks": [
        ["p", "ある時間の「始め・終わり・いちばん高い・いちばん安い」を1本にまとめた記号です。"], intro_fig("candles", "intro-candles.svg"),
        ["table", ["名前", "やさしい意味"], [["始値／終値", "その時間の始めの価格／終わりの価格。"], ["高値／安値", "その時間で最も高かった価格／最も安かった価格。"],
                                            ["実体", "太い四角。始めと終わりの間。"], ["ヒゲ", "細い線。四角から高値・安値まで伸びた部分。"]]],
        ["note", "この図鑑では緑が陽線（上がって終わる）、赤が陰線（下がって終わる）。アプリや業者によって色は違います。陽線でも、前の足より高いとは限りません。"]], "rel": ["fx:ローソク足", "fx:ヒゲ", "fx:確定足"]},
    {"id": "g-levels", "name": "よく止まる場所は「床」と「天井」", "guide": True, "blocks": [
        ["p", "何度も下げ止まるあたりが「床」（支持帯）、何度も上げ止まるあたりが「天井」（抵抗帯）です。"], intro_fig("levels", "intro-levels.svg"),
        ["p", "ぴったり同じ価格で止まる必要はありません。少し幅のある場所として見ます。何度試しても、必ず強くなるわけではありません。"],
        ["p", "天井を上へ抜け、その場所まで戻ったときに支えられると、以前の天井が床になったと考えます。必ず起こる現象ではありません。"]], "rel": ["fx:サポート", "fx:レジスタンス", "fx:レジサポ転換"]},
    {"id": "g-confirm", "name": "「似ている」と「完成」は別", "guide": True, "blocks": [
        ["p", "ダブルボトムを例にします。谷が2つあるだけなら、まだ途中。間の山を超えるかどうかが、次の確認点です。"], intro_fig("confirm", "intro-confirm.svg"),
        ["ol", ["谷が2つあることを見る。", "その間の山に目印を置く。", "目印より上へ進むか待つ。", "超えた後に戻されないかも確認する。"]],
        ["p", "細いヒゲだけが線を超えて、終わると内側に戻ることもあります。「1本が終わった価格（終値）で確かめる」など、判定方法を先に決めておきます。"],
        ["note", "完成条件を満たしても、失敗することはあります。「超えたら絶対に上がる」という意味ではありません。"]], "rel": ["fx:確定足", "fx:ダマシ"]},
    {"id": "g-eight", "name": "最初は、この8つだけ", "guide": True, "blocks": [
        ["p", "すべてを順番に読む必要はありません。次の順に「形」と「待つ場所」だけ覚えましょう。"],
        ["links", [["pattern:p%02d" % n, "%02d %s" % (n, gname[n]), t] for n, t in EIGHT]],
        ["note", "「名前を言える」より、「図のどこを見て、次に何を待つか」を説明できれば十分です。比率計算がある形は、あとで読んで大丈夫。"]]},
]
for g in intro:
    MAP.append(("ゴールド超初心者版", g["id"].replace("g-", "html#"), g["name"], f"パターン図鑑 {g['id']}", "新規（導入）", "アプリ向けに文を整理"))

after = [
    {"id": "g-gold", "name": "ゴールドで見るとき", "guide": True, "blocks": [
        ["p", "ここだけはゴールド固有の話です。図鑑の形そのものは銘柄に共通ですが、単位・コスト・動き方は銘柄ごとに違います。"],
        ["p", "ゴールドは主にXAU/USDという表示で、一般に金1トロイオンス（約31.1グラム）の価格を米ドルで表します。"],
        ["ol", ["ニュースで急に動く：米国の物価・雇用の発表やFOMCなどで急変することがあります。発表予定を確認し、慣れるまでは観察にとどめる選択もできます。",
                "取引量が大きいと損失も大きい：1ロットが何オンスかは業者ごとに確認が必要です。形がきれいでも、大きな量で取引する理由にはなりません。",
                "取引にはコストがある：スプレッドのほか、手数料や持ち越し費用がかかる場合があります。急変時は思った価格で売買できないことがあります。",
                "失敗したらどうするかを先に決める：逆指値を入れても、急変時に指定価格で決済できる保証はありません。"]],
        ["note", "形だけで売買方向や利益は決まりません。ゴールドのよくあるダマシはFX用語集の第11章にまとめています。"]],
     "rel": ["fx:XAUUSD", "fx:トロイオンス", "fx:ch:ゴールドでよくあるダマシ"]},
    {"id": "g-usdjpy", "name": "ドル円で見るとき", "guide": True, "blocks": [
        ["p", "形の見方は同じでも、ドル円では値幅の単位（pips）や、日米の金利・指標・為替介入への警戒など、見る材料が変わります。"],
        ["p", "ドル円での具体例は「ドル円入門」の第3章に、ドル円の数字（pips・数量・損益）は第2章にまとめています。"],
        ["links", [["usdjpy:usdjpy-22", "チャートの名前より環境", "形・場所・時間をひと組で考える"], ["usdjpy:usdjpy-07", "pipsの読み方", "ドル円では一般に1pip＝0.01円"],
                   ["usdjpy:usdjpy-27", "為替介入をどう考える？", "急落だけで介入と断定しない"]]]]},
    {"id": "g-practice", "name": "3問で、おさらい", "guide": True, "blocks": [
        ["qa", [["Wのような谷が2つできました。これだけで、ダブルボトムが完成したといえますか？", "いいえ。間の山を超えるか確認が必要です。"],
                ["大きな陽線が出ました。次の足も必ず上がりますか？", "いいえ。大きな陽線は、その時間に上がった事実を示すだけです。"],
                ["支持線を一瞬割り、すぐ戻りました。割った瞬間に、本物の下抜けと断定できますか？", "いいえ。一時的な下抜けの後、元の範囲へ戻ることがあります。"]]],
        ["h", "チャート練習の3ステップ"],
        ["ol", ["右側を隠し、その時点までの動きだけを見る。", "床と天井、候補の形、完成に必要な条件を書く。", "右側を少しずつ開き、成功例と失敗例を両方記録する。"]],
        ["note", "未来が見える状態だと、形が簡単に見つかってしまいます。見送りも立派な練習結果です。"]]},
    {"id": "g-terms", "name": "困ったら、この言葉だけ", "guide": True, "blocks": [
        ["table", ["言葉", "やさしい意味"], [["トレンド", "価格が上向き・下向きに進む流れ。"], ["反転／継続", "流れが反対になること／同じ方向へ続くこと。"],
                                         ["押し／戻り", "上昇の途中の一時下落／下落の途中の一時上昇。"], ["支持／抵抗", "下で支える床／上で止める天井に当たる価格帯。"],
                                         ["ネックライン", "三尊などで、形の完成を確かめるための目印の線。"], ["ブレイク", "目印の線や価格帯を上や下へ抜けること。"],
                                         ["リテスト", "抜けた場所へ戻り、その場所での反応を見ること。"], ["ダマシ", "抜けても続かず、元の範囲へ戻るような動き。"],
                                         ["フィボナッチ比率", "値幅の割合を測るための目盛り。未来を保証する数字ではない。"]]],
        ["p", "各項目の「くわしい判定メモ」を開くと、元の専門的な条件も読めます。分からない言葉が出たら、そこで止まっても大丈夫です。"],
        ["note", "より詳しい理論の参考：John J. Murphy『Technical Analysis of the Financial Markets』、Steve Nison『Japanese Candlestick Charting Techniques』、Scott M. Carney『Harmonic Trading』シリーズ。"]],
     "rel": ["fx:トレンド", "fx:押し目・戻り", "fx:ネックライン", "fx:ブレイクアウト", "fx:ダマシ", "fx:フィボナッチ・リトレースメント"]},
]
for g, how in zip(after, ["新規（銘柄別の注意）", "新規（銘柄別の案内）", "新規（練習）", "統合（巻末の用語）"]):
    MAP.append(("ゴールド超初心者版", g["id"].replace("g-", "html#"), g["name"], f"パターン図鑑 {g['id']}", how,
                {"g-usdjpy": "元資料にないドル円向け案内。ドル円入門へ参照", "g-terms": "各語はFX用語集へも関連リンク"}.get(g["id"], "元のゴールド固有の注意をこの章に限定")))

CH_S = {1: "山と谷で、流れが変わる形", 2: "休憩してから、同じ向きへ進む形", 3: "1〜3本の足で読む形", 4: "比率と波で読む形（あとで読む）"}
CH_SHORT = {1: "反転", 2: "持ち合い・継続", 3: "ローソク足", 4: "比率・波動"}
pattern = {"id": "pattern", "title": "パターン図鑑", "en": "CHART PATTERNS", "icon": "📗", "version": VERSION + "（元資料：ゴールド超初心者版 第1版をアプリ向けに編集）",
           "lead": "まず「はじめに」の6ページ、次に基本の8つ。残りは辞書として引けば十分です。",
           "levels": {"まず覚える": "first", "少し慣れたら": "next", "あとで読む": "later"},
           "chapters": [{"t": "はじめに", "s": "チャートの基礎と、最初に覚える8つ", "short": "はじめに", "terms": intro}] +
                       [{"t": t, "s": CH_S[c], "short": CH_SHORT[c], "terms": pchap[(c, t)]} for c, t in sorted(pchap)] +
                       [{"t": "銘柄別の注意点", "s": "ゴールドとドル円で見るとき", "short": "銘柄別", "terms": after[:2]},
                        {"t": "練習と用語", "s": "おさらいの3問と、困ったときの言葉", "short": "練習・用語", "terms": after[2:]}]}
save("pattern.json", pattern)

# ------------------------------------------------------------------ ドル円入門
les = json.load(open(f"{H}/02_usdjpy_beginner/lessons.json", encoding="utf-8"))
ufm = {x["id"]: x for x in json.load(open(f"{H}/02_usdjpy_beginner/front-back-matter.json", encoding="utf-8"))}
U_CH = {1: ("ドル円に慣れる", "1ドル＝何円・円高円安・ローソク足", "慣れる"), 2: ("数字を味方にする", "pips・損益・数量・証拠金・コスト", "数字"),
        3: ("形を読み取る", "床と天井から基本の形へ（形の詳しい定義はパターン図鑑）", "形"), 4: ("動く理由を知る", "金利・中央銀行・指標・介入・時間帯", "材料"),
        5: ("お金を守る", "許容損失・数量・損切り・ロスカット", "資金管理"), 6: ("見る順番を作る", "取引前の確認・シナリオ・記録", "手順"), 7: ("練習で確かめる", "クイズと計算の総合練習", "練習")}
U_REL = {1: ["fx:通貨ペア", "fx:基軸通貨・決済通貨"], 2: ["fx:円高・円安"], 3: ["fx:ロング（買い）", "fx:ショート（売り）"], 4: ["fx:ローソク足", "fx:ヒゲ", "pattern:g-candles"],
         5: ["fx:時間足", "fx:マルチタイムフレーム分析"], 6: ["fx:トレンド", "fx:ダウ理論", "fx:レンジ"], 7: ["fx:pips"], 8: ["fx:確定損益"], 9: ["fx:ロット"],
         10: ["fx:証拠金", "fx:レバレッジ", "fx:必要証拠金"], 11: ["fx:Bid・Ask", "fx:スプレッド", "fx:スリッページ"], 12: ["fx:スワップポイント"],
         13: ["pattern:p17", "fx:サポート", "fx:レジスタンス"], 14: ["pattern:p03"], 15: ["pattern:p04"], 16: ["pattern:p01", "pattern:p02", "fx:ネックライン"],
         17: ["pattern:p14", "pattern:p15", "pattern:p16"], 18: ["pattern:p18", "pattern:p19", "pattern:p20", "pattern:p21"], 19: ["pattern:p31", "pattern:p27"],
         20: ["pattern:p66", "fx:レジサポ転換"], 21: ["pattern:p67", "fx:確定足", "fx:ダマシの見分け方"], 22: ["fx:マルチタイムフレーム分析", "pattern:g-usdjpy"],
         23: ["fx:政策金利", "eco:金利", "eco:長期金利と短期金利"], 24: ["fx:日銀金融政策決定会合", "fx:FOMC", "fx:タカ派・ハト派"], 25: ["fx:CPI", "fx:PCE"], 26: ["fx:米雇用統計"],
         27: ["fx:為替介入"], 28: ["fx:東京・ロンドン・NY時間", "fx:サマータイム"], 29: ["fx:リスクオン・リスクオフ", "eco:群集心理"], 30: ["fx:許容リスク", "fx:資金管理"],
         31: ["fx:許容リスク", "usdjpy:usdjpy-41"], 32: ["fx:損切り", "fx:逆指値注文", "fx:スリッページ"], 33: ["fx:ロスカット", "fx:証拠金維持率", "fx:ゼロカット"],
         34: ["fx:リスクリワード比", "fx:勝率", "eco:期待値"], 37: ["fx:バックテスト"], 39: ["usdjpy:usdjpy-40"], 40: ["usdjpy:usdjpy-39"], 41: ["usdjpy:usdjpy-31"]}
U_HOW = {1: "統合", 2: "統合", 3: "統合", 4: "統合", 5: "統合", 6: "統合", 7: "統合", 8: "新規", 9: "統合", 10: "統合", 11: "統合", 12: "統合",
         13: "統合", 14: "参照＋ドル円の例", 15: "参照＋ドル円の例", 16: "参照＋ドル円の例", 17: "参照＋ドル円の例", 18: "参照＋ドル円の例", 19: "参照＋ドル円の例",
         20: "参照＋ドル円の例", 21: "参照＋ドル円の例", 22: "新規", 23: "統合", 24: "統合", 25: "統合", 26: "統合", 27: "統合", 28: "統合", 29: "統合",
         30: "統合", 31: "新規（計算練習つき）", 32: "統合", 33: "統合", 34: "統合", 35: "新規", 36: "新規", 37: "新規", 38: "新規", 39: "新規", 40: "新規", 41: "新規（計算練習つき）", 42: "新規"}
uch = {}
for l in les:
    n = l["number"]
    fig = copy_fig(f"{H}/02_usdjpy_beginner/{l['figure_file']}", "usdjpy", os.path.basename(l["figure_file"]))
    term = {"id": l["id"], "no": n, "name": l["title"], "level": l["level"], "simple": l["summary"], "body": l["body"],
            "example": l["example"], "trap": l["trap"], "takeaway": l["takeaway"], "fig": fig}
    if n in U_REL:
        term["rel"] = U_REL[n]
    if n in (31, 41):
        term["calc"] = "sizing" if n == 31 else "profit"
    if n == 39:
        term["hide"] = "答えは次のレッスン（40）にあります。先に理由を声に出してみましょう。"
    uch.setdefault(l["chapter"], []).append(term)
    rel = [r for r in U_REL.get(n, []) if not r.startswith("usdjpy:")]
    MAP.append(("ドル円入門", l["id"], l["title"], f"ドル円入門 {l['id']}", U_HOW[n],
                ("形の定義はパターン図鑑へ参照、ドル円の例と注意は残す" if U_HOW[n].startswith("参照") else "") +
                (("関連：" + "・".join(r.split(":", 1)[1] for r in rel)) if rel else "")))
uintro = [
    {"id": "u-start", "name": "全部、いっぺんに覚えなくて大丈夫", "guide": True, "blocks": [
        ["p", "目標は、ドル円を見て「今、何が起きているか」「次にどこを確かめるか」を自分の言葉で説明できるようになること。実際の売買を急ぐ必要はありません。"],
        ["h", "最初の到達点"],
        ["ol", ["ドル円が上がると円安、と説明できる。", "pipsを円の値幅へ直せる。", "数量によって損益が変わる、と分かる。", "形が似ているだけでは完成でない、と分かる。"]],
        ["table", ["段階", "読む場所"], [["まず土台", "第1章と第2章の最初。価格・円高円安・pips・損益。"], ["図で理解", "第3章。床と天井から基本の形へ。"],
                                         ["必要なときに", "第4章で材料、第5章で資金管理、第6章で見る順番。"], ["確かめる", "第7章の問題と計算。できなかったところへ戻る。"]]],
        ["note", "各レッスンは「ひと言でいうと → 図 → 説明 → 具体例 → よくある勘違い → 今日のひとこと」の順。価格・数値・図は説明用で、現在の相場や売買推奨を示しません。"]]},
    {"id": "u-map", "name": "この3つを、混ぜない", "guide": True, "blocks": [
        ["p", "相場を見るときは、仕組み・判断・資金管理を分けて考えると、混乱が減ります。"],
        ["table", ["分けるもの", "確認すること"], [["仕組み", "ドル円の数字、円高円安、pips、取引数量。"], ["判断", "価格帯、形の完成、指標予定。未来を当てる保証ではない。"],
                                              ["資金管理", "失敗したらいくら失うか。形がきれいでも省略しない。"]]],
        ["p", "一度に大きな取引をするより、数字の意味を確かめ、過去の例を記録していく方が、学んだ内容を点検しやすくなります。"],
        ["note", "制度の説明は主に国内個人向け店頭FXが対象です。法人、取引所FX、海外業者、CFDなどへ同じ条件をそのまま当てはめないでください。"]]},
]
uback = [
    {"id": "u-glossary", "name": "迷ったら、ミニ辞典", "guide": True, "blocks": [
        ["table", ["言葉", "意味"], [["USD/JPY", "1米ドルの価格を日本円で示す通貨ペア。"], ["pip", "ドル円では通常0.01円。最小表示単位とは別。"],
                                    ["ポジション／決済", "保有中の取引／その取引を終えること。"], ["実体／ヒゲ", "始値と終値の間の四角／そこから高値・安値へ伸びる線。"],
                                    ["支持／抵抗", "下で支えやすい帯／上で止めやすい帯。"], ["ブレイク／リテスト", "価格帯の突破／突破した水準への戻りでの再確認。"],
                                    ["Bid／Ask", "自分が売れる価格／自分が買える価格。"], ["スプレッド／滑り", "BidとAskの差／想定価格と約定価格のずれ。"],
                                    ["証拠金／ロスカット", "取引維持の担保／業者の基準に基づく強制決済。"], ["FRB／FOMC", "米国の中央銀行制度／その金融政策を決める委員会。"],
                                    ["織り込み", "見込まれる材料が、すでに価格に反映されていること。"]]],
        ["note", "もっと詳しい言葉はFX用語集・経済用語集で引けます（上の🔍検索から）。"]]},
    {"id": "u-worksheet", "name": "書き込むだけの練習シート", "guide": True, "blocks": [
        ["p", "実際の売買をしなくても使えます。右側の未来を隠したチャートで、同じ条件を判定してみましょう。"],
        ["table", ["記録欄", "書くこと"], [["日時・時間足", ""], ["指標・会見の予定", ""], ["上位足の流れ", "上向き ／ 下向き ／ 横ばい ／ 不明"], ["上の抵抗・下の支持", ""],
                                         ["候補の形と完成条件", ""], ["無効・見送りの条件", ""], ["許容損失・幅・数量", "＿円 ／ ＿pips ／ ＿ドル"], ["コストと滑りの想定", ""],
                                         ["結果とルールの遵守", ""], ["次に確かめること", ""]]],
        ["note", "勝った例だけを集めず、失敗例と見送りも残してください。後から条件を変えた場合は、別のルールとして記録します。"]]},
    {"id": "u-sources", "name": "参考資料と更新について", "guide": True, "blocks": [
        ["p", "制度に関する説明は、次の公式資料を参照しています。予定・制度・業者の条件は更新されるため、利用時にも原典を確認してください。"],
        ["links", [["https://www.fsa.go.jp/ordinary/iwagai/", "金融庁：いわゆる外国為替証拠金取引について", "証拠金・25倍上限・ロスカットとリスク"],
                   ["https://www.boj.or.jp/about/education/oshiete/intl/g19.htm", "日本銀行：為替介入とは何ですか？", "財務大臣が決定し、日銀が代理人として執行"],
                   ["https://www.bls.gov/schedule/news_release/cpi.htm", "米BLS：CPI公表予定", "CPIの公式発表予定"],
                   ["https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "FRB：FOMC会合・声明", "最新の会合予定・声明・会見資料"]]],
        ["note", "全図オリジナル模式図。価格・金額・比率の例は、現在の相場、過去の実績、推奨取引を示しません。取引条件は契約締結前交付書面や業者の説明で確認してください。利益や指定価格での決済は保証されず、証拠金を上回る損失が生じる場合もあります。"],
        ["p", "元資料：はじめてのドル円 第1版（2026年10月30日）。このアプリ版は元資料の文を編集しているため、PDF・EPUB版と表現が異なる場合があります。"]]},
]
for g in uintro + uback:
    MAP.append(("ドル円入門", g["id"].replace("u-", "matter#"), g["name"], f"ドル円入門 {g['id']}", "新規（導入・付録）", "目次（contents1・2）はアプリの目次で代替。表紙はアプリの表紙で代替"))
usdjpy = {"id": "usdjpy", "title": "ドル円入門", "en": "USD/JPY BASICS", "icon": "💴", "version": VERSION + "（元資料：はじめてのドル円 第1版をアプリ向けに編集）",
          "lead": "仕組み → 数字 → チャート → 材料 → 資金管理 → 日々の手順 → 練習の順に読めます。",
          "chapters": [{"t": "はじめに", "s": "読み方と、混ぜない3つのこと", "short": "はじめに", "terms": uintro}] +
                      [{"t": U_CH[c][0], "s": U_CH[c][1], "short": U_CH[c][2], "terms": uch[c]} for c in sorted(uch)] +
                      [{"t": "巻末資料", "s": "ミニ辞典・練習シート・参考資料", "short": "巻末", "terms": uback}]}
save("usdjpy.json", usdjpy)

# ------------------------------------------------------------------ FVG詳説
fl = json.load(open(f"{H}/03_fvg_only/lessons.json", encoding="utf-8"))
F_CH = [("FVGの見つけ方", "3本の条件・強気と弱気・できていない例", "見つけ方", range(1, 6)), ("帯の計算と戻り方", "幅と中央・5段階・確定・失敗", "計算・戻り", range(6, 10)),
        ("ルールと観察", "無効と反転・時間足・観察の順番", "ルール", range(10, 13)), ("練習問題", "数字で判定する", "練習", range(13, 15))]
F_REL = {1: ["fx:ローソク足", "fx:ヒゲ"], 6: ["fx:pips"], 8: ["fx:確定足"], 10: ["pattern:p66", "fx:レジサポ転換"], 11: ["fx:マルチタイムフレーム分析", "fx:時間足"],
         12: ["usdjpy:usdjpy-35", "usdjpy:usdjpy-22"], 13: ["fvg:fvg-14"], 14: ["fvg:fvg-13"]}
fby = {}
for l in fl:
    n = l["number"]
    fig = copy_fig(f"{H}/03_fvg_only/{l['figure_file']}", "fvg", os.path.basename(l["figure_file"]))
    term = {"id": l["id"], "no": n, "name": l["title"], "simple": l["summary"], "body": l["body"], "example": l["example"],
            "trap": l["trap"], "takeaway": l["takeaway"], "fig": fig}
    if n == 2: term["aka"] = ["強気FVG", "BISI", "FVG"]
    if n == 3: term["aka"] = ["弱気FVG", "SIBI"]
    if n == 6: term["aka"] = ["CE", "Consequent Encroachment", "FVGの中央"]
    if n == 7: term["aka"] = ["全埋め"]
    if n == 10: term["aka"] = ["IFVG", "Inverse FVG", "反転FVG"]
    if n in F_REL: term["rel"] = F_REL[n]
    if n == 13: term["hide"] = "答えは次の項目（14）にあります。"
    for t, s, sh, rg in F_CH:
        if n in rg: fby.setdefault(t, []).append(term)
    MAP.append(("FVG専用版", l["id"], l["title"], f"FVG詳説 {l['id']}", "新規", "既存にFVGの解説はなし" + ("。関連：" + "・".join(r.split(":", 1)[1] for r in F_REL[n]) if n in F_REL else "")))
fintro = [{"id": "f-start", "name": "FVGを、順番に理解しよう", "guide": True, "blocks": [
    ["p", "FVGはFair Value Gapの略で、主にICT・SMC系の分析で使われる3本の足の形です。この本では、FVGの位置を自分で判定し、「触れただけ」「半分」「全埋め」を分けて説明できるようにします。"],
    ["ol", ["3本の足で条件を確認する。", "上昇型と下落型の境界を見つける。", "戻りと失敗の例を見比べる。", "数字で計算し、練習問題を解く。"]],
    ["note", "この本の基準：ヒゲ込みの高値・安値を使い、3本目が確定してから判定します。境界が同じ価格なら幅ゼロで、FVGとは数えません。全埋めは反対側境界への到達とします。"],
    ["p", "図の約束：色の帯がFVG、水平線が上下の境界。必要な図では中央線も表示します。陽線は青緑、陰線は赤。図と価格は説明用の模式図です。"],
    ["note", "FVGは約定量ゼロの証拠でも、必ず戻る価格帯でもありません。定義や無効条件には手法差があります。使うインジケーターの条件と同じか確認してください。このアプリはFVGを自動で検出・判定しません。"]]}]
fback = [{"id": "f-glossary", "name": "用語と数式を、ひと目で", "guide": True, "blocks": [
    ["table", ["用語", "意味・この本の扱い"], [["強気FVG", "3本目安値 ＞ 1本目高値。帯は1本目高値〜3本目安値。"], ["弱気FVG", "3本目高値 ＜ 1本目安値。帯は3本目高値〜1本目安値。"],
                                           ["CE", "Consequent Encroachment。帯の50％地点という呼称。"], ["BISI／SIBI", "それぞれ強気／弱気FVGの文脈で使われる呼称。売買の保証ではない。"],
                                           ["IFVG", "Inverse FVG。突破後の役割転換候補の呼称。条件には手法差がある。"], ["帯の幅", "上端−下端。"], ["帯の中央", "（上端＋下端）÷2。"],
                                           ["全埋め", "この本では、戻って反対側境界に到達した状態。"]]]]},
    {"id": "f-sources", "name": "参考資料と編集元について", "guide": True, "blocks": [
        ["links", [["https://www.tradingview.com/script/cnjDLUHs-ICT-FVG-TheFundedRoad/", "TradingView「ICT FVG [TheFundedRoad]」", "1本目と3本目を比べる検出の説明（参考。手法の有効性の保証ではない）"]]],
        ["note", "FVGの検出条件、無効条件、戻りの判定は統一規格ではありません。手法を検証する場合は、条件・期間・コスト・失敗例も含めて記録してください。"],
        ["p", "元資料：FVG図解ガイド FVG専用版 第1版（2026年10月30日）。このアプリ版は元資料の文を編集しているため、PDF・EPUB版と表現が異なる場合があります。"]]}]
for g in fintro + fback:
    MAP.append(("FVG専用版", g["id"].replace("f-", "matter#"), g["name"], f"FVG詳説 {g['id']}", "新規（導入・付録）", "目次（contents1）はアプリの目次で代替"))
fvg = {"id": "fvg", "title": "FVG詳説", "en": "FAIR VALUE GAP", "icon": "📐", "version": VERSION + "（元資料：FVG図解ガイド FVG専用版 第1版をアプリ向けに編集）",
       "lead": "3本の条件 → 帯の計算 → 戻り方と失敗 → 練習の順に読めます。",
       "chapters": [{"t": "はじめに", "s": "この本の基準と読む順番", "short": "はじめに", "terms": fintro}] +
                   [{"t": t, "s": s, "short": sh, "terms": fby[t]} for t, s, sh, rg in F_CH] +
                   [{"t": "巻末資料", "s": "用語と数式の早見表・参考資料", "short": "巻末", "terms": fback}]}
save("fvg.json", fvg)

# ------------------------------------------------------------------ sources (not published) and the mapping table
for sub, files in (("01_gold_beginner", ["patterns-beginner.json", "gold-beginner.html", "README.txt", "CLAUDE_IMPORT.md"]),
                   ("02_usdjpy_beginner", ["lessons.json", "front-back-matter.json", "sources.json", "usdjpy-beginner.md", "README.txt", "CLAUDE_IMPORT.md", "QUALITY_CHECK.md"]),
                   ("03_fvg_only", ["lessons.json", "front-back-matter.json", "fvg-guide.md", "README.txt", "CLAUDE_IMPORT.md"])):
    os.makedirs(f"{SRC}/{sub}", exist_ok=True)
    for f in files:
        if os.path.exists(f"{H}/{sub}/{f}"):
            shutil.copy(f"{H}/{sub}/{f}", f"{SRC}/{sub}/{f}")
shutil.copy(f"{H}/START_HERE.md", f"{SRC}/START_HERE.md")
rows = "\n".join("| %s | %s | %s | %s | %s | %s |" % r for r in MAP)
open(f"{SRC}/MAPPING.md", "w", encoding="utf-8").write(
    "# 学習コンテンツの対応表\n\n元資料の各項目が、アプリのどこに入ったか（2026-10-30）。\n\n"
    "- 扱い：新規＝アプリに初めて入った／統合＝既存の用語と内容が重なるため相互に関連リンクを付け、元の説明は残した／参照＝形の定義は別の本の正本に任せ、その本固有の例と注意を残した\n"
    "- 既存のFX用語集で重なっていたチャートパターン・ローソク足の項目は、短い説明を残してパターン図鑑の正本へリンクした（本文の二重コピーはしていない）\n"
    "- 元資料の表紙・目次ページは、アプリの本の表紙・目次（自動生成）で置き換えた\n"
    "- 元資料のPDF・EPUB・HTMLの表示用ファイル（PDF/EPUB）は取り込んでいない。アプリ版と表現が異なる場合がある\n\n"
    "| 元資料 | 元の項目ID | 元の名称 | アプリでの行き先 | 扱い | 補足 |\n|---|---|---|---|---|---|\n" + rows + "\n")
print("pattern", sum(len(c["terms"]) for c in pattern["chapters"]), "usdjpy", sum(len(c["terms"]) for c in usdjpy["chapters"]),
      "fvg", sum(len(c["terms"]) for c in fvg["chapters"]), "map rows", len(MAP))
