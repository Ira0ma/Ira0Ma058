#!/usr/bin/env python3
"""Desk of Ayu feature patch: verse card, checklist, greeting, i18n.
Edits ayu/index.src.html + ayu/tools.js in place. Every replacement is
count-asserted; run once on the step-1 output. Then run generate.py."""
from pathlib import Path

AYU = Path.home() / "workspace/trade-desk-work/repo/ayu"

def patch(path, pairs):
    txt = path.read_text(encoding="utf-8")
    for old, new, cnt in pairs:
        n = txt.count(old)
        assert n == cnt, f"{path.name}: expected {cnt} of {old[:60]!r}, found {n}"
        txt = txt.replace(old, new)
    path.write_text(txt, encoding="utf-8")
    print("patched", path.name)

CSS = """
/* ===== Desk of Ayu: verse card / bible checklist / greeting ===== */
#verse { left: 27px; top: 613px; width: 308px; height: 193px; padding: 16px 20px; display: flex; flex-direction: column; }
#verse .vs-scroll { flex: 0 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
#verse .vs-ja { font-size: 14.5px; line-height: 1.65; margin: 8px 0 4px; }
#verse .vs-en { font-size: 12px; line-height: 1.55; color: var(--ink-2); font-style: italic; margin: 0 0 4px; }
#verse .vs-ref { font-size: 11.5px; color: var(--gold); margin: 0; }
#verse .vs-credit { font-size: 10px; color: var(--ink-2); margin: 3px 0 0; }
#verse .vs-btns { margin-top: auto; padding-top: 8px; display: flex; gap: 8px; flex: none; }
#verse .vs-btn { font: inherit; font-size: 12px; font-weight: 700; color: var(--gold); background: rgba(var(--panel-rgb),.85); border: 1px solid rgba(var(--gold-rgb),.5); border-radius: 999px; padding: 4px 12px; line-height: 1.5; cursor: pointer; text-decoration: none; }
#verse .vs-btn:hover, #verse .vs-btn:focus-visible { background: var(--gold); color: var(--on-accent); outline: none; }
#bc-body { padding: 6px 22px 30px; }
.bc-group { font-weight: 700; color: var(--gold); margin: 16px 0 4px; font-size: 15px; }
.bc-row { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 2px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; }
.bc-row input { width: 22px; height: 22px; flex: none; accent-color: var(--gold); }
.bc-row .bc-en { color: var(--ink-2); font-size: 12px; }
.ayu-greet { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(3,4,8,.74); }
.ayu-greet[hidden] { display: none; }
.ayu-greet-card { max-width: 440px; width: calc(100% - 48px); max-height: calc(100% - 48px); overflow-y: auto; background: #0b0d16; border: 1px solid rgba(227,184,103,.55); border-radius: 18px; padding: 30px 28px 26px; text-align: center; color: var(--ink); box-shadow: 0 24px 60px rgba(0,0,0,.55); }
.ayu-greet-title { font-size: 27px; font-weight: 800; color: var(--gold); letter-spacing: .02em; }
.ayu-greet-line { font-size: 14px; line-height: 1.7; color: var(--ink-2); margin: 12px 0 4px; }
.ayu-greet-ja { font-size: 15.5px; line-height: 1.75; margin: 14px 0 4px; }
.ayu-greet-en { font-size: 12.5px; line-height: 1.6; color: var(--ink-2); font-style: italic; margin: 0 0 4px; }
.ayu-greet-ref { font-size: 12px; color: var(--gold); margin: 0 0 18px; }
.ayu-greet-btn { font: inherit; font-size: 14px; font-weight: 800; color: #14100a; background: var(--gold); border: none; border-radius: 999px; padding: 9px 34px; cursor: pointer; }
"""

