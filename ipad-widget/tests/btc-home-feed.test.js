const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const BTC = fs.readFileSync(path.join(__dirname, "..", "btc.html"), "utf8");

test("BTC例外：正本（gold.html）にBTCの価格取得例外が入り、ビルド後のbtc.htmlにも残る", () => {
  assert.ok(GOLD.includes("if(now>=state.nextSpot&&(!sheetHidden()||IS_BTC))"), "gold.htmlにBTC例外がある（ビルドでbtc.htmlへ伝わる）");
  assert.ok(BTC.includes("if(now>=state.nextSpot&&(!sheetHidden()||IS_BTC))"), "btc.htmlにBTC例外がある（fc96b9bの修正がビルドで巻き戻らない）");
});
