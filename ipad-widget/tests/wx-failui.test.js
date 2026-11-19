// 天気の二重失敗経路：直接取得もサイト側の予備も失敗したとき、失敗表示の関数が
// 未定義変数を参照して落ちないこと（2026-11-19に実在した不具合の回帰防止）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HOME = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("天気：wxLast は外側スコープで宣言され、loadWeather 内で再宣言しない", () => {
  assert.ok(HOME.includes("wxAutoRetried = false, wxLast = null;"), "外側で宣言されている");
  assert.ok(!HOME.includes("    var wxLast = null;"), "loadWeather 内の var 再宣言がない");
  assert.ok(HOME.includes("function wxFailUI()"), "失敗表示の関数がある");
});
