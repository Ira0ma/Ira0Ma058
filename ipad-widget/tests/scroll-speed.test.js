"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("ホームのページ移動は高速スライド（標準smoothを使わない）", () => {
  const HTML = read("index.html");
  assert.match(HTML, /var slidePagerTo = function \(left\)/);
  assert.match(HTML, /slidePagerTo\(\+b\.getAttribute\("data-page"\) \* pager\.clientWidth\);/);
  assert.ok(!/pager\.scrollTo\(\{[^}]*smooth/.test(HTML), "ページャにsmoothが残っていない");
});

test("ダッシュボードのチャートジャンプはfastJump（最長330ms）", () => {
  const G = read("gold.html");
  assert.match(G, /function fastJump\(el\)/);
  assert.match(G, /fastJump\(\$\('secChart'\)\)/);
  assert.ok(!/scrollIntoView\(\{behavior:'smooth'/.test(G), "ダッシュボードにsmoothが残っていない");
});

test("ツールのガイドジャンプはfastJumpEl", () => {
  const T = read("tools.js");
  assert.match(T, /function fastJumpEl\(el\)/);
  assert.match(T, /fastJumpEl\(gel\)/);
  assert.ok(!/behavior: "smooth"/.test(T), "ツールにsmoothが残っていない");
});
