// node --test ipad-widget/tests
// シルバー（XAG/USD）の利確判定：gold.html の実物のスクリプトを vm に読み込み、
// 実物の tradePlan / tpUsed / tpOkBy / minTpFor / chartPatterns / silverStale を検証する。
// 仕様：silver-tp-spec-20261106.md（TP1/TP2・型ごとの minTp・形の倍率・時間切れ格下げ）
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
// ページ末尾の IIFE が Element.prototype の innerHTML / Node.prototype の textContent の
// ディスクリプタを読みに行くので、実ディスクリプタを持つスタブを用意する
class StubNode {}
class StubElement extends StubNode {}
Object.defineProperty(StubElement.prototype, "innerHTML", { configurable: true, get() { return this.__h || ""; }, set(v) { this.__h = v; } });
Object.defineProperty(StubNode.prototype, "textContent", { configurable: true, get() { return this.__t || ""; }, set(v) { this.__t = v; } });

// ダッシュボードを丸ごと読み込む（key は INSTR_KEY。null はゴールド）
function loadDash(key) {
  const store = new Map();
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
    location: { protocol: "https:", hostname: "example.test", pathname: key ? "/" + key + ".html" : "/gold.html", href: "https://example.test/", search: "", reload() {} },
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
  if (key) sandbox.INSTR_KEY = key;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CORE, ctx, { filename: "core.js" });
  const scripts = inlineScripts(GOLD);
  assert.ok(scripts.some((s) => s.includes("silverTpBasis")), "gold.html の主スクリプトを取り出せている");
  const hook = ";window.__X={state,INSTR,PATTERNS,tradePlan,tpUsed,tpPipsBy,tpOkBy,minTpFor,chartPatterns,silverStale};";
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

const H = 3600000;
function bars(n, fn, step = H, t0 = 1767225600000) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = fn(i); out.push({ t: t0 + i * step, o: b.o, h: b.h, l: b.l, c: b.c }); }
  return out;
}
const flat = (p, r) => () => ({ o: p, h: p + r, l: p - r, c: p });
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// M15 の TR が一定になる平らな足（slDist = ATR×1.2 を決め打ちできる）
function setupFlat(X, range, price = 60) {
  X.state.m15 = bars(100, flat(price, range), 900000);
  X.state.h1 = bars(150, flat(price, range));
  X.state.m5 = bars(100, flat(price, range), 300000);
  X.state.spot = { price, asof: Date.now(), freshness: "fresh" };
}

test("silver: INSTRUMENTS と PATTERNS（ドル円フォールバックに落ちない）", () => {
  const X = loadDash("silver");
  assert.equal(X.INSTR.key, "silver");
  assert.equal(X.INSTR.pip, 0.01); // §1：1pips＝$0.01
  assert.equal(X.INSTR.slMin, 0.05); // §1：SL の下限 $0.05
  assert.deepEqual({ ...X.INSTR.minTpBy }, { short: 50, day: 50, swing: 50, swingD1R: 1 }); // §3（vm 越えの object は spread で自 realm に移す）
  assert.equal(X.INSTR.minTp, 50); // 表示ラベル用の単一値も 50
  const mult = {};
  for (const p of X.PATTERNS) {
    assert.equal(p.tf, "h1");
    assert.equal(p.tpFixed, undefined, "ドル円の +30pips 固定が混ざっていない");
    mult[p.id + "/" + p.dir] = p.tpMult;
  }
  // §4：ダブルボトム×1.0・ダブルトップ×0.5・逆三尊×1.0・三尊×0.5
  assert.deepEqual(mult, { "db/1": 1, "db/-1": 0.5, "ihs/1": 1, "ihs/-1": 0.5 });
});

test("silver: デイの TP1 は +50pips 固定、TP2 は +2R（§2）", () => {
  const X = loadDash("silver");
  setupFlat(X, 0.15); // ATR 0.30 → slDist 0.36 → 36pips
  X.state.tpBasis = "day";
  const pl = X.tradePlan(1);
  assert.ok(approx(pl.slPips, 36, 1e-4), "slPips=" + pl.slPips);
  assert.equal(pl.tpSrc, "TP1（+50pips）");
  assert.ok(approx(pl.tpPips, 50), "tpPips=" + pl.tpPips);
  assert.ok(approx(pl.tp, 60.5), "tp=" + pl.tp);
  assert.ok(approx(pl.tp2Pips, 72), "tp2Pips=" + pl.tp2Pips); // +2R
  assert.ok(approx(pl.tp2, 60.72), "tp2=" + pl.tp2);
  const u = X.tpUsed(pl);
  assert.ok(approx(u.pips, 50));
  assert.equal(X.minTpFor(pl), 50);
  assert.equal(X.tpOkBy(pl), true);
  const ps = X.tradePlan(-1); // 売りも対称
  assert.ok(approx(ps.tp, 59.5));
  assert.ok(approx(ps.tp2, 59.28));
});

