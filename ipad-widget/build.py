"""Builds ipad.html (full-screen page for iPad home screen) from index.html,
and stamps gold.html with a build id so open copies can tell when a newer one is published."""
import hashlib
import re
from pathlib import Path

here = Path(__file__).parent

# gold.html: build id = hash of the page without its own build meta (so re-running is a no-op)
gold_path = here.joinpath("gold.html")
gold = re.sub(r'<meta name="build" content="[^"]*">\n', "", gold_path.read_text(encoding="utf-8"))
gold_build = hashlib.sha1(gold.encode()).hexdigest()[:10]
gold = gold.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta name="build" content="%s">\n' % gold_build, 1)
gold_path.write_text(gold, encoding="utf-8")

body = here.joinpath("index.html").read_text(encoding="utf-8").split("\n", 2)[2]  # drop <title> and claude meta
body = body.replace('src="gold.html"', 'src="gold.html?v=%s"' % gold_build)  # the sheet always opens the current GOLD page
build = hashlib.sha1((body + gold_build).encode()).hexdigest()[:10]  # a new GOLD page also refreshes the desk
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
