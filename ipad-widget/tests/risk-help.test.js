// リスク・ロット計算の「使い方」説明（ボタン・手順帯・説明画面）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
  test(`リスク計算の使い方 (${name}): ボタン・手順帯・説明画面がそろっている`, () => {
    assert.match(src, /id="riskHelpBtn" class="seg helpbtn"/);
    assert.match(src, /class="risksteps"/);
    assert.match(src, /id="riskHelpSheet" class="helpsheet" hidden/);
    assert.match(src, /リスク・ロット計算の使い方/);
    assert.match(src, /流れ（3ステップ）/);
    assert.match(src, /結果の読み方/);
    assert.match(src, /最小ロットでも上限超え/);
  });
}
