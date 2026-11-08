// node --test ipad-widget/tests
// 見る順番バッジ：index.html の番号札まわりをソースで固定する（番号は実行時に画面の並びから振る設計のため、
// 振り方の原則＝連番・重複なし・見た目の順と、注記の文言・表示条件をここで守る）。
// 仕様：claude-code-instruction-view-order-badges-20261104.md
// ※ 指示書は旧レイアウト（重要指標と学ぶが別パネル）前提の「1〜7」。現在のホームでは両者は下段タブパネル（tabpanel）
//   1枚に統合されているため、札は6枚。指示書の原則（重複なしの連番で、画面の見た目の順に沿う）を優先した形。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("badges: 札を付けるパネルは6枚（指標と学ぶは下段タブパネル1枚に統合）で、文言は従来どおり", () => {
  const m = HTML.match(/var STEPS = \{([\s\S]*?)\};/);
  assert.ok(m, "STEPS の定義がある");
  const body = m[1];
  for (const [id, text] of [
    ["clock", "今日の日付と時間を確認"],
    ["markets", "今の値段と向きを見る（タップで詳しい分析）"],
    ["points", "今日の作戦を読む"],
    ["weather", "地震・台風など安全の確認"],
    ["cal", "休みの日・ゴトー日をチェック"],
    ["tabpanel", "荒れやすい発表（指標タブ）と学びの本棚（学ぶタブ）"],
  ]) {
    assert.ok(body.includes(id + ": [0, \"" + text + "\"]"), id + " の札と文言");
  }
});

test("badges: 番号は固定で持たず、画面の並び（stepOrder）から連番で振る＝重複が起きない", () => {
  assert.ok(HTML.includes("stepOrder().forEach(function (id, i)"), "placeSteps が並び順に走査する");
  assert.ok(HTML.includes("\"<b>STEP \" + (i + 1) + \"</b>\""), "番号は i+1 の連番で作る");
  // 横画面は位置（上→同じ段は左）、縦並び・ページ送りは DOM の並び、という見た目の順の決め方
  assert.ok(HTML.includes("Math.abs(A.t - B.t) > 40 ? A.t - B.t : A.l - B.l"), "stage は位置順");
  assert.ok(HTML.includes("all.indexOf(a) - all.indexOf(b)"), "flow/pager は DOM 順");
});

test("badges: 表示中だけ「朝のひと回り用・取引の流れは使い方に」の注記が出る", () => {
  assert.ok(HTML.includes("🔰 これは朝、デスクを開いたときにひと回り見る順番です。1回の取引の流れは、ツールの「使い方」にあります"), "注記の文言");
  assert.ok(HTML.includes("html:not(.beginner) .step-note { display: none; }"), "番号札を出していないときは注記も出ない");
  assert.ok(HTML.includes("html:not(.beginner) .step-tag { display: none; }"), "札も同じ条件");
});

test("badges: ボタンの文言と切り替え方式は従来どおり", () => {
  assert.ok(HTML.includes("\"🔰 番号札を隠す\" : \"🔰 見る順番を表示\""), "同じボタンの文言が切り替わる");
});