VERSE_CARD = """
  <!-- verse of the day (Desk of Ayu) -->
  <section class="card" id="verse" aria-label="今日のみことば">
    <div class="card-title">
      <svg class="ico" viewBox="0 0 26 26"><path d="M13 3v20M6.5 8.5h13" stroke="#e3b867" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>
      <span data-i18n="verseTitle">今日のみことば</span><span class="aside" id="vs-aside">Verse of the Day</span>
    </div>
    <div class="vs-scroll">
      <p class="vs-ja" id="vs-ja"></p>
      <p class="vs-en" id="vs-en"></p>
      <p class="vs-ref" id="vs-ref"></p>
      <p class="vs-credit">日本語：口語訳（1955年・日本聖書協会）</p>
    </div>
    <div class="vs-btns">
      <a class="vs-btn" href="https://apps.apple.com/app/id6474954895" target="_blank" rel="noopener" data-i18n="prsBtn">聖書を聴く（PRS）</a>
      <button type="button" class="vs-btn" id="vs-check" data-i18n="checkBtn">通読チェック</button>
    </div>
  </section>
"""

OVERLAYS = """
<!-- 聖書通読チェック（Desk of Ayu）：状態は端末内 ayu_bible_check_v1 -->
<div class="shelf" id="bible-check" hidden role="dialog" aria-modal="true" aria-label="聖書通読チェック">
  <div class="shf-bar">
    <span class="shf-title" data-i18n="checkTitle">📖 聖書通読チェック</span>
    <span class="shf-sub" id="bc-progress"></span>
    <button type="button" class="gb-btn gb-x" id="bc-close" data-i18n="closeBtn">閉じる</button>
  </div>
  <div class="shf-body" id="bc-body"></div>
</div>

<!-- 初回の誕生日あいさつ（Desk of Ayu）：ayu_greeted_v1 があれば二度と出ない -->
<div class="ayu-greet" id="ayu-greet" hidden role="dialog" aria-modal="true" aria-label="Happy Birthday">
  <div class="ayu-greet-card">
    <div class="ayu-greet-title">Happy Birthday, Ayu!</div>
    <p class="ayu-greet-line" data-i18n="greetLine">お誕生日おめでとうございます。これは、あなたのために仕立てた特別なデスクです。毎日のみことばとともに、穏やかで祝福に満ちた一年になりますように。</p>
    <p class="ayu-greet-ja" id="gr-ja"></p>
    <p class="ayu-greet-en" id="gr-en"></p>
    <p class="ayu-greet-ref" id="gr-ref"></p>
    <button type="button" class="ayu-greet-btn" id="gr-start" data-i18n="greetBtn">はじめる</button>
  </div>
</div>

"""

