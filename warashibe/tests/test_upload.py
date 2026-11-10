"""任務2のテスト。本番の保存先は使わず、ローカルHTTPサーバと模擬アップローダで再現する。"""
from __future__ import annotations

import datetime as dt
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from helpers import FakeUploader, FileServer, SimulatedCrash  # noqa: E402
import upload_urls as uu  # noqa: E402

FAST_CHECK = lambda u: uu.check_url(u, timeout=2, retries=2, wait=0)  # noqa: E731
QUIET = lambda s: None  # noqa: E731


def make_pngs(folder: Path, n: int):
    files = []
    for i in range(1, n + 1):
        p = folder / f"fig{i:02d}.png"
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + f"sample figure {i}".encode())  # サンプル（中身は仮）
        files.append(p)
    return files


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.issue = self.tmp / "handoff" / "2026-11-10_issue"
        self.issue.mkdir(parents=True)
        self.server = FileServer(self.tmp / "served")

    def tearDown(self):
        self.server.close()

    def records(self):
        return json.loads((self.issue / "urls.json").read_text(encoding="utf-8"))

    def kill_url(self, url):
        (self.server.root / url.rsplit("/", 1)[1]).unlink()


class TestResume(Base):
    def test_stop_and_resume_9_figures(self):
        """2026-11-10 の事故の再現：9点の途中で停止→再開。"""
        files = make_pngs(self.issue, 9)
        up1 = FakeUploader(self.server, crash_on_call=5)
        with self.assertRaises(SimulatedCrash):
            uu.sync(self.issue, files, up1, checker=FAST_CHECK, log=QUIET)
        rec = self.records()
        self.assertEqual(sorted(rec), [f"fig{i:02d}.png" for i in range(1, 5)])
        self.assertTrue(all(r["status"] == "ok" for r in rec.values()))
        before = {k: v["url"] for k, v in rec.items()}

        # 停止中に1点のURLが無効になった想定
        self.kill_url(before["fig02.png"])

        up2 = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up2, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(s.reused, ["fig01.png", "fig03.png", "fig04.png"])
        self.assertEqual(sorted(up2.calls), sorted(["fig02.png"] + [f"fig{i:02d}.png" for i in range(5, 10)]))
        self.assertEqual(s.failed, [])
        rec = self.records()
        for k in ("fig01.png", "fig03.png", "fig04.png"):
            self.assertEqual(rec[k]["url"], before[k], "記録済みURLが再利用されること")
        self.assertNotEqual(rec["fig02.png"]["url"], before["fig02.png"])
        self.assertEqual(len(rec), 9)
        self.assertTrue(all(r["status"] == "ok" for r in rec.values()))
        for r in rec.values():
            self.assertEqual(set(["url", "expires_at", "hash", "checked_at", "status"]) - set(r), set())

        # 3回目：全部生きていれば上げ直しゼロ
        up3 = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up3, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(up3.calls, [])
        self.assertEqual(len(s.reused), 9)

    def test_record_written_before_check(self):
        """URL取得の直後（確認より前）に urls.json へ書かれていること。"""
        files = make_pngs(self.issue, 1)
        seen = {}

        def checker(url):
            seen["rec"] = self.records()["fig01.png"]
            return FAST_CHECK(url)
        uu.sync(self.issue, files, FakeUploader(self.server), checker=checker, log=QUIET)
        self.assertEqual(seen["rec"]["status"], "uploaded")
        self.assertTrue(seen["rec"]["url"].startswith(self.server.base))

    def test_changed_figure_is_reuploaded(self):
        files = make_pngs(self.issue, 3)
        uu.sync(self.issue, files, FakeUploader(self.server), checker=FAST_CHECK, log=QUIET)
        files[1].write_bytes(b"\x89PNG\r\n\x1a\nredrawn")
        up = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(up.calls, ["fig02.png"])
        self.assertIn("ハッシュ", s.reasons["fig02.png"])

    def test_expired_is_reuploaded_even_if_200(self):
        files = make_pngs(self.issue, 2)
        uu.sync(self.issue, files, FakeUploader(self.server), checker=FAST_CHECK, log=QUIET)
        later = lambda: uu.utcnow() + dt.timedelta(hours=49)  # noqa: E731
        up = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up, checker=FAST_CHECK, now=later, log=QUIET)
        self.assertEqual(up.calls, ["fig01.png", "fig02.png"])
        self.assertIn("有効期限", s.reasons["fig01.png"])

    def test_min_remaining(self):
        files = make_pngs(self.issue, 1)
        uu.sync(self.issue, files, FakeUploader(self.server, ttl_hours=3), checker=FAST_CHECK, log=QUIET)
        up = FakeUploader(self.server)
        uu.sync(self.issue, files, up, checker=FAST_CHECK, min_remaining=dt.timedelta(hours=6), log=QUIET)
        self.assertEqual(up.calls, ["fig01.png"])


