// node --test ipad-widget/tests
// リスク・ロット計算の改善（合計リスク・連敗・円モードの土台）：gold.html の実物のスクリプトを vm に読み込み、
// 実物の riskShareWrite / riskShareRead / renderRiskShare / renderRiskStreak を検証する。
// 仕様：claude-code-instruction-risk-lot-improvements-20261104.md（共有キーは td_risk_share_v1、合計に入るのは15分以内だけ）
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
  assert.ok(scripts.some((s) => s.includes("riskShareWrite")), "gold.html の主スクリプトを取り出せている");
  const hook = ";window.__X={state,riskShareWrite,riskShareRead,renderRiskShare,renderRiskStreak,lsSet,document};";
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

const KEY = "td_risk_share_v1";

test("risk: 計算結果は td_risk_share_v1 に銘柄ごとに書き出される（損失は表示ロットの実額）", () => {
  const X = loadGold();
  X.riskShareWrite({ loss: 4987.6, margin: 20123.4, lot: 0.1, dir: "buy" });
  const all = X.riskShareRead();
  assert.equal(all.gold.loss, 4988); // 円に丸めて保存
  assert.equal(all.gold.margin, 20123);
  assert.equal(all.gold.lot, 0.1);
  assert.equal(all.gold.dir, "buy");
  assert.ok(Math.abs(Date.now() - all.gold.t) < 5000, "時刻つき");
});

test("risk: 合計は15分以内の計算だけ。古い銘柄は内訳で「古い計算」と分かる", () => {
  const X = loadGold();
  const now = Date.now();
  X.riskShareWrite({ loss: 5000, margin: 20000, lot: 0.1, dir: "buy" }); // 自分（ゴールド）
  X.lsSet(KEY, JSON.stringify({
    gold: { name: "ゴールド", loss: 5000, margin: 20000, lot: 0.1, dir: "buy", t: now },
    silver: { name: "シルバー", loss: 3000, margin: 9000, lot: 0.2, dir: "sell", t: now - 60000 }, // 1分前＝新しい
    btc: { name: "BTC", loss: 7000, margin: 50000, lot: 0.05, dir: "buy", t: now - 16 * 60000 }, // 16分前＝古い
  }));
  X.renderRiskShare(100000, 1.0, 5000);
  const el = X.document.getElementById("riskShare");
  assert.equal(el.hidden, false);
  assert.ok(el.innerHTML.includes("想定損失 ¥8,000"), "合計は自分＋新しい他銘柄だけ：" + el.innerHTML);
  assert.ok(el.innerHTML.includes("合計 必要証拠金 ¥29,000"), "証拠金も同じ範囲で合計");
  assert.ok(el.innerHTML.includes("資金の8.00%"), "％の分母はこのダッシュボードの口座資金");
  assert.ok(el.innerHTML.includes("合計で上限を超えています"), "許容1%を超えるので警告文言");
  assert.ok(el.innerHTML.includes("（古い計算・合計に入れていません）"), "古い銘柄の明示");
  assert.ok(el.innerHTML.includes("同じ端末・同じブラウザで開いているダッシュボードの、15分以内の計算だけが合算されます"), "制約の注記");
});

test("risk: 他銘柄に新しい計算が1つもなければ、合計ブロック自体を出さない", () => {
  const X = loadGold();
  const now = Date.now();
  X.lsSet(KEY, JSON.stringify({
    gold: { name: "ゴールド", loss: 5000, margin: 20000, lot: 0.1, dir: "buy", t: now },
    btc: { name: "BTC", loss: 7000, margin: 50000, lot: 0.05, dir: "buy", t: now - 16 * 60000 },
  }));
  X.renderRiskShare(100000, 1.0, 5000);
  const el = X.document.getElementById("riskShare");
  assert.equal(el.hidden, true);
});

test("risk: 連敗の行は複利（1−(1−r)^n）で3・5・10連敗を出し、損失がなければ出さない", () => {
  const X = loadGold();
  X.renderRiskStreak(100000, 1000); // r＝1%
  const el = X.document.getElementById("riskStreak");
  assert.equal(el.hidden, false);
  assert.ok(el.textContent.includes("3連敗で資金 −3.0%"), el.textContent);
  assert.ok(el.textContent.includes("5連敗で −4.9%"), el.textContent);
  assert.ok(el.textContent.includes("10連敗で −9.6%"), el.textContent);
  assert.ok(el.textContent.includes("毎回、残った資金に対して同じ割合を失う計算です"), "前提の明記");
  X.renderRiskStreak(100000, 0);
  assert.equal(el.hidden, true, "想定損失が取れないときは出さない");
});
