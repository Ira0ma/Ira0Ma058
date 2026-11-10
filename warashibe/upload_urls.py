#!/usr/bin/env python3
"""朝刊わらしべ 図のアップロード＋URL記録（任務2）

図の PNG を1点ずつアップロードし、URL を取得したら即座に
<号のフォルダ>/urls.json へ記録する。直後に URL が開けるか（最終 HTTP 200）を確かめる。
再実行（再開）時は urls.json を読み、
  - 中身（ハッシュ）が同じ・期限内・今も 200 → URL を再利用（上げ直さない）
  - それ以外（無効・期限切れ・作り直し・未記録）→ そのファイルだけ上げ直す

  python upload_urls.py --folder handoff/2026-11-10_issue \
      --files handoff/2026-11-10_issue/fig01.png handoff/2026-11-10_issue/fig02.png

アップロード手段は --upload-cmd で差し替えられる（{path} がファイルパスに置き換わる）。
既定は編集長環境の /opt/hatch/bin/remote-storage upload-file --path {path}。
終了コード: 0=全点OK / 1=失敗あり（urls.json に status=failed で記録済み）/ 2=使い方の誤り
標準ライブラリだけで動く（Python 3.11〜3.13 で確認）。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

DEFAULT_UPLOAD_CMD = "/opt/hatch/bin/remote-storage upload-file --path {path}"
URLS_FILE = "urls.json"
LOCK_FILE = "urls.json.lock"

# status の意味
#   ok            : アップロード済みで、最後の確認で 200
#   uploaded      : URL を記録した直後（確認前に止まった）→ 再開時に確認して判断
#   check_failed  : アップロードできたが 200 にならなかった（再試行中の途中記録）
#   failed        : 再試行しても成功しなかった（報告対象）


def utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def iso(t: _dt.datetime) -> str:
    return t.astimezone(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(s: Optional[str]) -> Optional[_dt.datetime]:
    if not s:
        return None
    s = str(s).strip()
    if re.fullmatch(r"\d{9,11}(\.\d+)?", s):  # epoch 秒
        return _dt.datetime.fromtimestamp(float(s), _dt.timezone.utc)
    try:
        t = _dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=_dt.timezone.utc)


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


# ---- アップロード手段（差し替え可能） ----------------------------------------------
class UploadError(Exception):
    pass


@dataclass
class UploadResult:
    url: str
    expires_at: Optional[str] = None


_URL_RE = re.compile(r"https?://[^\s\"'<>,)\]}]+")
_EXP_RE = re.compile(r"expires?[_ -]?at\"?\s*[:=]\s*\"?([0-9T:\-+.Z ]{10,35})", re.I)


def parse_upload_output(text: str) -> UploadResult:
    """コマンドの出力から URL と有効期限を取り出す。

    出力の厳密な形は未確認（編集長回答 Q10）なので、JSON（1つ or 行ごと）と
    素のテキストの両方に対応する。URL が取れなければ UploadError（終了コードには依存しない）。
    """
    candidates: List[dict] = []
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            candidates.append(obj)
    except ValueError:
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        candidates.append(obj)
                except ValueError:
                    pass
    for obj in candidates:
        flat = dict(obj)
        for v in obj.values():
            if isinstance(v, dict):
                flat.update(v)
        url = next((flat[k] for k in ("url", "public_url", "publicUrl", "link", "href")
                    if isinstance(flat.get(k), str) and flat[k].startswith("http")), None)
        if url:
            exp = next((str(flat[k]) for k in ("expires_at", "expiresAt", "expires", "expiry")
                        if flat.get(k)), None)
            return UploadResult(url=url, expires_at=exp)
    m = _URL_RE.search(text)
    if not m:
        raise UploadError("出力に URL が見つかりません: " + text.strip()[:300])
    em = _EXP_RE.search(text)
    return UploadResult(url=m.group(0), expires_at=em.group(1).strip() if em else None)


class CommandUploader:
    """外部コマンドでアップロードする。cmd の {path} をファイルパスに置き換える。"""

    def __init__(self, cmd: str = DEFAULT_UPLOAD_CMD, timeout: float = 300):
        self.argv = shlex.split(cmd)
        if not any("{path}" in a for a in self.argv):
            self.argv.append("{path}")
        self.timeout = timeout

    def upload(self, path: Path) -> UploadResult:
        argv = [a.replace("{path}", str(path)) for a in self.argv]
        try:
            cp = subprocess.run(argv, capture_output=True, text=True, timeout=self.timeout)
        except FileNotFoundError as e:
            raise UploadError(f"アップロードコマンドが見つかりません: {argv[0]}") from e
        except subprocess.TimeoutExpired as e:
            raise UploadError(f"アップロードが {self.timeout} 秒で終わりませんでした") from e
        try:
            return parse_upload_output(cp.stdout)
        except UploadError as e:
            raise UploadError(f"{e}（終了コード {cp.returncode} / stderr: {cp.stderr.strip()[:200]}）")


# ---- URL の確認 --------------------------------------------------------------------
@dataclass
class CheckResult:
    ok: bool
    status: Optional[int] = None
    method: Optional[str] = None
    final_url: Optional[str] = None
    error: Optional[str] = None


class _KeepHeadRedirect(urllib.request.HTTPRedirectHandler):
    """urllib はリダイレクト時に HEAD を GET に変えてしまうので、HEAD のまま辿る。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and req.get_method() == "HEAD":
            new.method = "HEAD"
        return new