test("silver: スイングの TP1 は 4時間足 +50pips と日足 1R のうち手前（§2・§3）", () => {
  const X = loadDash("silver");
  setupFlat(X, 0.15); // slPips 36 < 50 → 日足基準（1R）が手前
  X.state.tpBasis = "swing";
  let pl = X.tradePlan(1);
  assert.equal(pl.tpDay.tf, "d1");
  assert.ok(approx(pl.tpDay.pips, 36), "tpDay.pips=" + pl.tpDay.pips);
  assert.ok(approx(X.tpUsed(pl).pips, 36));
  assert.ok(approx(X.minTpFor(pl), 36), "minTp は 1R＝損切り幅（pips 固定値ではない）");
  assert.equal(X.tpOkBy(pl), true);

  const Y = loadDash("silver");
  setupFlat(Y, 0.3); // ATR 0.60 → slDist 0.72 → slPips 72 ≥ 50 → 4時間足基準が手前
  Y.state.tpBasis = "swing";
  pl = Y.tradePlan(1);
  assert.ok(approx(pl.slPips, 72, 1e-4), "slPips=" + pl.slPips);
  assert.equal(pl.tpDay.tf, "h4");
  assert.ok(approx(pl.tpDay.pips, 50));
  assert.equal(Y.minTpFor(pl), 50);
  assert.equal(Y.tpOkBy(pl), true);
  assert.ok(approx(pl.tp2Pips, 144), "TP2 は +2R のまま"); // 2×72
});

test("silver: 短期は手前の水平線で判定し、minTp は暫定 50pips（§2・§3）", () => {
  const X = loadDash("silver");
  setupFlat(X, 0.15);
  X.state.tpBasis = "short";
  const pl = X.tradePlan(1);
  pl.tp5 = null;
  pl.tp15 = { price: 60.4, pips: 40, touches: 2, tf: "m15" };
  assert.equal(X.minTpFor(pl), 50);
  assert.equal(X.tpOkBy(pl), false); // 40 < 50
  pl.tp15 = { price: 60.6, pips: 60, touches: 2, tf: "m15" };
  assert.equal(X.tpOkBy(pl), true);
});

// ダブルボトム（買い）の H1：2つの底 58.0／58.1、ネックライン 61.0、高さ 3.0
// （chartPatterns の最低本数＝sepMax×2+wait+20＝205本を満たす 230 本）
function dbBottomBars() {
  return bars(230, (i) => {
    if (i < 190) return { o: 60, h: 60.2, l: 59.8, c: 60 };
    if (i === 190) return { o: 59.6, h: 59.9, l: 58.0, c: 59.4 };
    if (i < 198) return { o: 60.2, h: 60.5, l: 59.9, c: 60.2 };
    if (i === 198) return { o: 60.6, h: 61.0, l: 60.3, c: 60.7 };
    if (i < 206) return { o: 59.8, h: 60.1, l: 59.5, c: 59.8 };
    if (i === 206) return { o: 59.4, h: 59.7, l: 58.1, c: 59.6 };
    return { o: 59.7, h: 60.0, l: 59.4, c: 59.7 };
  });
}
// ダブルトップ（売り）の H1：2つの天井 62.0／61.9、ネックライン 59.0、高さ 3.0
function dbTopBars() {
  return bars(230, (i) => {
    if (i < 190) return { o: 60, h: 60.2, l: 59.8, c: 60 };
    if (i === 190) return { o: 60.4, h: 62.0, l: 60.1, c: 60.6 };
    if (i < 198) return { o: 59.8, h: 60.1, l: 59.5, c: 59.8 };
    if (i === 198) return { o: 59.4, h: 59.7, l: 59.0, c: 59.3 };
    if (i < 206) return { o: 60.2, h: 60.5, l: 59.9, c: 60.2 };
    if (i === 206) return { o: 60.6, h: 61.9, l: 60.3, c: 60.4 };
    return { o: 60.3, h: 60.6, l: 60.0, c: 60.3 };
  });
}
function setupPattern(X, h1, price) {
  X.state.h1 = h1;
  X.state.m15 = bars(100, flat(price, 0.2), 900000);
  X.state.m5 = bars(100, flat(price, 0.2), 300000);
  X.state.spot = { price, asof: Date.now(), freshness: "fresh" };
  X.state.tpBasis = "day";
}

