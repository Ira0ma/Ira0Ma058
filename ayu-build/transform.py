#!/usr/bin/env python3
"""Desk of Ayu fork — mechanical transforms (step 1).
Reads the copied production files in repo/ayu/, applies ONLY:
  - branding string swaps (display surfaces)
  - localStorage key prefixing (ayu_)
  - data-path fixes for the /ayu/ subfolder layout (../ and /Ira0Ma058/learn/)
  - build.py-equivalent generation of ayu/index.html (head says "Desk of Ayu")
  - ayu/manifest.webmanifest
  - pages.yml guarded copy line
Every replacement asserts its expected occurrence count.
"""
import hashlib, re, sys
from pathlib import Path

REPO = Path.home() / "workspace/trade-desk-work/repo"
AYU = REPO / "ayu"
fails = []

def rep(text, old, new, count, label):
    n = text.count(old)
    if n != count:
        fails.append(f"{label}: expected {count} of {old!r}, found {n}")
        return text
    return text.replace(old, new)

# ---------------------------------------------------------------- index fragment
s = (AYU / "index.src.html").read_text(encoding="utf-8")

# --- branding (display surfaces in the fragment) ---
s = rep(s, "タップでDesk Oneを開きます", "タップでDesk of Ayuを開きます", 1, "brand-notify-body")
s = rep(s, "ホーム画面に追加したDesk Oneで使えます", "ホーム画面に追加したDesk of Ayuで使えます", 1, "brand-toast")
s = rep(s, 'sysNotify("Desk One",', 'sysNotify("Desk of Ayu",', 1, "brand-notify-title")

# --- storage key prefixing: quoted literal keys ---
KEYS = [
    "td-signals-v1", "desk_notify", "mkt-v1", "btc_oil_adj", "wx-loc-v1",
    "td_surge_v1", "desk_iv_closed", "desk_mv_closed", "notes-v1", "td-ptlv-v1",
    "td_fire_sim_v1", "td_loan_sim_v1", "td_aidiag_v1", "td_medcheck_v1",
    "td_stockcalc_v1", "td_leave_sim_v1", "quote-v1", "td_theme", "desk-layout",
    "desk_sound", "desk-tf", "tv_via_shortcut", "btc_auto_cache_final",
    "usoil_live_spot", "usoil_auto_cache_final", "desk_eq_closed", "gloss-book",
    "shelf-last", "td-power",
]
for k in KEYS:
    n = s.count(f'"{k}"')
    if n == 0:
        fails.append(f"index key {k}: 0 occurrences")
    s = s.replace(f'"{k}"', f'"ayu_{k}"')

# --- dynamic key constructions ---
s = rep(s, '"quote-" + this.el.id', '"ayu_quote-" + this.el.id', 1, "dyn-quote")
s = rep(s, 'localStorage.getItem(self.key + "_tv_sc_name")', 'localStorage.getItem("ayu_" + self.key + "_tv_sc_name")', 1, "dyn-tvsc")
s = rep(s, 'localStorage.getItem(mk.key + "_tv_layout")', 'localStorage.getItem("ayu_" + mk.key + "_tv_layout")', 1, "dyn-tvlayout")
s = rep(s, 'localStorage.getItem(key + "_alerts")', 'localStorage.getItem("ayu_" + key + "_alerts")', 1, "dyn-alerts")

# --- bookmark keys in BOOKS ---
n = s.count('bm: "learn-'); s = s.replace('bm: "learn-', 'bm: "ayu_learn-')
if n != 30: fails.append(f"bm learn-*: expected 30, found {n}")
s = rep(s, 'bm: "gloss-page"', 'bm: "ayu_gloss-page"', 1, "bm-gloss")
s = rep(s, 'bm: "eco-page"', 'bm: "ayu_eco-page"', 1, "bm-eco")

