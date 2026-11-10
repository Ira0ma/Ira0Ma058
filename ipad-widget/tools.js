/* Trade Desk tools (loaded the first time 🧰 is opened): position size and risk/reward, pre-trade checklist,
   trade journal, signal history, market hours, data status and settings. Everything stays on this device
   (localStorage); nothing is sent anywhere. The rules live in core.js (TDCore) and are tested there. */
(function () {
  "use strict";
  var C = window.TDCore, D = window.TDDesk;
  if (!C || !D) return;
  var LS = window.localStorage;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var get = function (k, d) { try { var v = LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var put = function (k, v, what) { if (!C.safeSet(LS, k, JSON.stringify(v))) { D.saveFailed(what); return false; } return true; };
  var fmt = function (x, d) { return isFinite(x) ? Number(x).toLocaleString("ja-JP", { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d }) : "—"; };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var INST = { gold: { name: "GOLD（XAU/USD）", contract: 100, quote: "USD", step: 0.01, min: 0.01, unit: "oz" },
    usdjpy: { name: "ドル円（USD/JPY）", contract: 100000, quote: "JPY", step: 0.01, min: 0.01, unit: "通貨" },
    btc: { name: "BTC/USD", contract: 1, quote: "USD", step: 0.01, min: 0.01, unit: "BTC" },
    other: { name: "その他", contract: "", quote: "", step: "", min: "", unit: "" } };
  var SIDE = { buy: "買い", sell: "売り" };

  /* ---------- dialog ---------- */
  var TABS = [["guide", "使い方"], ["money", "資金管理"], ["check", "取引前チェック"], ["journal", "日誌"], ["pnl", "トレード収支"], ["kakeibo", "家計簿"], ["tax", "確定申告"], ["signals", "シグナル履歴"], ["hours", "市場時間"], ["status", "データ状態"], ["settings", "設定"]];
  var css = document.createElement("style");
  css.textContent = [
    ".tdt{position:fixed;inset:0;z-index:45;background:rgba(4,5,8,.72);display:flex;align-items:stretch;justify-content:center;padding:max(10px,var(--safe-top,env(safe-area-inset-top,0px))) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}",
    ".tdt[hidden]{display:none}",
    ".tdt-box{width:min(980px,100%);display:flex;flex-direction:column;background:#101219;border:1px solid rgba(227,184,103,.35);border-radius:18px;color:#f4f1ea;overflow:hidden;font-size:14px;line-height:1.6}",
    ".tdt-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)}",
    ".tdt-top h2{margin:0 auto 0 4px;font-size:16px;color:#e3b867}",
    ".tdt button,.tdt input,.tdt select,.tdt textarea{font:inherit;color:inherit}",
    ".tdt-x{min-width:44px;min-height:44px;border-radius:999px;border:1px solid rgba(227,184,103,.5);background:#e3b867;color:#14100a!important;font-weight:800;padding:0 16px;cursor:pointer}",
    ".tdt-tabs{display:flex;gap:4px;overflow-x:auto;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);scrollbar-width:thin}",
    ".tdt-tabs button{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:none;cursor:pointer;font-weight:700;color:#cfc8ba}",
    ".tdt-tabs button[aria-selected=true]{background:#e3b867;color:#14100a;border-color:#e3b867}",
    ".tdt-body{flex:1;overflow:auto;padding:14px 16px 24px;-webkit-overflow-scrolling:touch}",
    ".tdt h3{font-size:15px;margin:18px 0 8px;color:#e3b867}.tdt h3:first-child{margin-top:0}",
    ".tdt .note{font-size:12.5px;color:#b9b2a3;margin:6px 0}",
    ".tdt .warn{border:1px solid rgba(255,138,126,.5);background:rgba(255,138,126,.08);border-radius:10px;padding:8px 10px;margin:8px 0;color:#ffcfc8}",
    ".tdt .ok{border:1px solid rgba(95,217,154,.45);background:rgba(95,217,154,.07);border-radius:10px;padding:8px 10px;margin:8px 0}",
    ".tdt .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 12px}",
    ".tdt label.f{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:#cfc8ba}",
    ".tdt label.f input,.tdt label.f select,.tdt label.f textarea{min-height:44px;padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#181b24;font-size:16px}",
    ".tdt label.f textarea{min-height:70px}",
    ".tdt .btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}",
    ".tdt .btn{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid rgba(227,184,103,.55);background:none;color:#e3b867;font-weight:700;cursor:pointer}",
    ".tdt .btn.pri{background:#e3b867;color:#14100a}",
    ".tdt .btn.danger{border-color:rgba(255,138,126,.6);color:#ffb4a8}",
    ".tdt button:focus-visible,.tdt input:focus-visible,.tdt select:focus-visible,.tdt textarea:focus-visible,.tdt summary:focus-visible{outline:2px solid #ffd166;outline-offset:2px}",
    ".tdt .out{background:#181b24;border-radius:12px;padding:10px 12px;margin:8px 0;white-space:pre-wrap}",
    ".tdt table{border-collapse:collapse;width:100%;font-size:12.5px}.tdt th,.tdt td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px 6px;text-align:left;vertical-align:top}",
    ".tdt th{color:#b9b2a3;font-weight:600}.tdt .tw{overflow-x:auto}",
    ".tdt .lv{font-weight:700;white-space:nowrap}.tdt .lv-live,.tdt .lv-fresh{color:#5fd99a}.tdt .lv-delayed{color:#ffd166}.tdt .lv-stale,.tdt .lv-unknown,.tdt .lv-missing,.tdt .lv-held{color:#ff9d90}.tdt .lv-closed{color:#b9b2a3}",
    ".tdt .chk{display:flex;gap:10px;align-items:flex-start;min-height:44px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}.tdt .chk input{width:24px;height:24px;flex:none;margin-top:2px}",
    ".tdt details{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px 12px;margin:8px 0}.tdt summary{cursor:pointer;min-height:32px}",
    ".tdt .tag{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid currentColor;margin-right:6px}",
    ".tdt .buy{color:#5fd99a}.tdt .sell{color:#ff9d90}",
    ".tdt-tip{margin:0 0 12px;padding:8px 12px;border-radius:12px;background:rgba(227,184,103,.08);border:1px solid rgba(227,184,103,.3);font-size:13px;color:#e8dfcc}",
    ".tdt-more{min-height:36px;margin-left:6px;padding:0 12px;border-radius:999px;border:1px solid rgba(227,184,103,.55);background:none;color:#e3b867;font-weight:700;cursor:pointer}",
    ".tdt .steps{margin:6px 0 6px 1.2em;padding:0}.tdt .steps li{margin:4px 0}",
    ".tdt .flow{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin:8px 0}",
    ".tdt .flow div{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px 10px;font-size:13px}.tdt .flow b{color:#e3b867;display:block}",
    ".tdt-today{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;color:#e8dfcc}",
    ".tdt-today b{color:#e3b867}.tdt-today .go{min-height:32px;padding:0 10px;border-radius:999px;border:1px solid rgba(227,184,103,.55);background:none;color:#e3b867;font-weight:700;cursor:pointer;margin-left:4px}",
    ".tdt .first{border:1px solid rgba(227,184,103,.55);background:rgba(227,184,103,.08);border-radius:12px;padding:10px 12px;margin:0 0 12px}",
    ".tdt .first ol{margin:6px 0 4px 1.2em;padding:0}.tdt .first li{margin:4px 0}",
    ".tdt .g-why{margin:6px 0;font-weight:700;color:#f4f1ea}",
    ".tdt .chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}.tdt .chips button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:#181b24;cursor:pointer;font-size:13px}",
    ".tdt .pxrow{display:flex;flex-direction:column;gap:4px;min-width:0}.tdt .pxrow .btn{min-height:36px;padding:0 10px;font-size:12.5px;align-self:flex-start}",
    ".tdt .btn:disabled{opacity:.4;cursor:default}",
    ".tdt .jcal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;max-width:420px;text-align:center;font-size:12.5px}",
    ".tdt .jcal b{color:#b9b2a3;font-weight:600}.tdt .jcal span{padding:5px 0;border-radius:8px;background:#181b24}.tdt .jcal span.t{background:rgba(227,184,103,.28);color:#fff}.tdt .jcal span.s{box-shadow:inset 0 0 0 1px rgba(227,184,103,.6)}.tdt .jcal span.now{outline:1px solid #e3b867}",
    ".tdt .jcalh{display:flex;align-items:center;gap:8px;margin:6px 0}.tdt .jcalh button{min-height:36px;min-width:36px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:none;cursor:pointer}",
    ".tdt .streak{font-size:15px;font-weight:700;color:#e3b867;margin:4px 0}",
    /* 収支（A）：黒×金、数字は大きな細字・桁そろえ、罫線より余白。アニメーション・ぼかしなし */
    ".tdt .pl-up{color:#5fd99a}.tdt .pl-dn{color:#ff9d90}",
    ".tdt .pl-in{background:#14161e;border-radius:14px;padding:10px 12px;margin:4px 0 14px}.tdt .pl-in>b{color:#e3b867;font-size:14px}",
    ".tdt .pl-head{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;align-items:end;margin:8px 0 6px}",
    ".tdt .pl-big small{display:block;color:#b9b2a3;font-size:12px}.tdt .pl-big b{font-size:34px;font-weight:300;letter-spacing:.01em;font-variant-numeric:tabular-nums;line-height:1.15}.tdt .pl-big i{font-style:normal;font-size:14px;margin-left:3px;color:#b9b2a3}",
    ".tdt .pl-kv{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12px;color:#b9b2a3}.tdt .pl-kv b{display:block;font-size:17px;font-weight:300;color:#f4f1ea;font-variant-numeric:tabular-nums}",
    ".tdt .pl-spark{grid-column:1/-1;width:100%;height:44px;display:block}",
    ".tdt .pl-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;font-variant-numeric:tabular-nums}",
    ".tdt .pl-cal>b{font-size:11.5px;color:#b9b2a3;font-weight:600;text-align:center;padding:2px 0}.tdt .pl-cal>b.sat{color:#8fb4ff}.tdt .pl-cal>b.sun{color:#ff9d90}",
    ".tdt .pl-cal button{min-height:62px;display:flex;flex-direction:column;align-items:flex-end;gap:1px;padding:4px 5px;border-radius:10px;border:0;background:#161922;cursor:pointer;text-align:right;overflow:hidden}",
    ".tdt .pl-cal button>span{align-self:flex-start;font-size:11.5px;color:#b9b2a3}.tdt .pl-cal button.now{box-shadow:inset 0 0 0 1px #e3b867}.tdt .pl-cal button.now>span{color:#e3b867;font-weight:700}.tdt .pl-cal button.sel{background:#1f2330}",
    ".tdt .pl-cal em{font-style:normal;font-size:13px;font-weight:400;white-space:nowrap}.tdt .pl-cal em.pl-skip{font-size:10.5px;color:#b9b2a3}.tdt .pl-cal small{font-size:10px;white-space:nowrap;color:#d9c08a}.tdt .pl-cal small.pl-wd{color:#b9b2a3}",
    ".tdt .pl-dayd{margin:10px 0;padding:8px 12px;border-radius:12px;background:#14161e}",
    ".tdt .pl-seg{display:inline-flex;gap:4px;margin:2px 0 6px}.tdt .pl-seg button{min-height:40px;min-width:56px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:none;cursor:pointer;font-weight:700;color:#cfc8ba}.tdt .pl-seg button[aria-pressed=true]{background:#e3b867;color:#14100a;border-color:#e3b867}",
    ".tdt .pl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 16px;margin:6px 0 10px}.tdt .pl-grid span{display:block;font-size:12px;color:#b9b2a3}.tdt .pl-grid b{font-size:20px;font-weight:300;font-variant-numeric:tabular-nums}.tdt .pl-grid small{display:block;font-size:11px;color:#b9b2a3}",
    ".tdt .pl-year td{font-variant-numeric:tabular-nums;white-space:nowrap}.tdt .pl-year tr.now td{background:rgba(227,184,103,.08)}.tdt .pl-barc{width:40%;min-width:120px}",
    ".tdt .pl-bar{position:relative;display:block;height:10px;background:linear-gradient(90deg,transparent calc(50% - .5px),rgba(255,255,255,.25) calc(50% - .5px),rgba(255,255,255,.25) calc(50% + .5px),transparent calc(50% + .5px))}.tdt .pl-bar i{position:absolute;top:0;bottom:0;border-radius:2px}.tdt .pl-bar i.up{background:#5fd99a}.tdt .pl-bar i.dn{background:#ff9d90}",
    /* 家計簿：カテゴリ別のバー（divのみ）と一覧 */
    ".tdt .kb-cat{display:grid;grid-template-columns:minmax(64px,auto) 1fr auto;gap:4px 12px;align-items:center;margin:5px 0;font-variant-numeric:tabular-nums}",
    ".tdt .kb-cat .kb-bar{display:block;height:8px;background:#181b24;border-radius:4px;overflow:hidden}",
    ".tdt .kb-cat .kb-bar i{display:block;height:100%;background:#ff9d90;border-radius:4px}",
    ".tdt .kb-amt{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}",
    /* 家計簿ニコイチ：入力の2段スイッチ（収支×区分で色が決まる）、月のまとめのペア表、一覧の区分バンド */
    ".tdt .kb-pair{display:flex;flex-direction:column;gap:6px;margin:2px 0 8px}",
    ".tdt .kb-pair-row{display:flex;align-items:center;gap:10px}",
    ".tdt .kb-pair-lab{flex:none;width:34px;font-size:12.5px;color:#b9b2a3}",
    ".tdt .kb-pair .pl-seg{flex:1;max-width:440px;margin:0;display:flex;gap:0}",
    ".tdt .kb-pair .pl-seg button{flex:1;border-radius:0;margin-left:-1px}",
    ".tdt .kb-pair .pl-seg button:first-child{border-radius:999px 0 0 999px;margin-left:0}",
    ".tdt .kb-pair .pl-seg button:last-child{border-radius:0 999px 999px 0}",
    ".tdt .kb-pair .pl-seg button[aria-pressed=true]{position:relative;z-index:1}",
    ".tdt .kb-pair .kb-seg-t button[data-kt=in][aria-pressed=true]{background:#5fd99a;border-color:#5fd99a;color:#14100a}",
    ".tdt .kb-pair .kb-seg-t button[data-kt=out][aria-pressed=true]{background:#a83a32;border-color:#a83a32;color:#fff}",
    ".tdt .kb-pair .kb-seg-s button[data-ks=life][aria-pressed=true]{background:#7fb2c9;border-color:#7fb2c9;color:#14100a}",
    ".tdt .kb-pair .kb-seg-s button[data-ks=biz][aria-pressed=true]{background:#e3b867;border-color:#e3b867;color:#14100a}",
    ".tdt .kb-ps-h{font-size:15px;font-weight:700;color:#e3b867;margin:10px 0 4px}",
    ".tdt .kb-ps{table-layout:fixed}",
    ".tdt .kb-ps th:first-child{width:52px}",
    ".tdt .kb-ps th.kb-ps-life,.tdt .kb-ps th.kb-ps-biz{text-align:center;font-size:14px;color:#f4f1ea}",
    ".tdt .kb-ps th.kb-ps-life{border-bottom:3px solid #7fb2c9}",
    ".tdt .kb-ps th.kb-ps-biz{border-bottom:3px solid #e3b867}",
    ".tdt .kb-ps td.kb-amt{text-align:center}",
    ".tdt .kb-ps td:first-child{color:#b9b2a3}",
    ".tdt .kb-ps .kb-ps-bal{color:#e3b867}",
    ".tdt .kb-ps tr.kb-ps-total td{border-top:1px solid rgba(227,184,103,.45);border-bottom:0;font-size:13px}",
    ".tdt .kb-ps tr.kb-ps-total td[colspan]{text-align:center}",
    ".tdt tr.kb-row-life td:first-child{box-shadow:inset 5px 0 0 #7fb2c9;padding-left:12px}",
    ".tdt tr.kb-row-biz td:first-child{box-shadow:inset 5px 0 0 #e3b867;padding-left:12px}",
    /* 日誌ハブ（その日の記録と数字）と、家計簿の月のまとめ「3つの財布」 */
    ".tdt .jn-rec{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)}",
    ".tdt .jn-rec:last-child{border-bottom:0}",
    ".tdt .jn-panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:10px;margin:8px 0}",
    ".tdt .jn-panel{background:#14161e;border-radius:14px;padding:10px 12px}",
    ".tdt .jn-panel h4{margin:0 0 6px;font-size:14px;color:#e3b867}",
    ".tdt .jn-prow{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-variant-numeric:tabular-nums}",
    ".tdt .jn-prow>span{color:#cfc8ba}",
    ".tdt .jn-prow>b{font-weight:600;white-space:nowrap}",
    ".tdt .jn-prow.tot{border-top:1px solid rgba(255,255,255,.14);margin-top:4px;padding-top:7px}",
    ".tdt .jn-week{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:6px 0 2px}",
    ".tdt .jn-week>div{background:#161922;border-radius:10px;padding:6px 2px;text-align:center;font-size:12.5px;font-variant-numeric:tabular-nums;min-width:0}",
    ".tdt .jn-week>div b{display:block;color:#b9b2a3;font-weight:600;font-size:11.5px;margin-bottom:2px}",
    ".tdt .jn-week>div.sel{box-shadow:inset 0 0 0 1px #e3b867}",
    ".tdt .jn-week>div.today b{color:#e3b867}",
    ".tdt .kb-ps th.kb-ps-trade{text-align:center;font-size:14px;color:#f4f1ea;border-bottom:3px solid #b48ede}",
    ".tdt .kb-ps th.kb-ps-all{text-align:center;font-size:14px;color:#f4f1ea;border-bottom:3px solid #f4f1ea}",
    ".tdt .kb-w3-life{color:#7fb2c9}",
    ".tdt .kb-w3-biz{color:#e3b867}",
    ".tdt .kb-w3-trade{color:#b48ede}",
    /* 住宅ローン控除の申請ガイド：あなたの場合は（金の枠）、ルート選択、手順の番号、書類チェック */
    ".tdt .hc-box{border:1px solid rgba(227,184,103,.55);background:rgba(227,184,103,.10);border-radius:14px;padding:10px 12px;margin:8px 0}",
    ".tdt .hc-box>b{color:#e3b867}",
    ".tdt .hc-big{font-size:16px;font-weight:700;margin:2px 0}",
    ".tdt .hc-routes{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin:6px 0 10px}",
    ".tdt .hc-routes button{min-height:48px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#181b24;color:#cfc8ba;font-weight:700;cursor:pointer;text-align:left}",
    ".tdt .hc-routes button[aria-pressed=true]{background:#e3b867;border-color:#e3b867;color:#14100a}",
    ".tdt .hc-routes button small{display:block;font-weight:400;font-size:12px;opacity:.85}",
    ".tdt .hc-step{display:flex;gap:10px;margin:10px 0}",
    ".tdt .hc-n{flex:none;width:26px;height:26px;border-radius:50%;background:#e3b867;color:#14100a;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}",
    ".tdt .hc-step b{color:#f4f1ea}",
    ".tdt .hc-step .note{margin:2px 0}",
    ".tdt .hc-prog{color:#e3b867;font-weight:700}",
    ".tdt .hc-doc{display:flex;gap:10px;align-items:flex-start;min-height:44px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}",
    ".tdt .hc-doc input{width:24px;height:24px;flex:none;margin-top:2px}",
    ".tdt .hc-doc .hc-formal{display:block;font-size:12px;color:#b9b2a3}",
    ".tdt .hc-doc .note{display:block;margin:2px 0}",
    "@media (max-width:520px){.tdt .pl-cal button{min-height:54px;padding:3px}.tdt .pl-cal em{font-size:11px}.tdt .pl-cal small{font-size:9px}.tdt .pl-big b{font-size:28px}.tdt .pl-head{grid-template-columns:1fr}}",
    ".tdt .skiprow{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.tdt .skiprow label.f{flex:1;min-width:200px}",
    "@media (max-width:600px){.tdt{padding:var(--safe-top,env(safe-area-inset-top,0px)) 0 0}.tdt-box{border-radius:0}.tdt-body{padding:12px}}",  /* スマホは全画面。上だけステータスバーの分を空ける */
    /* 確定申告タブだけの丸字（M PLUS Rounded 1c）。スコープは .tax-scope の中だけ。他のタブ・画面には効かせない。数字は等幅（tnum）で桁をそろえる */
    ".tax-scope{font-family:'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Hiragino Sans','Noto Sans JP',sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}",
    ".tax-scope *{font-variant-numeric:tabular-nums}"
  ].join("\n");
  document.head.appendChild(css);
  var box = document.createElement("div");
  box.className = "tdt"; box.hidden = true;
  box.innerHTML = '<div class="tdt-box" role="dialog" aria-modal="true" aria-labelledby="tdt-h"><div class="tdt-top"><h2 id="tdt-h">🧰 ツール</h2><button type="button" class="tdt-x">閉じる</button></div>' +
    '<div class="tdt-today" aria-live="polite"></div><div class="tdt-tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="false">' + t[1] + "</button>"; }).join("") + "</div>" +
    '<div class="tdt-body" role="tabpanel" tabindex="-1"></div></div>';
  document.body.appendChild(box);
  var body = box.querySelector(".tdt-body"), opener = null, tab = "money", timer = 0;
  try { tab = LS.getItem("td-tools-tab") || "guide"; } catch (e) { tab = "guide"; }  // the first time: how to use
  function open(t, from) {
    opener = from || document.activeElement; if (t) tab = t;
    box.hidden = false; show(tab);
    var b = box.querySelector('[data-tab="' + tab + '"]'); if (b) { b.focus(); b.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  function close() { box.hidden = true; clearInterval(timer); if (opener && opener.focus) opener.focus(); }
  // 「今日」欄：今日の取引前チェック・日誌・連続記録日数。まだのものは、そのタブへのボタン（チェック → 取引 → 日誌の流れ）
  function today() {
    var el = box.querySelector(".tdt-today"), now = Date.now(), dk = C.dayKey(now);
    var cs = (get(CHECKS, []) || []).filter(function (c) { return C.dayKey(Date.parse(c.time)) === dk; }), jd = C.journalDays(journal(), now);
    var n = journal().filter(function (r) { return (r.day || C.dayKey(Date.parse(r.time))) === dk; }).length;
    var c0 = cs[0], ck = c0 ? Object.keys(c0.items).filter(function (k) { return c0.items[k]; }).length + "/" + Object.keys(c0.items).length : "";
    el.innerHTML = "<span><b>今日</b></span>" +
      "<span>取引前チェック：" + (cs.length ? "済み（" + ck + "項目" + (cs.length > 1 ? "・" + cs.length + "回" : "") + "）" : 'まだ<button type="button" class="go" data-tab="check">チェックへ</button>') + "</span>" +
      "<span>日誌：" + (n ? n + "件" : 'まだ<button type="button" class="go" data-tab="journal">日誌へ</button>') + "</span>" +
      "<span>" + (jd.streak ? jd.streak + "日連続で記録中" : "連続記録はここから") + "</span>";
  }
  function show(t) {
    tab = t; try { LS.setItem("td-tools-tab", t); } catch (e) {}
    today();
    box.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
    clearInterval(timer);
    (VIEWS[t] || VIEWS.guide)();
    var h = HELP[t];
    if (h) {  // one line on top of each tab, and the full guide one tap away
      body.insertAdjacentHTML("afterbegin", '<p class="tdt-tip">💡 ' + esc(h[0]) + ' <button type="button" class="tdt-more" data-help="' + t + '">くわしい使い方</button><button type="button" class="tdt-more tdt-words">英語・略語の意味</button></p>');
      body.querySelector(".tdt-words").addEventListener("click", function () { show("guide"); var w = body.querySelector("#g-words-h"); if (w) { w.scrollIntoView({ block: "start" }); body.querySelector(".g-words summary").focus(); } });
      body.querySelector(".tdt-more").addEventListener("click", function () { show("guide"); var a = body.querySelector("#g-" + t); if (a) { a.open = true; a.scrollIntoView({ block: "start" }); a.querySelector("summary").focus(); } });
    }
    body.scrollTop = 0;
  }
  box.querySelector(".tdt-x").addEventListener("click", close);
  box.addEventListener("click", function (e) { if (e.target === box) close(); var b = e.target.closest("[data-tab]"); if (b) show(b.getAttribute("data-tab")); });
  document.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key === "Tab") {  // keep the focus inside the dialog
      var f = [].filter.call(box.querySelectorAll("button,input,select,textarea,summary,a[href],[tabindex='0']"), function (x) { var d = x.closest("details:not([open])"); return !x.disabled && x.offsetParent && (!d || x.tagName === "SUMMARY" && x.parentNode === d); });  // nothing hidden in a closed section
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }, true);
  var $ = function (s) { return body.querySelector(s); };
  var field = function (id, label, val, type, extra) {
    return '<label class="f">' + esc(label) + '<input id="' + id + '" type="' + (type || "text") + '"' + (type === "number" ? ' inputmode="decimal" step="any"' : "") + ' value="' + esc(val == null ? "" : val) + '"' + (extra || "") + "></label>";
  };
  var select = function (id, label, opts, val) {
    return '<label class="f">' + esc(label) + '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
  };
  var download = function (name, text, type) {
    var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };
  var pickFile = function (accept, cb) {
    var i = document.createElement("input"); i.type = "file"; i.accept = accept;
    i.onchange = function () { var f = i.files && i.files[0]; if (!f) return; if (f.size > 5e6) { alert("ファイルが大きすぎます（5MBまで）"); return; } var r = new FileReader(); r.onload = function () { cb(String(r.result)); }; r.readAsText(f); };
    i.click();
  };
  var cardOf = function (k) { return D.cards().filter(function (c) { return c.key === k; })[0]; };
  var usdjpyRef = function () {
    var m = D.market(), u = m && m.instruments && m.instruments.usdjpy;
    return u ? { rate: u.price, at: u.asOf * 1000 } : null;
  };

  /* ---------- money: position size, risk/reward, daily loss ---------- */
  var JOURNAL = "td-journal-v1", RISK = "td-risk-v1", CHECKS = "td-checks-v1", DAILY = "td-daily-v1";
  function journal() { var j = get(JOURNAL, []); return Array.isArray(j) ? j : []; }
  // 日次入力（収支）：{ "YYYY-MM-DD": { pnl, dep, wd, at } }（円。空欄は null）
  function dailyIn() { var d = get(DAILY, {}); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; }
  // [kb-pure-begin] 家計簿の保存読み出しと集計（テストで切り出して検証できるよう、この範囲は get と定数だけに依存する形に保つ）
  var KAKEIBO = "td_kakeibo_v1";
  var KAKEIBO_LOANS = "td_kakeibo_loans_v1";
  var KAKEIBO_ASSETS = "td_kakeibo_assets_v1";
  // 生活のカテゴリ（従来どおり）。KB_CATS は生活分を指す名前として残す
  var KB_CATS = { "in": ["給料", "副業", "その他収入"], "out": ["食費", "住まい", "光熱費", "通信", "交通", "医療", "娯楽", "日用品", "その他"] };
  // 事業のカテゴリ。支出は収支内訳表の科目の並び
  var KB_BIZ_OUT = ["仕入", "給料賃金", "外注工賃", "減価償却費", "利子割引料", "地代家賃", "租税公課", "水道光熱費", "旅費交通費", "通信費", "広告宣伝費", "接待交際費", "損害保険料", "修繕費", "消耗品費", "福利厚生費", "雑費", "その他事業費"];
  var KB_CATS_BIZ = { "in": ["売上", "雑収入", "その他事業収入"], "out": KB_BIZ_OUT };
  var kbCats = function (scope, type) { return (scope === "biz" ? KB_CATS_BIZ : KB_CATS)[type] || []; };
  var KB_MKINDS = ["診療・治療", "医薬品購入", "介護保険サービス", "その他の医療費"];
  // 家計簿：[{ id, date: "YYYY-MM-DD", type: "in"|"out", scope: "life"|"biz", cat, amount, memo }]（円）。scope がなければ生活として扱う。医療の支出（生活）では任意で person（受けた人）・payee（支払先）・mkind（区分）・reimb（補填額）も持つ。日誌ハブから転記した記録は fromTrade（転記したトレード収支の日付）も持つ（二重転記の防止に使う）。壊れた・形の違うデータは捨て、空の一覧として扱う
  function kakeibo() {
    var a = get(KAKEIBO, []);
    if (!Array.isArray(a)) return [];
    return a.filter(function (e) { return e && typeof e.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && (e.type === "in" || e.type === "out") && isFinite(e.amount) && e.amount > 0; }).map(function (e) {
      var n = { id: e.id, date: e.date, type: e.type, scope: e.scope === "biz" ? "biz" : "life", cat: e.cat, amount: e.amount, memo: e.memo };
      if (typeof e.person === "string" && e.person) n.person = e.person;
      if (typeof e.payee === "string" && e.payee) n.payee = e.payee;
      if (KB_MKINDS.indexOf(e.mkind) >= 0) n.mkind = e.mkind;
      if (isFinite(e.reimb) && e.reimb > 0) n.reimb = +e.reimb;
      if (typeof e.fromTrade === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.fromTrade)) n.fromTrade = e.fromTrade;
      return n;
    });
  }
  var kbMonthList = function (list, ym) { return list.filter(function (e) { return e.date.slice(0, 7) === ym; }); };
  var kbTotals = function (list) { var inc = 0, out = 0; list.forEach(function (e) { if (e.type === "in") inc += e.amount; else out += e.amount; }); return { inc: inc, out: out, bal: inc - out }; };
  var kbCatSums = function (list, type) { var m = {}; list.forEach(function (e) { if (e.type === type) m[e.cat] = (m[e.cat] || 0) + e.amount; }); return Object.keys(m).map(function (k) { return { cat: k, sum: m[k] }; }).sort(function (a, b) { return b.sum - a.sum; }); };
  // 申告用（年単位）：選んだ年の記録、医療の明細、控除額の目安、月ごとの年間集計、CSVの材料
  var kbYearList = function (list, year) { var y = String(year); return list.filter(function (e) { return e.date.slice(0, 4) === y; }); };
  var kbMkind = function (e) { return KB_MKINDS.indexOf(e.mkind) >= 0 ? e.mkind : ""; };
  var kbMedical = function (list, year) { return kbYearList(list, year).filter(function (e) { return e.type === "out" && e.scope !== "biz" && e.cat === "医療"; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); };
  var kbMedTotals = function (meds) { var paid = 0, reimb = 0; meds.forEach(function (e) { paid += e.amount; reimb += e.reimb || 0; }); return { paid: paid, reimb: reimb, net: paid - reimb }; };
  // 足切り額：総所得金額等があれば、その5%と10万円の低い方。なければ10万円。控除額の目安は差引から足切りを引き、上限200万円で止める
  var kbDeduction = function (net, income) {
    var ashikiri = 100000, basis = "10万円";
    if (income != null && isFinite(income) && income >= 0) { var five = Math.floor(income * 0.05); if (five < ashikiri) { ashikiri = five; basis = "総所得金額等の5%"; } }
    var raw = net - ashikiri;
    return { ashikiri: ashikiri, basis: basis, est: Math.min(Math.max(0, raw), 2000000), capped: raw > 2000000 };
  };
  var kbMonthlyOfYear = function (list, year) {
    var yl = kbYearList(list, year), res = [];
    for (var m = 1; m <= 12; m++) { var ml = kbMonthList(yl, year + "-" + String(m).padStart(2, "0")), t = kbTotals(ml); res.push({ month: m, count: ml.length, inc: t.inc, out: t.out, bal: t.bal }); }
    return res;
  };
  var kbCsvCell = function (v) {
    if (v == null) return "";
    var s = String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var kbCsv = function (header, rows) { return "﻿" + [header].concat(rows).map(function (r) { return r.map(kbCsvCell).join(","); }).join("\r\n") + "\r\n"; };
  var kbMedCSV = function (meds) { return kbCsv(["医療を受けた人", "病院・薬局などの名称", "医療費の区分", "支払った金額", "補填される金額"], meds.map(function (e) { return [e.person || "", e.payee || "", kbMkind(e), e.amount, e.reimb || 0]; })); };
  var kbAnnualCSV = function (list, year) {
    var yl = kbYearList(list, year), t = kbTotals(yl), rows = [];
    kbCatSums(yl, "in").forEach(function (c) { rows.push(["収入", c.cat, c.sum]); });
    kbCatSums(yl, "out").forEach(function (c) { rows.push(["支出", c.cat, c.sum]); });
    rows.push(["収入", "合計", t.inc]); rows.push(["支出", "合計", t.out]); rows.push(["", "差額", t.bal]);
    return kbCsv(["区分", "カテゴリ", "金額"], rows);
  };
  /* ---------- 事業の収支（申告用）：事業分の記録を収支内訳表の科目順にまとめ、減価償却費と利子割引料の自動計算分を足す ---------- */
  var kbBizSummary = function (list, year, depAuto, intAuto) {
    var yl = kbYearList(list, year).filter(function (e) { return e.scope === "biz"; });
    var inc = kbTotals(yl.filter(function (e) { return e.type === "in"; })).inc;
    var sums = {};
    yl.forEach(function (e) { if (e.type === "out") sums[e.cat] = (sums[e.cat] || 0) + e.amount; });
    var lines = [], exp = 0;
    KB_BIZ_OUT.forEach(function (cat) {
      if (sums[cat]) { lines.push({ cat: cat, sum: sums[cat], auto: false }); exp += sums[cat]; delete sums[cat]; }
      if (cat === "減価償却費" && depAuto > 0) { lines.push({ cat: "減価償却費（自動計算）", sum: depAuto, auto: true }); exp += depAuto; }
      if (cat === "利子割引料" && intAuto > 0) { lines.push({ cat: "利子割引料（自動計算）", sum: intAuto, auto: true }); exp += intAuto; }
    });
    Object.keys(sums).forEach(function (cat) { lines.push({ cat: cat, sum: sums[cat], auto: false }); exp += sums[cat]; });
    return { inc: inc, lines: lines, exp: exp, bal: inc - exp };
  };
  var kbBizCSV = function (list, year, biz) {
    var yl = kbYearList(list, year).filter(function (e) { return e.scope === "biz"; }), rows = [];
    kbCatSums(yl, "in").forEach(function (c) { rows.push(["収入", c.cat, c.sum]); });
    biz.lines.forEach(function (l) { rows.push(["支出", l.cat, l.sum]); });
    rows.push(["収入", "合計", biz.inc]); rows.push(["支出", "合計", biz.exp]); rows.push(["", "差額", biz.bal]);
    return kbCsv(["区分", "科目", "金額"], rows);
  };
  /* ---------- 借入：[{ id, name, purpose: "住宅"|"事業"|"その他", principal, ratePct, monthly, startYm: "YYYY-MM", guarantee, bizRatio, homeType }] ---------- */
  var KB_LOAN_PURPOSES = ["住宅", "事業", "その他"];
  var KB_HOME_TYPES = ["一般（新築）", "認定長期優良・低炭素", "ZEH水準", "省エネ基準適合", "一般（中古）", "認定等（中古）"];
  // 住宅ローン控除の借入限度額と控除期間（令和6・7年入居の制度、国税庁タックスアンサーNo.1211-1・1211-3で確認。一般の新築は令和5年末までに建築確認を受けた住宅の額と期間）
  var KB_HOME_LIMITS = { "一般（新築）": { limit: 20000000, years: 10 }, "認定長期優良・低炭素": { limit: 45000000, years: 13 }, "ZEH水準": { limit: 35000000, years: 13 }, "省エネ基準適合": { limit: 30000000, years: 13 }, "一般（中古）": { limit: 20000000, years: 10 }, "認定等（中古）": { limit: 30000000, years: 10 } };
  var KB_HOME_RATE = 0.007;
  var kbBizRatioDef = function (purpose) { return purpose === "住宅" ? 0 : 100; };
  function kbLoans() {
    var a = get(KAKEIBO_LOANS, []);
    if (!Array.isArray(a)) return [];
    return a.filter(function (e) { return e && typeof e.id === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.startYm || "") && isFinite(e.principal) && e.principal > 0 && isFinite(e.monthly) && e.monthly > 0; }).map(function (e) {
      var purpose = KB_LOAN_PURPOSES.indexOf(e.purpose) >= 0 ? e.purpose : "その他";
      var n = { id: e.id, name: typeof e.name === "string" ? e.name : "", purpose: purpose, principal: +e.principal, ratePct: isFinite(e.ratePct) && e.ratePct >= 0 ? +e.ratePct : 0, monthly: +e.monthly, startYm: e.startYm, guarantee: isFinite(e.guarantee) && e.guarantee > 0 ? +e.guarantee : 0, bizRatio: isFinite(e.bizRatio) ? Math.min(100, Math.max(0, +e.bizRatio)) : kbBizRatioDef(purpose) };
      if (purpose === "住宅") n.homeType = KB_HOME_TYPES.indexOf(e.homeType) >= 0 ? e.homeType : "一般（新築）";
      return n;
    });
  }
  // 元利均等の返済を月ごとに進め、年ごとの元本・利息・年末残高を出す。毎月の利息は円未満を四捨五入。返済額が利息以下のときは stuck で止める
  var kbAmortize = function (loan) {
    var bal = loan.principal, rate = loan.ratePct / 100 / 12, y = +loan.startYm.slice(0, 4), m = +loan.startYm.slice(5, 7);
    var years = {}, total = 0, stuck = false;
    for (var i = 0; i < 720 && bal > 0; i++) {
      var interest = Math.round(bal * rate), pp = loan.monthly - interest;
      if (pp <= 0) { stuck = true; break; }
      if (pp > bal) pp = bal;
      bal -= pp; total++;
      var key = String(y), rec = years[key] || (years[key] = { principal: 0, interest: 0, endBalance: bal, months: 0 });
      rec.principal += pp; rec.interest += interest; rec.endBalance = bal; rec.months++;
      m++; if (m > 12) { m = 1; y++; }
    }
    return { years: years, months: total, stuck: stuck, paidOff: bal <= 0 };
  };
  // 住宅ローン控除の目安：年末残高と借入限度額の小さいほう × 0.7%（100円未満切り捨て）。入居年は借入開始年で代用する
  var kbHomeCredit = function (loan, year, endBalance) {
    var t = KB_HOME_LIMITS[loan.homeType] || KB_HOME_LIMITS["一般（新築）"], startYear = +loan.startYm.slice(0, 4), nth = year - startYear + 1;
    if (nth < 1) return { ok: false, reason: "借入を始める前の年です。" };
    if (nth > t.years) return { ok: false, reason: "控除期間（" + t.years + "年）を過ぎています。", years: t.years, limit: t.limit };
    var base = Math.min(endBalance, t.limit);
    return { ok: true, nth: nth, years: t.years, limit: t.limit, base: base, credit: Math.floor(base * KB_HOME_RATE / 100) * 100 };
  };
  /* ---------- 減価償却の資産：[{ id, name, date: "YYYY-MM-DD", price, life, bizRatio }]。定額法、1年目は取得月から12月までの月割り、残存簿価1円まで ---------- */
  var KB_DEP_RATES = { 2: .500, 3: .334, 4: .250, 5: .200, 6: .167, 7: .143, 8: .125, 9: .112, 10: .100, 11: .091, 12: .084, 13: .077, 14: .072, 15: .067, 16: .063, 17: .059, 18: .056, 19: .053, 20: .050, 22: .046, 25: .040, 30: .034, 35: .029, 40: .025, 47: .022 };
  var kbDepRate = function (life) { return KB_DEP_RATES[life] || Math.ceil(1000 / life) / 1000; };
  function kbAssets() {
    var a = get(KAKEIBO_ASSETS, []);
    if (!Array.isArray(a)) return [];
    return a.filter(function (e) { return e && typeof e.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && isFinite(e.price) && e.price > 0 && isFinite(e.life) && e.life >= 2; }).map(function (e) {
      return { id: e.id, name: typeof e.name === "string" ? e.name : "", date: e.date, price: +e.price, life: Math.round(+e.life), bizRatio: isFinite(e.bizRatio) ? Math.min(100, Math.max(0, +e.bizRatio)) : 100 };
    });
  }
  var kbDepSchedule = function (asset) {
    var ay = +asset.date.slice(0, 4), am = +asset.date.slice(5, 7), full = Math.round(asset.price * kbDepRate(asset.life));
    var book = asset.price, out = {}, y = ay, guard = 0;
    while (book > 1 && guard < 100) {
      var d = y === ay ? Math.round(full * (13 - am) / 12) : full;
      if (d > book - 1) d = book - 1;
      if (d <= 0) break;
      out[y] = d; book -= d; y++; guard++;
    }
    return out;
  };
  var kbDepForYear = function (asset, year) {
    var d = kbDepSchedule(asset)[year] || 0;
    return { total: d, biz: Math.round(d * asset.bizRatio / 100) };
  };
  /* ---------- 住宅ローン控除の申請ガイド：ルート・手順・書類の定義と、チェック状態の形。保存形式は { "<年>": { route: "A"|"B"|"C", checks: { "<書類ID>": true } } } ---------- */
  var KAKEIBO_HCGUIDE = "td_kakeibo_hcguide_v1";
  // 書類：ふだんの言葉の名前を先に、正式な名前は formal に。note は「どこでもらえるか・いつ届くか」
  var KB_HC_DOCS = {
    balance: { name: "年末残高証明書", formal: "", note: "その年末にローンがいくら残っているかの証明です。金融機関から郵送で届きます。届かないときは金融機関へ連絡してください。" },
    calc: { name: "計算明細書", formal: "（特定増改築等）住宅借入金等特別控除額の計算明細書", note: "控除額を計算する紙です。e-Taxで申告すれば、画面の入力がそのまま計算になります。" },
    registry: { name: "登記事項証明書", formal: "", note: "家と土地の記録です。法務局の窓口か、オンラインで取れます。" },
    contract: { name: "売買契約書（請負契約書）の写し", formal: "", note: "買ったときの契約書のコピーです。家を建てた人は、建てたときの請負契約書の写しです。" },
    withholding: { name: "源泉徴収票", formal: "", note: "会社から年末ごろにもらう、給与の証明です。給与がある人だけ必要です。" },
    performance: { name: "性能を証明する書類", formal: "", note: "認定長期優良住宅・低炭素住宅・ZEH水準・省エネ基準適合の家だけ必要です。認定通知書や住宅用家屋証明書、建設住宅性能評価書の写しなど。ふつうの家は不要です。" },
    cert: { name: "控除証明書", formal: "給与所得者の住宅借入金等特別控除申告書", note: "税務署から届く、年末調整用の紙です。入居の翌年の秋ごろ、残りの年数分がまとめて届きます。なくしたら税務署で再発行できます。" }
  };
  var KB_HC_ROUTES = {
    A: { label: "入居して1年目", sub: "確定申告をします", docs: ["balance", "calc", "registry", "contract", "withholding", "performance"], steps: [
      { title: "書類をそろえる", note: "年末残高証明書は10〜11月ごろ、金融機関から届きます。下のチェックリストで、そろったものに印を付けましょう。調書方式に対応した金融機関では、年末残高証明書がマイナポータル連携で代わりになる場合があります。" },
      { title: "計算明細書を作る", note: "控除額を計算する紙です。e-Taxなら、画面の入力がそのまま計算になります。" },
      { title: "確定申告をする", note: "翌年の2月16日〜3月15日に、e-Taxか税務署で申告します。会社員でも、1年目だけは確定申告が必要です。" },
      { title: "還付を受ける", note: "申告から1か月〜1か月半ごろに、指定した口座へ戻ります（目安）。" }] },
    B: { label: "2年目以降・会社員", sub: "年末調整で受けます", docs: ["balance", "cert"], steps: [
      { title: "控除証明書を確認する", note: "10月ごろ、税務署から届きます。残りの年数分がまとめて届いているので、今年の分を使います。" },
      { title: "年末残高証明書を受け取る", note: "11月ごろ、金融機関から届きます。" },
      { title: "会社の年末調整へ提出する", note: "年末調整の書類といっしょに、この2つを勤務先へ出します。締切は会社の指示どおりです（多くは11〜12月）。" }] },
    C: { label: "自営業・副業などの所得がある", sub: "毎年、確定申告をします", docs: ["balance", "calc", "registry", "contract", "withholding", "performance"], steps: [
      { title: "書類をそろえる", note: "1年目（ルートA）と同じ書類です。年末残高証明書は10〜11月ごろ、金融機関から届きます。調書方式に対応した金融機関では、年末残高証明書がマイナポータル連携で代わりになる場合があります。" },
      { title: "計算明細書を作る", note: "控除額を計算する紙です。e-Taxなら、画面の入力がそのまま計算になります。" },
      { title: "毎年、確定申告をする", note: "翌年の2月16日〜3月15日に申告します。上の「事業の収支」と同じ確定申告の中で受けます。" },
      { title: "還付を受ける", note: "申告から1か月〜1か月半ごろに、指定した口座へ戻ります（目安）。" }] }
  };
  var KB_HC_ROUTE_ORDER = ["A", "B", "C"];
  var KB_HC_FAILS = [
    "1年目は、会社員でも年末調整だけでは受けられません。確定申告が必要です。",
    "控除証明書をなくしたら、税務署で再発行できます。",
    "年末残高証明書が届かないときは、金融機関へ連絡してください。",
    "中古住宅・増改築は、条件と書類が少し違います。当てはまる人は、税務署で確認してください。"
  ];
  // 保存されたガイド状態を正しい形に直す（壊れた値・知らない年や書類IDは捨てる）
  var kbHcGuideNorm = function (raw) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (y) {
      if (!/^\d{4}$/.test(y)) return;
      var e = raw[y]; if (!e || typeof e !== "object") return;
      var checks = {};
      if (e.checks && typeof e.checks === "object") Object.keys(e.checks).forEach(function (id) { if (KB_HC_DOCS[id] && e.checks[id] === true) checks[id] = true; });
      out[y] = { route: KB_HC_ROUTES[e.route] ? e.route : null, checks: checks };
    });
    return out;
  };
  // あなたの場合は：登録された住宅の借入のうち、表示中の年で控除の目安が出る最初の1件。なければ null
  var kbHcPersonal = function (loans, year) {
    var homes = (loans || []).filter(function (l) { return l.purpose === "住宅"; });
    for (var i = 0; i < homes.length; i++) {
      var yr = kbAmortize(homes[i]).years[year];
      if (!yr) continue;
      var hc = kbHomeCredit(homes[i], year, yr.endBalance);
      if (hc.ok) return { nth: hc.nth, years: hc.years, limit: hc.limit, credit: hc.credit, route: hc.nth === 1 ? "A" : "B" };
    }
    return null;
  };
  var kbHcDefaultRoute = function (personal) { return personal ? personal.route : "B"; };
  // 表示中の年のガイド入力状態（保存がなければ、あなたの場合はから決めた初期ルートと、空のチェック）
  var kbHcYearEntry = function (state, year, personal) {
    var e = (state || {})[String(year)];
    return { route: e && e.route ? e.route : kbHcDefaultRoute(personal), checks: e && e.checks ? e.checks : {} };
  };
  var kbHcProgress = function (route, checks) {
    var docs = (KB_HC_ROUTES[route] || KB_HC_ROUTES.B).docs, done = 0;
    docs.forEach(function (id) { if (checks && checks[id]) done++; });
    return { total: docs.length, done: done };
  };
  // [kb-pure-end]
  // [hub-pure-begin] 日誌ハブと「3つの財布」の集計（テストで切り出して検証できるよう、C（TDCore）・kbTotals・kbCatSums・uid だけに依存する形に保つ）
  // 日誌の銘柄の並びと表示名（日誌の銘柄キー。オイルは日誌では「その他」として記録される）
  var JN_INSTS = [["gold", "ゴールド"], ["usdjpy", "ドル円"], ["btc", "BTC"], ["other", "その他"]];
  var jnDayOf = function (r) { return r.day || (isFinite(Date.parse(r.time)) ? C.dayKey(Date.parse(r.time)) : ""); };
  // 取引の記録（見送りは除く）から銘柄ごとの損益を集める。損益の入っていない記録は件数だけ数える（has が false のとき金額は出さない）
  var jnInstAgg = function (recs) {
    var order = JN_INSTS.map(function (x) { return x[0]; }), names = {};
    JN_INSTS.forEach(function (x) { names[x[0]] = x[1]; });
    var m = {};
    (recs || []).forEach(function (r) {
      var k = r.key || "other";
      if (!m[k]) { m[k] = { key: k, name: names[k] || k, trades: 0, inc: 0, out: 0, bal: 0, has: false }; if (order.indexOf(k) < 0) order.push(k); }
      var a = m[k]; a.trades++;
      if (r.pnl !== null && r.pnl !== "" && isFinite(+r.pnl)) { a.has = true; if (+r.pnl > 0) a.inc += +r.pnl; else if (+r.pnl < 0) a.out += -r.pnl; a.bal += +r.pnl; }
    });
    return order.map(function (k) { return m[k] || { key: k, name: names[k], trades: 0, inc: 0, out: 0, bal: 0, has: false }; });
  };
  // その日の材料：日誌の記録と、その日の確定損益（日次入力が正というルールは C.dailyBook に任せ、日誌の合計とは足さない）
  var tradeDayDetail = function (rows, daily, day) {
    var recs = (rows || []).filter(function (r) { return r && jnDayOf(r) === day; }).slice().sort(function (a, b) { return Date.parse(a.time) - Date.parse(b.time); });
    var trades = recs.filter(function (r) { return r.kind !== "skip"; }), wins = 0, losses = 0;
    trades.forEach(function (r) { if (r.pnl !== null && r.pnl !== "" && isFinite(+r.pnl)) { if (+r.pnl > 0) wins++; else if (+r.pnl < 0) losses++; } });
    var bd = (C.dailyBook(rows, daily) || {})[day] || { pnl: null, src: null };
    return { day: day, recs: recs, trades: trades.length, wins: wins, losses: losses, skip: recs.some(function (r) { return r.kind === "skip"; }), insts: jnInstAgg(trades), total: bd.pnl, src: bd.src };
  };
  // 今週の流れ：day を含む週（月曜はじまり、C.weekOf）の7日分の確定損益と見送り
  var tradeWeekStrip = function (rows, daily, day) {
    var wk = C.weekOf(day), book = C.dailyBook(rows, daily) || {}, names = ["月", "火", "水", "木", "金", "土", "日"], out = [];
    var t = Date.parse(wk.from + "T00:00:00Z");
    for (var i = 0; i < 7; i++) {
      var d = new Date(t + i * 864e5), k = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
      var b = book[k] || { pnl: null, skip: false };
      out.push({ key: k, name: names[i], pnl: b.pnl, skip: !!b.skip });
    }
    return out;
  };
  // 月のトレード集計：収入（プラスの日の合計）・支出（マイナスの日の合計の絶対値）・差額と勝ち日・負け日・見送り日は日ごとの確定損益（C.dailyBook）から、銘柄別の内訳は日誌の取引ごとから数える
  var tradeMonthAgg = function (rows, daily, ym) {
    var book = C.dailyBook(rows, daily) || {}, inc = 0, out = 0, win = 0, loss = 0, skipDays = 0, hasDaily = false;
    Object.keys(book).forEach(function (k) {
      if (k.slice(0, 7) !== ym) return;
      var d = book[k];
      if (d.src === "daily") hasDaily = true;
      if (d.pnl === null) { if (d.skip) skipDays++; return; }
      if (d.pnl > 0) { inc += d.pnl; win++; } else if (d.pnl < 0) { out += -d.pnl; loss++; }
    });
    var mrecs = (rows || []).filter(function (r) { return r && r.kind !== "skip" && jnDayOf(r).slice(0, 7) === ym; });
    return { inc: inc, out: out, bal: inc - out, winDays: win, lossDays: loss, skipDays: skipDays, hasDaily: hasDaily, insts: jnInstAgg(mrecs), any: !!(inc || out || skipDays || mrecs.length) };
  };
  // その日の家計簿（事業分）：カテゴリ別の収入・支出と差額
  var kbDayBiz = function (list, date) {
    var dl = (list || []).filter(function (e) { return e.date === date && e.scope === "biz"; }), t = kbTotals(dl);
    return { incCats: kbCatSums(dl, "in"), outCats: kbCatSums(dl, "out"), inc: t.inc, out: t.out, bal: t.bal, count: dl.length };
  };
  // トレード収支の転記：手で押したときだけ、その日の損益を家計簿の事業分へ1件写す。作った記録には fromTrade（その日の日付）を持たせ、同じ日は二度作らない
  var kbTransferred = function (list, day) { return (list || []).some(function (e) { return e && e.fromTrade === day; }); };
  var kbTransferTrade = function (list, day, total) {
    if (!isFinite(total) || !total) return { created: null, reason: "zero" };
    if (kbTransferred(list, day)) return { created: null, reason: "done" };
    var e = { id: uid(), date: day, type: total > 0 ? "in" : "out", scope: "biz", cat: total > 0 ? "雑収入" : "雑費", amount: Math.abs(total), memo: "トレード収支から転記（" + day + "分）", fromTrade: day };
    return { created: e, reason: "ok" };
  };
  // [hub-pure-end]
  // [tax-pure-begin] 確定申告タブの保存の形と集計（テストで切り出して検証できるよう、C（TDCore）・get・jnDayOf・jnInstAgg と定数だけに依存する形に保つ）
  var TAX = "td_tax_v1";
  // 生活カテゴリのうち、経費ガイドの対応づけで「按分すれば一部OK」に当たるもの（申告ページでは按分候補として参考表示する）
  var TAX_APP_CATS = ["通信", "光熱費", "住まい", "交通"];
  var taxNum = function (v) { return typeof v === "number" && isFinite(v) ? v : null; };
  // 保存データの形をそろえる。壊れた値・知らない項目は捨て、金額でないものは未入力（null）にする。国内分の損益・暗号資産の損益・経費の確定値は、0 と未入力を区別する
  // 繰り越し台帳の行の形をそろえる（金額が正でない行・年が読めない行は捨てる）
  var taxCarryNorm = function (list) {
    var rows = [];
    if (Array.isArray(list)) list.forEach(function (c, i) {
      if (!c || typeof c !== "object") return;
      var fy = Math.round(taxNum(c.fromYear) || 0), amt = taxNum(c.amount);
      if (!/^\d{4}$/.test(String(fy)) || amt === null || amt <= 0) return;
      rows.push({ id: typeof c.id === "string" && c.id ? c.id : "c" + fy + "-" + i, fromYear: fy, amount: amt });
    });
    return rows;
  };
  // 住宅ローン控除モジュールの設定の形をそろえる（td_tax_v1 の直下に1つだけ持つ。2a の年エントリには入れない）
  var TAX_HOME_CATS = [["certified", "認定長期優良住宅・低炭素住宅（新築）"], ["zeh", "ZEH水準省エネ住宅（新築）"], ["energy", "省エネ基準適合住宅（新築）"], ["other-new", "その他の住宅（新築）"], ["certified-used", "認定長期優良住宅等（中古）"], ["zeh-used", "ZEH水準省エネ住宅（中古）"], ["energy-used", "省エネ基準適合住宅（中古）"], ["other-used", "その他の住宅（中古）"]];
  var taxHouseNorm = function (raw) {
    var out = { enabled: false, moveInYear: null, category: "certified", specialPerson: false, shareRatio: null, priceCap: null, balances: {}, incomeTax: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    out.enabled = raw.enabled === true;
    var my = Math.round(taxNum(raw.moveInYear) || 0);
    out.moveInYear = /^\d{4}$/.test(String(my)) ? my : null;
    out.category = TAX_HOME_CATS.some(function (c) { return c[0] === raw.category; }) ? raw.category : "certified";
    out.specialPerson = raw.specialPerson === true;
    var sr = taxNum(raw.shareRatio);
    out.shareRatio = sr === null ? null : Math.min(100, Math.max(0, sr));
    var pc = taxNum(raw.priceCap);
    out.priceCap = pc === null || pc <= 0 ? null : pc;
    var yrMap = function (m, min) {
      var o = {};
      if (m && typeof m === "object" && !Array.isArray(m)) Object.keys(m).forEach(function (y) {
        if (!/^\d{4}$/.test(y)) return;
        var v = taxNum(m[y]);
        if (v !== null && v >= min) o[y] = v;
      });
      return o;
    };
    out.balances = yrMap(raw.balances, 1);   // 年末残高は正の数だけ（0以下は未入力扱い）
    out.incomeTax = yrMap(raw.incomeTax, 0); // その年の所得税額（任意入力。住民税側の目安に使う）
    return out;
  };
  // チェック状態の形をそろえる（true の項目だけ残す）。開業フロー・申告準備・保存アーカイブで共用する
  var taxChecksNorm = function (raw) {
    var o = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) Object.keys(raw).forEach(function (k) { if (raw[k] === true) o[k] = true; });
    return o;
  };
  // 書類の保存アーカイブの形をそろえる（年→項目ID→true）
  var taxArchiveNorm = function (raw) {
    var o = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) Object.keys(raw).forEach(function (y) {
      if (!/^\d{4}$/.test(y)) return;
      var c = taxChecksNorm(raw[y]);
      if (Object.keys(c).length) o[y] = c;
    });
    return o;
  };
  var taxNorm = function (raw) {
    var out = { years: {}, carry: [], opening: { checks: {}, memo: "" }, prep: { checks: {} }, archive: {}, housing: taxHouseNorm(null) };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    var ys = raw.years && typeof raw.years === "object" && !Array.isArray(raw.years) ? raw.years : {}, pool = [];
    Object.keys(ys).forEach(function (y) {
      if (!/^\d{4}$/.test(y)) return;
      var e = ys[y]; if (!e || typeof e !== "object") return;
      var sal = e.salary && typeof e.salary === "object" ? e.salary : {};
      var ap = {}, apo = e.apportion && typeof e.apportion === "object" && !Array.isArray(e.apportion) ? e.apportion : {};
      Object.keys(apo).forEach(function (cat) {
        var a = apo[cat]; if (!a || typeof a !== "object") return;
        ap[cat] = { ratio: taxNum(a.ratio), memo: typeof a.memo === "string" ? a.memo.slice(0, 400) : "" };
      });
      pool = pool.concat(taxCarryNorm(e.carry));  // 年エントリの中に置かれた行も、年またぎの台帳（直下）へ寄せる
      var m5 = {}, m5o = e.mt5Months && typeof e.mt5Months === "object" && !Array.isArray(e.mt5Months) ? e.mt5Months : {};
      Object.keys(m5o).forEach(function (mk) {
        if (!/^(1[0-2]|[1-9])$/.test(mk)) return;
        var mv = taxNum(m5o[mk]);
        if (mv !== null) m5[mk] = mv;
      });
      out.years[y] = {
        salary: { gross: taxNum(sal.gross), afterDeduction: taxNum(sal.afterDeduction), deductionsTotal: taxNum(sal.deductionsTotal), withheld: taxNum(sal.withheld) },
        domesticFuturesPnl: taxNum(e.domesticFuturesPnl),
        expensesFinal: taxNum(e.expensesFinal),
        apportion: ap,
        cryptoPnl: taxNum(e.cryptoPnl),
        mt5Annual: taxNum(e.mt5Annual),
        mt5Months: m5
      };
    });
    var seen = {};
    out.carry = taxCarryNorm(raw.carry).concat(pool).filter(function (c) { if (seen[c.id]) return false; seen[c.id] = 1; return true; });
    if (raw.opening && typeof raw.opening === "object" && !Array.isArray(raw.opening)) {
      out.opening.checks = taxChecksNorm(raw.opening.checks);
      out.opening.memo = typeof raw.opening.memo === "string" ? raw.opening.memo.slice(0, 4000) : "";
    }
    if (raw.prep && typeof raw.prep === "object" && !Array.isArray(raw.prep)) out.prep.checks = taxChecksNorm(raw.prep.checks);
    out.archive = taxArchiveNorm(raw.archive);
    out.housing = taxHouseNorm(raw.housing);
    return out;
  };
  function taxData() { return taxNorm(get(TAX, null)); }
  // その年の入力（なければ空の形）。呼び出し側は返すオブジェクトを書き換えてから、年キーに入れて保存する
  var taxYearEntry = function (data, year) {
    return (data.years[String(year)]) || { salary: { gross: null, afterDeduction: null, deductionsTotal: null, withheld: null }, domesticFuturesPnl: null, expensesFinal: null, apportion: {}, cryptoPnl: null, mt5Annual: null, mt5Months: {} };
  };
  // 画面に出せる年の候補：日次入力・日誌・申告ページの入力がある年＋今年（新しい順）
  var taxYears = function (rows, daily, data, now) {
    var set = {};
    Object.keys(daily || {}).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(k)) set[k.slice(0, 4)] = 1; });
    (rows || []).forEach(function (r) { var d = r && (r.day || ""); if (/^\d{4}/.test(d)) set[d.slice(0, 4)] = 1; });
    Object.keys((data && data.years) || {}).forEach(function (y) { set[y] = 1; });
    set[C.dayKey(now).slice(0, 4)] = 1;
    return Object.keys(set).sort().reverse();
  };
  // トレード損益の年集計。正本は C.dailyBook（日次入力を優先し、日誌分は二重に加えない）。月別は periodSummary を月ごとに切り、銘柄別は日誌ベースの参考値
  var taxTradeYear = function (rows, daily, year) {
    var y = String(year), book = C.dailyBook(rows, daily) || {};
    var total = C.periodSummary(book, y + "-01-01", y + "-12-31"), months = [], z = function (x) { return String(x).padStart(2, "0"); };
    for (var m = 1; m <= 12; m++) {
      var last = new Date(Date.UTC(+y, m, 0)).getUTCDate();
      var s = C.periodSummary(book, y + "-" + z(m) + "-01", y + "-" + z(m) + "-" + z(last));
      months.push({ month: m, pnl: s.days ? s.pnl : null, days: s.days, win: s.win, loss: s.loss });
    }
    var recs = (rows || []).filter(function (r) { return r && r.kind !== "skip" && jnDayOf(r).slice(0, 4) === y; });
    return { total: total, months: months, insts: jnInstAgg(recs), hasTrades: recs.length > 0 };
  };
  // 海外／国内の切り分け：海外分 ＝ 正本の年合計 − 国内分（転記入力）。国内分が未入力なら切り分けは出さない
  var taxSplit = function (yearTotal, domestic) {
    if (domestic === null || domestic === undefined || !isFinite(domestic)) return { known: false, domestic: null, overseas: null };
    return { known: true, domestic: +domestic, overseas: yearTotal - domestic };
  };
  // 経費の候補（確定ではない）：家計簿の事業分の支出の科目別合計（転記した記録＝損益そのものは除く）と、生活分の按分候補カテゴリの合計
  var taxExpenseCandidates = function (entries, year) {
    var y = String(year), biz = {}, bizTotal = 0, life = {}, lifeTotal = 0;
    (entries || []).forEach(function (e) {
      if (!e || e.type !== "out" || String(e.date || "").slice(0, 4) !== y || !isFinite(e.amount)) return;
      if (e.scope === "biz") { if (e.fromTrade) return; biz[e.cat] = (biz[e.cat] || 0) + e.amount; bizTotal += e.amount; }
      else if (TAX_APP_CATS.indexOf(e.cat) >= 0) { life[e.cat] = (life[e.cat] || 0) + e.amount; lifeTotal += e.amount; }
    });
    var rowsOf = function (m) { return Object.keys(m).map(function (k) { return { cat: k, sum: m[k] }; }).sort(function (a, b) { return b.sum - a.sum; }); };
    return { bizRows: rowsOf(biz), bizTotal: bizTotal, lifeRows: rowsOf(life), lifeTotal: lifeTotal };
  };
  // 合算イメージ：給与所得（控除後）＋トレード雑所得（海外分 − 経費の確定値。雑所得の金額は0を下限にする）＋暗号資産（雑所得・0を下限）＋事業所得の目安（家計簿の差額。マイナスはそのまま通算の考え方に寄せる）。税額の計算はしない
  var taxCombine = function (p) {
    var tradeMisc = p.overseas === null || p.overseas === undefined ? null : Math.max(0, p.overseas - (p.expensesFinal || 0));
    var cryptoMisc = p.cryptoPnl === null || p.cryptoPnl === undefined ? null : Math.max(0, p.cryptoPnl);
    var nonSalary = (tradeMisc || 0) + (cryptoMisc || 0) + (p.bizBal === null || p.bizBal === undefined ? 0 : p.bizBal);
    var total = p.salaryAfter === null || p.salaryAfter === undefined ? null : p.salaryAfter + nonSalary;
    return { tradeMisc: tradeMisc, cryptoMisc: cryptoMisc, nonSalary: nonSalary, total: total };
  };
  // 申告要否の目安（一般論との機械的な照らし合わせだけ。「要る／要らない」とは表示しない）
  var taxFilingHint = function (nonSalary) {
    if (nonSalary === null || nonSalary === undefined || !isFinite(nonSalary)) return { level: "unknown" };
    return nonSalary > 200000 ? { level: "over" } : { level: "within" };
  };
  // 損失の繰越の台帳（国内分＝先物取引に係る雑所得等のみ）：発生年の翌年から3年、同じ区分の利益から差し引ける。各行に、表示中の年での状態を付ける
  var taxCarryRows = function (carry, year) {
    var y = +year;
    return (carry || []).map(function (c) {
      var last = c.fromYear + 3;
      return { id: c.id, fromYear: c.fromYear, amount: c.amount, lastYear: last, usable: y > c.fromYear && y <= last, expired: y > last, remaining: Math.max(0, last - y) };
    }).sort(function (a, b) { return a.fromYear - b.fromYear; });
  };
  /* ---------- フェーズ2b：住宅ローン控除・経費ガイド・ふるさと納税・着地見込み ---------- */
  // 住宅ローン控除の借入限度額と控除期間。入居年で表が切り替わる
  // 2026・2027年入居（令和8・9年）：国税庁 No.1211-1（新築等）・No.1211-3（中古）で照合済み。special は特例対象個人（子育て世帯等）の上乗せ後の限度額
  // 2028〜2030年入居（令和10〜12年）：認定・ZEH・中古は令和8・9年と同じ表が続く。新築の省エネ基準適合は原則対象外（令和9年末までの建築確認等の例外は 2,000万円・10年。ここでは対象外として扱い、画面に注記する）
  // 2025年以前の入居：家計簿側の KB_HOME_LIMITS（令和6・7年入居の表）と整合する値。特例対象個人の上乗せは反映しない（照合済みの令和8年分からの扱い）
  var taxHomeTable = function (moveInYear, category, special) {
    if (moveInYear >= 2026) {
      var t8 = {
        "certified": { limit: special ? 50000000 : 45000000, years: 13 }, "zeh": { limit: special ? 45000000 : 35000000, years: 13 },
        "energy": moveInYear >= 2028 ? { limit: 0, years: 0 } : { limit: special ? 30000000 : 20000000, years: 13 },
        "other-new": { limit: 0, years: 0 },
        "certified-used": { limit: special ? 45000000 : 35000000, years: 13 }, "zeh-used": { limit: special ? 45000000 : 35000000, years: 13 },
        "energy-used": { limit: special ? 30000000 : 20000000, years: 13 }, "other-used": { limit: 20000000, years: 10 }
      };
      var r = t8[category] || t8.certified;
      return { limit: r.limit, years: r.years, basis: "r8" };
    }
    var tk = {
      "certified": { limit: 45000000, years: 13 }, "zeh": { limit: 35000000, years: 13 }, "energy": { limit: 30000000, years: 13 },
      "other-new": { limit: 20000000, years: 10 }, "certified-used": { limit: 30000000, years: 10 }, "zeh-used": { limit: 30000000, years: 10 },
      "energy-used": { limit: 30000000, years: 10 }, "other-used": { limit: 20000000, years: 10 }
    };
    var k = tk[category] || tk.certified;
    return { limit: k.limit, years: k.years, basis: "kb" };
  };
  // 住宅ローン控除の目安：控除額 ＝ min（年末残高×負担割合, 取得対価（任意）, 借入限度額）× 0.7%（100円未満切り捨て）。家計簿の kbHomeCredit と同じ式
  var taxHomeCredit = function (housing, year) {
    if (!housing || !housing.enabled) return { state: "off" };
    if (!housing.moveInYear) return { state: "unset" };
    var t = taxHomeTable(housing.moveInYear, housing.category, housing.specialPerson), nth = year - housing.moveInYear + 1;
    if (nth < 1) return { state: "before", nth: nth, table: t };
    if (!t.years) return { state: "na", nth: nth, table: t };
    if (nth > t.years) return { state: "over", nth: nth, years: t.years, table: t };
    var bal = taxNum((housing.balances || {})[String(year)]);
    if (bal === null) return { state: "nobalance", nth: nth, years: t.years, limit: t.limit, table: t };
    var shared = Math.round(bal * (housing.shareRatio == null ? 100 : housing.shareRatio) / 100);
    var base = Math.min(shared, t.limit);
    if (housing.priceCap) base = Math.min(base, housing.priceCap);
    return { state: "ok", nth: nth, years: t.years, limit: t.limit, balance: bal, shared: shared, base: base, credit: Math.floor(base * 0.007 / 100) * 100, table: t };
  };
  // 所得税から引ききれなかった分の、住民税側の控除の目安：引ききれない額と「課税総所得金額等 × 5%（最高97,500円）」の小さい方（令和7年12月31日までの入居分で確認できた仕組み）
  var taxHomeOverflow = function (credit, incomeTax, totalIncome) {
    if (incomeTax === null || incomeTax === undefined || !isFinite(incomeTax)) return null;
    var excess = Math.max(0, (credit || 0) - incomeTax);
    return { excess: excess, residentEst: Math.min(excess, Math.floor((totalIncome || 0) * 0.05), 97500) };
  };
  // 経費ガイドの判定表（26費目）。grade: A＝全額OK（直接経費）／B＝按分すれば一部OK／C＝経費にできない。根拠は国税庁 No.2210 と所得税法施行令138条・139条
  var TAX_GUIDE = [
    { name: "取引・口座の手数料", grade: "A", why: "収入を得るために直接要した費用です。なお、スプレッド（買う値段と売る値段の差）は損益の中に含まれているので、二重に経費にはしません", proof: "業者の取引報告書・年間損益報告書" },
    { name: "チャート・分析ツールの利用料（TradingViewなど）", grade: "A", why: "トレードの判断に直接使う道具の費用です（業務専用の場合）", proof: "領収書・カード明細、契約画面の写し" },
    { name: "相場情報・ニュース配信サービスの料金", grade: "A", why: "トレードの判断に直接使う情報の費用です", proof: "領収書・カード明細" },
    { name: "トレード専用のVPS（ブイピーエス）・サーバー代", grade: "A", why: "常時接続など、業務専用に使っている場合の費用です", proof: "領収書・利用明細" },
    { name: "トレードの専門書籍・雑誌・有料記事", grade: "A", why: "業務の知識を得るために直接関係するものです", proof: "領収書・購入履歴、書名が分かるもの" },
    { name: "トレードのセミナー・講座の受講料", grade: "A", why: "今やっている業務（トレード）に直接関係する内容の場合です", proof: "受講案内（内容が分かるもの）、領収書" },
    { name: "会計・申告用のソフト・アプリ代", grade: "A", why: "記録と申告の準備に直接使うものです", proof: "領収書・カード明細" },
    { name: "業務専用の作業場所代（コワーキングなど）", grade: "A", why: "自宅と切り分けて、業務専用に使う場所の費用です", proof: "契約書・領収書" },
    { name: "パソコン本体", grade: "B", why: "家事関連費（かじかんれんひ：家と仕事の両方にかかる費用）として、仕事に使う割合（使用時間など、筋の通る基準）で分けます。金額によって扱いが変わります（下の「機器の金額で扱いが変わります」も見てください）", proof: "領収書、按分の基準を書いたメモ" },
    { name: "モニター・周辺機器", grade: "B", why: "仕事専用のモニターは全額に近い扱いですが、兼用なら使う割合で分けます", proof: "領収書、按分メモ" },
    { name: "スマホ・タブレット本体", grade: "B", why: "私的な利用と兼用が前提です。使う割合で分けます", proof: "領収書、按分メモ" },
    { name: "インターネット回線代", grade: "B", why: "使う時間や用途の割合で分けます", proof: "請求書・明細、按分メモ" },
    { name: "スマホの通信料", grade: "B", why: "使う時間や用途の割合で分けます", proof: "請求書・明細、按分メモ" },
    { name: "自宅の家賃（作業スペース分）", grade: "B", why: "床面積の割合（作業スペース ÷ 家全体）で分けるのが一般的な考え方です。持ち家の場合は家賃ではないので、扱いが別になります（一般論）", proof: "賃貸契約書、間取りと面積のメモ、支払い明細" },
    { name: "電気代", grade: "B", why: "面積の割合 × 使う時間など、筋の通る基準で分けます", proof: "請求書、按分メモ" },
    { name: "車両関係（ガソリン代・駐車場・車検など）", grade: "B", why: "仕事で走った分だけが対象です。走行記録で分けます", proof: "走行記録（日時・行き先・距離）、領収書" },
    { name: "セミナー参加のための交通費", grade: "B", why: "セミナー自体が業務に関係するものなら、その参加に要る交通費は直接経費に近い扱いです。私的な寄り道の分は除きます", proof: "セミナーの案内、交通費の領収書・履歴" },
    { name: "セミナー・勉強会に付随する飲食・懇親会費", grade: "B", why: "仕事上の付き合いと言える範囲に限ります。私的な飲食は対象外です。判断が割れる代表例なので、個別に確認してください", proof: "店名・参加者・目的を書いたメモ、領収書" },
    { name: "普段の食費", grade: "C", why: "生活のための費用（家事費）そのものです" },
    { name: "被服費（服の費用）", grade: "C", why: "生活のための費用（家事費）そのものです" },
    { name: "生活の日用品そのもの", grade: "C", why: "生活のための費用です。仕事専用の消耗品は、切り分けて別の費目（消耗品費）にします" },
    { name: "所得税・住民税", grade: "C", why: "国税庁の案内で、経費にならないと明示されています。なお事業税は逆に、全額が経費になります" },
    { name: "延滞税・延滞金・加算税・罰金・科料・過料", grade: "C", why: "罰金などは経費にならないと明示されています。税金の延滞分も、経費にしないのが一般のルールです" },
    { name: "私的な交際費・贈答", grade: "C", why: "仕事との関係を説明できないものは対象になりません" },
    { name: "私的な保険料（生命保険など）", grade: "C", why: "経費ではなく、所得控除（しょとくこうじょ）の話として別に扱います" },
    { name: "生計を一にする家族への給与・地代家賃", grade: "C", why: "原則として経費になりません（事業所得の青色事業専従者給与は例外ですが、雑所得にはその仕組みがありません）" }
  ];
  // 家計簿カテゴリと判定表の対応づけ（生活）。label は判定の目安
  var TAX_CAT_MAP_LIFE = [["食費", "C", "経費にできません"], ["住まい", "B", "家賃の作業スペース分など、面積の割合で按分"], ["光熱費", "B", "電気代など、面積×時間などで按分"], ["通信", "B", "使う割合で按分。仕事専用の回線は A に近い扱い"], ["交通", "B", "仕事の行き先の分だけ"], ["医療", "控除", "経費ではなく、医療費控除の対象（家計簿の「申告用」で計算）"], ["娯楽", "C", "原則、経費にできません"], ["日用品", "C", "生活分は不可。仕事専用の消耗品は事業分の消耗品費へ"], ["その他", "参照", "費目ごとに判定表で確かめてください"]];
  // 家計簿カテゴリと判定表の対応づけ（事業の18科目）
  var TAX_CAT_MAP_BIZ = [["通信費", "A/B", "ツール代は A、回線代は按分で B"], ["消耗品費", "A", "少額の機器・仕事専用の消耗品"], ["減価償却費", "分岐", "機器の金額で扱いが変わります。計算は家計簿の資産管理が担当"], ["旅費交通費", "B", "セミナー交通費・仕事の移動"], ["接待交際費", "B", "飲食・懇親会。条件つき"], ["地代家賃", "B", "家賃の按分"], ["水道光熱費", "B", "電気代の按分"], ["租税公課", "注意", "事業税は A（全額OK）。所得税・住民税は C（不可）"], ["広告宣伝費", "A寄り", "仕事の宣伝に直接関係するもの"], ["損害保険料", "条件つき", "仕事用の保険は対象になり得ます。私的な保険は C"], ["利子割引料", "自動計算", "借入の利息。家計簿の借入・資産の自動計算が担当"], ["仕入", "参考", "事業所得の科目。トレードの雑所得では出番は少ないです"], ["給料賃金", "参考", "事業所得の科目。同上"], ["外注工賃", "参考", "事業所得の科目。同上"], ["修繕費", "参考", "事業所得の科目。同上"], ["福利厚生費", "参考", "事業所得の科目。同上"], ["雑費", "参考", "事業所得の科目。同上"], ["その他事業費", "参考", "事業所得の科目。同上"]];
  // 按分後の金額の目安（候補の合計 × 仕事の割合）。割合が未入力なら null
  var taxApportionEst = function (sum, ratio) {
    if (ratio === null || ratio === undefined || !isFinite(ratio) || !isFinite(sum)) return null;
    return Math.round(sum * ratio / 100);
  };
  // 所得税の速算表（国税庁 No.2260。課税される所得金額は1,000円未満を切り捨ててから当てる）
  var TAX_BRACKETS = [[1949000, 0.05, 0], [3299000, 0.10, 97500], [6949000, 0.20, 427500], [8999000, 0.23, 636000], [17999000, 0.33, 1536000], [39999000, 0.40, 2796000], [Infinity, 0.45, 4796000]];
  var taxQuick = function (taxable) {
    if (taxable === null || taxable === undefined || !isFinite(taxable) || taxable <= 0) return { tax: 0, rate: 0 };
    var t = Math.floor(taxable / 1000) * 1000, b = TAX_BRACKETS[TAX_BRACKETS.length - 1];
    for (var i = 0; i < TAX_BRACKETS.length; i++) { if (t <= TAX_BRACKETS[i][0]) { b = TAX_BRACKETS[i]; break; } }
    return { tax: Math.max(0, Math.floor(t * b[1] - b[2])), rate: b[1] };
  };
  // 年末の着地見込み（概算）：総合課税分は速算表、国内分（先物取引に係る雑所得等）は分離課税（所得税15%・住民税5%）、復興特別所得税2.1%を所得税に上乗せ。住民税の所得割は課税所得×10%の目安（控除の金額は所得税と同じ合計で近似する）
  // 所得控除の合計額（deductionsTotal）が未入力なら計算しない（null を返す）
  var taxEstimate = function (p) {
    if (p.deductionsTotal === null || p.deductionsTotal === undefined || !isFinite(p.deductionsTotal)) return null;
    var compIncome = (p.salaryAfter || 0) + (p.tradeMisc || 0) + (p.cryptoMisc || 0) + (p.bizBal || 0);
    var taxable = Math.floor(Math.max(0, compIncome - p.deductionsTotal) / 1000) * 1000;
    var q = taxQuick(taxable);
    var domTaxable = Math.max(0, (p.domestic || 0) - (p.carryUsable || 0));
    var domTax = Math.floor(domTaxable * 0.15), baseTax = q.tax + domTax, fukko = Math.floor(baseTax * 0.021);
    var national = baseTax + fukko, creditUsed = Math.min(p.housingCredit || 0, national), nationalAfter = national - creditUsed;
    var residentComp = Math.floor(taxable * 0.10), residentDom = Math.floor(domTaxable * 0.05);
    return {
      compIncome: compIncome, totalIncome: compIncome + Math.max(0, p.domestic || 0), taxable: taxable, rate: q.rate, taxComp: q.tax,
      domTaxable: domTaxable, domTax: domTax, baseTax: baseTax, fukko: fukko, national: national,
      creditUsed: creditUsed, nationalAfter: nationalAfter,
      balance: (p.withheld === null || p.withheld === undefined) ? null : nationalAfter - p.withheld,
      residentComp: residentComp, residentDom: residentDom, resident: residentComp + residentDom, shotokuWari: residentComp + residentDom,
      salaryMissing: p.salaryAfter === null || p.salaryAfter === undefined
    };
  };
  // ふるさと納税で自己負担が2,000円で済む寄附額の上限の目安：所得割額×20% ÷（90% − 所得税率×1.021）＋2,000円（千円未満切り捨て）。総所得金額等の30%でも抑える
  var taxFurusatoLimit = function (shotokuWari, rate, totalIncome) {
    if (!(shotokuWari > 0)) return null;
    var denom = 0.9 - (rate || 0) * 1.021;
    if (denom <= 0) return null;
    var lim = Math.floor(shotokuWari * 0.2 / denom / 1000) * 1000 + 2000;
    if (totalIncome > 0) lim = Math.min(lim, Math.floor(totalIncome * 0.3));
    return lim;
  };
  // 家計簿との連動（メモの拾い上げ）：その年の支出で、メモに「ふるさと納税」「寄付」を含む記録を寄付の記録として拾う
  var taxDonationPickups = function (entries, year) {
    var y = String(year), total = 0, count = 0;
    (entries || []).forEach(function (e) {
      if (!e || e.type !== "out" || String(e.date || "").slice(0, 4) !== y || !isFinite(e.amount)) return;
      if (/ふるさと納税|寄付/.test(e.memo || "")) { total += e.amount; count++; }
    });
    return { total: total, count: count };
  };
  /* ---------- フェーズ2c：突合・青色シミュレーション・工程チェック・転記シート・ICS・アーカイブ ---------- */
  // 突合（つきあわせ）：正本（日次入力の年合計）と、業者の年間レポートの確定損益（転記）との差額。レポート値が未入力なら null
  var taxReconAnnual = function (appTotal, report) {
    if (report === null || report === undefined || !isFinite(report)) return null;
    return { app: appTotal, report: +report, diff: appTotal - report };
  };
  // 月別の突合：アプリの月別（taxTradeYear の months）と、レポートの月別値（mt5Months：{"1"〜"12"}）を並べる。レポート未入力の月は report/diff が null
  var taxReconMonths = function (months, mt5Months) {
    var mm = mt5Months || {};
    return (months || []).map(function (m) {
      var rep = taxNum(mm[String(m.month)]);
      return { month: m.month, app: m.pnl, report: rep, diff: rep === null || m.pnl === null || m.pnl === undefined ? null : m.pnl - rep };
    });
  };
  // MT5 の HTML レポートの数値の読み取り（カンマ・空白・通貨記号などを除く。読めなければ null）
  var taxMt5ParseNum = function (s) {
    if (typeof s === "number") return isFinite(s) ? s : null;
    if (s === null || s === undefined) return null;
    var t = String(s).replace(/[\s,，]/g, "").replace(/^[¥$€£]+/, "").replace(/\(/g, "-").replace(/\)/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  };
  // MT5 レポートのポジション行（抽出済みの素データ）から、年別・月別の確定損益を集める。1行の損益は 損益＋手数料＋スワップ（ネット）。決済した日で年に振り分ける
  var taxMt5Agg = function (rows) {
    var annual = {}, monthly = {}, count = 0;
    (rows || []).forEach(function (r) {
      if (!r) return;
      var d = String(r.close || ""), m = /^(\d{4})-(\d{2})/.exec(d);
      if (!m) return;
      var p = taxMt5ParseNum(r.profit), c = taxMt5ParseNum(r.commission), s = taxMt5ParseNum(r.swap);
      if (p === null) return;
      var v = p + (c || 0) + (s || 0);
      annual[m[1]] = (annual[m[1]] || 0) + v;
      var mk = m[1] + "-" + m[2];
      monthly[mk] = (monthly[mk] || 0) + v;
      count++;
    });
    Object.keys(annual).forEach(function (k) { annual[k] = Math.round(annual[k]); });
    Object.keys(monthly).forEach(function (k) { monthly[k] = Math.round(monthly[k]); });
    return { annual: annual, monthly: monthly, count: count };
  };
  // 青色申告への置き換え（機械的な計算だけ）：いま雑所得などで数えている対象額を、事業所得＋青色申告特別控除だった場合の形にする。控除はプラスの所得の範囲でだけ効く。赤字はそのまま（青色なら損益通算・繰越の対象になる、という違いは文章で示す）
  var taxBlueSim = function (base) {
    if (base === null || base === undefined || !isFinite(base)) return null;
    return [650000, 550000, 100000].map(function (ded) {
      var income = base > 0 ? Math.max(0, base - ded) : base;
      return { ded: ded, income: income, cut: base - income };
    });
  };
  // 申告準備の工程チェックの項目（対象年の翌年に期限が来る）。due は ICS にも使う
  var taxPrepItems = function (year) {
    var y = +year, n = y + 1, z = function (x) { return String(x).padStart(2, "0"); };
    var due = function (mo, d) { return n + "-" + z(mo) + "-" + z(d); };
    return [
      { id: "salary", title: "源泉徴収票を受け取る", due: due(1, 31), dueLabel: n + "年1月末まで", how: "会社から届きます。確定申告タブの「給与所得」に、票の数字（支払金額・給与所得控除後の金額・源泉徴収税額）を転記します。" },
      { id: "housing", title: "住宅ローンの年末残高証明書を確認する", due: due(1, 31), dueLabel: n + "年1月末まで", how: "住宅ローンがある人だけです。金融機関から届く証明書の残高を、上の「住宅ローン控除」に転記します。" },
      { id: "broker", title: "ブローカーの年間レポートを出す（XM・XS）", due: due(2, 15), dueLabel: n + "年2月中旬まで", how: "下の「報告書との照らし合わせ」の手順で出して、数字を転記します。年間の確定損益は、このレポートが正本です。" },
      { id: "medical", title: "医療費を集計する", due: due(2, 28), dueLabel: n + "年2月末まで", how: "家計簿の「申告用」で、その年の医療費控除の目安と明細を確認します。領収書もそろえておきます。" },
      { id: "expenses", title: "経費を確定する", due: due(2, 28), dueLabel: n + "年2月末まで", how: "上の「経費の要約」で候補と按分の割合を確認し、申告に使う「経費の確定値」を決めます。按分の根拠のメモも残します。" },
      { id: "carry", title: "繰り越しの台帳を更新する", due: due(3, 10), dueLabel: n + "年3月10日ごろまで", how: "国内分で赤字が出た年は、上の「損失の繰り越し」にその年の行を足します。繰り越しには、毎年の申告を続ける必要があります。" },
      { id: "resident", title: "住民税の徴収方法を選ぶ（申告書を出す直前）", due: due(3, 15), dueLabel: "申告書の提出まで", how: "下の「住民税の徴収方法チェック」を読み、申告書の第二表で「自分で納付」を選ぶか決めます。" },
      { id: "file", title: "確定申告書を提出する", due: due(3, 15), dueLabel: n + "年2月16日〜3月15日", how: "申告期間は原則2月16日〜3月15日です。下の「転記シート」の数字を、e-Tax（確定申告書等作成コーナー）へ転記して提出します。納付も3月15日までです。" }
    ];
  };
  // ICS（カレンダー取り込み用ファイル）の文字列を作る。events: {uid, date:"YYYY-MM-DD", summary, desc}
  var taxIcsEscape = function (s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); };
  var taxIcs = function (events, stamp) {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DeskOne//tax//JA", "CALSCALE:GREGORIAN"];
    (events || []).forEach(function (e) {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return;
      lines.push("BEGIN:VEVENT", "UID:" + (e.uid || "") + "@deskone", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + e.date.replace(/-/g, ""), "SUMMARY:" + taxIcsEscape(e.summary), "DESCRIPTION:" + taxIcsEscape(e.desc || ""), "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  };
  // e-Tax転記シート（申告書のマス目対応も兼ねる）。c は集計・入力済みの値のまとまり。金額が無い行（amount が null）は「—」で出す
  // 欄の番号は令和7年分（2025年分）の申告書の手引きで確認した所得金額等・所得控除・税金の計算の番号。収入金額等は欄の名前で示す
  var taxSheetRows = function (c) {
    var rows = [], push = function (form, cell, item, amount, src, note) { rows.push({ form: form, cell: cell, item: item, amount: amount === undefined ? null : amount, src: src, note: note || "" }); };
    push("第一表", "収入金額等「給与」／所得金額等 6「給与」", "給与の収入金額・所得金額", c.salaryGross, "源泉徴収票（入力値）", "証明になるのは源泉徴収票そのものです。所得金額は「給与所得控除後の金額」");
    push("第一表", "収入金額等「業務に係る雑」・「その他の雑」／所得金額等 8・9", "トレードの収入（海外分・確定損益のプラス分）", c.overseasIncome, "トレード収支の日次入力−国内分", "海外の業者の分。収入と必要経費は分けて転記します");
    push("第一表", "同上（必要経費）", "トレードの必要経費（海外分）", c.expensesFinal, "入力値（経費の確定値）", "按分の根拠のメモも手元に残します");
    push("第一表", "所得金額等 9「その他」", "暗号資産の雑所得（プラスの場合）", c.cryptoMisc, "入力値（暗号資産の損益メモ）", "赤字の場合は0として扱い、他の所得とは通算しません");
    push("第一表", "収入金額等「営業等」ほか／所得金額等 1", "事業所得（事業分を使う人）", c.bizBal, "家計簿の事業分", "くわしい科目は家計簿の事業収支CSVと併用します");
    push("第一表", "所得金額等 12「合計」", "所得金額の合計（イメージ）", c.totalIncome, "このページの合算", "目安です。作成コーナーが自動で計算します");
    push("第三表（分離課税用）", "「先物取引に係る雑所得等」の収入・所得", "国内分の年間損益（プラスの場合）", c.domesticPlus, "入力値（国内分の年間損益）", "マイナスの場合は、この欄には入れず、繰り越しの手続きをします");
    push("第三表（分離課税用）", "「先物取引に係る雑所得等」の繰越損失", "繰り越しで使う赤字の額", c.carryUsable, "繰り越し台帳", "この年に使える分（発生年の翌年から3年）");
    push("第二表", "「所得の内訳」", "給与の源泉徴収税額", c.withheld, "源泉徴収票（入力値）", "第一表の「源泉徴収税額」（49）にもつながります");
    push("第一表", "税金の計算 35「（特定増改築等）住宅借入金等特別控除」", "住宅ローン控除の控除額", c.housingCredit, "このページの計算（明細書の結果）", "初年度は「住宅借入金等特別控除額の計算明細書」の作成が前提です");
    push("第二表", "「所得から差し引かれる金額に関する事項」", "医療費控除の金額", c.medicalEst, "家計簿の「申告用」", "明細は家計簿の医療明細CSVを併用します");
    push("第一表", "所得金額等 29「寄附金控除」・第二表「寄附金控除に関する事項」", "ふるさと納税などの寄附金控除", c.donation, "家計簿のメモからの拾い上げ", "受領証（寄附金受領証明書）が証明になります");
    push("第一表", "税金の計算 50「申告納税額」", "追加で納める／戻ってくる額（概算）", c.balanceAbs, "このページの着地見込み", (c.balanceLabel || "概算") + "。最終の金額は作成コーナーで決まります");
    return rows;
  };
  // 書類の保存アーカイブの項目（年ごとに「そろえたか」を記録する）
  var TAX_ARCHIVE_ITEMS = [
    { id: "receipts", name: "領収書・レシート（経費の証拠）", keep: "事業・業務の分は原則7年（白色は書類5年）。雑所得の業務で前々年の収入金額が300万円を超える人は5年の保存が必要です" },
    { id: "reports", name: "ブローカーの年間レポート（XM・XS）", keep: "申告の正本になる数字のもと。帳簿に準じて7年を目安に" },
    { id: "salary", name: "源泉徴収票", keep: "申告の控えと一緒に保管。期間は申告書の控えに合わせて7年を目安に" },
    { id: "housing", name: "住宅ローンの年末残高証明書", keep: "控除を受ける年ごとに必要。控除期間が終わるまで＋7年を目安に" },
    { id: "medical", name: "医療費の領収書・明細", keep: "医療費控除の領収書は、申告期限から5年間の提示・提出を求められることがあります" },
    { id: "books", name: "帳簿・記録（日誌・家計簿・申告書の控え）", keep: "青色の帳簿・決算関係書類は7年、白色の法定帳簿は7年・その他の書類は5年（申告期限の翌日から数えます）" }
  ];
  // [tax-pure-end]
  var HELP = {
    money: ["口座の条件と損切り価格を入れると、許容損失に収まる数量が出ます。足りない項目があると数量は出しません。", "money"],
    check: ["入る前に7つの項目を確かめて「記録する」。次の重要指標と今日の損失も自動で表示します。"],
    journal: ["取引のあとに、まずは4項目だけで1件。くわしくは「詳しく書く」から。取引しなかった日は「見送り」も残せます。"],
    pnl: ["日ごとの確定損益と入出金をカレンダーで見て、週・月・年でまとめます。「今日のトレード収支を入れる」で1日分をまとめて入れられます。"],
    kakeibo: ["給料や食費など、家の収入と支出を月ごとに記録します。生活と事業を分けて記録でき、過去の日付でも入れられます。トレード収支とは別に、この端末の中だけに保存します。「申告用」では医療費控除・事業の収支・年間の収支まとめの目安とCSVの書き出し、借入の返済内訳と住宅ローン控除の目安、減価償却の計算もできます。"],
    tax: ["トレードの損益・給与・経費を年単位で整理し、確定申告（かくていしんこく）の形に近づける画面です。金額はすべて、この端末の記録からの目安で、個別の税務判断はしません。"],
    signals: ["ダッシュボードの判定（買い候補・売り候補・見送り）と、その時点の根拠の記録です。売買の指示ではありません。"],
    hours: ["東京・ロンドン・ニューヨークの時間と、銘柄ごとの取引時間（目安）を日本時間で表示します。"],
    status: ["価格・ローソク足・自動分析が、いつ・どこから届いたかを確かめる画面です。数字がおかしいと思ったらまずここ。"],
    settings: ["省電力、通知の注意点、バックアップ（書き出し・読み込み）、初期化です。"]
  };
  var GUIDE = [
    ["money", "資金管理（ポジションサイズ・リスクリワード・損失上限）", "損切りしても許容内に収まる数量を計算する道具です。取引に入る前に開きます。", [
      "「銘柄」と「口座通貨」を選び、「銘柄の一般的な値を入れる」を押す（契約サイズ・刻み・最小数量が入ります）。",
      "入った値が自分の口座の条件と同じか確かめ、違えば直す（業者・口座で違います）。",
      "口座残高と許容リスク（％）、または許容損失額を入れる。",
      "エントリー価格と損切り価格を入れると、数量（lot）と、損切りでの損失・取引金額が出ます。",
      "円口座でゴールドやBTCを計算するときは換算レート（1ドル＝何円）が必要です。「デスクのドル円を換算レートに使う」で参考値を入れられます。"],
      "数量は刻みで切り下げます。最小数量に届かないときは「見送り」と表示します（切り上げると許容損失を超えるため）。リスクリワードは向き・エントリー・損切り・利確を入れ、コストを入れると「コスト込み」も出ます。1日の損失上限を入れると、日誌の今日の損益と比べて注意を出します。",
      "例：口座残高10万円、許容リスク1％なら、1回の取引で失ってよいのは1,000円まで。ドル円で損切り幅が20pips（0.20円）のとき、数量は 1,000円 ÷ 0.20円 ＝ 5,000通貨（1lot＝10万通貨の口座なら0.05lot）になります。",
      "これは計算の仕組みを示す例です。どのくらいリスクを取るかの判断は、ご自身の計画に合わせてください。"],
    ["check", "取引前チェック", "入る前の最終確認です。7つの項目を確かめて記録します。", [
      "銘柄と向きを選ぶ。上の枠に、次の重要指標までの時間・その銘柄のデータの鮮度・今日の損失が出ます。",
      "7つの項目を確かめてチェックを入れる。",
      "取引の理由を一文で書き、「記録する」。",
      "そのまま取引した場合は「記録して日誌を書く」で、日誌に銘柄・向き・理由が入った状態で移れます。"],
      "枠が赤いとき（損失上限に達した・データが古い）は、入る前に理由を確かめてください。チェックがそろっても利益を保証するものではありません。"],
    ["journal", "トレード日誌", "取引の理由・結果・反省を残す場所です。取引が終わったら開きます。", [
      "銘柄・向き・確定損益（手数料込み）・ルールを守れたかを入れて「記録する」（これだけでも1件になります）。",
      "くわしく残すときは「詳しく書く」を開き、日時・価格・数量・理由・結果・反省を書く。価格は「今のデスク価格を入れる」でも入れられます。",
      "取引しなかった日は「見送りを記録」で1件残せます（成績のまとめには入りません）。",
      "下の「その日の記録と数字」では、日を選ぶとその日の日誌・トレード収支・家計簿の事業分が並びます。「トレード収支を事業へ転記」は手で押したときだけ働く機能で、その日の損益を家計簿の事業分へ1日につき1件だけ写します。あとからトレードの記録を消しても、転記した家計簿の記録は消えません。要らなければ家計簿で削除してください。",
      "下の一覧の「編集」で直せます。「削除」は元に戻せません。",
      "「CSVに書き出す」で表計算ソフトに、「CSVを読み込む」で別の端末から取り込めます（同じ記録は二重に入りません）。"],
      "成績のまとめは日誌に入れた実際の取引だけで計算します（見送りは含みません）。20件未満の区分は勝ちの割合を出しません。連続記録とカレンダーには見送りも数えます。"],
    ["pnl", "トレード収支（カレンダーと集計）", "日ごとの確定損益と入金・出金を見る場所です。", [
      "「今日のトレード収支を入れる」で、日付・確定損益・入金・出金を入れて保存します（空欄でも保存できます。あとから同じ日付で直せます）。",
      "カレンダーには、日ごとの確定損益（＋は緑、−は赤）と、入金・出金が出ます。日をタップすると、その日の内訳と記録の編集へ進めます。",
      "上には月の合計・入金・出金・勝ち日と負け日・損益の積み上がり。下の「期間のまとめ」で週・月・年を切り替えられます（週は月曜はじまり）。"],
      "その日の損益は、日次入力に確定損益があればそれを使い、日誌の取引ごとの損益とは足しません。日次入力がない日は、日誌の取引ごとの損益の合計です。入金・出金は日次入力だけから数えます。"],
    ["kakeibo", "家計簿", "家の収入と支出を月ごとに記録する場所です。トレード収支とは別の、暮らしのお金の記録です。生活のお金と事業のお金を分けて記録でき、確定申告の準備にも使えます。", [
      "日付・収入か支出か・生活か事業か・カテゴリ・金額を入れて「追加する」（メモは任意）。日付は過去の日も選べて、保存するとその月の画面に移ります。続けて入れるときは、前回と同じ日付が残ります（「今日」ボタンで今日に戻せます）。",
      "上の合計で、その月の収入・支出・差額が見られます。事業分がある月は「うち事業分」も出ます。前月・次月で月を切り替えます。",
      "下の一覧で記録をタップすると直せます。事業の記録には「事業」の札が付きます。「削除」は元に戻せません。",
      "支出でカテゴリ「医療」（生活）を選ぶと、受けた人・支払先（病院や薬局）・医療費の区分・補填される金額（保険などで戻る分）も入れられます。",
      "上の「申告用」に切り替えると、選んだ年の医療費控除の目安と明細、年間の収支まとめが見られます。どちらもCSVで書き出せます。",
      "「申告用」の事業の収支では、事業の記録が収支内訳表の科目の並びでまとまります。減価償却費と利子割引料は、下の資産・借入から自動計算した分が入ります（手入力と重ねないでください）。差額は事業所得の目安です。",
      "「借入と返済の内訳」に借入を登録すると、元利均等返済として年ごとの元本・利息・年末残高が出ます。住宅の借入では、住宅ローン控除の控除額の目安と、申請の仕方（1年目は確定申告、2年目以降は年末調整）も見られます。",
      "「減価償却の資産」に備品や建物を登録すると、定額法でその年の償却費を計算し、事業に使う割合分を事業の収支へ入れます。耐用年数は目安からも選べます。"],
      "カテゴリ別の合計は、表示している月の記録だけを集計します。ほかの月の記録は消えずに残ります。医療費控除・住宅ローン控除・事業所得の金額はすべて目安です。個別の税務判断は税務署・税理士に確認してください。医療費控除はセルフメディケーション税制と併用できません。領収書を保管し、最終的な計算と申告はe-Taxや税務署で確かめてください。住宅ローン控除の目安は令和6・7年入居の制度（国税庁）で計算しています。入居年は返済を始めた年で代用しているため、実際の入居年と違うときは目安も変わります。"],
    ["tax", "確定申告（整理）", "トレードの損益と給与・経費を年単位で整理し、確定申告（かくていしんこく）の準備をする画面です。計算と整理のための道具で、個別の税務判断はしません。", [
      "上の年を選ぶと、その年のトレードの損益（トレード収支の日次入力が正本）が、年合計と月別に出ます。銘柄別の内訳は日誌からの参考値です。",
      "国内の業者で取引した分がある人は、「国内分の年間損益」に、その年の合計を業者の報告書から転記して入れる。海外分は年合計から差し引いて出します（海外と国内は、片方の利益と片方の損失を差し引く「通算（つうさん）」ができません）。",
      "給与は、源泉徴収票（げんせんちょうしゅうひょう）の数字（支払金額・給与所得控除後の金額・源泉徴収税額）を転記します。",
      "経費は、家計簿の記録から候補を拾って表示します。候補は確定ではないので、申告に使う金額は「経費の確定値」に自分で入れてください。",
      "国内分で赤字が出た年は、「損失の繰越（そんしつのくりこし）」に行を足しておくと、翌年からの繰り越しの残り年数が出ます。",
      "暗号資産（あんごうしさん）の損益は、FXとは計算が別のため、専用のメモ欄に入れます（雑所得（ざっしょとく）の内訳として、合算イメージには入ります）。"],
      "表示される金額は、この端末に記録された数字からの目安です。業者の年間損益報告書の数字と照らし合わせてください。医療費控除（いりょうひこうじょ）の目安は家計簿の「申告用」で見られます。最終的な判断は税務署・税理士に確認してください。"],
    ["signals", "シグナル履歴", "アプリの判定がいつ・なぜ出たかの記録です。判定を振り返るときに開きます。", [
      "「いまの判定」で、各銘柄が買い候補・売り候補・見送りのどれかと、その理由が分かります。",
      "履歴の行をタップすると、成立した条件・足りなかった条件・判定時の価格と時刻・有効期限・取り消しになった理由が見られます。",
      "「CSVに書き出す」で全イベントを保存できます。"],
      "判定は形成中の1時間足を使った暫定判定で、その足が終わると期限切れになります。同じ判定は30分以内に重ねて鳴らしません。デスクを開いている間に届いた分だけ記録されます。"],
    ["hours", "市場時間", "いま、どの市場が開いているか、取引できる時間かを確認します。", [
      "3つの市場の今日の時間（日本時間）と、開いているか・重なっているかを見る。",
      "下の表で、銘柄ごとに今が取引時間内か・休場か・休止中かを見る。"],
      "夏時間は自動で計算します。祝日・短縮取引は含めていないので、平日の「取引時間内」は目安です。"],
    ["status", "データ状態", "価格や分析が新しいか、どこから届いたかの点検です。数字がおかしいと思ったら、まずここを開きます。", [
      "上の表で、表示中の3銘柄の価格の時刻・提供元・価格の種類・ローソク足と自動分析の時刻を確かめる。",
      "「データの取得元」で、どのデータがいつ最後に届いたか、失敗していればその理由を見る。",
      "古いものがあれば、下の「再読み込み」ボタンでそのデータだけ取り直せます。"],
      "価格カードの札をタップしてもこの画面が開きます。"],
    ["settings", "設定・バックアップ", "省電力・バックアップ・初期化です。端末を替えるときは、先にここで書き出します。", [
      "iPadが熱いとき・電池を持たせたいときは「省電力モード」をオン。",
      "端末を替える前やブラウザのデータを消す前に「すべて書き出す（JSON）」。新しい端末では「読み込む」。",
      "表示だけ・通知だけ・資金管理と日誌だけ、など分けて初期化できます（元に戻せません）。"],
      "データはこの端末のブラウザの中だけに保存しています。音や通知は、このページを開いている間だけ届きます。"]
  ];
  // English words and abbreviations that appear in the tools: [word, reading, meaning]
  var WORDS = [
    ["銘柄・通貨", [
      ["GOLD・XAU/USD", "ゴールド・エックスエーユー ドル", "金（ゴールド）の米ドル建ての価格。1トロイオンス（約31.1グラム）が何ドルか。XAUは金を表す記号"],
      ["USD/JPY", "ドル円", "1米ドルが何円か。USD＝米ドル、JPY＝日本円"],
      ["BTC/USD", "ビットコイン ドル", "1ビットコイン（BTC）が何米ドルか"],
      ["USD・JPY", "ユーエスディー・ジェーピーワイ", "通貨の略号。USD＝米ドル、JPY＝日本円（口座通貨の選択にも出ます）"],
      ["DXY", "ドル指数", "主要6通貨に対する米ドルの強さを表す指数"],
      ["VIX", "ビックス", "米国株の値動きの荒さの予想を表す指数。「恐怖指数」とも呼ばれる"],
      ["XAUT・PAXG", "テザーゴールド・パックスゴールド", "金と連動するように作られた暗号資産。週末も動くので、金のリアルタイム価格の目安に補正して使う"]]],
    ["取引の言葉", [
      ["lot（ロット）", "ロット", "取引する量のまとまり。1lotの大きさ（契約サイズ）は業者・銘柄で違う。例：ゴールド1lot＝100oz、ドル円1lot＝10万通貨が多い"],
      ["oz", "オンス", "トロイオンス。金の重さの単位（約31.1グラム）"],
      ["pips", "ピップス", "値動きを数える小さな単位。ドル円は1pips＝0.01円、このアプリのゴールドは1pips＝0.1ドル"],
      ["Bid・Ask", "ビッド・アスク", "Bid＝売るときの値段、Ask＝買うときの値段。その差がスプレッド"],
      ["仲値（Mid）", "なかね", "BidとAskのちょうど真ん中の値段"],
      ["RR（リスクリワード）", "アールアール", "損切りまでの幅に対して、利確までの幅が何倍か。2なら「損1に対して利益2を狙う」"],
      ["SMA", "エスエムエー", "単純移動平均線。決まった本数の終値の平均をつないだ線。120SMA＝120本の平均"],
      ["H1・H4・M15・M5", "エイチワン ほか", "時間足の略。H1＝1時間足、H4＝4時間足、M15＝15分足、M5＝5分足"],
      ["CAUTION", "コーション", "「注意」。重要な経済指標の発表前後で、判定を見送る時間帯"],
      ["CSV", "シーエスブイ", "表のデータをカンマで区切った文字のファイル。Excel・Numbers・Googleスプレッドシートで開ける"]]],
    ["時間・市場", [
      ["JST", "ジェイエスティー", "日本標準時（日本時間）。ツールの時刻はすべて日本時間"],
      ["NY", "ニューヨーク", "ニューヨーク。為替・金の1日の区切りは、ニューヨーク時間の17時が基準"],
      ["夏時間（DST）", "サマータイム", "夏の間、時計を1時間進める制度。ロンドン・ニューヨークにあり、日本にはない。市場の開く時刻が日本時間で1時間ずれる"],
      ["CME", "シーエムイー", "シカゴの先物取引所。金・銀・原油の先物の取引時間の基準"],
      ["ICE", "アイス", "米国の取引所。ドル指数（DXY）の先物の取引時間の基準"]]],
    ["データ・保存", [
      ["API", "エーピーアイ", "アプリがほかのサービスからデータを受け取るための窓口"],
      ["JSON", "ジェイソン", "データを保存・受け渡しするための文字の形式。設定のバックアップはこの形式"],
      ["market.json など", "マーケット ジェイソン", "このサイトが5分ごとに作る相場データのファイル（strategy.json＝本日の戦略、holidays.json＝祝日）"],
      ["localStorage", "ローカルストレージ", "ブラウザの中の保存場所。日誌や設定はここに保存され、この端末の外には出ない"],
      ["WebSocket", "ウェブソケット", "つないだままにして、価格を次々に受け取る通信の方法（リアルタイム配信）"]]],
    ["データの提供元", [
      ["Yahoo Finance", "ヤフーファイナンス", "ローソク足（チャート）の元データ。サイトが定期的に取得"],
      ["Gold API", "ゴールドエーピーアイ", "金・銀の現在値を配信するサービス"],
      ["Swissquote", "スイスクオート", "スイスの金融機関。公開している金のBid・Askを、Gold APIの代わりや点検に使う"],
      ["Coinbase", "コインベース", "米国の暗号資産取引所。ドル円のレートとBTCの価格に使う"],
      ["GMO", "ジーエムオー", "GMOコインの外国為替FX。ドル円のリアルタイム配信に使う"],
      ["OKX・Bitfinex・Kraken", "オーケーエックス ほか", "海外の暗号資産取引所。XAUT・PAXG・BTCのリアルタイム配信に使う"],
      ["Forex Factory", "フォレックスファクトリー", "経済指標カレンダーのサイト。指標の予定・予想・結果の元データ"],
      ["Open-Meteo", "オープンメテオ", "天気予報のデータを配信するサービス"]]]
  ];
  // タブごとの難しい言葉（意味は上の WORDS の文をそのまま使う）
  var TAB_WORDS = { money: ["lot（ロット）", "pips", "RR（リスクリワード）"], check: ["CAUTION", "JST"], journal: ["CSV", "localStorage"],
    signals: ["H1・H4・M15・M5", "SMA"], hours: ["JST", "夏時間（DST）", "CME"], status: ["API", "WebSocket", "market.json など"], settings: ["JSON", "localStorage"], tax: ["localStorage"] };
  var wordOf = function (name) { for (var i = 0; i < WORDS.length; i++) for (var j = 0; j < WORDS[i][1].length; j++) if (WORDS[i][1][j][0] === name) return WORDS[i][1][j]; return null; };
  var QA = [["価格が止まっている・古い", "価格カードの札を確認してください。『停止』なら、データ状態を開いて再読み込みを試せます。『休場中』なら故障ではありません。"],
    ["日誌が消えてしまった？", "日誌や設定は、この端末のブラウザの中だけに保存されています。ブラウザのデータを消したり端末を替えたりする前に、『設定』から書き出しておいてください。"],
    ["判定（買い優勢など）が古い気がする", "数字に取り消し線が出ているときは、自動分析が古いので参考にしないでください。データ状態で自動分析の時刻を確かめられます。"],
    ["チェックを記録したのに、結局取引しなかった", "それで問題ありません。日誌に『見送り』として残しておくと、あとで振り返りに使えます。"]];
  var bullets = function (t) { return '<ul class="steps">' + String(t).split("。").filter(function (x) { return x.trim(); }).map(function (x) { return "<li>" + esc(x.trim()) + "。</li>"; }).join("") + "</ul>"; };
  var VIEWS = {
    guide: function () {
      body.innerHTML = '<div class="first"><b>はじめての人へ：まずこの3つだけ</b><p class="note" style="margin:4px 0">最初はこの3つだけで大丈夫です。①データ状態で価格が新しいか見る → ②取引前チェックを記録する → ③取引のあと日誌を書く。他のタブは、慣れてから少しずつで構いません。</p>' +
        '<div class="btns" style="margin:6px 0 0"><button type="button" class="btn" data-gtab="status">① データ状態</button><button type="button" class="btn" data-gtab="check">② 取引前チェック</button><button type="button" class="btn" data-gtab="journal">③ 日誌</button></div></div>' +
        '<h3>🧰 ツールの使い方</h3><p class="note">デスクの数字を確かめ、入る前の準備と、あとからの振り返りに使う道具です。売買をすすめるものではありません。入力した内容はこの端末の中だけに保存され、どこにも送信しません。</p>' +
        '<div class="btns"><button type="button" class="btn" id="g-jump-words">英語・略語の意味へ</button></div>' +
        '<h3>おすすめの使い方（1回の取引の流れ）</h3><div class="flow">' +
        [["① 確かめる", "データ状態で、価格と分析が新しいか"], ["② 時間を見る", "市場時間・取引前チェックで、指標や休場が近くないか"], ["③ 数量を決める", "資金管理で、損切りまでの損失が許容内の数量"],
          ["④ チェックする", "取引前チェックで7項目を確かめて記録"], ["⑤ 記録する", "取引のあと日誌に結果と反省"], ["⑥ 振り返る", "日誌の成績のまとめ・シグナル履歴を見直す"]]
          .map(function (x) { return "<div><b>" + esc(x[0]) + "</b>" + esc(x[1]) + "</div>"; }).join("") + "</div>" +
        '<h3>価格カードの札の読み方</h3><div class="tw"><table><tr><th>札</th><th>意味</th><th>見たらどうする</th></tr>' +
        [["● ライブ", "20秒以内に届いた価格", "そのまま使って大丈夫です"], ["● 最新", "2分以内", "そのまま使って大丈夫です"], ["◔ 遅延", "15分以内。少し古い", "少し古い表示です。大きな判断の前に、データ状態で確かめてください"],
          ["⚠ 停止", "15分より前のまま更新されていない（通信や提供元の問題）", "データ状態を開いて『再読み込み』を試してください。それでも直らなければ、時間を置いてください"],
          ["☾ 休場中", "市場が閉まっている間の最後の価格（故障ではありません）", "故障ではありません。市場が開くまで待ってください"], ["⏸ 確認中", "届いたデータに不自然な点があり、前の値を表示している", "前の値を表示しています。この価格での判断は避けてください"]]
          .map(function (x) { return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td><td>" + esc(x[2]) + "</td></tr>"; }).join("") +
        '</table></div><p class="note">札の時刻は日本時間です。札をタップするとデータ状態の画面が開きます。一致度（例「買い優勢 97」）に取り消し線が出ているときは、自動分析が古いので参考にしないでください。一致度は勝率や確率ではありません。</p>' +
        // 各ダッシュボード共通：「リスク・ロット計算」パネルの読み方（数字は見通しで、売買をすすめるものではありません）
        '<h3>リスク・ロット計算の使い方</h3><details id="g-riskcalc"><summary><b>ダッシュボードの「リスク・ロット計算」の読み方</b></summary><p class="g-why">ゴールド・ドル円・BTC・USオイルの各ダッシュボードにある計算パネルの読み方です。ここで出る数字は目安で、売買をすすめるものではありません。</p>' +
        [["目安ロットと最大損失", "目安ロットは、損切り（SL）に達したときの損失が、口座設定の許容リスクに収まる数量です（0.01lot刻み）。最大損失は、そのロットで損切りに達したときの損失の上限の目安です。ロットを自分で入力したときは「想定損失」として、そのロットの損失を出します。"],
          ["実質RR（スプレッド込み）", "RRは、利確の幅 ÷ 損切りの幅です。カッコの中の実質RRは、スプレッドを差し引いたあとの比率（利確の幅−スプレッド）÷（損切りの幅＋スプレッド）で、実際の取引に近い見方です。1を下回ると、損切りの幅の方が大きいことを表します。"],
          ["証拠金維持率の言葉", "口座資金 ÷ 必要証拠金 で計算します。1000%以上は「十分」、300%以上は「余裕あり」、100%以上は「注意（余裕が少ない）」、100%未満は「危険（ロスカットに近い）」と表示します。"],
          ["合計リスクの見方", "同じ端末・同じブラウザで、ほかの銘柄のダッシュボードも計算していると、結果の下に「全銘柄の合計」が出ます。全部のポジションがそろって損切りに達した場合の損失と、必要な証拠金の合計の目安です。15分より古い計算は合計に入れず、許容リスクを超えると警告の見た目になります。"],
          ["連敗の行の見方", "「このロットで連敗したら」の行は、毎回、残った資金に対して同じ割合を失う計算で、3・5・10連敗のあとに資金がどれだけ減るかの目安です。ロットを大きくする前に、減り方を確かめるために見ます。"],
          ["円で指定するとき", "口座設定の「リスクの指定」で、%と円を切り替えられます。%は資金に対する割合で、資金が増減すると1回の損失額も変わります。円は1回で失ってよい上限を金額で決める方法で、資金が変わっても額は固定です。表示される%は、入力した円を口座資金で割った値です。"]]
          .map(function (x) { return '<p class="note"><b>' + esc(x[0]) + "</b>　" + esc(x[1]) + "</p>"; }).join("") + "</details>" +
        "<h3>タブごとの使い方</h3>" + GUIDE.map(function (g) {
          var tw = (TAB_WORDS[g[0]] || []).map(wordOf).filter(Boolean);
          return '<details id="g-' + g[0] + '"><summary><b>' + esc(g[1]) + '</b></summary><p class="g-why">' + esc(g[2]) + '</p><ol class="steps">' + g[3].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
            '</ol>' + bullets(g[4]) + (g[5] ? '<p class="note"><b>計算の例</b>　' + esc(g[5]) + "</p>" + (g[6] ? '<p class="note">' + esc(g[6]) + "</p>" : "") : "") +
            (tw.length ? '<div class="tw"><table><tr><th>このタブの言葉</th><th>意味</th></tr>' + tw.map(function (w) { return "<tr><td><b>" + esc(w[0]) + "</b></td><td>" + esc(w[2]) + "</td></tr>"; }).join("") + "</table></div>" : "") +
            '<div class="btns"><button type="button" class="btn" data-gtab="' + g[0] + '">このタブを開く</button></div></details>';
        }).join("") +
        '<h3 id="g-words-h">英語・略語の意味</h3><p class="note">ツールやデスクに出てくる英語・略語です。くわしい解説は「学ぶ」パネルのFX用語集でも引けます。</p>' +
        WORDS.map(function (grp) {
          return '<details class="g-words" open><summary><b>' + esc(grp[0]) + '</b></summary><div class="tw"><table><tr><th>ことば</th><th>読み</th><th>意味</th></tr>' +
            grp[1].map(function (w) { return "<tr><td><b>" + esc(w[0]) + "</b></td><td>" + esc(w[1]) + "</td><td>" + esc(w[2]) + "</td></tr>"; }).join("") + "</table></div></details>";
        }).join("") +
        '<h3>操作のヒント</h3><p class="note">閉じるは右上の「閉じる」かEscキー。キーボードではTabで移動し、Enterで押せます。最後に開いたタブは次回も開きます。この「使い方」はいつでも左端のタブから開けます。</p>' +
        '<h3>困ったとき</h3>' + QA.map(function (q) { return '<details><summary><b>Q. ' + esc(q[0]) + '</b></summary><p class="note">A. ' + esc(q[1]) + "</p></details>"; }).join("");
      $("#g-jump-words").addEventListener("click", function () { var h = $("#g-words-h"); h.scrollIntoView({ block: "start" }); var s1 = body.querySelector(".g-words summary"); if (s1) s1.focus(); });
      body.querySelectorAll("[data-gtab]").forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-gtab")); }); });
    },
    money: function () {
      var r = get(RISK, {}) || {}, ref = usdjpyRef();
      body.innerHTML = '<h3>ポジションサイズ</h3><p class="note">許容損失と損切り幅から数量を出します。契約サイズ・数量の刻み・最小数量・通貨換算は業者や口座で違うため、<b>自分の口座の条件を入れてください</b>。足りない項目があるときは数量を出しません。</p>' +
        '<div class="grid">' + select("ps-inst", "銘柄", Object.keys(INST).map(function (k) { return [k, INST[k].name]; }), r.inst || "gold") +
        select("ps-ccy", "口座通貨", [["JPY", "円"], ["USD", "米ドル"]], r.ccy || "JPY") +
        field("ps-bal", "口座残高（口座通貨）", r.bal, "number") + field("ps-pct", "許容リスク（残高の％）", r.pct == null ? 1 : r.pct, "number") +
        field("ps-amt", "または許容損失額（入れるとこちらを優先）", r.amt, "number") +
        field("ps-entry", "エントリー価格", r.entry, "number") + field("ps-stop", "損切り価格", r.stop, "number") +
        field("ps-contract", "1lotの契約サイズ", r.contract, "number") + field("ps-conv", "換算レート（建値通貨1単位＝口座通貨いくら）", r.conv, "number") +
        field("ps-step", "数量の刻み（lot）", r.step, "number") + field("ps-min", "最小数量（lot）", r.min, "number") + field("ps-max", "最大数量（lot・任意）", r.max, "number") +
        field("ps-lev", "レバレッジ（任意・証拠金の目安）", r.lev, "number") + field("ps-cost", "コスト（価格単位・スプレッドなど・任意）", r.cost, "number") + field("ps-com", "手数料（1lotあたり口座通貨・任意）", r.com, "number") +
        '</div><div class="btns"><button type="button" class="btn" id="ps-fill">銘柄の一般的な値を入れる</button><button type="button" class="btn" id="ps-ref">デスクのドル円を換算レートに使う</button></div>' +
        '<p class="note" id="ps-refnote">' + (ref ? "デスクのドル円（参考値）：" + fmt(ref.rate, 3) + "（" + C.jst(ref.at) + "）。実際の換算は業者のレートで確かめてください。" : "デスクのドル円はまだ取得できていません。") + "</p>" +
        '<div class="out" id="ps-out" aria-live="polite"></div>' +
        '<h3>リスクリワード</h3><div class="grid">' + select("rr-side", "向き", [["1", "買い"], ["-1", "売り"]], r.side || "1") +
        field("rr-entry", "エントリー", r.rentry, "number") + field("rr-stop", "損切り", r.rstop, "number") + field("rr-target", "利確", r.target, "number") +
        field("rr-cost", "往復コスト（価格単位・任意）", r.rcost, "number") + field("rr-units", "数量（通貨・oz・BTC単位・任意）", r.units, "number") + field("rr-conv", "換算レート（任意・既定1）", r.rconv, "number") +
        '</div><div class="out" id="rr-out" aria-live="polite"></div>' +
        '<h3>今日の損失と上限</h3><div class="grid">' + field("dl-limit", "1日の損失上限（口座通貨）", r.daily, "number") + '</div><div class="out" id="dl-out" aria-live="polite"></div>' +
        '<p class="note">今日（日本時間）の確定損益は「日誌」に記録した取引から計算します。記録していない取引は含まれません。</p>';
      var ids = ["ps-inst", "ps-ccy", "ps-bal", "ps-pct", "ps-amt", "ps-entry", "ps-stop", "ps-contract", "ps-conv", "ps-step", "ps-min", "ps-max", "ps-lev", "ps-cost", "ps-com", "rr-side", "rr-entry", "rr-stop", "rr-target", "rr-cost", "rr-units", "rr-conv", "dl-limit"];
      var keys = ["inst", "ccy", "bal", "pct", "amt", "entry", "stop", "contract", "conv", "step", "min", "max", "lev", "cost", "com", "side", "rentry", "rstop", "target", "rcost", "units", "rconv", "daily"];
      var calc = function () {
        var v = {}; ids.forEach(function (id, i) { v[keys[i]] = $("#" + id).value; });
        put(RISK, v, "資金管理の入力");
        var NEED = { entry: "エントリー価格", stop: "損切り価格", contract: "契約サイズ", conv: "換算レート", step: "数量の刻み", min: "最小数量", riskAmount: "許容損失額（または残高と％）", riskPct: "許容リスク％" };
        var res = C.positionSize({ balance: v.bal, riskPct: v.pct, riskAmount: v.amt, entry: v.entry, stop: v.stop, contract: v.contract, conv: v.conv, step: v.step, min: v.min, max: v.max, cost: v.cost, commission: v.com, leverage: v.lev });
        var o = $("#ps-out"), cc = v.ccy === "USD" ? "ドル" : "円";
        if (!res.ok) o.textContent = res.need && res.need.length ? "数量は出していません。入力が必要：" + res.need.map(function (k) { return NEED[k] || k; }).join("・") : "⚠ " + res.errors.join("／");
        else if (res.skip) o.textContent = res.message + "\n1lotあたりの損失：" + fmt(res.perLot) + cc;
        else o.textContent = "数量：" + res.lots + " lot（" + fmt(res.units) + " 単位）　計算上 " + res.raw.toFixed(4) + " lot を刻みで切り下げ\n" +
          "損切りでの損失：約 " + fmt(res.actualRisk, 0) + cc + (isFinite(res.riskPctActual) ? "（残高の " + res.riskPctActual.toFixed(2) + "％）" : "") + "　許容：" + fmt(res.risk, 0) + cc + "\n" +
          "取引金額：約 " + fmt(res.notional, 0) + cc + (isFinite(res.margin) ? "　必要証拠金の目安：約 " + fmt(res.margin, 0) + cc + "（業者の証拠金率で変わります）" : "") +
          ((+v.cost || +v.com) ? "\nコスト・手数料を損失に含めています" : "\nコスト・手数料は含めていません") + (res.notes.length ? "\n※" + res.notes.join("\n※") : "") +
          "\n滑り（スリッページ）や窓開けで損失が計算より大きくなることがあります。";
        var rr = C.riskReward({ side: v.side, entry: v.rentry, stop: v.rstop, target: v.target, cost: v.rcost, units: v.units, conv: v.rconv || 1 });
        $("#rr-out").textContent = !rr.ok ? rr.errors.join("／") :
          "リスクリワード " + rr.rr.toFixed(2) + "（コストなし）" + (rr.costIncluded ? "／ " + rr.rrNet.toFixed(2) + "（往復コスト込み）" : "") + "\n損切り幅 " + fmt(rr.risk, 5) + "・利確幅 " + fmt(rr.reward, 5) +
          "\n損益が0になる勝率の目安：" + rr.breakEvenWin.toFixed(1) + "％（この比率で勝ち負けした場合の計算。実際の勝率を示すものではありません）" +
          (rr.loss != null ? "\n想定損益：損切り " + fmt(rr.loss, 0) + "／利確 +" + fmt(rr.gain, 0) + (rr.costIncluded ? "（コスト込み）" : "（コストなし）") : "");
        var dl = C.dailyLoss(journal(), C.dayKey(Date.now()), v.daily);
        $("#dl-out").innerHTML = (dl.set ? (dl.exceeded ? '<div class="warn">⚠ 今日の損失が上限に達しました（' + fmt(dl.loss, 0) + " ／ 上限 " + fmt(dl.limit, 0) + "）。今日は取引を休むことを考えてください。</div>"
          : dl.near ? '<div class="warn">今日の損失が上限の8割を超えました（残り ' + fmt(dl.remaining, 0) + "）。</div>" : "") : "") +
          esc("今日の確定損益：" + (dl.pnl >= 0 ? "+" : "") + fmt(dl.pnl, 0) + "（日誌 " + dl.trades + "件）" + (dl.set ? "　上限まで残り " + fmt(dl.remaining, 0) : "　上限は未設定"));
      };
      body.querySelectorAll("input,select").forEach(function (el) { el.addEventListener("input", calc); el.addEventListener("change", calc); });
      $("#ps-fill").addEventListener("click", function () {
        var k = $("#ps-inst").value, I = INST[k], ccy = $("#ps-ccy").value, ref2 = usdjpyRef();
        $("#ps-contract").value = I.contract; $("#ps-step").value = I.step; $("#ps-min").value = I.min;
        $("#ps-conv").value = I.quote === ccy ? 1 : I.quote === "USD" && ccy === "JPY" && ref2 ? ref2.rate : I.quote === "JPY" && ccy === "USD" && ref2 ? +(1 / ref2.rate).toFixed(6) : "";
        D.toast("一般的な値を入れました（契約サイズ " + I.contract + " など）。自分の口座の条件と同じか確認してください。"); calc();
      });
      $("#ps-ref").addEventListener("click", function () { var r2 = usdjpyRef(); if (!r2) { D.toast("ドル円をまだ取得できていません"); return; } $("#ps-conv").value = $("#ps-ccy").value === "USD" ? +(1 / r2.rate).toFixed(6) : r2.rate; calc(); });
      calc();
    },

    /* ---------- pre-trade checklist ---------- */
    check: function () {
      var ITEMS = [["news", "重要指標・要人発言の時間を確認した（指標の直前直後は見送りも選択肢）"], ["stop", "損切りの位置を決めた（入る前に）"], ["reason", "取引する理由を一文で言える"],
        ["size", "数量を許容損失から計算した（資金管理タブ）"], ["daily", "今日の損失上限に達していない"], ["data", "使う価格・判定のデータが古くない（データ状態タブ）"], ["plan", "利確・撤退の条件を決めた"]];
      var cal = D.calendar(), now = Date.now(), next = (cal.events || []).filter(function (e) { return e.stars === 3 && +e.t > now; }).sort(function (a, b) { return a.t - b.t; })[0];
      var r = get(RISK, {}) || {}, dl = C.dailyLoss(journal(), C.dayKey(now), r.daily);
      body.innerHTML = '<h3>取引前チェック</h3><p class="note">入る前に確かめて、記録に残します。チェックがそろっても売買の判断を保証するものではありません。</p>' +
        '<div class="grid">' + select("ck-key", "銘柄", [["gold", "GOLD"], ["usdjpy", "ドル円"], ["btc", "BTC/USD"], ["other", "その他"]], "gold") + select("ck-side", "向き", [["buy", "買い"], ["sell", "売り"]], "buy") +
        field("ck-risk", "許容損失（口座通貨）", r.amt || "", "number") + "</div>" +
        '<div class="ok" id="ck-info"></div>' +
        ITEMS.map(function (it) { return '<label class="chk"><input type="checkbox" data-ck="' + it[0] + '"><span>' + esc(it[1]) + "</span></label>"; }).join("") +
        '<label class="f" style="margin-top:8px">取引の理由<textarea id="ck-reason" maxlength="2000"></textarea></label>' +
        '<div class="btns"><button type="button" class="btn pri" id="ck-save">記録する</button><button type="button" class="btn" id="ck-journal">記録して日誌を書く</button></div><div id="ck-msg" class="note" aria-live="polite"></div>' +
        '<h3>最近のチェック</h3><div id="ck-list"></div>';
      var info = function () {
        var k = $("#ck-key").value, card = cardOf(k), lines = [];
        lines.push(next ? "次の重要指標：" + C.jst(+next.t) + "（" + C.ago(next.t - Date.now()).replace("前", "後") + "）" + next.title : cal.events ? "これからの重要指標（★3）は見つかりません" : "経済指標を取得できていません");
        lines.push(card ? "デスクの" + card.name + "：" + card.price.label + "（" + C.jst(card.at) + "・" + card.prov.src + "）" : "この銘柄はデスクのカードに表示されていません（鮮度を確認できません）");
        lines.push(dl.set ? "今日の損失：" + fmt(dl.loss, 0) + " ／ 上限 " + fmt(dl.limit, 0) + (dl.exceeded ? "（上限に達しています）" : "") : "今日の損失上限は未設定（資金管理タブ）");
        $("#ck-info").textContent = lines.join("\n"); $("#ck-info").style.whiteSpace = "pre-wrap";
        $("#ck-info").className = (dl.exceeded || (card && /stale|unknown/.test(card.price.level))) ? "warn" : "ok";
      };
      $("#ck-key").addEventListener("change", info); info();
      var list = function () {
        var cs = get(CHECKS, []);
        $("#ck-list").innerHTML = cs.length ? '<div class="tw"><table><tr><th>日時</th><th>銘柄・向き</th><th>確認</th><th>理由</th></tr>' + cs.slice(0, 30).map(function (c) {
          var n = Object.keys(c.items).filter(function (k) { return c.items[k]; }).length;
          return "<tr><td>" + esc(C.jst(Date.parse(c.time))) + "</td><td>" + esc(c.key) + " " + esc(SIDE[c.side] || "") + "</td><td>" + n + "/" + Object.keys(c.items).length + "</td><td>" + esc(c.reason) + "</td></tr>";
        }).join("") + "</table></div>" : '<p class="note">まだ記録がありません。</p>';
      };
      var save = function () {
        var items = {}; body.querySelectorAll("[data-ck]").forEach(function (x) { items[x.getAttribute("data-ck")] = x.checked; });
        var rec = { id: uid(), time: new Date().toISOString(), key: $("#ck-key").value, side: $("#ck-side").value, risk: $("#ck-risk").value, reason: $("#ck-reason").value.trim(), items: items };
        var cs = get(CHECKS, []); cs.unshift(rec); if (cs.length > 500) cs.length = 500;
        if (put(CHECKS, cs, "取引前チェック")) $("#ck-msg").textContent = "記録しました（" + Object.keys(items).filter(function (k) { return items[k]; }).length + "/" + ITEMS.length + " 項目を確認）"; list();
        return rec;
      };
      $("#ck-save").addEventListener("click", save);
      $("#ck-journal").addEventListener("click", function () { var rec = save(); draft = { key: rec.key, side: rec.side, reason: rec.reason, checkId: rec.id }; show("journal"); });
      list();
    },

    /* ---------- journal ---------- */
    journal: function () {
      var d = draft || {}; draft = null;
      var rows = journal(), isSkip = d.kind === "skip";
      var todayK = C.dayKey(Date.now()), hday = jnDay || todayK;  // 日誌ハブで表示する日（既定は今日）
      var more = !!(d.id || d.reason || d.entry != null || d.exit != null);  // 編集中・チェックから来たときは詳しい欄を開いておく
      var px = function (id, label, val) { return '<div class="pxrow">' + field(id, label, val, "number") + '<button type="button" class="btn" data-px="' + id + '">今のデスク価格を入れる</button></div>'; };
      var chips = function (target, list) { return '<div class="chips" data-for="' + target + '">' + list.map(function (c) { return '<button type="button" data-chip="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>"; };
      body.innerHTML = '<h3>トレード日誌</h3><p class="note">判断の理由・取引内容・結果・反省を残します。端末の中だけに保存し、どこにも送信しません（「設定」からファイルに書き出せます）。</p>' +
        '<div id="jn-streak"></div>' +
        (isSkip ? '<div class="ok">見送りの記録を編集しています。</div>' : "") +
        '<h3>' + (d.id ? "記録を直す" : "クイック記録") + '</h3><div class="grid">' +
        select("jn-key", "銘柄", [["gold", "GOLD"], ["usdjpy", "ドル円"], ["btc", "BTC/USD"], ["other", "その他"]], d.key || "gold") + select("jn-side", "向き", [["buy", "買い"], ["sell", "売り"]], d.side || "buy") +
        field("jn-pnl", "確定損益（口座通貨・手数料込み）", d.pnl, "number") + select("jn-rules", "ルールを守れたか", [["", "—"], ["yes", "守れた"], ["no", "守れなかった"]], d.rules || "") + "</div>" +
        '<details id="jn-more"' + (more ? " open" : "") + '><summary><b>詳しく書く</b>（日時・価格・数量・理由・結果・反省）</summary>' +
        '<div class="grid">' + field("jn-time", "日時", toLocal(d.time || new Date().toISOString()), "datetime-local") +
        px("jn-entry", "エントリー価格", d.entry) + px("jn-exit", "決済価格", d.exit) + field("jn-lots", "数量（lot）", d.lots, "number") + field("jn-chart", "チャートのURL・メモ（任意）", d.chart) + "</div>" +
        '<p class="note" id="jn-pxnote"></p>' +
        '<label class="f">判断の理由<textarea id="jn-reason" maxlength="4000">' + esc(d.reason || "") + "</textarea></label>" +
        chips("jn-reason", ["ルール通りの形だった", "サポート／レジスタンス際", "指標後の動きを見て", "流れに乗る形"]) +
        '<label class="f">結果<textarea id="jn-result" maxlength="4000">' + esc(d.result || "") + "</textarea></label>" +
        '<label class="f">反省・次に活かすこと<textarea id="jn-reflect" maxlength="4000">' + esc(d.reflection || "") + "</textarea></label>" +
        chips("jn-reflect", ["ルール通りできた", "損切りが遅れた", "利確が早すぎた", "数量が大きすぎた", "見送りが正解だった", "感情で入ってしまった"]) + "</details>" +
        '<div class="btns"><button type="button" class="btn pri" id="jn-save">' + (d.id ? "更新する" : "記録する") + "</button></div>" +
        (d.id ? "" : '<h3>取引しなかった日</h3><div class="skiprow"><label class="f">一言メモ（任意）<input id="jn-skipmemo" maxlength="400"></label><button type="button" class="btn" id="jn-skip">見送りを記録</button></div>') +
        '<h3>トレード収支のカレンダー</h3><p class="note">記録した日の確定損益・入出金は「トレード収支」に、日ごとのカレンダーと週・月・年のまとめで出ます。</p><div class="btns"><button type="button" class="btn" data-tab="pnl" id="jn-topnl">トレード収支（カレンダーと集計）を開く</button></div>' +
        '<div class="btns"><button type="button" class="btn" id="jn-csv">CSVに書き出す</button><button type="button" class="btn" id="jn-imp">CSVを読み込む</button></div>' +
        '<div id="jn-msg" class="note" aria-live="polite"></div>' +
        '<h3>その日の記録と数字</h3><div class="jcalh"><button type="button" id="jn-dprev" aria-label="前の日">‹</button><b id="jn-dname"></b><button type="button" id="jn-dnext" aria-label="次の日">›</button><button type="button" class="btn" id="jn-dtoday">今日</button></div><div id="jn-hub"></div>' +
        '<h3>成績のまとめ</h3><div id="jn-stats"></div><h3>記録</h3><div id="jn-list"></div>';
      // 記録した日のカレンダーは「収支」の金額のカレンダーに統合（A）。ここは連続記録だけ
      var drawCal = function () {
        var jd = C.journalDays(journal(), Date.now());
        $("#jn-streak").innerHTML = '<p class="streak">' + (jd.streak ? jd.streak + "日連続で記録中" : "今日から記録を始めましょう") + "・今週は" + jd.week + "日記録</p>";
      };
      $("#jn-topnl").addEventListener("click", function () { show("pnl"); });
      // 今のデスク価格を入れる：その銘柄のデスクの表示価格（出典・時刻つき）。「その他」や価格がないときは押せない
      var pxState = function () {
        var k = $("#jn-key").value, card = k === "other" ? null : cardOf(k), ok = !!(card && isFinite(card.value) && card.value);
        body.querySelectorAll("[data-px]").forEach(function (b) { b.disabled = !ok; b.title = ok ? "" : k === "other" ? "「その他」では使えません" : "この銘柄のデスクの価格がありません"; });
        return ok ? card : null;
      };
      $("#jn-key").addEventListener("change", pxState); pxState();
      body.querySelectorAll("[data-px]").forEach(function (b) { b.addEventListener("click", function () {
        var card = pxState(); if (!card) return;
        $("#" + b.getAttribute("data-px")).value = Number(card.value).toFixed(card.dp == null ? 2 : card.dp);
        $("#jn-pxnote").textContent = "入れた価格：デスクの" + card.name + "（" + C.jst(card.at) + "・" + card.prov.src + "・" + card.price.label + "）";
      }); });
      // 定型文：タップでその欄の最後に足す（上書きしない）
      body.querySelectorAll(".chips").forEach(function (c) { c.addEventListener("click", function (e) {
        var b = e.target.closest("[data-chip]"); if (!b) return; var ta = $("#" + c.getAttribute("data-for")), t = b.getAttribute("data-chip");
        ta.value = ta.value ? ta.value.replace(/\s+$/, "") + (/[。、\n]$/.test(ta.value.trim()) ? "" : "。") + t : t; ta.focus();
      }); });
      /* ---------- 日誌ハブ：選んだ日の記録・トレード収支・家計簿（事業分）と今週の流れ ---------- */
      var dayName = function (k) { var p = k.split("-").map(Number), w = "日月火水木金土"[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; return p[1] + "/" + p[2] + "（" + w + "）"; };
      var yen = function (v, sign) { return v == null ? "—" : (sign && v > 0 ? "+" : v < 0 ? "−" : "") + "¥" + fmt(Math.abs(v), 0); };
      var keyShift = function (k, dd) { var p = k.split("-").map(Number), t = Date.UTC(p[0], p[1] - 1, p[2]) + dd * 864e5, x = new Date(t); return x.getUTCFullYear() + "-" + String(x.getUTCMonth() + 1).padStart(2, "0") + "-" + String(x.getUTCDate()).padStart(2, "0"); };
      var JN_NAMES = {}; JN_INSTS.forEach(function (x) { JN_NAMES[x[0]] = x[1]; });
      var paintHub = function () {
        var host = $("#jn-hub"); if (!host) return;
        $("#jn-dname").textContent = dayName(hday) + (hday === todayK ? "（今日）" : "");
        var det = tradeDayDetail(journal(), dailyIn(), hday), kb = kakeibo(), biz = kbDayBiz(kb, hday);
        // その日の記録（文章）。数字は手入力の記録から自動で集めるだけ
        var txt = det.recs.length ? det.recs.map(function (r) {
          if (r.kind === "skip") return '<div class="jn-rec"><span class="tag">見送り</span>' + esc(r.reason || "") + "</div>";
          return '<div class="jn-rec"><b>' + esc(JN_NAMES[r.key] || r.key || "") + " " + esc(SIDE[r.side] || "") + "</b> " +
            (r.pnl !== null && r.pnl !== "" && isFinite(+r.pnl) ? '<span class="' + (+r.pnl > 0 ? "pl-up" : +r.pnl < 0 ? "pl-dn" : "") + '">' + yen(+r.pnl, true) + "</span>" : "") +
            (r.reason || r.result || r.reflection ? "<br>" + esc([r.reason, r.result, r.reflection].filter(Boolean).join(" ／ ")) : "") + "</div>";
        }).join("") : '<p class="note">この日の記録はまだありません。</p>';
        // その日のトレード収支（見るだけ）
        var trows = det.insts.map(function (a) {
          return '<div class="jn-prow"><span>' + esc(a.name) + "</span><b>" + (!a.trades ? "なし" : a.has ? '<span class="' + (a.bal > 0 ? "pl-up" : a.bal < 0 ? "pl-dn" : "") + '">' + yen(a.bal, true) + "</span>" : "―") + "</b></div>";
        }).join("");
        var foot = [];
        if (det.trades) { foot.push("トレード回数 " + det.trades + "回"); if (det.wins || det.losses) foot.push("勝ち" + det.wins + " 負け" + det.losses); }
        if (det.skip && !det.trades) foot.push("見送りの日");
        var tpanel = '<div class="jn-panel"><h4>その日のトレード収支</h4>' + trows +
          '<div class="jn-prow tot"><span>合計</span><b>' + (det.total === null ? "―" : '<span class="' + (det.total > 0 ? "pl-up" : det.total < 0 ? "pl-dn" : "") + '">' + yen(det.total, true) + "</span>") + "</b></div>" +
          (det.src === "daily" ? '<p class="note">合計は日次入力の額です。' + (det.trades ? "銘柄別の金額は日誌の取引ごとの集計で、合計とは合わないことがあります。" : "") + "</p>" : "") +
          (foot.length ? '<p class="note">' + esc(foot.join("・")) + "</p>" : "") + "</div>";
        // その日の家計簿（事業分）と転記ボタン
        var brows = biz.incCats.map(function (c) { return '<div class="jn-prow"><span>' + esc(c.cat) + '</span><b class="pl-up">' + yen(c.sum, true) + "</b></div>"; }).join("") +
          biz.outCats.map(function (c) { return '<div class="jn-prow"><span>' + esc(c.cat) + "</span><b>−¥" + fmt(c.sum, 0) + "</b></div>"; }).join("");
        var btn;
        if (kbTransferred(kb, hday)) btn = '<div class="btns"><button type="button" class="btn" disabled>転記済み</button></div><p class="note">この日のトレード収支は、家計簿の事業分へ転記済みです。</p>';
        else if (det.total === null) btn = '<div class="btns"><button type="button" class="btn" disabled>トレード収支を事業へ転記</button></div><p class="note">この日のトレード収支がないため、転記できません。</p>';
        else if (!det.total) btn = '<div class="btns"><button type="button" class="btn" disabled>トレード収支を事業へ転記</button></div><p class="note">差額が0円の日は転記できません。</p>';
        else btn = '<div class="btns"><button type="button" class="btn" data-jtr="' + esc(hday) + '">トレード収支を事業へ転記</button></div><p class="note">押したときだけ、その日の損益を家計簿の事業分に移ります。</p>';
        var bpanel = '<div class="jn-panel"><h4>その日の家計簿（事業分）</h4>' +
          (biz.count ? brows + '<div class="jn-prow tot"><span>差額</span><b><span class="' + (biz.bal > 0 ? "pl-up" : biz.bal < 0 ? "pl-dn" : "") + '">' + yen(biz.bal, true) + "</span></b></div>" : '<p class="note">この日の事業の記録はありません。</p>') +
          btn + '<div class="note" id="jn-hubmsg" aria-live="polite"></div></div>';
        // 今週の流れ
        var wk = tradeWeekStrip(journal(), dailyIn(), hday);
        var week = '<p class="kb-ps-h">今週の流れ</p><div class="jn-week">' + wk.map(function (c) {
          return '<div class="' + (c.key === hday ? "sel" : "") + (c.key === todayK ? " today" : "") + '"><b>' + c.name + "</b>" +
            (c.pnl !== null ? '<span class="' + (c.pnl > 0 ? "pl-up" : c.pnl < 0 ? "pl-dn" : "") + '">' + (c.pnl > 0 ? "+" : c.pnl < 0 ? "−" : "") + fmt(Math.abs(c.pnl), 0) + "</span>" : c.skip ? "見送り" : "―") + "</div>";
        }).join("") + "</div>";
        host.innerHTML = '<div class="pl-dayd">' + txt + '<p class="note">自動で集まった数字は下に並びます。数字は手入力のまま、ここでは見るだけです。</p></div>' +
          '<div class="jn-panels">' + tpanel + bpanel + "</div>" + week;
      };
      var paint = function () {
        rows = journal();
        $("#jn-list").innerHTML = rows.length ? '<div class="tw"><table><tr><th>日時</th><th>銘柄</th><th>向き</th><th>損益</th><th>理由・反省</th><th></th></tr>' + rows.slice(0, 200).map(function (r) {
          var sk = r.kind === "skip";
          return "<tr><td>" + esc(C.jst(Date.parse(r.time))) + "</td><td>" + esc(sk ? "—" : r.key) + '</td><td class="' + esc(r.side) + '">' + (sk ? '<span class="tag">見送り</span>' : esc(SIDE[r.side] || r.side)) + "</td><td>" + (!sk && isFinite(r.pnl) && r.pnl !== null ? (r.pnl >= 0 ? "+" : "") + fmt(r.pnl, 0) : "—") +
            "</td><td>" + esc((r.reason || "") + (r.reflection ? " ／ " + r.reflection : "")).slice(0, 300) + '</td><td><button type="button" class="btn" data-ed="' + esc(r.id) + '">編集</button> <button type="button" class="btn danger" data-del="' + esc(r.id) + '">削除</button></td></tr>';
        }).join("") + "</table></div>" : '<p class="note">まだ記録がありません。</p>';
        $("#jn-stats").innerHTML = stats(rows);
        drawCal(); today(); paintHub();
      };
      var store = function (rec, msg) {
        var all = journal().filter(function (x) { return x.id !== rec.id; }); all.unshift(rec);
        all.sort(function (a, b) { return Date.parse(b.time) - Date.parse(a.time); });
        if (put(JOURNAL, all, "日誌")) { draft = null; VIEWS.journal(); $("#jn-msg").textContent = msg; }
      };
      $("#jn-save").addEventListener("click", function () {
        var t = Date.parse($("#jn-time").value);
        if (!isFinite(t)) { $("#jn-more").open = true; $("#jn-msg").textContent = "日時を入れてください（「詳しく書く」の中）"; return; }
        var pnl = $("#jn-pnl").value === "" ? NaN : Number($("#jn-pnl").value);
        if ($("#jn-pnl").value !== "" && !isFinite(pnl)) { $("#jn-msg").textContent = "損益は数字で入れてください"; return; }
        var rec = { id: d.id || uid(), time: new Date(t).toISOString(), day: C.dayKey(t), key: $("#jn-key").value, side: isSkip ? "" : $("#jn-side").value,
          entry: num($("#jn-entry").value), exit: num($("#jn-exit").value), lots: num($("#jn-lots").value), pnl: isFinite(pnl) && !isSkip ? pnl : null, ccy: (get(RISK, {}) || {}).ccy || "JPY",
          rules: $("#jn-rules").value, chart: $("#jn-chart").value.trim(), reason: $("#jn-reason").value.trim(), result: $("#jn-result").value.trim(), reflection: $("#jn-reflect").value.trim(), checkId: d.checkId || "" };
        if (isSkip) rec.kind = "skip";
        store(rec, "保存しました。");
      });
      var sk = $("#jn-skip");
      if (sk) sk.addEventListener("click", function () {
        var now = Date.now(), rec = { id: uid(), time: new Date(now).toISOString(), day: C.dayKey(now), kind: "skip", key: "other", side: "", pnl: null, rules: "", reason: $("#jn-skipmemo").value.trim(), result: "", reflection: "", checkId: "" };
        store(rec, "見送りを記録しました（成績のまとめには入りません）。");
      });
      $("#jn-list").addEventListener("click", function (e) {
        var ed = e.target.closest("[data-ed]"), del = e.target.closest("[data-del]");
        if (ed) { draft = journal().filter(function (x) { return x.id === ed.getAttribute("data-ed"); })[0]; VIEWS.journal(); }
        if (del && confirm("この記録を削除しますか？（元に戻せません）")) { put(JOURNAL, journal().filter(function (x) { return x.id !== del.getAttribute("data-del"); }), "日誌"); paint(); }
      });
      $("#jn-csv").addEventListener("click", function () { download("trade-journal-" + C.dayKey(Date.now()) + ".csv", C.toCSV(journal(), JCOLS), "text/csv"); });
      $("#jn-imp").addEventListener("click", function () {
        pickFile(".csv,text/csv", function (text) {
          var r = C.importCSV(text, JCOLS, journal().map(function (x) { return x.id; }));
          if (r.records.length) {
            var all = journal().concat(r.records.map(function (x) { x.day = C.dayKey(Date.parse(x.time)); if (x.pnl == null) x.pnl = null; return x; }));
            all.sort(function (a, b) { return Date.parse(b.time) - Date.parse(a.time); }); put(JOURNAL, all, "日誌");
          }
          $("#jn-msg").textContent = "読み込み：追加 " + r.records.length + "件・重複でスキップ " + r.skipped + "件" + (r.errors.length ? "・読めなかった行 " + r.errors.length + "件（" + r.errors.slice(0, 3).join("／") + "）" : "");
          paint();
        });
      });
      $("#jn-dprev").addEventListener("click", function () { jnDay = keyShift(hday, -1); VIEWS.journal(); });
      $("#jn-dnext").addEventListener("click", function () { jnDay = keyShift(hday, 1); VIEWS.journal(); });
      $("#jn-dtoday").addEventListener("click", function () { jnDay = todayK; VIEWS.journal(); });
      // 転記：確認してから、家計簿の事業分へ1件だけ写す（同じ日は kbTransferTrade が二重に作らない）
      $("#jn-hub").addEventListener("click", function (e) {
        var b = e.target.closest("[data-jtr]"); if (!b) return;
        var day = b.getAttribute("data-jtr"), total = tradeDayDetail(journal(), dailyIn(), day).total;
        if (total === null || !total || kbTransferred(kakeibo(), day)) { paintHub(); return; }
        if (!confirm(dayName(day) + "のトレード収支（" + yen(total, true) + "）を家計簿の事業分へ転記します。よろしいですか？")) return;
        var all = kakeibo(), r = kbTransferTrade(all, day, total);
        if (!r.created) { paintHub(); return; }
        all.unshift(r.created);
        if (put(KAKEIBO, all, "家計簿")) { VIEWS.journal(); var m = $("#jn-hubmsg"); if (m) m.textContent = "転記しました（家計簿の事業分に1件）。"; }
      });
      paint();
    },

    /* ---------- 収支（A）：日ごとの確定損益と入出金のカレンダー、週・月・年のまとめ、1日分の入力 ---------- */
    pnl: function () {
      var todayK = C.dayKey(Date.now()), sel = pnlSel || todayK, mode = pnlMode || "month";
      var ym = (pnlMonth || todayK).slice(0, 7);
      var yen = function (v, sign) { return v == null ? "—" : (sign && v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), 0); };
      var cls = function (v) { return v > 0 ? "pl-up" : v < 0 ? "pl-dn" : ""; };
      // カレンダーの中は幅が狭いので、スマホでは1万以上を「万」で（例：+1.2万）。合計や一覧は円まで出す
      var wide = body.clientWidth >= 640;  // iPad など広い画面では円まで、スマホでは1万以上を「万」で
      var short = function (v, sign) { var a = Math.abs(v); return (sign && v > 0 ? "+" : v < 0 ? "−" : "") + (a >= (wide ? 1e6 : 1e4) ? (a / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "万" : fmt(a, 0)); };
      var dayName = function (k) { var p = k.split("-").map(Number), w = "日月火水木金土"[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; return p[1] + "/" + p[2] + "（" + w + "）"; };
      var di = dailyIn(), cur = di[sel] || {};
      body.innerHTML = '<h3>トレード収支</h3>' +
        '<div class="pl-head" id="pl-head"></div><div class="jcalh"><button type="button" id="pl-prev" aria-label="前の月">‹</button><b id="pl-title"></b><button type="button" id="pl-next" aria-label="次の月">›</button><button type="button" class="btn" id="pl-today">今日</button></div>' +
        '<div class="pl-cal" id="pl-cal"></div><div id="pl-day" class="pl-dayd"></div>' +
        '<div class="pl-in"><b>今日のトレード収支を入れる</b><div class="grid">' +
        field("pl-dayin", "日付", sel, "date") + field("pl-pnl", "確定損益（円・手数料込み）", cur.pnl, "number") + field("pl-dep", "入金（円）", cur.dep, "number") + field("pl-wd", "出金（円）", cur.wd, "number") + "</div>" +
        '<div class="btns"><button type="button" class="btn pri" id="pl-save">保存する</button><button type="button" class="btn danger" id="pl-clear">この日の入力を消す</button></div>' +
        '<p class="note">空欄は「なし」。この日の確定損益を入れると、日誌の取引ごとの損益の合計ではなく、この数字をその日の損益にします（足しません）。入金・出金はここだけから数えます。</p><div class="note" id="pl-msg" aria-live="polite"></div></div>' +
        '<h3>期間のまとめ</h3><div class="pl-seg" role="group" aria-label="期間">' + [["week", "週"], ["month", "月"], ["year", "年"]].map(function (x) { return '<button type="button" data-pm="' + x[0] + '" aria-pressed="' + (x[0] === mode) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        '<div id="pl-sum"></div>';
      var book = function () { return C.dailyBook(journal(), dailyIn()); };
      var paintCal = function () {
        var b = book(), y = +ym.slice(0, 4), mo = +ym.slice(5, 7), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(), first = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
        var z = function (x) { return String(x).padStart(2, "0"); }, cells = "";
        ["月", "火", "水", "木", "金", "土", "日"].forEach(function (w, i) { cells += '<b class="' + (i === 5 ? "sat" : i === 6 ? "sun" : "") + '">' + w + "</b>"; });
        for (var i = 0; i < first; i++) cells += "<i></i>";
        var cum = 0, pts = [];
        for (var dd = 1; dd <= n; dd++) {
          var k = ym + "-" + z(dd), d = b[k] || {};
          if (d.pnl != null) cum += d.pnl; pts.push(k <= todayK ? cum : null);
          var lines = (d.pnl != null ? '<em class="' + cls(d.pnl) + '">' + short(d.pnl, true) + "</em>" : d.skip ? '<em class="pl-skip">見送り</em>' : "") +
            (d.dep ? '<small class="pl-dep">入 ' + short(d.dep) + "</small>" : "") + (d.wd ? '<small class="pl-wd">出 ' + short(d.wd) + "</small>" : "");
          cells += '<button type="button" data-pd="' + k + '" class="' + (k === todayK ? "now" : "") + (k === sel ? " sel" : "") + '" aria-label="' + esc(dayName(k) + (d.pnl != null ? " 損益 " + yen(d.pnl, true) + "円" : "")) + '"><span>' + dd + "</span>" + lines + "</button>";
        }
        $("#pl-cal").innerHTML = cells; $("#pl-title").textContent = y + "年" + mo + "月";
        var s = C.periodSummary(b, ym + "-01", ym + "-" + z(n));
        // 損益の積み上がり（月の初めから。今日より先は描かない）
        var vals = pts.filter(function (v) { return v != null; }), lo = Math.min.apply(null, [0].concat(vals)), hi = Math.max.apply(null, [0].concat(vals)), W = 300, H = 44;
        var X = function (i) { return 4 + i * (W - 8) / Math.max(1, n - 1); }, Y = function (v) { return hi === lo ? H / 2 : 4 + (hi - v) * (H - 8) / (hi - lo); };
        var path = pts.map(function (v, i) { return v == null ? "" : X(i).toFixed(1) + "," + Y(v).toFixed(1); }).filter(Boolean).join(" ");
        var spark = vals.length ? '<svg class="pl-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="月の損益の積み上がり"><line x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 3"/><polyline points="' + path + '" fill="none" stroke="' + (cum >= 0 ? "#5fd99a" : "#ff9d90") + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' : "";
        $("#pl-head").innerHTML = '<div class="pl-big"><small>' + mo + "月の確定損益</small><b class=\"" + cls(s.pnl) + '">' + (s.days ? yen(s.pnl, true) : "—") + '<i>円</i></b></div>' +
          '<div class="pl-kv"><span>入金<b>' + yen(s.dep) + "</b></span><span>出金<b>" + yen(s.wd) + "</b></span><span>勝ち日<b>" + s.win + "</b></span><span>負け日<b>" + s.loss + "</b></span></div>" + spark;
      };
      var paintDay = function () {
        var b = book(), d = b[sel] || {}, di2 = dailyIn()[sel], rows = journal().filter(function (r) { return (r.day || C.dayKey(Date.parse(r.time))) === sel; });
        var h = "<b>" + dayName(sel) + "</b>　" + (d.pnl != null ? '損益 <span class="' + cls(d.pnl) + '">' + yen(d.pnl, true) + "円</span>（" + (d.src === "daily" ? "日次入力" : "日誌の取引の合計") + "）" : "損益の記録なし");
        if (d.src === "daily" && d.trades) h += '<p class="note">この日は日次入力を正としています。日誌の取引 ' + d.trades + "件の損益は足していません。</p>";
        if (di2) h += '<p class="note">日次入力：損益 ' + yen(di2.pnl == null || di2.pnl === "" ? null : +di2.pnl, true) + "・入金 " + yen(di2.dep) + "・出金 " + yen(di2.wd) + '　<button type="button" class="btn" id="pl-editday">入力欄で直す</button></p>';
        h += rows.length ? '<div class="tw"><table><tr><th>時刻</th><th>銘柄</th><th>向き</th><th>損益</th><th></th></tr>' + rows.map(function (r) {
          var sk = r.kind === "skip";
          return "<tr><td>" + esc(C.jst(Date.parse(r.time), false)) + "</td><td>" + esc(sk ? "—" : r.key) + "</td><td>" + (sk ? '<span class="tag">見送り</span>' : esc(SIDE[r.side] || r.side || "")) + '</td><td class="' + cls(r.pnl) + '">' + (!sk && r.pnl != null && isFinite(r.pnl) ? yen(r.pnl, true) : "—") +
            '</td><td><button type="button" class="btn" data-jed="' + esc(r.id) + '">日誌で編集</button></td></tr>';
        }).join("") + "</table></div>" : '<p class="note">この日の日誌の記録はありません。</p>';
        $("#pl-day").innerHTML = h;
        var e = $("#pl-editday"); if (e) e.addEventListener("click", function () { pnlSel = sel; VIEWS.pnl(); $("#pl-pnl").focus(); });
      };
      var paintSum = function () {
        var b = book(), z = function (x) { return String(x).padStart(2, "0"); }, y = +ym.slice(0, 4), mo = +ym.slice(5, 7), html = "";
        var rng = mode === "week" ? C.weekOf(sel) : mode === "month" ? { from: ym + "-01", to: ym + "-" + z(new Date(Date.UTC(y, mo, 0)).getUTCDate()) } : { from: y + "-01-01", to: y + "-12-31" };
        var s = C.periodSummary(b, rng.from, rng.to);
        var label = mode === "week" ? dayName(rng.from) + "〜" + dayName(rng.to) + "（月曜はじまり）" : mode === "month" ? y + "年" + mo + "月" : y + "年";
        html += '<p class="note">' + esc(label) + "</p>" + '<div class="pl-grid">' +
          [["確定損益の合計", s.days ? '<b class="' + cls(s.pnl) + '">' + yen(s.pnl, true) + "円</b>" : "<b>—</b>"], ["勝ち日／負け日", "<b>" + s.win + "／" + s.loss + "</b>"], ["取引した日数", "<b>" + s.days + "日</b>"],
           ["最大の勝ち日", s.best && s.best.pnl > 0 ? '<b class="pl-up">' + yen(s.best.pnl, true) + "</b><small>" + dayName(s.best.day) + "</small>" : "<b>—</b>"],
           ["最大の負け日", s.worst && s.worst.pnl < 0 ? '<b class="pl-dn">' + yen(s.worst.pnl, true) + "</b><small>" + dayName(s.worst.day) + "</small>" : "<b>—</b>"],
           ["入金／出金", "<b>" + yen(s.dep) + "／" + yen(s.wd) + "</b>"]].map(function (x) { return "<div><span>" + x[0] + "</span>" + x[1] + "</div>"; }).join("") + "</div>";
        if (mode === "year") {
          var ms = []; for (var m = 1; m <= 12; m++) { var n = new Date(Date.UTC(y, m, 0)).getUTCDate(); ms.push(C.periodSummary(b, y + "-" + z(m) + "-01", y + "-" + z(m) + "-" + z(n))); }
          var mx = Math.max.apply(null, ms.map(function (x) { return Math.abs(x.pnl); }).concat([1])), nowYm = todayK.slice(0, 7);
          html += '<div class="tw"><table class="pl-year"><tr><th>月</th><th>確定損益</th><th class="pl-barh">月ごとの損益</th><th>勝ち／負け</th><th>入金／出金</th></tr>' + ms.map(function (x, i) {
            var k = y + "-" + z(i + 1), w = (Math.abs(x.pnl) / mx * 50).toFixed(1);
            return '<tr class="' + (k === nowYm ? "now" : "") + '"><td>' + (i + 1) + "月" + (k === nowYm ? '<span class="tag">今月</span>' : "") + '</td><td class="' + cls(x.pnl) + '">' + (x.days ? yen(x.pnl, true) : "—") +
              '</td><td class="pl-barc"><span class="pl-bar"><i class="' + (x.pnl >= 0 ? "up" : "dn") + '" style="' + (x.pnl >= 0 ? "left:50%" : "right:50%") + ";width:" + (x.days ? w : 0) + '%"></i></span></td><td>' + x.win + "／" + x.loss + "</td><td>" + yen(x.dep) + "／" + yen(x.wd) + "</td></tr>";
          }).join("") + "</table></div>";
        }
        $("#pl-sum").innerHTML = html;
        body.querySelectorAll("[data-pm]").forEach(function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-pm") === mode ? "true" : "false"); });
      };
      var paint = function () { paintCal(); paintDay(); paintSum(); };
      var shift = function (dm) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + dm; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; ym = y + "-" + String(m + 1).padStart(2, "0"); pnlMonth = ym + "-01"; paint(); };
      $("#pl-prev").addEventListener("click", function () { shift(-1); });
      $("#pl-next").addEventListener("click", function () { shift(1); });
      $("#pl-today").addEventListener("click", function () { sel = todayK; pnlSel = sel; ym = todayK.slice(0, 7); pnlMonth = todayK; $("#pl-dayin").value = sel; load(); paint(); });
      $("#pl-cal").addEventListener("click", function (e) { var b = e.target.closest("[data-pd]"); if (!b) return; sel = pnlSel = b.getAttribute("data-pd"); $("#pl-dayin").value = sel; load(); paint(); });
      body.querySelectorAll("[data-pm]").forEach(function (bt) { bt.addEventListener("click", function () { mode = pnlMode = bt.getAttribute("data-pm"); paintSum(); }); });
      var load = function () { var v = dailyIn()[$("#pl-dayin").value] || {}; $("#pl-pnl").value = v.pnl == null ? "" : v.pnl; $("#pl-dep").value = v.dep == null ? "" : v.dep; $("#pl-wd").value = v.wd == null ? "" : v.wd; };
      $("#pl-dayin").addEventListener("change", function () { if (/^\d{4}-\d\d-\d\d$/.test(this.value)) { sel = pnlSel = this.value; ym = sel.slice(0, 7); pnlMonth = sel; load(); paint(); } });
      var numOrNull = function (id) { var v = $(id).value.trim(); if (v === "") return null; var x = Number(v); return isFinite(x) ? x : NaN; };
      $("#pl-save").addEventListener("click", function () {
        var k = $("#pl-dayin").value, v = { pnl: numOrNull("#pl-pnl"), dep: numOrNull("#pl-dep"), wd: numOrNull("#pl-wd") };
        if (!/^\d{4}-\d\d-\d\d$/.test(k)) { $("#pl-msg").textContent = "日付を入れてください。"; return; }
        if ([v.pnl, v.dep, v.wd].some(function (x) { return x !== null && !isFinite(x); })) { $("#pl-msg").textContent = "金額は数字で入れてください。"; return; }
        if ((v.dep !== null && v.dep < 0) || (v.wd !== null && v.wd < 0)) { $("#pl-msg").textContent = "入金・出金は0以上の数字で入れてください（出金は出金の欄へ）。"; return; }
        var all = dailyIn();
        if (v.pnl === null && v.dep === null && v.wd === null) delete all[k]; else { v.at = new Date().toISOString(); all[k] = v; }
        if (put(DAILY, all, "トレード収支")) { sel = pnlSel = k; ym = k.slice(0, 7); pnlMonth = k; paint(); $("#pl-msg").textContent = dayName(k) + "のトレード収支を保存しました。"; }
      });
      $("#pl-clear").addEventListener("click", function () {
        var k = $("#pl-dayin").value, all = dailyIn(); if (!all[k]) { $("#pl-msg").textContent = "この日の日次入力はありません。"; return; }
        if (!confirm(dayName(k) + "の日次入力（損益・入金・出金）を消します。日誌の取引の記録は消えません。よろしいですか？")) return;
        delete all[k]; if (put(DAILY, all, "トレード収支")) { load(); paint(); $("#pl-msg").textContent = "消しました。"; }
      });
      paint();
      $("#pl-day").addEventListener("click", function (e) { var b = e.target.closest("[data-jed]"); if (!b) return; draft = journal().filter(function (x) { return x.id === b.getAttribute("data-jed"); })[0]; show("journal"); });
    },

    /* ---------- 家計簿：家の収入と支出を月ごとに（トレード収支とは別。この端末の中だけに保存） ---------- */
    kakeibo: function () {
      var todayK = C.dayKey(Date.now()), ym = kbYm || todayK.slice(0, 7), ed = kbEdit;
      var yen = function (v, sign) { return (sign && v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), 0); };
      var dayName = function (k) { var p = k.split("-").map(Number), w = "日月火水木金土"[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; return p[1] + "/" + p[2] + "（" + w + "）"; };
      var modeSeg = '<div class="pl-seg" role="group" aria-label="月別と申告用の切り替え">' + [["month", "月別"], ["tax", "申告用"]].map(function (x) { return '<button type="button" data-km="' + x[0] + '" aria-pressed="' + (x[0] === kbMode) + '">' + x[1] + "</button>"; }).join("") + "</div>";
      var wireMode = function () { body.querySelectorAll("[data-km]").forEach(function (b) { b.addEventListener("click", function () { kbMode = b.getAttribute("data-km"); kbEdit = null; VIEWS.kakeibo(); }); }); };
      var dl = function (name, text) { try { download(name, text, "text/csv"); } catch (e) { /* 書き出しが止められても画面はそのままにする */ } };
      var catsHtml = function (list, unit) {
        var outs = kbCatSums(list, "out"), ins = kbCatSums(list, "in"), mx = outs.length ? outs[0].sum : 0;
        return '<p class="note"><b>支出</b></p>' + (outs.length ? outs.map(function (c) {
          return '<div class="kb-cat"><span>' + esc(c.cat) + '</span><span class="kb-bar"><i style="width:' + (mx ? Math.max(2, c.sum / mx * 100) : 0) + '%"></i></span><span class="kb-amt pl-dn">¥' + fmt(c.sum, 0) + "</span></div>";
        }).join("") : '<p class="note">この' + unit + 'の支出はまだありません。</p>') +
          '<p class="note"><b>収入</b></p>' + (ins.length ? '<div class="tw"><table>' + ins.map(function (c) { return "<tr><td>" + esc(c.cat) + '</td><td class="kb-amt pl-up">¥' + fmt(c.sum, 0) + "</td></tr>"; }).join("") + "</table></div>" : '<p class="note">この' + unit + 'の収入はまだありません。</p>');
      };
      /* ---------- 申告用：医療費控除の目安と年間の収支まとめ ---------- */
      if (kbMode === "tax") {
        var year = kbYear || +todayK.slice(0, 4);
        var all = kakeibo(), yl = kbYearList(all, year), yt = kbTotals(yl);
        var meds = kbMedical(all, year), mt = kbMedTotals(meds);
        /* --- 事業の収支・借入・減価償却の材料（自動計算分は資産と借入から） --- */
        var loans = kbLoans(), assets = kbAssets();
        var loanCalc = loans.map(function (l) { return { loan: l, am: kbAmortize(l) }; });
        var depAuto = 0, intAuto = 0;
        assets.forEach(function (a) { depAuto += kbDepForYear(a, year).biz; });
        loanCalc.forEach(function (c) { if (c.loan.purpose === "事業") { var yr = c.am.years[year]; if (yr) intAuto += Math.round(yr.interest * c.loan.bizRatio / 100); } });
        var biz = kbBizSummary(all, year, depAuto, intAuto), bizInCats = kbCatSums(yl.filter(function (e) { return e.scope === "biz"; }), "in");
        var lnEd = kbLoanEdit, asEd = kbAssetEdit;
        /* --- 住宅ローン控除の申請ガイド：あなたの場合は＋ルート別の手順と書類チェック（チェック状態は端末に保存） --- */
        var hcPersonal = kbHcPersonal(loans, year);
        var hcState = kbHcGuideNorm(get(KAKEIBO_HCGUIDE, {}));
        var hcEntry = kbHcYearEntry(hcState, year, hcPersonal);
        var hcGuideInner = function () {
          var r = KB_HC_ROUTES[hcEntry.route] || KB_HC_ROUTES.B, prog = kbHcProgress(hcEntry.route, hcEntry.checks);
          var s = '<h3>住宅ローン控除の申請ガイド</h3>' +
            '<p class="note">住宅ローン控除（住宅借入金等特別控除）を受けるための手続きを、状況に合わせて案内します。金額は目安です。個別の判断は税務署・税理士に確認してください。</p>';
          if (hcPersonal) s += '<div class="hc-box"><b>あなたの場合は</b><div class="hc-big">あなたは ' + hcPersonal.nth + '年目です。今年は' + (hcPersonal.nth === 1 ? "確定申告" : "年末調整") + 'で受けられます。</div>' +
            '<p class="note">控除額の目安 ¥' + fmt(hcPersonal.credit, 0) + '（控除期間' + hcPersonal.years + '年のうちの' + hcPersonal.nth + '年目）。給与以外の所得がある人は、毎年、確定申告で受けます。当てはまる人は、下のルートCを選んでください。</p></div>';
          s += '<p class="note"><b>あなたはどっち？</b> 当てはまるものを選ぶと、その手順と書類だけが出ます。</p>' +
            '<div class="hc-routes" role="group" aria-label="申請のルートを選ぶ">' + KB_HC_ROUTE_ORDER.map(function (k) { var rt = KB_HC_ROUTES[k]; return '<button type="button" data-hcroute="' + k + '" aria-pressed="' + (k === hcEntry.route) + '">' + esc(rt.label) + "<small>" + esc(rt.sub) + "</small></button>"; }).join("") + "</div>" +
            r.steps.map(function (st, i) { return '<div class="hc-step"><span class="hc-n">' + (i + 1) + '</span><div><b>' + esc(st.title) + '</b><p class="note">' + esc(st.note) + "</p></div></div>"; }).join("") +
            '<p class="note"><b>そろえる書類</b>　<span class="hc-prog">' + prog.total + "つのうち " + prog.done + 'つ そろいました</span>（印はこの端末に保存されます）</p>' +
            r.docs.map(function (id) { var doc = KB_HC_DOCS[id]; return '<label class="hc-doc"><input type="checkbox" data-hcdoc="' + id + '"' + (hcEntry.checks[id] ? " checked" : "") + '><span><b>' + esc(doc.name) + "</b>" + (doc.formal ? '<span class="hc-formal">正式な名前：' + esc(doc.formal) + "</span>" : "") + '<span class="note">' + esc(doc.note) + "</span></span></label>"; }).join("") +
            '<p class="note"><b>よくある失敗</b></p><ul class="steps">' + KB_HC_FAILS.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
            '<p class="note">令和6・7年入居の制度での目安です。最新は国税庁で確認を。</p>';
          return s;
        };
        var wireGuide = function () {
          var g = $("#kb-hcguide"); if (!g) return;
          g.querySelectorAll("[data-hcroute]").forEach(function (b) { b.addEventListener("click", function () { hcEntry.route = b.getAttribute("data-hcroute"); hcState[String(year)] = hcEntry; put(KAKEIBO_HCGUIDE, hcState, "家計簿"); paintGuide(); }); });
          g.querySelectorAll("[data-hcdoc]").forEach(function (cb) { cb.addEventListener("change", function () { var id = cb.getAttribute("data-hcdoc"); if (cb.checked) hcEntry.checks[id] = true; else delete hcEntry.checks[id]; hcState[String(year)] = hcEntry; put(KAKEIBO_HCGUIDE, hcState, "家計簿"); paintGuide(); }); });
        };
        var paintGuide = function () { var g = $("#kb-hcguide"); if (g) { g.innerHTML = hcGuideInner(); wireGuide(); } };
        var bizHtml = '<h3>事業の収支（' + year + '年）</h3>' +
          '<p class="note">月別で「事業」を選んだ記録を、収支内訳表の科目の並びでまとめました。減価償却費と利子割引料の（自動計算）は、下の資産・借入から計算した分です。手入力の分と重ねて入れないでください。</p>' +
          ((biz.inc || biz.lines.length) ? '<div class="tw"><table><tr><th>区分</th><th>科目</th><th>金額</th></tr>' +
            bizInCats.map(function (c) { return '<tr><td>収入</td><td>' + esc(c.cat) + '</td><td class="kb-amt pl-up">¥' + fmt(c.sum, 0) + "</td></tr>"; }).join("") +
            biz.lines.map(function (l) { return '<tr><td>支出</td><td>' + esc(l.cat) + '</td><td class="kb-amt pl-dn">¥' + fmt(l.sum, 0) + "</td></tr>"; }).join("") + "</table></div>" : '<p class="note">この年の事業の記録はまだありません。月別で「事業」を選んで記録すると、ここに並びます。</p>') +
          '<div class="pl-kv"><span>収入合計<b class="pl-up">¥' + fmt(biz.inc, 0) + '</b></span><span>経費合計<b class="pl-dn">¥' + fmt(biz.exp, 0) + '</b></span><span>差額<b>¥' + fmt(biz.bal, 0) + "</b></span></div>" +
          '<p class="note">差額は事業所得の目安です（青色申告特別控除・専従者給与などは含みません）。</p>' +
          '<div class="btns"><button type="button" class="btn" id="kb-bizcsv">事業収支をCSVで書き出す</button></div>';
        var loanHtml = '<h3>借入と返済の内訳</h3>' +
          '<p class="note">借入を登録すると、元利均等返済として年ごとの元本と利息、年末残高を計算します。保証料は返済の計算には含めず、借りた年にメモとして出します（経費になるかは契約内容によります）。</p>' +
          '<div class="pl-in"><b>' + (lnEd ? "借入を直す" : "借入を足す") + '</b>' +
          '<div class="grid">' +
          field("kb-ln-name", "名前", lnEd ? lnEd.name : "", "text", ' placeholder="例：住宅ローン"') +
          select("kb-ln-purpose", "使いみち", KB_LOAN_PURPOSES.map(function (p) { return [p, p]; }), lnEd ? lnEd.purpose : "住宅") +
          field("kb-ln-principal", "借入額（円）", lnEd ? lnEd.principal : "", "number") +
          field("kb-ln-rate", "金利（年・%）", lnEd ? lnEd.ratePct : "", "number") +
          field("kb-ln-monthly", "毎月の返済額（円）", lnEd ? lnEd.monthly : "", "number") +
          field("kb-ln-start", "返済を始めた月", lnEd ? lnEd.startYm : "", "month") +
          field("kb-ln-guarantee", "保証料（円・任意）", lnEd && lnEd.guarantee ? lnEd.guarantee : "", "number") +
          field("kb-ln-biz", "事業に使う割合（%）", lnEd ? lnEd.bizRatio : "", "number", ' placeholder="空欄なら住宅0・事業100"') +
          '<span id="kb-ln-homewrap">' + select("kb-ln-home", "住宅の種類（住宅ローン控除）", KB_HOME_TYPES.map(function (t) { return [t, t]; }), lnEd && lnEd.homeType ? lnEd.homeType : "一般（新築）") + "</span>" +
          "</div>" +
          '<div class="btns"><button type="button" class="btn pri" id="kb-lnsave">' + (lnEd ? "更新する" : "追加する") + "</button>" + (lnEd ? '<button type="button" class="btn" id="kb-lncancel">編集をやめる</button>' : "") + "</div>" +
          '<div class="note" id="kb-lnmsg" aria-live="polite"></div></div>' +
          '<div id="kb-lnlist">' + (loanCalc.length ? loanCalc.map(function (c) {
            var l = c.loan, am = c.am, yr = am.years[year], startYear = +l.startYm.slice(0, 4), s = "";
            s += '<div class="pl-in"><b>' + esc(l.name || (l.purpose + "の借入")) + '</b> <span class="tag">' + esc(l.purpose) + "</span>" +
              '<div class="pl-kv"><span>借入額<b>¥' + fmt(l.principal, 0) + '</b></span><span>金利<b>' + fmt(l.ratePct, 2) + '%</b></span><span>毎月の返済<b>¥' + fmt(l.monthly, 0) + '</b></span><span>返済開始<b>' + esc(l.startYm.replace("-", "年")) + "月</b></span>" + (l.bizRatio ? '<span>事業の割合<b>' + fmt(l.bizRatio, 0) + "%</b></span>" : "") + "</div>";
            if (yr) s += '<p class="note">' + year + '年の内訳：元本 ¥' + fmt(yr.principal, 0) + " ・ 利息 ¥" + fmt(yr.interest, 0) + " ・ 年末残高 ¥" + fmt(yr.endBalance, 0) + "（" + yr.months + "か月分）</p>";
            else s += '<p class="note">' + year + "年の返済記録はありません" + (am.paidOff && year > startYear ? "（完済済み）" : year < startYear ? "（借入を始める前）" : "") + "。</p>";
            if (l.guarantee > 0 && startYear === year) s += '<p class="note">保証料 ¥' + fmt(l.guarantee, 0) + "（借りた年に記録）</p>";
            if (am.stuck) s += '<p class="warn">毎月の返済額が利息以下のため、元本が減りません。返済額を見直してください。</p>';
            var hcJump = "";
            if (l.purpose === "住宅") {
              if (!yr) s += '<p class="note">住宅ローン控除：' + (year < startYear ? "借入を始める前の年です。" : "この年の年末残高がないため、目安は出せません。") + "</p>";
              else {
                var hc = kbHomeCredit(l, year, yr.endBalance);
                if (!hc.ok) s += '<p class="note">住宅ローン控除：' + esc(hc.reason) + "</p>";
                else s += '<p class="note"><b>住宅ローン控除の目安</b>（' + hc.nth + "年目／" + hc.years + "年）</p>" +
                  '<div class="pl-kv"><span>年末残高<b>¥' + fmt(yr.endBalance, 0) + '</b></span><span>借入限度額<b>¥' + fmt(hc.limit, 0) + '</b></span><span>控除額の目安<b class="pl-up">¥' + fmt(hc.credit, 0) + "</b></span></div>" +
                  '<p class="note">年末残高と借入限度額の小さいほう × 0.7%です。入居した年は、返済を始めた年で代用しています。要件には、控除を受ける年の合計所得金額が2,000万円以下、床面積が原則50㎡以上などがあります。</p>';
                hcJump = ' <button type="button" class="btn" data-hcgo="1">申請の手順は下の申請ガイドへ</button>';
              }
              s += '<p class="note">令和6・7年入居の制度での目安です。最新は国税庁で確認を。</p>';
            }
            s += '<div class="btns"><button type="button" class="btn" data-lned="' + esc(l.id) + '">編集</button> <button type="button" class="btn danger" data-lndel="' + esc(l.id) + '">削除</button>' + hcJump + "</div></div>";
            return s;
          }).join("") : '<p class="note">借入はまだ登録がありません。上の欄から足せます。</p>') + "</div>" +
          '<div id="kb-hcguide">' + hcGuideInner() + "</div>";
        var assetHtml = '<h3>減価償却の資産</h3>' +
          '<p class="note">10万円以上の備品や建物などは、耐用年数に分けて少しずつ経費にします（定額法）。登録すると、その年の償却費のうち事業に使う割合分を、事業の収支へ自動で入れます。</p>' +
          '<div class="pl-in"><b>' + (asEd ? "資産を直す" : "資産を足す") + '</b>' +
          '<div class="grid">' +
          field("kb-as-name", "名前", asEd ? asEd.name : "", "text", ' placeholder="例：パソコン"') +
          field("kb-as-date", "買った日", asEd ? asEd.date : todayK, "date") +
          field("kb-as-price", "買った金額（円）", asEd ? asEd.price : "", "number") +
          field("kb-as-life", "耐用年数（年）", asEd ? asEd.life : "", "number") +
          select("kb-as-pick", "耐用年数の目安", [["", "目安から選ぶ（任意）"], ["4", "パソコン（4年）"], ["6", "普通自動車（6年）"], ["6", "エアコン（6年）"], ["6", "冷蔵庫（6年）"], ["8", "家具・応接セットなど（8年）"], ["22", "木造の住宅（22年）"], ["47", "鉄骨鉄筋コンクリートの住宅（47年）"]].map(function (o) { return o; }), "") +
          field("kb-as-biz", "事業に使う割合（%）", asEd ? asEd.bizRatio : "", "number", ' placeholder="空欄なら100"') +
          "</div>" +
          '<div class="btns"><button type="button" class="btn pri" id="kb-assave">' + (asEd ? "更新する" : "追加する") + "</button>" + (asEd ? '<button type="button" class="btn" id="kb-ascancel">編集をやめる</button>' : "") + "</div>" +
          '<div class="note" id="kb-asmsg" aria-live="polite"></div></div>' +
          (assets.length ? '<div class="tw"><table><tr><th>名前</th><th>買った日</th><th>金額</th><th>耐用年数</th><th>事業の割合</th><th>' + year + '年の償却費（事業分）</th><th></th></tr>' + assets.map(function (a) {
            var d = kbDepForYear(a, year);
            return "<tr><td>" + esc(a.name || "資産") + "</td><td>" + esc(dayName(a.date)) + '</td><td class="kb-amt">¥' + fmt(a.price, 0) + "</td><td>" + a.life + '年</td><td>' + fmt(a.bizRatio, 0) + '%</td><td class="kb-amt pl-dn">¥' + fmt(d.biz, 0) + (d.total !== d.biz ? "（全体 ¥" + fmt(d.total, 0) + "）" : "") + '</td><td><button type="button" class="btn" data-ased="' + esc(a.id) + '">編集</button> <button type="button" class="btn danger" data-asdel="' + esc(a.id) + '">削除</button></td></tr>';
          }).join("") + "</table></div>" +
          '<div class="pl-kv"><span>' + year + '年の償却費の合計（事業分）<b class="pl-dn">¥' + fmt(depAuto, 0) + "</b></span></div>" : '<p class="note">資産はまだ登録がありません。上の欄から足せます。</p>');
        body.innerHTML = '<h3>家計簿</h3><p class="note">確定申告の準備に使う、年単位のまとめです。記録そのものは月別と同じ家計簿のデータで、この端末の中だけに保存します。</p>' + modeSeg +
          '<div class="btns"><button type="button" class="btn" data-tab="tax">確定申告タブを開く（トレードの損益・給与の整理はこちら）</button></div>' +
          '<div class="jcalh"><button type="button" id="kb-yprev" aria-label="前の年">‹</button><b>' + year + '年</b><button type="button" id="kb-ynext" aria-label="次の年">›</button><button type="button" class="btn" id="kb-ythis">今年</button></div>' +
          '<h3>医療費控除（' + year + '年）</h3>' +
          (meds.length ? '<div class="tw"><table><tr><th>日付</th><th>受けた人</th><th>支払先</th><th>区分</th><th>支払額</th><th>補填額</th></tr>' + meds.map(function (e) {
            return "<tr><td>" + esc(dayName(e.date)) + "</td><td>" + esc(e.person || "") + "</td><td>" + esc(e.payee || "") + "</td><td>" + esc(kbMkind(e) || "—") + '</td><td class="kb-amt pl-dn">¥' + fmt(e.amount, 0) + '</td><td class="kb-amt">' + (e.reimb > 0 ? "−¥" + fmt(e.reimb, 0) : "¥0") + "</td></tr>";
          }).join("") + "</table></div>" : '<p class="note">' + year + '年の医療の支出はまだ記録がありません。月別で、支出・カテゴリ「医療」として記録すると、ここに並びます。</p>') +
          '<div class="pl-kv"><span>支払った医療費の合計<b class="pl-dn">¥' + fmt(mt.paid, 0) + '</b></span><span>補填される金額の合計<b>¥' + fmt(mt.reimb, 0) + '</b></span><span>差引<b>¥' + fmt(mt.net, 0) + "</b></span></div>" +
          '<div class="grid">' + field("kb-inc", "総所得金額等（任意・円）", kbIncome, "number") + "</div>" +
          '<div id="kb-medcalc"></div>' +
          '<p class="note">これは目安です。実際の控除額は、ほかの条件でも変わります。</p>' +
          '<p class="note">セルフメディケーション税制とは併用できません。どちらか一方を選ぶ制度です。</p>' +
          '<p class="note">領収書の保管が必要です。明細は領収書をもとに記録してください。</p>' +
          '<p class="note">最終的な計算と申告は、e-Taxや税務署で確かめてください。</p>' +
          '<div class="btns"><button type="button" class="btn" id="kb-medcsv">医療費の明細をCSVで書き出す</button></div>' +
          '<h3>年間収支まとめ（' + year + '年）</h3>' +
          '<div class="pl-head"><div class="pl-big"><small>' + year + '年の差額（収入−支出）</small><b class="' + (yt.bal < 0 ? "pl-dn" : "") + '">' + (yl.length ? yen(yt.bal, true) : "—") + '<i>円</i></b></div>' +
          '<div class="pl-kv"><span>収入合計<b class="pl-up">' + yen(yt.inc) + '</b></span><span>支出合計<b class="pl-dn">' + yen(yt.out) + '</b></span><span>記録<b>' + yl.length + "件</b></span></div></div>" +
          '<div class="tw"><table><tr><th>月</th><th>収入</th><th>支出</th><th>差額</th></tr>' + kbMonthlyOfYear(all, year).map(function (m) {
            return "<tr><td>" + m.month + "月</td>" + (m.count ? '<td class="kb-amt pl-up">¥' + fmt(m.inc, 0) + '</td><td class="kb-amt pl-dn">¥' + fmt(m.out, 0) + '</td><td class="kb-amt">' + yen(m.bal, true) + "円</td>" : '<td colspan="3" class="note">—</td>') + "</tr>";
          }).join("") + "</table></div>" +
          '<h3>カテゴリ別の合計（' + year + '年）</h3><div id="kb-ycats"></div>' +
          '<div class="btns"><button type="button" class="btn" id="kb-ancsv">年間収支をCSVで書き出す</button></div>' + bizHtml + loanHtml + assetHtml;
        wireMode();
        wireGuide();
        $("#kb-ycats").innerHTML = catsHtml(yl, "年");
        $("#kb-yprev").addEventListener("click", function () { kbYear = year - 1; VIEWS.kakeibo(); });
        $("#kb-ynext").addEventListener("click", function () { kbYear = year + 1; VIEWS.kakeibo(); });
        $("#kb-ythis").addEventListener("click", function () { kbYear = +todayK.slice(0, 4); VIEWS.kakeibo(); });
        var paintMedCalc = function () {
          var raw = $("#kb-inc") ? $("#kb-inc").value : "";
          kbIncome = raw;
          var inc = raw === "" ? null : Number(raw);
          if (inc !== null && (!isFinite(inc) || inc < 0)) inc = null;
          var d = kbDeduction(mt.net, inc);
          $("#kb-medcalc").innerHTML = '<div class="pl-kv"><span>足切り額<b>¥' + fmt(d.ashikiri, 0) + "</b>（" + esc(d.basis) + '）</span><span>控除額の目安<b class="pl-up">¥' + fmt(d.est, 0) + "</b></span></div>" +
            '<p class="note">計算の仕方：控除額の目安 ＝ 差引（¥' + fmt(mt.net, 0) + "）− 足切り額（" + (inc === null ? "10万円" : "総所得金額等の5%と10万円のうち低い方") + "）。" + (d.capped ? "目安が大きいため、上限の200万円で止めています。" : "") + "</p>";
        };
        var incEl = $("#kb-inc"); if (incEl) incEl.addEventListener("input", paintMedCalc);
        paintMedCalc();
        $("#kb-medcsv").addEventListener("click", function () { dl("iryouhi-" + year + ".csv", kbMedCSV(meds)); });
        $("#kb-ancsv").addEventListener("click", function () { dl("nenkanshushi-" + year + ".csv", kbAnnualCSV(all, year)); });
        $("#kb-bizcsv").addEventListener("click", function () { dl("jigyoshushi-" + year + ".csv", kbBizCSV(all, year, biz)); });
        /* --- 借入の登録・編集・削除 --- */
        var lnPurpose = $("#kb-ln-purpose"), lnHomeWrap = $("#kb-ln-homewrap");
        var syncLnHome = function () { if (lnHomeWrap) lnHomeWrap.style.display = lnPurpose && lnPurpose.value === "住宅" ? "" : "none"; };
        if (lnPurpose) lnPurpose.addEventListener("change", syncLnHome);
        syncLnHome();
        $("#kb-lnsave").addEventListener("click", function () {
          var msg = $("#kb-lnmsg"), purpose = lnPurpose.value;
          var principal = Number($("#kb-ln-principal").value), rate = Number($("#kb-ln-rate").value), monthly = Number($("#kb-ln-monthly").value), startYm = $("#kb-ln-start").value;
          var guarantee = Number($("#kb-ln-guarantee").value), bizRaw = $("#kb-ln-biz").value, bizR = bizRaw === "" ? kbBizRatioDef(purpose) : Number(bizRaw);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startYm)) { msg.textContent = "返済を始めた月を入れてください。"; return; }
          if (!isFinite(principal) || principal <= 0) { msg.textContent = "借入額は0より大きい数字で入れてください。"; return; }
          if (!isFinite(monthly) || monthly <= 0) { msg.textContent = "毎月の返済額は0より大きい数字で入れてください。"; return; }
          if (!isFinite(rate) || rate < 0) rate = 0;
          if (!isFinite(guarantee) || guarantee < 0) guarantee = 0;
          if (!isFinite(bizR)) bizR = kbBizRatioDef(purpose);
          bizR = Math.min(100, Math.max(0, bizR));
          var rec = { id: lnEd ? lnEd.id : uid(), name: $("#kb-ln-name").value.trim() || (purpose + "の借入"), purpose: purpose, principal: principal, ratePct: rate, monthly: monthly, startYm: startYm, guarantee: guarantee, bizRatio: bizR };
          if (purpose === "住宅") rec.homeType = $("#kb-ln-home").value;
          var arr = kbLoans().filter(function (x) { return x.id !== rec.id; }); arr.unshift(rec);
          if (put(KAKEIBO_LOANS, arr, "家計簿")) { kbLoanEdit = null; VIEWS.kakeibo(); }
        });
        var lnCancel = $("#kb-lncancel"); if (lnCancel) lnCancel.addEventListener("click", function () { kbLoanEdit = null; VIEWS.kakeibo(); });
        $("#kb-lnlist").addEventListener("click", function (e) {
          var go = e.target.closest("[data-hcgo]");
          if (go) { var gel = $("#kb-hcguide"); if (gel) gel.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
          var del = e.target.closest("[data-lndel]"), edb = e.target.closest("[data-lned]");
          if (del) { var did = del.getAttribute("data-lndel"); if (confirm("この借入を削除しますか？（元に戻せません）") && put(KAKEIBO_LOANS, kbLoans().filter(function (x) { return x.id !== did; }), "家計簿")) { if (kbLoanEdit && kbLoanEdit.id === did) kbLoanEdit = null; VIEWS.kakeibo(); } return; }
          if (edb) { kbLoanEdit = kbLoans().filter(function (x) { return x.id === edb.getAttribute("data-lned"); })[0] || null; VIEWS.kakeibo(); }
        });
        /* --- 減価償却の資産の登録・編集・削除 --- */
        var asPick = $("#kb-as-pick");
        if (asPick) asPick.addEventListener("change", function () { if (asPick.value) $("#kb-as-life").value = asPick.value; });
        $("#kb-assave").addEventListener("click", function () {
          var msg = $("#kb-asmsg"), date = $("#kb-as-date").value, price = Number($("#kb-as-price").value), life = Math.round(Number($("#kb-as-life").value));
          var bizRaw = $("#kb-as-biz").value, bizR = bizRaw === "" ? 100 : Number(bizRaw);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.textContent = "買った日を入れてください。"; return; }
          if (!isFinite(price) || price <= 0) { msg.textContent = "買った金額は0より大きい数字で入れてください。"; return; }
          if (!isFinite(life) || life < 2) { msg.textContent = "耐用年数は2年以上の数字で入れてください（目安からも選べます）。"; return; }
          if (!isFinite(bizR)) bizR = 100;
          bizR = Math.min(100, Math.max(0, bizR));
          var rec = { id: asEd ? asEd.id : uid(), name: $("#kb-as-name").value.trim() || "資産", date: date, price: price, life: life, bizRatio: bizR };
          var arr = kbAssets().filter(function (x) { return x.id !== rec.id; }); arr.unshift(rec);
          if (put(KAKEIBO_ASSETS, arr, "家計簿")) { kbAssetEdit = null; VIEWS.kakeibo(); }
        });
        var asCancel = $("#kb-ascancel"); if (asCancel) asCancel.addEventListener("click", function () { kbAssetEdit = null; VIEWS.kakeibo(); });
        body.querySelectorAll("[data-ased], [data-asdel]").forEach(function (b) { b.addEventListener("click", function () {
          var delId = b.getAttribute("data-asdel"), edId = b.getAttribute("data-ased");
          if (delId) { if (confirm("この資産を削除しますか？（元に戻せません）") && put(KAKEIBO_ASSETS, kbAssets().filter(function (x) { return x.id !== delId; }), "家計簿")) { if (kbAssetEdit && kbAssetEdit.id === delId) kbAssetEdit = null; VIEWS.kakeibo(); } return; }
          if (edId) { kbAssetEdit = kbAssets().filter(function (x) { return x.id === edId; })[0] || null; VIEWS.kakeibo(); }
        }); });
        return;
      }
      /* ---------- 月別：家の収入と支出を月ごとに（従来の画面） ---------- */
      var formType = ed ? ed.type : "out";
      var formScope = ed ? ed.scope : kbScopeLast;
      var catSel = function (scope, type, val) { return select("kb-cat", "カテゴリ", kbCats(scope, type).map(function (c) { return [c, c]; }), val); };
      var medHtml = function (e) {
        return '<div class="grid">' +
          field("kb-person", "医療を受けた人（任意）", e ? e.person || "" : "", "text", ' placeholder="例：本人"') +
          field("kb-payee", "支払先（病院・薬局）", e ? e.payee || "" : "", "text", ' placeholder="例：〇〇病院"') +
          select("kb-mkind", "医療費の区分", KB_MKINDS.map(function (k) { return [k, k]; }), e && e.mkind ? e.mkind : "診療・治療") +
          field("kb-reimb", "補填される金額（円）", e && e.reimb ? e.reimb : "", "number") + "</div>";
      };
      var syncMed = function () {
        var w = $("#kb-medwrap"); if (!w) return;
        var cat = $("#kb-cat") ? $("#kb-cat").value : "";
        var show = formType === "out" && formScope === "life" && cat === "医療";
        w.innerHTML = show ? medHtml(ed && ed.type === "out" && ed.scope !== "biz" && ed.cat === "医療" ? ed : null) : "";
      };
      // 支出のカテゴリごとに、確定申告の経費ガイドの判定の目安を見せる（2b）
      var syncCatHint = function () {
        var w = $("#kb-cathint"); if (!w) return;
        if (formType !== "out") { w.innerHTML = ""; return; }
        var cat = $("#kb-cat") ? $("#kb-cat").value : "", map = formScope === "biz" ? TAX_CAT_MAP_BIZ : TAX_CAT_MAP_LIFE, row = null;
        for (var i = 0; i < map.length; i++) if (map[i][0] === cat) { row = map[i]; break; }
        w.innerHTML = row ? "経費の目安（確定申告の経費ガイド）：<b>" + esc(row[1]) + "</b> ― " + esc(row[2]) + ' <button type="button" class="btn sm" data-tab="tax">経費ガイドを見る</button>' : "";
      };
      body.innerHTML = '<h3>家計簿</h3><p class="note">家の収入と支出を月ごとに記録します。トレード収支とは別の記録で、この端末の中だけに保存し、どこにも送信しません。</p>' + modeSeg +
        '<div id="kb-head"></div><div id="kb-w3"></div>' +
        '<div class="jcalh"><button type="button" id="kb-prev" aria-label="前の月">‹</button><b id="kb-title"></b><button type="button" id="kb-next" aria-label="次の月">›</button><button type="button" class="btn" id="kb-this">今月</button></div>' +
        '<div class="pl-in"><b>' + (ed ? "記録を直す" : "記録を足す") + '</b>' +
        '<div class="kb-pair">' +
        '<div class="kb-pair-row"><span class="kb-pair-lab">収支</span><div class="pl-seg kb-seg-t" role="group" aria-label="収入か支出か">' + [["in", "収入"], ["out", "支出"]].map(function (x) { return '<button type="button" data-kt="' + x[0] + '" aria-pressed="' + (x[0] === formType) + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
        '<div class="kb-pair-row"><span class="kb-pair-lab">区分</span><div class="pl-seg kb-seg-s" role="group" aria-label="生活か事業か">' + [["life", "生活"], ["biz", "事業"]].map(function (x) { return '<button type="button" data-ks="' + x[0] + '" aria-pressed="' + (x[0] === formScope) + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
        "</div>" +
        '<div class="grid"><span>' + field("kb-date", "日付", ed ? ed.date : (kbLastDate || todayK), "date") + '<button type="button" class="btn" id="kb-today">今日</button></span>' + '<span id="kb-catwrap">' + catSel(formScope, formType, ed ? ed.cat : kbCats(formScope, formType)[0]) + "</span>" +
        field("kb-amt", "金額（円）", ed ? ed.amount : "", "number") + field("kb-memo", "メモ（任意）", ed ? ed.memo : "") + "</div>" +
        '<div id="kb-medwrap"></div>' +
        '<div class="note" id="kb-cathint"></div>' +
        '<div class="btns"><button type="button" class="btn pri" id="kb-save">' + (ed ? "更新する" : "追加する") + "</button>" + (ed ? '<button type="button" class="btn" id="kb-cancel">編集をやめる</button>' : "") + "</div>" +
        '<div class="note" id="kb-msg" aria-live="polite"></div>' +
        '<p class="note">過去の日付も選べます。保存すると、その月の画面に移動します。</p></div>' +
        '<h3>この月の記録</h3><div id="kb-list"></div>' +
        '<h3>カテゴリ別の合計</h3><div id="kb-cats"></div>';
      wireMode();
      var rebuildCat = function () {
        var cur = $("#kb-cat") ? $("#kb-cat").value : "", set = kbCats(formScope, formType);
        $("#kb-catwrap").innerHTML = catSel(formScope, formType, set.indexOf(cur) >= 0 ? cur : set[0]);
        syncMed(); syncCatHint();
      };
      body.querySelectorAll("[data-kt]").forEach(function (b) { b.addEventListener("click", function () {
        formType = b.getAttribute("data-kt");
        body.querySelectorAll("[data-kt]").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-kt") === formType ? "true" : "false"); });
        rebuildCat();
      }); });
      body.querySelectorAll("[data-ks]").forEach(function (b) { b.addEventListener("click", function () {
        formScope = b.getAttribute("data-ks"); kbScopeLast = formScope;
        body.querySelectorAll("[data-ks]").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-ks") === formScope ? "true" : "false"); });
        rebuildCat();
      }); });
      $("#kb-today").addEventListener("click", function () { $("#kb-date").value = todayK; });
      $("#kb-catwrap").addEventListener("change", syncMed);
      $("#kb-catwrap").addEventListener("change", syncCatHint);
      syncMed(); syncCatHint();
      var paint = function () {
        var list = kbMonthList(kakeibo(), ym).slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        var t = kbTotals(list);
        $("#kb-title").textContent = ym.slice(0, 4) + "年" + (+ym.slice(5, 7)) + "月";
        var lt = kbTotals(list.filter(function (e) { return e.scope !== "biz"; })), bt = kbTotals(list.filter(function (e) { return e.scope === "biz"; }));
        var kyen = function (v) { return (v < 0 ? "−¥" : "¥") + fmt(Math.abs(v), 0); };
        $("#kb-head").innerHTML = '<div class="kb-ps-h">' + (+ym.slice(5, 7)) + '月のまとめ ― ニコイチ表</div>' +
          '<div class="tw"><table class="kb-ps"><tr><th></th><th class="kb-ps-life">生活</th><th class="kb-ps-biz">事業</th></tr>' +
          '<tr><td>収入</td><td class="kb-amt">¥' + fmt(lt.inc, 0) + '</td><td class="kb-amt">¥' + fmt(bt.inc, 0) + "</td></tr>" +
          '<tr><td>支出</td><td class="kb-amt">¥' + fmt(lt.out, 0) + '</td><td class="kb-amt">¥' + fmt(bt.out, 0) + "</td></tr>" +
          '<tr><td>差額</td><td class="kb-amt kb-ps-bal">' + kyen(lt.bal) + '</td><td class="kb-amt kb-ps-bal">' + kyen(bt.bal) + "</td></tr>" +
          '<tr class="kb-ps-total"><td>合計</td><td colspan="2">収入 ¥' + fmt(t.inc, 0) + " ・ 支出 ¥" + fmt(t.out, 0) + ' ・ 差額 <b class="kb-ps-bal">' + kyen(t.bal) + "</b></td></tr></table></div>" +
          '<p class="note">事業の差額は、そのまま事業所得の目安になります。</p>';
        /* ---------- 月のまとめ「3つの財布」：生活・事業は家計簿から、トレードは日誌と日次入力から（同じ月） ---------- */
        var allKb = kakeibo(), jr = journal(), di = dailyIn();
        var tm = tradeMonthAgg(jr, di, ym);
        var pym = (function () { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 2; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + String(m + 1).padStart(2, "0"); })();
        var lt2 = kbTotals(kbMonthList(allKb, pym).filter(function (e) { return e.scope !== "biz"; })), bt2 = kbTotals(kbMonthList(allKb, pym).filter(function (e) { return e.scope === "biz"; })), tm2 = tradeMonthAgg(jr, di, pym);
        var w3yen = function (v) { return "¥" + fmt(v, 0); }, w3bal = function (v) { return (v < 0 ? "−¥" : "¥") + fmt(Math.abs(v), 0); };
        var tot3 = { inc: lt.inc + bt.inc + tm.inc, out: lt.out + bt.out + tm.out, bal: lt.bal + bt.bal + tm.bal };
        var w3 = '<div class="kb-ps-h">お金の流れ ― 月のまとめ</div>' +
          '<div class="tw"><table class="kb-ps"><tr><th></th><th class="kb-ps-life">生活</th><th class="kb-ps-biz">事業</th><th class="kb-ps-trade">トレード</th><th class="kb-ps-all">合計</th></tr>' +
          '<tr><td>収入</td><td class="kb-amt">' + w3yen(lt.inc) + '</td><td class="kb-amt">' + w3yen(bt.inc) + '</td><td class="kb-amt">' + w3yen(tm.inc) + '</td><td class="kb-amt">' + w3yen(tot3.inc) + "</td></tr>" +
          '<tr><td>支出</td><td class="kb-amt">' + w3yen(lt.out) + '</td><td class="kb-amt">' + w3yen(bt.out) + '</td><td class="kb-amt">' + w3yen(tm.out) + '</td><td class="kb-amt">' + w3yen(tot3.out) + "</td></tr>" +
          '<tr><td>差額</td><td class="kb-amt kb-w3-life">' + w3bal(lt.bal) + '</td><td class="kb-amt kb-w3-biz">' + w3bal(bt.bal) + '</td><td class="kb-amt kb-w3-trade">' + w3bal(tm.bal) + '</td><td class="kb-amt kb-ps-bal">' + w3bal(tot3.bal) + "</td></tr></table></div>" +
          '<p class="note">トレードの収入は利益の合計、支出は損失の合計です（手入力の記録から自動集計）</p>' +
          '<div class="kb-ps-h">トレードの内訳</div>' +
          (tm.any ? '<div class="tw"><table><tr><th>銘柄</th><th>利益</th><th>損失</th><th>差額</th></tr>' + tm.insts.map(function (a) {
            if (!a.trades) return "<tr><td>" + esc(a.name) + '</td><td colspan="3" class="note">取引なし</td></tr>';
            return "<tr><td>" + esc(a.name) + '</td><td class="kb-amt pl-up">' + (a.inc ? "+" + w3yen(a.inc) : "―") + '</td><td class="kb-amt pl-dn">' + (a.out ? "−" + w3yen(a.out) : "―") + '</td><td class="kb-amt">' + (a.has ? w3bal(a.bal) : "―") + "</td></tr>";
          }).join("") + "</table></div>" +
            '<p class="note">勝ち日 ' + tm.winDays + "日 ・ 負け日 " + tm.lossDays + "日 ・ 見送り日 " + tm.skipDays + "日</p>" +
            (tm.hasDaily ? '<p class="note">日次入力のある日は、上の「トレード」欄では日次入力の額を正としています。銘柄別の内訳は日誌の取引ごとの集計です。</p>' : "")
            : '<p class="note">この月のトレード記録はまだありません。</p>');
        var prow = function (label, cls, now, prev) {
          var dd = now - prev, arrow = dd > 0 ? '<span class="pl-up">▲</span> ' : dd < 0 ? '<span class="pl-dn">▼</span> ' : "";
          return "<span>" + arrow + '<span class="' + cls + '">' + label + "</span><b>" + w3bal(now) + "</b>（先月 " + w3bal(prev) + "）</span>";
        };
        w3 += '<div class="kb-ps-h">先月との差額の変化</div><div class="pl-kv">' + prow("生活", "kb-w3-life", lt.bal, lt2.bal) + prow("事業", "kb-w3-biz", bt.bal, bt2.bal) + prow("トレード", "kb-w3-trade", tm.bal, tm2.bal) + "</div>";
        $("#kb-w3").innerHTML = w3;
        $("#kb-list").innerHTML = list.length ? '<div class="tw"><table><tr><th>日付</th><th>カテゴリ</th><th>メモ</th><th>金額</th><th></th></tr>' + list.map(function (e) {
          return '<tr data-krow="' + esc(e.id) + '" class="kb-row-' + (e.scope === "biz" ? "biz" : "life") + '"><td>' + esc(dayName(e.date)) + '</td><td><span class="tag">' + esc(e.cat) + '</span></td><td>' + esc(e.memo || "") + '</td><td class="kb-amt' + (e.type === "in" ? " pl-up" : "") + '">' + (e.type === "in" ? "+" : "−") + "¥" + fmt(e.amount, 0) + '</td><td><button type="button" class="btn" data-ked="' + esc(e.id) + '">編集</button> <button type="button" class="btn danger" data-kdel="' + esc(e.id) + '">削除</button></td></tr>';
        }).join("") + "</table></div>" : '<p class="note">まだ記録がありません。上の欄から最初の1件を足せます。</p>';
        $("#kb-cats").innerHTML = catsHtml(list, "月");
      };
      var shift = function (dm) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + dm; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; kbYm = y + "-" + String(m + 1).padStart(2, "0"); kbEdit = null; VIEWS.kakeibo(); };
      $("#kb-prev").addEventListener("click", function () { shift(-1); });
      $("#kb-next").addEventListener("click", function () { shift(1); });
      $("#kb-this").addEventListener("click", function () { kbYm = todayK.slice(0, 7); kbEdit = null; VIEWS.kakeibo(); });
      $("#kb-save").addEventListener("click", function () {
        var date = $("#kb-date").value, amt = Number($("#kb-amt").value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $("#kb-msg").textContent = "日付を入れてください。"; return; }
        if (!isFinite(amt) || amt <= 0) { $("#kb-msg").textContent = "金額は0より大きい数字で入れてください。"; return; }
        var rec = { id: ed ? ed.id : uid(), date: date, type: formType, scope: formScope, cat: $("#kb-cat").value, amount: amt, memo: $("#kb-memo").value.trim() };
        if (ed && ed.fromTrade) rec.fromTrade = ed.fromTrade;  // 転記の印は編集しても引き継ぐ（消すと二重転記できてしまう）
        if (formType === "out" && formScope === "life" && rec.cat === "医療") {
          var person = $("#kb-person") ? $("#kb-person").value.trim() : "", payee = $("#kb-payee") ? $("#kb-payee").value.trim() : "", mkind = $("#kb-mkind") ? $("#kb-mkind").value : "", reimb = Number($("#kb-reimb") ? $("#kb-reimb").value : "");
          if (person) rec.person = person;
          if (payee) rec.payee = payee;
          if (KB_MKINDS.indexOf(mkind) >= 0) rec.mkind = mkind;
          if (isFinite(reimb) && reimb > 0) rec.reimb = reimb;
        }
        var all = kakeibo().filter(function (x) { return x.id !== rec.id; }); all.unshift(rec);
        if (put(KAKEIBO, all, "家計簿")) { kbEdit = null; kbLastDate = date; kbYm = date.slice(0, 7); VIEWS.kakeibo(); $("#kb-msg").textContent = "保存しました。"; }
      });
      var cancel = $("#kb-cancel"); if (cancel) cancel.addEventListener("click", function () { kbEdit = null; VIEWS.kakeibo(); });
      $("#kb-list").addEventListener("click", function (e) {
        var del = e.target.closest("[data-kdel]"), edb = e.target.closest("[data-ked]"), row = e.target.closest("[data-krow]");
        if (del) { var did = del.getAttribute("data-kdel"); if (confirm("この記録を削除しますか？（元に戻せません）") && put(KAKEIBO, kakeibo().filter(function (x) { return x.id !== did; }), "家計簿")) { if (kbEdit && kbEdit.id === did) kbEdit = null; VIEWS.kakeibo(); } return; }
        var id = edb ? edb.getAttribute("data-ked") : row ? row.getAttribute("data-krow") : "";
        if (id) { kbEdit = kakeibo().filter(function (x) { return x.id === id; })[0] || null; VIEWS.kakeibo(); var a = $("#kb-amt"); if (a) a.focus(); }
      });
      paint();
    },

    /* ---------- 確定申告：年単位でトレード・給与・経費を整理する（計算と整理の道具。個別の税務判断はしない） ---------- */
    tax: function () {
      // 丸字フォント（M PLUS Rounded 1c）の読み込みは、確定申告タブを開いたときだけ・1回だけ。
      // 読み込めない環境では、CSS 側のフォールバック（システムの丸字・サンセリフ）でそのまま表示する
      if (!document.getElementById("td-rounded-font")) {
        var pc1 = document.createElement("link"); pc1.rel = "preconnect"; pc1.href = "https://fonts.googleapis.com"; document.head.appendChild(pc1);
        var pc2 = document.createElement("link"); pc2.rel = "preconnect"; pc2.href = "https://fonts.gstatic.com"; pc2.crossOrigin = "anonymous"; document.head.appendChild(pc2);
        var lk = document.createElement("link"); lk.id = "td-rounded-font"; lk.rel = "stylesheet";
        lk.href = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap";
        document.head.appendChild(lk);
      }
      var todayK = C.dayKey(Date.now()), rows = journal(), daily = dailyIn(), kb = kakeibo();
      var data = taxData(), years = taxYears(rows, daily, data, Date.now());
      var year = taxYear && years.indexOf(String(taxYear)) >= 0 ? taxYear : +todayK.slice(0, 4);
      var entry = taxYearEntry(data, year), tr = taxTradeYear(rows, daily, year);
      var depAuto = 0, intAuto = 0;
      kbAssets().forEach(function (a) { depAuto += kbDepForYear(a, year).biz; });
      kbLoans().forEach(function (l) { if (l.purpose === "事業") { var yr = kbAmortize(l).years[year]; if (yr) intAuto += Math.round(yr.interest * l.bizRatio / 100); } });
      // 事業の目安は、転記した記録（fromTrade＝トレードの損益そのもので、上のトレード欄で数える）を除いた家計簿で出す（二重に数えないため。家計簿タブ側の事業の収支の表示は変えない）
      var biz = kbBizSummary(kb.filter(function (e) { return !e.fromTrade; }), year, depAuto, intAuto), bizHas = kbYearList(kb, year).some(function (e) { return e.scope === "biz"; });
      var split = taxSplit(tr.total.pnl, entry.domesticFuturesPnl);
      var overseasForCalc = split.known ? split.overseas : tr.total.pnl;
      var comb = taxCombine({ salaryAfter: entry.salary.afterDeduction, overseas: overseasForCalc, expensesFinal: entry.expensesFinal, cryptoPnl: entry.cryptoPnl, bizBal: bizHas ? biz.bal : null });
      var hint = taxFilingHint(comb.nonSalary), cand = taxExpenseCandidates(kb, year), carryRows = taxCarryRows(data.carry, year);
      // フェーズ2b：住宅ローン控除・着地見込み・ふるさと納税。着地見込みは、給与の所得控除の合計額が入っているときだけ出す
      var hs = data.housing, hc = taxHomeCredit(hs, year);
      var carryUsable = carryRows.reduce(function (a, r) { return a + (r.usable ? r.amount : 0); }, 0);
      var est = taxEstimate({ salaryAfter: entry.salary.afterDeduction, tradeMisc: comb.tradeMisc || 0, cryptoMisc: comb.cryptoMisc || 0, bizBal: bizHas ? biz.bal : 0, deductionsTotal: entry.salary.deductionsTotal, domestic: split.known ? split.domestic : 0, carryUsable: carryUsable, withheld: entry.salary.withheld, housingCredit: hc.state === "ok" ? hc.credit : 0 });
      var fur = est ? taxFurusatoLimit(est.shotokuWari, est.rate, est.totalIncome) : null;
      var don = taxDonationPickups(kb, year);
      // 住宅ローン控除の「所得税から引ききれない分」。所得税額は、任意入力があればそれを、なければ着地見込みの概算を使う
      var hsTaxIn = hs.incomeTax[String(year)], hsTaxSrc = hsTaxIn != null ? "入力した所得税額" : (est ? "着地見込みの概算" : null);
      var hov = hc.state === "ok" && hsTaxSrc ? taxHomeOverflow(hc.credit, hsTaxIn != null ? hsTaxIn : est.national, est ? est.totalIncome : (comb.total || 0)) : null;
      // ---------- フェーズ2c の値 ----------
      // 突合（つきあわせ）：アプリの記録（日次入力）の年合計・月別と、MT5 など業者のレポートから転記した値の照らし合わせ
      var reconA = taxReconAnnual(tr.total.pnl, entry.mt5Annual);
      var reconM = taxReconMonths(tr.months || [], entry.mt5Months);
      // 青色シミュレーションの対象：いま雑所得などで数えている業務の損益（経費を引いたあと）＋事業分の合計
      var blueBase = (split.known ? split.overseas : tr.total.pnl) - (entry.expensesFinal || 0) + (entry.cryptoPnl || 0) + (bizHas ? biz.bal : 0);
      var blue = taxBlueSim(blueBase);
      // 転記シート（申告書のマス目対応も兼ねる）。医療費控除の目安は、家計簿の医療の記録（支払額−補填額）から、
      // 足切り（総所得金額等の5%と10万円の小さい方）と上限200万円を当てて出す（家計簿の「申告用」の目安と同じ考え方）
      var medT2c = kbMedTotals(kbMedical(kb, year));
      var incomeForMed = est ? est.totalIncome : (comb.total !== null ? comb.total + Math.max(0, entry.domesticFuturesPnl || 0) : null);
      var medicalEst2c = null;
      if (medT2c.net > 0 && incomeForMed !== null) medicalEst2c = Math.max(0, Math.min(medT2c.net - Math.min(Math.floor(incomeForMed * 0.05), 100000), 2000000));
      var sheetRows = taxSheetRows({
        salaryGross: entry.salary.gross, overseasIncome: split.known ? split.overseas : null, expensesFinal: entry.expensesFinal,
        cryptoMisc: entry.cryptoPnl !== null && entry.cryptoPnl > 0 ? entry.cryptoPnl : null,
        bizBal: bizHas ? biz.bal : null, totalIncome: est ? est.totalIncome : (comb.total !== null ? comb.total + Math.max(0, entry.domesticFuturesPnl || 0) : null),
        domesticPlus: entry.domesticFuturesPnl !== null && entry.domesticFuturesPnl > 0 ? entry.domesticFuturesPnl : null,
        carryUsable: carryUsable, housingCredit: hc.state === "ok" ? hc.credit : null,
        medicalEst: medicalEst2c !== null && medicalEst2c > 0 ? medicalEst2c : null,
        donation: don.count ? don.total : null, withheld: entry.salary.withheld,
        balanceAbs: est && est.balance !== null ? Math.abs(est.balance) : null,
        balanceLabel: est && est.balance !== null ? (est.balance >= 0 ? "追加で納める額の概算" : "戻ってくる額（還付＝かんぷ）の概算") : ""
      });
      var prepItems = taxPrepItems(year), prepDone = prepItems.filter(function (p) { return data.prep.checks[p.id]; }).length;
      var openDone = ["step0", "step1", "step2", "step3", "step4", "step5"].filter(function (k) { return data.opening.checks[k]; }).length;
      var archRow = data.archive[String(year)] || {};
      var archDone = TAX_ARCHIVE_ITEMS.filter(function (a2) { return archRow[a2.id]; }).length;
      var yen = function (v) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + "¥" + fmt(Math.abs(v), 0); };
      var yen0 = function (v) { return v == null ? "—" : "¥" + fmt(v, 0); };
      var pcls = function (v) { return v > 0 ? "pl-up" : v < 0 ? "pl-dn" : ""; };
      var yi = years.indexOf(String(year));
      var monthRows = tr.months.map(function (m) {
        return '<tr><td>' + m.month + '月</td><td class="' + (m.pnl == null ? "" : pcls(m.pnl)) + '">' + (m.pnl == null ? "—" : yen(m.pnl)) + '</td><td class="sub">' + (m.days ? "取引 " + m.days + "日（勝ち " + m.win + "・負け " + m.loss + "）" : "記録なし") + '</td></tr>';
      }).join("");
      var instRows = tr.insts.map(function (g) {
        return '<tr><td>' + esc(g.name) + '</td><td class="' + pcls(g.bal) + '">' + yen(g.bal) + '</td><td class="sub">勝ち ' + yen(g.inc) + '・負け ' + yen(-g.out) + '（' + g.trades + '件）</td></tr>';
      }).join("");
      var bizCandRows = cand.bizRows.map(function (r) { return '<tr><td>' + esc(r.cat) + '</td><td>¥' + fmt(r.sum, 0) + '</td></tr>'; }).join("");
      var apRows = cand.lifeRows.map(function (r, i) {
        var ap = entry.apportion[r.cat] || {}, apEst = taxApportionEst(r.sum, ap.ratio);
        return '<tr><td>' + esc(r.cat) + '</td><td>¥' + fmt(r.sum, 0) + '</td>' +
          '<td><input id="tx-ap-r-' + i + '" type="number" min="0" max="100" step="1" value="' + (ap.ratio == null ? "" : ap.ratio) + '" placeholder="％"></td>' +
          '<td><input id="tx-ap-m-' + i + '" type="text" value="' + esc(ap.memo || "") + '" placeholder="根拠のメモ" style="min-width:110px"></td>' +
          '<td>' + (apEst == null ? "—" : "¥" + fmt(apEst, 0)) + '</td></tr>';
      }).join("");
      var sal = entry.salary;
      var combRows =
        '<tr><td>給与所得（控除後の金額）</td><td>' + yen0(sal.afterDeduction) + '</td></tr>' +
        '<tr><td>トレードの雑所得（海外分 − 経費の確定値' + (split.known ? "" : "／国内分が未入力のため年合計で仮置き") + '）</td><td>' + yen0(comb.tradeMisc) + '</td></tr>' +
        '<tr><td>暗号資産の雑所得（メモ欄の入力から）</td><td>' + (entry.cryptoPnl == null ? "—" : yen0(comb.cryptoMisc)) + '</td></tr>' +
        (bizHas ? '<tr><td>事業所得の目安（家計簿の事業分）</td><td>' + yen(biz.bal) + '</td></tr>' : "") +
        '<tr><td>給与以外の所得の合計</td><td>' + yen(comb.nonSalary) + '</td></tr>' +
        '<tr><td><b>合計（イメージ）</b></td><td><b>' + (comb.total == null ? "—（給与の入力が要ります）" : yen(comb.total)) + '</b></td></tr>';
      var segDefs = [["給与所得", sal.afterDeduction, "#7fb2c9"], ["トレード（海外分）", comb.tradeMisc, "#e3b867"], ["暗号資産", comb.cryptoMisc, "#b48ede"], ["事業の目安", bizHas ? biz.bal : null, "#5fd99a"]];
      var segSum = segDefs.reduce(function (a, s) { return a + Math.max(0, s[1] || 0); }, 0);
      var segHtml = segSum > 0 ? '<div class="pl-bar" style="margin:8px 0 4px">' + segDefs.map(function (s) {
        var w = Math.max(0, s[1] || 0) / segSum * 100;
        return w > 0 ? '<span style="width:' + w.toFixed(1) + '%;background:' + s[2] + '" title="' + s[0] + '"></span>' : "";
      }).join("") + '</div><div class="sub">' + segDefs.map(function (s) { return '<span style="color:' + s[2] + '">■</span> ' + s[0]; }).join("　") + '</div>' : "";
      var hintLine = hint.level === "over"
        ? '<p><b>照らし合わせ：</b>この端末の記録では、給与以外の所得の合計（目安 ¥' + fmt(comb.nonSalary, 0) + '）が20万円を超えています。一般論の目安では、申告が必要になる側です。</p>'
        : hint.level === "within"
          ? '<p><b>照らし合わせ：</b>この端末の記録では、給与以外の所得の合計（目安 ¥' + fmt(comb.nonSalary, 0) + '）は20万円以下です。ただし、還付（かんぷ：払いすぎた税金の戻り）を受けたい場合や住民税の申告など、申告が要る場合があります。</p>'
          : '<p><b>照らし合わせ：</b>給与以外の所得の合計が出せていません（給与の入力などを確認してください）。</p>';
      var carryHtml = carryRows.length ? '<table><tr><th>赤字が出た年</th><th>金額</th><th>使える最後の年</th><th>状態</th><th></th></tr>' + carryRows.map(function (r) {
        var st = r.expired ? '<span class="pl-dn">繰り越しの期限を過ぎています</span>' : r.usable ? (r.remaining === 0 ? "今年が使える最後の年です" : "あと " + r.remaining + " 年使えます") : "翌年から使えます";
        return '<tr><td>' + r.fromYear + '年</td><td>¥' + fmt(r.amount, 0) + '</td><td>' + r.lastYear + '年分まで</td><td class="sub">' + st + '</td><td><button type="button" class="btn sm" data-carrydel="' + esc(r.id) + '">削除</button></td></tr>';
      }).join("") + '</table>' : '<p class="sub">まだ行がありません。国内分で赤字が出た年に、その年の行を足してください。</p>';
      var carryYearOpts = ""; for (var cy = year; cy >= year - 10; cy--) carryYearOpts += '<option value="' + cy + '"' + (cy === year ? " selected" : "") + '>' + cy + '年</option>';
      /* ----- フェーズ2bのセクション ----- */
      // 経費ガイド（判定表と家計簿カテゴリの対応）
      var guideTable = function (grade, withProof) {
        var rows = TAX_GUIDE.filter(function (g) { return g.grade === grade; }).map(function (g) {
          return '<tr><td>' + esc(g.name) + '</td><td class="sub">' + esc(g.why) + '</td>' + (withProof ? '<td class="sub">' + esc(g.proof || "") + '</td>' : "") + '</tr>';
        }).join("");
        return '<table><tr><th>費目</th><th>理由・考え方</th>' + (withProof ? '<th>残すべき証拠</th>' : "") + '</tr>' + rows + '</table>';
      };
      var catMapTable = function (map) {
        return '<table><tr><th>家計簿のカテゴリ</th><th>判定</th><th>目安</th></tr>' + map.map(function (r) {
          return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="sub">' + esc(r[2]) + '</td></tr>';
        }).join("") + '</table>';
      };
      var guideHtml =
        '<h3 class="vtitle">経費ガイド（費目ごとの判定表）</h3>' +
        '<p class="sub">ふだんの生活の支払いのうち、どれが申告の経費（けいひ：収入を得るために要した費用）にできるかの、一般的な目安です。<b>判定は一般論で、あなたの支出が経費になるかは個別の事情で変わります。</b>迷う場合は、税務署・税理士に確認してください。考え方のくわしい説明は「学ぶ」の確定申告ガイドにあります。</p>' +
        '<p style="margin:10px 0 2px"><b>A：全額を経費にできる（仕事専用・直接必要なもの）</b></p>' + guideTable("A", true) +
        '<p style="margin:12px 0 2px"><b>B：按分（あんぶん）すれば一部を経費にできる（家と仕事で共用しているもの）</b></p>' +
        '<p class="sub">按分とは、1つの支出を「仕事で使った割合」で分けることです。割合の根拠（時間・面積など）をメモに残しておくと、あとで説明しやすくなります。上の「経費の要約」で割合を入れると、按分後の目安が出ます。</p>' + guideTable("B", true) +
        '<p style="margin:12px 0 2px"><b>C：経費にできない</b></p>' + guideTable("C", false) +
        '<p style="margin:12px 0 2px"><b>機器（パソコンなど）は、金額で扱いが変わります</b></p>' +
        '<p class="sub">・10万円未満（または使える期間が1年未満）のもの：全額を、その年の経費にできます<br>・10万円以上20万円未満のもの：一括償却（いっかつしょうきゃく）といって、3年で3分の1ずつ経費にする方法も選べます<br>・20万円以上のもの：耐用年数（たいようねんすう：使える年数の目安）で分けて、少しずつ経費にします（減価償却（げんかしょうきゃく））<br>金額の大きい機器は、家計簿の「資産」に登録すると、年ごとの償却額を自動で計算します。この判定表は「経費にできるか」の判断材料で、資産の登録は「金額の計算」の担当です。</p>' +
        '<p style="margin:12px 0 2px"><b>家計簿のカテゴリとの対応（生活）</b></p>' + catMapTable(TAX_CAT_MAP_LIFE) +
        '<p style="margin:12px 0 2px"><b>家計簿のカテゴリとの対応（事業）</b></p>' + catMapTable(TAX_CAT_MAP_BIZ) +
        '<p class="sub">家計簿で支出を記録するときも、カテゴリを選ぶ欄の下に、この対応の目安が出ます。</p>';
      // 住宅ローン控除
      var hsYearOpts = "", hsTop = Math.max(year, hs.moveInYear || year);
      for (var hy = hsTop; hy >= hsTop - 30; hy--) hsYearOpts += '<option value="' + hy + '"' + (hy === hs.moveInYear ? " selected" : "") + '>' + hy + '年</option>';
      var hsAmortHint = "";
      kbLoans().forEach(function (l) {
        if (l.purpose !== "住宅" || hsAmortHint) return;
        var yr = kbAmortize(l).years[year];
        if (yr) hsAmortHint = '<p class="sub">家計簿の返済表では、この年末の残高は ¥' + fmt(yr.endBalance, 0) + ' の見込みです。証明書（年末残高証明書）の数字が正本なので、違う場合は証明書の数字を入れてください。</p>';
      });
      var hsResult = "";
      if (!hs.enabled) hsResult = '<p class="sub">いまはOFFです。住宅ローン控除を使う場合は、上のチェックを入れて保存してください。</p>';
      else if (hc.state === "unset") hsResult = '<p class="sub">入居した年を選んで保存すると、控除額の目安が出ます。</p>';
      else if (hc.state === "before") hsResult = '<p class="sub">' + hs.moveInYear + '年の入居なので、' + year + '年分の控除はまだありません。</p>';
      else if (hc.state === "na") hsResult = '<div class="warn">この区分・入居年の組み合わせは、原則として控除の対象外です。ただし、期限までに建築確認（けんちくかくにん）を受けた住宅などの例外では、借入限度額2,000万円・控除期間10年で対象になる場合があります。当てはまるかは、国税庁の案内や税務署で確認してください。</div>';
      else if (hc.state === "over") hsResult = '<p class="sub">控除期間（' + hc.years + '年）を過ぎているため、' + year + '年分の控除はありません。</p>';
      else if (hc.state === "nobalance") hsResult = '<p class="sub">入居から ' + hc.nth + ' 年目です。借入限度額は ¥' + fmt(hc.limit, 0) + '、控除期間は ' + hc.years + ' 年です。' + year + '年の年末残高を入れると、控除額の目安が出ます。</p>';
      else if (hc.state === "ok") {
        hsResult = '<table><tr><th>項目</th><th>金額・内容</th></tr>' +
          '<tr><td>入居から</td><td>' + hc.nth + ' 年目（控除期間 ' + hc.years + ' 年）</td></tr>' +
          '<tr><td>借入限度額</td><td>¥' + fmt(hc.limit, 0) + '</td></tr>' +
          '<tr><td>計算のもとになる金額</td><td>¥' + fmt(hc.base, 0) + '<span class="sub">（年末残高 ¥' + fmt(hc.balance, 0) + (hs.shareRatio != null && hs.shareRatio !== 100 ? ' × 負担割合 ' + hs.shareRatio + '%' : '') + ' と限度額の小さい方）</span></td></tr>' +
          '<tr><td><b>控除額の目安</b></td><td><b>¥' + fmt(hc.credit, 0) + '</b><span class="sub">（もとの金額 × 0.7%）</span></td></tr></table>';
        if (hov) {
          hsResult += hov.excess > 0
            ? '<p style="margin-top:8px">所得税（' + hsTaxSrc + ' ¥' + fmt(hsTaxIn != null ? hsTaxIn : est.national, 0) + '）から引ききれない分は <b>¥' + fmt(hov.excess, 0) + '</b> です。引ききれない分は、翌年度の住民税から差し引かれる仕組みがあり、その目安は <b>¥' + fmt(hov.residentEst, 0) + '</b> です（課税総所得金額等 × 5%・最高97,500円の上限で計算）。</p>' + (hs.moveInYear >= 2026 ? '<p class="sub">注意：この住民税側の仕組みが、令和8年（2026年）入居分にも同じように続くかは、2026年11月10日時点で公式の確認が取れていません。目安として表示しています。</p>' : '<p class="sub">住民税側の仕組みは、令和7年12月31日までの入居分について確認できている内容です。実際の控除は、翌年度の住民税の通知で確認してください。</p>')
            : '<p style="margin-top:8px">控除額は、所得税（' + hsTaxSrc + '）の範囲で引ききれる見込みです。</p>';
        } else {
          hsResult += '<p class="sub" style="margin-top:8px">所得税から引ききれない分の目安は、その年の所得税額が分かると出ます（上の任意入力、または下の「年末の着地見込み」が出ている場合）。</p>';
        }
        if (hc.nth === 1) {
          hsResult += '<div class="warn" style="margin-top:10px"><b>入居して1年目は、会社員でも年末調整（ねんまつちょうせい）では受けられず、確定申告が必要です。</b>2年目以降で会社員の人は、年末調整で受けられます。</div>' +
            '<p style="margin:8px 0 2px"><b>初年度の申告に要る書類（一般的なもの）</b></p>' +
            '<p class="sub">・住宅借入金等特別控除額の計算明細書（e-Taxなら画面の入力で作れます）<br>・年末残高証明書（金融機関から届きます）<br>・建物・土地の登記事項証明書（法務局で取れます）<br>・売買契約書・請負契約書の写し<br>・源泉徴収票（給与がある人）<br>・認定通知書などの写し（認定長期優良住宅・ZEH・省エネ基準適合の家の場合）</p>' +
            '<div class="btns"><button type="button" class="btn" id="tx-hcguide">家計簿の申請ガイドを開く（手順と書類チェックはこちら）</button></div>';
        }
      }
      var hsHtml =
        '<h3 class="vtitle">住宅ローン控除（住宅借入金等特別控除）</h3>' +
        '<p class="sub">住宅ローン控除（じゅうたくろーんこうじょ）は、マイホームのローンについて、年末の残高の0.7%が所得税から差し引かれる制度です。所得税から引ききれない分は、翌年の住民税からも差し引かれる場合があります。家を買った人だけが使う設定です。</p>' +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="tx-hs-on"' + (hs.enabled ? " checked" : "") + '> 住宅ローン控除を使う</label>' +
        '<div class="row2"><div class="fld"><label>入居した年</label><select id="tx-hs-year">' + (hs.moveInYear ? "" : '<option value="" selected>選んでください</option>') + hsYearOpts + '</select></div>' +
        '<div class="fld">' + select("tx-hs-cat", "住宅の区分", TAX_HOME_CATS, hs.category) + '</div></div>' +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="tx-hs-special"' + (hs.specialPerson ? " checked" : "") + '> 特例対象個人（とくれいたいしょうこじん：40歳未満で配偶者がいる、40歳以上で40歳未満の配偶者がいる、または19歳未満の扶養親族がいる人。令和8年入居分から限度額が上乗せされます）</label>' +
        '<div class="row2"><div class="fld">' + field("tx-hs-share", "負担割合（％・連帯債務のとき自分の分。空欄なら100）", hs.shareRatio == null ? "" : hs.shareRatio, "number") + '</div>' +
        '<div class="fld">' + field("tx-hs-price", "家の取得対価（円・任意。残高より小さい場合の上限）", hs.priceCap == null ? "" : hs.priceCap, "number") + '</div></div>' +
        '<div class="row2"><div class="fld">' + field("tx-hs-bal", year + "年の年末残高（円・年末残高証明書から）", hs.balances[String(year)] == null ? "" : hs.balances[String(year)], "number") + '</div>' +
        '<div class="fld">' + field("tx-hs-tax", year + "年の所得税額（円・任意。引ききれない分の目安に使う）", hsTaxIn == null ? "" : hsTaxIn, "number") + '</div></div>' + hsAmortHint +
        '<div class="btns"><button type="button" class="btn gold" id="tx-hssave">住宅ローン控除の設定を保存</button></div><div class="msg" id="tx-hsmsg"></div>' +
        hsResult +
        '<p class="sub">ペアローンの場合は、各自が自分の年末残高証明書の数字で、それぞれ計算します（配偶者の分は、配偶者側の設定で扱ってください）。繰上返済（くりあげへんさい）をした年も、証明書の残高をそのまま入れれば計算に反映されます。この控除には、合計所得金額が2,000万円以下、家の床面積が原則50㎡以上などの要件があります。要件に当てはまるかは、国税庁の案内（No.1211）で確認してください。解説と手続きの案内は、家計簿の「住宅ローン控除の申請ガイド」にあります。</p>';
      // 年末の着地見込み
      var estHtml = '<h3 class="vtitle">年末の着地見込み（税金の概算）</h3>';
      if (!est) {
        estHtml += '<p class="sub">給与の「所得控除の額の合計額」を入れると、その年の所得税の概算と、源泉徴収（げんせんちょうしゅう：給与から先に引かれている税金）との差（追加で納めるか、戻ってくるか）、翌年の住民税の目安が出ます。源泉徴収票がまだ無い年は、昨年の票の数字などで近づけて入れてください。</p>';
      } else {
        var estRows =
          '<tr><td>課税される所得の目安（総合課税分）</td><td>¥' + fmt(est.taxable, 0) + '</td></tr>' +
          '<tr><td>所得税の概算（総合分）</td><td>¥' + fmt(est.taxComp, 0) + '</td></tr>' +
          (est.domTaxable > 0 ? '<tr><td>所得税の概算（国内分・分離課税15%）</td><td>¥' + fmt(est.domTax, 0) + '</td></tr>' : "") +
          '<tr><td>復興特別所得税（ふっこうとくべつしょとくぜい）の概算（2.1%）</td><td>¥' + fmt(est.fukko, 0) + '</td></tr>' +
          '<tr><td>所得税の合計（概算）</td><td>¥' + fmt(est.national, 0) + '</td></tr>' +
          (est.creditUsed > 0 ? '<tr><td>住宅ローン控除（この年の分）</td><td>−¥' + fmt(est.creditUsed, 0) + '</td></tr><tr><td>控除の後の所得税（概算）</td><td>¥' + fmt(est.nationalAfter, 0) + '</td></tr>' : "") +
          (est.balance === null ? '<tr><td>源泉徴収税額</td><td>—（未入力のため、納める／戻るの方向は出しません）</td></tr>'
            : '<tr><td>源泉徴収税額</td><td>¥' + fmt(entry.salary.withheld, 0) + '</td></tr><tr><td><b>' + (est.balance >= 0 ? "追加で納める目安" : "戻ってくる（還付（かんぷ））目安") + '</b></td><td><b>¥' + fmt(Math.abs(est.balance), 0) + '</b></td></tr>') +
          '<tr><td>住民税の目安（所得割（しょとくわり）・翌年度に課税）</td><td>¥' + fmt(est.resident, 0) + (hov && hov.residentEst > 0 ? '（住宅ローン控除の住民税分 ¥' + fmt(hov.residentEst, 0) + ' を差し引くと ¥' + fmt(est.resident - hov.residentEst, 0) + '）' : '') + '</td></tr>';
        estHtml += (est.salaryMissing ? '<p class="sub">給与が未入力のため、給与分を含まない概算です。</p>' : "") +
          '<table><tr><th>項目</th><th>金額（概算）</th></tr>' + estRows + '</table>' +
          '<p class="sub">これは、その時点の記録からの<b>概算・目安</b>です。税率表は国税庁の速算表（No.2260）を使い、国内分は分離課税（所得税15%・住民税5%）で計算しています。住民税は、控除の金額が所得税と少し違うため、実際の金額は前後します。均等割（きんとうわり：金額にかかわらず一律にかかる分。目安は年5,000円ほどで、自治体で異なります）は含んでいません。税額の確定は、確定申告書・作成コーナーで行います。納める見込みの年は、この目安を納税資金の準備に使ってください。</p>';
      }
      // ふるさと納税の上限シミュレーション
      var furHtml = '<h3 class="vtitle">ふるさと納税の上限の目安</h3>' +
        '<p class="sub">ふるさと納税（のうぜい）は、応援したい自治体への寄付です。寄付した額のうち2,000円を超える分が、所得税と住民税から差し引かれます（国税庁 No.1155）。自己負担が2,000円で済む寄付には上限があり、その目安を、上の着地見込みの数字から逆算します。</p>';
      if (!fur) {
        furHtml += '<p class="sub">目安を出すには、給与の「所得控除の額の合計額」の入力と、住民税の所得割が出ることが必要です。入力が揃うと、ここに上限の目安が出ます。</p>';
      } else {
        furHtml += '<div class="pl-head"><div class="big">¥' + fmt(fur, 0) + '</div><div class="sub">自己負担2,000円で済む寄付額の上限の目安（この年の数字からの逆算）</div></div>' +
          (don.count ? '<p>家計簿のメモから拾った寄付の記録：<b>¥' + fmt(don.total, 0) + '</b>（' + don.count + '件）　' + (don.total >= fur ? '拾った分だけで、目安の上限に達しています。' : 'あと <b>¥' + fmt(fur - don.total, 0) + '</b> が目安です。') + '</p>'
            : '<p class="sub">家計簿のメモに「ふるさと納税」「寄付」と書かれた支出は、この年はまだ拾えていません。</p>') +
          '<p class="sub">この目安は概算です。<b>最終確認は、総務省のふるさと納税ポータルや、お住まいの自治体の公式シミュレーションでしてください。</b>家計簿からの拾い上げは、メモに「ふるさと納税」「寄付」と書かれた支出だけが対象で、メモに無い寄付は含まれません。</p>';
      }
      /* ----- フェーズ2cのセクション ----- */
      // 住民税の徴収方法チェック＋翌年の住民税への影響メモ（追補C・H-2）。着地見込み（est）と控除のあふれ（hov）を再利用する
      var residentHtml =
        '<h3 class="vtitle">住民税の徴収方法チェック（申告の直前に、かならず確認）</h3>' +
        '<div class="warn"><b>兼業（けんぎょう：会社員をしながら副業をしている）の人は、ここが大事な分かれ目です。</b><br>給与以外の所得（トレードの利益など）にかかる住民税（じゅうみんぜい）は、何も選ばないと、原則として給与から差し引く方法（特別徴収（とくべつちょうしゅう））になり、会社の給与と一緒に処理されます。確定申告書の<b>第二表「住民税・事業税に関する事項」</b>にある「給与、公的年金等以外の所得に係る住民税の徴収方法」の欄で<b>「自分で納付（普通徴収（ふつうちょうしゅう））」</b>を選ぶと、その分の住民税は、自分あてに届く納付書で納める形になります。<b>会社に副業の所得を知られたくない人は、この欄で「自分で納付」を選ぶことが、実務上のポイントです。</b></div>' +
        '<p class="sub">注意：扱いは市区町村によって違う場合があります（自治体によっては給与分と分けられない場合や、選んでも特別徴収になる場合があります）。最終的には、お住まいの市区町村の案内と、申告する年の確定申告書等作成コーナーの説明を確認してください。「自分で納付」を選んだ場合は、納付書が自宅に届きます。納める期限（年4回に分かれることが多いです）を過ぎると延滞金（えんたいきん）がかかる場合があるので、届いたらすぐ確認してください。</p>' +
        '<p style="margin:10px 0 2px"><b>翌年の住民税への影響メモ</b></p>' +
        '<p class="sub">住民税は「今年の所得」に対して「翌年」に課税（かぜい）されます。今年の所得が増えると、翌年の6月ごろから届く住民税も増えます。仕組みは、所得割（しょとくわり：所得に応じてかかる部分、おおむね10%）＋均等割（きんとうわり：所得にかかわらず一律の部分、年5,000円ほど・自治体で異なる）です。</p>' +
        (est
          ? '<p>この年の数字からの目安：翌年度の住民税の所得割は <b>¥' + fmt(est.resident, 0) + '</b> ほどです' + (hov && hov.residentEst > 0 ? '。住宅ローン控除で所得税から引ききれなかった分（¥' + fmt(hov.residentEst, 0) + '）が差し引かれる見込みのため、目安は <b>¥' + fmt(Math.max(0, est.resident - hov.residentEst), 0) + '</b> ほどになります' : '') + '。給与以外の所得の分は、上の欄で「自分で納付」を選んだ場合、その分が納付書で届きます。</p>'
          : '<p class="sub">概算は、上の「年末の着地見込み」が出る（給与の「所得控除の額の合計額」を入れる）と、ここにも目安が出ます。</p>') +
        '<p class="sub">住民税は、控除の金額や計算のしかたが所得税と少し違うため、実際の金額は目安から前後します。金額の確定は、翌年に届く住民税の決定通知書で確認してください。</p>';
      // 突合（報告書との照らし合わせ）
      var reconMonthRowsHtml = reconM.map(function (r) {
        return '<tr><td>' + r.month + '月</td><td class="' + (r.app === null ? "" : pcls(r.app)) + '">' + (r.app === null ? "—" : yen(r.app)) + '</td>' +
          '<td><input id="tx-rp-' + r.month + '" type="number" value="' + (r.report === null ? "" : r.report) + '" placeholder="レポートの額" style="min-width:110px"></td>' +
          '<td class="' + (r.diff === null || r.diff === 0 ? "" : "pl-dn") + '">' + (r.diff === null ? "—" : r.diff === 0 ? "一致" : yen(r.diff)) + '</td></tr>';
      }).join("");
      var reconHtml =
        '<h3 class="vtitle">報告書との照らし合わせ（突合（とつごう））</h3>' +
        '<p class="sub">突合とは、2つの記録を見比べて、数字が合っているか確かめることです。申告の正本は<b>業者の年間レポートの数字</b>です。アプリの日次入力は日々の記録なので、見送った日（損益ゼロの日）の記録漏れや、入力ミスで、レポートとずれることがあります。ずれたら、レポート側の数字に合わせて記録を見直してください（とくに手数料・スワップの扱いと、年末年始の決済日）。</p>' +
        '<p style="margin:8px 0 2px"><b>レポートの出し方（XS＝MT5 の場合）</b></p>' +
        '<p class="sub">1. パソコンの MT5 を開き、下部の「ツールボックス」の「履歴（りれき）」タブを表示します（表示されていないときは、表示メニューから「ツールボックス」を出します）<br>2. 履歴の上で右クリックし、期間を選びます。年間の照らし合わせは「カスタム期間」で、その年の1月1日〜12月31日を指定します。月別も同じ手順で、その月の範囲を指定できます<br>3. もう一度右クリックし、「レポート」→ HTML 形式で保存します。保存したファイルは、下の「保存アーカイブ」にも加えて保管してください<br>4. XS からは、取引の明細メール（mt5reports@xs.com から届きます）も届いています。アプリの「ツール → 取引メール」で取り込んだ明細と、レポートの合計を見比べることもできます<br>XMTrading などの MT4 の場合も、履歴タブから期間を指定してレポートを保存する流れは同じです。くわしい手順は、各社の公式案内を確認してください。</p>' +
        '<div class="row2"><div class="fld"><label>年間レポートの確定損益（円・全期間のレポートから転記）</label><input id="tx-rp-annual" type="number" value="' + (entry.mt5Annual === null ? "" : entry.mt5Annual) + '" placeholder="例：123456"></div></div>' +
        '<p>' + (reconA
          ? '照らし合わせ（年間）：アプリの記録 <b>' + yen(tr.total.pnl) + '</b> ／ レポート <b>' + yen(reconA.report) + '</b> ／ 差額 <b class="' + (reconA.diff === 0 ? "" : "pl-dn") + '">' + (reconA.diff === 0 ? "なし（一致）" : yen(reconA.diff)) + '</b>' + (reconA.diff === 0 ? "" : '。年の合計がずれています。下の月別で、どの月がずれているか確かめてください。')
          : '年間レポートの数字を転記すると、このアプリの年合計との差額が出ます。') + '</p>' +
        '<table><tr><th>月</th><th>アプリの記録</th><th>レポート（転記）</th><th>差額</th></tr>' + reconMonthRowsHtml + '</table>' +
        '<div class="btns"><button type="button" class="btn gold" id="tx-rpsave">照らし合わせを保存</button></div><div class="msg" id="tx-rpmsg"></div>' +
        '<p style="margin:10px 0 2px"><b>HTML レポートの自動読み込み（MT5）</b></p>' +
        '<p class="sub">MT5 のレポートは、MetaQuotes の公式ヘルプで形式が案内されている HTML ファイルです（ポジションの一覧に、決済した日時・手数料・スワップ・損益の欄があります）。上の手順で保存した HTML ファイルを選ぶと、決済した年・月ごとに「損益＋手数料＋スワップ」の合計を読み取り、このページの転記欄へ入れます。読み取った数字は、そのままでは保存されません。内容を確認してから「照らし合わせを保存」を押してください。ファイルはこの端末の中でだけ読み、どこにも送りません。形式が違うファイル（MT4 の明細など）では読み取れない場合があります。その場合は、手で転記してください。</p>' +
        '<div class="fld"><label>MT5 の HTML レポートファイル</label><input id="tx-mt5file" type="file" accept=".html,.htm,text/html"></div><div class="msg" id="tx-mt5msg"></div>';
      // e-Tax転記シート（申告書のマス目マップを兼ねる）
      var sheetRowsHtml = sheetRows.map(function (r) {
        return '<tr><td>' + esc(r.form) + '</td><td class="sub">' + esc(r.cell) + '</td><td>' + esc(r.item) + '</td><td>' + (r.amount === null ? "—" : yen(r.amount)) + '</td><td class="sub">' + esc(r.src) + '</td><td class="sub">' + esc(r.note) + '</td></tr>';
      }).join("");
      var sheetHtml =
        '<h3 class="vtitle">e-Tax 転記シート（申告書の欄への対応つき）</h3>' +
        '<p class="sub">このページで集めた数字が、確定申告書のどの欄に入るかの一覧です。申告書の欄の番号は、<b>令和7年分（2025年分）の申告書の様式</b>（国税庁の「確定申告の手引き」）で確認したものです。申告する年の様式では、欄の並びや名前が変わっている場合があるので、実際の入力では、その年の国税庁「確定申告書等作成コーナー」の画面と見比べてください。作成コーナーでは、画面の案内に沿って数字を入れると、欄への転記と計算は自動で行われます。このシートは「どの数字が、どこへ行くか」の確認用です。</p>' +
        '<div class="tw"><table><tr><th>様式</th><th>欄</th><th>項目</th><th>金額</th><th>もとにする記録</th><th>メモ</th></tr>' + sheetRowsHtml + '</table></div>' +
        '<div class="btns"><button type="button" class="btn" id="tx-csv">転記シートを CSV でダウンロード</button></div><div class="msg" id="tx-csvmsg"></div>' +
        '<p class="sub">「—」は、このページにまだ数字が無い項目です。CSV には、対象の年と、このシートの内容がそのまま入ります。</p>';
      // 申告準備の工程チェック＋ICS
      var prepRowsHtml = prepItems.map(function (p) {
        return '<tr><td><label><input type="checkbox" data-prep="' + p.id + '"' + (data.prep.checks[p.id] ? " checked" : "") + '> ' + esc(p.title) + '</label></td><td class="sub">' + esc(p.dueLabel) + '</td><td class="sub">' + esc(p.how) + '</td></tr>';
      }).join("");
      var prepHtml =
        '<h3 class="vtitle">申告準備の進み具合（工程チェック）</h3>' +
        '<p class="sub">' + year + '年分の申告（提出は ' + (year + 1) + '年）に向けて、そろえるものと、やることの一覧です。終わったものにチェックを入れると、この端末に記録されます。進み具合：<b id="tx-prep-count">' + prepDone + ' / ' + prepItems.length + '</b></p>' +
        '<table><tr><th>やること</th><th>期限の目安</th><th>進め方</th></tr>' + prepRowsHtml + '</table>' +
        '<div class="btns"><button type="button" class="btn" id="tx-ics">まだ終わっていない分の期限を、カレンダー用ファイル（ICS）で書き出す</button></div><div class="msg" id="tx-icsmsg"></div>' +
        '<p class="sub">ICS は、カレンダーアプリに取り込める形式のファイルです。「期限・対応」のカレンダーなど、いつものカレンダーに取り込むと、期限を予定として並べられます。取り込み方は、カレンダーアプリ側の案内を確認してください。</p>';
      // 書類の保存アーカイブ
      var archRowsHtml = TAX_ARCHIVE_ITEMS.map(function (a2) {
        return '<tr><td><label><input type="checkbox" data-arch="' + a2.id + '"' + (archRow[a2.id] ? " checked" : "") + '> ' + esc(a2.name) + '</label></td><td class="sub">' + esc(a2.keep) + '</td></tr>';
      }).join("");
      var archHtml =
        '<h3 class="vtitle">書類の保存アーカイブ（' + year + '年分）</h3>' +
        '<p class="sub">申告に使った書類がそろっているかの記録です。税務署から後日たずねられたときに、根拠の書類をすぐ出せるようにしておくためのものです。揃ったものにチェックを入れてください（' + year + '年分の記録：<b id="tx-arch-count">' + archDone + ' / ' + TAX_ARCHIVE_ITEMS.length + '</b>）。</p>' +
        '<table><tr><th>書類</th><th>保存期間の目安（一般的な案内）</th></tr>' + archRowsHtml + '</table>' +
        '<p class="sub">保存期間の目安は、国税庁の案内をもとにした一般的なものです。保存期間は、申告期限の翌日（3月16日）から数えます。消費税のインボイス（適格請求書）の写しは7年の保存が必要です。あなたの区分（青色・白色・雑所得のみ、など）で年数が変わるので、迷う場合は長めに残しておくと安全です。</p>';
      // 青色申告への移行シミュレーション（開業フローのステップ0と連動）
      var blueRowsHtml = blue.map(function (b) {
        var lab = b.ded === 650000 ? "控除65万円（複式簿記（ふくしきぼき）＋e-Tax で申告、または電子帳簿保存（でんしちょうぼほぞん））" : b.ded === 550000 ? "控除55万円（複式簿記で申告）" : "控除10万円（簡易な記録で申告）";
        return '<tr><td>' + lab + '</td><td>' + yen(b.income) + '</td><td class="sub">' + (b.cut > 0 ? "控除によって所得が ¥" + fmt(b.cut, 0) + " 小さくなる形" : "控除の効く余地なし（所得が0以下、または控除額以下）") + '</td></tr>';
      }).join("");
      var blueHtml =
        '<p style="margin:10px 0 2px"><b>青色申告（あおいろしんこく）にしたら、の置き換え計算</b></p>' +
        '<p class="sub">いま雑所得などで数えている業務の儲け（経費を引いたあと）と、家計簿の事業分の合計 <b>' + yen(blueBase) + '</b> を、「もし全部が事業所得で、青色申告特別控除（あおいろしんこくとくべつこうじょ）を受けたら」という形に、機械的に置き換えたものです。</p>' +
        '<table><tr><th>青色申告特別控除の区分</th><th>置き換え後の所得</th><th>内訳</th></tr>' + blueRowsHtml + '</table>' +
        '<p class="sub">青色申告には、前提条件があります。用意するもの：開業届と「所得税の青色申告承認申請書」（原則、その年の3月15日まで。くわしくは下の開業フローのステップ1・2）。65万円控除には、複式簿記での記帳と、e-Tax での申告（または電子帳簿保存）が必要です。事業所得として認められるかは、事業の規模や継続性などの個別の事情で判断されます。<b>この置き換えは計算の形を見せるだけで、青色が有利・不利という判断はしません。</b>また、海外FXの雑所得など、所得の区分そのものが事業所得に変わるわけではありません（区分の扱いは個別の事情で確認してください）。</p>';
      // 開業フロー（6ステップ）
      var openStep = function (n, title, key, bodyHtml) {
        return '<details style="margin:8px 0"><summary><b>ステップ' + n + '：' + title + '</b></summary><div style="margin:6px 0 2px"><label style="display:block;margin-bottom:4px"><input type="checkbox" data-open="' + key + '"' + (data.opening.checks[key] ? " checked" : "") + '> このステップが済んだらチェック</label>' + bodyHtml + '</div></details>';
      };
      var openingHtml =
        '<h3 class="vtitle">開業フロー（個人事業を始める手順）</h3>' +
        '<p class="sub">個人事業（こじんじぎょう）を始めるときの、届出（とどけで）と準備の流れです。進み具合：<b id="tx-open-count">' + openDone + ' / 6</b> ステップ。チェックとメモは、この端末に保存されます。期限の表記は、「学ぶ」の確定申告ガイドの整理とそろえています。</p>' +
        blueHtml +
        openStep(0, "判断材料をそろえる（始めるかどうかを決める）", "step0",
          '<p class="sub">やること：いまの数字（このページの合算イメージと、上の青色の置き換え計算）を見て、雑所得のままにするか、事業として始めるかの違いを知ります。開業は義務ではなく任意です。始める場合は、青色申告承認申請の期限（原則3月15日）から逆算して、開業する時期を決めます。</p><p class="sub">つまずきポイント：海外FXの利益は雑所得のまま扱われるのが一般的で、開業届を出しても区分が自動で事業所得に変わるわけではありません。事業所得にできるのは、事業として実態のある活動の分です。判断に迷う場合は、税務署・税理士に確認してください。</p>') +
        openStep(1, "「個人事業の開業・廃業等届出書（開業届）」を出す", "step1",
          '<p class="sub">やること：開業届を、納税地（のうぜいち：住んでいる場所）を担当する税務署へ提出します。e-Tax（電子）でも提出できます。<br>期限：<b>2026年1月1日以後に開業した場合は、開業した年分の確定申告の期限まで</b>。それより前に開業した場合は、開業から1か月以内です（期限を延ばす見直しが議論されていますが、決まるまでは現行の期限で考えてください）。<br>必要書類：開業届の用紙（国税庁のサイトや税務署にあります）。マイナンバー（個人番号）の記入と、本人確認の書類の提示または写しの添付が要ります。<br>つまずきポイント：税務署の受付印（収受日付印（しゅうじゅうひづけいん））は、令和7年（2025年）1月から押されない決まりになりました。提出した証拠が要る場合は、e-Tax の受信通知を保存するか、控えと一緒に提出して返してもらう方法を使います。</p>') +
        openStep(2, "セットで出す届出を出す", "step2",
          '<p class="sub">・<b>所得税の青色申告承認申請書</b>：青色申告にする人は必須です。期限は<b>原則、その年の3月15日まで</b>。1月16日以後に開業した場合は、<b>開業から2か月以内</b>です。<br>・<b>給与支払事務所等の開設届出書</b>：従業員を雇って給与を払う場合に出します（開設から1か月以内）。<br>・<b>源泉所得税の納期の特例（のうきのとくれい）の承認申請</b>：給与を払う従業員が常時10人未満で、源泉所得税の納付を年2回にまとめたい場合に出します。<br>・<b>消費税の届出・インボイス登録</b>：課税売上高1,000万円以下は原則として免税事業者です。取引先からインボイス（適格請求書）の発行を求められる場合など、必要な人だけ検討します。<br>つまずきポイント：青色の申請は、出し忘れるとその年は白色になります。開業届と一緒に出すのが確実です。</p>') +
        openStep(3, "開業直後の準備をする", "step3",
          '<p class="sub">やること：帳簿（ちょうぼ）の用意をします。白色申告は、売上と経費を日々記録する法定帳簿（ほうていちょうぼ）が必要です。青色申告の65万円控除には複式簿記（ふくしきぼき）の帳簿が要ります。このアプリの家計簿で「事業」区分を使えば、日々の記録を分けて残せます。<br>事業用のお金の分け方を決めます（事業用の口座・カードを作る、など）。領収書の残し方も決めておきます（下の「書類の保存アーカイブ」参照）。</p>') +
        openStep(4, "身分の分岐を確認する", "step4",
          '<p class="sub">会社員のまま兼業する場合：勤務先の就業規則（しゅうぎょうきそく）で、副業が認められているかを確認します。住民税の扱いは、上の「住民税の徴収方法チェック」を見てください。<br>退職して独立する場合：健康保険は、退職から14日以内に市区町村で国民健康保険（こくみんけんこうほけん）への切り替えをします。年金も国民年金（こくみんねんきん）への切り替えが必要です。扶養（ふよう）の範囲で働いている人の扱いなど、個別の事情が大きい部分は、社会保険労務士や市区町村の窓口で確認してください。</p>') +
        openStep(5, "年間のサイクルを回す", "step5",
          '<p class="sub">毎月：記帳と領収書の整理をします。このページの「工程チェック」も、年明けに使います。<br>1月：源泉徴収票と、ブローカーの年間レポートを集めます。<br>2月16日〜3月15日：確定申告と納付をします。<br>5〜6月ごろ：住民税の通知が届きます。普通徴収を選んだ分は、納付書で年4回に分けて納めます。<br>青色申告の人は、65万円控除の条件（複式簿記＋e-Tax 申告、または電子帳簿保存）を、毎年満たしているかも確認します。</p>') +
        '<div class="fld"><label>開業についてのメモ</label><textarea id="tx-opmemo" rows="3" style="width:100%" placeholder="開業する時期の希望、相談した窓口の記録など">' + esc(data.opening.memo || "") + '</textarea></div>' +
        '<div class="btns"><button type="button" class="btn" id="tx-opmemo-save">開業のメモを保存</button></div><div class="msg" id="tx-opmsg"></div>';
      var html =
        '<div class="first"><b>このページは、確定申告の「計算と整理」のための道具です。税金の個別の判断はしません。</b>あなたの申告が正しいかどうかは、最終的に税務署・税理士に確認してください。表示される金額は、この端末に記録された数字からの目安です。</div>' +
        '<div class="jcalh"><button type="button" class="iconbtn" id="tx-yprev"' + (yi >= years.length - 1 ? " disabled" : "") + '>‹</button><span style="font-weight:700">' + year + '年分</span><button type="button" class="iconbtn" id="tx-ynext"' + (yi <= 0 ? " disabled" : "") + '>›</button>' +
        '<select id="tx-ysel">' + years.map(function (y) { return '<option value="' + y + '"' + (+y === year ? " selected" : "") + '>' + y + '年</option>'; }).join("") + '</select></div>' +
        '<p class="sub">確定申告（かくていしんこく）の準備のために、1年分の数字をここへ集めます。下へ進むと、海外分／国内分の切り分け、経費、給与、合算のイメージの順に出ます。</p>' +
        '<h3 class="vtitle">トレードの損益（' + year + '年）</h3>' +
        (tr.total.days ? '<div class="pl-head"><div class="big ' + pcls(tr.total.pnl) + '">' + yen(tr.total.pnl) + '</div><div class="sub">勝ち ' + tr.total.win + ' 日・負け ' + tr.total.loss + ' 日／取引した日 ' + tr.total.days + ' 日</div></div>'
          : '<p class="sub">この年のトレードの記録はまだありません（トレード収支の日次入力、または日誌に記録すると出ます）。</p>') +
        '<p class="sub">合計は「トレード収支」の日次入力を優先し、日誌の分は二重に加えていません。業者の年間損益報告書の数字と照らし合わせてください。</p>' +
        '<table><tr><th>月</th><th>損益</th><th>内訳</th></tr>' + monthRows + '</table>' +
        (tr.hasTrades ? '<p style="margin:10px 0 2px"><b>銘柄別の内訳（日誌からの参考値）</b></p><table><tr><th>銘柄</th><th>損益</th><th>勝敗</th></tr>' + instRows + '</table><p class="sub">銘柄別の内訳は日誌の記録から出した参考値です。年の合計は上の数字（日次入力が正本）を使ってください。</p>' : "") +
        '<h3 class="vtitle">海外分／国内分の切り分け</h3>' +
        '<div class="jn-panels">' +
        '<div class="jn-panel"><h4>海外分（雑所得（ざっしょとく）・総合課税（そうごうかぜい））</h4><div class="big ' + (split.known ? pcls(split.overseas) : "") + '">' + (split.known ? yen(split.overseas) : "—") + '</div>' +
        '<div class="sub">' + (split.known ? "年合計 − 国内分で出した数字です。海外の業者（XM・XSなど）の分で、給与など他の所得と合計して税率が決まる区分です。" : "国内分の入力が要ります。下の欄に国内分の年間損益を入れると、海外分が出ます。") + ' 年の途中で為替の換算が要る場合は、業者の年間損益報告書の数字を使ってください。</div></div>' +
        '<div class="jn-panel"><h4>国内分（先物取引に係る雑所得等・申告分離課税（しんこくぶんりかぜい））</h4><div class="big ' + (split.known ? pcls(split.domestic) : "") + '">' + (split.known ? yen(split.domestic) : "—") + '</div>' +
        '<div class="sub">国内の業者で取引した分です。他の所得とは分けて、決まった税率（20.315％）で計算される区分です。赤字は、申告を続ければ翌年から3年、同じ区分の利益から差し引けます（繰り越し（くりこし））。</div></div>' +
        '</div>' +
        '<p class="sub"><b>海外分と国内分は、損益を通算（つうさん）できません。</b>片方の利益と、もう片方の損失を差し引くことはできません。暗号資産の赤字も、海外分の利益とは通算できません。</p>' +
        '<div class="row2"><div class="fld">' + field("tx-dom", "国内分の年間損益（円・業者の報告書から転記）", split.known ? split.domestic : "", "number") + '</div></div>' +
        '<div class="btns"><button type="button" class="btn gold" id="tx-domsave">国内分を保存</button></div><div class="msg" id="tx-dommsg"></div>' +
        '<p class="sub">国内の業者で取引していない年は、0 と入れてください。空欄のままでは、海外分を切り分けられません。</p>' +
        '<h3 class="vtitle">経費の要約</h3>' +
        '<p class="sub">家計簿に記録した支出から、申告の経費になりそうな候補を拾います。<b>候補は確定ではありません。</b>自動計算で経費の額を断定はしないので、申告に使う金額は下の「経費の確定値」に、自分で決めて入れてください。トレード収支から転記した記録（損益そのもの）は、候補から除いています。</p>' +
        (cand.bizRows.length ? '<p style="margin:8px 0 2px"><b>事業分の支出（家計簿の「事業」記録）</b></p><table><tr><th>科目</th><th>合計</th></tr>' + bizCandRows + '<tr><td><b>合計</b></td><td><b>¥' + fmt(cand.bizTotal, 0) + '</b></td></tr></table>' : '<p class="sub">家計簿の「事業」分の支出は、この年はまだありません。</p>') +
        (cand.lifeRows.length ? '<p style="margin:10px 0 2px"><b>生活分から按分（あんぶん）できそうな候補</b>　<span class="sub">生活と仕事で共用している支出は、仕事で使った割合だけを経費にできます。割合と、その根拠（時間の割合など）をメモしておくと、あとで説明しやすくなります。</span></p><table><tr><th>カテゴリ</th><th>支出の合計</th><th>仕事の割合</th><th>根拠のメモ</th><th>按分後の目安</th></tr>' + apRows + '</table><div class="btns"><button type="button" class="btn" id="tx-apsave">按分のメモを保存</button></div><div class="msg" id="tx-apmsg"></div>'
          : '<p class="sub">生活分の按分候補（通信・光熱費・住まい・交通）は、この年はまだありません。</p>') +
        '<div class="row2"><div class="fld">' + field("tx-exp", "経費の確定値（円・合算イメージに使う金額）", entry.expensesFinal == null ? "" : entry.expensesFinal, "number") + '</div></div>' +
        '<div class="btns"><button type="button" class="btn gold" id="tx-expsave">経費の確定値を保存</button><button type="button" class="btn" data-tab="kakeibo">家計簿を開く</button></div><div class="msg" id="tx-expmsg"></div>' +
        '<p class="sub">医療費控除（いりょうひこうじょ）の目安は、家計簿の「申告用」で計算しています。そちらも合わせて確認してください。</p>' +
        guideHtml +
        '<h3 class="vtitle">給与所得（源泉徴収票から）</h3>' +
        '<p class="sub">源泉徴収票（げんせんちょうしゅうひょう）の数字を転記します。「給与所得控除後の金額」は、給与の金額から給与所得控除（きゅうよしょとくこうじょ）を差し引いたあとの金額で、票に印刷されています。証明になるのは源泉徴収票そのものです。</p>' +
        '<div class="row2"><div class="fld">' + field("tx-sal-gross", "支払金額（円）", sal.gross == null ? "" : sal.gross, "number") + '</div>' +
        '<div class="fld">' + field("tx-sal-after", "給与所得控除後の金額（円）", sal.afterDeduction == null ? "" : sal.afterDeduction, "number") + '</div></div>' +
        '<div class="row2"><div class="fld">' + field("tx-sal-ded", "所得控除の額の合計額（円・任意）", sal.deductionsTotal == null ? "" : sal.deductionsTotal, "number") + '</div>' +
        '<div class="fld">' + field("tx-sal-wh", "源泉徴収税額（円）", sal.withheld == null ? "" : sal.withheld, "number") + '</div></div>' +
        '<div class="btns"><button type="button" class="btn gold" id="tx-salsave">給与を保存</button></div><div class="msg" id="tx-salmsg"></div>' +
        '<h3 class="vtitle">合算イメージ（目安）</h3>' +
        '<table><tr><th>区分</th><th>金額</th></tr>' + combRows + '</table>' + segHtml +
        '<p class="sub">雑所得の金額は0を下限にして出しています（赤字の分は他の所得から差し引きません）。この表は所得の合算イメージです。税額の概算は、下の「住宅ローン控除」と「年末の着地見込み」で出します（概算・目安で、税額の確定は確定申告書や国税庁の「確定申告書等作成コーナー」で行います）。住民税は別途かかります。</p>' +
        hsHtml + estHtml + furHtml +
        '<h3 class="vtitle">申告が要るかの目安</h3>' +
        '<p>会社員で、1か所から給与を受けていて、年末調整（ねんまつちょうせい：会社が1年分の所得税を精算する手続き）が済んでいる場合、給与以外の所得の合計が年20万円以下なら、所得税の確定申告は原則として不要とされています（国税庁の案内）。ただし、医療費控除を受けたい場合や、ふるさと納税のワンストップ特例（とくれい）を使わない場合などは、20万円以下でも申告が要ります。住民税は、所得税の申告が不要でも申告が要る場合があります（お住まいの市区町村の案内を確認してください）。</p>' + hintLine +
        '<p class="sub">これは一般論の案内です。あなたの申告が要るかどうかは、個別の事情で変わります。迷ったら税務署・税理士に確認してください。</p>' +
        '<h3 class="vtitle">損失の繰り越し（国内分のみ）</h3>' +
        '<p class="sub">国内の「先物取引に係る雑所得等」で赤字が出た年は、その赤字を翌年から3年、同じ区分（国内分）の利益から差し引けます。<b>繰り越しには、そのあとも毎年の申告を続ける必要があります。</b>海外の雑所得分（XM・XSなど）の赤字は、繰り越すことができません。金額は、赤字の額をプラスの数字で入れてください。</p>' +
        (split.known && split.domestic < 0 ? '<div class="warn">' + year + '年の国内分は赤字（' + yen(split.domestic) + '）です。この年の行を下で足しておくと、繰り越しを追えます。</div>' : "") +
        carryHtml +
        '<div class="grid3"><div class="fld"><label>赤字が出た年</label><select id="tx-carry-year">' + carryYearOpts + '</select></div>' +
        '<div class="fld">' + field("tx-carry-amt", "赤字の金額（円）", "", "number") + '</div></div>' +
        '<div class="btns"><button type="button" class="btn" id="tx-carryadd">繰り越しの行を足す</button></div><div class="msg" id="tx-carrymsg"></div>' +
        '<h3 class="vtitle">暗号資産の損益メモ</h3>' +
        '<p class="sub">暗号資産（あんごうしさん）の年間の損益を入れておくメモ欄です。計算はFXとは別の枠（雑所得）で、赤字は他の所得と通算できません。ここに入れた金額は、雑所得の内訳として上の「合算イメージ」に入ります（0を下限にします）。取引所の年間取引報告書など、根拠になる数字から転記してください。</p>' +
        '<div class="row2"><div class="fld">' + field("tx-crypto", year + "年の暗号資産の損益（円・赤字はマイナス）", entry.cryptoPnl == null ? "" : entry.cryptoPnl, "number") + '</div></div>' +
        '<div class="btns"><button type="button" class="btn gold" id="tx-cryptosave">暗号資産の損益を保存</button></div><div class="msg" id="tx-cryptomsg"></div>' +
        residentHtml + reconHtml + sheetHtml + prepHtml + archHtml + openingHtml +
        '<p class="sub" style="margin-top:14px">個別の事情がある場合や、判断に迷う場合は、税務署・税理士に相談してください。このページは申告書そのものではありません。</p>';
      body.innerHTML = '<div class="tax-scope">' + html + '</div>';
      var saveYear = function (patch) {
        var d2 = taxData(), e2 = taxYearEntry(d2, year);
        Object.keys(patch).forEach(function (k) { e2[k] = patch[k]; });
        d2.years[String(year)] = e2;
        return put(TAX, d2, "確定申告");
      };
      var numOrNull = function (id) {
        var v = $(id).value.trim(); if (v === "") return null;
        var x = Number(v); return isFinite(x) ? x : NaN;
      };
      var rerender = function (msgId, text) { VIEWS.tax(); var m = $(msgId); if (m) m.textContent = text; };
      $("#tx-yprev").onclick = function () { if (yi < years.length - 1) { taxYear = +years[yi + 1]; VIEWS.tax(); } };
      $("#tx-ynext").onclick = function () { if (yi > 0) { taxYear = +years[yi - 1]; VIEWS.tax(); } };
      $("#tx-ysel").onchange = function () { taxYear = +this.value; VIEWS.tax(); };
      $("#tx-domsave").onclick = function () {
        var v = numOrNull("#tx-dom");
        if (v !== null && isNaN(v)) { $("#tx-dommsg").textContent = "数字で入れてください。"; return; }
        if (saveYear({ domesticFuturesPnl: v })) rerender("#tx-dommsg", v === null ? "国内分を未入力に戻しました。" : "国内分を保存しました。海外分は年合計から差し引いて出しています。");
      };
      $("#tx-expsave").onclick = function () {
        var v = numOrNull("#tx-exp");
        if (v !== null && isNaN(v)) { $("#tx-expmsg").textContent = "数字で入れてください。"; return; }
        if (v !== null && v < 0) { $("#tx-expmsg").textContent = "経費の確定値は0以上で入れてください。"; return; }
        if (saveYear({ expensesFinal: v })) rerender("#tx-expmsg", v === null ? "経費の確定値を未入力に戻しました。" : "経費の確定値を保存しました。");
      };
      var apBtn = $("#tx-apsave");
      if (apBtn) apBtn.onclick = function () {
        var ap = {};
        cand.lifeRows.forEach(function (r, i) {
          var rv = $("#tx-ap-r-" + i).value.trim(), mv = $("#tx-ap-m-" + i).value.trim();
          var ratio = rv === "" ? null : Number(rv);
          if (rv !== "" && (!isFinite(ratio) || ratio < 0 || ratio > 100)) { $("#tx-apmsg").textContent = "割合は0〜100の数字で入れてください。"; return; }
          if (ratio !== null || mv) ap[r.cat] = { ratio: ratio, memo: mv.slice(0, 400) };
        });
        if (saveYear({ apportion: ap })) rerender("#tx-apmsg", "按分のメモを保存しました。");
      };
      $("#tx-salsave").onclick = function () {
        var g = numOrNull("#tx-sal-gross"), a = numOrNull("#tx-sal-after"), d = numOrNull("#tx-sal-ded"), w = numOrNull("#tx-sal-wh");
        if ([g, a, d, w].some(function (x) { return x !== null && isNaN(x); })) { $("#tx-salmsg").textContent = "数字で入れてください。"; return; }
        if (saveYear({ salary: { gross: g, afterDeduction: a, deductionsTotal: d, withheld: w } })) rerender("#tx-salmsg", "給与を保存しました。");
      };
      $("#tx-cryptosave").onclick = function () {
        var v = numOrNull("#tx-crypto");
        if (v !== null && isNaN(v)) { $("#tx-cryptomsg").textContent = "数字で入れてください。"; return; }
        if (saveYear({ cryptoPnl: v })) rerender("#tx-cryptomsg", v === null ? "暗号資産の損益を未入力に戻しました。" : "暗号資産の損益を保存しました。");
      };
      $("#tx-carryadd").onclick = function () {
        var fy = +$("#tx-carry-year").value, amt = numOrNull("#tx-carry-amt");
        if (amt === null || isNaN(amt) || amt <= 0) { $("#tx-carrymsg").textContent = "赤字の金額をプラスの数字で入れてください。"; return; }
        var d2 = taxData(), rows = (d2.carry || []).slice();
        if (rows.some(function (c) { return c.fromYear === fy; })) { $("#tx-carrymsg").textContent = fy + "年の行はすでに入っています。"; return; }
        rows.push({ id: uid(), fromYear: fy, amount: amt });
        d2.carry = rows;
        if (put(TAX, d2, "確定申告")) rerender("#tx-carrymsg", fy + "年の繰り越しの行を足しました。");
      };
      body.querySelectorAll("[data-carrydel]").forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-carrydel"), row = (data.carry || []).filter(function (c) { return c.id === id; })[0];
          if (!row || !confirm(row.fromYear + "年の繰り越しの行（¥" + fmt(row.amount, 0) + "）を消します。よろしいですか？")) return;
          var d2 = taxData();
          d2.carry = (d2.carry || []).filter(function (c) { return c.id !== id; });
          if (put(TAX, d2, "確定申告")) rerender("#tx-carrymsg", "繰り越しの行を消しました。");
        };
      });
      var hsbtn = $("#tx-hssave");
      if (hsbtn) hsbtn.onclick = function () {
        var sr = numOrNull("#tx-hs-share"), pc = numOrNull("#tx-hs-price"), bv = numOrNull("#tx-hs-bal"), iv = numOrNull("#tx-hs-tax");
        if (sr !== null && (isNaN(sr) || sr < 0 || sr > 100)) { $("#tx-hsmsg").textContent = "負担割合は0〜100の数字で入れてください。"; return; }
        if (pc !== null && (isNaN(pc) || pc < 0)) { $("#tx-hsmsg").textContent = "取得対価は0以上の数字で入れてください。"; return; }
        if (bv !== null && (isNaN(bv) || bv < 0)) { $("#tx-hsmsg").textContent = "年末残高は0以上の数字で入れてください。"; return; }
        if (iv !== null && (isNaN(iv) || iv < 0)) { $("#tx-hsmsg").textContent = "所得税額は0以上の数字で入れてください。"; return; }
        var d2 = taxData(), h2 = d2.housing, yk = String(year), myv = $("#tx-hs-year").value;
        h2.enabled = $("#tx-hs-on").checked;
        h2.moveInYear = myv === "" ? null : +myv;
        h2.category = $("#tx-hs-cat").value;
        h2.specialPerson = $("#tx-hs-special").checked;
        h2.shareRatio = sr;
        h2.priceCap = pc;
        if (bv === null || bv === 0) delete h2.balances[yk]; else h2.balances[yk] = bv;
        if (iv === null) delete h2.incomeTax[yk]; else h2.incomeTax[yk] = iv;
        d2.housing = taxHouseNorm(h2);
        if (put(TAX, d2, "確定申告")) rerender("#tx-hsmsg", "住宅ローン控除の設定を保存しました（" + year + "年の残高・所得税額を含む）。");
      };
      /* ----- フェーズ2cの操作 ----- */
      // 突合：レポートの転記値（年間・月別）を保存する
      var rpBtn = $("#tx-rpsave");
      if (rpBtn) rpBtn.onclick = function () {
        var av = numOrNull("#tx-rp-annual");
        if (av !== null && isNaN(av)) { $("#tx-rpmsg").textContent = "年間の確定損益は数字で入れてください。"; return; }
        var mm = {}, bad = false;
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (mo) { var v = numOrNull("#tx-rp-" + mo); if (v !== null && isNaN(v)) bad = true; else if (v !== null) mm[String(mo)] = v; });
        if (bad) { $("#tx-rpmsg").textContent = "月別の数字を確認してください。"; return; }
        if (saveYear({ mt5Annual: av, mt5Months: mm })) rerender("#tx-rpmsg", "照らし合わせを保存しました。差額の表示が更新されます。");
      };
      // MT5 の HTML レポートから、ポジションの一覧を読み取る（この端末の中だけで処理する）
      var mt5Extract = function (doc) {
        var rows = [];
        var findCol = function (heads, names) { for (var i = 0; i < heads.length; i++) { var t = heads[i].replace(/\s+/g, ""); if (names.indexOf(t) >= 0) return i; } return -1; };
        doc.querySelectorAll("table").forEach(function (tb) {
          var trs = tb.querySelectorAll("tr");
          if (trs.length < 2) return;
          var heads = [].map.call(trs[0].querySelectorAll("th,td"), function (c) { return (c.textContent || "").trim(); });
          var posI = findCol(heads, ["Position", "ポジション", "ポジションID"]);
          var profI = findCol(heads, ["Profit", "損益", "利益"]);
          if (posI < 0 || profI < 0) return;
          var comI = findCol(heads, ["Commission", "手数料"]), swpI = findCol(heads, ["Swap", "スワップ"]);
          var timeIdx = []; heads.forEach(function (h, i) { var t = h.replace(/\s+/g, ""); if (t === "Time" || t === "時刻" || t === "時間") timeIdx.push(i); });
          var closeI = timeIdx.length >= 2 ? timeIdx[1] : (heads.length >= 13 ? 8 : timeIdx[0]);
          if (closeI === undefined || closeI < 0) return;
          if (comI < 0) comI = heads.length >= 13 ? 10 : -1;
          if (swpI < 0) swpI = heads.length >= 13 ? 11 : -1;
          for (var r = 1; r < trs.length; r++) {
            var cells = trs[r].querySelectorAll("td");
            if (!cells.length || cells.length <= Math.max(posI, profI, closeI)) continue;
            if (!/^\d+$/.test((cells[posI].textContent || "").trim())) continue;  // 合計行などを除く（ポジション番号が数字の行だけ）
            var tm = /(\d{4})[.\/](\d{2})[.\/](\d{2})/.exec(cells[closeI].textContent || "");
            if (!tm) continue;
            rows.push({ close: tm[1] + "-" + tm[2] + "-" + tm[3], profit: cells[profI].textContent || "", commission: comI >= 0 && cells[comI] ? cells[comI].textContent : "0", swap: swpI >= 0 && cells[swpI] ? cells[swpI].textContent : "0" });
          }
        });
        return rows;
      };
      var fileIn = $("#tx-mt5file");
      if (fileIn) fileIn.addEventListener("change", function () {
        var f = fileIn.files && fileIn.files[0], msg = $("#tx-mt5msg");
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var doc = new DOMParser().parseFromString(String(rd.result || ""), "text/html");
            var rows = mt5Extract(doc);
            if (!rows.length) { msg.textContent = "ポジションの一覧が見つかりませんでした。MT5 のレポート（HTML）かを確認してください。読み取れない場合は、手で転記してください。"; return; }
            var agg = taxMt5Agg(rows), yv = agg.annual[String(year)];
            if (yv === undefined) { msg.textContent = rows.length + "件の決済を読みましたが、" + year + "年に決済した分はありませんでした（上の年を確認してください）。"; return; }
            var aEl = $("#tx-rp-annual"); if (aEl) aEl.value = yv;
            for (var mo = 1; mo <= 12; mo++) { var el = $("#tx-rp-" + mo); if (!el) continue; var mv = agg.monthly[year + "-" + String(mo).padStart(2, "0")]; el.value = mv === undefined ? "" : mv; }
            msg.textContent = "レポートから " + rows.length + " 件の決済を読み、" + year + "年の転記欄へ入れました。内容を確認して「照らし合わせを保存」を押してください。";
          } catch (e) { msg.textContent = "読み込みに失敗しました。手で転記してください。"; }
        };
        rd.readAsText(f);
      });
      // 転記シートの CSV
      var csvBtn = $("#tx-csv");
      if (csvBtn) csvBtn.onclick = function () {
        var rowsCsv = [["対象年：" + year + "年分", "", "", "", "", ""]].concat(sheetRows.map(function (r) {
          return [r.form, r.cell, r.item, r.amount === null ? "" : r.amount, r.src, r.note];
        }));
        download("tax-sheet-" + year + ".csv", kbCsv(["様式", "欄", "項目", "金額（円）", "もとにする記録", "メモ"], rowsCsv), "text/csv;charset=utf-8");
        $("#tx-csvmsg").textContent = "転記シートの CSV を書き出しました。";
      };
      // 工程チェックの保存（チェックの付け外しはその場で保存し、画面は作り直さない）
      body.querySelectorAll("[data-prep]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          var d2 = taxData(), id = cb.getAttribute("data-prep");
          if (cb.checked) d2.prep.checks[id] = true; else delete d2.prep.checks[id];
          if (put(TAX, d2, "確定申告")) { var c = $("#tx-prep-count"); if (c) c.textContent = prepItems.filter(function (p) { return d2.prep.checks[p.id]; }).length + " / " + prepItems.length; }
          else cb.checked = !cb.checked;
        });
      });
      // 工程チェックの期限を ICS で書き出す（未完了の分だけ）
      var icsBtn = $("#tx-ics");
      if (icsBtn) icsBtn.onclick = function () {
        var d2 = taxData();
        var evs = prepItems.filter(function (p) { return !d2.prep.checks[p.id]; }).map(function (p) {
          return { uid: "tax-" + year + "-" + p.id, date: p.due, summary: "確定申告（" + year + "年分）：" + p.title, desc: p.how + "（期限の目安：" + p.dueLabel + "）" };
        });
        if (!evs.length) { $("#tx-icsmsg").textContent = "まだ終わっていない項目はありません。"; return; }
        var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
        download("tax-deadlines-" + year + ".ics", taxIcs(evs, stamp), "text/calendar;charset=utf-8");
        $("#tx-icsmsg").textContent = evs.length + "件の期限を ICS ファイルに書き出しました。お使いのカレンダーに取り込んでください。";
      };
      // 書類の保存アーカイブの保存
      body.querySelectorAll("[data-arch]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          var d2 = taxData(), yk = String(year), id = cb.getAttribute("data-arch");
          if (!d2.archive[yk]) d2.archive[yk] = {};
          if (cb.checked) d2.archive[yk][id] = true; else delete d2.archive[yk][id];
          d2.archive = taxArchiveNorm(d2.archive);
          if (put(TAX, d2, "確定申告")) { var c = $("#tx-arch-count"); if (c) c.textContent = TAX_ARCHIVE_ITEMS.filter(function (a2) { return (d2.archive[yk] || {})[a2.id]; }).length + " / " + TAX_ARCHIVE_ITEMS.length; }
          else cb.checked = !cb.checked;
        });
      });
      // 開業フローの進捗とメモの保存
      body.querySelectorAll("[data-open]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          var d2 = taxData(), id = cb.getAttribute("data-open");
          if (cb.checked) d2.opening.checks[id] = true; else delete d2.opening.checks[id];
          if (put(TAX, d2, "確定申告")) { var c = $("#tx-open-count"); if (c) c.textContent = ["step0", "step1", "step2", "step3", "step4", "step5"].filter(function (k) { return d2.opening.checks[k]; }).length + " / 6"; }
          else cb.checked = !cb.checked;
        });
      });
      var opBtn = $("#tx-opmemo-save");
      if (opBtn) opBtn.onclick = function () {
        var d2 = taxData(); d2.opening.memo = $("#tx-opmemo").value.slice(0, 4000);
        if (put(TAX, d2, "確定申告")) $("#tx-opmsg").textContent = "開業のメモを保存しました。";
      };
      var hgBtn = $("#tx-hcguide");
      if (hgBtn) hgBtn.onclick = function () {
        kbMode = "tax"; show("kakeibo");
        var g = $("#kb-hcguide"); if (g) g.scrollIntoView({ block: "start" });
      };
    },

    /* ---------- signal history ---------- */
    signals: function () {
      var st = D.signals(), hist = st.history, now = Date.now();
      var cur = Object.keys(st.current || {}).map(function (k) {
        var s = st.current[k], a = st.active[k];
        return "<tr><td>" + esc(D.instName(k)) + "</td><td>" + (a ? '<span class="tag ' + a.dir + '">' + SIDE[a.dir] + "候補</span>有効期限 " + esc(C.jst(a.expiresAt, false)) : '<span class="tag">見送り</span>' + esc(s.reason || (s.unmet.length ? "未成立：" + s.unmet.join("・") : ""))) +
          "</td><td>" + esc(C.jst(s.at)) + "</td></tr>";
      }).join("");
      body.innerHTML = '<h3>いまの判定</h3><p class="note">各ダッシュボード（1時間足のセットアップ判定）が最後に報告した状態です。判定は<b>形成中の1時間足を使った暫定判定</b>で、その足が終わると期限切れになります。売買を勧めるものではありません。</p>' +
        (cur ? '<div class="tw"><table><tr><th>銘柄</th><th>状態</th><th>最終報告</th></tr>' + cur + "</table></div>" : '<p class="note">まだ報告がありません（デスクを開いてしばらくすると届きます）。</p>') +
        '<h3>履歴</h3><p class="note">発生・条件の変化・継続・取り消し・期限切れを、その時点の内容のまま残しています（後から書き換えません）。この端末で記録したものだけで、勝率や成績の集計には使っていません。</p>' +
        '<div class="btns"><button type="button" class="btn" id="sg-csv">CSVに書き出す</button></div>' +
        (hist.length ? hist.slice(0, 100).map(function (r) {
          var first = r.events[0], lastEv = r.events[r.events.length - 1], data = first.snap.data || {};
          return '<details><summary><span class="tag ' + r.dir + '">' + SIDE[r.dir] + "候補</span>" + esc(D.instName(r.key)) + " " + esc(r.tf) + "・" + esc(C.jst(r.created)) + "・" +
            esc({ active: "有効", cancelled: "取り消し", expired: "期限切れ" }[r.status] || r.status) + (r.repeat ? "（30分以内の再発生・音なし）" : "") + "</summary>" +
            "<p>成立した条件：" + esc(first.snap.met.join("・") || "—") + "<br>未成立：" + esc(first.snap.unmet.join("・") || "なし") +
            "<br>判定時の価格：" + esc(first.snap.price != null ? first.snap.price : "—") + "（" + esc(C.jst(data.priceAt)) + "・" + esc(data.priceSrc || "—") + "）　判定した足：" + esc(C.jst(data.barAt)) +
            "<br>暫定（形成中の足）：" + (first.snap.provisional ? "はい" : "いいえ") + "　有効期限：" + esc(C.jst(r.expiresAt)) +
            "<br>取り消し条件：" + esc(r.cancelIf || "—") + "</p><ol>" + r.events.map(function (ev) {
              return "<li>" + esc(C.jst(ev.at)) + " " + esc({ created: "発生", changed: "条件が変化", renewed: "次の足でも継続", cancelled: "取り消し", expired: "期限切れ" }[ev.type] || ev.type) +
                (ev.reason ? "：" + esc(ev.reason) : "") + (ev.type === "changed" ? "（成立：" + esc(ev.snap.met.join("・")) + "）" : "") + "</li>";
            }).join("") + "</ol></details>";
        }).join("") : '<p class="note">まだ記録がありません。</p>');
      $("#sg-csv").addEventListener("click", function () {
        var rows = []; hist.forEach(function (r) { r.events.forEach(function (ev) { rows.push({ id: r.id, key: r.key, dir: r.dir, tf: r.tf, event: ev.type, time: new Date(ev.at).toISOString(), reason: ev.reason || "", met: ev.snap.met.join(" / "), unmet: ev.snap.unmet.join(" / "), price: ev.snap.price, expiresAt: new Date(r.expiresAt).toISOString() }); }); });
        download("signal-history-" + C.dayKey(now) + ".csv", C.toCSV(rows, ["id", "key", "dir", "tf", "event", "time", "reason", "met", "unmet", "price", "expiresAt"].map(function (n) { return { name: n }; })), "text/csv");
      });
    },

    /* ---------- market hours ---------- */
    hours: function () {
      var paint = function () {
        var now = Date.now(), s = C.sessions(now);
        body.innerHTML = '<h3>市場セッション（' + esc(C.jst(now)) + '）</h3><p class="note">' + esc(s.note) + " 時刻は日本時間です。夏時間は各都市の時計から自動で計算しています。</p>" +
          '<div class="tw"><table><tr><th>市場</th><th>今日の時間（日本時間）</th><th>状態</th><th>夏時間</th></tr>' + s.list.map(function (x) {
            return "<tr><td>" + esc(x.name) + "</td><td>" + esc(C.jst(x.start, false).replace(" JST", "")) + "〜" + esc(C.jst(x.end, false).replace(" JST", "")) + "</td><td>" + (x.open ? "● 開いている" : "○ 時間外") + "</td><td>" + (x.zone === "Asia/Tokyo" ? "なし" : x.dst ? "夏時間" : "冬時間") + "</td></tr>";
          }).join("") + "</table></div>" + (s.weekend ? '<p class="ok">週末のため為替市場は休場中です。</p>' : s.overlap.length ? '<p class="ok">重なっている時間：' + esc(s.overlap.join("・")) + "（取引が集まりやすい時間帯）</p>" : "") +
          '<h3>銘柄ごとの取引時間</h3><div class="tw"><table><tr><th>銘柄</th><th>今の状態</th><th>取引時間（日本時間）</th></tr>' + ["gold", "usdjpy", "btc", "silver", "usoil", "dxy", "vix"].map(function (k) {
            var m = C.marketState(k, now);
            return "<tr><td>" + esc(D.instName(k)) + "</td><td>" + esc({ open: "取引時間内", closed: "休場", "break": "休止中" }[m.state]) + (m.certain ? "" : "（目安）") + "</td><td>" + esc(m.note) + "</td></tr>";
          }).join("") + "</table></div>";
      };
      paint(); timer = setInterval(paint, 30000);
    },

    /* ---------- data status / diagnostics ---------- */
    status: function () {
      var paint = function () {
        var now = Date.now(), cards = D.cards(), m = D.market(), chk = D.check(), src = D.sources(), lv = function (f, txt) { return '<span class="lv lv-' + f.level + '">' + esc(txt || f.label) + "</span>"; };
        // 予備の取得先（ふだんは使わない）と、休場中に止めている配信は「待機中」。障害に見えないように
        var SPARE = { swissquote: "待機中（通常は未使用・予備）" }, WAIT_CLOSED = { "ws-gold": "gold", "ws-usdjpy": "usdjpy", coinbase: "usdjpy", goldapi: "gold" };
        var idle = function (id) { return SPARE[id] || (WAIT_CLOSED[id] && C.marketState(WAIT_CLOSED[id], now).state !== "open" ? "待機中（休場中は止めています）" : "読み込み中"); };
        var srcRow = function (id, name, kind, at) {
          var s = src[id] || {}, f = kind ? C.freshness(kind, at || s.ok, now) : null;
          return "<tr><td>" + esc(name) + "</td><td>" + (s.ok ? esc(C.jst(s.ok)) + "（" + esc(C.ago(now - s.ok)) + "）" : "—") + "</td><td>" + (!s.tries ? "" : f ? lv(f) : s.ok ? "成功" : "") +
            (s.fail && (!s.ok || s.fail > s.ok) ? ' <span class="lv lv-stale">取得失敗：' + esc(s.err) + "（" + esc(C.jst(s.fail, false)) + "）</span>" : "") + (!s.tries ? '<span class="lv lv-closed">' + esc(idle(id)) + "</span>" : "") + "</td></tr>";
        };
        body.innerHTML = '<h3>表示中の銘柄（' + esc(C.jst(now)) + '）</h3><p class="note">時刻はすべて日本時間（JST）。価格の種類は提供元の公開情報から分かる範囲で示しています。休場中の古い価格は「休場中」で、通信の問題（「停止」「取得失敗」）とは分けて表示します。</p>' +
          '<div class="tw"><table><tr><th>銘柄</th><th>価格の時刻・状態</th><th>提供元・価格の種類</th><th>ローソク足（' + esc(cards[0] ? "表示中の期間" : "") + '）</th><th>自動分析の計算</th><th>市場</th></tr>' + cards.map(function (c) {
            return "<tr><td>" + esc(c.name) + "</td><td>" + esc(C.jst(c.at)) + "<br>" + (c.held ? '<span class="lv lv-held">確認中：' + esc(c.held.join("・")) + "</span>" : lv(c.price)) + "<br>" + esc(isFinite(c.price.age) ? C.ago(c.price.age) : "") + "</td><td>" + esc(c.prov.src) + "<br><small>" + esc(c.prov.type) + "</small></td><td>" + esc(c.tf) + "：" +
              (c.noData ? '<span class="lv lv-missing">データ未取得</span>' : esc(C.jst(c.bar)) + "<br>" + lv(c.candle)) + "</td><td>" + esc(C.jst(c.an)) + "<br>" + lv(c.analysis) +
              (c.analysis.level === "stale" && c.price.level !== "stale" ? '<br><small class="lv-stale">価格は新しいが分析は古い</small>' : "") + "</td><td>" + esc({ open: "取引時間内", closed: "休場", "break": "休止中" }[c.market.state]) + (c.market.certain ? "" : "（目安）") + "</td></tr>";
          }).join("") + "</table></div>" +
          '<h3>データの取得元</h3><div class="tw"><table><tr><th>データ</th><th>最終成功</th><th>状態</th></tr>' +
          srcRow("market", "相場データ・自動分析（サイトの market.json）", "analysis", m && Date.parse(m.updated)) + srcRow("goldapi", "金・銀の現在値（Gold API）", "price") + srcRow("swissquote", "金・銀の代替（Swissquote）", "price") +
          srcRow("coinbase", "ドル円の現在値（Coinbase）", "price") + srcRow("ws-gold", "金のリアルタイム配信（XAUT）", "price") + srcRow("ws-usdjpy", "ドル円のリアルタイム配信（GMO）", "price") +
          srcRow("calendar", "経済指標（Forex Factory 経由）", "calendar") + srcRow("report", "本日のトレード戦略（strategy.json）", "report") + srcRow("weather", "天気（Open-Meteo）", "weather", D.weatherAt()) + srcRow("holidays", "祝日（holidays.json）") + srcRow("news", "要人発言ニュース（news.json）") +
          (D.surge && D.surge() ? "<tr><td>急変検知</td><td>—</td><td>" + esc(Object.keys(D.surge()).map(function (k) { return D.instName(k) + " " + D.surge()[k]; }).join("・")) + "</td></tr>" : "") +
          "</table></div>" +
          (chk && Object.keys(chk.problems).some(function (k) { return chk.problems[k].length; }) ? '<div class="warn">確認中の銘柄（データの検査で問題があり、前回の値を表示中または非表示）：' +
            esc(Object.keys(chk.problems).filter(function (k) { return chk.problems[k].length; }).map(function (k) { return D.instName(k) + "（" + chk.problems[k].join("・") + "）"; }).join("、")) + "</div>" : "") +
          '<div class="btns"><button type="button" class="btn" data-rf="market">相場データを再読み込み</button><button type="button" class="btn" data-rf="prices">現在値を再読み込み</button><button type="button" class="btn" data-rf="calendar">経済指標を再読み込み</button><button type="button" class="btn" data-rf="weather">天気を再読み込み</button></div>' +
          "<h3>すべての銘柄（サイトの定期取得）</h3>" + (m ? '<div class="tw"><table><tr><th>銘柄</th><th>価格の時刻</th><th>分析の計算</th><th>状態</th></tr>' + Object.keys(m.instruments).map(function (k) {
            var x = m.instruments[k], ms = C.marketState(k, now), f = C.freshness("price", x.asOf * 1000, now, { closed: ms.state !== "open" });
            return "<tr><td>" + esc(D.instName(k)) + "</td><td>" + esc(C.jst(x.asOf * 1000)) + "</td><td>" + esc(C.jst(Date.parse(x.updated))) + "</td><td>" + lv(f) + "</td></tr>";
          }).join("") + "</table></div>" : '<p class="note">まだ取得できていません。</p>') +
          '<h3>この画面について</h3><div class="tw"><table>' +
          "<tr><td>アプリの版</td><td>" + esc(D.build || "（開発版）") + (D.newBuild ? "（新しい版 " + esc(D.newBuild) + " があります）" : "") + "</td></tr>" +
          "<tr><td>通信</td><td>" + (navigator.onLine === false ? '<span class="lv lv-stale">オフライン</span>' : "オンライン（端末の判定）") + "</td></tr>" +
          "<tr><td>端末のタイムゾーン</td><td>" + esc(Intl.DateTimeFormat().resolvedOptions().timeZone || "不明") + "（画面の時刻は日本時間で表示）</td></tr>" +
          "<tr><td>リアルタイム配信</td><td>" + esc(Object.keys(D.live()).map(function (k) { var L = D.live()[k]; return D.instName(k) + "：" + (L.open ? "接続中" : "切断（再接続待ち・休場中・非表示）") + (L.at ? "・最終受信 " + C.jst(L.at, false) : ""); }).join("／") || "なし") + "</td></tr>" +
          "<tr><td>表示モード</td><td>" + (D.preview ? '<span class="lv lv-held">プレビュー（サンプルの値を含みます）</span>' : "本番（実データのみ。取得できない値は空欄・未取得と表示）") + "</td></tr></table></div>" +
          '<h3>鮮度の基準</h3><p class="note">価格：20秒以内＝ライブ、2分以内＝最新、15分以内＝遅延、それより前＝停止（休場中は「休場中」）。ローソク足：期間＋20分（または1期間）以内＝最新。自動分析：15分以内＝最新、60分まで遅延、それより前＝停止（そのときカードの一致度は取り消し線で参考外）。経済指標：30分／3時間。天気：90分／3時間。祝日・年末年始・短縮取引は判定に含めていないため、平日の「取引時間内」は目安です。</p>';
        body.querySelectorAll("[data-rf]").forEach(function (b) { b.addEventListener("click", function () { D.refresh(b.getAttribute("data-rf")); D.toast("再読み込みしています…"); setTimeout(paint, 2500); }); });
      };
      paint(); timer = setInterval(paint, 15000);
    },

    /* ---------- settings ---------- */
    settings: function () {
      var nt = D.notify(), low = document.documentElement.classList.contains("lowpower");
      var themeNow = "auto"; try { themeNow = LS.getItem("td_theme") || "auto"; } catch (e) {}
      var roomUrl = ""; try { roomUrl = LS.getItem("td_room_url") || ""; } catch (e) {}
      var appsShow = true; try { appsShow = LS.getItem("td_apps_show") !== "0"; } catch (e) {}
      var appXmtd = ""; try { appXmtd = LS.getItem("td_app_xmtd") || ""; } catch (e) {}
      var appXs = ""; try { appXs = LS.getItem("td_app_xs") || ""; } catch (e) {}
      var appMt5 = ""; try { appMt5 = LS.getItem("td_app_mt5") || ""; } catch (e) {}
      body.innerHTML = '<h3>テーマ（見た目）</h3>' + select("st-theme", "ホーム画面のテーマ", [["auto", "自動（季節で切替）"], ["current", "基本デザイン"], ["neon", "アゲアゲ⭐︎ネオン"], ["spring", "春"], ["summer", "夏"], ["autumn", "秋"], ["xmas", "クリスマス"], ["newyear", "正月"], ["winter", "冬"], ["shippu", "利確の炎🔥"], ["aurora", "🌌 安らぎのオーロラ"]], themeNow) +
        '<p class="note">季節の割り当て：春 3〜5月／夏 6〜8月／秋 9〜11月／クリスマス 12月／正月 12月29日〜1月3日／冬 1〜2月。テーマはこの端末のブラウザに保存されます（端末ごとに別です）。舞う飾り（桜・落ち葉・雪・金粉）は、ページを開き直すと切り替わります。</p>' +
        '<h3>省電力</h3><label class="chk"><input type="checkbox" id="st-low"' + (low ? " checked" : "") + '><span>省電力モード（背景の動き・光・ぼかし・点滅を止めます。iPadの発熱や電池の消費を抑えたいときに）</span></label>' +
        '<h3>ROOM進捗ボード</h3>' + (roomUrl ?
          '<p class="note">この端末にはボードのリンクが登録済みです。リンクはこの端末の中だけに保存されています。</p><div class="btns"><button type="button" class="btn pri" id="st-roomopen">ROOM進捗ボードを開く</button><button type="button" class="btn" id="st-roomdel">登録を消す</button></div>' :
          '<p class="note">ボードのリンクを登録した端末だけに、開くボタンが出ます（この下と、画面下のドックの家計簿の横）。リンクはこの端末の中だけに保存され、アプリのコードには含まれません。</p><div class="btns"><input type="url" id="st-roomurl" placeholder="ボードのリンクを貼り付け" style="flex:1;min-width:200px;font:inherit;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid rgba(227,184,103,.5);background:rgba(0,0,0,.25);color:inherit"><button type="button" class="btn" id="st-roomsave">登録する</button></div><div id="st-roommsg" class="note" aria-live="polite"></div>') +
        '<h3>取引アプリのボタン</h3><label class="chk"><input type="checkbox" id="st-appshow"' + (appsShow ? " checked" : "") + '><span>ドックの「開く」に取引アプリのボタン（XMTD TraderPro・XS アプリ・MetaTrader 5）を表示する</span></label>' +
        '<p class="note">ボタンを押すとアプリの起動を試み、開けない場合は公式ストア／公式サイトへ切り替わります。飛び先は端末ごとに変えられます（空欄＝標準の飛び先）。リンクはこの端末の中だけに保存され、アプリのコードには含まれません。</p>' +
        '<div class="btns"><span style="align-self:center;font-size:12px;min-width:104px">XMTD TraderPro</span><input type="url" id="st-app-xmtd" value="' + esc(appXmtd).replace(/"/g, "&quot;") + '" placeholder="標準の飛び先（空欄）" style="flex:1;min-width:200px;font:inherit;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid rgba(227,184,103,.5);background:rgba(0,0,0,.25);color:inherit" autocapitalize="off" autocomplete="off" spellcheck="false"></div>' +
        '<div class="btns"><span style="align-self:center;font-size:12px;min-width:104px">XS アプリ</span><input type="url" id="st-app-xs" value="' + esc(appXs).replace(/"/g, "&quot;") + '" placeholder="標準の飛び先（空欄）" style="flex:1;min-width:200px;font:inherit;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid rgba(227,184,103,.5);background:rgba(0,0,0,.25);color:inherit" autocapitalize="off" autocomplete="off" spellcheck="false"></div>' +
        '<div class="btns"><span style="align-self:center;font-size:12px;min-width:104px">MetaTrader 5</span><input type="url" id="st-app-mt5" value="' + esc(appMt5).replace(/"/g, "&quot;") + '" placeholder="標準の飛び先（空欄）" style="flex:1;min-width:200px;font:inherit;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid rgba(227,184,103,.5);background:rgba(0,0,0,.25);color:inherit" autocapitalize="off" autocomplete="off" spellcheck="false"></div>' +
        '<div class="btns"><button type="button" class="btn" id="st-appsave">リンクを保存</button></div><div id="st-appmsg" class="note" aria-live="polite"></div>' +
        '<h3>通知について</h3><div class="out">' + esc("端末の通知：" + ({ granted: "許可済み", denied: "拒否（端末の設定から変更）", default: "未設定（通知のボタンを押したときに確認します）", unsupported: "この環境では使えません" }[nt.permission] || nt.permission) +
          "\n通知音：" + ({ high: "大", mid: "中", low: "小", off: "オフ" }[nt.sound] || "中") + "（ホームの右上のスピーカーのボタンと同じ。エントリー・ダッシュボードのアラート・急変・地震の音量）" +
          "\n・音と通知は、このページを開いている間だけ届きます。ブラウザやアプリを閉じている間のプッシュ通知には対応していません。" +
          "\n・iPhone・iPadは、ホーム画面に追加したアプリから開いた場合に限り端末の通知が使えます。" +
          "\n・価格アラートの条件（価格到達など）は各ダッシュボードの「アラート」で設定します。同じエントリー判定は30分以内に重ねて鳴らしません。") + "</div>" +
        '<h3>保存とバックアップ</h3><p class="note">設定・日誌・チェック・シグナル履歴は、すべてこの端末のブラウザの中（localStorage）に保存しています。サーバーには保存していないため、端末を替えるときやブラウザのデータを消す前には書き出してください。</p>' +
        '<div class="btns"><button type="button" class="btn pri" id="st-exp">すべて書き出す（JSON）</button><button type="button" class="btn" id="st-imp">読み込む</button></div><div id="st-msg" class="note" aria-live="polite"></div>' +
        '<h3>初期化</h3><p class="note">分けて初期化できます。元に戻せないので、先に書き出しておくと安心です。</p><div class="btns">' +
        '<button type="button" class="btn danger" data-rs="display">表示の設定</button><button type="button" class="btn danger" data-rs="notify">通知・アラート</button><button type="button" class="btn danger" data-rs="trading">資金管理・日誌・履歴</button><button type="button" class="btn danger" data-rs="all">すべて</button></div>';
      $("#st-theme").addEventListener("change", function () { try { LS.setItem("td_theme", this.value); } catch (e) {} if (window.TDThemeApply) window.TDThemeApply(); });
      $("#st-low").addEventListener("change", function () { D.setPower(this.checked); });
      var roomSave = $("#st-roomsave"); if (roomSave) roomSave.addEventListener("click", function () { var v = (($("#st-roomurl").value || "") + "").trim(); if (!/^https:\/\/muse\.ai\/s\//.test(v)) { $("#st-roommsg").textContent = "⚠ ボードのリンク（https://muse.ai/s/ で始まるもの）を貼ってください"; return; } try { LS.setItem("td_room_url", v); } catch (e) {} if (window.TDRoomDockSync) window.TDRoomDockSync(); VIEWS.settings(); });
      var roomOpen = $("#st-roomopen"); if (roomOpen) roomOpen.addEventListener("click", function () { var u = ""; try { u = LS.getItem("td_room_url") || ""; } catch (e) {} if (u) window.open(u, "_blank", "noopener"); });
      var roomDel = $("#st-roomdel"); if (roomDel) roomDel.addEventListener("click", function () { try { LS.removeItem("td_room_url"); } catch (e) {} if (window.TDRoomDockSync) window.TDRoomDockSync(); VIEWS.settings(); });
      var appShowEl = $("#st-appshow"); if (appShowEl) appShowEl.addEventListener("change", function () { try { LS.setItem("td_apps_show", this.checked ? "1" : "0"); } catch (e) {} if (window.TDAppDockSync) window.TDAppDockSync(); });
      var appSave = $("#st-appsave"); if (appSave) appSave.addEventListener("click", function () {
        var defs = [["#st-app-xmtd", "td_app_xmtd"], ["#st-app-xs", "td_app_xs"], ["#st-app-mt5", "td_app_mt5"]], bad = false;
        defs.forEach(function (d) { var v = (($(d[0]).value || "") + "").trim(); if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) bad = true; });
        if (bad) { $("#st-appmsg").textContent = "⚠ リンクは https:// などのURL（スキーム付き）で貼ってください"; return; }
        defs.forEach(function (d) { var v = (($(d[0]).value || "") + "").trim().replace(/"/g, ""); try { if (v) LS.setItem(d[1], v); else LS.removeItem(d[1]); } catch (e) {} });
        $("#st-appmsg").textContent = "保存しました（空欄のアプリは標準の飛び先です）";
      });
      $("#st-exp").addEventListener("click", function () { download("trade-desk-backup-" + C.dayKey(Date.now()) + ".json", JSON.stringify(C.exportSettings(LS, Date.now()), null, 1), "application/json"); });
      $("#st-imp").addEventListener("click", function () {
        pickFile(".json,application/json", function (text) {
          var obj; try { obj = JSON.parse(text); } catch (e) { $("#st-msg").textContent = "JSONとして読めませんでした"; return; }
          if (!confirm("書き出したファイルの内容で、この端末の同じ項目を上書きします。よろしいですか？")) return;
          var r = C.importSettings(obj, LS);
          $("#st-msg").textContent = r.errors.length ? "⚠ " + r.errors.join("／") : "読み込みました：" + r.written + "項目" + (r.ignored.length ? "（対象外として無視：" + r.ignored.length + "項目）" : "") + "。反映には再読み込みが必要な項目があります。";
        });
      });
      body.querySelectorAll("[data-rs]").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = b.getAttribute("data-rs");
          if (!confirm(b.textContent + "を初期化します。元に戻せません。よろしいですか？")) return;
          var n = C.resetGroup(LS, g); $("#st-msg").textContent = n + "項目を初期化しました。ページを再読み込みすると反映されます。";
        });
      });
    }
  };
  var draft = null, pnlSel = "", pnlMonth = "", pnlMode = "", kbYm = "", kbEdit = null, kbMode = "month", kbYear = 0, kbIncome = "", kbLastDate = "", kbScopeLast = "life", kbLoanEdit = null, kbAssetEdit = null, jnDay = "", taxYear = 0;
  var num = function (v) { var x = Number(v); return v === "" || !isFinite(x) ? null : x; };
  var toLocal = function (iso) { var t = new Date(iso), z = function (x) { return String(x).padStart(2, "0"); }; return t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate()) + "T" + z(t.getHours()) + ":" + z(t.getMinutes()); };
  var JCOLS = [{ name: "id", type: "string", required: true }, { name: "time", type: "time", required: true }, { name: "key", type: "string", required: true },
    { name: "side", type: "enum", values: ["buy", "sell"] }, { name: "entry", type: "number" }, { name: "exit", type: "number" }, { name: "lots", type: "number" },
    { name: "pnl", type: "number" }, { name: "ccy", type: "string" }, { name: "rules", type: "enum", values: ["yes", "no"] }, { name: "chart", type: "string" },
    { name: "reason", type: "string" }, { name: "result", type: "string" }, { name: "reflection", type: "string" }, { name: "checkId", type: "string" },
    { name: "kind", type: "enum", values: ["trade", "skip"] }];  // 最後の列に追加：見送り（skip）。古いCSV（この列なし）は取引として読む
  // results by instrument, side and Japan hour: counts first, and too few trades are called too few
  function stats(rows) {
    var done = rows.filter(function (r) { return r.kind !== "skip" && isFinite(r.pnl) && r.pnl !== null; });  // 見送りは入れない
    if (!done.length) return '<p class="note">損益を入れた記録がまだありません。</p>';
    var t0 = Math.min.apply(null, done.map(function (r) { return Date.parse(r.time); })), t1 = Math.max.apply(null, done.map(function (r) { return Date.parse(r.time); }));
    var group = function (f) {
      var g = {}; done.forEach(function (r) { var k = f(r); (g[k] = g[k] || []).push(r); });
      return Object.keys(g).map(function (k) {
        var a = g[k], win = a.filter(function (r) { return r.pnl > 0; }).length, sum = a.reduce(function (s, r) { return s + r.pnl; }, 0);
        return "<tr><td>" + esc(k) + "</td><td>" + a.length + "</td><td>" + (a.length >= 20 ? (win / a.length * 100).toFixed(0) + "％" : "件数不足") + "</td><td>" + (sum >= 0 ? "+" : "") + fmt(sum, 0) + "</td></tr>";
      }).join("");
    };
    var head = '<tr><th>区分</th><th>件数</th><th>勝ちの割合</th><th>損益合計</th></tr>';
    return '<p class="note">対象：' + esc(C.jst(t0)) + "〜" + esc(C.jst(t1)) + "・" + done.length + "件（日誌に手入力した実際の取引のみ。損益は入力値＝手数料などの扱いは入力どおり。シミュレーションは含みません）。20件未満の区分は割合を出していません。</p>" +
      '<div class="tw"><table>' + head + group(function (r) { return "銘柄：" + r.key; }) + group(function (r) { return "向き：" + (SIDE[r.side] || r.side); }) +
      group(function (r) { return "ルール：" + ({ yes: "守れた", no: "守れなかった" }[r.rules] || "未記入"); }) +
      group(function (r) { var h = C.partsIn("Asia/Tokyo", Date.parse(r.time)).h; return "時間帯（日本）：" + (h < 9 ? "0〜9時" : h < 16 ? "9〜16時" : h < 21 ? "16〜21時" : "21〜24時"); }) + "</table></div>";
  }
  window.TDTools = { open: open, close: close };
})();
