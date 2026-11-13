// エントリー充実3点（プラン描画・自動ガード・プラン記録）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GOLD = readFileSync(new URL("../gold.html", import.meta.url), "utf8");
const AYU_GOLD = readFileSync(new URL("../../ayu/gold.html", import.meta.url), "utf8");
const CORE = readFileSync(new URL("../core.js", import.meta.url), "utf8");

for (const [name, src] of [["gold", GOLD], ["ayu/gold", AYU_GOLD]]) {
  test(`エントリー3点 (${name}): トグル・描画・記録・ガードがそろっている`, () => {
    for (const id of ["planBtn", "guardBtn", "recBtn", "planSave", "guardBar", "planList"]) {
      assert.match(src, new RegExp(`id="${id}"`), id);
    }
    assert.match(src, /state\.showPlan=lsGet\(LSP\+'plan','1'\)==='1'/);
    assert.match(src, /state\.showGuard=lsGet\(LSP\+'guard','1'\)==='1'/);
    assert.match(src, /state\.showRec=lsGet\(LSP\+'rec','1'\)==='1'/);
    assert.match(src, /state\.planGeo=\{yE,yS,yT\}/);
    assert.match(src, /drag\.planLine==='sl'\?'stop':'target'/);
    assert.match(src, /localStorage\.setItem\('td-planlog-v1'/);
    assert.match(src, /function renderGuard\(\)/);
    assert.match(src, /minP:min,maxP:max/);
  });
}

test("バックアップ対象: プラン記録と新しい表示設定が含まれる", () => {
  assert.match(CORE, /\^td-planlog-v1\$\//);
  assert.match(CORE, /speech\|plan\|guard\|rec/);
});
