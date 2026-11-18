const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");

test("停止中の古い価格を目立たせない：鮮度が stale のとき価格と前日比を落とす", () => {
  assert.ok(GOLD.includes("const spotStale=pf.level==='stale'"), "鮮度レベル stale で判定している");
  assert.ok(GOLD.includes("$('goldPrice').classList.toggle('stale',spotStale)"), "価格に stale クラスを付け外しする");
  assert.ok(GOLD.includes(".price.stale{opacity:.38}"), "stale の価格を薄くするCSSがある");
  assert.ok(GOLD.includes("'停止中（'+dur(Date.now()-state.spot.asof)+'前の値）'"), "前日比の代わりに停止中と経過時間を出す");
  assert.ok(GOLD.includes("$('miniPrice').classList.toggle('stale',spotStale)"), "上部の小さい価格も同じ扱い");
});

test("価格の見張り：シート状態のずれを自己回復する", () => {
  assert.ok(GOLD.includes("function spotWatchdog()"), "見張り関数がある");
  assert.ok(GOLD.includes("setInterval(spotWatchdog,30000)"), "30秒ごとに走る");
  assert.ok(GOLD.includes("deskHidden===true&&innerWidth>0&&innerHeight>0"), "「閉じているのに大きさがある」矛盾を検出する");
  assert.ok(GOLD.includes("if(++sizedHiddenTicks>=2){deskHidden=null;"), "1分続いたら判定を画面の大きさに戻す");
});

test("価格の見張り：スポットが90秒以上古ければシート状態に関係なく取り直す", () => {
  assert.ok(GOLD.includes("Date.now()-state.spot.asof>90000){state.nextSpot=0;refreshSpot();if(!sheetHidden()&&!LIVE.ws)startLive()}"), "古ければ即取得（配信のつなぎ直しは表示中のみ）");
  assert.ok(GOLD.includes("if(mktClosed)return;"), "休場中は対象外");
});

test("土台データの生成マーカー：失敗を帯と枠で知らせる", () => {
  assert.ok(GOLD.includes("market-status.json"), "マーカーを読む");
  assert.ok(GOLD.includes('id="dataStop"'), "停止の帯がある");
  assert.ok(GOLD.includes("データ停止中"), "帯と枠に停止中と出す");
  assert.ok(GOLD.includes("classList.toggle('datastopped',stop)"), "チャート・水準・指標の枠に印を付ける");
  const ANALYZE = fs.readFileSync(path.join(__dirname, "..", "analyze.py"), "utf8");
  assert.ok(ANALYZE.includes('"market-status.json"'), "analyze.py がマーカーを書き出す");
  assert.ok(ANALYZE.includes('"ok" if BUILD_STATUS["fresh"] else "fail"'), "全滅なら fail・通常は ok");
});

test("あゆ版にも同じ仕組みが入っている（停止表示・見張り・マーカー）", () => {
  const AYU = fs.readFileSync(path.join(__dirname, "..", "..", "ayu", "gold.html"), "utf8");
  assert.ok(AYU.includes("const spotStale=pf.level==='stale'"), "あゆ版：停止中の価格を落とす");
  assert.ok(AYU.includes("function spotWatchdog()"), "あゆ版：見張りがある");
  assert.ok(AYU.includes("setInterval(spotWatchdog,30000)"), "あゆ版：見張りが30秒ごとに走る");
  assert.ok(AYU.includes('id="dataStop"'), "あゆ版：停止の帯がある");
  assert.ok(AYU.includes("SITE_FALLBACK_STATUS"), "あゆ版：予備マーカーも見る");
});

test("シートを開いたら次回取得を待たずに価格を取り直す", () => {
  assert.ok(GOLD.includes("if(e.data.on){state.nextSpot=0;renderAll();if(!LIVE.ws)startLive()}"), "desk-sheet の on で nextSpot を即時化する");
});
