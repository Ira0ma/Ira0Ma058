"""Builds ipad.html (full-screen page for iPad home screen) from index.html."""
import hashlib
from pathlib import Path

here = Path(__file__).parent
body = here.joinpath("index.html").read_text(encoding="utf-8").split("\n", 2)[2]  # drop <title> and claude meta
build = hashlib.sha1(body.encode()).hexdigest()[:10]
head = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Trade Desk">
<meta name="theme-color" content="#06070b">
<link rel="apple-touch-icon" href="icon-cup.png">
<link rel="icon" type="image/png" href="icon-cup.png">
<meta name="build" content="{build}">
<title>Trade Desk Home</title>
<style>:root{--gutter:0px!important}</style>
"""
body = body.replace('</style>\n\n<canvas id="bg"', '</style>\n</head>\n<body>\n<canvas id="bg"', 1)
here.joinpath("ipad.html").write_text(head.replace("{build}", build) + body + "\n</body>\n</html>\n", encoding="utf-8")
