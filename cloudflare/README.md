# トレードデスク用 価格中継（Cloudflare Workers）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Ira0ma/Ira0Ma058/tree/claude/amazon-affiliate-articles/cloudflare)

Swissquote の公開レートを取りに行き、ダッシュボードが読める形（CORS 付き JSON）で返します。

- `https://（アドレス）/?s=usdjpy` … ドル円
- `https://（アドレス）/?s=gold` … ゴールド（XAU/USD）
- `https://（アドレス）/?s=silver` … シルバー（XAG/USD）

返す値：`{"symbol":"usdjpy","bid":158.164,"ask":158.173,"ts":...}`（各プラットフォームの中央値）
