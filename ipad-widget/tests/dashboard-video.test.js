const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// 2026-11-16 の指摘（ダッシュボードにアニメ説明が入っていない）の回帰テスト。
// 約束は「ダッシュボードの？説明ボタンが説明アニメの差し込み先」。用語集へ飛ばすだけでなく、
// 動画のある用語は？ボタンの横に▶動画チップを出して、その場でアニメを開けるようにする。

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const LEARN_SILVER = fs.readFileSync(path.join(__dirname, "..", "learn", "silver.html"), "utf8");

function dashVideoMap() {
  const m = GOLD.match(/const DASH_VIDEO=(\{[^}]*\});/);
  assert.ok(m, "DASH_VIDEO マップが gold.html にある");
  return JSON.parse(m[1]);
}

test("ダッシュボードの？ボタン：静的な data-gloss 用語は全部 DASH_VIDEO でカバーされる", () => {
  const map = dashVideoMap();
  const terms = [...new Set([...GOLD.matchAll(/data-gloss="([^"]+)"/g)].map((x) => x[1]))].filter((x) => !x.includes("'"));
  assert.ok(terms.length >= 14, "data-gloss 用語が14以上ある（実測: " + terms.length + "）");
  for (const t of terms) assert.ok(map[t], "用語「" + t + "」に動画が結びついている");
  for (const pid of ["p01", "p02", "p03", "p04", "p22", "p23", "p24", "p25", "p72", "p73"]) {
    assert.ok(map["pattern:" + pid], "パターン pattern:" + pid + " に動画が結びついている");
  }
});

test("DASH_VIDEO の指す先には実物の動画ファイルがある", () => {
  const map = dashVideoMap();
  for (const [term, f] of Object.entries(map)) {
    const p = path.join(__dirname, "..", "learn", "videos", f + "-cinematic.mp4");
    assert.ok(fs.existsSync(p), term + " → " + f + "-cinematic.mp4 が learn/videos にある");
  }
});

test("？ボタンの横にチップを付ける配線と、後から描かれるボタンへの追随がある", () => {
  assert.ok(GOLD.includes("function wireGqVideos()"), "wireGqVideos がある");
  assert.ok(GOLD.includes("MutationObserver"), "動的ボタンへの追随（MutationObserver）がある");
  assert.ok(GOLD.includes(".gqv{"), ".gqv の見た目がある");
  assert.ok(GOLD.includes("a.className='gqv'"), "チップは gqv クラスで作られる");
});

test("カード見出しの動画リンクは「アニメ」と分かる文言になっている", () => {
  for (const label of ["▶ 証拠金アニメ", "▶ キャッシュバックアニメ", "▶ 緊急アラートアニメ", "▶ トレードスタイルアニメ"]) {
    assert.ok(GOLD.includes(label), "見出しリンク「" + label + "」がある");
  }
});

test("チップの文言は「何の動画か」が分かる形になっている（2026-11-16 オーナー指摘）", () => {
  assert.ok(GOLD.includes("a.textContent='▶ '+lb+'動画'"), "チップは用語名入りの文言で作られる");
  assert.ok(GOLD.includes("a.title=lb+'の説明アニメ'"), "チップのタイトルにも用語名が入る");
  assert.ok(GOLD.includes("function dashVideoLabel(term)"), "用語→短い表示名の変換がある");
  // 全ての DASH_VIDEO キーが空でない表示名に解決できること（ラベル表＋フォールバックの複製で検証）
  const labelMap = JSON.parse(GOLD.match(/const DASH_VIDEO_LABEL=(\{[^}]*\});/)[1]);
  const map = dashVideoMap();
  for (const term of Object.keys(map)) {
    const lb = labelMap[term] || String(term).replace(/^[^:]*:/, "").replace(/（.*$/, "");
    assert.ok(lb && lb.length >= 1, "用語「" + term + "」の表示名が空でない");
    assert.ok(!lb.includes(":"), "用語「" + term + "」の表示名にキー接頭辞が残らない: " + lb);
  }
  assert.equal(labelMap["fvg:fvg-01"], "FVG", "FVG のチップは FVG と表示される");
  assert.equal(labelMap["マルチタイムフレーム分析"], "MTF", "長い用語は短い表示名になる");
});

test("ツールチップと相関ガイドの動画リンクも対象が分かる文言になっている", () => {
  assert.ok(GOLD.includes("a.textContent='▶ '+k+'のアニメで見る'"), "ツールチップのリンクに対象名が入る");
  assert.ok(GOLD.includes("▶ DXYのアニメで見る"), "DXY ガイドのリンクに対象名が入る");
  assert.ok(GOLD.includes("▶ 米金利のアニメで見る"), "米金利ガイドのリンクに対象名が入る");
});

test("learn配下の銀コピーでは動画パスが相対のまま残っていない（learn/learn の404防止）", () => {
  assert.ok(!LEARN_SILVER.includes('"learn/videos/'), 'learn/silver.html に相対の "learn/videos/ が残っていない');
  assert.ok(!LEARN_SILVER.includes("'learn/videos/"), "learn/silver.html に相対の 'learn/videos/ が残っていない");
  assert.ok(LEARN_SILVER.includes("https://ira0ma.github.io/Ira0Ma058/learn/videos/"), "絶対URL化されている");
});
