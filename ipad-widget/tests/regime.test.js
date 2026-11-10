// 相場タイプ判定（仕様 market-regime-spec-20261105.md v2）：純関数 regimeJudge と補助関数の検証
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

const T0 = Date.UTC(2026, 10, 6, 13, 0, 0); // 2026-11-06 13:00 UTC（金曜）
function snap(over) {
  return Object.assign({
    key: "usdjpy", now: T0, marketOpen: true, calendarOk: true,
    dayStart: T0 - 12 * 3600e3, dayEnd: T0 + 12 * 3600e3,
    events: [], surge: null, newsCount: null, fxMult: null, nearLevel: null, narrow: null
  }, over || {});
}
function ev(mins, stars, cls, extra) {
  return Object.assign({ t: T0 + mins * 60000, stars: stars, cls: cls, name: "米・雇用統計", hhmm: "22:30", reactionAvg: null, reactionText: null }, extra || {});
}

test("仕様ケース1：静かな日・節目接近 → テクニカル寄り、根拠は節目と静けさ", () => {
  const r = C.regimeJudge(snap({ newsCount: 0, fxMult: 0.3, nearLevel: { label: "158.00" }, narrow: false }));
  assert.equal(r.ok, true);
  assert.equal(r.score, -25);
  assert.equal(r.stage, "tech1");
  assert.equal(r.stageJa, "テクニカル寄り");
  assert.deepEqual(r.reasons.map(x => x.text), ["節目 158.00 の攻防が中心", "目立った材料なし"]);
});