SCRIPT_JS = """
<script>
/* ===== Desk of Ayu: verse of the day / bible checklist / greeting / JA-EN =====
   Verse texts are transcribed character-for-character from public-domain
   sources: Japanese = 口語訳 (NT 1954 / OT 1955 first edition, Japan Bible
   Society; its copyright term has expired in Japan, per the JBS), taken from
   the seven1m/open-bibles jpn-kougo OSIS text (titled 1954/1955 edition)
   and cross-checked against the wordproject.org Japanese text. The 口語訳
   text is used verbatim - never modernized or corrected. (Until 2026-11-06
   the Japanese text was the 文語訳: OT 明治元訳 / NT 大正改訳, via Wikisource.)
   English = KJV via bible-api.com.
   Slot 26 was 第一ペテロ5:7 in the plan; its Taisho text could not be reached
   (Wikisource 403), so it is substituted with verified 詩篇121:2. */
(function () {
  "use strict";
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  var VERSES31 = [
    { ref_ja: "創世記 1:1", ref_en: "Genesis 1:1", tr: "明治元訳", ja: "はじめに神は天と地とを創造された。", en: "In the beginning God created the heaven and the earth." },
    { ref_ja: "詩篇 23:1", ref_en: "Psalms 23:1", tr: "明治元訳", ja: "主はわたしの牧者であって、わたしには乏しいことがない。", en: "The LORD is my shepherd; I shall not want." },
    { ref_ja: "詩篇 46:1", ref_en: "Psalms 46:1", tr: "明治元訳", ja: "神はわれらの避け所また力である。悩める時のいと近き助けである。", en: "God is our refuge and strength, a very present help in trouble." },
    { ref_ja: "詩篇 118:24", ref_en: "Psalms 118:24", tr: "明治元訳", ja: "これは主が設けられた日であって、われらはこの日に喜び楽しむであろう。", en: "This is the day which the LORD hath made; we will rejoice and be glad in it." },
    { ref_ja: "箴言 3:5", ref_en: "Proverbs 3:5", tr: "明治元訳", ja: "心をつくして主に信頼せよ、自分の知識にたよってはならない。", en: "Trust in the LORD with all thine heart; and lean not unto thine own understanding." },
    { ref_ja: "イザヤ書 40:31", ref_en: "Isaiah 40:31", tr: "明治元訳", ja: "しかし主を待ち望む者は新たなる力を得、わしのように翼をはって、のぼることができる。走っても疲れることなく、歩いても弱ることはない。", en: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint." },
    { ref_ja: "イザヤ書 41:10", ref_en: "Isaiah 41:10", tr: "明治元訳", ja: "恐れてはならない、わたしはあなたと共にいる。驚いてはならない、わたしはあなたの神である。わたしはあなたを強くし、あなたを助け、わが勝利の右の手をもって、あなたをささえる。", en: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
    { ref_ja: "エレミヤ書 29:11", ref_en: "Jeremiah 29:11", tr: "明治元訳", ja: "主は言われる、わたしがあなたがたに対していだいている計画はわたしが知っている。それは災を与えようというのではなく、平安を与えようとするものであり、あなたがたに将来を与え、希望を与えようとするものである。", en: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end." },
    { ref_ja: "ヨシュア記 1:9", ref_en: "Joshua 1:9", tr: "明治元訳", ja: "わたしはあなたに命じたではないか。強く、また雄々しくあれ。あなたがどこへ行くにも、あなたの神、主が共におられるゆえ、恐れてはならない、おののいてはならない」。", en: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest." },
    { ref_ja: "マタイ 6:33", ref_en: "Matthew 6:33", tr: "大正改訳", ja: "まず神の国と神の義とを求めなさい。そうすれば、これらのものは、すべて添えて与えられるであろう。", en: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you." },
    { ref_ja: "マタイ 11:28", ref_en: "Matthew 11:28", tr: "大正改訳", ja: "すべて重荷を負うて苦労している者は、わたしのもとにきなさい。あなたがたを休ませてあげよう。", en: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
    { ref_ja: "ヨハネ 1:1", ref_en: "John 1:1", tr: "大正改訳", ja: "初めに言があった。言は神と共にあった。言は神であった。", en: "In the beginning was the Word, and the Word was with God, and the Word was God." },
    { ref_ja: "ヨハネ 3:16", ref_en: "John 3:16", tr: "大正改訳", ja: "神はそのひとり子を賜わったほどに、この世を愛して下さった。それは御子を信じる者がひとりも滅びないで、永遠の命を得るためである。", en: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
    { ref_ja: "ヨハネ 8:12", ref_en: "John 8:12", tr: "大正改訳", ja: "イエスは、また人々に語ってこう言われた、「わたしは世の光である。わたしに従って来る者は、やみのうちを歩くことがなく、命の光をもつであろう」。", en: "Then spake Jesus again unto them, saying, I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life." },
    { ref_ja: "ヨハネ 14:6", ref_en: "John 14:6", tr: "大正改訳", ja: "イエスは彼に言われた、「わたしは道であり、真理であり、命である。だれでもわたしによらないでは、父のみもとに行くことはできない。", en: "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me." },
    { ref_ja: "ヨハネ 15:5", ref_en: "John 15:5", tr: "大正改訳", ja: "わたしはぶどうの木、あなたがたはその枝である。もし人がわたしにつながっており、またわたしがその人とつながっておれば、その人は実を豊かに結ぶようになる。わたしから離れては、あなたがたは何一つできないからである。", en: "I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing." },
    { ref_ja: "ローマ 8:28", ref_en: "Romans 8:28", tr: "大正改訳", ja: "神は、神を愛する者たち、すなわち、ご計画に従って召された者たちと共に働いて、万事を益となるようにして下さることを、わたしたちは知っている。", en: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose." },
    { ref_ja: "ローマ 12:2", ref_en: "Romans 12:2", tr: "大正改訳", ja: "あなたがたは、この世と妥協してはならない。むしろ、心を新たにすることによって、造りかえられ、何が神の御旨であるか、何が善であって、神に喜ばれ、かつ全きことであるかを、わきまえ知るべきである。", en: "And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God." },
    { ref_ja: "第一コリント 13:4", ref_en: "1 Corinthians 13:4", tr: "大正改訳", ja: "愛は寛容であり、愛は情深い。また、ねたむことをしない。愛は高ぶらない、誇らない、", en: "Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up," },
    { ref_ja: "第一コリント 16:14", ref_en: "1 Corinthians 16:14", tr: "大正改訳", ja: "いっさいのことを、愛をもって行いなさい。", en: "Let all your things be done with charity." },
    { ref_ja: "ガラテヤ 5:22", ref_en: "Galatians 5:22", tr: "大正改訳", ja: "しかし、御霊の実は、愛、喜び、平和、寛容、慈愛、善意、忠実、", en: "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith," },
    { ref_ja: "エペソ 2:8", ref_en: "Ephesians 2:8", tr: "大正改訳", ja: "あなたがたの救われたのは、実に、恵みにより、信仰によるのである。それは、あなたがた自身から出たものではなく、神の賜物である。", en: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:" },
    { ref_ja: "ピリピ 4:6", ref_en: "Philippians 4:6", tr: "大正改訳", ja: "何事も思い煩ってはならない。ただ、事ごとに、感謝をもって祈と願いとをささげ、あなたがたの求めるところを神に申し上げるがよい。", en: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God." },
    { ref_ja: "ピリピ 4:13", ref_en: "Philippians 4:13", tr: "大正改訳", ja: "わたしを強くして下さるかたによって、何事でもすることができる。", en: "I can do all things through Christ which strengtheneth me." },
    { ref_ja: "ヘブル 11:1", ref_en: "Hebrews 11:1", tr: "大正改訳", ja: "さて、信仰とは、望んでいる事がらを確信し、まだ見ていない事実を確認することである。", en: "Now faith is the substance of things hoped for, the evidence of things not seen." },
    { ref_ja: "詩篇 121:2", ref_en: "Psalms 121:2", tr: "明治元訳", ja: "わが助けは、天と地を造られた主から来る。", en: "My help cometh from the LORD, which made heaven and earth." },
    { ref_ja: "ヤコブ 1:5", ref_en: "James 1:5", tr: "大正改訳", ja: "あなたがたのうち、知恵に不足している者があれば、その人は、とがめもせずに惜しみなくすべての人に与える神に、願い求めるがよい。そうすれば、与えられるであろう。", en: "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him." },
    { ref_ja: "第一ヨハネ 4:8", ref_en: "1 John 4:8", tr: "大正改訳", ja: "愛さない者は、神を知らない。神は愛である。", en: "He that loveth not knoweth not God; for God is love." },
    { ref_ja: "哀歌 3:23", ref_en: "Lamentations 3:23", tr: "明治元訳", ja: "これは朝ごとに新しく、あなたの真実は大きい。", en: "They are new every morning: great is thy faithfulness." },
    { ref_ja: "ミカ書 6:8", ref_en: "Micah 6:8", tr: "明治元訳", ja: "人よ、彼はさきによい事のなんであるかをあなたに告げられた。主のあなたに求められることは、ただ公義をおこない、いつくしみを愛し、へりくだってあなたの神と共に歩むことではないか。", en: "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?" },
    { ref_ja: "黙示録 21:4", ref_en: "Revelation 21:4", tr: "大正改訳", ja: "人の目から涙を全くぬぐいとって下さる。もはや、死もなく、悲しみも、叫びも、痛みもない。先のものが、すでに過ぎ去ったからである」。", en: "And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away." }
  ];
  var BIBLE66 = [
    ["創世記", "Genesis"], ["出エジプト記", "Exodus"], ["レビ記", "Leviticus"], ["民数記", "Numbers"], ["申命記", "Deuteronomy"],
    ["ヨシュア記", "Joshua"], ["士師記", "Judges"], ["ルツ記", "Ruth"], ["サムエル記上", "1 Samuel"], ["サムエル記下", "2 Samuel"],
    ["列王記上", "1 Kings"], ["列王記下", "2 Kings"], ["歴代誌上", "1 Chronicles"], ["歴代誌下", "2 Chronicles"], ["エズラ記", "Ezra"],
    ["ネヘミヤ記", "Nehemiah"], ["エステル記", "Esther"], ["ヨブ記", "Job"], ["詩篇", "Psalms"], ["箴言", "Proverbs"],
    ["伝道者の書", "Ecclesiastes"], ["雅歌", "Song of Songs"], ["イザヤ書", "Isaiah"], ["エレミヤ書", "Jeremiah"], ["哀歌", "Lamentations"],
    ["エゼキエル書", "Ezekiel"], ["ダニエル書", "Daniel"], ["ホセア書", "Hosea"], ["ヨエル書", "Joel"], ["アモス書", "Amos"],
    ["オバデヤ書", "Obadiah"], ["ヨナ書", "Jonah"], ["ミカ書", "Micah"], ["ナホム書", "Nahum"], ["ハバクク書", "Habakkuk"],
    ["ゼパニヤ書", "Zephaniah"], ["ハガイ書", "Haggai"], ["ゼカリヤ書", "Zechariah"], ["マラキ書", "Malachi"],
    ["マタイの福音書", "Matthew"], ["マルコの福音書", "Mark"], ["ルカの福音書", "Luke"], ["ヨハネの福音書", "John"], ["使徒の働き", "Acts"],
    ["ローマ人への手紙", "Romans"], ["コリント人への手紙第一", "1 Corinthians"], ["コリント人への手紙第二", "2 Corinthians"], ["ガラテヤ人への手紙", "Galatians"], ["エペソ人への手紙", "Ephesians"],
    ["ピリピ人への手紙", "Philippians"], ["コロサ人への手紙", "Colossians"], ["テサロニケ人への手紙第一", "1 Thessalonians"], ["テサロニケ人への手紙第二", "2 Thessalonians"], ["テモテへの手紙第一", "1 Timothy"],
    ["テモテへの手紙第二", "2 Timothy"], ["テトスへの手紙", "Titus"], ["ピレモンへの手紙", "Philemon"], ["ヘブル人への手紙", "Hebrews"], ["ヤコブの手紙", "James"],
    ["ペテロの手紙第一", "1 Peter"], ["ペテロの手紙第二", "2 Peter"], ["ヨハネの手紙第一", "1 John"], ["ヨハネの手紙第二", "2 John"], ["ヨハネの手紙第三", "3 John"],
    ["ユダの手紙", "Jude"], ["ヨハネの黙示録", "Revelation"]
  ];
  var I18N = {
    ja: { layoutShow: "🔰 見る順番を表示", layoutHide: "🔰 番号札を隠す", toolsBtn: "🧰 ツール", journalBtn: "📝 日誌", pnlBtn: "📅 トレード収支", kakeiboBtn: "🧾 家計簿", pointsTitle: "今日の注目ポイント", indTitle: "今日の重要指標", learnTitle: "学ぶ", verseTitle: "今日のみことば", verseAside: "Verse of the Day", prsBtn: "聖書を聴く（PRS）", checkBtn: "通読チェック", checkTitle: "📖 聖書通読チェック", closeBtn: "閉じる", greetLine: "お誕生日おめでとうございます。これは、あなたのために仕立てた特別なデスクです。毎日のみことばとともに、穏やかで祝福に満ちた一年になりますように。", greetBtn: "はじめる", otLabel: "旧約聖書（39書）", ntLabel: "新約聖書（27書）" },
    en: { layoutShow: "🔰 Show step numbers", layoutHide: "🔰 Hide step numbers", toolsBtn: "🧰 Tools", journalBtn: "📝 Journal", pnlBtn: "📅 Trade P&L", kakeiboBtn: "🧾 Household Budget", pointsTitle: "Key Points", indTitle: "Top Events Today", learnTitle: "Learn", verseTitle: "Verse of the Day", verseAside: "今日のみことば", prsBtn: "Listen to the Bible (PRS)", checkBtn: "Reading Checklist", checkTitle: "📖 Bible Reading Checklist", closeBtn: "Close", greetLine: "Happy birthday! This desk was made just for you. May a word of grace greet you every morning, and may the year ahead be gentle and blessed.", greetBtn: "Start", otLabel: "Old Testament (39 books)", ntLabel: "New Testament (27 books)" }
  };
  function lang() { return lsGet("ayu_td_lang") === "en" ? "en" : "ja"; }
  function todayVerse() { return VERSES31[(new Date().getDate() - 1) % VERSES31.length]; }
  function renderVerse() {
    var v = todayVerse(); if (!v) return;
    var ja = document.getElementById("vs-ja"), en = document.getElementById("vs-en"), rf = document.getElementById("vs-ref");
    if (ja) ja.textContent = v.ja;
    if (en) en.textContent = v.en;
    if (rf) rf.textContent = v.ref_ja + " / " + v.ref_en;
  }
  var CHECK_KEY = "ayu_bible_check_v1";
  function readCheck() { try { var o = JSON.parse(lsGet(CHECK_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  function renderCheckHead() {
    var st = readCheck(), n = 0, k;
    for (k in st) if (st[k]) n++;
    var p = document.getElementById("bc-progress");
    if (p) p.textContent = lang() === "en" ? n + " of 66 books read" : "66書のうち " + n + "書 読了";
  }
  function renderChecklist() {
    var body = document.getElementById("bc-body"); if (!body) return;
    var st = readCheck(), html = "", i;
    for (i = 0; i < BIBLE66.length; i++) {
      if (i === 0) html += '<div class="bc-group" id="bc-ot"></div>';
      if (i === 39) html += '<div class="bc-group" id="bc-nt"></div>';
      html += '<label class="bc-row"><input type="checkbox" data-bc="' + i + '"' + (st[i] ? " checked" : "") + '><span>' + BIBLE66[i][0] + '</span><span class="bc-en">' + BIBLE66[i][1] + "</span></label>";
    }
    body.innerHTML = html;
    var L = I18N[lang()];
    var ot = document.getElementById("bc-ot"), nt = document.getElementById("bc-nt");
    if (ot) ot.textContent = L.otLabel;
    if (nt) nt.textContent = L.ntLabel;
    renderCheckHead();
  }
  window.TDLangApply = function () {
    var L = I18N[lang()];
    document.querySelectorAll("[data-i18n]").forEach(function (el) { var k = el.getAttribute("data-i18n"); if (L[k]) el.textContent = L[k]; });
    var lay = document.getElementById("layout-toggle");
    if (lay) lay.innerHTML = lay.getAttribute("aria-pressed") === "true" ? L.layoutHide : L.layoutShow;
    var tb = document.getElementById("tools-toggle"); if (tb) tb.innerHTML = L.toolsBtn;
    var jn = document.getElementById("journal-toggle"); if (jn) jn.innerHTML = L.journalBtn;
    var pl = document.getElementById("pnl-toggle"); if (pl) pl.innerHTML = L.pnlBtn;
    var kb = document.getElementById("kakeibo-toggle"); if (kb) kb.innerHTML = L.kakeiboBtn;
    var va = document.getElementById("vs-aside"); if (va) va.textContent = L.verseAside;
    var ot = document.getElementById("bc-ot"), nt = document.getElementById("bc-nt");
    if (ot) ot.textContent = L.otLabel;
    if (nt) nt.textContent = L.ntLabel;
    renderCheckHead();
  };
  /* verse card */
  renderVerse();
  var chkBtn = document.getElementById("vs-check"), overlay = document.getElementById("bible-check");
  if (chkBtn && overlay) chkBtn.addEventListener("click", function () { renderChecklist(); overlay.hidden = false; });
  var bcClose = document.getElementById("bc-close");
  if (bcClose && overlay) bcClose.addEventListener("click", function () { overlay.hidden = true; });
  var bcBody = document.getElementById("bc-body");
  if (bcBody) bcBody.addEventListener("change", function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute || t.getAttribute("data-bc") === null) return;
    var st = readCheck();
    if (t.checked) st[t.getAttribute("data-bc")] = true; else delete st[t.getAttribute("data-bc")];
    lsSet(CHECK_KEY, JSON.stringify(st));
    renderCheckHead();
  });
  /* layout button repaint in the current language after the app repaints it */
  var layBtn = document.getElementById("layout-toggle");
  if (layBtn) layBtn.addEventListener("click", function () { setTimeout(function () { window.TDLangApply(); }, 0); });
  /* first-open birthday greeting: shown only while ayu_greeted_v1 is absent */
  var GREET_KEY = "ayu_greeted_v1";
  if (!lsGet(GREET_KEY)) {
    var g = document.getElementById("ayu-greet");
    if (g) {
      var gv = VERSES31[7]; /* Jeremiah 29:11 */
      var gja = document.getElementById("gr-ja"), gen = document.getElementById("gr-en"), grf = document.getElementById("gr-ref");
      if (gja) gja.textContent = gv.ja;
      if (gen) gen.textContent = gv.en;
      if (grf) grf.textContent = gv.ref_ja + " / " + gv.ref_en;
      g.hidden = false;
      var start = document.getElementById("gr-start");
      if (start) start.addEventListener("click", function () { lsSet(GREET_KEY, "1"); g.hidden = true; });
    }
  }
  window.TDLangApply();
})();
</script>
"""