# --- learn book JSON paths -> production absolute path (shared, read-only) ---
n = s.count('src: "learn/'); s = s.replace('src: "learn/', 'src: "/Ira0Ma058/learn/')
if n != 30: fails.append(f"learn src: expected 30, found {n}")

# --- fig srcs inside book JSONs are page-relative ("learn/fig/..."):
#     rewrite them to the production absolute path right after each book loads ---
s = rep(s,
    ".then(function (j) { return learnBook(b, j); }, function (e) { b.loading = null; throw e; });",
    ".then(function (j) { ayuFixFigs(j); return learnBook(b, j); }, function (e) { b.loading = null; throw e; });",
    1, "ensureBook-fixup")
s = rep(s,
    "    function ensureBook(id) {",
    "    function ayuFixFigs(o) {  // Desk of Ayu: 本の図は本番の /Ira0Ma058/learn/ から読む（JSON内の相対パスを絶対化）\n"
    "      if (!o || typeof o !== \"object\") return;\n"
    "      if (typeof o.src === \"string\" && o.src.indexOf(\"learn/\") === 0) o.src = \"/Ira0Ma058/\" + o.src;\n"
    "      for (var k in o) ayuFixFigs(o[k]);\n"
    "    }\n"
    "    function ensureBook(id) {",
    1, "ayuFixFigs-def")

# --- site data JSONs live at the production root, one level up from /ayu/ ---
for f in ["market.json", "calendar.json?t=", "news.json", "holidays.json?v=",
          "market_holidays.json?v=", "reactions.json?t=", "strategy.json"]:
    s = rep(s, f'fetch("{f}', f'fetch("../{f}', 1, f"data-{f}")

(AYU / "index.src.html").write_text(s, encoding="utf-8")

# ---------------------------------------------------------------- tools.js
t = (AYU / "tools.js").read_text(encoding="utf-8")
for k in ["td-journal-v1", "td-risk-v1", "td-checks-v1", "td-daily-v1",
          "td_kakeibo_v1", "td_kakeibo_loans_v1", "td_kakeibo_assets_v1",
          "td_kakeibo_hcguide_v1", "td-tools-tab", "td_theme"]:
    n = t.count(f'"{k}"')
    if n == 0: fails.append(f"tools key {k}: 0 occurrences")
    t = t.replace(f'"{k}"', f'"ayu_{k}"')
t = rep(t, '"trade-desk-backup-"', '"desk-of-ayu-backup-"', 1, "tools-backup-name")
(AYU / "tools.js").write_text(t, encoding="utf-8")

