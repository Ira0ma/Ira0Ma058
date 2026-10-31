// node --test ipad-widget/tests
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");
const U = (s) => Date.parse(s);  // UTC instants written as ISO strings
const MIN = 60000, HOUR = 3600000;

test("zone offsets follow summer time (New York, London) and not Tokyo", () => {
  assert.equal(C.zoneOffset("America/New_York", U("2026-07-01T12:00:00Z")), -240);
  assert.equal(C.zoneOffset("America/New_York", U("2026-12-01T12:00:00Z")), -300);
  assert.equal(C.zoneOffset("Europe/London", U("2026-07-01T12:00:00Z")), 60);
  assert.equal(C.zoneOffset("Asia/Tokyo", U("2026-07-01T12:00:00Z")), 540);
  // the US switch (8 Mar 2026, 2:00 local) happens before London's (29 Mar): a three-week gap of 4 hours
  assert.equal(C.zoneOffset("America/New_York", U("2026-03-16T12:00:00Z")) - C.zoneOffset("Europe/London", U("2026-03-16T12:00:00Z")), -240);
  assert.equal(C.zoneTime("America/New_York", 2026, 3, 9, 17, 0), U("2026-03-09T21:00:00Z"));
  assert.equal(C.zoneTime("America/New_York", 2026, 3, 6, 17, 0), U("2026-03-06T22:00:00Z"));
});

test("FX weekend: closed from Friday 17:00 New York to Sunday 17:00, in both seasons", () => {
  assert.equal(C.marketState("usdjpy", U("2026-07-10T20:59:00Z")).state, "open");   // Fri 16:59 EDT
  assert.equal(C.marketState("usdjpy", U("2026-07-10T21:00:00Z")).state, "closed"); // Fri 17:00 EDT
  assert.equal(C.marketState("usdjpy", U("2026-12-11T21:30:00Z")).state, "open");   // Fri 16:30 EST
  assert.equal(C.marketState("usdjpy", U("2026-12-11T22:00:00Z")).state, "closed"); // Fri 17:00 EST
  assert.equal(C.marketState("usdjpy", U("2026-07-12T20:59:00Z")).state, "closed"); // Sun 16:59 EDT
  assert.equal(C.marketState("usdjpy", U("2026-07-12T21:00:00Z")).state, "open");
  const w = C.marketState("usdjpy", U("2026-07-11T12:00:00Z"));
  assert.equal(w.certain, true);
  assert.equal(C.marketState("usdjpy", U("2026-07-08T12:00:00Z")).certain, false, "an open weekday is never certain (holidays unknown)");
});

test("gold and oil: daily 17-18 break, Sunday opens at 18:00; BTC never closes", () => {
  assert.equal(C.marketState("gold", U("2026-07-08T21:30:00Z")).state, "break");
  assert.equal(C.marketState("usoil", U("2026-07-08T21:30:00Z")).state, "break");
  assert.equal(C.marketState("usdjpy", U("2026-07-08T21:30:00Z")).state, "open");
  assert.equal(C.marketState("gold", U("2026-07-12T21:30:00Z")).state, "closed");  // Sun 17:30 EDT
  assert.equal(C.marketState("gold", U("2026-07-12T22:00:00Z")).state, "open");
  assert.equal(C.marketState("btc", U("2026-07-11T12:00:00Z")).state, "open");
  assert.equal(C.marketState("vix", U("2026-07-11T15:00:00Z")).state, "closed");
});

test("weekly hours are shown in Japan time and follow US summer time", () => {
  const summer = U("2026-07-08T03:00:00Z"), winter = U("2026-12-09T03:00:00Z");
  assert.match(C.hoursNote("fx", summer), /日本時間 月曜6:00〜土曜6:00/);
  assert.match(C.hoursNote("fx", winter), /日本時間 月曜7:00〜土曜7:00/);
  assert.match(C.hoursNote("cme", summer), /月曜7:00〜土曜6:00、毎朝6:00〜7:00は休止/);
  assert.match(C.hoursNote("cme", winter), /月曜8:00〜土曜7:00、毎朝7:00〜8:00は休止/);
  assert.match(C.hoursNote("vix", summer), /平日16:15〜翌朝5:15/);
  assert.match(C.hoursNote("vix", winter), /平日17:15〜翌朝6:15/);
  assert.doesNotMatch(C.hoursNote("fx", summer) + C.hoursNote("cme", summer) + C.hoursNote("ice", summer) + C.hoursNote("vix", summer), /NY|ニューヨーク/);
  assert.match(C.marketState("gold", U("2026-07-08T21:30:00Z")).reason, /日本時間 6:00〜7:00/);
  assert.match(C.marketState("usdjpy", summer).note, /夏時間中/);
});

