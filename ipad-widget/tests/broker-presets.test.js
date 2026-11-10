// 口座プリセット（XMスタンダード／XM KIWAMI極／XS プロ）の静的ロック。
// スプレッド初期値は 2026/11/10 17:42ごろのMT5気配値の実測、レバレッジ初期値は各業者の銘柄ごとの上限（最初のティア）。
// 仕様：Yam の依頼（2026-11-11）で3口座化。以前の初期値で保存されている端末は OLD_SPREAD／OLD_LEV で新しい初期値へ寄せる。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DIR = path.join(__dirname, "..");
const GOLD = fs.readFileSync(path.join(DIR, "gold.html"), "utf8");
const LOTSIM = fs.readFileSync(path.join(DIR, "learn", "lotsim.html"), "utf8");

function extract(html, startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  assert.ok(a >= 0, "start marker not found: " + startMarker);
  const b = html.indexOf(endMarker, a);
  assert.ok(b > a, "end marker not found: " + endMarker);
  return html.slice(a, b + endMarker.length);
}

const ctx = vm.createContext({});
vm.runInContext(extract(GOLD, "const INSTRUMENTS={", "};"), ctx);
vm.runInContext("const INSTR=INSTRUMENTS.gold;", ctx);
vm.runInContext(extract(GOLD, "const BROKERS={", "};"), ctx);
vm.runInContext(extract(GOLD, "const OLD_SPREAD={", ";"), ctx);
vm.runInContext(extract(GOLD, "const OLD_LEV={", ";"), ctx);
const { INSTRUMENTS, BROKERS, OLD_SPREAD, OLD_LEV } = vm.runInContext("({ INSTRUMENTS, BROKERS, OLD_SPREAD, OLD_LEV })", ctx);

const EXPECT_SPREAD = { // pips（各銘柄の pip 定義で換算）。実測ポイントは gold.html のコメントに記録
  gold:   { xmstd: "5.5", xm: "2.5", xs: "1.4" },
  usdjpy: { xmstd: "2.3", xm: "1.2", xs: "0.6" },
  btc:    { xmstd: "40",  xm: "15",  xs: "23" },
  usoil:  { xmstd: "5",   xm: "3",   xs: "30" },
  silver: { xmstd: "7.0", xm: "5.0", xs: "2.3" },
};
const EXPECT_LEV = { // 銘柄ごとの上限（最初のティア）。XMはスタンダード・極で同値、XSは有効証拠金ベース
  gold:   { xmstd: "1000", xm: "1000", xs: "2000" },
  usdjpy: { xmstd: "1000", xm: "1000", xs: "2000" },
  btc:    { xmstd: "1000", xm: "1000", xs: "200" },
  usoil:  { xmstd: "200",  xm: "200",  xs: "500" },
  silver: { xmstd: "400",  xm: "400",  xs: "2000" },
};

test("口座プリセット: 5銘柄すべてに3口座分のスプレッド初期値（実測）がある", () => {
  for (const [key, exp] of Object.entries(EXPECT_SPREAD)) {
    assert.deepEqual({ ...INSTRUMENTS[key].spread }, exp, key);
  }
});

test("口座プリセット: 5銘柄すべてに3口座分のレバレッジ初期値（銘柄ごとの上限）がある", () => {
  for (const [key, exp] of Object.entries(EXPECT_LEV)) {
    assert.deepEqual({ ...INSTRUMENTS[key].lev }, exp, key);
  }
});

test("口座プリセット: BROKERS は3口座で、表示名とレバレッジが INSTR と一致する", () => {
  assert.deepEqual(Object.keys(BROKERS), ["xmstd", "xm", "xs"]);
  assert.equal(BROKERS.xmstd.name + " " + BROKERS.xmstd.acct, "XM スタンダード");
  assert.equal(BROKERS.xm.name + " " + BROKERS.xm.acct, "XM KIWAMI極");
  assert.equal(BROKERS.xs.name + " " + BROKERS.xs.acct, "XS プロ");
  for (const k of ["xmstd", "xm", "xs"]) assert.equal(BROKERS[k].lev, INSTRUMENTS.gold.lev[k]);
  assert.match(BROKERS.xmstd.src, /2026\/11\/10 17:42/);
});

test("口座プリセット: 口座セグメントは3ボタン（スタンダード→極→XSプロの順）", () => {
  const seg = extract(GOLD, 'id="brokerSeg"', "</div>");
  const order = [...seg.matchAll(/data-broker="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["xmstd", "xm", "xs"]);
});

test("口座プリセット: 以前の初期値のまま保存されている端末は新しい初期値へ寄せる", () => {
  assert.deepEqual({ ...OLD_LEV }, { xm: "1000", xs: "2000" });
  assert.equal(OLD_SPREAD.xm.gold, "2.6");   // 2026/10/23 の初期値
  assert.equal(OLD_SPREAD.xs.btc, "23.6");
  assert.equal(OLD_SPREAD.xm.silver, "4.0"); // 目安だった頃の初期値
  assert.match(GOLD, /function savedLev\(k\)/);
  assert.match(GOLD, /function savedSpread\(k\)/);
});

test("ロット図説: 全銘柄に3口座のスプレッド注記があり、日付スタンプが更新されている", () => {
  assert.match(LOTSIM, /var STAMP_DATE = "2026\.11\.11"/);
  const notes = [...LOTSIM.matchAll(/spreadNote:"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(notes.length, 5);
  for (const ntext of notes) {
    assert.match(ntext, /XMスタンダード/);
    assert.match(ntext, /XM KIWAMI極/);
    assert.match(ntext, /XS プロ/);
    assert.match(ntext, /2026\/11\/10 17:42ごろにMT5の気配値で実測/);
  }
  assert.match(LOTSIM, /ins\.spreadNote \? '<p>' \+ ins\.spreadNote/);
  assert.match(LOTSIM, /レバレッジはスタンダード口座・KIWAMI極口座で同じため、両口座に共通の値です/);
});
