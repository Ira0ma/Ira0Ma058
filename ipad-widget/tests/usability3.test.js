// 使いやすさ3点（文字サイズ設定／近い水準の1行／オフライン表示）の回帰テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const TOOLS = readFileSync(new URL("../tools.js", import.meta.url), "utf8");
const SW = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const AYU = readFileSync(new URL("../../ayu/index.src.html", import.meta.url), "utf8");

function extract(name, src) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " が見つからない");
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, j + 1);
}

test("文字サイズ: 本体に data-tdfs のCSS・適用関数・設定キーがある", () => {
  assert.match(HTML, /html\[data-tdfs="l"\] \.gb-term p \{ font-size: 15\.5px; \}/);
  assert.match(HTML, /html\[data-tdfs="xl"\] \.gb-term p \{ font-size: 17\.6px; \}/);
  assert.match(HTML, /window\.TDFontApply = function/);
  assert.match(HTML, /localStorage\.getItem\("td_font_size"\)/);
  assert.match(TOOLS, /id="st-fsize"|st-fsize/);
  assert.match(TOOLS, /LS\.setItem\("td_font_size", this\.value\)/);
  assert.match(TOOLS, /TDFontApply/);
});

test("近い水準: ptNearLine が基準比で全銘柄から最接近を選ぶ", () => {
  const PT_TABS = ["gold", "usdjpy", "btc", "usoil"];
  const PT_NEAR = { usdjpy: 0.10, gold: 10, btc: 300, usoil: 0.50 };
  const INST = { gold: { name: "ゴールド" }, usdjpy: { name: "ドル円" }, btc: { name: "BTC" }, usoil: { name: "オイル" } };
  const esc = (s) => String(s);
  const ptVal = (key, v) => v.toFixed(2);
  const ptDist = (key, d) => "$" + Math.abs(d).toFixed(2);
  const ptNearLine = eval("(" + extract("ptNearLine", HTML) + ")");
  // ゴールドは絶対距離が大きいが基準比ではドル円が近い（0.131/0.10=1.31 < 89.92/10=8.99）
  const line1 = ptNearLine(
    { gold: { nm: "R1", v: 3968.42, d: 89.92 }, usdjpy: { nm: "S1", v: 159.501, d: 0.131 } },
    (key) => (key === "gold" ? 3878.5 : 159.632)
  );
  assert.match(line1, /近い水準：<b>ドル円 S1 159\.50<\/b>（あと \$0\.13）/);
  // ゴールドが基準内（$5/10=0.5）ならゴールドが選ばれる
  const line2 = ptNearLine(
    { gold: { nm: "R1", v: 3883.5, d: 5 }, usdjpy: { nm: "S1", v: 159.501, d: 0.131 } },
    (key) => (key === "gold" ? 3878.5 : 159.632)
  );
  assert.match(line2, /ゴールド R1/);
  // 水準が無ければ null、価格が無ければその銘柄は対象外
  assert.equal(ptNearLine({}, () => 1), null);
  assert.equal(ptNearLine({ gold: { nm: "R1", v: 1, d: 1 } }, () => null), null);
});

test("近い水準: カードに置き場があり、ptRows から描かれる（両版）", () => {
  assert.match(HTML, /<div class="pt-near" id="pt-near" hidden><\/div>/);
  assert.match(HTML, /ptNearLine\(nears,/);
  assert.match(AYU, /<div class="pt-near" id="pt-near" hidden><\/div>/);
  assert.match(AYU, /function ptNearLine/);
});

test("オフライン: sw.js はネット優先＋失敗時に前回分を返す（更新チェックと外部は素通し）", () => {
  assert.match(SW, /addEventListener\("fetch"/);
  assert.match(SW, /url\.origin !== self\.location\.origin/);
  assert.match(SW, /searchParams\.has\("v"\)/);
  assert.match(SW, /c\.put\(key, copy\)/);
  assert.match(SW, /c\.match\(key\)/);
  assert.match(SW, /notificationclick/); // 通知の働きは維持
});

test("オフライン: 札の置き場と表示切替がある（両版）", () => {
  assert.match(HTML, /<div id="off-pill" hidden>オフライン表示中/);
  assert.match(HTML, /navigator\.onLine !== false/);
  assert.match(AYU, /<div id="off-pill" hidden>オフライン表示中/);
  assert.match(AYU, /function ptNearLine/);
});
