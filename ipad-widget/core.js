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
    return q.h + ":" + String(q.mi).padStart(2, "0");
  }
  // the weekly hours in Japan time, for the date of t (they move by an hour with US summer time)
  function hoursNote(kind, t) {
    var us = isDst("America/New_York", t) ? "米国の夏時間中" : "米国の冬時間中";
    if (kind === "crypto") return "暗号資産：24時間・年中無休（取引所の臨時メンテナンスは判定できません）";
    if (kind === "vix") return "VIX：日本時間 平日" + nyInJst(t, 3, 15) + "〜翌朝" + nyInJst(t, 16, 15) + "を目安（" + us + "。祝日は含めていません）";
    var close = nyInJst(t, 17, 0), open = kind === "fx" ? close : nyInJst(t, 18, 0);
    if (kind === "fx") return "外国為替：日本時間 月曜" + open + "〜土曜" + close + "（" + us + "。週末のみ判定し、祝日・年末年始は含めていません）";
    if (kind === "cme") return "先物（CME）：日本時間 月曜" + open + "〜土曜" + close + "、毎朝" + close + "〜" + open + "は休止（" + us + "。祝日の短縮取引は含めていません）";
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
        return ["日", "月", "火", "水", "木", "金", "土"][p.dow] + " " + p.h + ":" + String(p.mi).padStart(2, "0");
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
  var LEVEL_JA = { live: "リアルタイム", fresh: "最新", delayed: "遅延", stale: "更新停止", closed: "休場中（最終値）", unknown: "不明", missing: "未取得" };
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
    return (withDate === false ? "" : p.mo + "/" + p.d + " ") + p.h + ":" + z(p.mi) + " JST";
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
    trading: [/^(gold|usdjpy|btc)_(capital|risk_pct|lot_manual|sl_mult|rr|auto_risk|broker|contract|tp_basis|checks|xm_.*|xs_.*)$/, /^pt-v1$/,
      /^td-journal-v1$/, /^td-signals-v1$/, /^td-checks-v1$/, /^td-risk-v1$/]
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

  return { MIN: MIN, HOUR: HOUR, DAY: DAY, partsIn: partsIn, zoneOffset: zoneOffset, zoneTime: zoneTime, isDst: isDst,
    KIND: KIND, marketState: marketState, hoursNote: hoursNote, nextOpen: nextOpen, sessions: sessions, RULES: RULES, freshness: freshness, ago: ago, jst: jst,
    checkMarket: checkMarket, realCandles: realCandles, sequencer: sequencer,
    positionSize: positionSize, riskReward: riskReward, dailyLoss: dailyLoss, dayKey: dayKey,
    newStore: newStore, updateSignal: updateSignal, expireSignals: expireSignals, loadStore: loadStore, COOLDOWN: COOLDOWN,
    toCSV: toCSV, parseCSV: parseCSV, importCSV: importCSV,
    GROUPS: GROUPS, groupOf: groupOf, exportSettings: exportSettings, importSettings: importSettings, resetGroup: resetGroup, safeSet: safeSet };
});
