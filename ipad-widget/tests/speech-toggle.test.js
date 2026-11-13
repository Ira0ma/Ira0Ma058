// 発言ライン（チャート内の要人発言の縦線と札）のオン/オフ切り替えの回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const USDJPY = readFileSync(new URL("../usdjpy.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["usdjpy", USDJPY], ["ayu/gold", AYU_GOLD]]) {
  test(`発言トグル (${name}): ボタン・状態・保存・描画の関門がそろっている`, () => {
    assert.match(src, /id="spBtn"[^>]*>.*発言<\/button>/);
    assert.match(src, /state\.showSpeech=lsGet\(LSP\+'speech','1'\)==='1'/);
    assert.match(src, /lsSet\(LSP\+'speech',state\.showSpeech\?'1':'0'\)/);
    assert.match(src, /\$\('spBtn'\)\.onclick=\(\)=>\{state\.showSpeech=!state\.showSpeech/);
    assert.match(src, /if\(ms<=144e5&&state\.showSpeech!==false\)\(state\.events\|\|\[\]\)\.filter\(e=>e\.speech&&goldRelevant\(e\)\)/);
  });
}
