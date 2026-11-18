// 市場の空気パネル（VIX＝市場の怖さ／DXY＝ドルの強さ＋日足30日相関の初心者向け要約）
// 仕様：VIXの日足はセッション当日の日付、他の銘柄とDXYはセッション開始日の日付で刻まれるため、
// VIXだけを1日分ずらしてそろえる（実データで検証済み）。25本未満しかそろわない相関は出さない。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DIR = path.join(__dirname, "..");
const GOLD = fs.readFileSync(path.join(DIR, "gold.html"), "utf8");
const HOME = fs.readFileSync(path.join(DIR, "index.html"), "utf8");

function grab(src, name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " が見つかる");
  const j = src.indexOf("\nfunction ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
const ctx = vm.createContext({ Math, Date, Map, console });
vm.runInContext([grab(GOLD, "corrOf"), grab(GOLD, "airDailyMap"), grab(GOLD, "airCorr"), grab(GOLD, "airZone")].join("\n"), ctx);

function series(closes) {
  const t0 = 1767225600;
  return { candles: { "1d": closes.map((c, i) => [t0 + i * 86400, c, c, c, c]) } };
}
function fromRets(start, rets) {
  const out = [start];
  rets.forEach(r => out.push(out[out.length - 1] * Math.exp(r)));
  return series(out);
}
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
const RETS = Array.from({ length: 40 }, () => rnd() * 0.04);

test("空気パネル：相関は日足30日の対数リターンで、同一リターン列なら +1", () => {
  const a = fromRets(100, RETS), b = fromRets(300, RETS);
  assert.ok(Math.abs(ctx.airCorr(a, b, 0) - 1) < 1e-9);
  const rev = fromRets(300, RETS.map(r => -r));
  assert.ok(Math.abs(ctx.airCorr(a, rev, 0) + 1) < 1e-9);
});

test("空気パネル：VIXのずらし（shift=1）でのみ、1日遅れの連動を拾う", () => {
  const driver = fromRets(100, RETS);
  const delayed = fromRets(200, [...RETS.slice(1), 0.001]); // stamp 日 j のリターンが driver の j+1 と一致
  assert.ok(Math.abs(ctx.airCorr(driver, delayed, 1) - 1) < 1e-9, "shift=1 で完全相関");
  assert.ok(Math.abs(ctx.airCorr(driver, delayed, 0)) < 0.95, "shift=0 では拾わない");
});

test("空気パネル：データ不足（25本未満）なら相関を出さない", () => {
  const short = fromRets(100, RETS.slice(0, 10));
  assert.equal(ctx.airCorr(short, fromRets(100, RETS), 0), null);
  assert.equal(ctx.airCorr(null, fromRets(100, RETS), 0), null);
});

test("空気パネル：怖さの帯は 15／20／30 が境目", () => {
  assert.equal(ctx.airZone(14.9)[0], "平常");
  assert.equal(ctx.airZone(15)[0], "少し怖がっている");
  assert.equal(ctx.airZone(20)[0], "怖がっている");
  assert.equal(ctx.airZone(30)[0], "パニック");
});

test("空気パネル：ダッシュボード側の置き場所と呼び出し", () => {
  assert.ok(GOLD.includes('id="airBox"'), "置き場所がある");
  assert.ok(GOLD.includes("renderDxy();renderFxMat();renderAir();"), "描画の流れで呼ばれる");
  assert.ok(GOLD.includes("airCorr(vx,me,1)"), "VIXは1日ずらす");
  assert.ok(GOLD.includes("airCorr(dx,me,0)"), "DXYはずらさない");
  assert.ok(GOLD.includes("この表示の見方"), "見方の説明が入っている");
  assert.ok(GOLD.includes("INSTR.key==='usdjpy'?'ドル円':ASSET"), "ドル円の呼び名は専用に取る（asset未設定で「金」に落ちるため）");
  const BTC = fs.readFileSync(path.join(DIR, "btc.html"), "utf8");
  assert.ok(BTC.includes('id="airBox"'), "派生ダッシュボードにも入る");
  const AYU = fs.readFileSync(path.join(DIR, "..", "ayu", "gold.html"), "utf8");
  assert.ok(!AYU.includes('id="airBox"'), "あゆ版には入れない");
});

test("空気パネル：ホームの下段タブに入る", () => {
  assert.ok(HOME.includes('data-tp="air"'), "空気タブがある");
  assert.ok(HOME.includes('id="airpane"'), "空気ペインがある");
  assert.ok(HOME.includes("function renderAirHome()"), "ホーム用描画がある");
  assert.ok(HOME.includes('name === "air" ? "air" : "ind"'), "タブ切替が空気を受ける");
  assert.ok(HOME.includes("airCorrH(vx, ins[pair[0]], 1)"), "ホームもVIXは1日ずらす");
  assert.ok(HOME.includes("銘柄ごとの連動"), "銘柄ごとの相関一覧がある");
});

test('VIX急騰の警戒（案1）：ダッシュボードに帯の置き場と判定関数がある', () => {
  assert.ok(GOLD.includes('id="vixBand"'));
  assert.ok(GOLD.includes('function airSurge(vx)'));
  assert.ok(GOLD.includes('市場の怖さが急に強くなっています'));
});
test('VIX急騰の警戒（案1）：airSurge の境界（+20%で発火／30超え上昇中で発火／それ以外は出ない）', () => {
  const m = GOLD.match(/function airSurge\(vx\)\{[^}]+\}/);
  assert.ok(m, 'airSurge が抜き出せる');
  const airSurge = new Function(m[0] + '; return airSurge;')();
  assert.ok(Math.abs(airSurge({ price: 24.02, prevClose: 20 }) - 20.1) < 1e-9); // +20%の少し上
  assert.equal(airSurge({ price: 23.98, prevClose: 20 }), null); // +19.9%は出ない
  assert.ok(airSurge({ price: 32.4, prevClose: 25.2 }) > 28);
  assert.ok(airSurge({ price: 31, prevClose: 30 }) !== null);
  assert.equal(airSurge({ price: 31, prevClose: 32 }), null);
  assert.equal(airSurge({ price: 23.9, prevClose: 20 }), null);
  assert.equal(airSurge({ price: 23.83, prevClose: 25.47 }), null);
  assert.equal(airSurge({ price: 0, prevClose: 20 }), null);
  assert.equal(airSurge(null), null);
});
test('VIX急騰の警戒（案1）：ホームの警戒に一番下の枠として入っている', () => {
  assert.ok(HOME.includes('id="al-vx"'));
  assert.ok(HOME.includes('desk_vx_closed'));
  assert.ok(HOME.indexOf('id="al-vx"') > HOME.indexOf('id="al-mv"'), '急変より下（低優先）');
});
