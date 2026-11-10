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

アップロード手段の選び方（`--method`）：

**github（GitHub Pages）**
```bash
python upload_urls.py --method github \
  --gh-repo-dir ~/warashibe-figures --gh-date 2026-11-10 \
  --folder handoff/2026-11-10_issue --files handoff/2026-11-10_issue/*.png
```
- クローン済みの warashibe-figures の `<号の日付>/<ファイル名>` に置き、**その1ファイルだけ**をコミットしてプッシュ。
  URL は `https://ira0ma.github.io/warashibe-figures/<日付>/<ファイル名>`（日本語・空白はURLエンコード）。
- プッシュ直後は開けないので、反映を待ちながら確認する（既定：10秒おき・最大180秒。`--gh-interval` `--gh-max-wait`）。
  この確認は GET で中身を読み、**ハッシュが一致するまで**待つ（作り直した図は同じURLなので、古い中身の200では合格にしない）。
- 有効期限なし：`expires_at` は `"none"`。
- 同じ中身がすでにコミット済みなら、コミットは作らずプッシュだけ（コミット後・プッシュ前に止まった分も再開時に送られる）。
- プッシュに失敗したら、今回のコミットだけを取り消して再試行（2回まで）。だめなら failed で記録し、残りは続行。
- プッシュ先は `--gh-remote`（既定 origin）と `--gh-branch`（既定は今のブランチ）。認証はクローン側の設定をそのまま使う。

**command（外部コマンド・既定）**
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
    "uploader": "command",
    "uploaded_at": "2026-11-10T05:12:02Z"
  }
}
```
github 方式では `url` が `https://ira0ma.github.io/warashibe-figures/...`、`expires_at` が `"none"`、`uploader` が `"github_pages"` になる。
`uploader`（置き場所）が前回と違う図は、ハッシュが同じでも上げ直す（48時間で切れる置き場から GitHub へ移すときのため）。

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
- 外部ネットワークは使いません。本物の GitHub にも接続しません（`test_github.py` はローカルの bare リポジトリと、
  プッシュから一定時間後に公開する模擬 Pages サーバで反映待ちを再現します）。
- `test_github.py` には `git` コマンドが必要です（2.43 で確認）。テスト用リポジトリは一時フォルダに作り、
  そのリポジトリだけで `commit.gpgsign=false` と仮の作者名を設定します（利用者の git 設定は変えません）。
- 所要時間の目安：全64件で約40秒（反映待ちの再現を含むため）。
