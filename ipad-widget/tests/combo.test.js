// node --test ipad-widget/tests
// 組み合わせボタン：gold.html の実物のスクリプトを vm に読み込み、
// 実物の COMBOS / applyCombo / comboNow を検証する。
// 仕様：claude-code-instruction-chart-combo-buttons-20261104.md（チップ群の一括切替・手動変更で「カスタム」・開いた直後は適用しない）
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
  assert.ok(scripts.some((s) => s.includes("applyCombo")), "gold.html の主スクリプトを取り出せている");
  const hook = ";window.__X={state,COMBOS,MA_BTNS,comboNow,applyCombo,PLAN_COMBO,applyOmakase,applyBare};";
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

// 指示書の確定内容（チップのキーへの対応：sma=20SMA、e80=80EMA、e200=200EMA、st=スーパートレンド、
// ch=チャネル、atr=ATR(14)、rsi=RSI(14)、fib=フィボナッチ、swingN=直近高値・安値、swingP=前回高値・安値、
// gmmaS/gmmaL=GMMA短期／長期。lv=水平線、tl=トレンドライン、fvg=FVG はチップ行の外の3ボタン）
const SPEC = {
  "基本": { ma: ["sma", "e200", "st", "rsi"], ex: { lv: 1 } },
  "流れ": { ma: ["sma", "e80", "e200", "st", "ch", "atr"], ex: { lv: 1, tl: 1 } },
  "GMMA": { ma: ["gmmaS", "gmmaL", "sma", "rsi"], ex: { lv: 1 } },
  "節目": { ma: ["sma", "fib", "swingN", "swingP", "rsi"], ex: { lv: 1, fvg: 1 } },
  "シンプル": { ma: ["sma"], ex: { lv: 1 } },
};

test("combo: 5つの組み合わせの中身が指示書どおり", () => {
  const X = loadGold();
  assert.deepEqual([...X.COMBOS.map((c) => c[0])], ["基本", "流れ", "GMMA", "節目", "シンプル"]); // vm 越えの配列は spread で自 realm に移す
  for (const [name, ma, ex] of X.COMBOS) {
    assert.deepEqual([...ma].sort(), [...SPEC[name].ma].sort(), name + " のチップ");
    assert.deepEqual({ ...ex }, SPEC[name].ex, name + " の付随ボタン");
  }
});

test("combo: 押すと全チップが一括で切り替わり、状態表示がその組み合わせになる", () => {
  const X = loadGold();
  for (const name of Object.keys(SPEC)) {
    X.applyCombo(name);
    for (const b of X.MA_BTNS) assert.equal(!!X.state.maOn[b.key], SPEC[name].ma.includes(b.key), name + "：" + b.key);
    assert.equal(X.state.showLevels, !!SPEC[name].ex.lv, name + "：水平線");
    assert.equal(X.state.showTrend, !!SPEC[name].ex.tl, name + "：トレンドライン");
    assert.equal(X.state.showFvg, !!SPEC[name].ex.fvg, name + "：FVG");
    assert.equal(X.comboNow(), name, name + " が選択中表示になる");
  }
});

test("combo: 適用後にチップを1つでも手動で変えると「カスタム」になる", () => {
  const X = loadGold();
  X.applyCombo("基本");
  X.state.maOn.e10 = true; // 組み合わせにないチップを ON
  assert.equal(X.comboNow(), null); // null＝カスタム表示
  X.applyCombo("基本");
  X.state.showFvg = true; // 付随ボタン側の手動変更でも
  assert.equal(X.comboNow(), null);
});

test("combo: 開いた直後は組み合わせを勝手に適用しない（既定のチップ状態はどの組み合わせとも一致しない）", () => {
  const X = loadGold();
  assert.equal(X.comboNow(), null);
});

test("combo: おまかせは利確判定の型に合う組み合わせを当てる（短期→流れ／デイ→基本／スイング→節目）", () => {
  const X = loadGold();
  assert.deepEqual({ ...X.PLAN_COMBO }, { short: "流れ", day: "基本", swing: "節目" });
  for (const name of Object.values(X.PLAN_COMBO)) assert.ok(X.COMBOS.some((c) => c[0] === name), name + " は実在の組み合わせ");
  for (const [tp, name] of Object.entries(X.PLAN_COMBO)) {
    X.state.tpBasis = tp;
    X.applyOmakase();
    assert.equal(X.comboNow(), name, tp + " のおまかせは " + name);
  }
});

test("combo: すっぴんは全部オフにして、状態表示も「すっぴん」になる", () => {
  const X = loadGold();
  X.applyCombo("流れ"); // 何かしらオンの状態から
  X.applyBare();
  for (const b of X.MA_BTNS) assert.equal(!!X.state.maOn[b.key], false, b.key + " がオフ");
  assert.equal(X.state.showLevels, false);
  assert.equal(X.state.showTrend, false);
  assert.equal(X.state.showFvg, false);
  assert.equal(X.state.showSpeech, false);
  assert.equal(X.state.showPlan, false);
  assert.equal(X.comboNow(), "すっぴん");
  // すっぴんからチップを1つ入れると、すっぴんではなくなる（カスタム側へ）
  X.state.maOn.sma = true;
  assert.equal(X.comboNow(), null);
});
