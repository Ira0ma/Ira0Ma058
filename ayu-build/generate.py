#!/usr/bin/env python3
"""Regenerate ayu/index.html from ayu/index.src.html (build.py equivalent, Desk of Ayu head)."""
import hashlib, re
from pathlib import Path
REPO = Path.home() / "workspace/trade-desk-work/repo"
AYU = REPO / "ayu"
# ---------------------------------------------------------------- generate ayu/index.html (build.py equivalent)
def build_id(path):
    txt = path.read_text(encoding="utf-8")
    txt = re.sub(r'<meta name="build" content="[^"]*">\n', "", txt)
    return hashlib.sha1(txt.encode()).hexdigest()[:10]

gb, fb, bb, ob = (build_id(AYU / n) for n in ["gold.html", "usdjpy.html", "btc.html", "oil.html"])
frag = (AYU / "index.src.html").read_text(encoding="utf-8")
body = frag.split("\n", 2)[2]
body = body.replace('src: "gold.html"', f'src: "gold.html?v={gb}"').replace('src: "usdjpy.html"', f'src: "usdjpy.html?v={fb}"')
body = body.replace('src: "btc.html"', f'src: "btc.html?v={bb}"').replace('src: "oil.html"', f'src: "oil.html?v={ob}"')
build = hashlib.sha1((body + gb + fb + bb + ob).encode()).hexdigest()[:10]
head = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Desk of Ayu">
<meta name="theme-color" content="#06070b">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-ayu.png">
<link rel="icon" type="image/png" href="icon-ayu.png">
<meta name="build" content="{build}">
<title>Desk of Ayu</title>
<style>:root{--gutter:0px!important}</style>
"""
body = body.replace('</style>\n\n<canvas id="bg"', '</style>\n</head>\n<body>\n<canvas id="bg"', 1)
(AYU / "index.html").write_text(head.replace("{build}", build) + body + "\n</body>\n</html>\n", encoding="utf-8")


print("generated ayu/index.html, build", build)
