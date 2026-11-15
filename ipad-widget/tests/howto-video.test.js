const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const GOLD = fs.readFileSync(path.join(__dirname, "..", "gold.html"), "utf8");
const HOME = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const BUILD = fs.readFileSync(path.join(__dirname, "..", "build.py"), "utf8");
const VIDEOS = path.join(__dirname, "..", "..", "videos");

test("使い方動画：全6スロットに実ファイルつきで割り当て済み", () => {
  const dash = { gold: "gold-guide.mp4", usdjpy: "usdjpy-guide.mp4", silver: "silver-guide.mp4", btc: "btc-guide.mp4", oil: "oil-guide.mp4" };
  for (const [k, f] of Object.entries(dash)) {
    assert.ok(GOLD.includes(`window.HOWTO_VIDEO["howto-${k}"] = "videos/${f}";`), `gold.html に howto-${k} の割り当てがある`);
    assert.ok(fs.existsSync(path.join(VIDEOS, f)), `videos/${f} が実在する`);
  }
  assert.ok(HOME.includes('window.HOWTO_VIDEO["howto-app"] = "videos/deskone-guide.mp4";'), "ホームに howto-app の割り当てがある");
  assert.ok(fs.existsSync(path.join(VIDEOS, "deskone-guide.mp4")), "videos/deskone-guide.mp4 が実在する");
});

test("使い方動画：learn/silver.html ではサイト絶対パスに書き換わる", () => {
  assert.ok(BUILD.includes('window.HOWTO_VIDEO["howto-silver"] = (location.hostname.endsWith('), "build.py に learn 用の書き換えがある");
  const learn = fs.readFileSync(path.join(__dirname, "..", "learn", "silver.html"), "utf8");
  assert.ok(learn.includes("/Ira0Ma058/') + \"videos/silver-guide.mp4\""), "生成済み learn/silver.html で絶対パスになっている");
  assert.ok(!learn.includes('HOWTO_VIDEO["howto-silver"] = "videos/'), "learn 側に相対パスのままの銀割り当ては残っていない");
});