# ---------------------------------------------------------------- patch index fragment
patch(AYU / "index.src.html", [
    ("#points { left: 27px; top: 329px; width: 308px; height: 477px; padding: 18px 20px; }",
     "#points { left: 27px; top: 329px; width: 308px; height: 271px; padding: 18px 20px; }", 1),
    ("#points .pt-list { flex: 0 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }",
     "#points .pt-list { flex: 0 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }" + CSS, 1),
    ("      今日の注目ポイント",
     '      <span data-i18n="pointsTitle">今日の注目ポイント</span>', 1),
    ('      今日の重要指標<span class="aside num" id="ind-day"></span>',
     '      <span data-i18n="indTitle">今日の重要指標</span><span class="aside num" id="ind-day"></span>', 1),
    ('<b class="gl-title">学ぶ</b>',
     '<b class="gl-title" data-i18n="learnTitle">学ぶ</b>', 1),
    ('    <div class="pt-foot" id="pt-foot"></div>\n  </section>\n\n  <!-- weather -->',
     '    <div class="pt-foot" id="pt-foot"></div>\n  </section>\n' + VERSE_CARD + '\n  <!-- weather -->', 1),
    ("<!-- 小さな書斎（学ぶの本棚）：棚の描画は JS（renderShelf）が #shf-body に作る -->",
     OVERLAYS + "<!-- 小さな書斎（学ぶの本棚）：棚の描画は JS（renderShelf）が #shf-body に作る -->", 1),
])