test("silver: ダブルボトムの形の利確は高さ×1.0、TP2 は +2R（§4・§2）", () => {
  const X = loadDash("silver");
  setupPattern(X, dbBottomBars(), 61.3);
  const pats = X.chartPatterns();
  assert.equal(pats.length, 1, JSON.stringify(pats.map((p) => p.id + "/" + p.dir + "/" + p.state)));
  const pt = pats[0];
  assert.equal(pt.id, "db");
  assert.equal(pt.dir, 1);
  assert.equal(pt.state, "breakout");
  assert.ok(approx(pt.target, 64.0, 1e-6), "target=" + pt.target); // 61.0 + 3.0×1.0
  const pl = X.tradePlan(1, pt);
  assert.ok(approx(pl.tp, 64.0, 1e-6));
  assert.ok(approx(pl.tp2Pips, 2 * pl.slPips, 1e-6), "tp2Pips=" + pl.tp2Pips + " slPips=" + pl.slPips);
});

test("silver: ダブルトップ（天井型の売り）は高さ×0.5、TP2 は +1R に短縮（§4・§2）", () => {
  const X = loadDash("silver");
  setupPattern(X, dbTopBars(), 58.7);
  const pats = X.chartPatterns();
  assert.equal(pats.length, 1, JSON.stringify(pats.map((p) => p.id + "/" + p.dir + "/" + p.state)));
  const pt = pats[0];
  assert.equal(pt.id, "db");
  assert.equal(pt.dir, -1);
  assert.equal(pt.state, "breakout");
  assert.ok(approx(pt.target, 57.5, 1e-6), "target=" + pt.target); // 59.0 − 3.0×0.5
  const pl = X.tradePlan(-1, pt);
  assert.ok(approx(pl.tp, 57.5, 1e-6));
  assert.ok(approx(pl.tp2Pips, pl.slPips, 1e-6), "tp2Pips=" + pl.tp2Pips + " slPips=" + pl.slPips); // +1R
  assert.ok(pl.tp2Src.includes("+1R"));
});

test("silver: 時間切れ・格下げ（ブレイク後10本で TP1 未達）（§5）", () => {
  const X = loadDash("silver");
  const mk = (nBars, hi, lo) => bars(nBars, () => ({ o: 60, h: hi, l: lo, c: 60 }));
  const o = { state: "breakout", dir: 1, neck: 60, brk: 0 };
  assert.equal(X.silverStale(o, mk(12, 60.4, 59.6)), true); // 11本経っても +50pips（$0.50）未達
  assert.equal(X.silverStale(o, mk(12, 60.6, 59.6)), false); // 途中で +50pips 到達
  assert.equal(X.silverStale(o, mk(11, 60.4, 59.6)), false); // ちょうど10本はまだ格下げしない
  assert.equal(X.silverStale({ ...o, state: "forming" }, mk(30, 60.4, 59.6)), false); // 形成中は対象外
  const os = { state: "breakout", dir: -1, neck: 60, brk: 0 };
  assert.equal(X.silverStale(os, mk(12, 60.4, 59.6)), true); // 売り：安値が 59.50 を割らない
  assert.equal(X.silverStale(os, mk(12, 60.4, 59.4)), false); // 売り：−50pips 到達
});

test("gold: 既存の判定は変わらない（TP2 や梯子は付かない）", () => {
  const X = loadDash("gold");
  setupFlat(X, 1.5, 4000); // ATR 3.0 → slDist 3.6
  X.state.tpBasis = "swing";
  const pl = X.tradePlan(1);
  assert.equal(pl.tp2, undefined);
  assert.equal(X.minTpFor(pl), 50); // 単一 minTp のまま
  assert.equal(X.INSTR.minTpBy, undefined);
});
