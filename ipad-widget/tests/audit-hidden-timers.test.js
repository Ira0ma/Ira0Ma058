const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");

test("監査②：閉じたシートではスケジューラの取得系（価格・チャート・予定）を止める", () => {
  assert.ok(GOLD.includes("if(now>=state.nextSpot&&(!sheetHidden()||IS_BTC)){state.nextSpot=now+INTERVALS.spot;refreshSpot()}"), "スポット取得がシート表示でゲートされている（BTCはホームへの供給源のため例外、fc96b9b）");
  assert.ok(GOLD.includes("if(now>=state.nextChart&&!sheetHidden()){state.nextChart=now+INTERVALS.chart;refreshCharts()}"), "チャート取得がゲートされている");
  assert.ok(GOLD.includes("if(now>=state.nextCalendar&&!sheetHidden()){state.nextCalendar=now+INTERVALS.calendar;refreshCalendar()}"), "予定取得がゲートされている");
});

test("監査②：ライブトーク・直近足・更新チェックの周期取得も閉じたシートでは止める", () => {
  assert.ok(GOLD.includes("setInterval(()=>{if(!sheetHidden())refreshLiveTalk()},45000)"), "ライブトーク45秒がゲートされている");
  assert.ok(GOLD.includes("setInterval(()=>{if(!sheetHidden()&&releaseHot())refreshLiveTalk()},5000)"), "ライブトーク5秒側がゲートされている");
  assert.ok(GOLD.includes("setInterval(()=>{if(!sheetHidden())fillRecentGold()},60000)"), "直近足60秒がゲートされている");
  assert.ok(GOLD.includes("setInterval(()=>{if(!sheetHidden())checkUpdate()},10*60000)"), "更新チェック10分がゲートされている");
});

test("監査②：単体表示（デスク外）では従来どおり動く前提＝sheetHiddenは親が無いとfalse", () => {
  assert.ok(GOLD.includes("function sheetHidden(){return window.parent!==window&&(deskHidden!=null?deskHidden:innerWidth===0||innerHeight===0)}"), "sheetHiddenの定義が不変（単体ではfalse）");
});
