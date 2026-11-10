// node --test rakuten/tools/price-check/tests/*.test.js
// ここのページ材料はすべて合成データ（楽天の実ページではない）
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lib.js");

const URL1 = "https://item.rakuten.co.jp/shop-a/item-1/";
const ld = (obj) => [JSON.stringify(obj)];
const product = (offers, extra = {}) => ({ "@context": "https://schema.org", "@type": "Product", name: "商品A", offers, ...extra });
const page = (over = {}) => ({ status: 200, finalUrl: URL1, title: "商品A：ショップA", bodyText: "商品A", ...over });
const target = { item_url: URL1, baseline_price_yen: "1980" };

test("価格・在庫・リンク先がすべて合えば一致", () => {
  const r = L.judge(target, page({ jsonLd: ld(product({ "@type": "Offer", price: "1980", availability: "https://schema.org/InStock" })) }));
  assert.equal(r.verdict, "一致");
  assert.equal(r.current_price_yen, 1980);
  assert.equal(r.diff_yen, 0);
  assert.equal(r.stock_status, "在庫あり");
  assert.equal(r.price_source, "json-ld");
});

test("価格が1円でも違えば差異ありで、差額を返す", () => {
  const r = L.judge(target, page({ jsonLd: ld(product({ "@type": "Offer", price: 2180, availability: "InStock" })) }));
  assert.equal(r.verdict, "差異あり");
  assert.equal(r.diff_yen, 200);
  assert.match(r.reasons.join(), /1980円 → 2180円/);
});

test("在庫なしは価格が合っていても差異あり", () => {
  const r = L.judge(target, page({ jsonLd: ld(product({ "@type": "Offer", price: 1980, availability: "https://schema.org/OutOfStock" })) }));
  assert.equal(r.verdict, "差異あり");
  assert.equal(r.stock_status, "在庫なし");
});

test("在庫だけ読めないときは、価格・リンク先の一致を残して要確認", () => {
  const r = L.judge(target, page({ jsonLd: ld(product({ "@type": "Offer", price: 1980 })) }));
  assert.equal(r.verdict, "要確認（在庫のみ取得不可）");
  assert.equal(r.fail, null);
  assert.equal(r.current_price_yen, 1980);
  assert.equal(r.price_match, "一致");
  assert.equal(r.link_match, "一致");
  assert.equal(r.stock_status, "未確認");
  // 在庫が読めなくても、価格が違えば差異ありが優先
  const r2 = L.judge(target, page({ jsonLd: ld(product({ "@type": "Offer", price: 2000 })) }));
  assert.equal(r2.verdict, "差異あり");
});

test("バリエーションで価格が違えば差異あり、選択肢と価格を返す", () => {
  const r = L.judge(target, page({ jsonLd: ld({
    "@context": "https://schema.org", "@type": "ProductGroup", name: "商品A",
    hasVariant: [
      { "@type": "Product", name: "S", offers: { "@type": "Offer", price: 1980, availability: "InStock" } },
      { "@type": "Product", name: "L", offers: { "@type": "Offer", price: 2480, availability: "OutOfStock" } },
    ],
  }) }));
  assert.equal(r.verdict, "差異あり");
  assert.deepEqual(r.variants, [{ name: "S", price: 1980, stock: "在庫あり" }, { name: "L", price: 2480, stock: "在庫なし" }]);
  assert.equal(r.stock_status, "在庫あり");
  assert.match(r.reasons.join(), /1980／2480円/);
  // 出力にはバリエーション全点の価格一覧を必ず付ける
  const row = L.toLogRow(target, { ...r, checkedAt: new Date() });
  assert.match(row.note, /バリエーション全2点：S 1980円（在庫あり）、L 2480円（在庫なし）/);
  const md = L.toMarkdown([{ target, result: { ...r, checkedAt: new Date() } }]);
  assert.match(md, /バリエーション全2点：S 1980円（在庫あり）、L 2480円（在庫なし）/);
});

test("価格差のないバリエーションも、全点の一覧を出す（判定は一致のまま）", () => {
  const r = L.judge(target, page({ jsonLd: ld({ "@type": "ProductGroup", hasVariant: [
    { name: "赤", offers: { price: 1980, availability: "InStock" } },
    { name: "青", offers: { price: 1980, availability: "InStock" } },
    { name: "緑", offers: { availability: "InStock" } },
  ] }) }));
  assert.equal(r.verdict, "一致");
  assert.equal(L.variantList(r), "バリエーション全3点：赤 1980円（在庫あり）、青 1980円（在庫あり）、緑 価格不明（在庫あり）");
});

test("AggregateOffer の価格幅は差異あり", () => {
  const r = L.judge(target, page({ jsonLd: ld(product({ "@type": "AggregateOffer", lowPrice: 1980, highPrice: 2980, availability: "InStock" })) }));
  assert.equal(r.verdict, "差異あり");
  assert.match(r.reasons.join(), /1980〜2980円/);
});

