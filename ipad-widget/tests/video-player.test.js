const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// 2026-11-16 のオーナー要望「アニメを観た後、一つ前の画面に戻れるように」の回帰テスト。
// 約束：動画は別タブで開かず、画面内プレーヤーで開く。閉じれば元の画面にそのまま戻る。
// 埋め込みダッシュボードからは dash-video でホーム側プレーヤーに委ねる（dash-gloss と同じ流儀）。

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const HOME = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("画面内プレーヤー：両ページに openVideo / closeVideo と受け口がある", () => {
  for (const [name, src] of [["gold.html", GOLD], ["index.html", HOME]]) {
    assert.ok(src.includes("window.openVideo = function"), name + " に openVideo がある");
    assert.ok(src.includes("window.closeVideo = function"), name + " に closeVideo がある");
    assert.ok(src.includes('id="vdOverlay"') || src.includes('"vdOverlay"'), name + " にプレーヤーの受け口がある");
    assert.ok(src.includes("✕ 閉じて戻る"), name + " に「閉じて戻る」ボタンがある");
    assert.ok(src.includes(".vdov{"), name + " にプレーヤーの見た目がある");
  }
});

test("動画リンクは別タブで開かず、クリックを横取りして画面内プレーヤーで開く", () => {
  for (const [name, src] of [["gold.html", GOLD], ["index.html", HOME]]) {
    assert.ok(src.includes("a[href$=\".mp4\"]"), name + " に mp4 リンクの横取りがある");
    assert.ok(src.includes("e.preventDefault(); window.openVideo(href, a.title || \"\");"), name + " で横取り後に openVideo を呼ぶ");
  }
  assert.ok(!GOLD.includes('window.open(url, "_blank", "noopener")'), "gold.html の使い方ボタンは別タブで開かない");
  assert.ok(!HOME.includes('window.open(v.getAttribute("data-video"), "_blank"'), "用語集の動画ボタンは別タブで開かない");
});

test("使い方ボタンは画面内プレーヤーで開く", () => {
  assert.ok(GOLD.includes('if (url) { window.openVideo(url, "使い方アニメ"); return; }'), "ダッシュボードの使い方ボタンが openVideo を使う");
  assert.ok(HOME.includes('if (url) { window.openVideo(url, "使い方アニメ"); return; }'), "ホームの使い方ボタンが openVideo を使う");
});

test("埋め込み時は dash-video でホームへ委ね、ホームはそれを受ける", () => {
  assert.ok(GOLD.includes('type: "dash-video", key: (window.INSTR_KEY || "gold")'), "ダッシュボードがシート名キーで dash-video を送る");
  assert.ok(HOME.includes('d.type !== "dash-video"'), "ホームの受信ゲートに dash-video がある");
  assert.ok(HOME.includes('if (d.type === "dash-video") { if (window.openVideo) window.openVideo(String(d.url || ""), String(d.title || "")); return; }'), "ホームが dash-video を受けて openVideo で開く");
});

test("プレーヤーの見出しに「何の動画か」が出る", () => {
  for (const [name, src] of [["gold.html", GOLD], ["index.html", HOME]]) {
    assert.ok(src.includes("window.openVideo = function (url, title)"), name + " の openVideo はタイトルを受け取る");
    assert.ok(src.includes('id="vdTitle"'), name + " にタイトル表示がある");
    assert.ok(src.includes('tt.textContent = title ? "▶ " + title : "▶ アニメ動画"'), name + " でタイトルが表示に反映される");
  }
  assert.ok(GOLD.includes('title: title || ""'), "dash-video にタイトルも載せて送る");
});
