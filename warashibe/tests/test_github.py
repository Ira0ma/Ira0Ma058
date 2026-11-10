"""GitHub Pages 方式のテスト（模擬）。

本物の GitHub には接続しない。ローカルの bare リポジトリをリモート役にし、
「プッシュから delay 秒たったら公開する」模擬 Pages サーバで反映待ちを再現する。
環境前提：git コマンドがあること（2.43 で確認）。Linux / macOS。外部ネットワークは使わない。
"""
from __future__ import annotations

import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from helpers import FakeUploader, FileServer, SimulatedCrash  # noqa: E402  (no_proxy も設定される)
import upload_urls as uu  # noqa: E402

DATE = "2026-11-10"
QUIET = lambda s: None  # noqa: E731


def git(cwd, *args):
    cp = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    return cp.stdout.strip()


class PagesSim:
    """模擬 GitHub Pages：/warashibe-figures/<rel> を、delay 秒より前に届いたプッシュの中身で返す。"""

    def __init__(self, bare: Path, deploy_log: Path, delay: float):
        self.bare, self.log, self.delay = bare, deploy_log, delay
        sim = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _body(self):
                p = urllib.parse.unquote(self.path.split("?")[0])
                pre = "/warashibe-figures/"
                if not p.startswith(pre):
                    return None
                return sim.content(p[len(pre):])

            def _send(self, head):
                b = self._body()
                if b is None:
                    self.send_response(404); self.end_headers(); return
                self.send_response(200)
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                if not head:
                    self.wfile.write(b)

            def do_HEAD(self):
                self._send(True)

            def do_GET(self):
                self._send(False)

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}/warashibe-figures"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def content(self, rel):
        if not self.log.exists():
            return None
        live = None
        for line in self.log.read_text().splitlines():
            t, rev = line.split()
            if float(t) <= time.time() - self.delay:
                live = rev
        if not live:
            return None
        cp = subprocess.run(["git", "--git-dir", str(self.bare), "show", f"{live}:{rel}"],
                            capture_output=True)
        return cp.stdout if cp.returncode == 0 else None

    def close(self):
        self.httpd.shutdown(); self.httpd.server_close()


class Base(unittest.TestCase):
    delay = 0.6

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.bare = self.tmp / "warashibe-figures.git"
        git(self.tmp, "init", "-q", "--bare", "-b", "main", str(self.bare))
        hooks = self.bare / "hooks"
        self.deploy_log = self.tmp / "deploy.log"
        (hooks / "post-receive").write_text(
            f'#!/bin/sh\nwhile read old new ref; do echo "$(date +%s.%N) $new" >> {self.deploy_log}; done\n')
        # pre-receive：reject_count が正なら1減らして拒否／reject_names に含む名前の図を拒否
        (hooks / "pre-receive").write_text(f'''#!/bin/sh
C={self.tmp}/reject_count
if [ -f "$C" ] && [ "$(cat $C)" -gt 0 ]; then echo $(( $(cat $C) - 1 )) > "$C"; echo "模擬：拒否" >&2; exit 1; fi
while read old new ref; do
  if [ -f {self.tmp}/reject_names ]; then
    git diff --name-only "$old" "$new" 2>/dev/null | grep -q -f {self.tmp}/reject_names && {{ echo "模擬：拒否(名前)" >&2; exit 1; }}
  fi
done
exit 0
''')
        for h in ("post-receive", "pre-receive"):
            (hooks / h).chmod(0o755)
        self.clone = self.tmp / "clone"
        git(self.tmp, "clone", "-q", str(self.bare), str(self.clone))
        for k, v in (("user.name", "test"), ("user.email", "test@example.invalid"),
                     ("commit.gpgsign", "false")):
            git(self.clone, "config", k, v)
        (self.clone / "README.md").write_text("figures\n")
        git(self.clone, "add", "README.md"); git(self.clone, "commit", "-qm", "init")
        git(self.clone, "push", "-q", "origin", "HEAD:refs/heads/main")
        self.pages = PagesSim(self.bare, self.deploy_log, self.delay)
        self.issue = self.tmp / "handoff" / f"{DATE}_issue"
        self.issue.mkdir(parents=True)

    def tearDown(self):
        self.pages.close()

    def uploader(self, **kw):
        kw.setdefault("max_wait", 5)
        kw.setdefault("interval", 0.1)
        kw.setdefault("check_timeout", 2)
        return uu.GitHubPagesUploader(self.clone, DATE, base_url=self.pages.base, **kw)

    def pngs(self, n, prefix="fig"):
        out = []
        for i in range(1, n + 1):
            p = self.issue / f"{prefix}{i:02d}.png"
            p.write_bytes(b"\x89PNG\r\n\x1a\n" + f"sample {prefix} {i}".encode())  # サンプル（中身は仮）
            out.append(p)
        return out

    def records(self):
        return json.loads((self.issue / "urls.json").read_text(encoding="utf-8"))

    def remote_files(self):
        return set(git(self.tmp, "--git-dir", str(self.bare), "ls-tree", "-r", "--name-only", "main").split())

    def remote_bytes(self, rel):
        return subprocess.run(["git", "--git-dir", str(self.bare), "show", f"main:{rel}"],
                              capture_output=True).stdout

    def n_commits(self):
        return int(git(self.tmp, "--git-dir", str(self.bare), "rev-list", "--count", "main"))

    def check(self, u):
        return uu.check_url(u, timeout=2, retries=0, wait=0)


