// node --test ipad-widget/tests
// 新デザイン（nd）の全ペア適用の検証。
// 2026-11-15にGOLD先行で本番確認し、同日中に全ペアへ展開した。
// 全ペア共通の gold.html で無条件に有効化され、ペアで外す仕掛けが残っていないことを担保する。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DASH = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const HOME = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("nd：headの早期スクリプトで全ペアに有効化する", () => {
  assert.ok(DASH.includes('document.documentElement.classList.add("nd")'));
});

test("nd：ペアで外す仕掛けは残っていない（全ペア展開の担保）", () => {
  assert.ok(!DASH.includes('classList.remove("nd")'), "nd を外す記述がない");
});

test("nd：CSS層はテーマ変数で組み、サイドバーのグリッド配置を持つ", () => {
  assert.ok(DASH.includes("html.nd .panel{"));
  assert.ok(DASH.includes("color-mix(in srgb,var(--gold) 16%,transparent)"), "差し色グローはテーマの金を使う");
  assert.ok(DASH.includes('grid-template-areas:"head head" "meta meta" "side notice"'));
  assert.ok(DASH.includes("html.nd .shell>.quicknav{grid-area:side"));
  assert.ok(DASH.includes("@media (min-width:1150px)"), "サイドバー化は広い画面だけ");
});

test("使い方動画ボタン：1つだけあり、受け口（HOWTO_VIDEO）と制作中の案内を持つ", () => {
  assert.equal(DASH.split('id="howtoBtn"').length - 1, 1);
  assert.ok(DASH.includes("使い方をアニメで見る"));
  assert.ok(DASH.includes("window.HOWTO_VIDEO"));
  assert.ok(DASH.includes('"howto-" + (window.INSTR_KEY || "gold")'));
  assert.ok(DASH.includes("使い方動画は制作中です"));
  // 既定では隠れていて、nd のときだけ出る
  assert.ok(DASH.includes(".howto-btn{display:none}"));
  assert.ok(DASH.includes("html.nd .howto-btn{display:inline-flex"));
});

test("ホーム：nd が有効化され、カードの質感と使い方ボタンが入っている", () => {
  assert.ok(HOME.includes('document.documentElement.classList.add("nd")'));
  assert.ok(HOME.includes("html.nd .card{background:linear-gradient(165deg,rgba(var(--panel-rgb)"));
  assert.ok(HOME.includes('howtoBtn.className = "howto-btn"'), "ボタンはドック構築JSで作る");
  assert.ok(HOME.includes('window.HOWTO_VIDEO["howto-app"]') || HOME.includes("HOWTO_VIDEO"));
  assert.ok(HOME.includes('"howto-app"'), "ホームの受け口キーは howto-app");
  assert.ok(HOME.includes(".howto-btn{display:none}"), "ボタンは nd のときだけ出る");
  // ボタンは時計カードにもタブバーにもなく、左ドックの最上部に金色の行として置く（オーナー決定：最下部は画面外にはみ出すため最上部へ）
  const clockSeg = HOME.slice(HOME.indexOf('id="clock"'), HOME.indexOf('id="markets"'));
  assert.ok(!clockSeg.includes("howtoBtn"), "時計カード内にボタンはない");
  assert.ok(HOME.includes("dock.insertBefore(howtoBtn, dock.firstChild)"), "ボタンはドックの先頭へ差し込まれる");
  assert.ok(HOME.indexOf("dock.insertBefore(howtoBtn, dock.firstChild)") > HOME.indexOf("dock.appendChild(layoutBtn)"), "生成コードはレイアウトボタンの追加より後で実行され、先頭へ差し込まれる");
});

