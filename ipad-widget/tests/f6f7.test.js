// F6（flowドックのアプリ畳み＋#flow下端の連動）とF7（注目ポイントの広げるボタン＋flow展開）の静的ロック。
// 実機フィードバック由来の修正が、将来の編集や生成で静かに戻らないようにするための最小限の固定テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "..", "index.html"), "utf-8");
const ayu = readFileSync(join(here, "..", "learn", "ayu", "index.html"), "utf-8");

test("F6: flow ではアプリ3ボタンを「アプリ」ピル＋ポップに畳む", () => {
  for (const src of [main, ayu]) {
    assert.match(src, /dk-apps-btn/);
    assert.match(src, /dk-apps-pop/);
    assert.match(src, /html\.flow \.dk-app-row \{ display: none !important; \}/);
    assert.match(src, /openAppsPop/);
    // ポップのチップも本体ボタンも、起動は同じ openTradeApp を通る
    assert.ok((src.match(/openTradeApp\(def\)/g) || []).length >= 2);
  }
});

test("F6: #flow の下端はドック実測高に連動し、静的フォールバックは128px", () => {
  for (const src of [main, ayu]) {
    assert.match(src, /syncFlowDock/);
    assert.match(src, /dock\.offsetHeight \+ 15/);
    assert.match(src, /\.flow #flow \{ bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 128px/);
  }
});

test("F7: 注目ポイントに広げるボタンがあり、flow展開は fixed でなく78vh", () => {
  for (const src of [main, ayu]) {
    assert.match(src, /id="pt-expand" class="pt-xp"/);
    assert.match(src, /#points:not\(\.pt-expanded\) \.pt-xp \{ display: inline-flex; \}/);
    assert.match(src, /html\.flow #points\.pt-expanded \{ position: relative; inset: auto; width: auto; height: 78vh; \}/);
    assert.doesNotMatch(src, /html\.flow #points\.pt-expanded \{ position: fixed/);
    // 戻すボタン（#pt-shrink）は残っている
    assert.match(src, /id="pt-shrink" class="pt-x"/);
  }
});

test("F7: 広げる結線はタブ切替と独立（pt-expanded の付け外しのみ）", () => {
  for (const src of [main, ayu]) {
    assert.match(src, /ptExpand\.addEventListener\("click", function \(\) \{ if \(ptsCard\) ptsCard\.classList\.add\("pt-expanded"\); \}\)/);
    assert.match(src, /ptShrink\.addEventListener\("click", function \(\) \{ if \(ptsCard\) ptsCard\.classList\.remove\("pt-expanded"\); \}\)/);
  }
});
