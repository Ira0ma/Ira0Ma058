// node --test ipad-widget/tests
// 足の確定カウントダウン：gold.html の実物のスクリプトを vm に読み込み、
// 実物の barEnd / countdownText を検証する。
// 仕様：claude-code-instruction-candle-countdown-20261104.md（区切りはサイトの足と同じサーバー時刻＝ニューヨーク時間＋7時間）
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
  assert.ok(scripts.some((s) => s.includes("countdownText")), "gold.html の主スクリプトを取り出せている");
  const hook = ";window.__X={state,barEnd,countdownText};";
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

// 2026-11-09（月）06:07:30Z。ニューヨークは EST（UTC-5）なので、サーバー時刻＝UTC+2時間 → 08:07:30
const T = Date.parse("2026-11-09T06:07:30Z");
const Z = (iso) => Date.parse(iso);

test("countdown: 分足・時間足の区切りはサーバー時刻のグリッドに合う", () => {
  const X = loadGold();
  assert.equal(X.barEnd("m15", T), Z("2026-11-09T06:15:00Z")); // サーバー 08:15
  assert.equal(X.barEnd("m5", T), Z("2026-11-09T06:10:00Z"));
  assert.equal(X.barEnd("h1", T), Z("2026-11-09T07:00:00Z"));
  assert.equal(X.barEnd("h4", T), Z("2026-11-09T10:00:00Z")); // サーバー 12:00（4時間ごと）
  // 区切りの瞬間は次の足のフルカウントになる
  assert.equal(X.barEnd("m15", Z("2026-11-09T06:15:00Z")), Z("2026-11-09T06:30:00Z"));
});

test("countdown: 日足はサーバーの0時、週足は金曜引け（サーバーの土曜0時）、月足はサーバーの月初", () => {
  const X = loadGold();
  assert.equal(X.barEnd("d1", T), Z("2026-11-09T22:00:00Z")); // サーバー 11/10 0:00 = ニューヨーク 17:00
  assert.equal(X.barEnd("w1", T), Z("2026-11-13T22:00:00Z")); // サーバー土曜 0:00（月曜はじまりの週の終わり）
  assert.equal(X.barEnd("mn", T), Z("2026-11-30T22:00:00Z")); // サーバー 12/1 0:00
});

test("countdown: 表示の単位は時間足に合う（分足・時間足は時分秒、日足以上は日・時間）", () => {
  const X = loadGold();
  assert.equal(X.countdownText("m15", T), "あと 07:30");
  assert.equal(X.countdownText("h1", T), "あと 52:30");
  assert.equal(X.countdownText("h4", T), "あと 3:52:30");
  assert.equal(X.countdownText("d1", T), "あと 15時間52分");
  assert.equal(X.countdownText("w1", T), "あと 4日と15時間");
  assert.equal(X.countdownText("mn", T), "あと 21日と15時間");
});
