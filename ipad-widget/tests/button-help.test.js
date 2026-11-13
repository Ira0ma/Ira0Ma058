// チャートの「ボタンの説明」画面の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
  test(`ボタンの説明 (${name}): ボタン・シート・一覧生成がそろっている`, () => {
    assert.match(src, /id="btnHelp" class="helpbtn">？ 説明</);
    assert.match(src, /id="btnHelpSheet" class="helpsheet" hidden/);
    assert.match(src, /id="btnHelpList"/);
    assert.match(src, /const BTN_HELP=\[/);
    assert.match(src, /function renderBtnHelp\(\)/);
    assert.match(src, /\['btn','planBtn','プラン'/);
    assert.match(src, /\['btn','guardBtn','ガード'/);
    assert.match(src, /\['ma','big','大口決済の兆候'/);
  });
}

test("狭い画面（560px以下）では、操作パネルの表示・機能の行が横スクロール1行になる", () => {
  for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
    assert.match(src, /@media\(max-width:560px\)\{\.ctlPanel\{padding:6px 8px 7px\}\.ctlPanel \.matoggles\{flex-wrap:nowrap;overflow-x:auto/, name);
  }
});
