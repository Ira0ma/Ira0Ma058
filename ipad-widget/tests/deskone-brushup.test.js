// 2026-11-21 ブラッシュアップ（メンテナンス＋超初心者向け）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const IDX = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const PAGES = {};
for (const p of ["gold", "usdjpy", "btc", "oil", "silver"]) PAGES[p] = readFileSync(new URL("../" + p + ".html", import.meta.url), "utf8");

test("注目ポイント見出し行の幾何学：stage ではボタンがアイコンのみで内寸に収まる", () => {
  // 実CSSの数字：カード幅308・左右padding各20 → 内寸268。アイコン26＋gap10＋見出し(10字×17px)＋gap10＋ボタン最小幅44
  const inner = 308 - 20 * 2;
  const total = 26 + 10 + 10 * 17 + 10 + 44;
  assert.ok(total <= inner, `合計 ${total} が内寸 ${inner} を超えています`);
  assert.match(IDX, /#stage #points \.pt-xp \.pt-xp-t \{ display: none; \}/);
  assert.match(IDX, /id="pt-expand" class="pt-xp"><span class="pt-xp-i"/);
  assert.match(IDX, /#points \.pt-xp \{ flex: none; \}/);
});

test("ダイアログのバナー重なり：--alertb の規則が .dash-sheet 定義より後ろにある", () => {
  const sheetAt = IDX.indexOf(".dash-sheet { position: fixed;");
  const ruleAt = IDX.indexOf(".hz, .gbook, .shelf, .dash-sheet { top: var(--alertb, 0px); }");
  assert.ok(sheetAt > 0 && ruleAt > sheetAt, "規則の位置が不正です");
  assert.match(IDX, /style\.setProperty\("--alertb", vis \? t : "0px"\)/);
});

test("注目ポイントの用語タップ説明：annotateTerms と用語集への接続がある", () => {
  assert.match(IDX, /function annotateTerms\(root\)/);
  assert.match(IDX, /data-gt", m\[0\] === "SMA" \? "SMA" : m\[0\] === "ATR" \? "ATR" : "水平線"/);
  assert.match(IDX, /annotateTerms\(bodyEl\);/);
  assert.match(IDX, /className = "gl-term"/);
  assert.match(IDX, /\.gl-term \{ font: inherit;/);
});

for (const [name, src] of Object.entries(PAGES)) {
  test(`一文要約と状態の言葉化 (${name})`, () => {
    assert.match(src, /id="plainLine" class="plainline"/);
    assert.match(src, /function updatePlainLine\(\)/);
    assert.match(src, /市場は休みです。金曜の終値を表示しています。/);
    assert.match(src, /データが少し古いです（約'\+age\+'分前の価格）/);
    assert.match(src, /分前のデータ）'/);
    assert.match(src, /updatePlainLine\(\);\n\}/);
  });
  test(`リスク警告の言い換え (${name})`, () => {
    assert.match(src, /ロットを下げると上限に収まります/);
    assert.match(src, /全ポジションが損切りに達したとき、資金の '\+pct\.toFixed\(2\)\+'%（'\+yen\(tl\)\+'）を失う計算です/);
  });
}

test("オイルの出典ラベル：価格を CL=F 先物と呼ばない", () => {
  assert.ok(!PAGES.oil.includes("CL=F・定期取得"));
  assert.ok(!PAGES.oil.includes("CL=F 先物。現物は未取得"));
  assert.match(PAGES.oil, /サイト（定期取得・公表価格）/);
});
