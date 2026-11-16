const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const IDX = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("Kindle案内（案A）：対応表は第1弾のみで、確定した商品URLを指す", () => {
  assert.ok(IDX.includes('KINDLE_EDITIONS = { first: { title: "はじめての投資とトレード", url: "https://www.amazon.co.jp/dp/B0HRTHCBSJ" } }'), "対応表に first と確定URLがある");
});

test("Kindle案内：索引の後・見開き補完の前に1枚だけ差さる", () => {
  const ins = IDX.indexOf('if (KINDLE_EDITIONS[BK.id]) pages.push({ kind: "kindle", run: "Kindle版のご案内" });');
  const blank = IDX.indexOf('if (two && pages.length % 2) pages.push({ kind: "blank" });');
  assert.ok(ins > 0 && blank > ins, "差し込みが見開き補完より前にある（ページ番号・しおりに影響しない末尾配置）");
});

test("Kindle案内：描画分岐と文面（決定済みの案A）がある", () => {
  assert.ok(IDX.includes('p.kind === "kindle"'), "pageHtmlにkindle分岐がある");
  assert.ok(IDX.includes("📚 Kindle 版のご案内"), "見出しがある");
  assert.ok(IDX.includes("再編集し、書き下ろしの章を加えた Kindle 版でもお読みいただけます"), "本文がある");
  assert.ok(IDX.includes('target="_blank" rel="noopener"'), "リンクは別タブ・noopener");
  assert.ok(IDX.includes("Desk One（無料）では、この本の全文をいつでも無料で読めます"), "脚注がある");
  assert.ok(IDX.includes('p.kind === "kindle" ? "Kindle版のご案内"'), "現在地ラベルに対応がある");
});
