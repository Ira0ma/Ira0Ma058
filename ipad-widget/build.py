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

# usdjpy.html: the same page; it switches to USD/JPY by its file name (INSTR_KEY makes that explicit)
fx = re.sub(r'<meta name="build" content="[^"]*">\n', "", gold)
fx = fx.replace("<title>GOLD Trade Dashboard</title>", "<title>USDJPY Trade Dashboard</title>", 1)
fx = fx.replace('<meta name="apple-mobile-web-app-title" content="GOLD">', '<meta name="apple-mobile-web-app-title" content="USDJPY">', 1)
fx = fx.replace("<script>\nconst $ = id =>", "<script>window.INSTR_KEY='usdjpy';</script>\n<script>\nconst $ = id =>", 1)
fx_build = hashlib.sha1(fx.encode()).hexdigest()[:10]
fx = fx.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta name="build" content="%s">\n' % fx_build, 1)
here.joinpath("usdjpy.html").write_text(fx, encoding="utf-8")

# btc.html: the same page again, as BTC/USD
bt = re.sub(r'<meta name="build" content="[^"]*">\n', "", gold)
bt = bt.replace("<title>GOLD Trade Dashboard</title>", "<title>BTCUSD Trade Dashboard</title>", 1)
bt = bt.replace('<meta name="apple-mobile-web-app-title" content="GOLD">', '<meta name="apple-mobile-web-app-title" content="BTCUSD">', 1)
bt = bt.replace("<script>\nconst $ = id =>", "<script>window.INSTR_KEY='btc';</script>\n<script>\nconst $ = id =>", 1)
bt_build = hashlib.sha1(bt.encode()).hexdigest()[:10]
bt = bt.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta name="build" content="%s">\n' % bt_build, 1)
here.joinpath("btc.html").write_text(bt, encoding="utf-8")

body = here.joinpath("index.html").read_text(encoding="utf-8").split("\n", 2)[2]  # drop <title> and claude meta
# the sheets always open the current GOLD / USDJPY / BTCUSD pages, and a new one also refreshes the desk
body = body.replace('src: "gold.html"', 'src: "gold.html?v=%s"' % gold_build).replace('src: "usdjpy.html"', 'src: "usdjpy.html?v=%s"' % fx_build)
body = body.replace('src: "btc.html"', 'src: "btc.html?v=%s"' % bt_build)
build = hashlib.sha1((body + gold_build + fx_build + bt_build).encode()).hexdigest()[:10]
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
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-cup.png">
<link rel="icon" type="image/png" href="icon-cup.png">
<meta name="build" content="{build}">
<title>Trade Desk Home</title>
<style>:root{--gutter:0px!important}</style>
"""
body = body.replace('</style>\n\n<canvas id="bg"', '</style>\n</head>\n<body>\n<canvas id="bg"', 1)
here.joinpath("ipad.html").write_text(head.replace("{build}", build) + body + "\n</body>\n</html>\n", encoding="utf-8")
