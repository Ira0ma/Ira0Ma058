"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("銘柄パネルの横スライドは専用アニメーション（最長330ms）", () => {
  assert.match(HTML, /function mkSlideTo\(row, left\)/);
  assert.match(HTML, /Math\.min\(330, Math\.abs\(d\) \* 0\.5\)/);
  assert.match(HTML, /cue\.addEventListener\("click", function \(\) \{ mkSlideTo\(row, row\.scrollWidth\); \}\);/);
  assert.match(HTML, /mkSlideTo\(row, row\.scrollLeft \+ \(tr\.left - rr\.left\)\);/);
});
