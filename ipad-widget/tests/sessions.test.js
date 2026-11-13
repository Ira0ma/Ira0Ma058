// 市場の時間帯・コア時間と「このあとの予定」のテスト。
// gold.html の実物スクリプトを vm に読み込み、zoneTs / sessSegs / coreToday / coreNext / renderUpcoming を検証する。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

process.on("unhandledRejection", () => {});

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

function loadGold() {
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
  const hook = ";window.__X={state,tzParts,zoneTs,sessSegs,coreAt,coreToday,coreNext,CORE_DEF,renderUpcoming,upcomingEvent,els:document};";
  // renderUpcoming は $('upBox') 経由で document の要素を書き換える。検証用に document 自体も返す
  scripts.forEach((s, i) => vm.runInContext(i === scripts.length - 1 ? s + hook : s, ctx, { filename: "gold.html#" + i }));
  return sandbox.__X;
}

const near = (a, b) => Math.abs(a - b) < 0.6;

test("zoneTs: 夏時間と冬時間でロンドン・NYの時刻が正しくUTCへ変換される", () => {
  const X = loadGold();
  // 2026-11-13（金）ロンドンは GMT：16:00 ロンドン = 16:00 UTC
  assert.equal(X.zoneTs("Europe/London", 2026, 11, 13, 16, 0), Date.UTC(2026, 10, 13, 16, 0));
  // 2026-07-15（水）ロンドンは BST(UTC+1)：16:00 ロンドン = 15:00 UTC
  assert.equal(X.zoneTs("Europe/London", 2026, 7, 15, 16, 0), Date.UTC(2026, 6, 15, 15, 0));
  // 2026-11-13 NY は EST(UTC-5)：10:00 NY = 15:00 UTC
  assert.equal(X.zoneTs("America/New_York", 2026, 11, 13, 10, 0), Date.UTC(2026, 10, 13, 15, 0));
  // 2026-07-15 NY は EDT(UTC-4)：10:00 NY = 14:00 UTC
  assert.equal(X.zoneTs("America/New_York", 2026, 7, 15, 10, 0), Date.UTC(2026, 6, 15, 14, 0));
  // 東京は常に UTC+9：9:55 = 0:55 UTC
  assert.equal(X.zoneTs("Asia/Tokyo", 2026, 11, 13, 9, 55), Date.UTC(2026, 10, 13, 0, 55));
});

test("sessSegs: 冬の金曜20時（日本）— 東京・ロンドン・NYとCMEメンテの帯が正しい位置に出る", () => {
  const X = loadGold();
  const now = Date.UTC(2026, 10, 13, 11, 0); // 2026-11-13 20:00 JST
  const R = X.sessSegs("Asia/Tokyo", now);
  const find = (n, l) => R.segs.find((s) => s.n === n && near(s.l, l));
  const tokyo = find("東京", 37.5); // 9:00-18:00 JST
  assert.ok(tokyo && near(tokyo.w, 37.5), "東京 9:00-18:00");
  const london = find("ロンドン", 70.83); // 8:00 GMT = 17:00 JST、閉めは翌1:30で右端まで
  assert.ok(london && near(london.w, 29.17), "ロンドン 17:00-翌1:30");
  assert.ok(find("NY", 0) && near(find("NY", 0).w, 25), "NY前日分 0:00-6:00");
  assert.ok(find("NY", 97.92), "NY当日分 23:30-");
  const maint = R.segs.find((s) => s.m);
  assert.ok(maint && near(maint.l, 29.17) && near(maint.w, 4.17), "CMEメンテ 7:00-8:00 JST（NY17-18時）");
  assert.deepEqual([...R.open], ["ロンドン"]);
  assert.equal(R.maint, false);
});

test("sessSegs: 夏の水曜20時（日本）— ロンドン16時・NY22時半スタート", () => {
  const X = loadGold();
  const now = Date.UTC(2026, 6, 15, 11, 0); // 2026-07-15 20:00 JST
  const R = X.sessSegs("Asia/Tokyo", now);
  assert.ok(R.segs.find((s) => s.n === "ロンドン" && near(s.l, 66.67)), "ロンドン 16:00 JST開始（BST）");
  assert.ok(R.segs.find((s) => s.n === "NY" && near(s.l, 93.75)), "NY 22:30 JST開始（EDT）");
  assert.deepEqual([...R.open], ["ロンドン"]);
});