test("@graph の中の Product も読む。JSON-LD がなければ microdata", () => {
  const r1 = L.judge(target, page({ jsonLd: ld({ "@graph": [{ "@type": "WebPage" }, product({ "@type": "Offer", price: "1,980", availability: "InStock" })] }) }));
  assert.equal(r1.verdict, "一致");
  const r2 = L.judge(target, page({ jsonLd: ["{壊れたJSON"], microdata: { price: "1980", availability: "http://schema.org/InStock" } }));
  assert.equal(r2.verdict, "一致");
  assert.equal(r2.price_source, "microdata");
});

test("別の商品ページに着いたらリンク先不一致で差異あり", () => {
  const r = L.judge(target, page({ finalUrl: "https://item.rakuten.co.jp/shop-a/item-2/",
    jsonLd: ld(product({ "@type": "Offer", price: 1980, availability: "InStock" })) }));
  assert.equal(r.verdict, "差異あり");
  assert.match(r.reasons.join(), /リンク先不一致/);
});

test("アフィリエイトリンクは pc= の行き先で照合し、canonical でも一致を確かめる", () => {
  const afl = `https://hb.afl.rakuten.co.jp/hgc/abc/?pc=${encodeURIComponent(URL1)}`;
  assert.equal(L.itemIdentity(afl), "shop-a/item-1");
  const r = L.judge({ ...target, item_url: afl }, page({ finalUrl: "https://item.rakuten.co.jp/shop-a/item-1/?s-id=x",
    canonical: URL1, jsonLd: ld(product({ "@type": "Offer", price: 1980, availability: "InStock" })) }));
  assert.equal(r.verdict, "一致");
});

test("商品ページ以外（トップや検索）に飛ばされたらページ不存在", () => {
  const r = L.judge(target, page({ finalUrl: "https://www.rakuten.co.jp/", jsonLd: [] }));
  assert.equal(r.fail.code, "not_found");
});

test("取得不可の理由を分類する", () => {
  const cases = [
    [{ status: 200, title: "reCAPTCHA", bodyText: "" }, "bot_check"],
    [{ status: 200, title: "楽天", bodyText: "ロボットではありませんか？確認してください" }, "bot_check"],
    [{ status: 429, title: "", bodyText: "" }, "bot_check"],
    // 2026-11-10 に実際に楽天から返った制限画面の文言（HTTP 403）。200 で返っても止まること
    [{ status: 200, title: "アクセスが集中しております", bodyText: "アクセスが集中し、ページを閲覧しにくい状態になっております Reference #18.x" }, "bot_check"],
    [{ status: 403, title: "", bodyText: "" }, "bot_check"],
    [{ status: 404, title: "", bodyText: "" }, "not_found"],
    [{ status: 200, title: "ページが見つかりません", bodyText: "" }, "not_found"],
    [{ status: 503, title: "", bodyText: "" }, "load_failed"],
    [{ error: "page.goto: Timeout 30000ms exceeded." }, "load_failed"],
    [{ error: "page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://item.rakuten.co.jp/a/b/" }, "no_connection"],
    [{ error: "page.goto: net::ERR_NAME_NOT_RESOLVED at https://item.rakuten.co.jp/a/b/" }, "no_connection"],
    [{ status: 200, title: "商品A", bodyText: "", jsonLd: [] }, "no_price"],
  ];
  for (const [snap, code] of cases) {
    const r = L.judge(target, { finalUrl: URL1, ...snap });
    assert.equal(r.verdict, "取得不可", JSON.stringify(snap));
    assert.equal(r.fail.code, code, JSON.stringify(snap));
  }
  assert.equal(L.FAIL_REASON.BOT_CHECK.stop, true);
});

test("入力不備（URLか基準価格がない）は開かずに取得不可", () => {
  assert.equal(L.judge({ item_url: URL1, baseline_price_yen: "" }, {}).fail.code, "bad_input");
  assert.equal(L.judge({ item_url: "", baseline_price_yen: "100" }, {}).fail.code, "bad_input");
});

test("price_watch_log と同じ列で書き出し、引用符・改行を正しく扱う", () => {
  const rows = L.parseCsv('﻿post_id,item_name,item_url,baseline_price_yen\r\nR1,"毛布, ""厚手""",' + URL1 + ",1980\r\n");
  assert.equal(rows[0].item_name, '毛布, "厚手"');
  const r = { ...L.judge(rows[0], page({ jsonLd: ld(product({ price: 1980, availability: "InStock" })) })), checkedAt: new Date("2026-11-10T01:02:03Z") };
  const csv = L.toCsv([L.toLogRow(rows[0], r)]);
  assert.equal(csv.split("\n")[0], L.LOG_COLUMNS.join(","));
  const back = L.parseCsv(csv)[0];
  assert.equal(back.checked_date, "2026-11-10");
  assert.equal(back.checked_at_jst, "10:02:03");
  assert.equal(back.item_name, '毛布, "厚手"');
  assert.equal(back.status, "一致");
  assert.equal(back.source, "playwright:json-ld");
});
