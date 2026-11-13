// リスク・ロット計算の使いやすさ改善（クイック設定・ステッパー・要約・コピー）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
  test(`リスク計算の改善 (${name}): クイック設定・ステッパー・要約・コピーがそろっている`, () => {
    assert.match(src, /id="capitalQ"/);
    assert.match(src, /id="riskPctQ"/);
    assert.match(src, /id="riskYenQ"/);
    assert.match(src, /id="riskChipsQ"/);
    assert.match(src, /function syncRiskQuick\(\)/);
    assert.match(src, /class="stp" data-t="entry"/);
    assert.match(src, /class="stp" data-t="stop"/);
    assert.match(src, /class="stp" data-t="target"/);
    assert.match(src, /class="stp" data-t="lotManual"/);
    assert.match(src, /const RSTEP=\{gold:1,usdjpy:0\.05,btc:50,usoil:0\.1,silver:0\.05\}/);
    assert.match(src, /id="riskSummary" class="risksummary" hidden/);
    assert.match(src, /function riskSummaryText\(\)/);
    assert.match(src, /id="planCopy"/);
  });
}