test("next opening time of a closed market, in Japan time", () => {
  assert.equal(C.nextOpen("usdjpy", U("2026-10-31T00:00:00Z")), "月 7:00", "Sat: FX opens Sunday 17:00 NY = Mon 7:00 JST (US back on winter time on 1 Nov)");
  assert.equal(C.nextOpen("gold", U("2026-10-31T00:00:00Z")), "月 8:00");
  assert.equal(C.nextOpen("usdjpy", U("2026-07-11T00:00:00Z")), "月 6:00", "summer");
  assert.equal(C.nextOpen("gold", U("2026-07-08T21:30:00Z")), "木 7:00", "daily pause ends 18:00 NY");
  assert.equal(C.nextOpen("usdjpy", U("2026-07-08T12:00:00Z")), "", "open now");
  assert.equal(C.nextOpen("btc", U("2026-07-11T00:00:00Z")), "");
});

test("sessions: London opens at 8:00 local in winter and summer, overlap with New York", () => {
  let s = C.sessions(U("2026-07-08T13:00:00Z"));  // 14:00 London, 9:00 NY
  assert.deepEqual(s.overlap, ["ロンドン", "ニューヨーク"]);
  assert.equal(s.list.find((x) => x.id === "london").start, U("2026-07-08T07:00:00Z"));
  s = C.sessions(U("2026-01-14T08:30:00Z"));
  assert.equal(s.list.find((x) => x.id === "london").start, U("2026-01-14T08:00:00Z"));
  assert.equal(s.list.find((x) => x.id === "london").open, true);
  assert.equal(s.list.find((x) => x.id === "tokyo").open, true);  // 17:30 JST
  s = C.sessions(U("2026-07-11T03:00:00Z"));  // Saturday
  assert.equal(s.weekend, true);
  assert.equal(s.list.some((x) => x.open), false);
});

test("freshness per data type; a closed market is not called stale", () => {
  const now = U("2026-07-08T12:00:00Z");
  assert.equal(C.freshness("price", now - 5000, now).level, "live");
  assert.equal(C.freshness("price", now - 90 * 1000, now).level, "fresh");
  assert.equal(C.freshness("price", now - 10 * MIN, now).level, "delayed");
  assert.equal(C.freshness("price", now - 16 * MIN, now).level, "stale");
  assert.equal(C.freshness("price", now - 2 * HOUR, now, { closed: true }).level, "closed");
  assert.equal(C.freshness("analysis", now - 14 * MIN, now).level, "fresh");
  assert.equal(C.freshness("analysis", now - 61 * MIN, now).level, "stale");
  assert.equal(C.freshness("candle", now - 50 * MIN, now, { tfMs: 15 * MIN }).level, "delayed");
  assert.equal(C.freshness("candle", now - 90 * MIN, now, { tfMs: HOUR }).level, "fresh");
  assert.equal(C.freshness("price", 0, now).level, "missing");
  assert.equal(C.freshness("price", NaN, now).level, "missing");
  assert.equal(C.freshness("price", now + 10 * MIN, now).level, "unknown");
  assert.equal(C.freshness("price", now + 30 * 1000, now).level, "live", "small clock skew is tolerated");
  assert.equal(C.ago(0), "0秒前");
  assert.equal(C.ago(65 * MIN), "1時間5分前");
  assert.equal(C.ago(25 * HOUR), "1日1時間前");
  assert.equal(C.jst(U("2026-07-08T15:05:00Z")), "7/9 0:05 JST");
});

