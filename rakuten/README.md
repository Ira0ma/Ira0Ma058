# 楽天ROOM・楽天アフィリエイト チーム

4人の担当（Claude Code のサブエージェント、定義は `.claude/agents/`）が、
**ファイルで成果物を引き継ぎながら** 投稿を作って改善していきます。

```
 調査担当 ──01_research.md──▶ 投稿案担当 ──02_drafts.md──▶ 点検担当
 rakuten-researcher          rakuten-writer              rakuten-checker
     ▲                            ▲   要修正・不採用          │
     │                            └──────03_review.md────────┤
     │                                                       │ 合格
 knowledge/learnings.md                                      ▼
     ▲                                                あなたが公開
     │                                                       │
 結果追跡担当 ◀──────────── 公開情報・数値 ──────────────────┘
 rakuten-tracker  ─▶ 04_results.md ＋ data/posts.csv
```

| 担当 | エージェント名 | 読むもの | 書くもの |
|---|---|---|---|
| 反応のよかった投稿を調べる | `rakuten-researcher` | `data/posts.csv`, `knowledge/learnings.md` | `01_research.md` |
| 投稿案を作る | `rakuten-writer` | `01_research.md`, `03_review.md`（修正時） | `02_drafts.md` |
| 数値や表現を点検する | `rakuten-checker` | `02_drafts.md`, 商品ページ | `03_review.md` |
| 公開後の結果を追う | `rakuten-tracker` | `03_review.md`, あなたが渡す数値 | `04_results.md`, `data/posts.csv`, `knowledge/learnings.md` |

## 使い方（Claude Code に話しかける例）

1. 「rakuten-researcher で、冬の暖房家電の投稿を作るための調査をして」
2. 「rakuten-writer で 2026-10-29_winter-heater の投稿案を作って」
3. 「rakuten-checker で点検して」→ 要修正なら「writer で直して」→ もう一度 checker
4. 合格した案を **あなたが** 楽天ROOM などに投稿（エージェントは投稿しません）
5. 「rakuten-tracker で記録して。post_id R0012、11/1 公開、クリック 40、成約 2、売上 180円」
   → 7日後・30日後にも同じように数字を渡す
6. 次のテーマでは調査担当が `knowledge/learnings.md` を読んで、前回の学びを反映します

「全部まとめてやって」と頼めば 1→2→3（修正ループ込み）まで順番に回します。

## 引き継ぎのルール

- 1テーマ＝1フォルダ：`handoff/<YYYY-MM-DD_slug>/` に `01`〜`04` のファイルが並ぶ
- 各ファイル先頭の `status` が `完了` になるまで、次の担当は作業しない
- `next` に次の担当が書いてある
- 書式は `templates/` のひな形に合わせる
- 前の担当のファイルは書き換えない（修正が必要なら差し戻す）
- 数字は `tools/summarize.py` で出す。手で書かない、推測で埋めない

## データ（`data/posts.csv`）

| 列 | 内容 |
|---|---|
| post_id | ROOMの投稿IDなど、投稿を区別できるもの |
| posted_at / measured_at | 公開日 / 計測日（YYYY-MM-DD） |
| channel | 楽天ROOM / ブログ / X / Instagram |
| item_name, item_url, genre | 商品名・楽天市場URL・ジャンル |
| hook_type | 冒頭の型（失敗談 / 比較 / 数字 / 問いかけ …） |
| price_band | 価格帯（〜1000円 / 〜3000円 / 〜10000円 / 10000円〜） |
| clicks, orders, revenue_yen | クリック・成約件数・報酬（円） |
| likes, collects | いいね・コレ!（ROOMのみ） |
| handoff_id | どのテーマのフォルダから生まれた投稿か |

同じ投稿を複数回計測したら、1時点1行で追記します（集計は自動で最新時点を使います）。
過去の投稿がある場合は、楽天アフィリエイトの成果レポートから数字を入れておくと調査担当が分析できます。

## 公開前チェック（点検担当が見ること）

- [ ] 広告表記（`#PR` など）がある
- [ ] 価格・ポイント倍率・クーポンに「◯月◯日時点」や期限がある
- [ ] スペックなどの事実に出典（商品ページURL）がある
- [ ] 最安・No.1・絶対 など根拠のない表現がない（`knowledge/ng-expressions.md`）
- [ ] 健康食品・化粧品で効能効果を書いていない
- [ ] 使っていない商品を「使ってみた」と書いていない
