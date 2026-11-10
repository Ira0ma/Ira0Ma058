# 考察配信 入力JSON スキーマ案 v1（検収待ち）

編集長回答（2026-11-10）の前提2つに沿った案です。
- バブルは**順序つきの配列**で、各バブルに**種別（kind）**を持たせる
- テキストは**役割つきセグメントの配列**で渡す（heading / body / note / key）

サンプル：`samples/sample_input.json`（**サンプルです。実際の相場の数字は入っていません**）

## トップレベル

| 項目 | 型 | 必須 | 意味 |
|---|---|---|---|
| `schema_version` | 文字列 | 任意 | `"1"` |
| `issue_no` | 整数 | 必須 | 号数（altText に使う） |
| `date` | `YYYY-MM-DD` | 必須 | 配信日（altText に使う） |
| `bubbles` | 配列 | 必須 | バブルを並び順どおりに |
| `is_sample` / `_note` | 任意 | 任意 | サンプル表示用。生成には使わない |

altText は生成側が組み立てる：`朝刊わらしべ 第{issue_no}号 考察配信（{月}月{日}日）`

## バブル（`bubbles[]`）

| kind（英） | kind（和・どちらでも可） | 数 | 中身 |
|---|---|---|---|
| `menu` | おしながき | 1 | `blocks` |
| `summary_figure` | 図説 | 1 | `blocks`（image 1つ以上） |
| `review` | 総評 | 1 | `blocks`（前日総評＋答え合わせボード） |
| `seven` | セブン積み | 2 | `pairs`（1バブル 2〜3ペア） |
| `lesson` | 教室 | 1 | `blocks` |
| `chart_figure` | チャート図 | 0〜1 | `blocks`（image 1つ以上）。ない日は入れない |
| `edition` | 版 | 4 | `shift` ＋ `blocks` |

- 並び順は上の表のとおりに固定。違えば生成せずエラー（推測で並べ替えない）。
- `edition` の `shift` は `morning/day/night/full`（または `朝勤/日勤/夜勤/専業`）をこの順で。
- 全体で 10（チャート図なし）か 11。上限 12 は検査で確認。
- 任意で `"dense": true` を付けると、そのバブルの本文を md → sm にする（文字量の多いバブル用）。
- 免責文は入力JSONに入れない。生成時に別ファイルで渡し、最後のバブル（専業版）の末尾に自動で入る。

### 日足セブン（`kind: seven`）

```json
{"kind": "seven", "pairs": [
  {"pair": "gold",   "blocks": [ ...見出し・図・注釈... ]},
  {"pair": "usdjpy", "blocks": [ ... ]}
]}
```
- `pair` は `gold / usdjpy / silver / usoil / btc` の5つ。2バブルで過不足なく1回ずつ。
- 既定の積み方：A＝gold・usdjpy、B＝silver・usoil・btc（違う積み方は警告を出して生成）。
- 各ペアの blocks に図（image）が必須。ペアの間には区切り線が自動で入る。

## ブロック（`blocks[]`）

```json
{"type": "text", "segments": [
  {"role": "body", "text": "的中ラインは "},
  {"role": "key",  "text": "〇本中〇本"},
  {"role": "body", "text": "。"}
]}
{"type": "image", "url": "https://...png", "width": 1200, "height": 800}
{"type": "separator"}
```

- 1つの `text` ブロック＝1段落。段落の役割は heading / body / note のどれか1つ。
  `key`（重要な数字）は body と note の段落に混ぜられる（見出しには混ぜられない）。
  heading と body を同じ段落に混ぜたらエラー。
- 改行は `text` の中で `\n`。
- image の `width`/`height` は実寸（px）。`aspectRatio` は `width:height` になる。URL は https 必須。

## 生成される体裁（固定・入力では変えられない）

| 役割 | 色 | size | weight | lineSpacing |
|---|---|---|---|---|
| 見出し heading | #A8842C | lg | bold | 2px |
| 本文 body | #333333 | md（dense 時 sm） | regular | 6px |
| 注釈 note（免責文も） | #888888 | sm | regular | 5px |
| 重要数字 key | #111111 | 段落と同じ | bold | 段落と同じ |

- text はすべて `wrap: true`・`scaling: true`
- image はすべて `size: full`・`aspectMode: cover`・タップで同じURLを開く URI アクション
- バブルは `mega`。ボタンは使わない。
