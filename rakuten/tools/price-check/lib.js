// 価格チェッカーの判定ロジック（ブラウザを使わない純粋な関数だけ）。
// ページから読み取った材料（snapshot）を受け取り、価格・在庫・バリエーション・リンク先を取り出して、
// 基準値と突き合わせる。推測で値を埋めず、読めなかったものは null のまま返す。

const VERDICT = { MATCH: "一致", DIFF: "差異あり", FAIL: "取得不可" };

// 取得不可の理由。stop: true のものは、それ以上アクセスを続けずに実行を止める
const FAIL_REASON = {
  BOT_CHECK: { code: "bot_check", label: "ボットチェック", stop: true },
  NOT_FOUND: { code: "not_found", label: "ページ不存在", stop: false },
  LOAD_FAILED: { code: "load_failed", label: "一時的な読み込み失敗", stop: false },
  NO_CONNECTION: { code: "no_connection", label: "接続不可（ネットワーク・プロキシ）", stop: true },
  NO_PRICE: { code: "no_price", label: "価格を読み取れず", stop: false },
  NO_STOCK: { code: "no_stock_info", label: "在庫を読み取れず", stop: false },
  BAD_INPUT: { code: "bad_input", label: "入力不備", stop: false },
  NOT_RUN: { code: "not_run", label: "未実行（前の商品で停止）", stop: false },
};

// ボットチェック・アクセス制限の画面に出る文言。ページ本文の先頭とタイトルだけを見る
const BOT_PATTERNS = [
  /captcha/i, /recaptcha/i, /hcaptcha/i, /are you a (human|robot)/i, /verify you are (a )?human/i,
  /unusual traffic/i, /access denied/i, /request blocked/i, /bot detection/i, /cf-chl/i,
  /ロボットではありません/, /不正なアクセス/, /アクセスが制限/, /アクセスを制限/, /アクセスが集中/,
  /しばらく時間をおいて/, /認証が必要/,
];
const NOT_FOUND_PATTERNS = [/ページが見つかりません/, /お探しのページ/, /not found/i];

function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost";
}

// 楽天の商品ページ URL から「ショップ／商品」の識別子を取り出す。
// アフィリエイトリンク（hb.afl.rakuten.co.jp）は pc= の行き先を使う
function itemIdentity(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.endsWith("afl.rakuten.co.jp") && u.searchParams.get("pc")) {
    return itemIdentity(u.searchParams.get("pc"));
  }
  if (u.hostname === "item.rakuten.co.jp" || isLoopback(u.hostname)) {
    const [shop, item] = u.pathname.split("/").filter(Boolean);
    return shop && item ? `${shop}/${item}` : null;
  }
  return null;
}

function toYen(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[,，円¥\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const STOCK_MAP = {
  instock: "在庫あり", limitedavailability: "在庫あり", instoreonly: "在庫あり", onlineonly: "在庫あり",
  outofstock: "在庫なし", soldout: "在庫なし", discontinued: "販売終了",
  preorder: "予約", presale: "予約", backorder: "取り寄せ",
};

function stockLabel(availability) {
  if (!availability) return null;
  const key = String(availability).split("/").pop().toLowerCase();
  return STOCK_MAP[key] || null;
}

function asArray(x) {
  return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x];
}

function hasType(node, type) {
  return asArray(node && node["@type"]).some((t) => String(t).toLowerCase() === type.toLowerCase());
}

// JSON-LD の中から Product / ProductGroup を探す（@graph や配列の入れ子も見る）
function findProducts(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findProducts(n, out));
    return out;
  }
  if (hasType(node, "Product") || hasType(node, "ProductGroup")) out.push(node);
  if (node["@graph"]) findProducts(node["@graph"], out);
  return out;
}

function offerRows(offers, name) {
  const rows = [];
  for (const offer of asArray(offers)) {
    if (hasType(offer, "AggregateOffer")) {
      rows.push({ name, price: toYen(offer.lowPrice), availability: offer.availability, low: toYen(offer.lowPrice), high: toYen(offer.highPrice) });
      rows.push(...offerRows(offer.offers, name));
    } else {
      rows.push({ name, price: toYen(offer.price), availability: offer.availability });
    }
  }
  return rows;
}

