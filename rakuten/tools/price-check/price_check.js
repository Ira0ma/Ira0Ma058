#!/usr/bin/env node
// 楽天の商品ページを実ブラウザ（Playwright）で開いて、価格・在庫・バリエーション・リンク先を基準値と突き合わせる。
// 読み取り専用：クリック・入力をせず、GET/HEAD 以外のリクエストはブラウザ側で遮断する。
// ボットチェックが出たら、その時点で残りを実行せずに止める。
//
//   node rakuten/tools/price-check/price_check.js --input price_watch_log.csv --post-id R0012 --post-id R0015
//   node rakuten/tools/price-check/price_check.js --input targets.csv --row 3 --row 4
//   node rakuten/tools/price-check/price_check.js --url https://item.rakuten.co.jp/shop/item/ --baseline 1980
//
// 結果は --out-dir に price_check_<日時>.csv / .md / .json として新しく書く（既存ファイルは上書きしない）。

const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.js");

const USAGE = `使い方:
  --input <csv>          対象の CSV（item_url と baseline_price_yen の列が必要。price_watch_log.csv / posts.csv 形式）
  --post-id <id>         この post_id の行だけ（複数指定可）
  --row <n>              CSV の n 行目（見出しを除いて1から。複数指定可）
  --latest-per-post      同じ post_id が複数あるとき、checked_date / checked_at_jst が最新の行だけ使う
  --url <url> --baseline <円> [--item-name <名前>] [--post-id <id>]   1件だけ指定
  --out-dir <dir>        出力先（既定: カレントディレクトリ）
  --min-interval <秒>    ページ間の最短間隔（既定 20、楽天のページは 10 未満にできない）
  --jitter <秒>          間隔に足すゆらぎの上限（既定 10）
  --max-items <n>        1回で開く最大件数（既定 20）
  --timeout <秒>         1ページの読み込み待ち（既定 30）
  --save-html <dir>      一致以外のページの HTML を保存（セレクタ確認用）
  --headed               ブラウザを画面に表示して実行
  --executable-path <p>  Chromium の場所（通常は不要）`;

