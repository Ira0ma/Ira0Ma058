// 注目ポイントの位置バーと、重要指標の結果チップ（予想比）の回帰テスト。
// バーは ptMap の中に ptBarHtml として差し込まれ、計算は純関数 ptBarPos。
// 結果チップは renderIndicators の結果行に resDiff の文を出し、色は材料ピルと同じ kind を使う。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extract(name) {
  const i = HTML.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " が見つからない");
  let d = 0, j = i;
  for (; j < HTML.length; j++) {
    if (HTML[j] === "{") d++;
    else if (HTML[j] === "}") { d--; if (!d) break; }
  }
  return HTML.slice(i, j + 1);
}

test("位置バー: ptBarPos の位置計算と端寄せ", () => {
  const ptBarPos = eval("(" + extract("ptBarPos") + ")");
  assert.equal(ptBarPos(150, 100, 200), 50);
  assert.equal(ptBarPos(100, 100, 200), 0);
  assert.equal(ptBarPos(200, 100, 200), 100);
  assert.equal(ptBarPos(260, 100, 200), 100); // 抵抗の上抜けは右端
  assert.equal(ptBarPos(40, 100, 200), 0);    // 支持の下抜けは左端
  assert.equal(ptBarPos(150, 200, 200), null); // 幅ゼロは出さない
  assert.equal(ptBarPos(null, 100, 200), null);
});

test("位置バー: ptBarHtml の生成（両端ラベル・目盛り・印の位置）", () => {
  const ptBarPos = eval("(" + extract("ptBarPos") + ")");
  const ptVal = (key, v) => v.toFixed(1);
  const ptBarHtml = eval("(" + extract("ptBarHtml").replace("ptBarPos", "ptBarPos").replace(/ptVal\(key, /g, "ptVal(key, ") + ")");
  const html = ptBarHtml("gold", { px: 3900, s: [3870, 3830], r: [3925, 3960] });
  assert.match(html, /S2 3830\.0/);
  assert.match(html, /3960\.0 R2/);
  assert.match(html, /pm-bar-now" style="left:53\.8%"/); // (3900-3830)/(3960-3830)=53.8%
  assert.match(html, /pm-bar-tick" style="left:30\.8%"/); // S1 3870 の目盛り
  assert.match(html, /pm-bar-tick" style="left:73\.1%"/); // R1 3925 の目盛り
  assert.equal(ptBarHtml("gold", { px: 3900, s: [], r: [3925] }), ""); // 片側だけでは出さない
  assert.equal(ptBarHtml("gold", { px: 3900, s: [3870], r: [] }), "");
});

test("位置バー: ptMap に組み込まれ、CSS がある", () => {
  assert.match(HTML, /ptBarHtml\(key, k\)/);
  assert.match(HTML, /\.pm-bar \{ display: flex;/);
  assert.match(HTML, /\.pm-bar \.pm-bar-now \{/);
  assert.match(HTML, /linear-gradient\(90deg, var\(--up-green\), var\(--gold\), var\(--up-red\)\)/);
});

test("結果チップ: resDiff の数値差（単位がそろうときだけ）", () => {
  const resDiff = eval("(" + extract("resDiff") + ")");
  assert.equal(resDiff({ actual: "3.4%", forecast: "3.2%" }), "予想比 +0.2%");
  assert.equal(resDiff({ actual: "3.1%", forecast: "3.2%" }), "予想比 -0.1%");
  assert.equal(resDiff({ actual: "3.2%", forecast: "3.2%" }), "予想どおり");
  assert.equal(resDiff({ actual: "251K", forecast: "240K" }), "予想比 +11K");
  assert.equal(resDiff({ actual: "-0.1%", forecast: "0.1%" }), "予想比 -0.2%");
  assert.equal(resDiff({ actual: "250K", forecast: "0.25M" }), null); // 単位がそろわない
  assert.equal(resDiff({ actual: "3.4%", forecast: "" }), null);
  assert.equal(resDiff({ actual: "", forecast: "3.2%" }), null);
});

test("結果チップ: 結果行に差し込まれ、色は材料ピルと同じ kind を使う", () => {
  assert.match(HTML, /resDiff\(e\), spk = TDCore\.surpriseOf\(e\)/);
  assert.match(HTML, /class="res-diff ' \+ \(spk \? spk\.kind : "same"\)/);
  assert.match(HTML, /\.ind-list \.res-diff\.strong \{/);
  assert.match(HTML, /\.ind-list \.res-diff\.weak \{/);
});
