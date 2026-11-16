// MT5式リスクフォーム（2026-11-16 オーナー指示）の回帰テスト
// 価格ボード（口座スプレッド連動）／ロットのクイック調整／TP設定無し／SL・TP到達時の金額表示
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");

function extractFn(name) {
  const start = GOLD.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " が gold.html にある");
  let i = GOLD.indexOf("{", start), depth = 0, end = -1;
  for (let j = i; j < GOLD.length; j++) {
    if (GOLD[j] === "{") depth++;
    else if (GOLD[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
  }
  assert.ok(end > start, name + " の終わりが見つかる");
  return eval("(" + GOLD.slice(start, end + 1) + ")");
}

test("価格ボード：Bid/Askと買い・売りプランの部品がある", () => {
  for (const id of ["riskBoard", "rbBid", "rbAsk", "rbBuy", "rbSell"]) {
    assert.ok(GOLD.includes('id="' + id + '"'), id + " がある");
  }
  assert.ok(GOLD.includes("発注はしません"), "発注しない旨の注意書きがある");
});

test("価格ボードは選んだ口座のスプレッド（spread欄）から Bid/Ask を作る", () => {
  const paint = GOLD.match(/function paintRiskBoard\(\)\{[\s\S]*?\n\}/);
  assert.ok(paint, "paintRiskBoard がある");
  assert.ok(paint[0].includes("n($('spread').value)"), "spread 欄の値を読んでいる（口座切替に連動）");
  assert.ok(paint[0].includes("bidAsk("), "bidAsk ヘルパーで計算している");
  const bidAsk = extractFn("bidAsk");
  const v = bidAsk(3854.0, 0.55); // XMスタンダード想定：5.5pips × $0.1
  assert.ok(Math.abs(v.bid - 3853.725) < 1e-9 && Math.abs(v.ask - 3854.275) < 1e-9, "Bid/Ask は中央値 ± スプレッド/2");
});

test("ロットのクイック調整：−0.5/−0.1/+0.1/+0.5 があり、実効ロットから動く", () => {
  for (const d of ["-0.5", "-0.1", "0.1", "0.5"]) {
    assert.ok(GOLD.includes('class="seg lotstep" data-ls="' + d + '"'), "data-ls=" + d + " がある");
  }
  const lotStepValue = extractFn("lotStepValue");
  assert.equal(lotStepValue(0.15, 0.1), 0.25);
  assert.equal(lotStepValue(0.15, -0.1), 0.05);
  assert.equal(lotStepValue(0.15, -0.5), 0.01, "最小 0.01 で止まる");
  assert.equal(lotStepValue(1, 0.5), 1.5);
  assert.ok(GOLD.includes("man>0?man:parseFloat"), "手入力が無ければ自動計算の表示ロットを基準にする");
});

test("TP設定無し：空欄なら利確なしで計算し、プラン線もSLだけになる", () => {
  assert.ok(GOLD.includes('id="tpNone"'), "設定無しボタンがある");
  assert.ok(GOLD.includes("tp=target>0?Math.abs(target-entry):0"), "calcRisk は TP 空欄を利確なしとして扱う");
  assert.ok(GOLD.includes("const hasT=isFinite(pt)&&pt!==pe"), "プラン描画は TP 無しでもエントリーとSLを描く");
  assert.ok(GOLD.includes("state.planGeo.yT!=null"), "TP線が無いときドラッグ判定が誤動作しない");
});

test("価格ボードは計算のたびに描き直される（口座切替への即時追随）", () => {
  const calc = GOLD.slice(GOLD.indexOf("function calcRisk()"), GOLD.indexOf("function riskSummaryText()"));
  assert.ok(calc.includes("paintRiskBoard();"), "calcRisk の末尾で paintRiskBoard を呼ぶ");
});

test("SL/TP到達時の金額が各欄の下に出る", () => {
  assert.ok(GOLD.includes('id="slMoney"') && GOLD.includes('id="tpMoney"'), "金額表示の置き場がある");
  assert.ok(GOLD.includes("'SL到達時 −'+yen(slEff*contract*useLot*fx)"), "SL到達時の損失は実効ロット×スプレッド込み幅で計算");
  assert.ok(GOLD.includes("'TP到達時 ＋'+yen(profit)"), "TP到達時の利益が出る");
  assert.ok(GOLD.includes("'TP設定なし'"), "TP無しのときはその旨が出る");
});