function parseArgs(argv) {
  const opt = { postIds: [], rows: [], outDir: ".", minInterval: 20, jitter: 10, maxItems: 20, timeout: 30 };
  const take = (i) => {
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} の値がありません`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--input": opt.input = take(i); i++; break;
      case "--post-id": opt.postIds.push(take(i)); i++; break;
      case "--row": opt.rows.push(Number(take(i))); i++; break;
      case "--latest-per-post": opt.latestPerPost = true; break;
      case "--url": opt.url = take(i); i++; break;
      case "--baseline": opt.baseline = take(i); i++; break;
      case "--item-name": opt.itemName = take(i); i++; break;
      case "--out-dir": opt.outDir = take(i); i++; break;
      case "--min-interval": opt.minInterval = Number(take(i)); i++; break;
      case "--jitter": opt.jitter = Number(take(i)); i++; break;
      case "--max-items": opt.maxItems = Number(take(i)); i++; break;
      case "--timeout": opt.timeout = Number(take(i)); i++; break;
      case "--save-html": opt.saveHtml = take(i); i++; break;
      case "--headed": opt.headed = true; break;
      case "--executable-path": opt.executablePath = take(i); i++; break;
      case "-h": case "--help": opt.help = true; break;
      default: throw new Error(`不明な指定: ${a}`);
    }
  }
  return opt;
}

function loadTargets(opt) {
  if (opt.url) {
    return [{ __row: 1, post_id: opt.postIds[0] || "", item_name: opt.itemName || "", item_url: opt.url, baseline_price_yen: opt.baseline }];
  }
  if (!opt.input) throw new Error("--input か --url を指定してください");
  let rows = L.parseCsv(fs.readFileSync(opt.input, "utf8"));
  if (rows.length && !("item_url" in rows[0] && "baseline_price_yen" in rows[0])) {
    throw new Error(`${opt.input} に item_url と baseline_price_yen の列がありません`);
  }
  if (opt.rows.length) rows = rows.filter((r) => opt.rows.includes(r.__row));
  if (opt.postIds.length) rows = rows.filter((r) => opt.postIds.includes(r.post_id));
  if (opt.latestPerPost) {
    const latest = new Map();
    const key = (r) => `${r.checked_date || ""} ${r.checked_at_jst || ""}`;
    for (const r of rows) {
      const prev = latest.get(r.post_id);
      if (!prev || key(r) > key(prev)) latest.set(r.post_id, r);
    }
    rows = [...latest.values()];
  }
  return rows;
}

function minIntervalFor(url, requested) {
  let host = "";
  try { host = new URL(url).hostname; } catch { /* 入力不備は judge で返す */ }
  return L.isLoopback(host) ? requested : Math.max(requested, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readPage(page, url, timeoutMs) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // JSON-LD を後から差し込むページのため、通信が落ち着くまで少しだけ待つ（待ちきれなくても続ける）
    await page.waitForLoadState("networkidle", { timeout: Math.min(10000, timeoutMs) }).catch(() => {});
    const data = await page.evaluate(() => {
      const attr = (sel, a) => document.querySelector(sel)?.getAttribute(a) || null;
      const scope = document.querySelector('[itemscope][itemtype*="schema.org/Product"]') || document;
      const prop = (name) => {
        const el = scope.querySelector(`[itemprop="${name}"]`);
        return el ? el.getAttribute("content") || el.getAttribute("href") || el.textContent.trim() : null;
      };
      return {
        title: document.title,
        bodyText: document.body ? document.body.innerText.slice(0, 5000) : "",
        canonical: attr('link[rel="canonical"]', "href"),
        ogUrl: attr('meta[property="og:url"]', "content"),
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
        microdata: { name: prop("name"), price: prop("price"), availability: prop("availability") },
      };
    });
    return { ...data, status: resp ? resp.status() : null, finalUrl: page.url() };
  } catch (e) {
    return { error: String(e.message || e).split("\n")[0], finalUrl: page.url() };
  }
}

function timestamp(d) {
  const t = L.jstParts(d);
  return `${t.date.replace(/-/g, "")}_${t.time.replace(/:/g, "")}`;
}

async function run(opt, { log = console.error } = {}) {
  const targets = loadTargets(opt);
  if (!targets.length) throw new Error("対象の行がありません");
  if (targets.length > opt.maxItems) {
    throw new Error(`対象が ${targets.length} 件あり、上限 ${opt.maxItems} 件を超えています（--max-items で変更、または対象を絞ってください）`);
  }

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: !opt.headed, executablePath: opt.executablePath });
  const context = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  let blocked = 0;
  // 読み取り専用の保証：GET/HEAD/OPTIONS 以外（フォーム送信・カート追加・計測の POST など）は送らない
  await context.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    blocked++;
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();

  const results = [];
  let stopped = null;
  let consecutiveFails = 0;
  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (stopped) {
        results.push({ target, result: { verdict: L.VERDICT.FAIL, fail: { ...L.FAIL_REASON.NOT_RUN, detail: stopped },
          current_price_yen: null, diff_yen: null, stock_status: "未確認", variants: [], reasons: [], checkedAt: new Date() } });
        continue;
      }
      if (i > 0) {
        const wait = minIntervalFor(target.item_url, opt.minInterval) + Math.random() * opt.jitter;
        log(`  …${wait.toFixed(1)}秒待機`);
        await sleep(wait * 1000);
      }
      const before = blocked;
      const snapshot = target.item_url ? await readPage(page, target.item_url, opt.timeout * 1000) : {};
      const result = { ...L.judge(target, snapshot), checkedAt: new Date(), blocked_writes: blocked - before };
      results.push({ target, result });
      log(`[${i + 1}/${targets.length}] ${result.verdict} ${target.post_id || ""} ${target.item_url}`);

      if (opt.saveHtml && result.verdict !== L.VERDICT.MATCH && !snapshot.error) {
        fs.mkdirSync(opt.saveHtml, { recursive: true });
        const file = path.join(opt.saveHtml, `${timestamp(result.checkedAt)}_${i + 1}.html`);
        fs.writeFileSync(file, await page.content().catch(() => ""), { flag: "wx" });
      }
      consecutiveFails = result.verdict === L.VERDICT.FAIL ? consecutiveFails + 1 : 0;
      if (result.fail && result.fail.stop) stopped = `${result.fail.label}が出たため停止（${i + 1}件目）`;
      else if (consecutiveFails >= 3) stopped = `取得不可が3件続いたため停止（${i + 1}件目）`;
      if (stopped) log(`停止: ${stopped}`);
    }
  } finally {
    await browser.close();
  }

  fs.mkdirSync(opt.outDir, { recursive: true });
  const base = path.join(opt.outDir, `price_check_${timestamp(new Date())}`);
  const md = L.toMarkdown(results) + (stopped ? `\n**${stopped}**。残りは実行していません。\n` : "");
  // wx: 同名ファイルがあれば失敗させ、既存の記録を上書きしない
  fs.writeFileSync(`${base}.csv`, L.toCsv(results.map(({ target, result }) => L.toLogRow(target, result))), { flag: "wx" });
  fs.writeFileSync(`${base}.md`, md, { flag: "wx" });
  fs.writeFileSync(`${base}.json`, JSON.stringify({ stopped, blocked_write_requests: blocked, results }, null, 2), { flag: "wx" });
  return { results, stopped, blocked, files: [`${base}.csv`, `${base}.md`, `${base}.json`], md };
}

if (require.main === module) {
  let opt;
  try {
    opt = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${e.message}\n\n${USAGE}`);
    process.exit(64);
  }
  if (opt.help) {
    console.log(USAGE);
    process.exit(0);
  }
  run(opt).then(
    ({ stopped, files, md }) => {
      process.stdout.write(md);
      console.error(`\n出力: ${files.join(", ")}`);
      process.exit(stopped ? 2 : 0);
    },
    (e) => {
      console.error(`エラー: ${e.message}`);
      process.exit(1);
    },
  );
}

module.exports = { parseArgs, loadTargets, run };
