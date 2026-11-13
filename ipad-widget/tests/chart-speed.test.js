// チャート操作の高速化（パンの1.5倍速・慣性・描画の間引き）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
  test(`チャート高速化 (${name}): 1.5倍パン・慣性・描画間引きが入っている`, () => {
    assert.match(src, /const PAN_SPEED=1\.5;/);
    assert.match(src, /state\.view\.off=drag\.off\+Math\.round\(dx\*PAN_SPEED\/drag\.step\)/);
    assert.match(src, /function startMomentum\(v\)/);
    assert.match(src, /function queueDraw\(\)/);
    assert.match(src, /startMomentum\(\(b\.off-a\.off\)\/dt\*16\.7\)/);
    assert.match(src, /chart\.setPointerCapture\(e\.pointerId\);ptrs\.set\(e\.pointerId,\{x:e\.clientX,y:e\.clientY\}\);stopMomentum\(\);/);
  });
}
