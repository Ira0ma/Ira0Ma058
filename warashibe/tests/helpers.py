"""テスト用の部品：ローカルHTTPサーバと模擬アップローダ（本番の保存先には接続しない）。"""
from __future__ import annotations

import datetime as dt
import http.server
import os
import shutil
import threading
import time
import uuid
from pathlib import Path

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "127.0.0.1,localhost"


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _special(self):
        p = self.path
        self.server.hits.append((self.command, p))
        if p.startswith("/redirect/"):
            self.send_response(302)
            self.send_header("Location", "/files/" + p[len("/redirect/"):])
            self.end_headers()
            return True
        if p.startswith("/nohead/") and self.command == "HEAD":
            self.send_response(405)
            self.end_headers()
            return True
        if p.startswith("/slow/"):
            time.sleep(1.0)
        return False

    def translate_path(self, path):
        for pre in ("/nohead/", "/slow/"):
            if path.startswith(pre):
                path = "/files/" + path[len(pre):]
        if not path.startswith("/files/"):
            return "/nonexistent"
        return str(Path(self.server.root) / path[len("/files/"):].split("?")[0])

    def do_HEAD(self):
        if not self._special():
            super().do_HEAD()

    def do_GET(self):
        if not self._special():
            super().do_GET()


class FileServer:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.httpd.root = str(self.root)
        self.httpd.hits = []
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @property
    def hits(self):
        return self.httpd.hits

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def store(src: Path, served_root: Path, base: str) -> str:
    """模擬アップロード：配信ディレクトリへ一意名でコピーし URL を返す。"""
    name = f"{uuid.uuid4().hex[:12]}_{Path(src).name}"
    shutil.copyfile(src, Path(served_root) / name)
    return f"{base}/files/{name}"


class SimulatedCrash(BaseException):
    """プロセスが落ちたことの再現（Exception ではないので sync は捕まえない）。"""


class FakeUploader:
    def __init__(self, server: FileServer, crash_on_call=None, fail_times=None, ttl_hours=48):
        self.server = server
        self.calls = []
        self.crash_on_call = crash_on_call  # n 回目の呼び出しで落ちる
        self.fail_times = dict(fail_times or {})  # ファイル名 → 先に何回失敗するか
        self.ttl = dt.timedelta(hours=ttl_hours)

    def upload(self, path):
        from upload_urls import UploadError, UploadResult, iso, utcnow
        path = Path(path)
        self.calls.append(path.name)
        if self.crash_on_call and len(self.calls) == self.crash_on_call:
            raise SimulatedCrash(f"{len(self.calls)}回目のアップロード中に停止")
        if self.fail_times.get(path.name, 0) > 0:
            self.fail_times[path.name] -= 1
            raise UploadError("模擬：一時的なアップロード失敗")
        url = store(path, self.server.root, self.server.base)
        return UploadResult(url=url, expires_at=iso(utcnow() + self.ttl))
