// ホーム検索バー（バー常設型）の回帰テスト。
// バーは JS が #stage 内に生成し（テーマボタンと同じ流儀）、遷移は既存の
// TDOpenDash / TDTools.open / openGlossary / 書斎ボタンへ渡すだけ、という設計を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const IDX = new URL("../index.html", import.meta.url);
const BUILD = new URL("../build.py", import.meta.url);
const INDEX_JSON = new URL("../learn/search-index.json", import.meta.url);
const HTML = readFileSync(IDX, "utf8");
const PY = readFileSync(BUILD, "utf8");

test("検索バー: CSSがステージ下の余白帯への配置とフロー表示の切替を持つ", () => {
  assert.match(HTML, /#td-search \{ position: absolute; left: 50%; transform: translateX\(-50%\); bottom: 3px; width: 430px;/);
  assert.match(HTML, /html\.flow #td-search \{ position: relative;/);
  assert.match(HTML, /#td-search \.tds-pop \{ position: absolute; left: 0; right: 0; bottom: calc\(100% \+ 8px\);/);
  assert.match(HTML, /html\.flow #td-search \.tds-pop \{ bottom: auto; top: calc\(100% \+ 8px\);/);
});

test("検索バー: JSがバーを生成し、既存の遷移APIだけを使う", () => {
  assert.match(HTML, /bar\.id = "td-search";/);
  assert.match(HTML, /stage\.appendChild\(bar\);/);
  assert.match(HTML, /TDOpenDash\(act\.dash, input\)/);
  assert.match(HTML, /TDTools\.open\(tab, input\)/);
  assert.match(HTML, /tools-toggle/);
  assert.match(HTML, /td-tools-tab/);
  assert.match(HTML, /openGlossary\(act\.term, input\)/);
  assert.match(HTML, /data-shf-book/);
  assert.match(HTML, /td-journal-v1/);
  assert.match(HTML, /td_kakeibo_v1/);
});

test("検索バー: 索引URLは本体が相対パス（learn/search-index.json）", () => {
  assert.match(HTML, /var INDEX_URL = "learn\/search-index\.json";/);
});

test("build.py が検索索引（search-index.json）を生成する", () => {
  assert.match(PY, /search-index\.json/);
  assert.match(PY, /"terms": _terms|_terms\.append/);
});

test("検索索引: 全30冊と項目が入り、確定申告ガイドが引ける形になっている", () => {
  assert.ok(existsSync(INDEX_JSON), "build.py 実行後に learn/search-index.json があること");
  const d = JSON.parse(readFileSync(INDEX_JSON, "utf8"));
  assert.equal(d.books.length, 30);
  const total = d.books.reduce((a, b) => a + b.terms.length, 0);
  assert.ok(total >= 1400, "項目総数: " + total);
  const tax = d.books.find((b) => b.id === "tax");
  assert.ok(tax && tax.title.includes("確定申告"));
  assert.ok(tax.terms.some((t) => t.i === "tax-start" && t.n.includes("確定申告")));
  for (const b of d.books) {
    assert.ok(b.id && b.title && Array.isArray(b.terms));
    for (const t of b.terms) assert.ok(t.n && t.i);
  }
});