test("仕様ケース2：雇用統計30分前 → ドル円・ゴールドともファンダメンタル寄り以上、根拠にイベント名と時刻", () => {
  const e = [ev(30, 3, "us-jobs", { reactionAvg: 101.1, reactionText: "平均101pips" })];
  const r = C.regimeJudge(snap({ events: e, newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.equal(r.parts.approach, 50);
  assert.equal(r.parts.reaction, 10);
  assert.equal(r.score, 60);
  assert.equal(r.stage, "funda2");
  assert.match(r.reasons[0].text, /22:30 米・雇用統計（★3）が近い/);
  const g = C.regimeJudge(snap({ key: "gold", events: [ev(30, 3, "us-jobs", { reactionAvg: 78.65, reactionText: "平均$79" })], newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.equal(g.score, 60);
  assert.equal(g.stage, "funda2");
});

test("仕様ケース3：発表1時間後・急変なし → 反応中の加点が半分（+20）になっている", () => {
  const r = C.regimeJudge(snap({ events: [ev(-60, 3, "us-jobs")], newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.equal(r.parts.approach, 20);
  assert.match(r.reasons[0].text, /発表直後（反応中）/);
  const r0 = C.regimeJudge(snap({ events: [ev(0, 3, "us-jobs")], newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.equal(r0.parts.approach, 40);
  const r2 = C.regimeJudge(snap({ events: [ev(-119, 3, "us-jobs")], newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.ok(r2.parts.approach <= 1);
  const r3 = C.regimeJudge(snap({ events: [ev(-121, 3, "us-jobs")], newsCount: 0, fxMult: 0.2, narrow: false }));
  assert.equal(r3.parts.approach, 0); // 2時間を過ぎたら数えない
});

test("仕様ケース4：急変（緊急）＋ニュース裏付けあり → +30 とニュース分が効いて段階が上がる", () => {
  const r = C.regimeJudge(snap({ surge: { level: "emergency", win: 15, backed: true }, newsCount: 3, fxMult: 0.2, narrow: false }));
  assert.equal(r.parts.surge, 30);
  assert.equal(r.parts.news, 15);
  assert.equal(r.score, 45);
  assert.equal(r.stage, "funda1");
  assert.match(r.reasons[0].text, /急変（緊急水準）/);
});

test("仕様ケース5：カレンダー取得失敗 → 判定なし（前回値は出ない）", () => {
  const r = C.regimeJudge(snap({ calendarOk: false, events: [ev(30, 3, "us-jobs")] }));
  assert.equal(r.ok, false);
  assert.equal(r.why, "calendar");
});

test("仕様ケース6：休場 → 判定なし（市場は休み）", () => {
  const r = C.regimeJudge(snap({ marketOpen: false }));
  assert.equal(r.ok, false);
  assert.equal(r.why, "closed");
});

test("急変：裏付けがないものは半分（注意15→8、緊急30→15）", () => {
  const a = C.regimeJudge(snap({ surge: { level: "caution", win: 5, backed: false }, newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(a.parts.surge, 8);
  const b = C.regimeJudge(snap({ surge: { level: "emergency", win: 15, backed: false }, newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(b.parts.surge, 15);
});

test("重み表：BTCは米・金利政策が中（0.7）、米・雇用は弱（0.4）。日・政策はゴールド対象外", () => {
  const btc = C.regimeJudge(snap({ key: "btc", events: [ev(30, 3, "us-rates")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(btc.parts.approach, 35);
  const btc2 = C.regimeJudge(snap({ key: "btc", events: [ev(30, 3, "us-jobs")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(btc2.parts.approach, 20);
  const g = C.regimeJudge(snap({ key: "gold", events: [ev(30, 3, "jp-policy")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(g.parts.approach, 0);
  assert.equal(g.score, -10); // 静けさのみ
});

test("原油在庫は全銘柄で接近加点しない（オイルも含む）", () => {
  const o = C.regimeJudge(snap({ key: "usoil", events: [ev(30, 3, "oil-inv", { name: "米・原油在庫" })], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(o.parts.approach, 0);
});

test("★2は半分程度、★1は数えない。当日より先のイベントは数えない", () => {
  const s2 = C.regimeJudge(snap({ events: [ev(30, 2, "us-jobs")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(s2.parts.approach, 25);
  const s1 = C.regimeJudge(snap({ events: [ev(30, 1, "us-jobs")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(s1.parts.approach, 0);
  const later = C.regimeJudge(snap({ events: [ev(60 * 30, 3, "us-jobs")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(later.parts.approach, 0); // dayEnd を超える
});

test("接近は寄与が最大の1件だけ（二重数え禁止）", () => {
  const r = C.regimeJudge(snap({ events: [ev(30, 2, "us-jobs"), ev(120, 3, "us-prices", { name: "米・CPI" })], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(r.parts.approach, 35); // ★3・3時間以内の35が最大。25とは足さない
  assert.match(r.reasons[0].text, /CPI/);
});

test("ニュース：2件+10・3件+15・4件以上+20、1件は0", () => {
  const mk = n => C.regimeJudge(snap({ newsCount: n, fxMult: 0, narrow: false }));
  assert.equal(mk(1).parts.news, 0);
  assert.equal(mk(2).parts.news, 10);
  assert.equal(mk(3).parts.news, 15);
  assert.equal(mk(5).parts.news, 20);
});

test("DXY・金利：倍率0.6以下は0点、1.5倍で+20", () => {
  const mk = m => C.regimeJudge(snap({ fxMult: m, newsCount: 0, narrow: false }));
  assert.equal(mk(0.51).parts.fx, 0);
  assert.equal(mk(1.5).parts.fx, 20);
  assert.equal(mk(3).parts.fx, 20);
});

test("スコアは −100〜+100 に丸める。前回反応の上乗せは最大+10", () => {
  const r = C.regimeJudge(snap({
    events: [ev(30, 3, "us-jobs", { reactionAvg: 9999, reactionText: "平均9999pips" })],
    surge: { level: "emergency", win: 15, backed: true }, newsCount: 9, fxMult: 2.5, narrow: false
  }));
  assert.equal(r.parts.reaction, 10);
  assert.equal(r.score, 100);
});

test("段階の区切り：+25／−25／+60 の境界", () => {
  const b25 = C.regimeJudge(snap({ events: [ev(30, 2, "us-jobs")], newsCount: 0, fxMult: 0, narrow: false }));
  assert.equal(b25.score, 25); assert.equal(b25.stage, "funda1");
  const m24 = C.regimeJudge(snap({ newsCount: 2, fxMult: 0, nearLevel: { label: "158.00" }, narrow: true }));
  assert.equal(m24.score, 10 - 15 - 10); assert.equal(m24.stage, "mixed"); // +10 −25 = −15
});

test("部分欠損：ニュース・DXY・値幅が取れなくても判定は続け、欠損を記録する", () => {
  const r = C.regimeJudge(snap({ events: [ev(30, 3, "us-jobs")], newsCount: null, fxMult: null, narrow: null }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing.slice().sort(), ["fx", "news", "range"]);
});

test("イベント分類 regimeEventClass", () => {
  assert.equal(C.regimeEventClass("USD", "Non-Farm Employment Change"), "us-jobs");
  assert.equal(C.regimeEventClass("USD", "Unemployment Claims"), "us-jobs");
  assert.equal(C.regimeEventClass("USD", "Core CPI m/m"), "us-prices");
  assert.equal(C.regimeEventClass("USD", "Federal Funds Rate"), "us-rates");
  assert.equal(C.regimeEventClass("USD", "FOMC Member Bowman Speaks"), "us-rates");
  assert.equal(C.regimeEventClass("USD", "Crude Oil Inventories"), "oil-inv");
  assert.equal(C.regimeEventClass("JPY", "BOJ Policy Rate"), "jp-policy");
  assert.equal(C.regimeEventClass("JPY", "BOJ Gov Ueda Speaks"), "jp-policy");
  assert.equal(C.regimeEventClass("JPY", "Tokyo Core CPI y/y"), "jp-data");
  assert.equal(C.regimeEventClass("EUR", "ECB Press Conference"), "eu-policy");
  assert.equal(C.regimeEventClass("USD", "ISM Manufacturing PMI"), null);
  assert.equal(C.regimeEventClass("AUD", "Cash Rate"), null);
});

test("regimeFxMult：日足の中央値を基準に当日の動きの倍率を出す", () => {
  const c1d = [];
  for (let i = 0; i < 25; i++) c1d.push([i * 86400, 100, 100.5, 100, 100.25]); // 日次レンジ 0.5
  const inst = { dxy: { price: 101, prevClose: 100.25, candles: { "1d": c1d } }, us10y: null };
  const m = C.regimeFxMult(inst);
  assert.ok(Math.abs(m - 1.5) < 1e-9); // 動き 0.75 ÷ 基準 0.5
  assert.equal(C.regimeFxMult(null), null);
  assert.equal(C.regimeFxMult({}), null);
});

test("regimeNarrow：同じ時間帯の中央値の半分以下なら true、材料不足は null", () => {
  const bars = [];
  const day = 86400e3, H = 3600e3;
  for (let d = 0; d < 8; d++) for (let h = 0; h < 24; h++) {
    const t = Date.UTC(2026, 10, 1) + d * day + h * H;
    bars.push({ t: t, h: 101, l: 100 }); // ふだんは3時間で幅3（重なりを込めて概算）
  }
  // 直近3時間だけ狭くする（幅0.4）
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  const bars2 = bars.map(b => (b.t >= now - 4 * H && b.t < now) ? { t: b.t, h: 100.4, l: 100 } : b);
  assert.equal(C.regimeNarrow(bars2, now), true);
  assert.equal(C.regimeNarrow(bars.slice(0, 10), now), null);
});

test("regimeNewsCount：キーワード一致だけを数え、同じ材料の続報は束ねる", () => {
  const now = Date.UTC(2026, 10, 9, 7, 38, 0);
  const items = [
    { t: now / 1000 - 3600, title: "7月30日 円買い・ドル売り為替介入7兆9756億円 過去最大" },
    { t: now / 1000 - 3500, title: "７月３０日の円買い介入、過去最大…財務省が介入実績を発表" },
    { t: now / 1000 - 3000, title: "良い雇用統計でドル相場反転しインフレ警戒も" },
    { t: now / 1000 - 2000, title: "東京都内の新築戸建て平均価格、初の7000万円超え" },
    { t: now / 1000 - 5 * 3600, title: "日銀総裁、円安に言及" } // 3時間より前は数えない
  ];
  const r = C.regimeNewsCount(items, "usdjpy", now);
  assert.equal(r.raw, 3); // 介入×2（同じ材料）＋雇用統計。戸建てはキーワードなし
  assert.equal(r.count, 2);
  assert.equal(C.regimeNewsCount(null, "usdjpy", now), null);
});
