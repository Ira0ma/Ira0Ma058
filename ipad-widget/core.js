/* Trade Desk core: the rules behind what the screens show, kept apart from drawing so they can be tested
   (node --test ipad-widget/tests). Market hours, data freshness, position size, risk/reward, signal
   history, CSV, settings backup and payload checks. No network, no DOM. Loaded by the desk as window.TDCore. */
(function (root, factory) {
  var m = factory();
  if (typeof module === "object" && module.exports) module.exports = m; else root.TDCore = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var fin = function (x) { return typeof x === "number" && isFinite(x); };
  var num = function (x) { if (x === "" || x == null) return NaN; var v = typeof x === "number" ? x : Number(String(x).trim()); return isFinite(v) ? v : NaN; };

  /* ---------- time zones ---------- */
  var fmtCache = {};
  function partsIn(zone, t) {
    var f = fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }));
    var p = {}; f.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second,
      dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
  }
  // minutes the zone is ahead of UTC at instant t (summer time included)
  function zoneOffset(zone, t) {
    var p = partsIn(zone, t);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000) / MIN);
  }
  // the instant of a wall-clock time in a zone (y, m 1-12, d, h, mi)
  function zoneTime(zone, y, mo, d, h, mi) {
    var guess = Date.UTC(y, mo - 1, d, h, mi || 0);
    var t = guess - zoneOffset(zone, guess) * MIN;
    return guess - zoneOffset(zone, t) * MIN;  // second pass settles a guess that fell across a clock change
  }
  function isDst(zone, t) {
    var y = partsIn(zone, t).y, jan = zoneOffset(zone, Date.UTC(y, 0, 1)), jul = zoneOffset(zone, Date.UTC(y, 6, 1));
    return jan !== jul && zoneOffset(zone, t) === Math.max(jan, jul);
  }

  /* ---------- market hours ----------
     Weekly hours only. Public holidays and early closes are not modelled, so an "open" answer is never
     certain and the screens say so; a weekend answer is. */
  var KIND = { usdjpy: "fx", eurjpy: "fx", gbpjpy: "fx", audjpy: "fx", eurusd: "fx", gbpusd: "fx", audusd: "fx", nzdusd: "fx",
    usdchf: "fx", usdcad: "fx", jxy: "fx", gold: "cme", silver: "cme", usoil: "cme", dxy: "ice", btc: "crypto", vix: "vix" };
  // the Japan clock time of a New York wall-clock time on the New York date of t (summer time included)
  function nyInJst(t, h, mi) {
    var p = partsIn("America/New_York", t), q = partsIn("Asia/Tokyo", zoneTime("America/New_York", p.y, p.mo, p.d, h, mi || 0));
    return String(q.h).padStart(2, "0") + ":" + String(q.mi).padStart(2, "0");
  }
  /* The one definition of the weekly reopening (月曜の再開) and closing, used by the desk, the tools and the dashboards:
     FX reopens Sunday 17:00 New York, gold / oil (CME) Sunday 18:00 New York, both close Friday 17:00 New York; in Japan
     time that is Monday 7:00 / 8:00 in US winter and 6:00 / 7:00 in US summer (the owner checked: their broker's GOLD
     reopens Monday 8:00 in winter, 7:00 in summer, the same as the exchange). The times are those of the coming weekend,
     so a week that changes summer time shows the time that will actually apply. */
  var REOPEN_NOTE = "取引所の時刻（ブローカーの再開も同じ）";
  function nyWeekday(t, dow, h) {  // the next New York weekday dow (0 = Sunday) at hour h, as an instant, on or after the New York date of t
    var p = partsIn("America/New_York", t), ahead = (dow - p.dow + 7) % 7;
    return zoneTime("America/New_York", p.y, p.mo, p.d + ahead, h, 0);
  }
  function jstHm(x) { var q = partsIn("Asia/Tokyo", x); return String(q.h).padStart(2, "0") + ":" + String(q.mi).padStart(2, "0"); }  // HH:MM（画面全体の書き方）
  function weeklyHours(kind, t) {
    var open = nyWeekday(t, 0, kind === "fx" ? 17 : 18), close = nyWeekday(t, 5, 17);
    return { open: jstHm(open), close: jstHm(close), openAt: open, dst: isDst("America/New_York", open) };
  }
  // the weekly hours in Japan time (the coming weekend's; they move by an hour with US summer time)
  function hoursNote(kind, t) {
    var us = isDst("America/New_York", t) ? "米国の夏時間中" : "米国の冬時間中";
    if (kind === "crypto") return "暗号資産：24時間・年中無休（取引所の臨時メンテナンスは判定できません）";
    if (kind === "vix") return "VIX：日本時間 平日の" + nyInJst(t, 3, 15) + "から、日をまたいで" + nyInJst(t, 16, 15) + "までを目安（" + us + "。祝日は含めていません）";
    var w = weeklyHours(kind, t), close = w.close, open = w.open;
    us = (w.dst ? "米国の夏時間" : "米国の冬時間") + "・" + REOPEN_NOTE;
    if (kind === "fx") return "外国為替：日本時間 月曜" + open + "〜土曜" + close + "（" + us + "。週末のみ判定し、祝日・年末年始は含めていません）";
    if (kind === "cme") return "先物（CME）：日本時間 月曜" + open + "〜土曜" + close + "、毎朝" + nyInJst(t, 17, 0) + "〜" + nyInJst(t, 18, 0) + "は休止（" + us + "。祝日の短縮取引は含めていません）";
    return "ドル指数（ICE）：日本時間 月曜" + open + "〜土曜" + close + "を目安（" + us + "。祝日は含めていません）";
  }
  function marketState(key, t) {
    var kind = KIND[key] || "fx", p = partsIn("America/New_York", t), h = p.h + p.mi / 60, d = p.dow;
    var res = function (state, reason, certain) {  // the note is worked out only when read (the cards ask for the state every second)
      var o = { state: state, reason: reason, certain: certain, kind: kind };
      Object.defineProperty(o, "note", { enumerable: true, get: function () { return hoursNote(kind, t); } });
      return o;
    };
    if (kind === "crypto") return res("open", "24時間取引", false);
    if (kind === "vix") {
      if (d === 0 || d === 6) return res("closed", "週末", true);
      return h >= 3.25 && h < 16.25 ? res("open", "取引時間内（目安）", false) : res("closed", "取引時間外（目安）", false);
    }
    var openH = kind === "fx" ? 17 : 18;
    if (d === 6 || (d === 5 && h >= 17) || (d === 0 && h < openH)) return res("closed", "週末", true);
    if (kind !== "fx" && h >= 17 && h < 18) return res("break", "毎日の休止時間（日本時間 " + nyInJst(t, 17, 0) + "〜" + nyInJst(t, 18, 0) + "）", true);
    return res("open", "取引時間内（祝日は未判定）", false);
  }

  // when a closed market opens again, as "月 7:00" in Japan time (weekly hours; holidays unknown), or "" if it is open
  var openMemo = {};
  function nextOpen(key, t) {
    if (marketState(key, t).state === "open") return "";
    var mk = (KIND[key] || "fx") + Math.floor(t / (5 * MIN));  // the same answer for five minutes (the cards ask every few seconds)
    if (openMemo[mk] != null) return openMemo[mk];
    if (Object.keys(openMemo).length > 50) openMemo = {};
    return (openMemo[mk] = findOpen(key, t));
  }
  function findOpen(key, t) {
    var s = Math.ceil(t / (5 * MIN)) * 5 * MIN;
    for (var i = 0; i < 3 * 24 * 12; i++, s += 5 * MIN) {  // 5-minute steps, up to three days ahead
      if (marketState(key, s).state === "open") {
        var p = partsIn("Asia/Tokyo", s);
        return ["日", "月", "火", "水", "木", "金", "土"][p.dow] + " " + jstHm(s);
      }
    }
    return "";
  }

  /* Tokyo, London and New York sessions (local business hours, summer time from each city's own clock). */
  var SESSIONS = [
    { id: "tokyo", name: "東京", zone: "Asia/Tokyo", open: 9, close: 18 },
    { id: "london", name: "ロンドン", zone: "Europe/London", open: 8, close: 17 },
    { id: "newyork", name: "ニューヨーク", zone: "America/New_York", open: 8, close: 17 }
  ];
  function sessions(t) {
    var weekend = marketState("usdjpy", t).state === "closed";
    var list = SESSIONS.map(function (s) {
      var p = partsIn(s.zone, t), start = zoneTime(s.zone, p.y, p.mo, p.d, s.open, 0), end = zoneTime(s.zone, p.y, p.mo, p.d, s.close, 0);
      var weekday = p.dow >= 1 && p.dow <= 5;
      return { id: s.id, name: s.name, zone: s.zone, start: start, end: end, dst: isDst(s.zone, t),
        open: !weekend && weekday && t >= start && t < end };
    });
    var open = list.filter(function (s) { return s.open; });
    return { list: list, overlap: open.length > 1 ? open.map(function (s) { return s.name; }) : [], weekend: weekend,
      note: "各市場の営業時間の目安（現地の朝から夕方まで）を日本時間に直した区分です。祝日は含めていません。" };
  }

  /* ---------- freshness ----------
     Each kind of data has its own yardstick (ms). Past the last one the data is "stale". A closed market
     makes an old price "closed" (the last price of the session), never "stale". */
  var RULES = {
    price: { live: 20 * 1000, fresh: 2 * MIN, delayed: 15 * MIN },
    analysis: { fresh: 15 * MIN, delayed: 60 * MIN },
    calendar: { fresh: 30 * MIN, delayed: 3 * HOUR },
    weather: { fresh: 90 * MIN, delayed: 3 * HOUR },
    report: { fresh: 18 * HOUR, delayed: 36 * HOUR }
  };
  // 状態の言葉は画面のどこでもこの1組（札・説明文・データ状態の画面・使い方の札の表で同じ）
  var LEVEL_JA = { live: "ライブ", fresh: "最新", delayed: "遅延", stale: "停止", closed: "休場中", unknown: "時刻不明", missing: "未取得" };
  function freshness(kind, at, now, opts) {
    opts = opts || {};
    if (!fin(at) || at <= 0) return { level: "missing", label: LEVEL_JA.missing, age: NaN };
    var age = now - at;
    if (age < -2 * MIN) return { level: "unknown", label: "時刻が未来（端末の時計を確認）", age: age };
    age = Math.max(0, age);
    var r = RULES[kind], lv;
    if (kind === "candle") {
      var tf = opts.tfMs || HOUR, lag = Math.max(20 * MIN, tf);  // the site collects every 5 min and Yahoo lags ~10 min
      lv = age <= tf + lag ? "fresh" : age <= tf + 3 * lag ? "delayed" : "stale";
    } else if (!r) lv = "unknown";
    else lv = r.live != null && age <= r.live ? "live" : age <= r.fresh ? "fresh" : age <= r.delayed ? "delayed" : "stale";
    if (opts.closed && (lv === "delayed" || lv === "stale")) lv = "closed";
    return { level: lv, label: LEVEL_JA[lv], age: age };
  }
  function ago(ms) {
    if (!fin(ms)) return "不明";
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (s < 60) return s + "秒前";
    if (m < 60) return m + "分前";
    if (h < 24) return h + "時間" + (m % 60 ? (m % 60) + "分" : "") + "前";
    return d + "日" + (h % 24 ? (h % 24) + "時間" : "") + "前";
  }
  // "10/30 18:04 JST": the desk shows every time in Japan time and says so
  function jst(t, withDate) {
    if (!fin(t) || t <= 0) return "—";
    var p = partsIn("Asia/Tokyo", t), z = function (x) { return String(x).padStart(2, "0"); };
    return (withDate === false ? "" : p.mo + "/" + p.d + " ") + z(p.h) + ":" + z(p.mi) + " JST";  // M/D HH:MM JST（画面全体で同じ書き方）
  }

  /* ---------- payload checks ---------- */
  function badRow(r, prevT) {
    if (!Array.isArray(r) || r.length < 5) return "形式";
    for (var i = 0; i < 5; i++) if (!fin(r[i])) return "数値でない";
    if (r[0] <= prevT) return "時刻の順序";
    if (r[1] <= 0 || r[2] <= 0 || r[3] <= 0 || r[4] <= 0) return "0以下";
    if (r[2] + 1e-9 < Math.max(r[1], r[4]) || r[3] - 1e-9 > Math.min(r[1], r[4])) return "高値・安値の矛盾";
    return "";
  }
  /* market.json from the site: per instrument, a list of problems (empty = usable). Times are seconds. */
  function checkMarket(d, nowMs) {
    var out = { ok: {}, problems: {}, global: [] };
    if (!d || typeof d !== "object") { out.global.push("データの形式が違います"); return out; }
    var inst = d.instruments;
    if (!inst || typeof inst !== "object") { out.global.push("銘柄の一覧がありません"); return out; }
    var now = nowMs / 1000;
    Object.keys(inst).forEach(function (k) {
      var m = inst[k], pr = [];
      if (!m || typeof m !== "object") pr.push("形式");
      else {
        if (!fin(m.price) || m.price <= 0) pr.push("価格が不正");
        if (!fin(m.asOf)) pr.push("時刻がない");
        else if (m.asOf > now + 600) pr.push("時刻が未来");
        else if (m.asOf < now - 30 * 86400) pr.push("30日以上前の価格");
        var c = m.candles;
        if (!c || typeof c !== "object") pr.push("ローソク足がない");
        else Object.keys(c).forEach(function (tf) {
          var rows = c[tf], prev = -Infinity, bad = "";
          if (!Array.isArray(rows)) { pr.push(tf + "：形式"); return; }
          for (var i = 0; i < rows.length && !bad; i++) { bad = badRow(rows[i], prev); prev = rows[i] && rows[i][0]; }
          if (bad) pr.push(tf + "：" + bad);
        });
        // the latest price far from the latest candle: hold it until the next update confirms it
        var one = c && (c["1m"] || c["5m"] || c["15m"] || c["1h"]), last = one && one[one.length - 1];
        if (fin(m.price) && m.price > 0 && last && fin(last[4]) && Math.abs(m.price - last[4]) / last[4] > 0.05) pr.push("価格と足が5%以上離れている");
      }
      out.problems[k] = pr; out.ok[k] = !pr.length;
    });
    return out;
  }
  // candles for one timeframe, or null when there is no real history (never made up)
  function realCandles(series, tf, minBars) {
    var rows = series && series[tf];
    if (!Array.isArray(rows) || rows.length < (minBars || 3)) return null;
    return rows;
  }
  // "is this the newest request?": a later answer to an older request is dropped
  function sequencer() {
    var n = 0;
    return { next: function () { return ++n; }, latest: function (id) { return id === n; } };
  }

  /* ---------- money ---------- */
  var round = function (x, step) { var dp = Math.max(0, Math.min(8, (String(step).split(".")[1] || "").length)); return +x.toFixed(dp); };
  /* Position size from the loss you accept at the stop.
     contract: units per lot. conv: account currency per 1 unit of the quote currency (1 when they are the same;
     for XAU/USD on a yen account, the USD/JPY rate). cost (price units) and commission (account ccy per lot)
     are added to the loss per lot when given. Nothing is guessed: a missing input is reported, not filled. */
  function positionSize(p) {
    var v = {}, need = [], errors = [];
    ["balance", "riskPct", "riskAmount", "entry", "stop", "contract", "conv", "step", "min", "max", "cost", "commission", "leverage"].forEach(function (k) { v[k] = num(p[k]); });
    ["entry", "stop", "contract", "conv", "step", "min"].forEach(function (k) { if (!fin(v[k])) need.push(k); });
    var risk = fin(v.riskAmount) ? v.riskAmount : fin(v.balance) && fin(v.riskPct) ? v.balance * v.riskPct / 100 : NaN;
    if (!fin(risk)) need.push(fin(v.balance) ? "riskPct" : "riskAmount");
    if (need.length) return { ok: false, need: need, errors: ["未入力の項目があります"] };
    ["entry", "stop", "contract", "conv", "step", "min"].forEach(function (k) { if (v[k] <= 0) errors.push(k + "は0より大きく"); });
    if (risk <= 0) errors.push("許容損失は0より大きく");
    if (fin(v.riskPct) && (v.riskPct <= 0 || v.riskPct > 100)) errors.push("リスク％は0〜100");
    if (v.entry === v.stop) errors.push("エントリーと損切りが同じ価格");
    if ((fin(v.cost) && v.cost < 0) || (fin(v.commission) && v.commission < 0)) errors.push("コストは0以上");
    if (fin(v.max) && v.max < v.min) errors.push("最大数量が最小数量より小さい");
    if (errors.length) return { ok: false, need: [], errors: errors };
    var dist = Math.abs(v.entry - v.stop), perLot = (dist + (fin(v.cost) ? v.cost : 0)) * v.contract * v.conv + (fin(v.commission) ? v.commission : 0);
    var raw = risk / perLot;
    if (!fin(raw) || raw > 1e7) return { ok: false, need: [], errors: ["数量が極端になります。単位や桁を確認してください"] };
    var lots = round(Math.floor(raw / v.step + 1e-9) * v.step, v.step), notes = [];
    if (Math.abs(v.min / v.step - Math.round(v.min / v.step)) > 1e-9) notes.push("最小数量が刻みの整数倍ではありません。業者の発注規則を確認してください");
    if (fin(v.max) && lots > v.max) { lots = v.max; notes.push("最大数量で頭打ちにしました"); }
    if (lots + 1e-12 < v.min) return { ok: true, skip: true, raw: raw, risk: risk, perLot: perLot, notes: notes,
      message: "計算上 " + raw.toFixed(4) + " lot で最小数量 " + v.min + " lot に届きません。損失枠を広げず、見送るのが計画どおりです。" };
    var units = lots * v.contract, notional = units * v.entry * v.conv;
    return { ok: true, skip: false, lots: lots, raw: raw, units: units, risk: risk, perLot: perLot, actualRisk: lots * perLot,
      riskPctActual: fin(v.balance) && v.balance > 0 ? lots * perLot / v.balance * 100 : NaN, notional: notional,
      margin: fin(v.leverage) && v.leverage > 0 ? notional / v.leverage : NaN, notes: notes };
  }
  /* Risk/reward. side 1 = buy, -1 = sell. cost is the round-trip cost in price units (spread etc.). */
  function riskReward(p) {
    var side = +p.side, e = num(p.entry), s = num(p.stop), t = num(p.target), cost = fin(num(p.cost)) ? num(p.cost) : 0;
    if (side !== 1 && side !== -1) return { ok: false, errors: ["売買の向きを選んでください"] };
    if (![e, s, t].every(fin)) return { ok: false, errors: ["エントリー・損切り・利確を入れてください"] };
    if (e <= 0 || s <= 0 || t <= 0) return { ok: false, errors: ["価格は0より大きく"] };
    if (cost < 0) return { ok: false, errors: ["コストは0以上"] };
    if ((s - e) * side >= 0) return { ok: false, errors: [side > 0 ? "買いの損切りはエントリーより下に" : "売りの損切りはエントリーより上に"] };
    if ((t - e) * side <= 0) return { ok: false, errors: [side > 0 ? "買いの利確はエントリーより上に" : "売りの利確はエントリーより下に"] };
    var risk = Math.abs(e - s), reward = Math.abs(t - e), out = { ok: true, risk: risk, reward: reward, rr: reward / risk,
      riskNet: risk + cost, rewardNet: reward - cost, rrNet: (reward - cost) / (risk + cost), costIncluded: cost > 0,
      breakEvenWin: (risk + cost) / (risk + reward) * 100 };
    var u = num(p.units), conv = fin(num(p.conv)) ? num(p.conv) : 1;
    if (fin(u) && u > 0) { out.loss = -(risk + cost) * u * conv; out.gain = (reward - cost) * u * conv; out.lossGross = -risk * u * conv; out.gainGross = reward * u * conv; }
    return out;
  }
  // today's realised result from journal trades (account currency), against the daily limit
  function dailyLoss(trades, dayKey, limit) {
    var pnl = 0, n = 0;
    (trades || []).forEach(function (t) { if (t && t.day === dayKey && fin(+t.pnl)) { pnl += +t.pnl; n++; } });
    var lim = num(limit), loss = Math.max(0, -pnl);
    return { pnl: pnl, trades: n, loss: loss, limit: lim, set: fin(lim) && lim > 0,
      remaining: fin(lim) && lim > 0 ? Math.max(0, lim - loss) : NaN, exceeded: fin(lim) && lim > 0 && loss >= lim,
      near: fin(lim) && lim > 0 && loss >= lim * 0.8 && loss < lim };
  }
  /* Journal days, counted by calendar day (Japan date). A day with at least one record is a recorded day;
     a 見送り (kind "skip") record counts too. days: { "YYYY-MM-DD": "trade" | "skip" } ("trade" if any trade that day).
     streak: consecutive recorded days up to today, or up to yesterday while today has none yet (today is not over).
     week: recorded days in this week, Monday to Sunday (Japan). */
  function journalDays(rows, now) {
    var days = {};
    (rows || []).forEach(function (r) {
      if (!r) return; var k = r.day || (fin(Date.parse(r.time)) ? dayKey(Date.parse(r.time)) : "");
      if (!k) return; if (r.kind === "skip") { if (!days[k]) days[k] = "skip"; } else days[k] = "trade";
    });
    var key = function (t) { return dayKey(t); }, today = key(now), streak = 0, t = now;
    if (!days[today]) t -= DAY;
    while (days[key(t)]) { streak++; t -= DAY; }
    var p = partsIn("Asia/Tokyo", now), dow = (p.dow + 6) % 7, week = 0;  // Monday = 0
    for (var i = 0; i <= dow; i++) if (days[key(now - i * DAY)]) week++;
    return { days: days, streak: streak, week: week, today: !!days[today] };
  }
  /* 収支（A）：1日ごとの確定損益と入出金。daily は日次入力 { "YYYY-MM-DD": { pnl, dep, wd } }（円。空欄は null）。
     その日の損益：日次入力に損益があればそれを正とし、取引ごとの記録とは足さない。なければ取引ごとの記録（見送りは除く）の合計。
     入金・出金は日次入力からだけ数える。返すのは { "YYYY-MM-DD": { pnl, src: "daily"|"trades"|null, dep, wd, trades, skip } } */
  function dailyBook(rows, daily) {
    var out = {}, day = function (k) { return out[k] || (out[k] = { pnl: null, src: null, dep: null, wd: null, trades: 0, sum: 0, skip: false }); };
    (rows || []).forEach(function (r) {
      if (!r) return; var k = r.day || (fin(Date.parse(r.time)) ? dayKey(Date.parse(r.time)) : ""); if (!k) return;
      var d = day(k);
      if (r.kind === "skip") { d.skip = true; return; }
      if (fin(+r.pnl) && r.pnl !== null && r.pnl !== "") { d.sum += +r.pnl; d.trades++; }
    });
    Object.keys(daily || {}).forEach(function (k) {
      var v = daily[k]; if (!v || !/^\d{4}-\d\d-\d\d$/.test(k)) return;
      var d = day(k), n = function (x) { return x === null || x === "" || x === undefined || !fin(+x) ? null : +x; };
      d.dep = n(v.dep); d.wd = n(v.wd);
      if (n(v.pnl) !== null) { d.pnl = n(v.pnl); d.src = "daily"; }
    });
    Object.keys(out).forEach(function (k) { var d = out[k]; if (d.src === null && d.trades) { d.pnl = d.sum; d.src = "trades"; } delete d.sum; });
    return out;
  }
  // 期間のまとめ：from〜to（"YYYY-MM-DD"、両端を含む）の日を集計
  function periodSummary(book, from, to) {
    var s = { pnl: 0, win: 0, loss: 0, flat: 0, days: 0, best: null, worst: null, dep: 0, wd: 0, any: false };
    Object.keys(book || {}).forEach(function (k) {
      if (k < from || k > to) return; var d = book[k];
      if (d.dep !== null) { s.dep += d.dep; s.any = true; } if (d.wd !== null) { s.wd += d.wd; s.any = true; }
      if (d.pnl === null) return;
      s.any = true; s.days++; s.pnl += d.pnl;
      if (d.pnl > 0) s.win++; else if (d.pnl < 0) s.loss++; else s.flat++;
      if (!s.best || d.pnl > s.best.pnl) s.best = { day: k, pnl: d.pnl };
      if (!s.worst || d.pnl < s.worst.pnl) s.worst = { day: k, pnl: d.pnl };
    });
    return s;
  }
  // 週は月曜はじまり（日本の日付）。key の週の月曜と日曜
  function weekOf(key) {
    var p = key.split("-").map(Number), t = Date.UTC(p[0], p[1] - 1, p[2]), dow = (new Date(t).getUTCDay() + 6) % 7;
    var f = function (x) { var d = new Date(x); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); };
    return { from: f(t - dow * DAY), to: f(t + (6 - dow) * DAY) };
  }
  /* ゴトー日（B）：5・10・15・20・25・30日と月末。その日が土日か日本の祝日なら、直前の営業日が「実質ゴトー日（振替）」。
     isHol(key) は日本の祝日か（デスクは holidays.json＝サイトが holidays-jp から取得、読めないときは組み込みの一覧）。
     返すのは null か { kind: "real"|"moved", moved: [本来の日付, ...] }（本来のゴトー日でもあり振替も重なる日は "real"） */
  function gotobi(key, isHol) {
    var p = String(key).split("-").map(Number); if (p.length !== 3 || !fin(p[0])) return null;
    var f = function (t) { var d = new Date(t); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); };
    var biz = function (t) { var w = new Date(t).getUTCDay(); return w !== 0 && w !== 6 && !(isHol && isHol(f(t))); };
    var real = false, moved = [];
    [0, 1].forEach(function (dm) {  // その月と、翌月の初め（翌月5日が前の月へずれることがある）
      var y = p[0], m = p[1] - 1 + dm; if (m > 11) { m -= 12; y++; }
      var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), days = [5, 10, 15, 20, 25, 30, last].filter(function (d, i, a) { return d <= last && a.indexOf(d) === i; });
      days.forEach(function (d) {
        var t = Date.UTC(y, m, d), r = t, n = 0; while (!biz(r) && n++ < 15) r -= DAY;
        if (f(r) !== key) return;
        if (r === t) real = true; else moved.push(f(t));
      });
    });
    return real || moved.length ? { kind: real ? "real" : "moved", moved: moved } : null;
  }
  /* 重要指標（追加D）：サプライズの向き・影響銘柄・過去の反応。向きを決められない指標・単位がそろわない数字には何も付けない */
  // 「予想より小さい＝強い」（失業率・失業保険など）を先に見る。次が「予想より大きい＝強い」（雇用・景気・インフレ・金利）
  var IND_LOW = /Unemployment Rate|Unemployment Claims|Jobless Claims|Claimant Count/i;
  var IND_HIGH = /Non-Farm Employment Change|ADP|Employment Change|Average Hourly Earnings|Average Cash Earnings|Wage|Employment Cost Index|JOLTS|\bCPI\b|\bPPI\b|\bPCE\b|Price Index|GDP|Retail Sales|\bPMI\b|Durable Goods|Factory Orders|Industrial Production|Personal Spending|Personal Income|Household Spending|Consumer Confidence|Consumer Sentiment|Inflation Expectations|Building Permits|Housing Starts|Home Sales|Philly Fed|Empire State|Tankan|Federal Funds Rate|Policy Rate/i;
  var IND_NONE = /Crude Oil|Natural Gas|Trade Balance|Speaks|Testifies|Minutes|Statement|Press Conference|Outlook|Treasury|Auction|Budget|Bank Holiday/i;
  var CCY_JA = { USD: "ドル", JPY: "円" };
  function indDirection(title) { if (IND_NONE.test(title)) return 0; return IND_LOW.test(title) ? -1 : IND_HIGH.test(title) ? 1 : 0; }
  function indUnit(v) { var s = String(v == null ? "" : v).trim(); var m = s.replace(/,/g, "").match(/^[<>~≈+]?(-|−)?\d+(\.\d+)?(.*)$/); return m ? m[3].trim() : null; }
  function indNum(v) { var m = String(v == null ? "" : v).replace(/,/g, "").replace("−", "-").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }
  // 結果と予想の比較（前回があれば前回も同じ単位であること）。返すのは null か { kind: "strong"|"weak"|"same", text }
  function surpriseOf(e) {
    if (!e || !e.actual || !e.forecast) return null;
    var dir = indDirection(e.title || ""), ccy = CCY_JA[e.country]; if (!dir || !ccy) return null;
    var ua = indUnit(e.actual), uf = indUnit(e.forecast), up = e.previous ? indUnit(e.previous) : ua;
    if (ua === null || uf === null || up === null || ua !== uf || ua !== up) return null;
    var a = indNum(e.actual), f = indNum(e.forecast); if (a === null || f === null) return null;
    if (a === f) return { kind: "same", text: "予想どおり" };
    var strong = (a > f) === (dir > 0);
    return { kind: strong ? "strong" : "weak", text: strong ? "予想より強い → " + ccy + "買い材料" : "予想より弱い → " + ccy + "売り材料" };
  }
  // 影響銘柄（サイトの reactions.py と同じ表）
  function indAffects(country, title) {
    if (/Crude Oil Inventories/i.test(title || "")) return ["usoil"];
    return country === "USD" ? ["usdjpy", "gold"] : country === "JPY" ? ["usdjpy"] : [];
  }
  // 反応を記録する銘柄（reactions.py の measured() と同じ表）：影響の銘柄に、米国の指標ではオイル（原油先物 CL=F）を足す
  function rxInsts(country, title) {
    var a = indAffects(country, title);
    return country === "USD" && a.indexOf("usoil") < 0 ? a.concat(["usoil"]) : a;
  }
  // 過去の反応：同じ国・同じ指標の、before より前の記録。last（前回）と、2回以上あれば最大6回の平均
  function reactionStats(rx, country, title, before) {
    var ev = rx && rx.events; if (!ev) return null;
    var list = Object.keys(ev).map(function (k) { return ev[k]; }).filter(function (r) { return r.country === country && r.title === title && r.t * 1000 < before; }).sort(function (a, b) { return b.t - a.t; });
    if (!list.length) return null;
    var six = list.slice(0, 6), avg = {};
    Object.keys(list[0].move).forEach(function (k) { var v = six.filter(function (r) { return r.move[k]; }).map(function (r) { return r.move[k].size; }); if (v.length >= 2) avg[k] = { v: v.reduce(function (s, x) { return s + x; }, 0) / v.length, n: v.length }; });
    return { last: list[0], avg: avg, n: list.length };
  }
  function moveText(k, v) { return k === "usdjpy" ? Math.round(v) + "pips" : "$" + (v >= 10 ? Math.round(v) : v.toFixed(2)); }
  var INST_JA = { usdjpy: "ドル円", gold: "ゴールド", usoil: "オイル" };
  // 反応の数字につける名前：オイルの反応は原油先物（CL=F）のローソク足で測っているので、そう書く（OILCash の値動きではない）
  var RX_JA = { usdjpy: "ドル円", gold: "ゴールド", usoil: "原油先物(CL=F)" };
  // the trading day key (Japan date) a time belongs to
  function dayKey(t) { var p = partsIn("Asia/Tokyo", t); return p.y + "-" + String(p.mo).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }

  /* ---------- signals ----------
     A dashboard reports its call every few seconds. The history records only changes: created, changed
     (conditions differ), renewed (still valid on the next candle), cancelled, expired. Each event keeps the
     facts of that moment; nothing is rewritten later. Only "created" may sound, and not again for the same
     instrument and direction within the cooldown. */
  var COOLDOWN = 30 * MIN, KEEP = 300;
  function newStore() { return { v: 1, active: {}, current: {}, history: [] }; }
  function snap(i, at) {
    return { at: at, dir: i.dir, entry: !!i.entry, provisional: i.provisional !== false, tf: i.tf || "", met: (i.met || []).slice(), unmet: (i.unmet || []).slice(),
      reason: i.reason || "", score: fin(i.score) ? i.score : null, price: fin(i.price) ? i.price : null, data: i.data ? JSON.parse(JSON.stringify(i.data)) : null };
  }
  function sameConds(a, b) { return a.met.join("|") === b.met.join("|") && a.unmet.join("|") === b.unmet.join("|"); }
  function pushEvent(store, rec, type, s, extra) {
    var ev = { type: type, at: s.at, snap: s };
    if (extra) Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
    rec.events.push(ev); rec.status = type === "cancelled" || type === "expired" ? type : "active"; rec.updated = s.at;
  }
  function closeRec(store, key, type, s, reason) {
    var rec = store.active[key]; if (!rec) return null;
    pushEvent(store, rec, type, s, { reason: reason });
    delete store.active[key];
    return rec;
  }
  /* input: {key, dir:'buy'|'sell'|'wait', entry, tf, provisional, expiresAt, met, unmet, reason, cancelIf, stale, data} */
  function updateSignal(store, i, now) {
    var out = { events: [], notify: false };
    if (!i || !i.key) return out;
    var s = snap(i, now), rec = store.active[i.key];
    store.current[i.key] = s;
    var add = function (r) { store.history.unshift(r); if (store.history.length > KEEP) store.history.length = KEEP; };
    if (rec && (i.stale || now > rec.expiresAt + MIN && !(i.entry && i.dir === rec.dir))) {
      closeRec(store, i.key, "expired", s, i.stale ? "使用データが古くなった" : "有効期限（判定した足の終わり）を過ぎた"); out.events.push("expired"); rec = null;
    }
    if (i.entry && (i.dir === "buy" || i.dir === "sell") && !i.stale) {
      if (rec && rec.dir !== i.dir) { closeRec(store, i.key, "cancelled", s, "反対方向の判定に変わった"); out.events.push("cancelled"); rec = null; }
      if (!rec) {
        var last = null;
        for (var h = 0; h < store.history.length; h++) if (store.history[h].key === i.key && store.history[h].dir === i.dir) { last = store.history[h]; break; }
        var dup = !!(last && now - (last.updated || last.created) < COOLDOWN);  // counted from when the previous one ended
        rec = { id: i.key + "-" + now, key: i.key, dir: i.dir, tf: i.tf || "", created: now, expiresAt: fin(i.expiresAt) ? i.expiresAt : now + HOUR,
          cancelIf: i.cancelIf || "", status: "active", repeat: dup, events: [] };
        pushEvent(store, rec, "created", s); store.active[i.key] = rec; add(rec);
        out.events.push("created"); out.notify = !dup; out.record = rec;
      } else if (now > rec.expiresAt) {
        rec.expiresAt = fin(i.expiresAt) && i.expiresAt > now ? i.expiresAt : now + HOUR;
        pushEvent(store, rec, "renewed", s); out.events.push("renewed");
      } else if (!sameConds(rec.events[rec.events.length - 1].snap, s)) { pushEvent(store, rec, "changed", s); out.events.push("changed"); }
    } else if (rec) {
      closeRec(store, i.key, "cancelled", s, i.reason || (s.unmet.length ? "条件が崩れた：" + s.unmet.join("・") : "エントリー条件から外れた"));
      out.events.push("cancelled");
    }
    return out;
  }
  function expireSignals(store, now) {
    var n = 0;
    Object.keys(store.active).forEach(function (k) {
      var rec = store.active[k];
      if (now > rec.expiresAt + MIN) { closeRec(store, k, "expired", snap({ dir: rec.dir, met: [], unmet: [] }, now), "判定が届かないまま有効期限を過ぎた"); n++; }
    });
    return n;
  }
  function loadStore(text) {
    var d; try { d = JSON.parse(text); } catch (e) { return newStore(); }
    if (!d || d.v !== 1 || !Array.isArray(d.history) || typeof d.active !== "object") return newStore();
    d.current = d.current || {};
    return d;
  }

  /* ---------- CSV ---------- */
  function cell(v) {
    if (v == null) return "";
    var s = String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;  // spreadsheet formula guard
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, cols) {
    return "﻿" + [cols.map(function (c) { return cell(c.name); }).join(",")].concat(rows.map(function (r) {
      return cols.map(function (c) { return cell(r[c.name]); }).join(",");
    })).join("\r\n") + "\r\n";
  }
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    var rows = [], row = [], f = "", q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (q) return { rows: [], error: "引用符が閉じていません" };
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return { rows: rows.filter(function (r) { return r.length > 1 || r[0] !== ""; }) };
  }
  /* rows of a CSV back into records. cols: [{name, type:'string'|'number'|'time'|'enum', required, values}]
     Records whose id is already present are skipped (re-importing the same file adds nothing). */
  function importCSV(text, cols, existingIds) {
    var p = parseCSV(text), errors = [], out = [], seen = {}, skipped = 0;
    (existingIds || []).forEach(function (id) { seen[id] = 1; });
    if (p.error) return { records: [], errors: [p.error], skipped: 0 };
    if (!p.rows.length) return { records: [], errors: ["空のファイルです"], skipped: 0 };
    var head = p.rows[0].map(function (h) { return h.trim(); }), idx = {};
    cols.forEach(function (c) { idx[c.name] = head.indexOf(c.name); });
    var missing = cols.filter(function (c) { return c.required && idx[c.name] < 0; }).map(function (c) { return c.name; });
    if (missing.length) return { records: [], errors: ["見出しが足りません：" + missing.join("・")], skipped: 0 };
    p.rows.slice(1).forEach(function (r, n) {
      var rec = {}, bad = [];
      cols.forEach(function (c) {
        var raw = idx[c.name] >= 0 ? (r[idx[c.name]] || "").trim() : "";
        if (raw.charAt(0) === "'" && /^'[=+\-@]/.test(raw)) raw = raw.slice(1);
        if (raw === "") { if (c.required) bad.push(c.name + "が空"); return; }
        if (c.type === "number") { var x = num(raw); if (!fin(x)) bad.push(c.name + "が数値でない"); else rec[c.name] = x; }
        else if (c.type === "time") { var t = Date.parse(raw); if (!fin(t)) bad.push(c.name + "が日時でない"); else rec[c.name] = new Date(t).toISOString(); }
        else if (c.type === "enum") { if (c.values.indexOf(raw) < 0) bad.push(c.name + "の値が想定外"); else rec[c.name] = raw; }
        else rec[c.name] = raw.slice(0, 4000);
      });
      if (bad.length) { errors.push((n + 2) + "行目：" + bad.join("、")); return; }
      if (rec.id && seen[rec.id]) { skipped++; return; }
      if (rec.id) seen[rec.id] = 1;
      out.push(rec);
    });
    return { records: out, errors: errors, skipped: skipped };
  }

  /* ---------- settings backup ----------
     Everything this app keeps on the device, by group. Caches are left out (they refill themselves). */
  var GROUPS = {
    display: [/^desk-layout$/, /^mkt-v1$/, /^wx-loc-v1$/, /^gloss-book$/, /^learn-[a-z]+-page$/, /^desk_eq_closed$/, /^td-display-v1$/, /^td-power$/,
      /^(gold|usdjpy|btc)_(tf|levels|trend|fvg|ma|hidden_lv|ev_filter|dir|tv_layout|tv_sc_name|chart_src)$/, /^tv_via_shortcut$/],
    notify: [/^desk_sound$/, /^desk_notify$/, /^(gold|usdjpy|btc)_alerts$/, /^td-notify-v1$/],
    trading: [/^(gold|usdjpy|btc)_(capital|risk_pct|lot_manual|sl_mult|rr|auto_risk|broker|contract|tp_basis|tp_basis_v|checks|xm_.*|xs_.*)$/, /^pt-v1$/,
      /^td-journal-v1$/, /^td-daily-v1$/, /^td-signals-v1$/, /^td-checks-v1$/, /^td-risk-v1$/,
      /^td_kakeibo_v1$/, /^td_kakeibo_loans_v1$/, /^td_kakeibo_assets_v1$/, /^td_kakeibo_hcguide_v1$/]
  };
  var CACHE = [/_auto_cache_final$/, /^quote-/];
  function groupOf(k) {
    if (CACHE.some(function (r) { return r.test(k); })) return "cache";
    for (var g in GROUPS) if (GROUPS[g].some(function (r) { return r.test(k); })) return g;
    return "";
  }
  function exportSettings(storage, now, groups) {
    var data = {};
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i), g = groupOf(k);
      if (g && g !== "cache" && (!groups || groups.indexOf(g) >= 0)) data[k] = storage.getItem(k);
    }
    return { app: "trade-desk", format: 1, exportedAt: new Date(now).toISOString(), groups: groups || Object.keys(GROUPS), data: data };
  }
  function importSettings(obj, storage) {
    var res = { written: 0, ignored: [], errors: [] };
    if (!obj || obj.app !== "trade-desk") { res.errors.push("このアプリの設定ファイルではありません"); return res; }
    if (obj.format !== 1) { res.errors.push("対応していない形式です（format " + obj.format + "）"); return res; }
    if (!obj.data || typeof obj.data !== "object") { res.errors.push("中身がありません"); return res; }
    Object.keys(obj.data).forEach(function (k) {
      var v = obj.data[k], g = groupOf(k);
      if (!g || g === "cache" || typeof v !== "string" || v.length > 2e6) { res.ignored.push(k); return; }
      try { storage.setItem(k, v); res.written++; } catch (e) { res.errors.push(k + "：保存できません（容量不足の可能性）"); }
    });
    return res;
  }
  function resetGroup(storage, group) {
    var del = [];
    for (var i = 0; i < storage.length; i++) { var k = storage.key(i), g = groupOf(k); if (g && (group === "all" || g === group)) del.push(k); }
    del.forEach(function (k) { try { storage.removeItem(k); } catch (e) {} });
    return del.length;
  }
  // write, and report when the device refused (private mode, full storage)
  function safeSet(storage, k, v) {
    try { storage.setItem(k, v); return storage.getItem(k) === v; } catch (e) { return false; }
  }

  /* ---------- 急変検知（タスク6）：しきい値はここだけ。変えるときはこの表を直す ----------
     each rule is [minutes, size]: yen for USD/JPY, percent for the others. A rule is met when the newest sample
     differs from any sample within its minutes by at least the size. */
  var SURGE = {
    usdjpy: { unit: "yen", caution: [[5, 0.50]], emergency: [[5, 1.00], [15, 1.50]] },
    gold: { unit: "pct", caution: [[15, 0.7]], emergency: [[15, 1.2]] },
    btc: { unit: "pct", caution: [[15, 1.0]], emergency: [[15, 2.0]] },
    usoil: { unit: "pct", caution: [[15, 1.0]], emergency: [[15, 2.0]] },
    silver: { unit: "pct", caution: [[15, 1.0]], emergency: [[15, 2.0]] }
  };
  var SURGE_GAP = 90 * 1000, SURGE_KEEP = 15 * MIN, SURGE_COOL = 30 * MIN, SURGE_SHOW = 30 * MIN;
  var SURGE_RANK = { caution: 1, emergency: 2 };
  // keep the samples of the last 15 minutes (sorted by time); a sample older than the newest is dropped
  function surgeAdd(list, t, p, src) {
    list = list || [];
    if (!(p > 0) || !isFinite(t)) return list;
    var last = list[list.length - 1];
    if (last && t <= last.t) return list;
    list.push({ t: t, p: p, src: src || "" });
    while (list.length && t - list[0].t > SURGE_KEEP) list.shift();
    return list;
  }
  /* The biggest move that meets a rule, or null. Only the unbroken run that ends at the newest sample counts:
     a gap of more than 90 seconds between samples, or a change of source, cuts the run (no change across it).
     The newest sample must itself be at most 90 seconds old at now. */
  function surgeCheck(key, list, now) {
    var cfg = SURGE[key];
    if (!cfg || !list || list.length < 2) return null;
    var last = list[list.length - 1];
    if (now - last.t > SURGE_GAP) return null;
    var run = [last];
    for (var i = list.length - 2; i >= 0; i--) {
      var s = list[i];
      if (run[0].t - s.t > SURGE_GAP || s.src !== run[0].src || last.t - s.t > SURGE_KEEP) break;
      run.unshift(s);
    }
    var size = function (from) { var d = last.p - from.p; return cfg.unit === "yen" ? Math.abs(d) : Math.abs(d) / from.p * 100; };
    var best = null;
    ["emergency", "caution"].forEach(function (level) {
      if (best) return;
      cfg[level].forEach(function (rule) {
        run.forEach(function (s) {
          if (s === last || last.t - s.t > rule[0] * MIN) return;
          var z = size(s);
          if (z >= rule[1] && (!best || z / rule[1] > best.ratio)) {
            var d = last.p - s.p;
            best = { key: key, level: level, dir: d > 0 ? "up" : "down", win: rule[0], delta: d, pct: d / s.p * 100, from: s.p, to: last.p, t0: s.t, t: last.t, ratio: z / rule[1], unit: cfg.unit };
          }
        });
      });
    });
    return best;
  }
  /* Whether a detection is a new alert (banner, sound, notification): not when the same direction already alerted
     at the same or a higher level within 30 minutes; a rise from 注意 to 緊急 alerts at once. state is
     { up: { rank, at }, down: { rank, at } } and is returned updated. */
  function surgeGate(state, res, now) {
    state = state || {};
    if (!res) return { alert: false, state: state };
    var prev = state[res.dir], rank = SURGE_RANK[res.level];
    if (prev && now - prev.at < SURGE_COOL && rank <= prev.rank) return { alert: false, state: state };
    state[res.dir] = { rank: rank, at: now };
    return { alert: true, state: state };
  }
  // the words for a detection: never says the move is an intervention, never names a price level
  var SURGE_NAME = { usdjpy: "ドル円", gold: "ゴールド", btc: "BTC", usoil: "USオイル", silver: "シルバー" };
  function surgeText(res) {
    var name = SURGE_NAME[res.key] || res.key, sign = res.delta >= 0 ? "+" : "−", mag = Math.abs(res.delta);
    var size = res.unit === "yen" ? sign + mag.toFixed(2) + "円" : sign + Math.abs(res.pct).toFixed(2) + "%";
    var way = res.key === "usdjpy" ? (res.dir === "down" ? "（円高方向）" : "（円安方向）") : res.dir === "down" ? "（下落）" : "（上昇）";
    return { head: name + "が急変" + way, size: res.win + "分で " + size, level: res.level === "emergency" ? "緊急" : "注意" };
  }
  /* 為替介入への警戒：news.json の中で、ドル円に関わる介入警戒（tone intervention）の見出しのうち、
     発言から24時間以内の最新1件。なければ null */
  function interventionPick(news, now) {
    var items = news && Array.isArray(news.items) ? news.items : [];
    var best = null;
    items.forEach(function (i) {
      if (!i || i.tone !== "intervention" || !(i.pages || []).some(function (p) { return p === "usdjpy"; })) return;
      var t = +i.t * 1000;
      if (!(t <= now + 5 * MIN) || now - t > DAY) return;
      if (!best || t > best.t * 1000) best = i;
    });
    return best;
  }

  /* ---------- 相場タイプ判定（テクニカル／ファンダメンタル） ----------
     仕様：market-regime-spec-20261105.md（v2）。判定は純関数 regimeJudge に閉じ込め、
     画面側は既存データのスナップショットを渡すだけにする。新規の外部通信は持たない。
     スコアは −100（テクニカル）〜 +100（ファンダメンタル）。段階の区切り ±25／±60 は
     仕様ファイル末尾の較正記録（2026-11-09）で確定した値。 */
  var REGIME_T1 = 25, REGIME_T2 = 60;
  var REGIME_STAGES = [
    { k: "funda2", ja: "ファンダメンタル強め" },
    { k: "funda1", ja: "ファンダメンタル寄り" },
    { k: "mixed", ja: "混ざっている" },
    { k: "tech1", ja: "テクニカル寄り" },
    { k: "tech2", ja: "テクニカル強め" }
  ];
  // イベント分類 × 銘柄の重み（仕様 v2 の重み表）。1=強、0.7=中、0.4=弱、0=対象外
  var REGIME_W = {
    "us-jobs":   { usdjpy: 1,   gold: 1,   btc: 0.4, usoil: 0.4 },
    "us-prices": { usdjpy: 1,   gold: 1,   btc: 0.4, usoil: 0.4 },
    "us-rates":  { usdjpy: 1,   gold: 1,   btc: 0.7, usoil: 0.4 },
    "jp-policy": { usdjpy: 1,   gold: 0,   btc: 0,   usoil: 0 },
    "jp-data":   { usdjpy: 0.7, gold: 0,   btc: 0,   usoil: 0 },
    "eu-policy": { usdjpy: 0.4, gold: 0.4, btc: 0,   usoil: 0 },
    "oil-inv":   { usdjpy: 0,   gold: 0,   btc: 0,   usoil: 0 }
  };
  function regimeEventClass(country, title) {
    var t = String(title || "");
    if (/Crude Oil Inventories/i.test(t)) return "oil-inv";
    if (country === "USD") {
      if (/Non-?Farm|\bADP\b|Unemployment|Jobless|JOLTS|Employment|Average Hourly Earnings/i.test(t)) return "us-jobs";
      if (/\bCPI\b|\bPPI\b|\bPCE\b|Price Index|Inflation/i.test(t)) return "us-prices";
      if (/Federal Funds|FOMC|Powell|Fed Chair|Federal Reserve|Speaks|Testif/i.test(t)) return "us-rates";
      return null;
    }
    if (country === "JPY") {
      if (/BOJ|Bank of Japan|Monetary Policy|Policy Rate|Ueda/i.test(t)) return "jp-policy";
      if (/\bCPI\b|Unemployment|Cash Earnings|Wage|Tankan|Retail Sales|Household Spending/i.test(t)) return "jp-data";
      return null;
    }
    if (country === "EUR") {
      if (/ECB|Refinancing Rate|Lagarde|Monetary Policy/i.test(t)) return "eu-policy";
      return null;
    }
    return null;
  }
  // 前回反応の上乗せ（最大+10）の基準値：reactions.json 実測の代表クラスの平均から較正（較正記録参照）。
  // btc は reactions.json に記録がないため 0（上乗せなし）
  var REGIME_RXREF = { usdjpy: 80, gold: 80, usoil: 1.5, btc: 0 };
  // 節目への接近の基準（ホームの注目ポイント PT_NEAR と同じ値。単位は各銘柄の価格）
  var REGIME_NEAR = { usdjpy: 0.10, gold: 10, btc: 300, usoil: 0.50 };
  // DXY・米10年金利の「通常の1日の値幅」の基準（market.json 実測の中央値。較正記録参照）。
  // 実行時は系列から中央値を取り直し、取れない時だけこの値を使う
  var REGIME_FX_BASE = { dxy: 0.49, us10yBp: 6.9 };
  function regimeStage(score) {
    if (score >= REGIME_T2) return REGIME_STAGES[0];
    if (score >= REGIME_T1) return REGIME_STAGES[1];
    if (score <= -REGIME_T2) return REGIME_STAGES[4];
    if (score <= -REGIME_T1) return REGIME_STAGES[3];
    return REGIME_STAGES[2];
  }
  /* スナップショット（画面側が既存データから作る）:
     { key, now, marketOpen, calendarOk, dayStart, dayEnd,
       events: [{ t, stars, cls, name, hhmm, reactionAvg, reactionText }],
       surge: { level: "caution"|"emergency", win, backed } | null,
       newsCount: number|null, fxMult: number|null,
       nearLevel: { label } | null, narrow: bool|null }
     返り値：{ ok:false, why:"calendar"|"closed" } |
             { ok:true, score, stage, stageJa, reasons:[{text,pts}], parts, missing, event } */
  function regimeJudge(s) {
    if (!s) return { ok: false, why: "calendar" };
    if (!s.calendarOk) return { ok: false, why: "calendar" };
    if (!s.marketOpen) return { ok: false, why: "closed" };
    var key = s.key, now = s.now, missing = [];
    var parts = { approach: 0, reaction: 0, surge: 0, news: 0, fx: 0, level: 0, narrow: 0, quiet: 0 };
    var cand = [];
    // イベント：接近と発表直後の「反応中」は、寄与が最大の1件だけを数える（二重数え禁止）。
    // ★1は接近の対象にしない（仕様の接近加点は★3・★2の定義のみ）。原油在庫は重み0で自然に外れる
    var ev = null, evPts = 0, evPost = false;
    (s.events || []).forEach(function (e) {
      if (!e || e.stars < 2 || !e.cls) return;
      var w = (REGIME_W[e.cls] || {})[key]; if (!w) return;
      var sf = e.stars >= 3 ? 1 : 0.5, mins = (e.t - now) / MIN, pts = 0, post = false;
      if (mins > 0) {
        if (e.t >= s.dayEnd) return;  // 接近は「当日中」だけ
        pts = (mins <= 60 ? 50 : mins <= 180 ? 35 : 20) * sf * w;
      } else if (mins >= -120) {
        pts = 40 * (1 + mins / 120) * sf * w; post = true;  // 発表直後+40 → 1時間で+20 → 2時間で消滅（直線）
      } else return;
      if (pts > 0 && (!ev || pts > evPts)) { ev = e; evPts = pts; evPost = post; }
    });
    if (ev) {
      parts.approach = Math.round(evPts);
      cand.push({ rank: 1, pts: parts.approach, text: evPost ? ev.name + "の発表直後（反応中）" : ev.hhmm + " " + ev.name + "（★" + ev.stars + "）が近い" });
      var ref = REGIME_RXREF[key] || 0;
      if (ref > 0 && ev.reactionAvg != null && isFinite(ev.reactionAvg) && ev.reactionAvg > 0) {
        parts.reaction = Math.round(10 * Math.min(1, ev.reactionAvg / ref));
        if (parts.reaction > 0 && ev.reactionText) cand.push({ rank: 5, pts: parts.reaction, text: "前回この指標は" + ev.reactionText + "動いた" });
      }
    }
    // 急変：注意+15／緊急+30。ニュースの裏付けがないものは半分
    if (s.surge) {
      var sb = s.surge.level === "emergency" ? 30 : 15;
      parts.surge = Math.round(s.surge.backed ? sb : sb / 2);
      cand.push({ rank: 2, pts: parts.surge, text: "直近" + (s.surge.win || 15) + "分で急変（" + (s.surge.level === "emergency" ? "緊急" : "注意") + "水準）" });
    }
    // ニュース：直近3時間の関連見出し（束ね後）が複数なら +10〜+20
    if (s.newsCount == null) missing.push("news");
    else if (s.newsCount >= 2) {
      parts.news = s.newsCount === 2 ? 10 : s.newsCount === 3 ? 15 : 20;
      cand.push({ rank: 3, pts: parts.news, text: "関連ニュースが" + s.newsCount + "件（直近3時間）" });
    }
    // DXY・金利：通常の1日の値幅の0.6倍を超えた分だけ数える（0.6倍以下は「大きな動き」とみなさない）
    if (s.fxMult == null) missing.push("fx");
    else if (s.fxMult > 0.6) {
      parts.fx = Math.round(20 * Math.min(1, (s.fxMult - 0.6) / 0.9));
      if (parts.fx > 0) cand.push({ rank: 4, pts: parts.fx, text: "ドル・金利 通常の約" + s.fxMult.toFixed(1) + "倍の動き" });
    }
    // 節目接近 −15／値幅の狭さ −10（合わせて −25 が上限）
    if (s.nearLevel) {
      parts.level = -15;
      cand.push({ rank: 6, pts: -15, text: "節目 " + s.nearLevel.label + " の攻防が中心" });
    }
    if (s.narrow == null) missing.push("range");
    else if (s.narrow) {
      parts.narrow = -10;
      cand.push({ rank: 7, pts: -10, text: "値幅が狭い（様子見の地合い）" });
    }
    // 静けさ：プラスの材料が何もない時間帯は −10
    if (!(parts.approach > 0 || parts.surge > 0 || parts.news > 0 || parts.fx > 0)) {
      parts.quiet = -10;
      cand.push({ rank: 8, pts: -10, text: "目立った材料なし" });
    }
    var score = 0; Object.keys(parts).forEach(function (k) { score += parts[k]; });
    score = Math.max(-100, Math.min(100, score));
    cand.sort(function (a, b) { return a.rank - b.rank || Math.abs(b.pts) - Math.abs(a.pts); });
    var st = regimeStage(score);
    return { ok: true, score: score, stage: st.k, stageJa: st.ja, reasons: cand.slice(0, 2), parts: parts, missing: missing,
      event: ev ? { name: ev.name, stars: ev.stars } : null };
  }
  /* DXY・米10年金利の「その日の動き ÷ 通常の1日の値幅」の倍率（大きい方）。
     inst = market.json の instruments。その日の動きは price − prevClose、通常の値幅は
     日足（1d）の高値−安値の中央値（直近25本）。どちらも取れなければ null */
  function regimeFxMult(inst) {
    if (!inst) return null;
    function medRange(c1d, scale) {
      if (!c1d || c1d.length < 10) return null;
      var rs = c1d.slice(-25).map(function (c) { return (c[2] - c[3]) * scale; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
      return rs.length >= 10 ? rs[Math.floor(rs.length / 2)] : null;
    }
    var mults = [];
    var dx = inst.dxy;
    if (dx && dx.price && dx.prevClose) mults.push(Math.abs(dx.price - dx.prevClose) / (medRange(dx.candles && dx.candles["1d"], 1) || REGIME_FX_BASE.dxy));
    var y = inst.us10y;
    if (y && y.price && y.prevClose) mults.push(Math.abs(y.price - y.prevClose) * 100 / (medRange(y.candles && y.candles["1d"], 100) || REGIME_FX_BASE.us10yBp));
    return mults.length ? Math.max.apply(null, mults) : null;
  }
  /* 直近3時間の値幅が、過去の日々の同じ時間帯（UTC時）の3時間値幅の中央値の半分以下か。
     bars = 時刻順の確定1時間足 [{ t(ms), h, l }]。材料が足りなければ null */
  function regimeNarrow(bars, now) {
    if (!bars || bars.length < 30) return null;
    function rng(i) { var b = bars.slice(i - 2, i + 1); return Math.max.apply(null, b.map(function (x) { return x.h; })) - Math.min.apply(null, b.map(function (x) { return x.l; })); }
    var last = -1;
    for (var i = bars.length - 1; i >= 0; i--) { if (bars[i].t + HOUR <= now) { last = i; break; } }
    if (last < 2) return null;
    var cur = rng(last), hod = new Date(bars[last].t).getUTCHours(), day0 = Math.floor(bars[last].t / DAY), samples = [];
    for (var j = 2; j < last; j++) {
      if (Math.floor(bars[j].t / DAY) >= day0) continue;
      if (new Date(bars[j].t).getUTCHours() !== hod) continue;
      var r = rng(j); if (r > 0) samples.push(r);
    }
    if (samples.length < 5) return null;
    samples.sort(function (a, b) { return a - b; });
    var med = samples[Math.floor(samples.length / 2)];
    return med > 0 ? cur <= med / 2 : null;
  }
  // ニュース見出しの数え方（仕様 v2）：見出しのみを銘柄キーワードで数え、同じ材料の続報は1件に束ねる。
  // 束ねの鍵は見出し中の材料語（介入・雇用統計など）の集合、材料語がなければ正規化した先頭10文字。
  // items = news.json の items（{ t: 秒, title }）。返り値 { count: 束ね後, raw: 束ね前 }
  var REGIME_NEWS_KW = {
    gold: /ゴールド|金価格|金相場|金利|地政学|中東|ウクライナ|ロシア|停戦|有事|関税/,
    usdjpy: /円高|円安|円買い|円売り|円相場|対円|ドル高|ドル安|ドル買い|ドル売り|ドル相場|対ドル|日銀|FRB|米金利|金利|介入|財務省|雇用統計|消費者物価|物価/,
    btc: /ビットコイン|暗号資産|仮想通貨|規制|SEC|ETF/,
    usoil: /原油|OPEC|石油|在庫|ガソリン/
  };
  var REGIME_NEWS_TOKENS = ["雇用統計", "介入", "日銀", "FRB", "FOMC", "CPI", "PCE", "PPI", "金利", "物価", "関税", "中東", "ウクライナ", "停戦", "OPEC", "原油", "ビットコイン", "暗号資産", "財務省", "総裁", "議長"];
  function regimeNewsCount(items, key, now) {
    var kw = REGIME_NEWS_KW[key]; if (!kw || !Array.isArray(items)) return null;
    var seen = {}, count = 0, raw = 0;
    items.forEach(function (i) {
      if (!i || !i.title) return;
      var t = +i.t * 1000;
      if (!(t <= now + 5 * MIN) || now - t > 3 * HOUR) return;
      if (!kw.test(i.title)) return;
      raw++;
      var toks = REGIME_NEWS_TOKENS.filter(function (w) { return i.title.indexOf(w) >= 0; });
      var norm = toks.length ? toks[0] : String(i.title).replace(/[0-9０-９\s　・「」（）()［］\[\],.、。:：%％$＄]/g, "").slice(0, 10);
      if (!seen[norm]) { seen[norm] = 1; count++; }
    });
    return { count: count, raw: raw };
  }

  return { MIN: MIN, HOUR: HOUR, DAY: DAY, partsIn: partsIn, zoneOffset: zoneOffset, zoneTime: zoneTime, isDst: isDst,
    KIND: KIND, marketState: marketState, hoursNote: hoursNote, nextOpen: nextOpen, sessions: sessions, RULES: RULES, freshness: freshness, ago: ago, jst: jst,
    checkMarket: checkMarket, realCandles: realCandles, sequencer: sequencer,
    weeklyHours: weeklyHours, REOPEN_NOTE: REOPEN_NOTE, LEVEL_JA: LEVEL_JA,
    positionSize: positionSize, riskReward: riskReward, dailyLoss: dailyLoss, dayKey: dayKey, journalDays: journalDays, dailyBook: dailyBook, periodSummary: periodSummary, weekOf: weekOf, gotobi: gotobi, surpriseOf: surpriseOf, indDirection: indDirection, indUnit: indUnit, indAffects: indAffects, rxInsts: rxInsts, RX_JA: RX_JA, reactionStats: reactionStats, moveText: moveText, INST_JA: INST_JA,
    SURGE: SURGE, SURGE_GAP: SURGE_GAP, SURGE_COOL: SURGE_COOL, SURGE_SHOW: SURGE_SHOW, surgeAdd: surgeAdd, surgeCheck: surgeCheck, surgeGate: surgeGate, surgeText: surgeText, interventionPick: interventionPick,
    regimeEventClass: regimeEventClass, regimeJudge: regimeJudge, regimeStage: regimeStage, regimeFxMult: regimeFxMult, regimeNarrow: regimeNarrow, regimeNewsCount: regimeNewsCount, REGIME_STAGES: REGIME_STAGES, REGIME_NEAR: REGIME_NEAR, REGIME_RXREF: REGIME_RXREF, REGIME_FX_BASE: REGIME_FX_BASE,
    newStore: newStore, updateSignal: updateSignal, expireSignals: expireSignals, loadStore: loadStore, COOLDOWN: COOLDOWN,
    toCSV: toCSV, parseCSV: parseCSV, importCSV: importCSV,
    GROUPS: GROUPS, groupOf: groupOf, exportSettings: exportSettings, importSettings: importSettings, resetGroup: resetGroup, safeSet: safeSet };
});