_opener = urllib.request.build_opener(_KeepHeadRedirect())


def _request(url: str, method: str, timeout: float) -> CheckResult:
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "warashibe-url-check/1"})
    try:
        with _opener.open(req, timeout=timeout) as r:
            if method == "GET":
                r.read(1)
            return CheckResult(r.status == 200, r.status, method, r.geturl())
    except urllib.error.HTTPError as e:
        return CheckResult(False, e.code, method, e.geturl(), f"HTTP {e.code}")
    except Exception as e:  # タイムアウト・接続失敗など
        return CheckResult(False, None, method, None, f"{type(e).__name__}: {e}")


def check_url(url: str, timeout: float = 10, retries: int = 2, wait: float = 1.0) -> CheckResult:
    """HEAD で確認し、失敗（200以外・例外・405）なら GET に切り替える。
    リダイレクトは辿り、最終が 200 なら合格。確認全体を最大 retries 回やり直す（Q14）。"""
    last = CheckResult(False, error="未確認")
    for attempt in range(retries + 1):
        if attempt and wait:
            time.sleep(wait)
        last = _request(url, "HEAD", timeout)
        if last.ok:
            return last
        last = _request(url, "GET", timeout)
        if last.ok:
            return last
    return last


# ---- 記録ファイル -----------------------------------------------------------------
def load_records(folder: Path) -> Dict[str, dict]:
    p = folder / URLS_FILE
    if not p.exists():
        return {}
    data = json.loads(p.read_text(encoding="utf-8"))  # 壊れていたら止める（推測で作り直さない）
    if not isinstance(data, dict):
        raise ValueError(f"{p} の形が想定外です")
    return data


