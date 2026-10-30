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
  var TABS = [["guide", "使い方"], ["money", "資金管理"], ["check", "取引前チェック"], ["journal", "日誌"], ["signals", "シグナル履歴"], ["hours", "市場時間"], ["status", "データ状態"], ["settings", "設定"]];
  var css = document.createElement("style");
  css.textContent = [
    ".tdt{position:fixed;inset:0;z-index:45;background:rgba(4,5,8,.72);display:flex;align-items:stretch;justify-content:center;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}",
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
    "@media (max-width:600px){.tdt{padding:0}.tdt-box{border-radius:0}.tdt-body{padding:12px}}"
  ].join("\n");
  document.head.appendChild(css);
  var box = document.createElement("div");
  box.className = "tdt"; box.hidden = true;
  box.innerHTML = '<div class="tdt-box" role="dialog" aria-modal="true" aria-labelledby="tdt-h"><div class="tdt-top"><h2 id="tdt-h">🧰 ツール</h2><button type="button" class="tdt-x">閉じる</button></div>' +
    '<div class="tdt-tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="false">' + t[1] + "</button>"; }).join("") + "</div>" +
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
  function show(t) {
    tab = t; try { LS.setItem("td-tools-tab", t); } catch (e) {}
    box.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
    clearInterval(timer);
    (VIEWS[t] || VIEWS.guide)();
    var h = HELP[t];
    if (h) {  // one line on top of each tab, and the full guide one tap away
      body.insertAdjacentHTML("afterbegin", '<p class="tdt-tip">💡 ' + esc(h[0]) + ' <button type="button" class="tdt-more" data-help="' + t + '">くわしい使い方</button></p>');
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
  var JOURNAL = "td-journal-v1", RISK = "td-risk-v1", CHECKS = "td-checks-v1";
  function journal() { var j = get(JOURNAL, []); return Array.isArray(j) ? j : []; }
  var HELP = {
    money: ["口座の条件と損切り価格を入れると、許容損失に収まる数量が出ます。足りない項目があると数量は出しません。", "money"],
    check: ["入る前に7つの項目を確かめて「記録する」。次の重要指標と今日の損失も自動で表示します。"],
    journal: ["取引のあとに、理由・結果・反省を残します。CSVで書き出し・読み込みができます。"],
    signals: ["ダッシュボードの判定（買い候補・売り候補・見送り）と、その時点の根拠の記録です。売買の指示ではありません。"],
    hours: ["東京・ロンドン・ニューヨークの時間と、銘柄ごとの取引時間（目安）を日本時間で表示します。"],
    status: ["価格・ローソク足・自動分析が、いつ・どこから届いたかを確かめる画面です。数字がおかしいと思ったらまずここ。"],
    settings: ["省電力、通知の注意点、バックアップ（書き出し・読み込み）、初期化です。"]
  };
  var GUIDE = [
    ["money", "資金管理（ポジションサイズ・リスクリワード・損失上限）", [
      "「銘柄」と「口座通貨」を選び、「銘柄の一般的な値を入れる」を押す（契約サイズ・刻み・最小数量が入ります）。",
      "入った値が自分の口座の条件と同じか確かめ、違えば直す（業者・口座で違います）。",
      "口座残高と許容リスク（％）、または許容損失額を入れる。",
      "エントリー価格と損切り価格を入れると、数量（lot）と、損切りでの損失・取引金額が出ます。",
      "円口座でゴールドやBTCを計算するときは換算レート（1ドル＝何円）が必要です。「デスクのドル円を換算レートに使う」で参考値を入れられます。"],
      "数量は刻みで切り下げます。最小数量に届かないときは「見送り」と表示します（切り上げると許容損失を超えるため）。リスクリワードは向き・エントリー・損切り・利確を入れ、コストを入れると「コスト込み」も出ます。1日の損失上限を入れると、日誌の今日の損益と比べて注意を出します。"],
    ["check", "取引前チェック", [
      "銘柄と向きを選ぶ。上の枠に、次の重要指標までの時間・その銘柄のデータの鮮度・今日の損失が出ます。",
      "7つの項目を確かめてチェックを入れる。",
      "取引の理由を一文で書き、「記録する」。",
      "そのまま取引した場合は「記録して日誌を書く」で、日誌に銘柄・向き・理由が入った状態で移れます。"],
      "枠が赤いとき（損失上限に達した・データが古い）は、入る前に理由を確かめてください。チェックがそろっても利益を保証するものではありません。"],
    ["journal", "トレード日誌", [
      "日時・銘柄・向き・価格・数量・確定損益（手数料込み）を入れる。",
      "判断の理由・結果・反省を書き、「ルールを守れたか」を選んで「記録する」。",
      "下の一覧の「編集」で直せます。「削除」は元に戻せません。",
      "「CSVに書き出す」で表計算ソフトに、「CSVを読み込む」で別の端末から取り込めます（同じ記録は二重に入りません）。"],
      "成績のまとめは日誌に入れた実際の取引だけで計算します。20件未満の区分は勝ちの割合を出しません。"],
    ["signals", "シグナル履歴", [
      "「いまの判定」で、各銘柄が買い候補・売り候補・見送りのどれかと、その理由が分かります。",
      "履歴の行をタップすると、成立した条件・足りなかった条件・判定時の価格と時刻・有効期限・取り消しになった理由が見られます。",
      "「CSVに書き出す」で全イベントを保存できます。"],
      "判定は形成中の1時間足を使った暫定判定で、その足が終わると期限切れになります。同じ判定は30分以内に重ねて鳴らしません。デスクを開いている間に届いた分だけ記録されます。"],
    ["hours", "市場時間", [
      "3つの市場の今日の時間（日本時間）と、開いているか・重なっているかを見る。",
      "下の表で、銘柄ごとに今が取引時間内か・休場か・休止中かを見る。"],
      "夏時間は自動で計算します。祝日・短縮取引は含めていないので、平日の「取引時間内」は目安です。"],
    ["status", "データ状態", [
      "上の表で、表示中の3銘柄の価格の時刻・提供元・価格の種類・ローソク足と自動分析の時刻を確かめる。",
      "「データの取得元」で、どのデータがいつ最後に届いたか、失敗していればその理由を見る。",
      "古いものがあれば、下の「再読み込み」ボタンでそのデータだけ取り直せます。"],
      "価格カードの札をタップしてもこの画面が開きます。"],
    ["settings", "設定・バックアップ", [
      "iPadが熱いとき・電池を持たせたいときは「省電力モード」をオン。",
      "端末を替える前やブラウザのデータを消す前に「すべて書き出す（JSON）」。新しい端末では「読み込む」。",
      "表示だけ・通知だけ・資金管理と日誌だけ、など分けて初期化できます（元に戻せません）。"],
      "データはこの端末のブラウザの中だけに保存しています。音や通知は、このページを開いている間だけ届きます。"]
  ];
  var VIEWS = {
    guide: function () {
      body.innerHTML = '<h3>🧰 ツールの使い方</h3><p class="note">デスクの数字を確かめ、入る前の準備と、あとからの振り返りに使う道具です。売買をすすめるものではありません。入力した内容はこの端末の中だけに保存され、どこにも送信しません。</p>' +
        '<h3>おすすめの使い方（1回の取引の流れ）</h3><div class="flow">' +
        [["① 確かめる", "データ状態で、価格と分析が新しいか"], ["② 時間を見る", "市場時間・取引前チェックで、指標や休場が近くないか"], ["③ 数量を決める", "資金管理で、損切りまでの損失が許容内の数量"],
          ["④ チェックする", "取引前チェックで7項目を確かめて記録"], ["⑤ 記録する", "取引のあと日誌に結果と反省"], ["⑥ 振り返る", "日誌の成績のまとめ・シグナル履歴を見直す"]]
          .map(function (x) { return "<div><b>" + esc(x[0]) + "</b>" + esc(x[1]) + "</div>"; }).join("") + "</div>" +
        '<h3>価格カードの札の読み方</h3><div class="tw"><table><tr><th>札</th><th>意味</th></tr>' +
        [["● ライブ", "20秒以内に届いた価格"], ["● 最新", "2分以内"], ["◔ 遅延", "15分以内。少し古い"], ["⚠ 停止", "15分より前のまま更新されていない（通信や提供元の問題）"],
          ["☾ 休場中", "市場が閉まっている間の最後の価格（故障ではありません）"], ["⏸ 確認中", "届いたデータに不自然な点があり、前の値を表示している"]]
          .map(function (x) { return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>"; }).join("") +
        '</table></div><p class="note">札の時刻は日本時間です。札をタップするとデータ状態の画面が開きます。一致度（例「買い優勢 97」）に取り消し線が出ているときは、自動分析が古いので参考にしないでください。一致度は勝率や確率ではありません。</p>' +
        "<h3>タブごとの使い方</h3>" + GUIDE.map(function (g) {
          return '<details id="g-' + g[0] + '"><summary><b>' + esc(g[1]) + '</b></summary><ol class="steps">' + g[2].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
            '</ol><p class="note">' + esc(g[3]) + '</p><div class="btns"><button type="button" class="btn" data-gtab="' + g[0] + '">このタブを開く</button></div></details>';
        }).join("") +
        '<h3>操作のヒント</h3><p class="note">閉じるは右上の「閉じる」かEscキー。キーボードではTabで移動し、Enterで押せます。最後に開いたタブは次回も開きます。この「使い方」はいつでも左端のタブから開けます。</p>';
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
      var rows = journal();
      body.innerHTML = '<h3>トレード日誌</h3><p class="note">判断の理由・取引内容・結果・反省を残します。端末の中だけに保存し、どこにも送信しません（「設定」からファイルに書き出せます）。</p>' +
        '<div class="grid">' + field("jn-time", "日時", toLocal(d.time || new Date().toISOString()), "datetime-local") +
        select("jn-key", "銘柄", [["gold", "GOLD"], ["usdjpy", "ドル円"], ["btc", "BTC/USD"], ["other", "その他"]], d.key || "gold") + select("jn-side", "向き", [["buy", "買い"], ["sell", "売り"]], d.side || "buy") +
        field("jn-entry", "エントリー価格", d.entry, "number") + field("jn-exit", "決済価格", d.exit, "number") + field("jn-lots", "数量（lot）", d.lots, "number") +
        field("jn-pnl", "確定損益（口座通貨・手数料込み）", d.pnl, "number") + select("jn-rules", "ルールを守れたか", [["", "—"], ["yes", "守れた"], ["no", "守れなかった"]], d.rules || "") +
        field("jn-chart", "チャートのURL・メモ（任意）", d.chart) + "</div>" +
        '<label class="f">判断の理由<textarea id="jn-reason" maxlength="4000">' + esc(d.reason || "") + "</textarea></label>" +
        '<label class="f">結果<textarea id="jn-result" maxlength="4000">' + esc(d.result || "") + "</textarea></label>" +
        '<label class="f">反省・次に活かすこと<textarea id="jn-reflect" maxlength="4000">' + esc(d.reflection || "") + "</textarea></label>" +
        '<div class="btns"><button type="button" class="btn pri" id="jn-save">' + (d.id ? "更新する" : "記録する") + '</button><button type="button" class="btn" id="jn-csv">CSVに書き出す</button><button type="button" class="btn" id="jn-imp">CSVを読み込む</button></div>' +
        '<div id="jn-msg" class="note" aria-live="polite"></div><h3>成績のまとめ</h3><div id="jn-stats"></div><h3>記録</h3><div id="jn-list"></div>';
      var paint = function () {
        rows = journal();
        $("#jn-list").innerHTML = rows.length ? '<div class="tw"><table><tr><th>日時</th><th>銘柄</th><th>向き</th><th>損益</th><th>理由・反省</th><th></th></tr>' + rows.slice(0, 200).map(function (r) {
          return "<tr><td>" + esc(C.jst(Date.parse(r.time))) + "</td><td>" + esc(r.key) + '</td><td class="' + esc(r.side) + '">' + esc(SIDE[r.side] || r.side) + "</td><td>" + (isFinite(r.pnl) ? (r.pnl >= 0 ? "+" : "") + fmt(r.pnl, 0) : "—") +
            "</td><td>" + esc((r.reason || "") + (r.reflection ? " ／ " + r.reflection : "")).slice(0, 300) + '</td><td><button type="button" class="btn" data-ed="' + esc(r.id) + '">編集</button> <button type="button" class="btn danger" data-del="' + esc(r.id) + '">削除</button></td></tr>';
        }).join("") + "</table></div>" : '<p class="note">まだ記録がありません。</p>';
        $("#jn-stats").innerHTML = stats(rows);
      };
      $("#jn-save").addEventListener("click", function () {
        var t = Date.parse($("#jn-time").value);
        if (!isFinite(t)) { $("#jn-msg").textContent = "日時を入れてください"; return; }
        var pnl = $("#jn-pnl").value === "" ? NaN : Number($("#jn-pnl").value);
        if ($("#jn-pnl").value !== "" && !isFinite(pnl)) { $("#jn-msg").textContent = "損益は数字で入れてください"; return; }
        var rec = { id: d.id || uid(), time: new Date(t).toISOString(), day: C.dayKey(t), key: $("#jn-key").value, side: $("#jn-side").value,
          entry: num($("#jn-entry").value), exit: num($("#jn-exit").value), lots: num($("#jn-lots").value), pnl: isFinite(pnl) ? pnl : null, ccy: (get(RISK, {}) || {}).ccy || "JPY",
          rules: $("#jn-rules").value, chart: $("#jn-chart").value.trim(), reason: $("#jn-reason").value.trim(), result: $("#jn-result").value.trim(), reflection: $("#jn-reflect").value.trim(), checkId: d.checkId || "" };
        var all = journal().filter(function (x) { return x.id !== rec.id; }); all.unshift(rec);
        all.sort(function (a, b) { return Date.parse(b.time) - Date.parse(a.time); });
        if (put(JOURNAL, all, "日誌")) { $("#jn-msg").textContent = "保存しました。"; d = {}; VIEWS.journal(); }
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
      paint();
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
          '<h3>銘柄ごとの取引時間</h3><div class="tw"><table><tr><th>銘柄</th><th>今の状態</th><th>基準</th></tr>' + ["gold", "usdjpy", "btc", "silver", "usoil", "dxy", "vix"].map(function (k) {
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
        var srcRow = function (id, name, kind, at) {
          var s = src[id] || {}, f = kind ? C.freshness(kind, at || s.ok, now) : null;
          return "<tr><td>" + esc(name) + "</td><td>" + (s.ok ? esc(C.jst(s.ok)) + "（" + esc(C.ago(now - s.ok)) + "）" : "—") + "</td><td>" + (!s.tries ? "" : f ? lv(f) : s.ok ? "成功" : "") +
            (s.fail && (!s.ok || s.fail > s.ok) ? ' <span class="lv lv-stale">失敗：' + esc(s.err) + "（" + esc(C.jst(s.fail, false)) + "）</span>" : "") + (!s.tries ? '<span class="lv lv-missing">未取得</span>' : "") + "</td></tr>";
        };
        body.innerHTML = '<h3>表示中の銘柄（' + esc(C.jst(now)) + '）</h3><p class="note">時刻はすべて日本時間（JST）。価格の種類は提供元の公開情報から分かる範囲で示しています。休場中の古い価格は「休場中（最終値）」で、通信の問題とは分けて表示します。</p>' +
          '<div class="tw"><table><tr><th>銘柄</th><th>価格の時刻・状態</th><th>提供元・価格の種類</th><th>ローソク足（' + esc(cards[0] ? "表示中の期間" : "") + '）</th><th>自動分析の計算</th><th>市場</th></tr>' + cards.map(function (c) {
            return "<tr><td>" + esc(c.name) + "</td><td>" + esc(C.jst(c.at)) + "<br>" + (c.held ? '<span class="lv lv-held">確認中：' + esc(c.held.join("・")) + "</span>" : lv(c.price)) + "<br>" + esc(isFinite(c.price.age) ? C.ago(c.price.age) : "") + "</td><td>" + esc(c.prov.src) + "<br><small>" + esc(c.prov.type) + "</small></td><td>" + esc(c.tf) + "：" +
              (c.noData ? '<span class="lv lv-missing">データ未取得</span>' : esc(C.jst(c.bar)) + "<br>" + lv(c.candle)) + "</td><td>" + esc(C.jst(c.an)) + "<br>" + lv(c.analysis) +
              (c.analysis.level === "stale" && c.price.level !== "stale" ? '<br><small class="lv-stale">価格は新しいが分析は古い</small>' : "") + "</td><td>" + esc({ open: "取引時間内", closed: "休場", "break": "休止中" }[c.market.state]) + (c.market.certain ? "" : "（目安）") + "</td></tr>";
          }).join("") + "</table></div>" +
          '<h3>データの取得元</h3><div class="tw"><table><tr><th>データ</th><th>最終成功</th><th>状態</th></tr>' +
          srcRow("market", "相場データ・自動分析（サイトの market.json）", "analysis", m && Date.parse(m.updated)) + srcRow("goldapi", "金・銀の現在値（Gold API）", "price") + srcRow("swissquote", "金・銀の代替（Swissquote）", "price") +
          srcRow("coinbase", "ドル円の現在値（Coinbase）", "price") + srcRow("ws-gold", "金のリアルタイム配信（XAUT）", "price") + srcRow("ws-usdjpy", "ドル円のリアルタイム配信（GMO）", "price") +
          srcRow("calendar", "経済指標（Forex Factory 経由）", "calendar") + srcRow("report", "本日のトレード戦略（strategy.json）", "report") + srcRow("weather", "天気（Open-Meteo）", "weather", D.weatherAt()) + srcRow("holidays", "祝日（holidays.json）") +
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
          '<h3>鮮度の基準</h3><p class="note">価格：20秒以内＝リアルタイム、2分以内＝最新、15分以内＝遅延、それより前＝更新停止（休場中は「休場中」）。ローソク足：期間＋20分（または1期間）以内＝最新。自動分析：15分以内＝最新、60分まで遅延、それより前＝更新停止（そのときカードの一致度は取り消し線で参考外）。経済指標：30分／3時間。天気：90分／3時間。祝日・年末年始・短縮取引は判定に含めていないため、平日の「取引時間内」は目安です。</p>';
        body.querySelectorAll("[data-rf]").forEach(function (b) { b.addEventListener("click", function () { D.refresh(b.getAttribute("data-rf")); D.toast("再読み込みしています…"); setTimeout(paint, 2500); }); });
      };
      paint(); timer = setInterval(paint, 15000);
    },

    /* ---------- settings ---------- */
    settings: function () {
      var nt = D.notify(), low = document.documentElement.classList.contains("lowpower");
      body.innerHTML = '<h3>省電力</h3><label class="chk"><input type="checkbox" id="st-low"' + (low ? " checked" : "") + '><span>省電力モード（背景の動き・光・ぼかし・点滅を止めます。iPadの発熱や電池の消費を抑えたいときに）</span></label>' +
        '<h3>通知について</h3><div class="out">' + esc("端末の通知：" + ({ granted: "許可済み", denied: "拒否（端末の設定から変更）", default: "未設定（通知のボタンを押したときに確認します）", unsupported: "この環境では使えません" }[nt.permission] || nt.permission) +
          "\n音：" + (nt.sound || "既定") + "（右上のスピーカーのボタンで切り替え）" +
          "\n・音と通知は、このページを開いている間だけ届きます。ブラウザやアプリを閉じている間のプッシュ通知には対応していません。" +
          "\n・iPhone・iPadは、ホーム画面に追加したアプリから開いた場合に限り端末の通知が使えます。" +
          "\n・価格アラートの条件（価格到達など）は各ダッシュボードの「アラート」で設定します。同じエントリー判定は30分以内に重ねて鳴らしません。") + "</div>" +
        '<h3>保存とバックアップ</h3><p class="note">設定・日誌・チェック・シグナル履歴は、すべてこの端末のブラウザの中（localStorage）に保存しています。サーバーには保存していないため、端末を替えるときやブラウザのデータを消す前には書き出してください。</p>' +
        '<div class="btns"><button type="button" class="btn pri" id="st-exp">すべて書き出す（JSON）</button><button type="button" class="btn" id="st-imp">読み込む</button></div><div id="st-msg" class="note" aria-live="polite"></div>' +
        '<h3>初期化</h3><p class="note">分けて初期化できます。元に戻せないので、先に書き出しておくと安心です。</p><div class="btns">' +
        '<button type="button" class="btn danger" data-rs="display">表示の設定</button><button type="button" class="btn danger" data-rs="notify">通知・アラート</button><button type="button" class="btn danger" data-rs="trading">資金管理・日誌・履歴</button><button type="button" class="btn danger" data-rs="all">すべて</button></div>';
      $("#st-low").addEventListener("change", function () { D.setPower(this.checked); });
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
  var draft = null;
  var num = function (v) { var x = Number(v); return v === "" || !isFinite(x) ? null : x; };
  var toLocal = function (iso) { var t = new Date(iso), z = function (x) { return String(x).padStart(2, "0"); }; return t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate()) + "T" + z(t.getHours()) + ":" + z(t.getMinutes()); };
  var JCOLS = [{ name: "id", type: "string", required: true }, { name: "time", type: "time", required: true }, { name: "key", type: "string", required: true },
    { name: "side", type: "enum", values: ["buy", "sell"], required: true }, { name: "entry", type: "number" }, { name: "exit", type: "number" }, { name: "lots", type: "number" },
    { name: "pnl", type: "number" }, { name: "ccy", type: "string" }, { name: "rules", type: "enum", values: ["yes", "no"] }, { name: "chart", type: "string" },
    { name: "reason", type: "string" }, { name: "result", type: "string" }, { name: "reflection", type: "string" }, { name: "checkId", type: "string" }];
  // results by instrument, side and Japan hour: counts first, and too few trades are called too few
  function stats(rows) {
    var done = rows.filter(function (r) { return isFinite(r.pnl) && r.pnl !== null; });
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
