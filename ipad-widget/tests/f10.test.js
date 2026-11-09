// F10（点滅するエントリー枠の下辺が目次バーに切られないよう描画位置を逃がす修正）の静的ロック。
// 横向きでは .mk-idx（26px・z-index:3）が列の下端に重なり、z-index:-1 の枠の下辺と下の角が
// バーの背景に隠れる。枠の下辺だけを下から30px（バー26px＋4pxの余白）に描く上書きが
// 将来の編集や生成で静かに消えないようにするための固定テスト。
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

const OVERRIDE = "html:not(.flow) .mkt.entry-buy::before, html:not(.flow) .mkt.entry-sell::before, html:not(.flow) .mkt.entry-buy::after, html:not(.flow) .mkt.entry-sell::after { bottom: 30px; }";
const BASE = ".mkt.entry-buy::before, .mkt.entry-sell::before, .mkt.entry-buy::after, .mkt.entry-sell::after { content: \"\"; position: absolute; z-index: -1; inset: 6px 5px 4px; border-radius: 18px; pointer-events: none; }";

test("F10: 横向きでは枠の下辺を下から30pxに描く上書きがある（本体・生成版・あゆ版2コピー）", () => {
  for (const src of all) assert.ok(src.includes(OVERRIDE), "stage override (bottom: 30px) missing");
});

test("F10: 上書きは基本ルールより後ろにあり、基本の inset（6px 5px 4px）はそのまま", () => {
  for (const src of all) {
    assert.ok(src.includes(BASE), "base frame rule changed");
    assert.ok(src.indexOf(OVERRIDE) > src.indexOf(BASE), "override must follow the base rule");
  }
});

test("F10: 点滅のデザインは不変（色・1.3sの周期・reduced-motion の扱い）", () => {
  for (const src of all) {
    assert.ok(src.includes("@keyframes entryFade { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }"));
    assert.ok(src.includes("animation: entryFade 1.3s ease-in-out infinite"));
    assert.ok(src.includes(".mkt.entry-buy { --pulse: rgba(67,210,127,.55); --tint: rgba(67,210,127,.16); }"));
    assert.ok(src.includes(".mkt.entry-sell { --pulse: rgba(255,106,92,.6); --tint: rgba(255,106,92,.16); }"));
    assert.ok(src.includes("@media (prefers-reduced-motion: reduce) { .mkt.entry-buy::after, .mkt.entry-sell::after { animation: none; opacity: .6; }"));
  }
});