def save_records(folder: Path, records: Dict[str, dict]) -> None:
    """一時ファイルに書いて fsync → 置き換え。途中で落ちても urls.json は壊れない。"""
    p = folder / URLS_FILE
    fd, tmp = tempfile.mkstemp(prefix=".urls.", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class Lock:
    """同じ号を2つのプロセスが同時に上げないための錠。持ち主が死んでいれば引き継ぐ。"""

    def __init__(self, folder: Path):
        self.path = folder / LOCK_FILE

    def __enter__(self):
        for _ in range(2):
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    pid = int(self.path.read_text().strip() or 0)
                except (OSError, ValueError):
                    pid = 0
                if pid and _alive(pid):
                    raise RuntimeError(f"別のプロセス（pid {pid}）がこの号を処理中です: {self.path}")
                self.path.unlink(missing_ok=True)  # 持ち主不在 → 引き継ぐ
        raise RuntimeError(f"錠を取れませんでした: {self.path}")

    def __exit__(self, *exc):
        self.path.unlink(missing_ok=True)


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


# ---- 本体 -------------------------------------------------------------------------
@dataclass
class Summary:
    reused: List[str] = field(default_factory=list)
    uploaded: List[str] = field(default_factory=list)
    failed: List[str] = field(default_factory=list)
    reasons: Dict[str, str] = field(default_factory=dict)  # 上げ直し・失敗の理由

    def as_dict(self) -> dict:
        return {"reused": self.reused, "uploaded": self.uploaded, "failed": self.failed,
                "reasons": self.reasons}


def _reuse_reason(rec: Optional[dict], h: str, now: _dt.datetime,
                  min_remaining: _dt.timedelta) -> Optional[str]:
    """再利用できない理由を返す（再利用候補なら None）。"""
    if not rec or not rec.get("url"):
        return "未記録"
    if rec.get("status") not in ("ok", "uploaded"):
        return f"前回 status={rec.get('status')}"
    if rec.get("hash") != h:
        return "図の中身が変わった（ハッシュ不一致）"
    exp = parse_time(rec.get("expires_at"))
    if exp is not None and exp - now <= min_remaining:
        return f"有効期限切れ／残りわずか（expires_at={rec.get('expires_at')}）"
    return None


def sync(folder: Path, files: Sequence[Path], uploader, *,
         checker: Callable[[str], CheckResult] = check_url,
         upload_retries: int = 2,
         min_remaining: _dt.timedelta = _dt.timedelta(0),
         now: Callable[[], _dt.datetime] = utcnow,
         log: Callable[[str], None] = lambda s: print(s, file=sys.stderr)) -> Summary:
    folder = Path(folder)
    names = [Path(f).name for f in files]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        raise ValueError(f"ファイル名が重複しています（urls.json のキーが衝突）: {sorted(dup)}")
    records = load_records(folder)
    summary = Summary()

    for f in map(Path, files):
        name = f.name
        if not f.is_file():
            records[name] = {**records.get(name, {}), "status": "failed",
                             "error": "ファイルがありません", "checked_at": iso(now())}
            save_records(folder, records)
            summary.failed.append(name)
            summary.reasons[name] = "ファイルがありません"
            log(f"[失敗] {name}: ファイルがありません")
            continue
        h = file_hash(f)
        rec = records.get(name)
        why = _reuse_reason(rec, h, now(), min_remaining)
        if why is None:
            res = checker(rec["url"])
            if res.ok:
                rec.update(status="ok", checked_at=iso(now()))
                rec.pop("error", None)
                save_records(folder, records)
                summary.reused.append(name)
                log(f"[再利用] {name}: {rec['url']}")
                continue
            why = f"記録済みURLが開けない（{res.error or res.status}）"
        summary.reasons[name] = why
        log(f"[上げ直し] {name}: {why}" if rec else f"[新規] {name}")

        last_err = ""
        for attempt in range(1, upload_retries + 2):
            try:
                r = uploader.upload(f)
            except UploadError as e:
                last_err = f"アップロード失敗: {e}"
                log(f"  試行{attempt}: {last_err}")
                continue
            # URL を取れたら確認より先に即記録（ここで落ちても URL は残る）
            rec = {"url": r.url, "expires_at": r.expires_at, "hash": h,
                   "uploaded_at": iso(now()), "checked_at": None, "status": "uploaded"}
            records[name] = rec
            save_records(folder, records)
            res = checker(r.url)
            rec["checked_at"] = iso(now())
            if res.ok:
                rec["status"] = "ok"
                save_records(folder, records)
                summary.uploaded.append(name)
                log(f"  試行{attempt}: OK {r.url}")
                break
            last_err = f"アップロード後のURLが開けない（{res.error or res.status}）"
            rec.update(status="check_failed", error=last_err)
            save_records(folder, records)
            log(f"  試行{attempt}: {last_err}")
        else:
            rec = records.get(name) if records.get(name, {}).get("hash") == h else {}
            records[name] = {"url": (rec or {}).get("url"), "expires_at": (rec or {}).get("expires_at"),
                             "hash": h, "checked_at": iso(now()), "status": "failed",
                             "error": last_err}
            save_records(folder, records)
            summary.failed.append(name)
            summary.reasons[name] = last_err
            log(f"[失敗] {name}: {last_err}（残りは続行）")
    return summary


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="図のアップロード＋URL記録（再開対応）")
    ap.add_argument("--folder", required=True, help="その号のフォルダ（urls.json をここに置く）")
    ap.add_argument("--files", required=True, nargs="+", help="アップロードする PNG（順に1点ずつ）")
    ap.add_argument("--upload-cmd", default=DEFAULT_UPLOAD_CMD,
                    help=f"アップロードコマンド。{{path}} がファイルに置き換わる（既定: {DEFAULT_UPLOAD_CMD}）")
    ap.add_argument("--upload-timeout", type=float, default=300)
    ap.add_argument("--upload-retries", type=int, default=2)
    ap.add_argument("--check-timeout", type=float, default=10)
    ap.add_argument("--check-retries", type=int, default=2)
    ap.add_argument("--min-remaining-hours", type=float, default=0,
                    help="有効期限の残りがこれ以下なら上げ直す（既定 0＝期限切れのみ）")
    a = ap.parse_args(argv)
    folder = Path(a.folder)
    if not folder.is_dir():
        print(f"フォルダがありません: {folder}", file=sys.stderr)
        return 2
    uploader = CommandUploader(a.upload_cmd, timeout=a.upload_timeout)
    checker = lambda u: check_url(u, timeout=a.check_timeout, retries=a.check_retries)
    with Lock(folder):
        s = sync(folder, [Path(f) for f in a.files], uploader, checker=checker,
                 upload_retries=a.upload_retries,
                 min_remaining=_dt.timedelta(hours=a.min_remaining_hours))
    print(json.dumps(s.as_dict(), ensure_ascii=False, indent=2))
    return 1 if s.failed else 0


if __name__ == "__main__":
    sys.exit(main())
