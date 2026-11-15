// node --test ipad-widget/tests
// 新デザイン（nd）の全ペア適用の検証。
// 2026-11-15にGOLD先行で本番確認し、同日中に全ペアへ展開した。
// 全ペア共通の gold.html で無条件に有効化され、ペアで外す仕掛けが残っていないことを担保する。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DASH = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");

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
