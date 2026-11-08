// F8（「広げる」→「大きく読む」への改名＋初回だけの説明吹き出し）の静的ロック。
// ユーザー承認済みの文言と、初回ヒントの表示・消去の結線が、将来の編集や生成で静かに戻らないようにするための固定テスト。
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

test("F8: 4ファイルともボタン文言が「大きく読む／もどす」で、旧文言が残っていない", () => {
  for (const src of all) {
    assert.match(src, /id="pt-expand" class="pt-xp"[^>]*>⤢ 大きく読む</);
    assert.match(src, /id="pt-shrink" class="pt-x"[^>]*>✕ もどす</);
    assert.match(src, /<span class="tp-x-t">大きく読む<\/span>/);
    // 下段パネルのトグル結線も新文言
    assert.match(src, /tpTx\.textContent = on \? "もどす" : "大きく読む"/);
    assert.doesNotMatch(src, /⤢ 広げる/);
    assert.doesNotMatch(src, /✕ 戻す/);
  }
});

test("F8: 金の吹き出し（.xp-hint）が両カードに hidden で入り、承認済みの本文を持つ", () => {
  for (const src of all) {
    assert.match(src, /\.xp-hint \{ position: absolute;[^}]*background: #ffd977;/);
    assert.match(src, /id="pt-hint" role="note" hidden>/);
    assert.match(src, /id="tp-hint" role="note" hidden>/);
    assert.match(src, /押すと、このカードが大きくなって全文が読めます。もう一度押すと戻ります/);
    assert.match(src, /押すと、パネルが大きくなって一覧が読みやすくなります/);
    // flow では .tp-wrap が static のため、パネル吹き出しはカード基準でタブ行の下に出す
    assert.match(src, /html\.flow #tabpanel \.xp-hint \{ top: 100px;/);
  }
});

test("F8: ヒントの記録キーは本体 td_／あゆ版 ayu_ で分かれている", () => {
  for (const src of mains) {
    assert.match(src, /td_hint_points_v1/);
    assert.match(src, /td_hint_panel_v1/);
    assert.doesNotMatch(src, /ayu_hint_points_v1/);
    assert.doesNotMatch(src, /ayu_hint_panel_v1/);
  }
  for (const src of forks) {
    assert.match(src, /ayu_hint_points_v1/);
    assert.match(src, /ayu_hint_panel_v1/);
    assert.doesNotMatch(src, /"td_hint_points_v1"/);
    assert.doesNotMatch(src, /"td_hint_panel_v1"/);
  }
});

test("F8: 吹き出しはタップで消え、広げても自動で消える結線がある", () => {
  for (const src of all) {
    // 吹き出し自体のタップで消す
    assert.match(src, /ptHint\.addEventListener\("click", dismissPtHint\)/);
    assert.match(src, /tpHint\.addEventListener\("click", dismissTpHint\)/);
    // 注目ポイントは、ボタンでもタブでも pt-expanded が付いたら監視で消す
    assert.match(src, /new MutationObserver\(function \(\) \{ if \(ptsCard\.classList\.contains\("pt-expanded"\)\) dismissPtHint\(\); \}\)/);
    // 下段パネルはトグル結線の中で消す
    assert.match(src, /if \(on\) dismissTpHint\(\);/);
    // 未記録のときだけ出す
    assert.match(src, /if \(!ptHintSeen && ptsCard && !ptsCard\.classList\.contains\("pt-expanded"\)\) ptHint\.hidden = false;/);
    assert.match(src, /if \(!tpHintSeen && tpPanel && !tpPanel\.classList\.contains\("tp-expanded"\)\) tpHint\.hidden = false;/);
  }
});

test("F8: あゆ版は新文言と吹き出しが日英辞書に入り、data-i18n で結ばれている", () => {
  for (const src of forks) {
    assert.match(src, /ptExpand: "⤢ 大きく読む"/);
    assert.match(src, /ptShrink: "✕ もどす"/);
    assert.match(src, /ptExpand: "⤢ Read larger"/);
    assert.match(src, /ptShrink: "✕ Shrink back"/);
    assert.match(src, /tpExpand: "Read larger"/);
    assert.match(src, /tpShrink: "Shrink back"/);
    assert.match(src, /ptHint: "Tap to make this card bigger and read the full text\. Tap again to shrink it back\."/);
    assert.match(src, /tpHint: "Tap to make this panel bigger so the list is easier to read\."/);
    assert.match(src, /data-i18n="ptHint"/);
    assert.match(src, /data-i18n="tpHint"/);
    // 言語切替時に下段パネルのボタンも状態に合わせて塗り直す
    assert.match(src, /txt\.textContent = ton \? L\.tpShrink : L\.tpExpand/);
  }
});
