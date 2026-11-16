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

test("初心者向けデザイン：3ステップ見出しとやさしい言葉（2026-11-16 オーナー指示）", () => {
  assert.equal((GOLD.match(/class="stepcap"/g) || []).length, 3, "ステップ見出しが3つある");
  for (const t of ["口座と方向をえらぶ", "資金と、1回で失ってよい金額を決める", "価格を入れて、ロットと金額を確認する"]) {
    assert.ok(GOLD.includes(t), "ステップ見出し: " + t);
  }
  for (const t of ["エントリー（取引する価格）", "損切り SL（やめる価格）", "利確 TP（利益を確定する価格）"]) {
    assert.ok(GOLD.includes(t), "やさしい補足: " + t);
  }
  assert.ok(GOLD.includes("1回で失ってよい割合（%）"), "許容リスクをやさしい言葉にした");
  assert.ok(GOLD.includes("価格・SL・TPは自動で入れる（切ると自分で入力できます）"), "自動入力の説明がやさしい");
  assert.ok(GOLD.includes("損失1に対して利益 "), "RRをやさしい言葉で出す");
});

test("まとめ文は初心者向けの文章で金額まで読める", () => {
  const fn = extractFn("riskSummaryText");
  const els = {
    lotSize: { textContent: "0.15" }, dirLabel: { textContent: "想定方向：買い｜根拠あり" },
    entry: { value: "3855.24" }, stop: { value: "3868.52" }, target: { value: "3828.67" },
    riskYen: { textContent: "¥2,434" }, profitYen: { textContent: "¥4,802" }, marginYen: { textContent: "¥12,345" },
  };
  const withTp = new Function("$", "n", "INSTR", "return (" + fn.toString() + ")()")(
    (id) => els[id] || { textContent: "", value: "" },
    (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; }, { dp: 2 });
  assert.equal(withTp, "買い 0.15ロットで入るプランです。エントリー 3,855.24。損切り 3,868.52 で −¥2,434、利確 3,828.67 で ＋¥4,802 になります。必要な証拠金は ¥12,345 です。");
  els.target.value = "";
  const noTp = new Function("$", "n", "INSTR", "return (" + fn.toString() + ")()")(
    (id) => els[id] || { textContent: "", value: "" },
    (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; }, { dp: 2 });
  assert.ok(noTp.includes("利確は設定なしです。"), "TP無しでも文章が成立する: " + noTp);
});

test("価格ボードは計算のたびに描き直される（口座切替への即時追随）", () => {
  const calc = GOLD.slice(GOLD.indexOf("function calcRisk()"), GOLD.indexOf("function riskSummaryText()"));
  assert.ok(calc.includes("paintRiskBoard();"), "calcRisk の末尾で paintRiskBoard を呼ぶ");
});

test("価格フォームは縦積み・大きな入力欄で打ち込みやすい（2026-11-16 オーナー指示）", () => {
  assert.ok(GOLD.includes('class="form priceform"'), "価格フォーム専用クラスがある");
  assert.equal((GOLD.match(/class="fldcap"/g) || []).length, 4, "見出し行が4つ（エントリー/SL/TP＋ロット）");
  assert.ok(GOLD.includes(".form.priceform{display:flex;flex-direction:column"), "3列グリッドではなく縦積み（.form より詳細度を上げて確実に勝つ）");
  assert.ok(GOLD.includes(".priceform .stepper input,.lotrow .stepper input{font-size:17px"), "入力欄の文字が大きい（17px・iOSの自動ズームも起きない）");
  // 幾何学の予算：ステッパー行 = ボタン46px + 間隔8px + 入力(flex・最小0) + 間隔8px + ボタン46px。
  // 入力は flex なので、カード幅が 46+8+46+8=108px 以上あれば必ず収まる（はみ出し構造にしない）。
  assert.ok(GOLD.includes(".priceform .stp,.lotrow .stp{width:46px"), "＋/−ボタンが46px幅（タップ目標44px超）");
  assert.ok(GOLD.includes(".stepper input{flex:1;min-width:0}"), "入力欄は伸縮して収まる");
});