// 構造化データ（JSON-LD → microdata）から商品情報を読む。どこから読んだかを source に残す
function extractItem(snapshot) {
  const result = { name: null, price: null, stock: null, variants: [], priceRange: null, source: null };

  for (const raw of snapshot.jsonLd || []) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const products = findProducts(data);
    if (!products.length) continue;
    const main = products.find((p) => hasType(p, "Product") && p.offers) || products[0];
    result.name = main.name || null;
    const mainOffers = offerRows(main.offers, main.name);
    const variants = [];
    for (const v of asArray(main.hasVariant)) variants.push(...offerRows(v.offers, v.name || v.sku || null));
    if (variants.length === 0 && mainOffers.length > 1) variants.push(...mainOffers.filter((o) => o.price !== null));

    const agg = mainOffers.find((o) => o.low !== undefined);
    if (agg && agg.low !== null && agg.high !== null && agg.low !== agg.high) result.priceRange = [agg.low, agg.high];
    const first = mainOffers.find((o) => o.price !== null) || variants.find((o) => o.price !== null);
    result.price = first ? first.price : null;
    const stocks = [...mainOffers, ...variants].map((o) => stockLabel(o.availability)).filter(Boolean);
    result.stock = stocks.includes("在庫あり") ? "在庫あり" : stocks[0] || null;
    result.variants = variants.map((v) => ({ name: v.name, price: v.price, stock: stockLabel(v.availability) }));
    result.source = "json-ld";
    if (result.price !== null) return result;
  }

  const md = snapshot.microdata || {};
  if (toYen(md.price) !== null) {
    result.name = result.name || md.name || null;
    result.price = toYen(md.price);
    result.stock = result.stock || stockLabel(md.availability);
    result.source = "microdata";
  }
  return result;
}

function classifyFailure(snapshot) {
  if (snapshot.error) {
    // 名前解決・プロキシ・回線の失敗はサイト側の問題ではないので分けて返し、続けても同じなので止める
    if (/ERR_(NAME_NOT_RESOLVED|TUNNEL_CONNECTION_FAILED|PROXY_|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE)/.test(snapshot.error)) {
      return { ...FAIL_REASON.NO_CONNECTION, detail: snapshot.error };
    }
    return { ...FAIL_REASON.LOAD_FAILED, detail: snapshot.error };
  }
  const head = `${snapshot.title || ""}\n${(snapshot.bodyText || "").slice(0, 3000)}`;
  const status = snapshot.status;
  if (status === 429 || BOT_PATTERNS.some((re) => re.test(head))) {
    return { ...FAIL_REASON.BOT_CHECK, detail: `HTTP ${status}` };
  }
  if (status === 403) {
    // 403 は制限のことが多いが、断定できないので詳細に書いて止める
    return { ...FAIL_REASON.BOT_CHECK, detail: "HTTP 403（アクセス拒否。ボットチェックと見なして停止）" };
  }
  if (status === 404 || status === 410) return { ...FAIL_REASON.NOT_FOUND, detail: `HTTP ${status}` };
  if (status >= 500) return { ...FAIL_REASON.LOAD_FAILED, detail: `HTTP ${status}` };
  if (NOT_FOUND_PATTERNS.some((re) => re.test(snapshot.title || ""))) {
    return { ...FAIL_REASON.NOT_FOUND, detail: `タイトル「${snapshot.title}」` };
  }
  return null;
}

// 1商品の判定。target = { item_url, baseline_price_yen, ... }、snapshot = ブラウザで読んだ材料
function judge(target, snapshot) {
  const baseline = toYen(target.baseline_price_yen);
  const base = {
    current_price_yen: null, diff_yen: null, stock_status: "未確認", final_url: snapshot.finalUrl || null,
    variants: [], price_source: null, reasons: [], fail: null,
  };
  if (!target.item_url || baseline === null) {
    return { ...base, verdict: VERDICT.FAIL, fail: { ...FAIL_REASON.BAD_INPUT, detail: "item_url と baseline_price_yen が必要" } };
  }

  const failure = classifyFailure(snapshot);
  if (failure) return { ...base, verdict: VERDICT.FAIL, fail: failure };

  // 開いたページが目的の商品か：行き先URL → canonical → og:url の順に、ショップ／商品の識別子を比べる
  const want = itemIdentity(target.item_url);
  const pageIds = [snapshot.finalUrl, snapshot.canonical, snapshot.ogUrl].map(itemIdentity).filter(Boolean);
  if (want && pageIds.length === 0) {
    return { ...base, verdict: VERDICT.FAIL, fail: { ...FAIL_REASON.NOT_FOUND, detail: `商品ページ以外に移動（${snapshot.finalUrl}）` } };
  }
  const urlMatch = want ? pageIds.includes(want) : null;

  const item = extractItem(snapshot);
  const out = {
    ...base,
    current_price_yen: item.price,
    diff_yen: item.price === null ? null : item.price - baseline,
    stock_status: item.stock || "未確認",
    variants: item.variants,
    price_source: item.source,
    page_item_name: item.name,
  };

  if (urlMatch === false) out.reasons.push(`リンク先不一致（期待 ${want}／実際 ${pageIds.join(", ")}）`);
  if (item.price === null) {
    if (out.reasons.length) return { ...out, verdict: VERDICT.DIFF };
    return { ...out, verdict: VERDICT.FAIL, fail: { ...FAIL_REASON.NO_PRICE, detail: "構造化データ（JSON-LD・microdata）に価格なし" } };
  }
  if (item.price !== baseline) out.reasons.push(`価格 ${baseline}円 → ${item.price}円`);
  if (item.priceRange) out.reasons.push(`価格に幅あり ${item.priceRange[0]}〜${item.priceRange[1]}円`);
  const variantPrices = [...new Set(item.variants.map((v) => v.price).filter((p) => p !== null))];
  if (variantPrices.length > 1) out.reasons.push(`バリエーションで価格が異なる（${variantPrices.sort((a, b) => a - b).join("／")}円）`);
  if (item.stock && item.stock !== "在庫あり") out.reasons.push(`在庫：${item.stock}`);
  if (urlMatch === null) out.reasons.push("リンク先：楽天の商品URL形式でないため未照合");

  if (out.reasons.length) return { ...out, verdict: VERDICT.DIFF };
  if (!item.stock) {
    return { ...out, verdict: VERDICT.FAIL, fail: { ...FAIL_REASON.NO_STOCK, detail: "価格・リンク先は一致。在庫が読み取れないため人の確認へ" } };
  }
  return { ...out, verdict: VERDICT.MATCH };
}

