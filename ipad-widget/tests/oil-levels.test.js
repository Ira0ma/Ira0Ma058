const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 2026-11-16 のオイル R1/R2 異常（102.21/102.64 が現値 87.26 の +17% に出た件）の回帰テスト。
// 実データ：OKX CL-USDT-SWAP の1時間足 600本（2026-10-22〜11-16、実測で取得）。本番の算出元はこの OKX の足。
// 実コード：gold.html から atr / srLevels / srLevels0 / h1Levels / keyLevels を抜き出してそのまま動かす。

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const BARS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "okx-oil-h1-20261116.json"), "utf8"));

function extract(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " が gold.html にある");
  let i = src.indexOf("{", start), depth = 0, state = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (state) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === state) state = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { state = c; continue; }
    if (c === "/" && src[j + 1] === "/") { while (j < src.length && src[j] !== "\n") j++; continue; }
    if (c === "/" && src[j + 1] === "*") { j += 2; while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++; continue; }
    if (c === "{") depth++;
    if (c === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(name + " の抽出に失敗");
}

function runKeyLevels(price) {
  const ctx = {
    state: { spot: { price }, h1: BARS, h4: [], d1: [] },
    INSTR: { tolMin: 0.015 },
    srMemo: new Map(),
    lvHidden: () => false,
    LV_TOL: 0.03,
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const fn of ["atr", "srLevels", "srLevels0", "h1Levels", "keyLevels"]) {
    vm.runInContext(extract(GOLD, fn), ctx);
  }
  return vm.runInContext("({k: keyLevels(), lv: srLevels(state.h1)})", ctx);
}

test("オイルの注目ポイント：R1/R2 は現在値のすぐ上の水準になる（102 の古い密集帯は出ない）", () => {
  const { k, lv } = runKeyLevels(87.265);
  assert.ok(k, "keyLevels が返る");
  assert.equal(k.r.length, 2, "R が2本そろう");
  assert.equal(k.s.length, 2, "S が2本そろう");
  assert.ok(Math.abs(k.r[0].price - 87.45) < 0.05, "R1 は 87.45 付近（実測: " + k.r[0].price.toFixed(2) + ")");
  assert.ok(Math.abs(k.r[1].price - 87.82) < 0.05, "R2 は 87.82 付近（実測: " + k.r[1].price.toFixed(2) + ")");
  assert.ok(Math.abs(k.s[0].price - 87.09) < 0.05, "S1 は 87.09 付近（実測: " + k.s[0].price.toFixed(2) + ")");
  assert.ok(Math.abs(k.s[1].price - 86.74) < 0.05, "S2 は 86.74 付近（実測: " + k.s[1].price.toFixed(2) + ")");
  for (const l of [...k.r, ...k.s]) assert.ok(l.price < 95, "102 の水準は R/S に出ない（実測: " + l.price.toFixed(2) + ")");
});

test("オイルの水平線：古い密集帯は残るが、近い水準も一覧に入る（選ぶ側で近い方を取れる）", () => {
  const { lv } = runKeyLevels(87.265);
  const has = (p) => lv.some((l) => Math.abs(l.price - p) < 0.05);
  assert.ok(has(102.21), "102.21 の古い線そのものは一覧に残る（消してはいない）");
  assert.ok(has(87.45), "87.45 の近い線も一覧に入る");
  assert.ok(has(87.81), "87.81 の近い線も一覧に入る");
});

test("keyLevels の安全帯：20時間ATR より遠い水準は出さない、という文言と計算がある", () => {
  assert.ok(GOLD.includes("20)||Infinity"), "距離の上限（20時間ATR）が keyLevels にある");
  assert.ok(GOLD.includes("byNear"), "近い水準を必ず残す処理が srLevels0 にある");
});