class TestGitHubBasic(Base):
    def test_upload_record_and_wait(self):
        files = self.pngs(2)
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig01.png", "fig02.png"])
        rec = self.records()
        for f in files:
            r = rec[f.name]
            self.assertEqual(r["url"], f"{self.pages.base}/{DATE}/{f.name}")
            self.assertEqual(r["expires_at"], "none")
            self.assertEqual(r["uploader"], "github_pages")
            self.assertEqual(r["status"], "ok")
            self.assertEqual(self.remote_bytes(f"{DATE}/{f.name}"), f.read_bytes())  # バイト一致
        self.assertEqual(self.n_commits(), 1 + 2)  # init ＋ 1点1コミット
        self.assertEqual(git(self.clone, "status", "--porcelain"), "")

    def test_waits_for_deploy(self):
        """プッシュ直後は404 → 反映を待って合格（確認が複数回になる）。"""
        f = self.pngs(1)[0]
        up = self.uploader()
        r = up.upload(f)
        t = time.monotonic()
        res = up.post_upload_check(r.url, uu.file_hash(f))
        self.assertTrue(res.ok, res.error)
        self.assertGreater(res.attempts, 1)
        self.assertGreaterEqual(time.monotonic() - t, self.delay - 0.2)

    def test_gives_up_after_max_wait_then_resume(self):
        self.pages.delay = 999  # いつまでも反映されない
        files = self.pngs(1)
        up = self.uploader(max_wait=0.5, interval=0.1)
        s = uu.sync(self.issue, files, up, checker=self.check, log=QUIET)
        self.assertEqual(s.failed, ["fig01.png"])
        r = self.records()["fig01.png"]
        self.assertEqual(r["status"], "failed")
        self.assertIn("待っても開けず", r["error"])
        self.assertEqual(self.n_commits(), 1 + 1)  # 再試行で余計なコミットは増えない
        # 反映された後に再開 → 同じパスのまま合格（新しいコミットなし）
        self.pages.delay = 0
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig01.png"])
        self.assertEqual(self.n_commits(), 1 + 1)

    def test_url_is_quoted(self):
        f = self.issue / "図 1.png"
        f.write_bytes(b"\x89PNG\r\n\x1a\nsample")
        s = uu.sync(self.issue, [f], self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["図 1.png"])
        self.assertTrue(self.records()["図 1.png"]["url"].endswith("/%E5%9B%B3%201.png"))

    def test_bad_settings(self):
        with self.assertRaises(ValueError):
            uu.GitHubPagesUploader(self.clone, "2026/11/10")
        with self.assertRaises(ValueError):
            uu.GitHubPagesUploader(self.tmp, DATE)  # git のクローンではない


