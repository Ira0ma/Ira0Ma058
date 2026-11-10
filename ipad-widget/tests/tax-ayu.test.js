// 確定申告タブのあゆさん版（Desk of Ayu フォーク）移植の検証。
// 本体版 tax.test.js と同じ観点を、フォーク側のファイル（ayu/tools.js・ayu/core.js）と
// フォーク側の保存キー（ayu_td_tax_v1）で確かめる。データ分離（本体の td_tax_v1 と混ざらない）もここで担保する
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("../../ayu/core.js", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../../ayu/tools.js", import.meta.url), "utf8");
const toolsLearn = fs.readFileSync(new URL("../learn/ayu/tools.js", import.meta.url), "utf8");
function block(src, name) {
  const a = src.indexOf("// [" + name + "-begin]"), b = src.indexOf("// [" + name + "-end]");
  assert.ok(a >= 0 && b > a, name + " ブロックが ayu/tools.js にある");
  return src.slice(a, b);
}
const store = {};
const sandbox = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
vm.createContext(sandbox);
vm.runInContext(core + "\nthis.C = TDCore;", sandbox);
assert.ok(sandbox.C && typeof sandbox.C.dailyBook === "function" && typeof sandbox.C.periodSummary === "function", "フォークの TDCore が読み込める");
vm.runInContext(block(tools, "hub-pure"), sandbox);
sandbox.get = (k, d) => { try { const v = sandbox.localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
vm.runInContext(block(tools, "tax-pure"), sandbox);
const TAXKEY = vm.runInContext("TAX", sandbox);
const taxNorm = vm.runInContext("taxNorm", sandbox), taxData = vm.runInContext("taxData", sandbox),
  taxYearEntry = vm.runInContext("taxYearEntry", sandbox), taxTradeYear = vm.runInContext("taxTradeYear", sandbox),
  taxSplit = vm.runInContext("taxSplit", sandbox), taxExpenseCandidates = vm.runInContext("taxExpenseCandidates", sandbox),
  taxHomeTable = vm.runInContext("taxHomeTable", sandbox), taxHomeCredit = vm.runInContext("taxHomeCredit", sandbox),
  taxHouseNorm = vm.runInContext("taxHouseNorm", sandbox), taxIcs = vm.runInContext("taxIcs", sandbox),
  taxPrepItems = vm.runInContext("taxPrepItems", sandbox);

test("保存キーは ayu_td_tax_v1 で、本体版 td_tax_v1 と分離している", () => {
  assert.equal(TAXKEY, "ayu_td_tax_v1");
  assert.ok(!tools.includes('"td_tax_v1"'), "ayu/tools.js に本体の保存キーが混ざっていない");
  assert.ok(toolsLearn.includes("[tax-pure-begin]") && toolsLearn.includes('"ayu_td_tax_v1"'), "配信用コピー（learn/ayu）にも移植済み");
});

test("フォークのバックアップ対象（GROUPS.trading）に ayu_td_tax_v1 が入り、本体のキーは拾わない", () => {
  const gs = sandbox.C.GROUPS.trading;
  assert.ok(Array.isArray(gs) && gs.some((re) => re.test("ayu_td_tax_v1")), "ayu_td_tax_v1 がバックアップ対象");
  assert.ok(!gs.some((re) => re.test("td_tax_v1")), "本体の td_tax_v1 はフォークのバックアップに混ざらない");
  assert.ok(!gs.some((re) => re.test("ayu_td_tax_v2")), "別キーを誤って拾わない");
});

test("taxData：読むのは ayu_td_tax_v1 だけ（本体キーのデータは見えない）", () => {
  delete store["ayu_td_tax_v1"]; delete store["td_tax_v1"];
  assert.equal(Object.keys(taxData().years).length, 0);
  store["td_tax_v1"] = JSON.stringify({ years: { "2026": { domesticFuturesPnl: 999 } } });
  assert.equal(taxYearEntry(taxData(), 2026).domesticFuturesPnl, null, "本体側のキーがあっても読まない");
  store["ayu_td_tax_v1"] = JSON.stringify({ years: { "2026": { domesticFuturesPnl: 123 } } });
  assert.equal(taxYearEntry(taxData(), 2026).domesticFuturesPnl, 123);
  delete store["ayu_td_tax_v1"]; delete store["td_tax_v1"];
});

test("taxNorm：0 と未入力（null）を区別し、housing が往復で消えない", () => {
  const n = taxNorm({ years: { "2026": { domesticFuturesPnl: 0, expensesFinal: null } }, housing: { enabled: true, moveInYear: 2024, balances: { "2026": 1000 } } });
  assert.equal(n.years["2026"].domesticFuturesPnl, 0, "国内分 0 は 0 のまま");
  assert.equal(n.years["2026"].expensesFinal, null);
  assert.equal(n.housing.enabled, true); assert.equal(n.housing.balances["2026"], 1000);
});

test("taxTradeYear：フォークの日誌・日次入力でも日次入力が正本で二重加算しない", () => {
  const rows = [
    { id: "1", time: "2026-01-10T10:00:00+09:00", day: "2026-01-10", key: "gold", side: "buy", pnl: 10000 },
    { id: "2", time: "2026-02-03T10:00:00+09:00", day: "2026-02-03", key: "usdjpy", side: "sell", pnl: -4000 },
    { id: "3", time: "2026-02-05T10:00:00+09:00", day: "2026-02-05", key: "other", side: "buy", pnl: 0, kind: "skip" }
  ];
  const daily = { "2026-02-03": { pnl: 7000, dep: 0, wd: 0, at: "2026-02-03T12:00:00+09:00" } };
  const r = taxTradeYear(rows, daily, 2026);
  assert.equal(r.total.pnl, 17000);
  assert.equal(r.months[0].pnl, 10000, "1月");
  assert.equal(r.months[1].pnl, 7000, "2月は日次入力が優先");
  const s = taxSplit(r.total.pnl, 5000);
  assert.equal(s.overseas, 12000, "海外分 ＝ 年合計 − 国内分");
  assert.equal(taxSplit(r.total.pnl, null).known, false, "国内分が未入力なら切り分けない");
});

test("taxExpenseCandidates：転記（fromTrade）を除き、按分候補だけ拾う", () => {
  const kb = [
    { id: "1", date: "2026-03-01", type: "out", cat: "通信費", amount: 12000, scope: "biz" },
    { id: "2", date: "2026-03-02", type: "out", cat: "その他事業費", amount: 999999, scope: "biz", fromTrade: "2026-03-02" },
    { id: "3", date: "2026-01-05", type: "out", cat: "通信", amount: 60000, scope: "life" },
    { id: "4", date: "2026-01-06", type: "out", cat: "食費", amount: 80000, scope: "life" }
  ];
  const c = taxExpenseCandidates(kb, 2026);
  assert.equal(c.bizTotal, 12000);
  assert.equal(c.lifeTotal, 60000);
});

test("住宅ローン控除：令和8年の表と限度額キャップが本体版と同じ", () => {
  assert.equal(taxHomeTable(2026, "energy", false).limit, 20000000, "令和8年・新築の省エネは2,000万円");
  assert.equal(taxHomeTable(2025, "energy", false).limit, 30000000, "令和6・7年は家計簿の表と整合");
  const h = taxHouseNorm({ enabled: true, moveInYear: 2026, category: "certified", balances: { "2026": 48000000 } });
  const c = taxHomeCredit(h, 2026);
  assert.equal(c.state, "ok"); assert.equal(c.base, 45000000, "残高4,800万円は限度額4,500万円でキャップ");
  assert.equal(c.credit, 315000, "控除額は min（残高, 限度額）×0.7%");
});

test("お知らせ（一度だけ）：キーは ayu_notice_tax_v1 で、バックアップ対象外のUI状態", () => {
  assert.ok(tools.includes('var TAX_NOTICE_KEY = "ayu_notice_tax_v1";'), "お知らせの既読キーがフォーク側にある");
  assert.ok(tools.includes("data-notice-open") && tools.includes("data-notice-close"), "「開いてみる」と「✕」のボタンがある");
  assert.ok(tools.includes("「確定申告」タブが追加されました"), "お知らせ文言がある");
  const pats = [];
  for (const g of Object.values(sandbox.C.GROUPS)) for (const re of g) pats.push(re);
  assert.ok(!pats.some((re) => re.test("ayu_notice_tax_v1")), "どのバックアップグループにも入っていない（UI状態）");
  assert.ok(!pats.some((re) => re.test("td_notice_tax_v1")), "本体側のキーを誤って拾わない");
});

test("工程チェックは8項目、ICS はフォーク名義（DeskOfAyu）で出す", () => {
  assert.equal(taxPrepItems(2026).length, 8);
  const ics = taxIcs([{ uid: "t1", date: "2027-03-15", summary: "確定申告書を提出する", desc: "" }], "20261110T000000Z");
  assert.ok(ics.includes("PRODID:-//DeskOfAyu//tax//JA"));
  assert.ok(ics.includes("UID:t1@deskofayu"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20270315"));
});
