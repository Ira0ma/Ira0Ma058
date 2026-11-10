// 旗艦ジョブ（あゆ版 src 再統一）の固定テスト。
// 1) ayu-build/build_ayu.py --check が「clean」：ayu/index.html と ipad-widget/learn/ayu/ が、生成元（ayu/index.src.html ほか）
//    から1コマンドで作り直したものと一致していること（実物へ直接パッチしてずれる運用に戻らないように）。
// 2) 後から足した機能が生成元に入っていること（再生成で消えないように）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const src = readFileSync(join(repo, "ayu", "index.src.html"), "utf-8");

test("あゆ版：生成物が生成元から1コマンドで再現できる（build_ayu.py --check が clean）", () => {
  const r = spawnSync("python3", [join(repo, "ayu-build", "build_ayu.py"), "--check"], { encoding: "utf-8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match(r.stdout, /clean/);
});

test("あゆ版：後から足した機能が生成元（ayu/index.src.html）に入っている", () => {
  const marks = {
    "恵みの光テーマ": "graceScene",
    "十字架の描画": "十字架",
    "取引アプリボタン（XM TD／MT5）": "TraderPro",
    "取引アプリボタン（MT5）": "MetaTrader 5",
    "週末ボードのボタン": "weekend.html",
    "注目ポイント内タブ": "pt-tab",
    "確定申告タブ": "確定申告",
    "今日のみことば": "今日のみことば",
    "聖書66書の通読チェック": "ayu_bible_check_v1",
    "日英切替": "TDLangApply",
    "初回のあいさつ": "ayu_greeted_v1",
    "F10 エントリー枠の下辺": "html:not(.flow) .mkt.entry-buy::before, html:not(.flow) .mkt.entry-sell::before, html:not(.flow) .mkt.entry-buy::after, html:not(.flow) .mkt.entry-sell::after { bottom: 30px; }",
  };
  for (const [name, needle] of Object.entries(marks)) assert.ok(src.includes(needle), name + " が生成元にない");
});