test("market.json checks: shape, time, ranges, contradictions", () => {
  const now = U("2026-07-08T12:00:00Z"), t = now / 1000;
  const good = { price: 100, asOf: t - 60, candles: { "1h": [[t - 7200, 99, 101, 98, 100], [t - 3600, 100, 102, 99, 101]] } };
  let r = C.checkMarket({ instruments: { a: good } }, now);
  assert.equal(r.ok.a, true);
  r = C.checkMarket({ instruments: {
    future: { ...good, asOf: t + 3600 },
    bad: { ...good, price: -1 },
    hl: { ...good, candles: { "1h": [[t - 60, 100, 99, 98, 100]] } },
    order: { ...good, candles: { "1h": [[t, 1, 1, 1, 1], [t - 60, 1, 1, 1, 1]] } },
    jump: { ...good, price: 120 },
    str: { ...good, candles: { "1h": [[t, "1", 1, 1, 1]] } }
  } }, now);
  assert.deepEqual(r.problems.future, ["時刻が未来"]);
  assert.deepEqual(r.problems.bad, ["価格が不正"]);
  assert.match(r.problems.hl[0], /高値・安値の矛盾/);
  assert.match(r.problems.order[0], /時刻の順序/);
  assert.match(r.problems.jump[0], /5%以上/);
  assert.match(r.problems.str[0], /数値でない/);
  assert.deepEqual(C.checkMarket(null, now).global, ["データの形式が違います"]);
  assert.deepEqual(C.checkMarket({}, now).global, ["銘柄の一覧がありません"]);
  assert.equal(C.realCandles({ "1h": [[1, 1, 1, 1, 1]] }, "1h"), null, "too few candles is not a chart");
  assert.equal(C.realCandles({}, "1m"), null);
});

test("sequencer drops answers to older requests", () => {
  const s = C.sequencer(), a = s.next(), b = s.next();
  assert.equal(s.latest(a), false);
  assert.equal(s.latest(b), true);
});