test("ホームのドック：ステージ内の持ち場に必ず収まる構造（見切れ再発防止）", () => {
  // 持ち場は固定：ステージ841px − ドック上端557px − 下マージン8px ＝ 276px
  const stageH = +HOME.match(/#stage\s*\{[^}]*height:\s*(\d+)px/)[1];
  const dockTop = +HOME.match(/\.vdock\s*\{[^}]*top:\s*(\d+)px/)[1];
  const dockBottom = +HOME.match(/html\.nd \.vdock\{bottom:(\d+)px/)[1];
  const slot = stageH - dockTop - dockBottom;
  assert.equal(slot, 276);
  // ハードな bound：ドックの箱そのものがステージの外へ出ない
  assert.ok(HOME.includes("html.nd .vdock{bottom:8px;overflow-y:auto"), "ドックは持ち場で bound される");
  // グループは2列組みにして縦を稼ぐ
  assert.ok(HOME.includes("html.nd .vdock .dk-grp{flex-direction:row;flex-wrap:wrap"));
  assert.ok(HOME.includes("html.nd .vdock .dk-lb{flex:0 0 100%}"));
  assert.ok(HOME.includes("html.nd .vdock .dk-app-row{flex:0 0 100%}"));
  // 自己フィット：実測ではみ出したら fit1 → fit2 と詰める（端末のフォント差を吸収）
  assert.ok(HOME.includes("dock.scrollHeight > dock.clientHeight"), "はみ出しを実測で判定する");
  assert.ok(HOME.includes("dock.__fit = fitDock"));
  assert.ok(HOME.includes("if (dock.__fit) dock.__fit();"), "モード切替のたびに再フィットする");
  // 案内ポップはドックの外（body・fixed）に出すので、bound で切れない
  assert.ok(HOME.includes("html.nd .howtonote.open{display:block;position:fixed"), "案内は fixed で出す");
  assert.ok(HOME.includes("document.body.appendChild(n)"), "案内は body に作る");
  // 算術の担保：行高さは line-height 1.5 の最悪値で見積もる
  const B1 = +HOME.match(/vdock\.fit1 \.dk-btn[^}]*min-height:(\d+)px/)[1];
  const B2 = +HOME.match(/vdock\.fit2 \.dk-btn[^}]*min-height:(\d+)px/)[1];
  const IC2 = +HOME.match(/vdock\.fit2 \.dk-app-ic\{width:(\d+)px/)[1];
  const LB = 15; // ラベル 9.5px × 1.5
  const total = (B, howto, appRow) =>
    howto + 4 + B + B + (LB + 2 + B + 2 + B) + (LB + 2 + B + 2 + appRow + 2 + B) + 8;
  const fit1 = total(B1, 29, 42);            // ボタン24px・使い方29px・アプリ行42px
  const fit2 = total(B2, 26, IC2 + 2 + 12 + 4); // ボタン20px・使い方26px・アプリ行はアイコン縮小後
  assert.ok(fit1 <= slot, `fit1 の総高 ${fit1}px が持ち場 ${slot}px に収まる`);
  assert.ok(fit2 <= slot, `fit2 の総高 ${fit2}px が持ち場 ${slot}px に収まる`);
});

test("注目ポイント：「近い水準」の行は銘柄ボタン行の枠線と被らない間隔を持つ", () => {
  const m = HOME.match(/#points \.pt-near \{[^}]*padding-top: (\d+)px/);
  assert.ok(m, "pt-near の padding-top が読める");
  assert.ok(+m[1] >= 6, `padding-top は 6px 以上（現在 ${m[1]}px）：margin-top:auto が0になる満杯時でも枠線と文字が離れる`);
});

test("注目ポイント：銘柄ボタン行はスクロール領域の外にあり、カード内に収まる", () => {
  // ボタン行（.pm-tabs）はカード直下の子。スクロールする .pt-list の中には無い
  assert.ok(HOME.indexOf('class="pm-tabs"') < HOME.indexOf('class="pt-list"'), "ボタン行はリストより前（カード直下）にある");
  const liSeg = HOME.slice(HOME.indexOf('id="pt-map"'), HOME.indexOf('id="pt-strat-none"'));
  assert.ok(!liSeg.includes("pm-tabs"), "リストの中にボタン行は無い");
  assert.ok(!HOME.includes('#pt-map .pm-tabs'), "JSの参照先もカード直下に追随している");
  assert.ok(HOME.includes('#points > .pm-tabs'));
  // 固定行の合計がカード内寸（216−14−12＝190px）に収まること（行高は line-height 1.5 の最悪値で見積もる）
  assert.ok(HOME.includes("#points .pt-xp { min-height: 34px; }"), "タイトル行のボタンは34pxに収める");
  assert.ok(HOME.includes("#points > .pm-tabs { flex: none; margin-top: 6px; }"));
  const inner = 216 - 14 - 12;
  const fixed = 34 /*タイトル行*/ + (6 + 28) /*切替タブ*/ + (6 + 32) /*銘柄ボタン行*/ + 4 /*リスト上余白*/ + (18 + 8) /*近い水準*/ + (6 + 46) /*脚注3行*/;
  assert.ok(fixed <= inner, `固定行の合計 ${fixed}px がカード内寸 ${inner}px に収まる`);
});
