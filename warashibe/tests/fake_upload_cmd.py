#!/usr/bin/env python3
"""模擬アップロードコマンド（remote-storage の代わり）。
  fake_upload_cmd.py <配信dir> <base_url> <ファイル> [--sleep 秒] [--format json|text]
呼ばれるたびに <配信dir>/calls.log に1行追記する（テストで回数を数えるため）。"""
import datetime as dt, json, shutil, sys, time, uuid
from pathlib import Path
root, base, src = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
args = sys.argv[4:]
sleep = float(args[args.index("--sleep") + 1]) if "--sleep" in args else 0
fmt = args[args.index("--format") + 1] if "--format" in args else "json"
with open(root / "calls.log", "a") as f:
    f.write(src.name + "\n")
time.sleep(sleep)
name = f"{uuid.uuid4().hex[:12]}_{src.name}"
shutil.copyfile(src, root / name)
url = f"{base}/files/{name}"
exp = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
if fmt == "json":
    print(json.dumps({"url": url, "expires_at": exp}))
else:
    print(f"Uploaded {src.name}\nURL: {url}\nexpires_at: {exp}")
