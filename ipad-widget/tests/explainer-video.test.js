const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const HOME = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const VIDEOS = path.join(__dirname, "..", "learn", "videos");

const FILES = ["soroi","momentum","rikaku-yochi","icchido","suiheisen","sma","trade-style","range","neckline","fvg","kyoyo-risk","mtf","gmma","atr","choch","keizai","channel","fibonacci","sanzon","gyaku-sanzon","double-top","double-bottom","cup-handle","gyaku-cup","choch-bos","dxy-guide","beikinri-guide","shokokin","kinkyu-alert","cashback"];

test("説明動画：30本すべてが learn/videos に実在する", () => {
  assert.equal(FILES.length, 30);
  for (const f of FILES) assert.ok(fs.existsSync(path.join(VIDEOS, f + "-cinematic.mp4")), f + "-cinematic.mp4 がある");
});

test("説明動画：ダッシュボード側の結びつけ（tip4・見出し3・ガイド2）", () => {
  for (const k of ["soroi","momentum","rikaku-yochi","icchido"]) assert.ok(GOLD.includes('"' + k + '"') || GOLD.includes(k + "-cinematic"), "tip対応 " + k);
  assert.ok(GOLD.includes("learn/videos/trade-style-cinematic.mp4"), "トレードスタイルは利確判定の型の横");
  assert.ok(GOLD.includes("learn/videos/kinkyu-alert-cinematic.mp4"), "緊急アラートはアラート見出し");
  assert.ok(GOLD.includes("learn/videos/shokokin-cinematic.mp4"), "証拠金はリスク見出し");
  assert.ok(GOLD.includes("learn/videos/cashback-cinematic.mp4"), "キャッシュバックはリスク見出し");
  assert.ok(GOLD.includes("learn/videos/dxy-guide-cinematic.mp4"), "DXYガイド末尾");
  assert.ok(GOLD.includes("learn/videos/beikinri-guide-cinematic.mp4"), "米金利ガイド末尾");
});

test("説明動画：用語集・レッスンへの差し込み（名前表・ID表・ボタン生成）", () => {
  assert.ok(HOME.includes("var GLOSS_VIDEO = {"), "名前対応表がある");
  assert.ok(HOME.includes("var GLOSS_VIDEO_ID = {"), "レッスンID対応表がある");
  assert.ok(HOME.includes("gbVideoBtn(t[0], null, t[0])"), "用語集の項目にボタンが付く");
  assert.ok(HOME.includes("gbVideoBtn(null, L.id, t[0])"), "レッスンの項目にボタンが付く");
  assert.ok(HOME.includes("'▶ ' + lb + 'のアニメで見る'"), "ボタンの文言に用語名が入る（何の動画か分かる）");
  assert.ok(HOME.includes('closest(".gb-video")'), "ボタンのクリックで動画が開く");
});
