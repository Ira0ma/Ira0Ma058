// ロット図説のCB単価の整合テスト（2026-11-17）
// 確定レート：GOLD $18.0／ロット（約2,790円）、SILVER・ドル円 $9.0（約1,395円）、1ドル=155円換算。
// cashbackYen1 を持つ銘柄は cashbackUsd1 も持ち、yen = usd × 155 であること。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'learn', 'lotsim.html'), 'utf8');

function instrumentBlock(id) {
  const i = html.indexOf('id:"' + id + '"');
  assert.ok(i >= 0, id + ' の定義がある');
  return html.slice(i, i + 2600);
}

test('CB単価：GOLD は 2790円／$18.0、SILVER・ドル円は 1395円／$9.0', () => {
  const gold = instrumentBlock('gold');
  assert.match(gold, /cashbackYen1:2790,/);
  assert.match(gold, /cashbackUsd1:18\.0,/);
  for (const id of ['silver', 'usdjpy']) {
    const b = instrumentBlock(id);
    assert.match(b, /cashbackYen1:1395,/, id);
    assert.match(b, /cashbackUsd1:9\.0,/, id);
  }
});

test('CB単価：cashbackUsd1 の重複定義がない', () => {
  for (const id of ['gold', 'silver', 'usdjpy']) {
    const b = instrumentBlock(id);
    const blockHead = b.slice(0, b.indexOf('cashbackYen1:') + 60);
    assert.strictEqual((blockHead.match(/cashbackUsd1/g) || []).length <= 1, true, id);
  }
  assert.strictEqual((html.match(/cashbackUsd1:9\.0,\n\s*cashbackUsd1/g) || []).length, 0, '連続重複なし');
});
