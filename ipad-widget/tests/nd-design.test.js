// node --test ipad-widget/tests
// 新デザイン（nd）のGOLD先行適用の検証。
// 全ペア共通の gold.html に、GOLDだけ新デザインが効く仕掛け（ファイル名で有効化＋
// INSTR_KEYで最終確認）が入っていること、他のペアでは外れることを文字列で担保する。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DASH = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");

test("nd：有効化は gold.html のファイル名で行う（headの早期スクリプト）", () => {
  assert.ok(DASH.includes('location.pathname.indexOf("gold.html") >= 0'));
  assert.ok(DASH.includes('document.documentElement.classList.add("nd")'));
});

test("nd：INSTR_KEY があるペアでは nd を外す（最終確認がメインスクリプトより前）", () => {
  const guard = DASH.indexOf('classList.remove("nd")');
  const main = DASH.indexOf("const $ = id =>");
  assert.ok(guard >= 0, "remove側の記述がある");
  assert.ok(DASH.includes('window.INSTR_KEY && window.INSTR_KEY !== "gold"'));
  assert.ok(guard < main, "最終確認はメインスクリプトより前にある");
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