test("SL/TPの金額は色つきピルで大きく出る", () => {
  assert.ok(GOLD.includes(".moneyhint.neg{") && GOLD.includes(".moneyhint.pos{"), "損失＝赤・利益＝緑のピル様式がある");
  assert.ok(GOLD.includes("$('slMoney').classList.toggle('neg'"), "SL金額に赤ピルが付く");
  assert.ok(GOLD.includes("$('tpMoney').classList.toggle('pos'"), "TP金額に緑ピルが付く");
  assert.ok(GOLD.includes(".priceform .moneyhint{font-size:14px"), "金額の文字が14px・太字");
  assert.ok(GOLD.includes(".moneyhint:empty{display:none}"), "金額が無いときは空の帯を出さない");
});

test("SL/TP到達時の金額が各欄の下に出る", () => {
  assert.ok(GOLD.includes('id="slMoney"') && GOLD.includes('id="tpMoney"'), "金額表示の置き場がある");
  assert.ok(GOLD.includes("slEff*contract*useLot*fx"), "SL到達時の損失は実効ロット×スプレッド込み幅で計算");
  assert.ok(GOLD.includes("'TP到達時 ＋'+yen(profit)"), "TP到達時の利益が出る");
  assert.ok(GOLD.includes("'TP設定なし'"), "TP無しのときはその旨が出る");
});

test("自動入力はプラン連動である説明が、チェックの下と使い方シートに出る", () => {
  const fs2 = require("node:fs");
  const G = fs2.readFileSync(require("node:path").join(__dirname, "..", "gold.html"), "utf8");
  assert.ok(G.includes("売買プランと連動"), "チェック下の説明にプラン連動と書いてある");
  assert.ok(G.includes("チャートのプラン線と同じ価格"), "プラン線と同じ価格であることが書いてある");
  assert.ok(G.includes("プランが動くと、欄の価格も合わせて更新されます"), "追随することも書いてある");
  assert.ok(G.includes("自動入力は、このダッシュボードの売買プランと連動しています"), "使い方シートにも説明がある");
});

test("ロット行も価格フォームと同じ作法で潰れない（スタイリッシュ統一）", () => {
  const fs3 = require("node:fs");
  const G = fs3.readFileSync(require("node:path").join(__dirname, "..", "gold.html"), "utf8");
  assert.ok(G.includes(".form.lotrow{display:flex;flex-direction:column"), "ロット行は縦積みフレックスで狭幅でも潰れない");
  assert.ok(G.includes('<span class="fldcap">ロット（自分で入力）</span>'), "ロットにも見出し行がある");
  assert.ok(G.includes(".priceform .stp,.lotrow .stp{width:46px"), "ロットの＋/−も46pxで統一");
  assert.ok(G.includes("linear-gradient(135deg,#f1d98a,#d4af37)"), "ステップ番号は金グラデーション");
});

test("まとめ文の損失は上限額ではなく実効ロットの実際の損失（帯と同じ額）", () => {
  const fs4 = require("node:fs");
  const G = fs4.readFileSync(require("node:path").join(__dirname, "..", "gold.html"), "utf8");
  assert.ok(G.includes("state.riskLossYen=_lv?Math.round(_lv):null"), "calcRiskが実際の損失額を控える");
  assert.ok(G.includes("state.riskLossYen)?('¥'+state.riskLossYen.toLocaleString('ja-JP'))"), "まとめ文は実際の損失を優先する");
  const fn = extractFn("riskSummaryText");
  const els = {
    lotSize: { textContent: "0.01" }, dirLabel: { textContent: "想定方向：売り｜根拠あり" },
    entry: { value: "3858.63" }, stop: { value: "3871.17" }, target: { value: "3833.55" },
    riskYen: { textContent: "¥1,000" }, profitYen: { textContent: "¥3,961" }, marginYen: { textContent: "¥616" },
  };
  globalThis.state = { riskLossYen: 2040 };
  try {
    const tx = new Function("$", "n", "INSTR", "return (" + fn.toString() + ")()")(
      (id) => els[id] || { textContent: "", value: "" },
      (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; }, { dp: 2 });
    assert.ok(tx.includes("損切り 3,871.17 で −¥2,040"), "上限¥1,000ではなく実際の−¥2,040が出る: " + tx);
  } finally { delete globalThis.state; }
});

test("まとめ文も計算のたびに描き直される（切替直後の遅れ解消）", () => {
  const fs5 = require("node:fs");
  const G = fs5.readFileSync(require("node:path").join(__dirname, "..", "gold.html"), "utf8");
  assert.ok(G.includes("paintRiskBoard();renderRiskSummary();"), "calcRiskの末尾でまとめ文も即時更新する");
});