test("position size: USD/JPY on a yen account, floored to the step", () => {
  // 1,000,000 yen, 1% = 10,000 yen; stop 20 pips (0.20 yen); 1 lot = 100,000 units; yen quote -> conv 1
  const r = C.positionSize({ balance: 1e6, riskPct: 1, entry: 150, stop: 149.8, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.ok, true);
  assert.equal(r.lots, 0.5);
  assert.equal(Math.round(r.actualRisk), 10000);
  // the same with 3 yen of spread cost per lot... as price cost 0.003
  const c = C.positionSize({ balance: 1e6, riskPct: 1, entry: 150, stop: 149.8, contract: 100000, conv: 1, step: 0.01, min: 0.01, cost: 0.003 });
  assert.equal(c.lots, 0.49);
  assert.ok(c.actualRisk <= 10000);
});

test("position size: gold on a yen account converts dollars at the given rate", () => {
  // risk 30,000 yen, stop $10, 100 oz per lot, 150 yen per dollar: loss per lot = 10*100*150 = 150,000 yen -> 0.2 lot
  const r = C.positionSize({ riskAmount: 30000, entry: 3000, stop: 2990, contract: 100, conv: 150, step: 0.01, min: 0.01, leverage: 1000 });
  assert.equal(r.lots, 0.2);
  assert.equal(r.units, 20);
  assert.equal(Math.round(r.notional), 3000 * 20 * 150);
  assert.equal(Math.round(r.margin), Math.round(3000 * 20 * 150 / 1000));
});

test("position size: missing, zero, negative, below minimum, absurd", () => {
  let r = C.positionSize({ balance: 1e6, riskPct: 1, entry: 150, stop: 149.8, contract: 100000, step: 0.01, min: 0.01 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.need, ["conv"], "no conversion rate -> no number, ask for it");
  r = C.positionSize({ entry: 150, stop: 149.8, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.ok, false);
  assert.ok(r.need.includes("riskAmount"));
  r = C.positionSize({ riskAmount: 1000, entry: 150, stop: 150, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.match(r.errors.join(), /同じ価格/);
  r = C.positionSize({ riskAmount: -5, entry: 150, stop: 149, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.ok, false);
  r = C.positionSize({ riskAmount: 100, entry: 150, stop: 149.8, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.skip, true, "0.005 lot is below the 0.01 minimum: skip, never round up");
  r = C.positionSize({ riskAmount: 1e15, entry: 150, stop: 149.99999, contract: 1, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.ok, false);
  r = C.positionSize({ riskAmount: "abc", entry: 150, stop: 149, contract: 100000, conv: 1, step: 0.01, min: 0.01 });
  assert.equal(r.ok, false);
  r = C.positionSize({ riskAmount: 1e6, entry: 150, stop: 149, contract: 100000, conv: 1, step: 0.01, min: 0.01, max: 5 });
  assert.equal(r.lots, 5);
  assert.match(r.notes.join(), /頭打ち/);
});

test("risk/reward with and without costs; wrong side rejected", () => {
  let r = C.riskReward({ side: 1, entry: 100, stop: 99, target: 102 });
  assert.equal(r.rr, 2);
  assert.equal(r.costIncluded, false);
  r = C.riskReward({ side: 1, entry: 100, stop: 99, target: 102, cost: 0.1, units: 10, conv: 2 });
  assert.equal(Math.round(r.rrNet * 1000) / 1000, Math.round(1.9 / 1.1 * 1000) / 1000);
  assert.equal(Math.round(r.loss * 100) / 100, -22);
  assert.equal(Math.round(r.gain * 100) / 100, 38);
  r = C.riskReward({ side: -1, entry: 100, stop: 99, target: 98 });
  assert.equal(r.ok, false);
  r = C.riskReward({ side: 1, entry: 100, stop: 99, target: 99.5 });
  assert.equal(r.ok, false);
  r = C.riskReward({ side: 0, entry: 100, stop: 99, target: 101 });
  assert.equal(r.ok, false);
});

test("daily loss limit", () => {
  const trades = [{ day: "2026-07-08", pnl: -6000 }, { day: "2026-07-08", pnl: -3000 }, { day: "2026-07-07", pnl: -50000 }];
  let d = C.dailyLoss(trades, "2026-07-08", 10000);
  assert.equal(d.loss, 9000); assert.equal(d.near, true); assert.equal(d.exceeded, false); assert.equal(d.remaining, 1000);
  d = C.dailyLoss(trades.concat({ day: "2026-07-08", pnl: -1000 }), "2026-07-08", 10000);
  assert.equal(d.exceeded, true);
  d = C.dailyLoss(trades, "2026-07-08", "");
  assert.equal(d.set, false);
  assert.equal(C.dayKey(U("2026-07-08T15:30:00Z")), "2026-07-09");
});

test("signals: created once, changed, renewed, cancelled, expired; history never rewritten", () => {
  const st = C.newStore(), t0 = U("2026-07-08T12:10:00Z");
  const base = { key: "gold", dir: "buy", entry: true, tf: "H1", expiresAt: U("2026-07-08T13:00:00Z"), met: ["120SMAの上"], unmet: [], price: 3000 };
  let r = C.updateSignal(st, base, t0);
  assert.deepEqual(r.events, ["created"]); assert.equal(r.notify, true);
  r = C.updateSignal(st, base, t0 + 5000);
  assert.deepEqual(r.events, [], "the same report again changes nothing");
  r = C.updateSignal(st, { ...base, met: ["120SMAの上", "勢い"] }, t0 + 10000);
  assert.deepEqual(r.events, ["changed"]); assert.equal(r.notify, false);
  const firstSnap = st.history[0].events[0].snap;
  assert.deepEqual(firstSnap.met, ["120SMAの上"], "the created event keeps its own conditions");
  r = C.updateSignal(st, { ...base, expiresAt: U("2026-07-08T14:00:00Z") }, U("2026-07-08T13:00:30Z"));
  assert.deepEqual(r.events, ["renewed"]);
  r = C.updateSignal(st, { ...base, entry: false, dir: "wait", unmet: ["120SMAの上"] }, U("2026-07-08T13:10:00Z"));
  assert.deepEqual(r.events, ["cancelled"]);
  assert.equal(st.history[0].status, "cancelled");
  assert.match(st.history[0].events.at(-1).reason, /120SMAの上/);
  // a new buy soon after: recorded, but no second sound
  r = C.updateSignal(st, base, U("2026-07-08T13:20:00Z"));
  assert.deepEqual(r.events, ["created"]); assert.equal(r.notify, false); assert.equal(st.history[0].repeat, true);
  // the dashboard stops reporting: expired after its candle
  assert.equal(C.expireSignals(st, U("2026-07-08T15:00:00Z")), 1);
  assert.equal(st.history[0].status, "expired");
  // direction flips: the buy is cancelled and a sell starts
  const later = { ...base, expiresAt: U("2026-07-09T02:00:00Z") };
  C.updateSignal(st, later, U("2026-07-09T01:00:00Z"));
  r = C.updateSignal(st, { ...later, dir: "sell" }, U("2026-07-09T01:01:00Z"));
  assert.deepEqual(r.events, ["cancelled", "created"]);
  // stale data ends a signal
  r = C.updateSignal(st, { ...later, dir: "sell", stale: true }, U("2026-07-09T01:02:00Z"));
  assert.deepEqual(r.events, ["expired"]);
  const saved = C.loadStore(JSON.stringify(st));
  assert.equal(saved.history.length, st.history.length);
  assert.equal(C.loadStore("{broken").history.length, 0);
  assert.equal(C.loadStore('{"v":9}').history.length, 0);
});

test("CSV: quoting, formula guard, round trip, validation, duplicates", () => {
  const cols = [{ name: "id", type: "string", required: true }, { name: "time", type: "time", required: true },
    { name: "pnl", type: "number" }, { name: "side", type: "enum", values: ["buy", "sell"] }, { name: "note", type: "string" }];
  const rows = [{ id: "a1", time: "2026-07-08T12:00:00.000Z", pnl: -1200, side: "buy", note: 'He said "go", then\nstopped' },
    { id: "a2", time: "2026-07-08T13:00:00.000Z", pnl: 500, side: "sell", note: "=HYPERLINK(1)" }];
  const csv = C.toCSV(rows, cols);
  assert.ok(csv.includes("'=HYPERLINK(1)"), "a cell starting with = is neutralised");
  assert.ok(csv.includes(",-1200,"), "numbers are not touched by the guard");
  const back = C.importCSV(csv, cols, []);
  assert.deepEqual(back.errors, []);
  assert.equal(back.records.length, 2);
  assert.equal(back.records[0].note, 'He said "go", then\nstopped');
  assert.equal(back.records[1].note, "=HYPERLINK(1)");
  const again = C.importCSV(csv, cols, ["a1", "a2"]);
  assert.equal(again.records.length, 0); assert.equal(again.skipped, 2);
  const bad = C.importCSV("id,time,pnl,side\nx,yesterday,abc,hold\n", cols, []);
  assert.equal(bad.records.length, 0);
  assert.match(bad.errors[0], /2行目/);
  assert.match(C.importCSV("foo,bar\n1,2", cols, []).errors[0], /見出し/);
  assert.match(C.importCSV("", cols, []).errors[0], /空/);
  assert.match(C.importCSV('id,time\n"a,1', cols, []).errors[0], /引用符/);
});

function memStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
test("settings: export by group without caches, import validated, reset by group", () => {
  const s = memStorage({ "desk-layout": "beginner", gold_alerts: "[]", gold_capital: "100000", gold_auto_cache_final: "{huge}", "quote-m-0": "{}", "unrelated": "x", "td-journal-v1": "[]" });
  const all = C.exportSettings(s, U("2026-07-08T12:00:00Z"));
  assert.deepEqual(Object.keys(all.data).sort(), ["desk-layout", "gold_alerts", "gold_capital", "td-journal-v1"]);
  const disp = C.exportSettings(s, 0, ["display"]);
  assert.deepEqual(Object.keys(disp.data), ["desk-layout"]);
  const t = memStorage();
  const r = C.importSettings({ ...all, data: { ...all.data, "evil-key": "x", gold_auto_cache_final: "x", gold_tf: 5 } }, t);
  assert.equal(r.written, 4);
  assert.deepEqual(r.ignored.sort(), ["evil-key", "gold_auto_cache_final", "gold_tf"].sort());
  assert.match(C.importSettings({ app: "other" }, t).errors[0], /設定ファイルではありません/);
  assert.match(C.importSettings({ app: "trade-desk", format: 2, data: {} }, t).errors[0], /形式/);
  assert.equal(C.resetGroup(s, "notify"), 1);
  assert.equal(s.getItem("gold_alerts"), null);
  assert.equal(s.getItem("desk-layout"), "beginner");
  assert.equal(C.resetGroup(s, "all"), 5);
  assert.equal(s.getItem("unrelated"), "x", "keys of other apps are never touched");
  const full = { setItem() { throw new Error("QuotaExceeded"); }, getItem() { return null; } };
  assert.equal(C.safeSet(full, "k", "v"), false);
});
