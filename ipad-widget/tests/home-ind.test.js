// ホーム指標タブの充実（セッション帯・コア時間・ミニ解説・昨日/明日）の回帰テスト。
// index.html から実物の関数を抜き出して eval し、計算と辞書を検証する。
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
function load(...names) {
  const src = "var TZF = {};\n" + names.map(extract).join("\n");
  return eval(src + "\n;({ " + names.join(", ") + " })");
}

test("ホーム帯: zoneTsH が夏時間・冬時間を正しく変換する", () => {
  const { zoneTsH } = load("tzFmtH", "tzPartsH", "zoneTsH");
  assert.equal(zoneTsH("Europe/London", 2026, 11, 13, 16, 0), Date.UTC(2026, 10, 13, 16, 0)); // 冬 GMT
  assert.equal(zoneTsH("Europe/London", 2026, 7, 15, 16, 0), Date.UTC(2026, 6, 15, 15, 0)); // 夏 BST
  assert.equal(zoneTsH("America/New_York", 2026, 11, 13, 10, 0), Date.UTC(2026, 10, 13, 15, 0)); // 冬 EST
  assert.equal(zoneTsH("Asia/Tokyo", 2026, 11, 13, 9, 55), Date.UTC(2026, 10, 13, 0, 55));
});

test("ホーム帯: coreAtH はその市場の当日分を返す（日付またぎで過去にしない）", () => {
  const F = load("tzFmtH", "tzPartsH", "zoneTsH", "coreAtH");
  const CORE_H = eval(HTML.slice(HTML.indexOf("var CORE_H = ["), HTML.indexOf("];", HTML.indexOf("var CORE_H = [")) + 2) + " CORE_H");
  const evening = Date.UTC(2026, 10, 13, 11, 21); // 11/13 20:21 JST
  const fix = CORE_H.find((c) => c.n === "ロンフィク");
  assert.equal(F.coreAtH(fix, evening), Date.UTC(2026, 10, 13, 16, 0)); // = 11/14 1:00 JST（まだ先）
  const nakane = CORE_H.find((c) => c.n === "仲値");
  assert.equal(F.coreAtH(nakane, evening), Date.UTC(2026, 10, 13, 0, 55)); // 過ぎている
  const sat = Date.UTC(2026, 10, 14, 3, 0); // 土曜 12:00 JST
  assert.equal(F.coreAtH(nakane, sat), null); // 週末は無い
});

test("ミニ解説: 主要指標に解説が付き、無関係なものには付かない", () => {
  const glossSrc = HTML.slice(HTML.indexOf("var EV_GLOSS = ["), HTML.indexOf("];", HTML.indexOf("var EV_GLOSS = [")) + 2);
  const EV_GLOSS = eval(glossSrc + " EV_GLOSS");
  const glossFor = eval(glossSrc + "\n(" + extract("glossFor") + ")");
  assert.ok(EV_GLOSS.length >= 20, "辞書は20件以上");
  assert.match(glossFor({ title: "Core CPI m/m" }), /物価/);
  assert.match(glossFor({ title: "Non-Farm Employment Change" }), /雇用/);
  assert.match(glossFor({ title: "Federal Funds Rate" }), /政策金利/);
  assert.match(glossFor({ title: "BOJ Policy Rate" }), /日銀/);
  assert.match(glossFor({ title: "FOMC Press Conference" }), /会見/);
  assert.equal(glossFor({ title: "Bank Holiday" }), "");
});

test("ホーム指標タブ: 帯・振り返りの置き場所と呼び出しがある", () => {
  assert.ok(HTML.includes('id="ind-sess"'), "セッション帯の置き場所");
  assert.ok(HTML.includes('id="ind-review"'), "昨日/明日の置き場所");
  const ri = extract("renderIndicators");
  assert.ok(ri.includes("renderIndSess(); renderIndReview();"), "renderIndicators から呼ばれる");
  assert.ok(HTML.includes("renderIndSess"), "帯の描画関数");
  assert.ok(HTML.includes("明日の山場") && HTML.includes("昨日の★3"), "振り返りの文言");
});

test("ホーム指標タブ: HHMM には Date を渡し、付随表示は try で守る（2026-11-13夜の実バグ回帰）", () => {
  const sess = extract("renderIndSess");
  assert.ok(!/HHMM\(zt\)/.test(sess), "ms のまま HHMM に渡さない");
  assert.ok(sess.includes("HHMM(new Date(zt))"), "Date に包んで渡す");
  const ri = extract("renderIndicators");
  assert.ok(ri.includes("try { renderIndSess(); renderIndReview(); } catch (e) {}"), "付随表示の例外で一覧を止めない");
});