test("sessSegs: 日曜は帯が無く、土曜の早朝には金曜ロンドンの残りが出る", () => {
  const X = loadGold();
  const sun = X.sessSegs("Asia/Tokyo", Date.UTC(2026, 10, 15, 11, 0)); // 日曜 20:00 JST
  assert.equal(sun.segs.length, 0);
  const sat = X.sessSegs("Asia/Tokyo", Date.UTC(2026, 10, 14, 11, 0)); // 土曜 20:00 JST
  assert.ok(sat.segs.some((s) => s.n === "ロンドン" && near(s.l, 0)), "金曜ロンドンは土曜1:30 JSTまで");
});

test("コア時間: 仲値はその日の9:55、ロンフィクの次回は日付をまたいで正しい", () => {
  const X = loadGold();
  const dayStart = X.zoneTs("Asia/Tokyo", 2026, 11, 13, 0, 0);
  const nakane = X.CORE_DEF.find((c) => c.n === "仲値");
  assert.equal(X.coreToday(nakane, dayStart, dayStart + 86400000), Date.UTC(2026, 10, 13, 0, 55));
  const fix = X.CORE_DEF.find((c) => c.n === "ロンフィク");
  // 11/13 12:00 JST 時点の次回ロンフィクは 11/13 16:00 GMT = 11/14 1:00 JST
  assert.equal(X.coreNext(fix, Date.UTC(2026, 10, 13, 3, 0)), Date.UTC(2026, 10, 13, 16, 0));
  // その日の日本時間の帯には、前日ロンドン分の 1:00 JST が入る
  assert.equal(X.coreToday(fix, dayStart, dayStart + 86400000), Date.UTC(2026, 10, 12, 16, 0));
});

test("このあとの予定: 先頭の指標は除き、結果が無いときは3件まで並ぶ", () => {
  const X = loadGold();
  const now = Date.now();
  const ev = (title, h, extra) => Object.assign({ title, currency: "USD", impact: "High", ts: now + h * 3600000, forecast: "0.3%", previous: "0.4%" }, extra || {});
  X.state.events = [
    ev("Consumer Price Index (CPI) One", 1),
    ev("Producer Price Index (PPI) Two", 2),
    { title: "Fed Chair Powell Speaks", currency: "USD", impact: "High", ts: now + 3 * 3600000, speech: { rel: "both", ja: "パウエル議長" } },
    ev("Retail Sales Three", 4),
    ev("Consumer Price Index (CPI) Four", 5),
  ];
  X.renderUpcoming();
  const box = X.els.getElementById("upBox");
  assert.match(box.innerHTML, /このあとの予定/);
  assert.ok(!box.innerHTML.includes("One"), "先頭（次の指標に出ている）は重ねない");
  assert.ok(box.innerHTML.includes("Two"), "2件目が出る");
  assert.ok(box.innerHTML.includes("パウエル議長"), "発言も並ぶ");
  assert.ok(box.innerHTML.includes("Three"), "3件目が出る");
  assert.ok(!box.innerHTML.includes("Four"), "結果が無いときでも最大3件");
});

test("コア時間: 凡例はその市場（ゾーン）の当日分で判定する（日付またぎで済みにならない）", () => {
  const X = loadGold();
  const evening = Date.UTC(2026, 10, 13, 11, 21); // 11/13 20:21 JST
  const fix = X.CORE_DEF.find((c) => c.n === "ロンフィク");
  // ロンドン 11/13 16:00 GMT = 11/14 1:00 JST（まだ先）
  assert.equal(X.coreAt(fix, evening), Date.UTC(2026, 10, 13, 16, 0));
  assert.ok(X.coreAt(fix, evening) > evening);
  const cut = X.CORE_DEF.find((c) => c.n === "NYカット");
  // NY 11/13 10:00 EST = 11/14 0:00 JST（まだ先）
  assert.equal(X.coreAt(cut, evening), Date.UTC(2026, 10, 13, 15, 0));
  const nakane = X.CORE_DEF.find((c) => c.n === "仲値");
  // 仲値 11/13 9:55 JST はもう過ぎている
  assert.equal(X.coreAt(nakane, evening), Date.UTC(2026, 10, 13, 0, 55));
  assert.ok(X.coreAt(nakane, evening) < evening);
});
