// 確定申告タブ（フェーズ2a）の集計ロジックの検証。tools.js の [tax-pure] ブロック（依存先の [hub-pure] も）を切り出して評価する
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("../core.js", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../tools.js", import.meta.url), "utf8");
function block(src, name) {
  const a = src.indexOf("// [" + name + "-begin]"), b = src.indexOf("// [" + name + "-end]");
  assert.ok(a >= 0 && b > a, name + " ブロックが tools.js にある");
  return src.slice(a, b);
}
const store = {};
const sandbox = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
vm.createContext(sandbox);
vm.runInContext(core + "\nthis.C = TDCore;", sandbox);
assert.ok(sandbox.C && typeof sandbox.C.dailyBook === "function" && typeof sandbox.C.periodSummary === "function", "TDCore が読み込める");
// hub-pure の get は C 経由の load を使う実装なので、先に C だけ入れた状態で評価する
vm.runInContext(block(tools, "hub-pure"), sandbox);
// tax-pure の get は tools 全体の safeGet 相当をスタブする（localStorage から JSON を読むだけの最小実装）
sandbox.get = (k, d) => { try { const v = sandbox.localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
vm.runInContext(block(tools, "tax-pure"), sandbox);
const T = sandbox;
// 内部の var 宣言は vm の this に乗らないため、必要な関数を式評価で取り出す
const taxNorm = vm.runInContext("taxNorm", sandbox), taxYears = vm.runInContext("taxYears", sandbox),
  taxTradeYear = vm.runInContext("taxTradeYear", sandbox), taxSplit = vm.runInContext("taxSplit", sandbox),
  taxExpenseCandidates = vm.runInContext("taxExpenseCandidates", sandbox), taxCombine = vm.runInContext("taxCombine", sandbox),
  taxFilingHint = vm.runInContext("taxFilingHint", sandbox), taxCarryRows = vm.runInContext("taxCarryRows", sandbox),
  taxYearEntry = vm.runInContext("taxYearEntry", sandbox), taxData = vm.runInContext("taxData", sandbox);
// フェーズ2cの関数
const taxChecksNorm = vm.runInContext("taxChecksNorm", sandbox), taxArchiveNorm = vm.runInContext("taxArchiveNorm", sandbox),
  taxReconAnnual = vm.runInContext("taxReconAnnual", sandbox), taxReconMonths = vm.runInContext("taxReconMonths", sandbox),
  taxMt5ParseNum = vm.runInContext("taxMt5ParseNum", sandbox), taxMt5Agg = vm.runInContext("taxMt5Agg", sandbox),
  taxBlueSim = vm.runInContext("taxBlueSim", sandbox), taxPrepItems = vm.runInContext("taxPrepItems", sandbox),
  taxIcs = vm.runInContext("taxIcs", sandbox), taxSheetRows = vm.runInContext("taxSheetRows", sandbox),
  TAX_ARCHIVE_ITEMS = vm.runInContext("TAX_ARCHIVE_ITEMS", sandbox);

test("core.js のバックアップ対象（GROUPS.trading）に td_tax_v1 が入っている", () => {
  const gs = sandbox.C.GROUPS.trading;
  assert.ok(Array.isArray(gs) && gs.some((re) => re.test("td_tax_v1")), "td_tax_v1 がバックアップ対象");
  assert.ok(!gs.some((re) => re.test("td_tax_v2")), "別キーを誤って拾わない");
});

test("taxNorm：壊れた入力は空の形に、0 と未入力（null）を区別する", () => {
  const emptyJson = JSON.stringify({ years: {}, carry: [], opening: { checks: {}, memo: "" }, prep: { checks: {} }, archive: {}, housing: { enabled: false, moveInYear: null, category: "certified", specialPerson: false, shareRatio: null, priceCap: null, balances: {}, incomeTax: {} } });
  assert.equal(JSON.stringify(taxNorm(null)), emptyJson);
  assert.equal(JSON.stringify(taxNorm("x")), emptyJson);
  const n = taxNorm({ years: { "2026": { salary: { gross: 5000000, afterDeduction: 3460000, deductionsTotal: "x", withheld: 200000 }, domesticFuturesPnl: 0, expensesFinal: null, cryptoPnl: -30000, carry: [{ id: "a", fromYear: 2025, amount: 120000 }, { id: "b", fromYear: 2025, amount: -5 }, { fromYear: "x", amount: 10 }] }, "26": { salary: {} } }, opening: { checks: { a: true, b: 1 }, memo: 5 } });
  const y = n.years["2026"];
  assert.equal(y.salary.gross, 5000000);
  assert.equal(y.salary.deductionsTotal, null, "数字でないものは未入力");
  assert.equal(y.domesticFuturesPnl, 0, "国内分 0 は 0 のまま（未入力ではない）");
  assert.equal(y.expensesFinal, null);
  assert.equal(y.cryptoPnl, -30000);
  assert.equal(y.carry, undefined, "繰越台帳は年エントリでなく直下に持つ");
  assert.equal(n.carry.length, 1, "金額が正でない繰越行は捨てる（年エントリ内の行も直下へ寄せる）");
  assert.equal(n.carry[0].fromYear, 2025); assert.equal(n.carry[0].amount, 120000);
  assert.equal(n.years["26"], undefined, "4桁でない年キーは捨てる");
  assert.equal(JSON.stringify(n.opening.checks), JSON.stringify({ a: true }));
});

test("taxData／taxYearEntry：保存がなければ空の年エントリを返す", () => {
  delete store["td_tax_v1"];
  const d = taxData();
  assert.equal(Object.keys(d.years).length, 0);
  const e = taxYearEntry(d, 2026);
  assert.equal(e.domesticFuturesPnl, null);
  assert.equal(e.carry, undefined, "台帳は年エントリに持たない（年またぎで1つ）");
  store["td_tax_v1"] = JSON.stringify({ years: { "2026": { domesticFuturesPnl: 123 } } });
  assert.equal(taxYearEntry(taxData(), 2026).domesticFuturesPnl, 123);
  delete store["td_tax_v1"];
});

test("taxYears：日次入力・日誌・入力済みの年＋今年を新しい順に並べる", () => {
  const rows = [{ day: "2024-05-01" }], daily = { "2025-03-02": { pnl: 1 }, "bad": { pnl: 1 } };
  const data = { years: { "2023": {} } };
  const ys = taxYears(rows, daily, data, Date.parse("2026-06-01T00:00:00+09:00"));
  assert.equal(Array.from(ys).join(","), "2026,2025,2024,2023");
});

test("taxTradeYear：年合計は日次入力が正本で日誌は二重加算しない。月別と銘柄別も出す", () => {
  // 日誌：1/10 ゴールド +10,000（日次入力なし→日誌が効く）、2/3 ドル円 −4,000（日次入力 +7,000 が優先）
  const rows = [
    { id: "1", time: "2026-01-10T10:00:00+09:00", day: "2026-01-10", key: "gold", side: "buy", pnl: 10000 },
    { id: "2", time: "2026-02-03T10:00:00+09:00", day: "2026-02-03", key: "usdjpy", side: "sell", pnl: -4000 },
    { id: "3", time: "2026-02-05T10:00:00+09:00", day: "2026-02-05", key: "other", side: "buy", pnl: 0, kind: "skip" },
    { id: "4", time: "2025-12-31T10:00:00+09:00", day: "2025-12-31", key: "gold", side: "buy", pnl: 99999 }
  ];
  const daily = { "2026-02-03": { pnl: 7000, dep: 0, wd: 0, at: "2026-02-03T12:00:00+09:00" } };
  const r = taxTradeYear(rows, daily, 2026);
  assert.equal(r.total.pnl, 17000, "年合計 = 日誌のみの日 10,000 + 日次入力のある日 7,000");
  assert.equal(r.total.days, 2);
  assert.equal(r.months[0].pnl, 10000, "1月");
  assert.equal(r.months[1].pnl, 7000, "2月は日次入力が優先");
  assert.equal(r.months[2].pnl, null, "記録のない月は null");
  const gold = Array.from(r.insts).find((g) => g.key === "gold"), usdjpy = Array.from(r.insts).find((g) => g.key === "usdjpy");
  assert.equal(gold.bal, 10000, "銘柄別は日誌ベースの参考値（bal が損益）");
  assert.equal(usdjpy.bal, -4000);
  assert.equal(gold.inc, 10000); assert.equal(usdjpy.out, 4000);
  assert.equal(r.hasTrades, true);
  const empty = taxTradeYear([], {}, 2026);
  assert.equal(empty.total.pnl, 0); assert.equal(empty.hasTrades, false);
});

test("taxSplit：海外分 ＝ 年合計 − 国内分。国内分が未入力なら切り分けない", () => {
  const s0 = taxSplit(17000, null);
  assert.equal(s0.known, false); assert.equal(s0.domestic, null); assert.equal(s0.overseas, null);
  const s1 = taxSplit(17000, 5000);
  assert.equal(s1.known, true); assert.equal(s1.domestic, 5000); assert.equal(s1.overseas, 12000);
  const s2 = taxSplit(17000, 0);
  assert.equal(s2.known, true); assert.equal(s2.overseas, 17000, "国内分 0 は切り分けできる");
  const s3 = taxSplit(-20000, -50000);
  assert.equal(s3.overseas, 30000);
});

test("taxExpenseCandidates：事業分は転記（fromTrade）を除き、生活分は按分候補カテゴリだけ拾う", () => {
  const kb = [
    { id: "1", date: "2026-03-01", type: "out", cat: "通信費", amount: 12000, scope: "biz" },
    { id: "2", date: "2026-03-02", type: "out", cat: "その他事業費", amount: 999999, scope: "biz", fromTrade: "2026-03-02" },
    { id: "3", date: "2026-01-05", type: "out", cat: "通信", amount: 60000, scope: "life" },
    { id: "4", date: "2026-01-06", type: "out", cat: "食費", amount: 80000, scope: "life" },
    { id: "5", date: "2025-01-06", type: "out", cat: "通信", amount: 11111, scope: "life" },
    { id: "6", date: "2026-02-01", type: "in", cat: "給料", amount: 300000, scope: "life" }
  ];
  const c = taxExpenseCandidates(kb, 2026);
  assert.equal(c.bizTotal, 12000, "転記した記録は候補に入れない");
  assert.equal(c.lifeTotal, 60000, "按分候補は通信・光熱費・住まい・交通だけ");
  assert.equal(c.lifeRows[0].cat, "通信");
});

test("taxCombine：給与＋海外分（経費を引き0下限）＋暗号資産（0下限）＋事業の目安", () => {
  const c1 = taxCombine({ salaryAfter: 3460000, overseas: 12000, expensesFinal: 5000, cryptoPnl: 30000, bizBal: null });
  assert.equal(c1.tradeMisc, 7000);
  assert.equal(c1.cryptoMisc, 30000);
  assert.equal(c1.nonSalary, 37000);
  assert.equal(c1.total, 3497000);
  const c2 = taxCombine({ salaryAfter: 3460000, overseas: -50000, expensesFinal: null, cryptoPnl: -10000, bizBal: -20000 });
  assert.equal(c2.tradeMisc, 0, "雑所得は0を下限");
  assert.equal(c2.cryptoMisc, 0);
  assert.equal(c2.nonSalary, -20000, "事業の赤字はそのまま");
  const c3 = taxCombine({ salaryAfter: null, overseas: null, expensesFinal: null, cryptoPnl: null, bizBal: null });
  assert.equal(c3.tradeMisc, null); assert.equal(c3.total, null, "給与未入力なら合計は出さない");
});

test("taxFilingHint：20万円の目安で分岐し、断定はしない形（levelだけ返す）", () => {
  assert.equal(taxFilingHint(200001).level, "over");
  assert.equal(taxFilingHint(200000).level, "within");
  assert.equal(taxFilingHint(0).level, "within");
  assert.equal(taxFilingHint(null).level, "unknown");
});

/* ---------- フェーズ2b：住宅ローン・経費ガイド・ふるさと納税・着地見込み ---------- */
const taxHouseNorm = vm.runInContext("taxHouseNorm", sandbox), taxHomeTable = vm.runInContext("taxHomeTable", sandbox),
  taxHomeCredit = vm.runInContext("taxHomeCredit", sandbox), taxHomeOverflow = vm.runInContext("taxHomeOverflow", sandbox),
  taxQuick = vm.runInContext("taxQuick", sandbox), taxEstimate = vm.runInContext("taxEstimate", sandbox),
  taxFurusatoLimit = vm.runInContext("taxFurusatoLimit", sandbox), taxDonationPickups = vm.runInContext("taxDonationPickups", sandbox),
  taxApportionEst = vm.runInContext("taxApportionEst", sandbox), TAX_GUIDE = vm.runInContext("TAX_GUIDE", sandbox),
  TAX_CAT_MAP_LIFE = vm.runInContext("TAX_CAT_MAP_LIFE", sandbox), TAX_CAT_MAP_BIZ = vm.runInContext("TAX_CAT_MAP_BIZ", sandbox);

test("taxHouseNorm：壊れた値は既定に直し、残高・所得税額は年ごとの正の数だけ残す", () => {
  const d = taxHouseNorm(null);
  assert.equal(d.enabled, false); assert.equal(d.moveInYear, null); assert.equal(d.category, "certified");
  const n = taxHouseNorm({ enabled: true, moveInYear: 2026, category: "zeh", specialPerson: true, shareRatio: 150, priceCap: -5, balances: { "2026": 42000000, "2025": -1, "26": 5 }, incomeTax: { "2026": 0, "2027": "x" } });
  assert.equal(n.enabled, true); assert.equal(n.moveInYear, 2026); assert.equal(n.category, "zeh"); assert.equal(n.specialPerson, true);
  assert.equal(n.shareRatio, 100, "割合は0〜100に丸める");
  assert.equal(n.priceCap, null, "取得対価が正でなければ未入力");
  assert.equal(n.balances["2026"], 42000000); assert.equal(n.balances["2025"], undefined, "残高が正でない年は捨てる"); assert.equal(n.balances["26"], undefined);
  assert.equal(n.incomeTax["2026"], 0, "所得税額は0も残す"); assert.equal(n.incomeTax["2027"], undefined);
  assert.equal(taxHouseNorm({ category: "買取再販" }).category, "certified", "知らない区分は既定に戻す（買取再販は未確認のため選択肢に無い）");
  const rt = taxNorm({ housing: { enabled: true, moveInYear: 2024, balances: { "2026": 1000 } } });
  assert.equal(rt.housing.enabled, true); assert.equal(rt.housing.balances["2026"], 1000, "taxNorm の往復で housing が消えない（2a の保存で消えないこと）");
});

test("taxHomeTable：令和6・7年は家計簿の表と整合、令和8年は照合済みの表（省エネ低下・中古の拡大・特例の上乗せ）", () => {
  const kb = { certified: [45000000, 13], zeh: [35000000, 13], energy: [30000000, 13], "other-new": [20000000, 10], "certified-used": [30000000, 10], "zeh-used": [30000000, 10], "energy-used": [30000000, 10], "other-used": [20000000, 10] };
  for (const cat of Object.keys(kb)) {
    const t = taxHomeTable(2025, cat, false);
    assert.equal(t.limit, kb[cat][0], "2025年・" + cat + " の限度額は家計簿側と一致");
    assert.equal(t.years, kb[cat][1], "2025年・" + cat + " の期間は家計簿側と一致");
  }
  assert.equal(taxHomeTable(2026, "certified", false).limit, 45000000);
  assert.equal(taxHomeTable(2026, "certified", true).limit, 50000000, "令和8年・認定の特例は5,000万円");
  assert.equal(taxHomeTable(2026, "zeh", true).limit, 45000000, "令和8年・ZEHの特例は4,500万円");
  assert.equal(taxHomeTable(2026, "energy", false).limit, 20000000, "令和8年・新築の省エネは2,000万円に低下");
  assert.equal(taxHomeTable(2026, "energy", true).limit, 30000000);
  assert.equal(taxHomeTable(2026, "other-new", false).years, 0, "令和8年・新築のその他は原則対象外");
  assert.equal(taxHomeTable(2026, "certified-used", false).limit, 35000000, "令和8年・中古の認定等は3,500万円に拡大");
  assert.equal(taxHomeTable(2026, "certified-used", false).years, 13, "令和8年・中古の認定等は13年に拡大");
  assert.equal(taxHomeTable(2026, "energy-used", false).limit, 20000000);
  assert.equal(taxHomeTable(2026, "energy-used", false).years, 13);
  assert.equal(taxHomeTable(2026, "other-used", true).limit, 20000000, "中古のその他は特例の上乗せなし");
});

test("taxHomeCredit：限度額キャップ・持分按分・取得対価・100円未満切り捨て・期間の判定", () => {
  const H = (o) => taxHouseNorm(Object.assign({ enabled: true, moveInYear: 2026, category: "certified" }, o));
  assert.equal(taxHomeCredit(taxHouseNorm(null), 2026).state, "off");
  assert.equal(taxHomeCredit(H({}), 2026).state, "nobalance", "残高が未入力なら計算しない");
  const c1 = taxHomeCredit(H({ balances: { "2026": 48000000 } }), 2026);
  assert.equal(c1.state, "ok"); assert.equal(c1.nth, 1); assert.equal(c1.base, 45000000, "残高4,800万円は限度額4,500万円でキャップ");
  assert.equal(c1.credit, 315000, "4,500万円 × 0.7% = 315,000円");
  const c2 = taxHomeCredit(H({ balances: { "2026": 48000000 }, shareRatio: 50 }), 2026);
  assert.equal(c2.shared, 24000000, "持分50%で残高を按分"); assert.equal(c2.credit, 168000, "2,400万円 × 0.7% = 168,000円");
  const c3 = taxHomeCredit(H({ balances: { "2026": 48000000 }, priceCap: 30000000 }), 2026);
  assert.equal(c3.base, 30000000, "取得対価が限度額より小さければそちらでキャップ"); assert.equal(c3.credit, 210000);
  const c4 = taxHomeCredit(H({ category: "energy", balances: { "2026": 12345678 } }), 2026);
  assert.equal(c4.credit, 86400, "12,345,678 × 0.7% = 86,419.746 → 100円未満切り捨てで 86,400円");
  const c5 = taxHomeCredit(H({ category: "other-used", moveInYear: 2020, balances: { "2031": 1000000 } }), 2031);
  assert.equal(c5.state, "over", "中古・その他は10年まで。12年目は期間外");
  assert.equal(taxHomeCredit(H({ balances: { "2025": 1000000 } }), 2025).state, "before", "入居前は出さない");
  assert.equal(taxHomeCredit(H({ category: "other-new", balances: { "2026": 1000000 } }), 2026).state, "na", "令和8年の新築・その他は原則対象外");
});

test("taxHomeOverflow：所得税で引ききれない分と、住民税側の上限（課税総所得×5%・最高97,500円）", () => {
  assert.equal(taxHomeOverflow(315000, null, 3000000), null, "所得税額が未入力なら出さない");
  const o1 = taxHomeOverflow(315000, 100000, 3493000);
  assert.equal(o1.excess, 215000);
  assert.equal(o1.residentEst, 97500, " min（215,000, 174,650, 97,500）= 97,500");
  const o2 = taxHomeOverflow(120000, 100000, 1000000);
  assert.equal(o2.excess, 20000); assert.equal(o2.residentEst, 20000, "引ききれない額が小さい方");
  const o3 = taxHomeOverflow(50000, 80000, 3000000);
  assert.equal(o3.excess, 0); assert.equal(o3.residentEst, 0, "引ききれていれば住民税側はゼロ");
});

test("経費ガイド：26費目（A8・B10・C8）と、家計簿カテゴリの対応表（生活9・事業18）", () => {
  const g = Array.from(TAX_GUIDE);
  assert.equal(g.length, 26);
  assert.equal(g.filter((x) => x.grade === "A").length, 8);
  assert.equal(g.filter((x) => x.grade === "B").length, 10);
  assert.equal(g.filter((x) => x.grade === "C").length, 8);
  assert.ok(g.every((x) => x.name && x.why), "全費目に理由がある");
  assert.ok(g.filter((x) => x.grade !== "C").every((x) => x.proof), "A・Bには残すべき証拠がある");
  assert.equal(Array.from(TAX_CAT_MAP_LIFE).length, 9);
  assert.equal(Array.from(TAX_CAT_MAP_BIZ).length, 18);
});

test("taxApportionEst：按分後の目安（割合が未入力なら null）", () => {
  assert.equal(taxApportionEst(60000, 50), 30000);
  assert.equal(taxApportionEst(24000, 25), 6000);
  assert.equal(taxApportionEst(60000, null), null);
});

test("taxQuick：国税庁 No.2260 の速算表（1,000円未満切り捨て・区間の税率）", () => {
  assert.equal(taxQuick(1800000).tax, 90000); assert.equal(taxQuick(1800000).rate, 0.05);
  assert.equal(taxQuick(2688000).tax, 171300, "2,688,000 × 10% − 97,500");
  assert.equal(taxQuick(3300000).tax, 232500, "3,300,000 × 20% − 427,500");
  assert.equal(taxQuick(5000000).tax, 572500);
  assert.equal(taxQuick(7000000).tax, 974000, "No.2260 の具体例と一致");
  assert.equal(taxQuick(2688999).tax, 171300, "課税所得は1,000円未満を切り捨ててから当てる");
  assert.equal(taxQuick(0).tax, 0); assert.equal(taxQuick(null).tax, 0);
});

test("taxEstimate：着地見込みの概算（総合＋分離＋復興、住宅ローン控除、源泉との差、住民税の所得割）", () => {
  assert.equal(taxEstimate({ salaryAfter: 3460000, tradeMisc: 0, cryptoMisc: 40000, bizBal: -12000, deductionsTotal: null, domestic: 5000, carryUsable: 0, withheld: 180000, housingCredit: 0 }), null, "所得控除の合計が未入力なら計算しない");
  const e = taxEstimate({ salaryAfter: 3460000, tradeMisc: 0, cryptoMisc: 40000, bizBal: -12000, deductionsTotal: 800000, domestic: 5000, carryUsable: 0, withheld: 180000, housingCredit: 315000 });
  assert.equal(e.compIncome, 3488000, "給与3,460,000＋暗号40,000−事業12,000");
  assert.equal(e.taxable, 2688000, "3,488,000 − 800,000");
  assert.equal(e.taxComp, 171300); assert.equal(e.domTax, 750, "国内分5,000 × 15%");
  assert.equal(e.baseTax, 172050); assert.equal(e.fukko, 3613, "172,050 × 2.1%（円未満切り捨て）");
  assert.equal(e.national, 175663);
  assert.equal(e.creditUsed, 175663, "住宅ローン控除は所得税の範囲で使う"); assert.equal(e.nationalAfter, 0);
  assert.equal(e.balance, -180000, "源泉180,000との差は還付側");
  assert.equal(e.resident, 269050, "住民税の所得割の目安 = 268,800 ＋ 国内分250");
  assert.equal(e.shotokuWari, 269050);
  const e2 = taxEstimate({ salaryAfter: 3460000, tradeMisc: 0, cryptoMisc: 0, bizBal: 0, deductionsTotal: 800000, domestic: -50000, carryUsable: 80000, withheld: null, housingCredit: 0 });
  assert.equal(e2.domTaxable, 0, "国内分の赤字は繰越で相殺した後の目安（分離の課税はゼロ）");
  assert.equal(e2.balance, null, "源泉徴収税額が未入力なら納付／還付の方向は出さない");
});

test("taxFurusatoLimit：逆算式（所得割×20% ÷（90%−税率×1.021）＋2,000）と総所得の30%の抑え", () => {
  assert.equal(taxFurusatoLimit(269050, 0.10, 3493000), 69000, "269,050×20% ÷ 0.7979 = 67,439… → 千円未満切り捨て 67,000 ＋ 2,000");
  assert.equal(taxFurusatoLimit(300000, 0.10, 10000000), 77000);
  assert.equal(taxFurusatoLimit(300000, 0.10, 100000), 30000, "総所得金額等×30%で抑える");
  assert.equal(taxFurusatoLimit(0, 0.10, 3493000), null, "所得割がなければ目安は出さない");
});

test("taxDonationPickups：メモに「ふるさと納税」「寄付」を含む支出だけを、その年分で拾う", () => {
  const kb = [
    { id: "1", date: "2026-04-01", type: "out", cat: "その他", amount: 20000, memo: "ふるさと納税 ○○市", scope: "life" },
    { id: "2", date: "2026-05-01", type: "out", cat: "その他", amount: 10000, memo: "寄付", scope: "life" },
    { id: "3", date: "2026-06-01", type: "out", cat: "食費", amount: 5000, memo: "買い物", scope: "life" },
    { id: "4", date: "2025-06-01", type: "out", cat: "その他", amount: 7000, memo: "ふるさと納税", scope: "life" },
    { id: "5", date: "2026-07-01", type: "in", cat: "その他収入", amount: 3000, memo: "寄付", scope: "life" }
  ];
  const p = taxDonationPickups(kb, 2026);
  assert.equal(p.total, 30000); assert.equal(p.count, 2, "支出だけ・その年だけ");
});

test("taxCarryRows：発生年の翌年から3年使え、残り年数と期限切れを出す", () => {
  const carry = [{ id: "a", fromYear: 2025, amount: 120000 }];
  const inFirst = taxCarryRows(carry, 2026)[0];
  assert.equal(inFirst.usable, true); assert.equal(inFirst.remaining, 2); assert.equal(inFirst.lastYear, 2028);
  const inLast = taxCarryRows(carry, 2028)[0];
  assert.equal(inLast.usable, true); assert.equal(inLast.remaining, 0, "最後の年は残り0");
  const after = taxCarryRows(carry, 2029)[0];
  assert.equal(after.usable, false); assert.equal(after.expired, true);
  const sameYear = taxCarryRows(carry, 2025)[0];
  assert.equal(sameYear.usable, false, "発生年のうちは使えない"); assert.equal(sameYear.expired, false);
});

/* ---------- フェーズ2c ---------- */
test("2c taxNorm：申告準備チェック・保存アーカイブ・MT5転記値の正規化", () => {
  const n = taxNorm({ prep: { checks: { salary: true, bogus: 1, file: false } }, archive: { "2025": { receipts: true, reports: 1 }, "25": { receipts: true }, junk: { receipts: true } }, years: { "2025": { mt5Annual: 120000, mt5Months: { "1": 10000, "13": 5, "2": "x", "12": -3000 } } } });
  assert.equal(JSON.stringify(n.prep.checks), JSON.stringify({ salary: true }), "true の項目だけ残る");
  assert.equal(JSON.stringify(n.archive), JSON.stringify({ "2025": { receipts: true } }), "年は4桁だけ・値が真の項目だけ");
  assert.equal(n.years["2025"].mt5Annual, 120000);
  assert.equal(JSON.stringify(n.years["2025"].mt5Months), JSON.stringify({ "1": 10000, "12": -3000 }), "月は1〜12の数字だけ");
  assert.equal(taxYearEntry(taxNorm(null), 2099).mt5Annual, null);
  assert.equal(JSON.stringify(taxYearEntry(taxNorm(null), 2099).mt5Months), "{}");
  assert.equal(JSON.stringify(taxChecksNorm(null)), "{}");
  assert.equal(JSON.stringify(taxArchiveNorm({ "2025": {} })), "{}");
});

test("2c 突合：年間の差額はアプリ − レポート。未入力は null", () => {
  assert.equal(taxReconAnnual(500000, null), null);
  assert.equal(JSON.stringify(taxReconAnnual(500000, 480000)), JSON.stringify({ app: 500000, report: 480000, diff: 20000 }));
  assert.equal(taxReconAnnual(500000, 500000).diff, 0);
  const rm = taxReconMonths([{ month: 1, pnl: 10000 }, { month: 2, pnl: null }, { month: 3, pnl: -5000 }], { "1": 9000, "3": -5000 });
  assert.equal(JSON.stringify(rm[0]), JSON.stringify({ month: 1, app: 10000, report: 9000, diff: 1000 }));
  assert.equal(rm[1].diff, null, "アプリの記録が無い月は差額を出さない");
  assert.equal(rm[2].diff, 0);
});

test("2c MT5：レポート数値の読み取りと、ポジション行の年・月別集計", () => {
  assert.equal(taxMt5ParseNum("1,234.56"), 1234.56);
  assert.equal(taxMt5ParseNum("-500"), -500);
  assert.equal(taxMt5ParseNum("(1,000)"), -1000);
  assert.equal(taxMt5ParseNum(""), null);
  assert.equal(taxMt5ParseNum("―"), null);
  assert.equal(taxMt5ParseNum(42), 42);
  const agg = taxMt5Agg([
    { close: "2025-01-15", profit: "10,000", commission: "-300", swap: "-50" },
    { close: "2025-01-20", profit: -2000, commission: -100, swap: 0 },
    { close: "2025-12-31", profit: "5000", commission: "0", swap: "20" },
    { close: "2024-06-01", profit: 777, commission: 0, swap: 0 },
    { close: "", profit: 999, commission: 0, swap: 0 },
    { close: "2025-03-01", profit: "x", commission: 0, swap: 0 }
  ]);
  assert.equal(agg.count, 4, "日付なし・損益が読めない行は数えない");
  assert.equal(agg.annual["2025"], 12570, "損益＋手数料＋スワップの合計");
  assert.equal(agg.annual["2024"], 777);
  assert.equal(agg.monthly["2025-01"], 7550);
  assert.equal(agg.monthly["2025-12"], 5020);
});

test("2c 青色シミュレーション：控除はプラスの所得の範囲でだけ効く", () => {
  const bs = taxBlueSim(800000);
  assert.equal(JSON.stringify(bs.map(b => b.ded)), JSON.stringify([650000, 550000, 100000]));
  assert.equal(JSON.stringify(bs.map(b => b.income)), JSON.stringify([150000, 250000, 700000]));
  assert.equal(JSON.stringify(bs.map(b => b.cut)), JSON.stringify([650000, 550000, 100000]));
  assert.equal(JSON.stringify(taxBlueSim(300000).map(b => b.income)), JSON.stringify([0, 0, 200000]), "所得が控除以下なら0まで");
  assert.equal(JSON.stringify(taxBlueSim(-120000).map(b => b.income)), JSON.stringify([-120000, -120000, -120000]), "赤字はそのまま");
  assert.equal(taxBlueSim(null), null);
});

test("2c 工程チェック：期限は対象年の翌年に並ぶ", () => {
  const prep = taxPrepItems(2025);
  assert.equal(prep.length, 8);
  assert.equal(prep.find(p => p.id === "file").due, "2026-03-15", "提出は翌年3月15日");
  assert.equal(prep.find(p => p.id === "salary").due, "2026-01-31");
  assert.ok(prep.find(p => p.id === "resident"), "住民税チェックの項目がある");
  assert.ok(prep.every(p => p.title && p.how && p.dueLabel));
});

test("2c ICS：CRLF・日付形式・エスケープ", () => {
  const ics = taxIcs([{ uid: "tax-2025-file", date: "2026-03-15", summary: "確定申告：提出,テスト;確認", desc: "行1\n行2" }], "20261110T000000Z");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260315\r\n"));
  assert.ok(ics.includes("SUMMARY:確定申告：提出\\,テスト\\;確認"));
  assert.ok(ics.includes("DESCRIPTION:行1\\n行2"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(taxIcs([{ uid: "x", date: "bad", summary: "s" }], "T").includes("BEGIN:VEVENT"), false, "日付の形が違う行は落とす");
});

test("2c 転記シート（マス目マップ兼用）：数字が申告書の欄に対応する", () => {
  const sheet = taxSheetRows({ salaryGross: 6000000, overseasIncome: 300000, expensesFinal: 50000, cryptoMisc: 10000, bizBal: null, totalIncome: 3050000, domesticPlus: 80000, carryUsable: 20000, housingCredit: 150000, medicalEst: 30000, donation: 20000, withheld: 400000, balanceAbs: 12000, balanceLabel: "追加で納める額の概算" });
  const cellOf = (kw) => sheet.find(r => r.cell.includes(kw));
  assert.ok(sheet.length >= 12);
  assert.equal(cellOf("6「給与」").amount, 6000000);
  assert.equal(sheet.find(r => r.item.includes("トレードの収入")).amount, 300000);
  assert.equal(sheet.find(r => r.item.includes("必要経費")).amount, 50000);
  assert.equal(sheet.find(r => r.form.includes("第三表")).amount, 80000);
  assert.equal(sheet.find(r => r.item.includes("繰り越しで使う")).amount, 20000);
  assert.equal(cellOf("35").amount, 150000, "住宅ローン控除は第一表の35");
  assert.equal(cellOf("50").amount, 12000, "申告納税額は第一表の50");
  assert.ok(sheet.every(r => r.form && r.cell && r.item && r.src));
  assert.ok(taxSheetRows({}).every(r => r.amount === null), "未入力は null（画面では —）");
});

test("2c 保存アーカイブ：項目定義が揃っている", () => {
  assert.equal(TAX_ARCHIVE_ITEMS.length, 6);
  assert.ok(TAX_ARCHIVE_ITEMS.every(a => a.id && a.name && a.keep));
});