// --- 入出力 ---

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((f) => f !== ""));
  if (!header) return [];
  return body.map((r, i) => Object.fromEntries([["__row", i + 1], ...header.map((h, j) => [h.trim(), r[j] ?? ""])]));
}

function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const LOG_COLUMNS = ["checked_date", "checked_at_jst", "post_id", "item_name", "item_url", "baseline_price_yen",
  "current_price_yen", "diff_yen", "stock_status", "status", "source", "note"];

function jstParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

function note(r) {
  const parts = [...r.reasons];
  if (r.fail) parts.unshift(`${r.fail.label}：${r.fail.detail}`);
  if (r.blocked_writes) parts.push(`書き込み系リクエストを${r.blocked_writes}件遮断`);
  return parts.join("／");
}

// price_watch_log.csv と同じ列の行
function toLogRow(target, r) {
  const t = jstParts(r.checkedAt);
  return {
    checked_date: t.date, checked_at_jst: t.time, post_id: target.post_id || "", item_name: target.item_name || "",
    item_url: target.item_url, baseline_price_yen: target.baseline_price_yen, current_price_yen: r.current_price_yen ?? "",
    diff_yen: r.diff_yen ?? "", stock_status: r.stock_status, status: r.verdict,
    source: r.price_source ? `playwright:${r.price_source}` : "playwright", note: note(r),
  };
}

function toCsv(rows) {
  return [LOG_COLUMNS.join(","), ...rows.map((row) => LOG_COLUMNS.map((c) => csvField(row[c])).join(","))].join("\n") + "\n";
}

function mdCell(v) {
  return String(v ?? "").replace(/\|/g, "｜").replace(/\n/g, " ");
}

// 点検担当がそのまま使う表
function toMarkdown(results) {
  const lines = [
    "| # | post_id | 判定 | 理由 | 基準価格 | 実測価格 | 在庫 | バリエーション | 確認時刻(JST) | 対象URL |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  results.forEach(({ target, result: r }, i) => {
    const t = jstParts(r.checkedAt);
    const variants = r.variants.length ? r.variants.map((v) => `${v.name ?? "?"}:${v.price ?? "?"}円`).join("、") : "-";
    lines.push(`| ${i + 1} | ${mdCell(target.post_id)} | ${r.verdict} | ${mdCell(note(r) || "-")} | ${mdCell(target.baseline_price_yen)} | ${r.current_price_yen ?? "-"} | ${r.stock_status} | ${mdCell(variants)} | ${t.date} ${t.time} | ${mdCell(target.item_url)} |`);
  });
  const count = (v) => results.filter((x) => x.result.verdict === v).length;
  lines.push("", `一致 ${count(VERDICT.MATCH)}件・差異あり ${count(VERDICT.DIFF)}件・取得不可 ${count(VERDICT.FAIL)}件。` +
    "このツールの「一致」は人の最終照合の代わりではありません。差異あり・取得不可は必ず人がブラウザで確認してください。");
  return lines.join("\n") + "\n";
}

module.exports = {
  VERDICT, FAIL_REASON, itemIdentity, toYen, extractItem, classifyFailure, judge,
  parseCsv, toCsv, toLogRow, toMarkdown, jstParts, LOG_COLUMNS, isLoopback,
};