class TestGitHubResume(Base):
    def test_stop_and_resume_9_figures(self):
        files = self.pngs(9)
        real = self.uploader()

        class Crashing:
            name = real.name
            post_upload_check = staticmethod(real.post_upload_check)
            calls = []

            def upload(self, p):
                self.calls.append(p.name)
                if len(self.calls) == 5:
                    raise SimulatedCrash("5点目で停止")
                return real.upload(p)

        with self.assertRaises(SimulatedCrash):
            uu.sync(self.issue, files, Crashing(), checker=self.check, log=QUIET)
        before = {k: v["url"] for k, v in self.records().items()}
        self.assertEqual(sorted(before), [f"fig{i:02d}.png" for i in range(1, 5)])

        # 停止中に fig02 がリポジトリから消された想定 → 404 になる
        git(self.clone, "rm", "-q", f"{DATE}/fig02.png")
        git(self.clone, "commit", "-qm", "fig02 を消す")
        git(self.clone, "push", "-q", "origin", "HEAD:refs/heads/main")
        time.sleep(self.delay + 0.2)
        commits_before = self.n_commits()

        calls = []
        up2 = self.uploader()
        orig = up2.upload
        up2.upload = lambda p: (calls.append(p.name), orig(p))[1]
        s = uu.sync(self.issue, files, up2, checker=self.check, log=QUIET)
        self.assertEqual(s.reused, ["fig01.png", "fig03.png", "fig04.png"])
        self.assertEqual(sorted(calls), sorted(["fig02.png"] + [f"fig{i:02d}.png" for i in range(5, 10)]))
        self.assertEqual(s.failed, [])
        self.assertEqual(self.n_commits(), commits_before + 6)
        rec = self.records()
        for k in ("fig01.png", "fig03.png", "fig04.png"):
            self.assertEqual(rec[k]["url"], before[k])
        self.assertEqual({f"{DATE}/{f.name}" for f in files} | {"README.md"}, self.remote_files())
        for f in files:
            self.assertEqual(self.remote_bytes(f"{DATE}/{f.name}"), f.read_bytes())

    def test_redrawn_figure_waits_for_new_content(self):
        """作り直した図は同じURLなので、200 だけでなく中身の一致まで待つ。"""
        files = self.pngs(2)
        uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        time.sleep(self.delay + 0.1)
        files[0].write_bytes(b"\x89PNG\r\n\x1a\nredrawn sample")
        up = self.uploader()
        r = up.upload(files[0])
        res = up.post_upload_check(r.url, uu.file_hash(files[0]))
        self.assertTrue(res.ok)
        self.assertGreater(res.attempts, 1, "古い中身の 200 を合格にしないこと")
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.reused, ["fig02.png"])  # fig01 は記録のハッシュが古いので上げ直し扱い
        self.assertEqual(self.remote_bytes(f"{DATE}/fig01.png"), files[0].read_bytes())

    def test_unpushed_commit_is_pushed_on_resume(self):
        """コミット後・プッシュ前に止まった図は、再開時にプッシュだけ行う。"""
        f = self.pngs(1)[0]
        (self.clone / DATE).mkdir()
        (self.clone / DATE / f.name).write_bytes(f.read_bytes())
        git(self.clone, "add", "."); git(self.clone, "commit", "-qm", "途中で止まった")
        s = uu.sync(self.issue, [f], self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig01.png"])
        self.assertEqual(self.n_commits(), 1 + 1)
        self.assertEqual(self.remote_bytes(f"{DATE}/fig01.png"), f.read_bytes())

    def test_switch_from_other_uploader(self):
        """前回が別の置き場（48時間で切れる方式など）なら、ハッシュが同じでも上げ直す。"""
        files = self.pngs(2)
        fs = FileServer(self.tmp / "served")
        try:
            uu.sync(self.issue, files, FakeUploader(fs), checker=self.check, log=QUIET)
        finally:
            fs.close()
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig01.png", "fig02.png"])
        self.assertIn("置き場所が違う", s.reasons["fig01.png"])
        self.assertTrue(all(r["uploader"] == "github_pages" for r in self.records().values()))


class TestGitHubFailures(Base):
    def test_push_rejected_then_ok(self):
        (self.tmp / "reject_count").write_text("2")
        f = self.pngs(1)
        s = uu.sync(self.issue, f, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig01.png"])
        self.assertEqual(self.n_commits(), 1 + 1)

    def test_push_rejected_give_up_and_continue(self):
        (self.tmp / "reject_names").write_text("fig02\n")
        files = self.pngs(3)
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.failed, ["fig02.png"])
        self.assertEqual(s.uploaded, ["fig01.png", "fig03.png"], "失敗した図のコミットが後続を巻き込まない")
        r = self.records()["fig02.png"]
        self.assertEqual(r["status"], "failed")
        self.assertIn("git push に失敗", r["error"])
        self.assertEqual(self.remote_files(), {"README.md", f"{DATE}/fig01.png", f"{DATE}/fig03.png"})
        self.assertEqual(git(self.clone, "rev-parse", "HEAD"), git(self.clone, "rev-parse", "origin/main"))
        # 拒否が解けたら、再開で fig02 だけ上げる
        (self.tmp / "reject_names").unlink()
        s = uu.sync(self.issue, files, self.uploader(), checker=self.check, log=QUIET)
        self.assertEqual(s.uploaded, ["fig02.png"])
        self.assertEqual(s.reused, ["fig01.png", "fig03.png"])


class TestGitHubCLI(Base):
    def run_cli(self, *extra):
        env = dict(os.environ, no_proxy="127.0.0.1,localhost", NO_PROXY="127.0.0.1,localhost")
        return subprocess.run(
            [sys.executable, str(HERE.parent / "upload_urls.py"), "--folder", str(self.issue), *extra],
            capture_output=True, text=True, env=env, timeout=60)

    def test_cli_github(self):
        files = self.pngs(3)
        cp = self.run_cli("--files", *map(str, files), "--method", "github",
                          "--gh-repo-dir", str(self.clone), "--gh-date", DATE,
                          "--gh-base-url", self.pages.base, "--gh-max-wait", "5", "--gh-interval", "0.1")
        self.assertEqual(cp.returncode, 0, cp.stderr)
        self.assertEqual(json.loads(cp.stdout)["uploaded"], [f.name for f in files])
        self.assertTrue(all(r["expires_at"] == "none" for r in self.records().values()))

    def test_cli_github_requires_settings(self):
        f = self.pngs(1)
        self.assertEqual(self.run_cli("--files", str(f[0]), "--method", "github").returncode, 2)
        cp = self.run_cli("--files", str(f[0]), "--method", "github",
                          "--gh-repo-dir", str(self.clone), "--gh-date", "11/10")
        self.assertEqual(cp.returncode, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