# ---------------------------------------------------------------- core.js
c = (AYU / "core.js").read_text(encoding="utf-8")
c = rep(c,
  'display: [/^desk-layout$/, /^mkt-v1$/, /^wx-loc-v1$/, /^gloss-book$/, /^learn-[a-z]+-page$/, /^desk_eq_closed$/, /^td-display-v1$/, /^td-power$/,\n'
  '      /^(gold|usdjpy|btc)_(tf|levels|trend|fvg|ma|hidden_lv|ev_filter|dir|tv_layout|tv_sc_name|chart_src)$/, /^tv_via_shortcut$/],\n'
  '    notify: [/^desk_sound$/, /^desk_notify$/, /^(gold|usdjpy|btc)_alerts$/, /^td-notify-v1$/],\n'
  '    trading: [/^(gold|usdjpy|btc)_(capital|risk_pct|lot_manual|sl_mult|rr|auto_risk|broker|contract|tp_basis|tp_basis_v|checks|xm_.*|xs_.*)$/, /^pt-v1$/,\n'
  '      /^td-journal-v1$/, /^td-daily-v1$/, /^td-signals-v1$/, /^td-checks-v1$/, /^td-risk-v1$/,\n'
  '      /^td_kakeibo_v1$/, /^td_kakeibo_loans_v1$/, /^td_kakeibo_assets_v1$/, /^td_kakeibo_hcguide_v1$/]',
  'display: [/^ayu_desk-layout$/, /^ayu_mkt-v1$/, /^ayu_wx-loc-v1$/, /^ayu_gloss-book$/, /^ayu_learn-[a-z]+-page$/, /^ayu_desk_eq_closed$/, /^ayu_td-display-v1$/, /^ayu_td-power$/,\n'
  '      /^ayu_(gold|usdjpy|btc)_(tf|levels|trend|fvg|ma|hidden_lv|ev_filter|dir|tv_layout|tv_sc_name|chart_src)$/, /^ayu_tv_via_shortcut$/],\n'
  '    notify: [/^ayu_desk_sound$/, /^ayu_desk_notify$/, /^ayu_(gold|usdjpy|btc)_alerts$/, /^ayu_td-notify-v1$/],\n'
  '    trading: [/^ayu_(gold|usdjpy|btc)_(capital|risk_pct|lot_manual|sl_mult|rr|auto_risk|broker|contract|tp_basis|tp_basis_v|checks|xm_.*|xs_.*)$/, /^ayu_pt-v1$/,\n'
  '      /^ayu_td-journal-v1$/, /^ayu_td-daily-v1$/, /^ayu_td-signals-v1$/, /^ayu_td-checks-v1$/, /^ayu_td-risk-v1$/,\n'
  '      /^ayu_td_kakeibo_v1$/, /^ayu_td_kakeibo_loans_v1$/, /^ayu_td_kakeibo_assets_v1$/, /^ayu_td_kakeibo_hcguide_v1$/]',
  1, "core-groups")
c = rep(c, 'var CACHE = [/_auto_cache_final$/, /^quote-/];',
           'var CACHE = [/_auto_cache_final$/, /^ayu_quote-/];', 1, "core-cache")
c = rep(c, 'app: "trade-desk"', 'app: "desk-of-ayu"', 1, "core-app-stamp")
c = rep(c, 'obj.app !== "trade-desk"', 'obj.app !== "desk-of-ayu"', 1, "core-app-check")
(AYU / "core.js").write_text(c, encoding="utf-8")

# ---------------------------------------------------------------- dashboards: SITE data root one level up
for name in ["gold.html", "usdjpy.html", "btc.html", "oil.html"]:
    p = AYU / name
    d = p.read_text(encoding="utf-8")
    d = rep(d, "location.hostname.endsWith('github.io') ? '' : 'https://ira0ma.github.io/Ira0Ma058/'",
               "location.hostname.endsWith('github.io') ? '../' : 'https://ira0ma.github.io/Ira0Ma058/'",
               1, f"site-{name}")
    p.write_text(d, encoding="utf-8")

# ---------------------------------------------------------------- manifest
(AYU / "manifest.webmanifest").write_text(
    '{\n  "name": "Desk of Ayu",\n  "short_name": "Desk of Ayu",\n'
    '  "start_url": "./",\n  "scope": "./",\n  "display": "standalone",\n'
    '  "background_color": "#06070b",\n  "theme_color": "#06070b",\n'
    '  "icons": [\n    { "src": "icon-cup.png", "sizes": "180x180", "type": "image/png" }\n  ]\n}\n',
    encoding="utf-8")

# ---------------------------------------------------------------- pages.yml guarded copy line
wf = REPO / ".github/workflows/pages.yml"
w = wf.read_text(encoding="utf-8")
if "cp -r ayu _site/ayu" not in w:
    anchor = "cp ipad-widget/core.js _site/core.js"
    if anchor not in w:
        fails.append("pages.yml anchor not found")
    else:
        w = w.replace(anchor, anchor + "\n          [ -d ayu ] && cp -r ayu _site/ayu || true", 1)
        wf.write_text(w, encoding="utf-8")

if fails:
    print("FAILURES:")
    [print(" -", f) for f in fails]
    sys.exit(1)
print("step1 OK")
