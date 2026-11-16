const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const IDX = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("学ぶ新デザイン第1段：第1冊だけ目次がHero＋Bentoになる（ページ構成は不変）", () => {
  assert.ok(IDX.includes('p.kind === "toc" && BK.id === "first"'), "第1冊に限定した分岐");
  assert.ok(IDX.includes('class="gb-hero"'), "Heroがある");
  assert.ok(IDX.includes('class="gb-bento"'), "Bentoがある");
  assert.ok(IDX.includes("gb-ring-fg"), "進捗リング（しおり位置）がある");
  assert.ok(IDX.includes('c.terms.length >= 8 ? \' big\''), "レッスン数でタイルの大きさが変わる");
  assert.ok(!IDX.includes('pages.push({ kind: "hero"'), "ページを差し込まない（ページ番号・しおりを壊さない）");
});
