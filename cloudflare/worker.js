// トレードデスク用 価格中継（Cloudflare Workers に貼り付けて使います）
// Swissquote の公開レートを取りに行き、ダッシュボードが読める形で返します。
// 例: https://（あなたのアドレス）/?s=usdjpy  → {"bid":158.164,"ask":158.173,...}
const SYMBOLS = { usdjpy: "USD/JPY", gold: "XAU/USD", silver: "XAG/USD" };

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };
    const key = new URL(request.url).searchParams.get("s") || "usdjpy";
    const sym = SYMBOLS[key];
    if (!sym) return new Response(JSON.stringify({ error: "unknown symbol" }), { status: 400, headers: cors });
    try {
      const r = await fetch(
        "https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/" + sym,
        { cf: { cacheTtl: 2, cacheEverything: true } }  // 2秒以内の同じ問い合わせはまとめる
      );
      const feed = await r.json();
      const quotes = feed
        .map((q) => ({ p: (q.spreadProfilePrices || [])[0], ts: q.ts }))
        .filter((q) => q.p && q.p.bid && q.p.ask);
      if (!quotes.length) throw new Error("no prices");
      const mid = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
      const body = {
        symbol: key,
        bid: mid(quotes.map((q) => q.p.bid)),
        ask: mid(quotes.map((q) => q.p.ask)),
        ts: Math.max(...quotes.map((q) => q.ts || 0)) || Date.now(),
      };
      return new Response(JSON.stringify(body), { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors });
    }
  },
};
