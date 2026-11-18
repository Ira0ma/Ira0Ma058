// あゆ版の再発防止テスト（2026-11-18の価格凍結障害を受けて追加）。
// 障害の内容：あゆ版ダッシュボード4面（gold/usdjpy/btc/oil）で IS_SILVER が未定義のまま
// 参照され、スポット価格の更新が毎回例外で止まり、週末の終値のまま凍結した。
// ここでは「参照している IS_* 定数が全て定義されていること」と、
// 「予備データ（data-live）への自動切替が生成元に入っていること」を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const DASH = ["gold", "usdjpy", "btc", "oil", "silver"];

function isConstants(src) {
  const defined = new Set();
  for (const m of src.matchAll(/\b(IS_[A-Z]+)\s*=/g)) defined.add(m[1]);
  for (const m of src.matchAll(/[,;]\s*(IS_[A-Z]+)=/g)) defined.add(m[1]);
  const refs = new Set();
  for (const m of src.matchAll(/\b(IS_[A-Z]+)\b/g)) refs.add(m[1]);
  return { defined, refs };
}

for (const name of DASH) {
  test(`あゆ版 ${name}：参照する IS_* 定数が全て定義されている`, () => {
    const src = readFileSync(join(repo, "ayu", name + ".html"), "utf-8");
    const { defined, refs } = isConstants(src);
    const undef = [...refs].filter((r) => !defined.has(r));
    assert.deepEqual(undef, [], `未定義のまま参照されている定数: ${undef.join(", ")}`);
  });

  test(`あゆ版 ${name}：予備データ自動切替と出典表示が入っている`, () => {
    const src = readFileSync(join(repo, "ayu", name + ".html"), "utf-8");
    assert.ok(src.includes("SITE_FALLBACK"), "SITE_FALLBACK がない");
    assert.ok(src.includes("data-live/market.json"), "予備データのURLがない");
    assert.ok(src.includes('id="siteSrc"'), "出典表示の置き場がない");
    assert.ok(src.includes("予備を表示中"), "出典表示の文言がない");
  });
}

test("あゆ版ホーム：予備データ自動切替が生成元に入っている", () => {
  const src = readFileSync(join(repo, "ayu", "index.src.html"), "utf-8");
  assert.ok(src.includes("marketFromBackup"), "marketFromBackup がない");
  assert.ok(src.includes("data-live/market.json"), "予備データのURLがない");
  assert.ok(src.includes("予備データで表示中"), "出典表示の文言がない");
});
