// 2026-11-16 全面監査の修正①⑤（オーナー承認）の回帰テスト
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const INDEX = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("① market.json のバスターは5分単位（毎分単位でキャッシュを無効化しない）", () => {
  assert.ok(GOLD.includes("URLS.siteMarket+'?t='+Math.floor(Date.now()/300000)"), "getSite は5分単位のバスターを使う");
  assert.ok(!GOLD.includes("URLS.siteMarket+'?t='+Math.floor(Date.now()/60000)"), "毎分単位のバスターは残っていない");
});

test("⑤ オイルの dash-gloss は usoil→oil に読み替えて受ける", () => {
  const m = INDEX.match(/var sk = d && \(([^)]*)\) && d\.key === "usoil"/);
  assert.ok(m, "usoil 読み替えの行がある");
  assert.ok(m[1].includes('"dash-gloss"'), "読み替え対象に dash-gloss が入っている");
  assert.ok(m[1].includes('"dash-levels"'), "dash-levels は従来どおり対象");
});