# append the feature script at the very end of the fragment
p = AYU / "index.src.html"
txt = p.read_text(encoding="utf-8")
assert txt.rstrip().endswith("</script>"), "fragment does not end with </script>"
p.write_text(txt.rstrip() + "\n" + SCRIPT_JS, encoding="utf-8")
print("appended feature script to index.src.html")

# ---------------------------------------------------------------- patch tools.js
patch(AYU / "tools.js", [
    ('  var TABS = [["guide", "使い方"], ["money", "資金管理"], ["check", "取引前チェック"], ["journal", "日誌"], ["pnl", "トレード収支"], ["kakeibo", "家計簿"], ["signals", "シグナル履歴"], ["hours", "市場時間"], ["status", "データ状態"], ["settings", "設定"]];',
     '  var TABS = [["guide", "使い方"], ["money", "資金管理"], ["check", "取引前チェック"], ["journal", "日誌"], ["pnl", "トレード収支"], ["kakeibo", "家計簿"], ["signals", "シグナル履歴"], ["hours", "市場時間"], ["status", "データ状態"], ["settings", "設定"]];\n'
     '  var TABS_EN = { guide: "Guide", money: "Money", check: "Pre-trade Check", journal: "Journal", pnl: "P&L", kakeibo: "Kakeibo", signals: "Signals", hours: "Market Hours", status: "Data Status", settings: "Settings" };\n'
     '  function tdLang() { try { return LS.getItem("ayu_td_lang") === "en" ? "en" : "ja"; } catch (e) { return "ja"; } }\n'
     '  function tabLabel(t) { return tdLang() === "en" ? (TABS_EN[t[0]] || t[1]) : t[1]; }\n'
     '  function paintTabLabels() { document.querySelectorAll(".tdt-tabs [data-tab]").forEach(function (b) { var id = b.getAttribute("data-tab"); for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === id) b.textContent = tabLabel(TABS[i]); }); }', 1),
    ('aria-selected="false">\' + t[1] + "</button>"',
     'aria-selected="false">\' + tabLabel(t) + "</button>"', 1),
    ('      var themeNow = "auto"; try { themeNow = LS.getItem("ayu_td_theme") || "auto"; } catch (e) {}',
     '      var themeNow = "auto"; try { themeNow = LS.getItem("ayu_td_theme") || "auto"; } catch (e) {}\n'
     '      var langNow = "ja"; try { langNow = LS.getItem("ayu_td_lang") === "en" ? "en" : "ja"; } catch (e) {}', 1),
    ("ページを開き直すと切り替わります。</p>' +\n        '<h3>省電力</h3>",
     "ページを開き直すと切り替わります。</p>' +\n"
     '        \'<h3>言語 / Language</h3>\' + select("st-lang", "表示言語 / Display language", [["ja", "日本語"], ["en", "English"]], langNow) +\n'
     '        \'<p class="note">ドックのボタン・カードの見出し・ツールのタブ名・聖書コーナーの表示が切り替わります。学ぶの本の本文や長い説明文は日本語のままです。</p>\' +\n'
     "        '<h3>省電力</h3>", 1),
    ('      $("#st-theme").addEventListener("change", function () { try { LS.setItem("ayu_td_theme", this.value); } catch (e) {} if (window.TDThemeApply) window.TDThemeApply(); });',
     '      $("#st-theme").addEventListener("change", function () { try { LS.setItem("ayu_td_theme", this.value); } catch (e) {} if (window.TDThemeApply) window.TDThemeApply(); });\n'
     '      $("#st-lang").addEventListener("change", function () { try { LS.setItem("ayu_td_lang", this.value); } catch (e) {} paintTabLabels(); if (window.TDLangApply) window.TDLangApply(); });', 1),
])

print("features OK")
