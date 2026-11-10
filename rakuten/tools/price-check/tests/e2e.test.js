// 実ブラウザ（Playwright の Chromium）で、ローカルに立てた合成ページを開く結合テスト。
// 楽天には接続しない。
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("../price_check.js");

const offer = (price, availability = "InStock") =>
  `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "合成商品",
    offers: { "@type": "Offer", price, availability: `https://schema.org/${availability}` } })}</script>`;

const PAGES = {
  "/shop/ok/": [200, `<title>合成商品</title>${offer(1980)}`],
  "/shop/up/": [200, `<title>合成商品</title>${offer(2180)}`],
  // 読み込み後に JS で JSON-LD を差し込むページ。さらにカート追加風の POST を投げる
  "/shop/late/": [200, `<title>合成商品</title><script>
    setTimeout(() => { const s = document.createElement("script"); s.type = "application/ld+json";
      s.textContent = ${JSON.stringify(JSON.stringify({ "@type": "Product", offers: { price: 1980, availability: "InStock" } }))};
      document.head.appendChild(s); }, 300);
    fetch("/cart/add", { method: "POST", body: "item=late" });
    navigator.sendBeacon && navigator.sendBeacon("/beacon", "x");
  </script>`],
  "/shop/gone/": [404, "<title>ページが見つかりません</title>"],
  "/shop/moved/": [302, "", { Location: "/shop/other/" }],
  "/shop/other/": [200, `<title>別商品</title>${offer(1980)}`],
  "/shop/captcha/": [200, "<title>確認</title><p>ロボットではありませんか？</p>"],
};

function startServer() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const p = PAGES[req.url];
    if (!p) { res.writeHead(404); return res.end(); }
    res.writeHead(p[0], { "Content-Type": "text/html; charset=utf-8", ...(p[2] || {}) });
    res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${p[1]}</body></html>`);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}` })));
}

function writeTargets(dir, base, ids) {
  const file = path.join(dir, "targets.csv");
  const lines = ["post_id,item_name,item_url,baseline_price_yen", ...ids.map((id) => `${id},合成商品,${base}/shop/${id}/,1980`)];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

const fast = { postIds: [], rows: [], minInterval: 0, jitter: 0, maxItems: 20, timeout: 15 };

test("一致・差異あり・後から出る価格・ページ不存在・リンク先不一致を判定し、書き込みは送らない", async () => {
  const { server, seen, base } = await startServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-"));
  try {
    const out = await run({ ...fast, input: writeTargets(dir, base, ["ok", "up", "late", "gone", "moved"]), outDir: dir }, { log: () => {} });
    const v = out.results.map((r) => [r.target.post_id, r.result.verdict, r.result.fail && r.result.fail.code]);
    assert.deepEqual(v, [
      ["ok", "一致", null], ["up", "差異あり", null], ["late", "一致", null], ["gone", "取得不可", "not_found"], ["moved", "差異あり", null],
    ]);
    assert.equal(out.results[1].result.diff_yen, 200);
    assert.match(out.results[4].result.reasons.join(), /リンク先不一致/);
    assert.equal(out.stopped, null);
    assert.ok(out.blocked >= 1, "POST を遮断した件数が記録される");
    assert.deepEqual(seen.filter((s) => !s.startsWith("GET ")), [], "サーバーには GET 以外が届いていない");
    // 出力は新しいファイルに書かれ、price_watch_log と同じ見出し
    const csv = fs.readFileSync(out.files[0], "utf8");
    assert.match(csv, /^checked_date,checked_at_jst,post_id,item_name,item_url,baseline_price_yen,current_price_yen,diff_yen,stock_status,status,source,note\n/);
    assert.match(fs.readFileSync(out.files[1], "utf8"), /\| 1 \| ok \| 一致 \|/);
  } finally {
    server.close();
  }
});

test("ボットチェックが出たら止まり、残りは開かない", async () => {
  const { server, seen, base } = await startServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-"));
  try {
    const out = await run({ ...fast, input: writeTargets(dir, base, ["ok", "captcha", "up"]), outDir: dir }, { log: () => {} });
    assert.deepEqual(out.results.map((r) => r.result.fail && r.result.fail.code), [null, "bot_check", "not_run"]);
    assert.match(out.stopped, /ボットチェック/);
    assert.ok(!seen.includes("GET /shop/up/"), "停止後のページは開いていない");
  } finally {
    server.close();
  }
});

test("上限件数を超える指定は、開く前に断る", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-"));
  const input = writeTargets(dir, "http://127.0.0.1:9", ["a", "b", "c"]);
  await assert.rejects(run({ ...fast, input, outDir: dir, maxItems: 2 }, { log: () => {} }), /上限 2 件/);
});
