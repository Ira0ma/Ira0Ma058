# 朝刊わらしべ 基盤・自動化ツール

基盤・自動化担当（Claude Code）が作成。**編集長の検収前の版**です。
標準ライブラリだけで動きます（追加インストール不要）。動作確認は Python 3.11・3.12・3.13 で行いました（3.10 以下は未確認）。

| ファイル | 役割 |
|---|---|
| `flex_builder.py` | 任務1：コンテンツJSON＋免責文 → 考察配信の Flex message を生成 |
| `flex_lint.py` | 任務1：Flex 体裁チェッカー（単独で動く。手組み Flex の点検にも使える） |
| `schema.md` | 任務1：入力JSONスキーマ案（検収待ち） |
| `samples/` | サンプル入力・仮の免責文・生成結果（**すべてサンプル。実数字なし**） |
| `upload_urls.py` | 任務2：図のアップロード＋urls.json 記録（再開対応） |
| `tests/` | テスト一式 |

## 任務1：Flex 生成

```bash
python flex_builder.py 当日.json --disclaimer 免責文.txt -o flex.json
```
- 入力の並び・種別・役割が規約と違うと、生成せずに理由を表示（終了コード 2）。
- 生成後に必ず `flex_lint` の検査を通す。違反があれば出力しない（終了コード 1）。
- 出力は Messaging API の `messages` 配列にそのまま入れられる message オブジェクト。

## 任務1：体裁チェッカー（単独）

```bash
python flex_lint.py flex.json --disclaimer 免責文.txt        # 人が読む形
python flex_lint.py flex.json --disclaimer 免責文.txt --json # 機械で読む形
```
message オブジェクト（type: flex）でも、carousel / bubble だけでも読めます。
検査項目 C1〜C9 は `flex_lint.py` の先頭に一覧があります。

## 任務2：アップロード＋URL記録

```bash
python upload_urls.py --folder handoff/2026-11-10_issue \
  --files handoff/2026-11-10_issue/fig01.png handoff/2026-11-10_issue/fig02.png ...
```
- 1点ずつ上げ、URL を取ったら**確認より先に** `urls.json` へ記録（途中で落ちても記録は残る）。
- 直後に HEAD → （失敗/405なら）GET で確認。リダイレクトは辿り、最終 200 で合格。
  タイムアウト 10 秒、確認の再試行 2 回。
- アップロードの再試行は 2 回。だめなら `status: failed` で記録し、**残りは続ける**。
- 再開は同じコマンドをもう一度実行するだけ。中身が同じ・期限内・今も 200 の図は再利用し、
  それ以外だけ上げ直す。
- 同じ号を2つ同時に動かさないよう錠（`urls.json.lock`）を使う。前のプロセスが死んでいれば自動で引き継ぐ。
- 終了コード：0＝全点OK、1＝失敗あり、2＝使い方の誤り。標準出力に再利用・新規・失敗の一覧（JSON）。

アップロード手段の差し替え：
```bash
--upload-cmd "/opt/hatch/bin/remote-storage upload-file --path {path}"   # 既定（編集長環境）
--upload-cmd "別のコマンド {path}"                                        # 差し替え例
```
コマンドの出力から URL と expires_at を取り出します（JSON でも素のテキストでも可）。
URL が取れなければ失敗扱い（終了コードには依存しない）。Python から使う場合は
`upload(path) -> UploadResult(url, expires_at)` を持つ任意のオブジェクトを `sync()` に渡せます。

### urls.json の形
```json
{
  "fig01.png": {
    "url": "https://muse.ai/files/...",
    "expires_at": "2026-11-12T07:00:00Z",
    "hash": "sha256:...",
    "checked_at": "2026-11-10T05:12:03Z",
    "status": "ok",
    "uploaded_at": "2026-11-10T05:12:02Z"
  }
}
```
status：`ok`（確認済み）／`uploaded`（記録直後・未確認）／`check_failed`（上げたが開けず・再試行中）／`failed`（あきらめた。`error` に理由）

## テスト

```bash
cd warashibe && python -m unittest discover -s tests -v
```
本番の保存先・LINE には一切接続しません（ローカルHTTPサーバと模擬アップローダを使用）。

### テストの環境前提
- 本番の `/opt/hatch/bin/remote-storage` は**一度も呼びません**。コマンドがある環境（本番に近い環境）でも、
  実ファイルはアップロードされません（存在しないコマンドの確認には一時フォルダ内の架空のパスを使います）。
  テスト `test_tests_never_call_production_command` が、テストのコードに本番コマンドが入っていないことを毎回確認します。
- `127.0.0.1` に一時的なHTTPサーバを立てます（空いているポートを自動で使用）。
- `TestKillAndResumeCLI` は SIGKILL を使うため、Linux / macOS が前提です（Windows では未確認）。
- 外部ネットワークは使いません。
