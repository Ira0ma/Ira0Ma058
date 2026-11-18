// チャートの価格目盛りは、表示範囲を等分した中途半端な数ではなく、銘柄ごとの
// 切りのいい間隔（ゴールドなら5ドル刻み等）にそろえる。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DIR = path.join(__dirname, "..");
const GOLD = fs.readFileSync(path.join(DIR, "gold.html"), "utf8");

function ladders() {
  return [...GOLD.matchAll(/grid:\[([0-9.,]+)\]/g)].map(m => m[1].split(",").map(Number));
}
function picker(grid) {
  const m = GOLD.match(/function gridStep\(span\)\{[\s\S]*?\n\}/);
  assert.ok(m, "gridStep が抜き出せる");
  return new Function("INSTR", m[0] + "; return gridStep;")({ grid });
}

test("目盛り：全5銘柄に切りのいい間隔の表がある", () => {
  assert.equal(ladders().length, 5);
});

test("目盛り：ゴールドは表示幅に応じて 1・2・5・10…から選ぶ", () => {
  const gold = ladders()[0];
  assert.deepEqual(gold, [1, 2, 5, 10, 20, 50, 100, 200, 500]);
  const step = picker(gold);
  assert.equal(step(23.7), 5);   // Yamのイメージ：5ドルごと
  assert.equal(step(6), 2);
  assert.equal(step(3), 1);
  assert.equal(step(160), 50);
  assert.equal(step(900), 200);
});

test("目盛り：ドル円・BTCも切りのいい間隔になる", () => {
  const [_, usdjpy, btc] = ladders();
  assert.equal(picker(usdjpy)(0.83), 0.2);
  assert.equal(picker(usdjpy)(0.3), 0.1);
  assert.equal(picker(btc)(4200), 1000);
  assert.equal(picker(btc)(26000), 10000); // 5000では5.2区間になるため次の切りへ
});

test("目盛り：描画ループが等分ではなく刻みにそろえている", () => {
  assert.ok(GOLD.includes("const gStep=gridStep(max-min),gFirst=Math.ceil(min/gStep)*gStep;"));
  assert.ok(!GOLD.includes("const v=max-i*(max-min)/4"), "旧い等分の目盛りが残っていない");
});
