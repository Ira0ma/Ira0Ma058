// node --test ipad-widget/tests
// 利確判定の型（短期／デイ／スイング）：gold.html の実物のスクリプトを vm に読み込み、
// 実物の tpUsed / tpPipsBy / tpOkBy / minTpFor と、保存値の移行（旧5ボタン→3つの型）を検証する。
// 仕様：claude-code-instruction-tp-types-20261104.md（判定の計算ルールは不変。型ごとの「判定に使う線」の選び方と由来の名前だけ）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

process.on("unhandledRejection", () => {}); // ページ側の非同期取得（fetch は永久 pending スタブ）の握りつぶし

const DIR = path.join(__dirname, "..");
const CORE = fs.readFileSync(path.join(DIR, "core.js"), "utf8");
const GOLD = fs.readFileSync(path.join(DIR, "gold.html"), "utf8");

function inlineScripts(html) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function makeCtx2d() {
  const grad = { addColorStop() {} };
  const base = { measureText: () => ({ width: 0 }), createLinearGradient: () => grad, createRadialGradient: () => grad };
  return new Proxy(base, {
    get(t, k) { return k in t ? t[k] : () => {}; },
    set() { return true; },
  });
}
function makeEl() {
  return {
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, checked: false, title: "",
    width: 0, height: 0, clientWidth: 0, clientHeight: 0, offsetWidth: 0, offsetHeight: 0,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, focus() {}, click() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    getContext() { return makeCtx2d(); },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; },
    closest() { return makeEl(); }, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
  };
}
class StubNode {}
class StubElement extends StubNode {}
Object.defineProperty(StubElement.prototype, "innerHTML", { configurable: true, get() { return this.__h || ""; }, set(v) { this.__h = v; } });
Object.defineProperty(StubNode.prototype, "textContent", { configurable: true, get() { return this.__t || ""; }, set(v) { this.__t = v; } });

// ゴールドのダッシュボードを丸ごと読み込む（seed は localStorage の初期値）
function loadGold(seed) {
  const store = new Map(Object.entries(seed || {}));
  const els = new Map();
  const document = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    createElement() { return makeEl(); }, addEventListener() {}, removeEventListener() {},
    documentElement: makeEl(), body: makeEl(), title: "", hidden: false, visibilityState: "visible",
  };
  const sandbox = {
    console, document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { protocol: "https:", hostname: "example.test", pathname: "/gold.html", href: "https://example.test/", search: "", reload() {} },
    navigator: { userAgent: "node-test" },
    fetch: () => new Promise(() => {}),
    WebSocket: class { constructor() { this.readyState = 0; } send() {} close() {} addEventListener() {} },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    addEventListener() {}, removeEventListener() {},
    devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768,
    Element: StubElement, Node: StubNode, HTMLElement: StubElement,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CORE, ctx, { filename: "core.js" });
  const scripts = inlineScripts(GOLD);
  assert.ok(scripts.some((s) => s.includes("tpUsed")), "gold.html の主スクリプトを取り出せている");
  const hook = ";window.__X={state,INSTR,tpUsed,tpPipsBy,tpOkBy,minTpFor};";
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

test("tp-types: 既定はデイ。旧ボタンの保存値は近い型へ移行する", () => {
  assert.equal(loadGold().state.tpBasis, "day"); // 保存なし＝デイ（従来の「1時間足」が既定）
  assert.equal(loadGold({ gold_tp_basis: "h1" }).state.tpBasis, "day"); // 1時間足→デイ
  assert.equal(loadGold({ gold_tp_basis: "all" }).state.tpBasis, "day"); // すべて→デイ
  assert.equal(loadGold({ gold_tp_basis: "m15" }).state.tpBasis, "short"); // 15分足→短期
  assert.equal(loadGold({ gold_tp_basis: "m5" }).state.tpBasis, "short"); // 5分足（スキャルピング）→短期
  assert.equal(loadGold({ gold_tp_basis: "day" }).state.tpBasis, "swing"); // 旧「デイトレード」の保存値 day（版数なし）はスイング
  assert.equal(loadGold({ gold_tp_basis: "day", gold_tp_basis_v: "2" }).state.tpBasis, "day"); // 新形式の day はデイ
  assert.equal(loadGold({ gold_tp_basis: "short", gold_tp_basis_v: "2" }).state.tpBasis, "short");
  assert.equal(loadGold({ gold_tp_basis: "swing", gold_tp_basis_v: "2" }).state.tpBasis, "swing");
});

test("tp-types: デイはプランの利確（1時間足の水平線／なければ利確目安）を使う＝従来の「1時間足」と同じ", () => {
  const X = loadGold();
  X.state.tpBasis = "day";
  const line = { tpPips: 120, tp: 4120.0, tpSrc: "H1水平線", slPips: 40 };
  assert.deepEqual({ ...X.tpUsed(line) }, { pips: 120, price: 4120.0, name: "1時間足の水平線" });
  const alt = { tpPips: 80, tp: 4080.0, tpSrc: "損切り幅×目標RR", slPips: 40 };
  assert.equal(X.tpUsed(alt).name, "利確目安（損切り幅×目標RR）"); // 線がない代替計算は「利確目安」と由来が分かる名前
  assert.equal(X.tpUsed(null), null);
});

test("tp-types: 短期は5分足・15分足の手前の線、スイングは4時間足・日足の手前の線（由来を正確に名乗る）", () => {
  const X = loadGold();
  X.state.tpBasis = "short";
  const pl = { tpPips: 120, tp: 4120.0, tpSrc: "H1水平線", slPips: 40,
    tp5: { price: 4108.0, pips: 80, tf: "m5" }, tp15: { price: 4103.0, pips: 30, tf: "m15" }, tpDay: null };
  let u = X.tpUsed(pl);
  assert.equal(u.pips, 30);
  assert.equal(u.name, "15分足の水平線"); // 手前＝15分足
  pl.tp15 = null;
  u = X.tpUsed(pl);
  assert.equal(u.pips, 80);
  assert.equal(u.name, "5分足の水平線"); // 片方だけならその線
  pl.tp5 = null;
  assert.equal(X.tpUsed(pl), null); // どちらもなければ使える線なし

  X.state.tpBasis = "swing";
  pl.tpDay = { price: 4180.0, pips: 80, tf: "h4" };
  u = X.tpUsed(pl);
  assert.equal(u.name, "4時間足の水平線");
  pl.tpDay = { price: 4090.0, pips: 90, tf: "d1" };
  u = X.tpUsed(pl);
  assert.equal(u.name, "日足の水平線"); // 「4時間足」と言ったり「日足」と言ったりしない：線の由来どおり
  pl.tpDay = null;
  assert.equal(X.tpUsed(pl), null);
});

test("tp-types: ゴールドの最低余地は型によらず従来どおり50pips（計算ルール不変）", () => {
  const X = loadGold();
  const pl = { tpPips: 49, tp: 4104.9, tpSrc: "H1水平線", slPips: 40, tp5: null, tp15: null, tpDay: null };
  for (const b of ["short", "day", "swing"]) {
    X.state.tpBasis = b;
    assert.equal(X.minTpFor(pl), 50, b);
  }
  X.state.tpBasis = "day";
  assert.equal(X.tpOkBy(pl), false); // 49 < 50
  pl.tpPips = 50;
  assert.equal(X.tpOkBy(pl), true);
});