class TestFailures(Base):
    def test_retry_then_success(self):
        files = make_pngs(self.issue, 1)
        up = FakeUploader(self.server, fail_times={"fig01.png": 2})
        s = uu.sync(self.issue, files, up, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(len(up.calls), 3)
        self.assertEqual(s.uploaded, ["fig01.png"])

    def test_give_up_record_failed_and_continue(self):
        files = make_pngs(self.issue, 3)
        up = FakeUploader(self.server, fail_times={"fig02.png": 99})
        s = uu.sync(self.issue, files, up, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(up.calls.count("fig02.png"), 3)  # 初回＋再試行2回
        self.assertEqual(s.failed, ["fig02.png"])
        self.assertEqual(s.uploaded, ["fig01.png", "fig03.png"])
        rec = self.records()
        self.assertEqual(rec["fig02.png"]["status"], "failed")
        self.assertIn("アップロード失敗", rec["fig02.png"]["error"])
        # 再開時は failed だけ上げ直す
        up2 = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up2, checker=FAST_CHECK, log=QUIET)
        self.assertEqual(up2.calls, ["fig02.png"])

    def test_uploaded_but_not_200(self):
        files = make_pngs(self.issue, 1)
        bad = lambda u: uu.CheckResult(False, 404, "GET", u, "HTTP 404")  # noqa: E731
        up = FakeUploader(self.server)
        s = uu.sync(self.issue, files, up, checker=bad, log=QUIET)
        self.assertEqual(len(up.calls), 3)
        self.assertEqual(s.failed, ["fig01.png"])
        self.assertTrue(self.records()["fig01.png"]["url"])  # 最後のURLも残す

    def test_missing_file_continues(self):
        files = make_pngs(self.issue, 2)
        files.insert(1, self.issue / "nai.png")
        s = uu.sync(self.issue, files, FakeUploader(self.server), checker=FAST_CHECK, log=QUIET)
        self.assertEqual(s.failed, ["nai.png"])
        self.assertEqual(s.uploaded, ["fig01.png", "fig02.png"])

    def test_duplicate_names_rejected(self):
        a = self.issue / "a"; b = self.issue / "b"; a.mkdir(); b.mkdir()
        (a / "x.png").write_bytes(b"1"); (b / "x.png").write_bytes(b"2")
        with self.assertRaises(ValueError):
            uu.sync(self.issue, [a / "x.png", b / "x.png"], FakeUploader(self.server), log=QUIET)


class TestCheckUrl(Base):
    def setUp(self):
        super().setUp()
        (self.server.root / "a.png").write_bytes(b"x")

    def test_head_ok(self):
        r = uu.check_url(f"{self.server.base}/files/a.png", wait=0)
        self.assertTrue(r.ok); self.assertEqual(r.method, "HEAD")

    def test_head_405_falls_back_to_get(self):
        r = uu.check_url(f"{self.server.base}/nohead/a.png", wait=0)
        self.assertTrue(r.ok); self.assertEqual(r.method, "GET")

    def test_redirect_followed_as_head(self):
        r = uu.check_url(f"{self.server.base}/redirect/a.png", wait=0)
        self.assertTrue(r.ok); self.assertEqual(r.method, "HEAD")
        self.assertTrue(r.final_url.endswith("/files/a.png"))
        self.assertIn(("HEAD", "/files/a.png"), self.server.hits)

    def test_404_retries_twice(self):
        r = uu.check_url(f"{self.server.base}/files/none.png", wait=0)
        self.assertFalse(r.ok); self.assertEqual(r.status, 404)
        self.assertEqual(len([h for h in self.server.hits if h[1] == "/files/none.png"]), 6)  # 3回×(HEAD+GET)

    def test_timeout(self):
        t = time.time()
        r = uu.check_url(f"{self.server.base}/slow/a.png", timeout=0.3, retries=0, wait=0)
        self.assertFalse(r.ok); self.assertLess(time.time() - t, 3)


class TestParseOutput(unittest.TestCase):
    def test_formats(self):
        u = "https://muse.ai/files/abc123/fig01.png"
        cases = [
            json.dumps({"url": u, "expires_at": "2026-11-12T07:00:00Z"}),
            "uploading...\n" + json.dumps({"result": {"public_url": u, "expiresAt": "2026-11-12T07:00:00Z"}}),
            f"Uploaded fig01.png\nURL: {u}\nexpires_at: 2026-11-12T07:00:00Z\n",
            f"{u}\n",
        ]
        for c in cases:
            r = uu.parse_upload_output(c)
            self.assertEqual(r.url, u, c)
        self.assertEqual(uu.parse_upload_output(cases[2]).expires_at, "2026-11-12T07:00:00Z")
        with self.assertRaises(uu.UploadError):
            uu.parse_upload_output("error: quota exceeded")

    def test_command_uploader_missing_binary(self):
        up = uu.CommandUploader("/opt/hatch/bin/remote-storage upload-file --path {path}")
        with self.assertRaises(uu.UploadError):
            up.upload(Path(__file__))


class TestKillAndResumeCLI(Base):
    """本物のプロセスを SIGKILL で止めて再開（コマンド差し替え経由）。"""

    def run_cli(self, files, sleep, fmt="json"):
        cmd = (f"{sys.executable} {HERE / 'fake_upload_cmd.py'} {self.server.root} "
               f"{self.server.base} {{path}} --sleep {sleep} --format {fmt}")
        env = dict(os.environ, no_proxy="127.0.0.1,localhost", NO_PROXY="127.0.0.1,localhost")
        return subprocess.Popen(
            [sys.executable, str(HERE.parent / "upload_urls.py"), "--folder", str(self.issue),
             "--files", *map(str, files), "--upload-cmd", cmd, "--check-timeout", "2"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)

    def calls(self):
        return (self.server.root / "calls.log").read_text().split()

    def test_sigkill_then_resume(self):
        files = make_pngs(self.issue, 9)
        p = self.run_cli(files, sleep=0.3)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                n_ok = sum(r["status"] == "ok" for r in self.records().values())
            except (FileNotFoundError, ValueError):
                n_ok = 0
            if n_ok >= 3:
                break
            time.sleep(0.05)
        p.send_signal(signal.SIGKILL); p.wait()
        time.sleep(1.5)  # 親を殺しても実行中だった模擬アップロード（子）は最後まで走るので待つ
        rec1 = self.records()  # 強制停止後も JSON として読めること
        ok1 = {k: v["url"] for k, v in rec1.items() if v["status"] == "ok"}
        self.assertGreaterEqual(len(ok1), 3)
        self.assertLess(len(ok1), 9)
        self.assertTrue((self.issue / "urls.json.lock").exists())  # 死んだプロセスの錠が残る
        n_calls_1 = len(self.calls())

        p = self.run_cli(files, sleep=0, fmt="text")  # 出力形式が違っても動くこと
        out, err = p.communicate(timeout=60)
        self.assertEqual(p.returncode, 0, err)
        summary = json.loads(out)
        new_calls = self.calls()[n_calls_1:]
        self.assertEqual(sorted(summary["reused"]), sorted(ok1))
        self.assertEqual(set(new_calls) & set(ok1), set(), "記録済みは上げ直さない")
        self.assertEqual(sorted(new_calls), sorted(set(f.name for f in files) - set(ok1)))
        self.assertEqual(len(new_calls), len(set(new_calls)), "同じファイルを二重に上げない")
        rec2 = self.records()
        for k, u in ok1.items():
            self.assertEqual(rec2[k]["url"], u)
        self.assertEqual(len(rec2), 9)
        self.assertFalse((self.issue / "urls.json.lock").exists())
        self.__class__.report = {"killed_after_ok": len(ok1), "first_run_upload_calls": n_calls_1,
                                 "resume_upload_calls": len(new_calls), "reused": len(summary["reused"])}


if __name__ == "__main__":
    unittest.main(verbosity=2)
