// F9（ホームと注目ポイントの価格表示を生配信優先に改善）の静的ロック。
// ライブ層の一般化（パネル選択に寄らない配信の常時接続・オイルの自前配信・注目ポイントの
// 現在価格の差し替え・分析スタンプ）が、将来の編集や生成で静かに戻らないようにするための固定テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "..", "index.html"), "utf-8");
const ipad = readFileSync(join(here, "..", "ipad.html"), "utf-8");
const ayuRoot = readFileSync(join(here, "..", "..", "ayu", "index.html"), "utf-8");
const ayuLearn = readFileSync(join(here, "..", "learn", "ayu", "index.html"), "utf-8");
const all = [main, ipad, ayuRoot, ayuLearn];
const mains = [main, ipad];
const forks = [ayuRoot, ayuLearn];

test("F9: ライブ配信の出どころが5銘柄分そろっている（ダッシュボードと同じ定義）", () => {
  for (const src of all) {
    assert.match(src, /gold: \[\{ name: "OKX XAUT", url: "wss:\/\/ws\.okx\.com\/ws\/v5\/public"/);
    assert.match(src, /name: "Bitfinex XAUT", url: "wss:\/\/api-pub\.bitfinex\.com\/ws\/2"/);
    assert.match(src, /name: "Kraken PAXG", url: "wss:\/\/ws\.kraken\.com\/v2"/);
    assert.match(src, /usdjpy: \[\{ name: "GMOコイン FX", url: "wss:\/\/forex-api\.coin\.z\.com\/ws\/public\/v1"/);
    assert.match(src, /silver: \[\{ name: "OKX XAG", url: "wss:\/\/ws\.okx\.com\/ws\/v5\/public"[^}]*XAG-USDT-SWAP/);
    assert.match(src, /usoil: \[\{ name: "OKX CL（WTI連動パーペチュアル）", url: "wss:\/\/ws\.okx\.com\/ws\/v5\/public"[^}]*CL-USDT-SWAP/);
    assert.match(src, /btc: \[\{ name: "Coinbase", url: "wss:\/\/ws-feed\.exchange\.coinbase\.com"/);
  }
});

test("F9: liveWatch はパネル選択によらず4銘柄（gold/usdjpy/silver/usoil）の配信を開く", () => {
  for (const src of all) {
    assert.match(src, /\["gold", "usdjpy", "silver", "usoil"\]\.forEach\(function \(key\)/);
    assert.match(src, /key === "gold" \|\| key === "usdjpy" \|\| key === "usoil", L = live\[key\];/);
    assert.doesNotMatch(src, /\["gold", "usdjpy", "silver"\]\.forEach\(function \(key\)/);
  }
});

test("F9: オイルは補正なし（liveOffset=0）で、自前配信は oilMk の流儀（差を足す）で出す", () => {
  for (const src of all) {
    assert.match(src, /if \(key === "btc" \|\| key === "usoil"\) return 0;/);
    assert.match(src, /var homeOilTick = null;/);
    assert.match(src, /homeOilTick = \{ price: Math\.round\(L\.raw \* 1000\) \/ 1000, asof: L\.at \};/);
    assert.match(src, /function oilTickApply\(\)/);
    assert.match(src, /oilMk\.applyLive\(homeOilTick\.price \+ oilMk\.oilShown\.d\);/);
    // oilDash：ダッシュボードの保存が無いときの受け皿（home: true で出典を出し分ける）
    assert.match(src, /homeOilTick && Date\.now\(\) - homeOilTick\.asof <= 15000/);
    assert.match(src, /live: true, oilDiff: df, home: true/);
    assert.match(src, /dash\.home \? "OKX（WTI連動パーペチュアル。このデスク自身の配信。OILCashそのものではありません）"/);
  }
});

test("F9: 注目ポイントの現在価格はライブ層（ptLivePx）から取り、帯と目線はダッシュボードのまま", () => {
  for (const src of all) {
    assert.match(src, /function ptLivePx\(key\)/);
    assert.match(src, /if \(key === "btc"\) \{ var d = btcDashPrice\(market && \(market\.instruments \|\| market\)\.btc\); return d \? d\.price : 0; \}/);
    assert.match(src, /if \(key === "usoil"\) \{ var od = oilDash\(\); return od \? \+od\.price : 0; \}/);
    assert.match(src, /function ptEffK\(key, k\)/);
    // 接近判定（nears）と本文（ptMap）の両方が、差し替え後の px で計算される
    assert.match(src, /ptNear\(key, ptEffK\(key, k\)\)/);
    assert.match(src, /var k = keyLv\[ptTab\] \? ptEffK\(ptTab, keyLv\[ptTab\]\) : null/);
  }
});

test("F9: ゴールド／シルバーの較正デッドロックを解く（スポット照合ゲート＋較正の常設化）", () => {
  for (const src of all) {
    // ティックの異常値ゲート：カード値が古いファイル価格のままでも、新しいスポット値と帯内で一致すれば通す
    assert.match(src, /var okRef = Math\.abs\(px - mk\.price\) <= band \|\| \(\(key === "gold" \|\| key === "silver"\) && L\.spot && Date\.now\(\) - L\.spotAt < 60000 && Math\.abs\(px - L\.spot\) <= band\);/);
    assert.match(src, /var band = key === "gold" \? 30 : key === "silver" \? 0\.6 : key === "btc" \? mk\.price \* 0\.02 : 0\.5;/);
    // スポット定期取得：カードが生値で動くまでは表示に使う（従来の mk.price 条件だとファイル価格のまま固まる）。
    // カードがスポットと帯の外まで離れていたら配信側が古い較正で止まっているとみて、スポットで再同期する
    assert.match(src, /if \(liveFresh\(key\) && mk\.live && Math\.abs\(mk\.price - price\) <= \(key === "gold" \? 30 : 0\.6\)\) return;/);
    assert.doesNotMatch(src, /if \(liveFresh\(key\) && mk\.price\) return;/);
    // 較正の標本は時刻つきで持ち、3分で失効させる（古い中央値が固まるのを防ぐ）
    assert.match(src, /L\.offs\.push\(\[L\.raw - spot, nowC\]\)/);
    assert.match(src, /L\.offs\.filter\(function \(s\) \{ return nowO - s\[1\] < 180000; \}\)/);
    // 帯の外の tick が5回続けて互いに近ければ、較正を作り直して再同期する
    assert.match(src, /if \(L\.rejN < 5\) return;/);
    assert.match(src, /L\.offs = \[\]; L\.rejN = 0;/);
    // パネル表示に依らない較正（1分間隔・liveWatch から呼ばれる）
    assert.match(src, /function liveSpotCalibrate\(\)/);
    assert.match(src, /liveSpotCalibrate\(\);/);  // liveWatch からの呼び出し
    assert.match(src, /now - liveSpotAt < 20000/);
    // 急変時のソフトクランプ：新しいスポットがある間、補正後の値はスポット±10ドル（銀±0.2）の外に出ない
    assert.match(src, /var soft = key === "gold" \? 10 : 0\.2;/);
    // 較正ドリフトの即時修正：補正後の値がスポットから大きく外れた tick が3回続いたら、最新の測定で較正し直す
    assert.match(src, /if \(L\.driftN >= 3\) \{ L\.offs = \[\[L\.raw - L\.spot, Date\.now\(\)\]\]; L\.driftN = 0;/);
    assert.match(src, /\[\["gold", "XAU"\], \["silver", "XAG"\]\]/);
    assert.match(src, /anchorSpotH\(key, v\[0\], v\[1\]\)/);  // 較正アンカーは合議＋サイト照合を通す
    assert.match(src, /liveCalibrate\(key, px\)/);
  }
});

test("F9: 分析スタンプ「分析 ○○時点」が脚注の先頭に出て、旧い「約15分ごと」表記が無い", () => {
  for (const src of mains) {
    assert.match(src, /\(u \? "分析 " \+ \(stale \? MDHM\(u\) : stampAt\(u\)\) \+ "時点" \+ \(stale \? "（更新が止まっています）" : ""\) \+ "・" : ""\)/);
    assert.doesNotMatch(src, /約15分ごと/);
    assert.doesNotMatch(src, /TDAnStamp/);
  }
  for (const src of forks) {
    // あゆ版：スタンプは辞書（日英）経由で作る
    assert.match(src, /function ptAnStampTxt\(u, stale\)/);
    assert.match(src, /\(u \? ptAnStampTxt\(u, stale\) \+ "・" : ""\)/);
    assert.match(src, /window\.TDAnStamp = function \(t, stale\)/);
    assert.match(src, /ptAn: "分析 \{t\}時点", ptAnStale: "（更新が止まっています）"/);
    assert.match(src, /ptAn: "Analysis as of \{t\}", ptAnStale: " \(updates have stopped\)"/);
    assert.doesNotMatch(src, /約15分ごと/);
    // フォークの oilDash の受け皿も、シート側が実際に書くキー（usoil_auto_cache_final）を読む（キュー1で ayu_ 接頭から修正）
    assert.match(src, /var c0 = JSON\.parse\(localStorage\.getItem\("usoil_auto_cache_final"\)/);
    // フォークのBTCキャッシュ読みは、シート側が実際に書くキー（LSP＝銘柄名基準）に合わせる
    assert.match(src, /localStorage\.getItem\("btc_auto_cache_final"\)/);
    assert.doesNotMatch(src, /ayu_btc_auto_cache_final/);
  }
});
