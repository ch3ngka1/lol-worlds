/* 2026 LoL 世界賽分析 — 前端（無框架、無建置步驟） */
(() => {
  "use strict";

  const TZ = "Asia/Taipei";
  const FILES = ["meta", "teams", "schedule", "rosters", "ratings", "h2h"];
  const OPTIONAL = ["odds", "predictions", "team_history"];   // 缺了也能正常顯示
  const ROLE = { Top: "上路", Jungle: "打野", Mid: "中路", Bot: "下路", Support: "輔助" };
  const ROUND = { Quarterfinals: "八強", Semifinals: "四強", Finals: "決賽" };
  const LEAGUE_ZH = { LCK: "LCK 韓國", LPL: "LPL 中國", LEC: "LEC 歐洲", LCS: "LCS 北美", LCP: "LCP 亞太", CBLOL: "CBLOL 巴西" };
  const view = document.getElementById("view");
  let D = null;           // 所有資料
  let filter = null;      // 賽程分頁

  /* ---------- 小工具 ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso, opt) => new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, ...opt }).format(new Date(iso));
  const dayKey = (iso) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
  const timeOf = (iso) => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  const dayLabel = (iso) => fmt(iso, { month: "numeric", day: "numeric" }) + "（" + fmt(iso, { weekday: "short" }).replace("週", "") + "）";
  const team = (c) => (c && D.teams[c]) || null;
  const lgClass = (c) => (team(c) ? "lg-" + team(c).league : "");
  const pct = (p) => Math.round(p * 100);
  const seedTxt = (c) => { const t = team(c); return t && t.seed ? `${t.league} ${t.seed} 號種子` : ""; };

  function roundLabel(m) {
    if (ROUND[m.round]) return ROUND[m.round];
    const n = (m.round.match(/\d+/) || [""])[0];
    return (m.stage === "入圍賽" ? "入圍賽 " : "瑞士輪 ") + (n ? `第 ${n} 輪` : m.round);
  }
  function roundZh(r) {
    if (!r) return "";
    if (ROUND[r]) return ROUND[r];
    const ZH = { "Tiebreakers": "加賽", "Tiebreaker": "加賽", "Knockout Stage": "淘汰賽", "Groups": "小組賽", "Group Stage": "小組賽",
      "Upper Bracket": "勝部", "Lower Bracket": "敗部", "Bracket Stage": "淘汰賽", "Rumble Stage": "對抗賽", "Finals": "決賽" };
    if (ZH[r]) return ZH[r];
    let m;
    if ((m = r.match(/^Bracket Round (\d+)$/))) return `淘汰賽第 ${m[1]} 輪`;
    if ((m = r.match(/^(Rumble|Groups|Play-In) Day (\d+)$/))) return `${{ Rumble: "對抗賽", Groups: "小組賽", "Play-In": "入圍賽" }[m[1]]}第 ${m[2]} 天`;
    if (r === "Play-In") return "入圍賽";
    if ((m = r.match(/^Day (\d+)$/))) return `第 ${m[1]} 天`;
    if ((m = r.match(/^Round (\d+)$/))) return `第 ${m[1]} 輪`;
    if ((m = r.match(/^Week (\d+)$/))) return `第 ${m[1]} 週`;
    return r;
  }
  function group(m) {
    if (m.stage === "入圍賽") return "playin";
    return ROUND[m.round] ? "knockout" : "swiss";
  }
  const isDone = (m) => m.w === 1 || m.w === 2;
  const known = (m) => m.c1 && m.c2;

  /* ---------- 讀資料 ---------- */
  async function load() {
    const bust = "?t=" + Math.floor(Date.now() / 300000); // 每 5 分鐘換一次，避免拿到舊快取
    const get = (f) => fetch(`data/${f}.json${bust}`).then((r) => { if (!r.ok) throw new Error(`${f}.json ${r.status}`); return r.json(); });
    const res = await Promise.all(FILES.map(get));
    const opt = await Promise.all(OPTIONAL.map((f) => get(f).catch(() => null)));
    const d = Object.fromEntries(FILES.map((f, i) => [f, res[i]]));
    OPTIONAL.forEach((f, i) => { d[f] = opt[i]; });
    d.matches = d.schedule.matches;
    d.series = d.h2h.series;
    d.preds = d.predictions || {};
    return d;
  }

  /* 賽前紀錄：已打完且有賽前勝率的比賽 */
  function predResult(m) {
    const pr = D.preds[m.id];
    if (!pr || !isDone(m)) return null;
    const pa = pr.a === m.c1 ? pr.p : 1 - pr.p;          // 換算成 c1 的勝率
    const fav = pa >= 0.5 ? m.c1 : m.c2, conf = Math.max(pa, 1 - pa);
    const winner = m.w === 1 ? m.c1 : m.c2;
    return { fav, conf, winner, hit: fav === winner, at: pr.at };
  }

  /* ---------- 本屆戰績 ---------- */
  function worldsRecord(code) {
    const games = D.matches.filter((m) => isDone(m) && (m.c1 === code || m.c2 === code));
    const res = games.map((m) => ((m.c1 === code) === (m.w === 1) ? "W" : "L"));
    const swiss = D.matches.filter((m) => group(m) === "swiss" && isDone(m) && (m.c1 === code || m.c2 === code));
    const sw = swiss.filter((m) => (m.c1 === code) === (m.w === 1)).length;
    return { res, w: res.filter((x) => x === "W").length, l: res.filter((x) => x === "L").length,
      swiss: swiss.length ? `${sw}-${swiss.length - sw}` : null };
  }

  /* ---------- 交手紀錄 ---------- */
  function headToHead(a, b) {
    const rows = D.series.filter((s) => (s.c1 === a && s.c2 === b) || (s.c1 === b && s.c2 === a));
    // 本屆已打完的交手也算進來
    D.matches.forEach((m) => {
      if (isDone(m) && ((m.c1 === a && m.c2 === b) || (m.c1 === b && m.c2 === a))) {
        rows.push({ date: m.time.slice(0, 10), event: "2026 世界賽", stage: m.stage, round: m.round, bo: m.bo,
          t1: team(m.c1).name, t2: team(m.c2).name, c1: m.c1, c2: m.c2, s1: m.s1, s2: m.s2, w: m.w, live: true });
      }
    });
    rows.sort((x, y) => (x.date < y.date ? 1 : -1));
    let aw = 0, bw = 0, ag = 0, bg = 0;
    rows.forEach((s) => {
      const aIs1 = s.c1 === a;
      if ((s.w === 1) === aIs1) aw++; else bw++;
      ag += (aIs1 ? s.s1 : s.s2) || 0; bg += (aIs1 ? s.s2 : s.s1) || 0;
    });
    return { rows, aw, bw, ag, bg };
  }

  /* ---------- 勝率參考 ---------- */
  function seriesProb(p, bo) {           // 單局勝率 → 系列賽勝率
    const need = Math.floor((bo || 1) / 2) + 1;
    let tot = 0, c = 1;
    for (let j = 0; j < need; j++) {
      if (j > 0) c = c * (need - 1 + j) / j;      // 組合數 C(need-1+j, j)
      tot += c * Math.pow(p, need) * Math.pow(1 - p, j);
    }
    return tot;
  }
  function predict(a, b, bo) {
    const ra = D.ratings.teams[a].elo, rb = D.ratings.teams[b].elo;
    const game = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const p = Math.min(0.97, Math.max(0.03, seriesProb(game, bo)));
    return { p, game, ra, rb };
  }

  /* ---------- 共用片段 ---------- */
  function sideHTML(code, align, state) {
    const t = team(code);
    if (!t) return `<div class="side ${align} tbd"><span class="names"><span class="code">待定</span></span></div>`;
    const dot = `<span class="dot ${lgClass(code)}" aria-hidden="true"></span>`;
    const names = `<span class="names"><span class="code">${esc(code)}</span><span class="full">${esc(t.name)}・${esc(seedTxt(code))}</span></span>`;
    return `<div class="side ${align} ${state || ""}">${align === "right" ? names + dot : dot + names}</div>`;
  }

  function matchRow(m) {
    const done = isDone(m);
    const s1 = done ? (m.w === 1 ? "won" : "lost") : "", s2 = done ? (m.w === 2 ? "won" : "lost") : "";
    const score = done
      ? `<div class="score" aria-label="比分 ${m.s1} 比 ${m.s2}">${m.s1 ?? ""}<span class="vs"> : </span>${m.s2 ?? ""}<small>Bo${m.bo}・已結束</small></div>`
      : `<div class="score"><span class="vs">vs</span><small>Bo${m.bo}</small></div>`;
    let extra = "";
    const pr = predResult(m);
    if (pr) {
      extra = `<div class="mini-bar pred ${pr.hit ? "hit" : "miss"}">賽前看好 ${esc(pr.fav)} ${pct(pr.conf)}%　<b>${pr.hit ? "✓ 猜中" : "✗ 猜錯"}</b></div>`;
    }
    if (!done && known(m)) {
      const p = predict(m.c1, m.c2, m.bo).p;
      extra = `<div class="mini-bar"><span class="num">${pct(p)}%</span>
        <span class="bar" style="--lg-a:var(--${team(m.c1).league.toLowerCase()});--lg-b:var(--${team(m.c2).league.toLowerCase()})" aria-hidden="true">
        <span class="a" style="width:${pct(p)}%"></span><span class="b" style="width:${100 - pct(p)}%"></span></span>
        <span class="num">${100 - pct(p)}%</span><span class="sr-only">勝率參考 ${esc(m.c1)} ${pct(p)}%，${esc(m.c2)} ${100 - pct(p)}%</span></div>`;
    }
    const inner = `<div class="when">${timeOf(m.time)}</div>
      <div class="body">${sideHTML(m.c1, "left", s1)}${score}${sideHTML(m.c2, "right", s2)}</div>
      <div class="meta">${esc(roundLabel(m))}</div>${extra}`;
    return known(m)
      ? `<a class="match" href="#/m/${encodeURIComponent(m.id)}">${inner}</a>`
      : `<div class="match" aria-label="對戰隊伍待定">${inner}</div>`;
  }

  /* ---------- 頁面：賽程 ---------- */
  const TABS = [
    ["next", "接下來"], ["playin", "入圍賽"], ["swiss", "瑞士輪"], ["knockout", "淘汰賽"], ["all", "全部"],
  ];

  function renderSchedule() {
    document.title = "2026 LoL 世界賽分析｜賽程、交手戰績、勝率參考";
    const today = dayKey(new Date().toISOString());
    const upcoming = D.matches.filter((m) => !isDone(m) || dayKey(m.time) >= today);
    if (!filter) filter = upcoming.length ? "next" : "all";
    let list = D.matches;
    if (filter === "next") list = upcoming;
    else if (filter !== "all") list = D.matches.filter((m) => group(m) === filter);

    const days = new Map();
    list.forEach((m) => { const k = dayKey(m.time); if (!days.has(k)) days.set(k, []); days.get(k).push(m); });

    const body = days.size
      ? [...days.entries()].map(([k, ms]) => `
        <section class="day" aria-label="${esc(dayLabel(ms[0].time))}">
          <h2 class="day-head"><span>${esc(dayLabel(ms[0].time))}</span>${k === today ? '<span class="tag-today">今天</span>' : ""}</h2>
          <div class="list">${ms.some(known) ? ms.map(matchRow).join("")
            : `<div class="tbd-day"><b>${esc([...new Set(ms.map(roundLabel))].join("、"))}</b><span>${ms.length} 場・${timeOf(ms[0].time)} 起・對戰待定</span></div>`}</div>
        </section>`).join("")
      : `<div class="state">這個分類目前沒有比賽。<br><button class="btn" data-tab="all" type="button">看全部賽程</button></div>`;

    view.innerHTML = `
      <div class="page-title"><h1>賽程與比分</h1><p>時間為台灣時間・點比賽看交手紀錄與名單</p></div>
      <div class="tabs" role="group" aria-label="篩選賽程">
        ${TABS.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === filter}">${l}</button>`).join("")}
      </div>${body}`;
    view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.tab; renderSchedule(); }));
  }

  /* ---------- 頁面：單場分析 ---------- */
  function rosterHTML(code) {
    const t = team(code), r = D.rosters[code];
    if (!r) return `<div class="panel roster"><h3>${esc(code)}</h3><p class="muted">還沒有名單資料。</p></div>`;
    const lu = (D.ratings.teams[code] && D.ratings.teams[code].lineup) || [];
    const norm = (x) => String(x).split(" (")[0].toLowerCase();
    const rows = r.players.map((p) => {
      const hit = lu.find((x) => norm(x.name) === norm(p.name));
      return `<tr><th scope="row">${ROLE[p.role] || esc(p.role)}</th>
      <td><a href="https://lol.fandom.com/wiki/${encodeURIComponent(p.page.replace(/ /g, "_"))}" rel="noopener">${esc(p.name)}</a>${hit ? "" : ' <span class="muted" style="font-size:12px">替補</span>'}</td>
      <td class="num" style="text-align:right;color:var(--ink-3)">${hit ? Math.round(hit.elo) : ""}</td></tr>`;
    }).join("");
    const staff = r.staff.length ? `<p class="staff">教練團：${r.staff.map((s) => esc(s.name)).join("、")}</p>` : "";
    return `<div class="panel roster"><h3><span class="dot ${lgClass(code)}" aria-hidden="true"></span>${esc(code)}<span class="muted" style="font-weight:400;font-size:13px">${esc(t.name)}</span></h3>
      <table>${rows}</table>${staff}</div>`;
  }

  function formHTML(code) {
    const f = worldsRecord(code);
    if (!f.res.length) return `<span class="muted">本屆還沒出賽</span>`;
    return `<span class="form-chips" aria-label="本屆 ${f.w} 勝 ${f.l} 敗">${f.res.map((x) => `<span class="chip ${x}">${x === "W" ? "勝" : "敗"}</span>`).join("")}</span>`;
  }

  function renderMatch(id) {
    const m = D.matches.find((x) => x.id === id);
    if (!m || !known(m)) {
      view.innerHTML = `<a class="back" href="#/">← 回賽程</a><div class="state">找不到這場比賽，或對戰隊伍還沒確定。</div>`;
      return;
    }
    const a = m.c1, b = m.c2, A = team(a), B = team(b);
    document.title = `${a} vs ${b}｜2026 LoL 世界賽分析`;
    const done = isDone(m);
    const h = headToHead(a, b);
    const ra = D.ratings.teams[a], rb = D.ratings.teams[b];

    // 勝率
    let probBlock;
    if (done) {
      const winner = m.w === 1 ? a : b;
      const pr = predResult(m);
      probBlock = `<div class="panel"><p style="margin:0">這場已經打完，由 <b>${esc(winner)}</b> 以 ${Math.max(m.s1, m.s2)}:${Math.min(m.s1, m.s2)} 獲勝。</p>
        ${pr ? `<p style="margin:8px 0 0">賽前看好 <b>${esc(pr.fav)}</b>（${pct(pr.conf)}%）：<b>${pr.hit ? "✓ 猜中" : "✗ 猜錯"}</b>。<a href="#/record">看本屆所有預測</a></p>`
             : `<p class="note">這場在本站開始記錄賽前勝率之前就打完了，沒有賽前紀錄。</p>`}</div>`;
    } else {
      const P = predict(a, b, m.bo);
      const lu = (c) => (D.ratings.teams[c].lineup || []).map((x) => esc(x.name)).join("、");
      const fa = worldsRecord(a), fb = worldsRecord(b);
      probBlock = `<div class="panel">
        <div class="prob-row" style="--lg-a:var(--${A.league.toLowerCase()});--lg-b:var(--${B.league.toLowerCase()})">
          <span class="pct">${pct(P.p)}%</span>
          <span class="bar" aria-hidden="true"><span class="a" style="width:${pct(P.p)}%"></span><span class="b" style="width:${100 - pct(P.p)}%"></span></span>
          <span class="pct right">${100 - pct(P.p)}%</span>
        </div>
        <div class="prob-labels"><span>${esc(a)} 勝</span><span>${esc(b)} 勝</span></div>
        <p class="sr-only">勝率參考：${esc(a)} ${pct(P.p)}%，${esc(b)} ${100 - pct(P.p)}%</p>
        <ul class="factors">
          <li><b>實力分數（五名選手平均）</b><span class="val">${Math.round(P.ra)} : ${Math.round(P.rb)}</span>
            <span class="why">每位選手依 2023 年起每一局國際賽與聯賽的勝負累積分數，換人、轉隊時分數跟著選手走。預計陣容：${esc(a)} ${lu(a)}；${esc(b)} ${lu(b)}。</span></li>
          <li><b>換算成 Bo${m.bo}</b><span class="val">單局 ${pct(P.game)}%</span>
            <span class="why">${m.bo > 1 ? `打越多局，強隊越不容易被爆冷，所以 Bo${m.bo} 的勝率會比單局更拉開。` : "Bo1 只打一局，勝率就是單局勝率。"}</span></li>
          <li><b>過去交手</b><span class="val">不計入</span>
            <span class="why">回測顯示把交手紀錄算進勝率，反而比較不準，所以下面的交手紀錄只供參考。</span></li>
          <li><b>本屆戰績</b><span class="val">${fa.res.length || fb.res.length ? `${fa.w}-${fa.l} : ${fb.w}-${fb.l}` : "尚未出賽"}</span>
            <span class="why">已包含在實力分數裡，列出來方便參考。</span></li>
        </ul>
        <p class="note">只是根據過去比賽結果算出的參考值，不代表預測一定準確；版本、狀態、選手異動都沒有算進去。<a href="#/about">怎麼算的？</a></p>
      </div>`;
    }

    // 交手紀錄
    const nowY = new Date().getFullYear();
    const h2hBlock = h.rows.length ? `
      <div class="panel">
        <div class="h2h-sum">
          <div><div class="big">${h.aw}</div><div class="lbl">${esc(a)} 系列賽勝</div></div>
          <div class="lbl">小局 ${h.ag} : ${h.bg}</div>
          <div><div class="big">${h.bw}</div><div class="lbl">${esc(b)} 系列賽勝</div></div>
        </div>
        <ul class="h2h-list">${h.rows.map((s) => {
          const aIs1 = s.c1 === a;
          const an = aIs1 ? s.t1 : s.t2, bn = aIs1 ? s.t2 : s.t1;
          const as = aIs1 ? s.s1 : s.s2, bs = aIs1 ? s.s2 : s.s1;
          const aWon = (s.w === 1) === aIs1;
          const olds = [an !== A.name && an !== A.lp ? an : null, bn !== B.name && bn !== B.lp ? bn : null];
          const oldTxt = (olds[0] || olds[1]) ? `<span class="old">當時隊名：${esc(an)} vs ${esc(bn)}</span>` : "";
          const old = nowY - parseInt(s.date, 10) >= 4;
          return `<li class="${old ? "old-row" : ""}">
            <span class="ev">${esc(s.event)}<br>${esc([s.stage, roundZh(s.round)].filter(Boolean).join("・"))}</span>
            <span class="teams"><span class="${aWon ? "w" : ""}">${esc(a)}</span> vs <span class="${aWon ? "" : "w"}">${esc(b)}</span>
              <span class="old">${esc(s.date)}・Bo${esc(s.bo || "?")}</span>${oldTxt}</span>
            <span class="sc" aria-label="${esc(a)} ${as} 比 ${bs}">${as ?? "-"}:${bs ?? "-"}</span></li>`;
        }).join("")}</ul>
        <p class="note">2014 年起的世界賽、MSI，以及 First Stand（2025 起）、電競世界盃（2024 起）。顏色較淡的是 4 年以上的舊紀錄，陣容多半已大不相同。</p>
      </div>` : `<div class="state">兩隊（含前身隊名）從 2014 年起，從未在世界賽、MSI、First Stand 或電競世界盃交手過。</div>`;

    const hero = (code, side) => {
      const t = team(code);
      const st = done ? ((m.w === 1) === (side === 1) ? "won" : "lost") : "";
      return `<div class="hero-team ${st}"><a class="code team-link" href="#/t/${esc(code)}">${esc(code)}</a><div class="full">${esc(t.name)}</div>
        <div class="league"><span class="dot ${lgClass(code)}" aria-hidden="true"></span>${esc(LEAGUE_ZH[t.league] || t.league)}・${esc(t.seed)} 號種子</div>
        <div class="qual">${esc(t.qualified || "")}</div></div>`;
    };

    view.innerHTML = `
      <a class="back" href="#/">← 回賽程</a>
      <section class="hero" aria-label="比賽資訊">
        <p class="hero-meta">${esc(roundLabel(m))}・Bo${m.bo}・${esc(dayLabel(m.time))} ${timeOf(m.time)}（台灣時間）</p>
        <div class="hero-teams">
          ${hero(a, 1)}
          <div class="hero-score">${done ? `${m.s1}<span class="vs"> : </span>${m.s2}` : '<span class="vs">vs</span>'}</div>
          ${hero(b, 2)}
        </div>
        <h1 class="sr-only">${esc(a)} 對 ${esc(b)}</h1>
      </section>
      <section class="section"><h2>勝率參考</h2>${probBlock}</section>
      <section class="section"><h2>國際賽交手紀錄 <small>世界賽・MSI・First Stand・電競世界盃</small></h2>${h2hBlock}</section>
      <section class="section"><h2>本屆戰績</h2>
        <div class="panel"><div class="rosters">
          <div><b>${esc(a)}</b>　${formHTML(a)}</div><div><b>${esc(b)}</b>　${formHTML(b)}</div>
        </div></div></section>
      <section class="section"><h2>選手名單 <small>本屆登錄名單・右側為選手實力分數</small></h2>
        <div class="rosters">${rosterHTML(a)}${rosterHTML(b)}</div></section>`;
  }

  /* ---------- 頁面：資料與方法 ---------- */
  function renderAbout() {
    document.title = "資料與方法｜2026 LoL 世界賽分析";
    const lineage = Object.entries(D.teams).filter(([, t]) => t.lineage.length)
      .map(([c, t]) => `<li><b>${esc(c)}</b>：${t.lineage.map(([n, v]) => `${esc(n)}（${esc(v)}）`).join("、")}</li>`).join("");
    view.innerHTML = `<article class="about">
      <h1>資料與方法</h1>
      <h2>資料從哪裡來</h2>
      <p>所有賽程、比分、選手名單與歷史戰績都來自玩家共同維護的英雄聯盟電競百科 <a href="https://lol.fandom.com/" rel="noopener">Leaguepedia</a>，依 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh_TW" rel="license noopener">CC BY-SA 3.0</a> 授權使用。</p>
      <p>網站每小時自動向 Leaguepedia 檢查一次。比賽結果要等 Leaguepedia 的志工填上，通常比實際比賽晚幾十分鐘到一兩個小時才會出現在這裡。</p>
      <h2>交手紀錄怎麼算</h2>
      <p>範圍是 2014 年起的世界賽與 MSI（含入圍賽）、2025 年起的 First Stand、2024 年起的電競世界盃（Esports World Cup，俗稱石油杯），加上本屆已打完的比賽。單位是「系列賽」，例如 Bo5 打 3:1 算一次勝利。</p>
      <p>隊伍改名、品牌更換、被收購時，舊隊名的戰績會算進現在的隊伍，依據是 Leaguepedia 記錄的隊伍沿革。單純買下聯賽席位、隊伍本身沒有延續的情況不算。列表裡會標出當時的隊名，方便你自己判斷。</p>
      <ul>${lineage}</ul>
      <h2>種子序</h2>
      <p>每隊名稱旁標示的是 2026 世界賽的賽區種子序（例如「LCK 1 號種子」），以及取得資格的方式，來源同樣是 Leaguepedia。</p>
      <ul>${Object.entries(D.teams).map(([c, t]) => `<li><b>${esc(c)}</b>：${esc(t.league)} ${esc(t.seed)} 號種子，${esc(t.qualified || "")}</li>`).join("")}</ul>
      <h2>勝率參考怎麼算</h2>
      <p>主要依據是「實力分數」（Elo 制），但不是以隊伍為單位，而是<b>每位選手各有一個分數</b>。每一局比賽，隊伍實力等於當局五名出場選手的平均；贏了五人一起加分、輸了一起扣分，贏強隊加得多。這樣換人、轉隊時分數會跟著選手走，例如新組成的隊伍不必從零開始。</p>
      <p>採計 2023 年起的每一局：世界賽、MSI、First Stand 全額計算；電競世界盃不是 Riot 官方賽事，算 0.75 倍；各隊在自己聯賽（LCK、LPL、LEC、LCS、LCP、CBLOL 等）的比賽算 0.5 倍。聯賽讓同賽區的選手拉開差距，國際賽決定各賽區之間誰比較強。</p>
      <p>預測時，用本屆世界賽登錄名單中、每個位置最近有上場的選手當作預計陣容，算出單局勝率，再換算成 Bo1、Bo3、Bo5 的系列賽勝率（打越多局，強隊越不容易被爆冷）。結果限制在 3%～97% 之間。</p>
      <p>這只是根據過去勝負算出的參考值，沒有考慮版本、選手狀態、臨時換人，請不要當成真正的預測。</p>
      <h2>怎麼挑出這個算法、準不準？</h2>
      <p>我們試了 3,200 多種組合：以選手或隊伍為單位、聯賽比重、分數變動幅度、每局經濟差、藍紅方、每年回歸、過去交手修正。用 2023 年 10 月到 2026 年 10 月的 275 場國際賽系列賽回測，每場只用開打前已知的資料；先用前半段挑設定、拿後半段驗證，再反過來驗一次。經濟差、藍紅方、每年回歸、交手修正加進去都沒有幫助，所以沒有採用。</p>
      <p>結果：被看好的一方實際贏了約 71%。跟最早只看國際賽的版本比，猜中的場數差不多，但<b>給的機率更準</b>：說 70～80% 的比賽實際贏約 84%，說 90% 以上的 11 場全部命中。不過「同等級賽區互打」（例如 LCK 對 LPL）只猜中約 59%，仍接近擲硬幣；不同賽區對戰的準度，則跟「直接猜中韓隊伍」一樣。勝率參考適合當作聊天話題，不適合拿來下注。</p>
      <h2>晉級機率與預測成績</h2>
      <p>「機率」頁把本屆剩下的比賽用目前的實力分數模擬 2 萬次，算出每隊進八強、四強、決賽與奪冠的機率；已經打完的比賽直接用真實結果。瑞士輪抽籤用簡化規則（同戰績互抽、避免重複交手），實際規則更複雜，所以是近似值。</p>
      <p>「成績」頁公開每場比賽開打前的勝率：開打前每小時更新一次，開打後就凍結不再改動，打完直接對答案。這是檢驗模型最誠實的方式。</p>
      <h2>聲明</h2>
      <p>本站為粉絲自製的非營利網站，與 Riot Games 及各戰隊無關，不使用 Riot 或戰隊的商標與 logo。</p>
      <p lang="en">2026 LoL Worlds Analysis was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.</p>
      <p>原始碼：<a href="https://github.com/ch3ngka1/lol-worlds" rel="noopener">github.com/ch3ngka1/lol-worlds</a></p>
    </article>`;
  }

  /* ---------- 頁面：晉級與奪冠機率 ---------- */
  const teamLink = (c) => `<a class="team-link" href="#/t/${esc(c)}"><span class="dot ${lgClass(c)}" aria-hidden="true"></span><b>${esc(c)}</b></a>`;
  const pc = (x) => (x == null ? "–" : x >= 0.995 ? ">99%" : x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

  function renderOdds() {
    document.title = "晉級與奪冠機率｜2026 LoL 世界賽分析";
    if (!D.odds) { view.innerHTML = `<div class="state">目前還沒有機率資料。</div>`; return; }
    const rows = Object.entries(D.odds.teams).sort((x, y) => y[1].champ - x[1].champ || y[1].qf - x[1].qf);
    view.innerHTML = `
      <div class="page-title"><h1>晉級與奪冠機率</h1><p>依目前實力分數模擬 ${D.odds.n.toLocaleString()} 次，跟著賽果每小時更新</p></div>
      <div class="table-wrap"><table class="data-table">
        <caption class="sr-only">各隊晉級與奪冠機率</caption>
        <thead><tr><th scope="col">隊伍</th><th scope="col">瑞士輪</th><th scope="col">進八強</th><th scope="col">進四強</th><th scope="col">進決賽</th><th scope="col">奪冠</th></tr></thead>
        <tbody>${rows.map(([c, o]) => {
          const r = worldsRecord(c);
          return `<tr><th scope="row">${teamLink(c)}</th><td class="num">${r.swiss || "0-0"}</td>
            <td class="num">${pc(o.qf)}</td><td class="num">${pc(o.sf)}</td><td class="num">${pc(o.final)}</td>
            <td class="num champ"><span class="cbar" style="width:${Math.round(o.champ * 100)}%"></span><span>${pc(o.champ)}</span></td></tr>`;
        }).join("")}</tbody></table></div>
      <p class="note">瑞士輪抽籤用簡化規則：同戰績互抽、避免重複交手，決定晉級或淘汰的比賽打 Bo3。八強由 3-0 的隊伍對 3-2 的隊伍，其餘隨機。實際抽籤還有同賽區迴避等規則，所以只是近似值。機率完全來自實力分數，準度限制請看<a href="#/about">資料與方法</a>。</p>`;
  }

  /* ---------- 頁面：本屆預測成績 ---------- */
  function renderRecord() {
    document.title = "本屆預測成績｜2026 LoL 世界賽分析";
    const done = D.matches.filter((m) => predResult(m)).map((m) => [m, predResult(m)]);
    const hit = done.filter(([, r]) => r.hit).length;
    const expect = done.reduce((t, [, r]) => t + r.conf, 0);
    const upcoming = D.matches.filter((m) => !isDone(m) && known(m)).length;
    const body = done.length ? `
      <div class="stat-row">
        <div class="stat"><div class="big num">${hit}<span class="muted"> / ${done.length}</span></div><div class="lbl">猜中場數</div></div>
        <div class="stat"><div class="big num">${pct(hit / done.length)}%</div><div class="lbl">猜中率</div></div>
        <div class="stat"><div class="big num">${expect.toFixed(1)}</div><div class="lbl">模型自己預期會中幾場</div></div>
      </div>
      <p class="note">「預期會中幾場」是把每場賽前看好那一方的勝率加起來。實際猜中的場數跟它差不多，代表給的機率大致合理；差很多就代表模型這次失準。場數少的時候差距主要是運氣。</p>
      <div class="list">${done.slice().reverse().map(([m]) => matchRow(m)).join("")}</div>`
      : `<div class="state">本屆還沒有「有賽前紀錄」的比賽打完。<br>從瑞士輪開始，每場開打前的勝率都會被記錄下來，打完就會出現在這裡。${upcoming ? `<br>目前已記錄 ${upcoming} 場即將開打的比賽。` : ""}</div>`;
    view.innerHTML = `<div class="page-title"><h1>本屆預測成績</h1><p>開打前的勝率會被凍結保存，打完直接對答案</p></div>${body}`;
  }

  /* ---------- 頁面：隊伍 ---------- */
  function spark(hist, code) {
    const pts = (hist || []).slice(-24);
    if (pts.length < 2) return "";
    const W = 120, H = 28, ys = pts.map((p) => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys), span = Math.max(hi - lo, 1);
    const X = (i) => 2 + (i * (W - 4)) / (pts.length - 1), Y = (v) => H - 3 - ((v - lo) / span) * (H - 6);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    const first = pts[0], last = pts[pts.length - 1];
    return `<svg class="spark lg-${esc(team(code).league)}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="${esc(first[0])} ${Math.round(first[1])} 分，到 ${esc(last[0])} ${Math.round(last[1])} 分">
      <path d="${d}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(pts.length - 1)}" cy="${Y(last[1])}" r="3"/>
      ${pts.map((p, i) => `<rect x="${X(i) - 3}" y="0" width="6" height="${H}" fill="transparent"><title>${esc(p[0])}：${Math.round(p[1])} 分</title></rect>`).join("")}
    </svg>`;
  }

  function renderTeam(code) {
    const t = team(code);
    if (!t) { view.innerHTML = `<a class="back" href="#/">← 回賽程</a><div class="state">找不到這支隊伍。</div>`; return; }
    document.title = `${code} ${t.name}｜2026 LoL 世界賽分析`;
    const rt = D.ratings.teams[code] || {}, o = D.odds && D.odds.teams[code], r = worldsRecord(code);
    const lineup = rt.lineup || [];
    const reg = (D.rosters[code] || { players: [], staff: [] });
    const norm = (x) => String(x).split(" (")[0].toLowerCase();
    const subs = reg.players.filter((p) => !lineup.some((x) => norm(x.name) === norm(p.name)));
    const matches = D.matches.filter((m) => m.c1 === code || m.c2 === code);
    const hist = (D.team_history && D.team_history[code]) || [];
    view.innerHTML = `
      <a class="back" href="#/">← 回賽程</a>
      <section class="hero" aria-label="隊伍資訊">
        <div class="team-hero">
          <div><h1 class="code">${esc(code)}</h1><div class="full">${esc(t.name)}</div></div>
          <div class="league"><span class="dot ${lgClass(code)}" aria-hidden="true"></span>${esc(LEAGUE_ZH[t.league] || t.league)}・${esc(t.seed)} 號種子<div class="qual">${esc(t.qualified || "")}</div></div>
        </div>
        <div class="stat-row compact">
          <div class="stat"><div class="big num">${r.swiss || (r.res.length ? `${r.w}-${r.l}` : "0-0")}</div><div class="lbl">${r.swiss ? "瑞士輪戰績" : "本屆戰績"}</div></div>
          <div class="stat"><div class="big num">${Math.round(rt.elo || 0)}</div><div class="lbl">實力分數</div></div>
          ${o ? `<div class="stat"><div class="big num">${pc(o.qf)}</div><div class="lbl">進八強</div></div>
          <div class="stat"><div class="big num">${pc(o.champ)}</div><div class="lbl">奪冠</div></div>` : ""}
        </div>
      </section>
      <section class="section"><h2>預計陣容 <small>右側為近兩年分數走勢</small></h2>
        <div class="panel roster"><table>
          ${lineup.map((x) => `<tr><th scope="row">${ROLE[x.role] || esc(x.role)}</th><td>${esc(x.name)}<span class="muted" style="font-size:12px">　${x.games} 局</span></td>
            <td class="num" style="text-align:right">${Math.round(x.elo)}</td><td style="width:128px;text-align:right">${spark(x.hist, code)}</td></tr>`).join("")}
        </table>
        ${subs.length ? `<p class="staff">替補：${subs.map((p) => `${esc(p.name)}（${ROLE[p.role] || esc(p.role)}）`).join("、")}</p>` : ""}
        ${reg.staff.length ? `<p class="staff">教練團：${reg.staff.map((x) => esc(x.name)).join("、")}</p>` : ""}
        </div></section>
      <section class="section"><h2>本屆賽程</h2><div class="list">${matches.map(matchRow).join("") || '<div class="state">還沒有比賽。</div>'}</div></section>
      <section class="section"><h2>國際賽成績 <small>系列賽勝-敗，2014 年起</small></h2>
        ${hist.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">賽事</th><th scope="col">勝-敗</th><th scope="col">當時隊名</th></tr></thead>
          <tbody>${hist.map((e) => `<tr><th scope="row">${esc(e.event)}</th><td class="num">${e.w}-${e.l}</td><td class="muted">${esc(e.as.join("、"))}</td></tr>`).join("")}</tbody></table></div>`
          : '<div class="state">這支隊伍（含前身隊名）在 2014 年起沒有世界賽、MSI、First Stand 或電競世界盃的紀錄。</div>'}
      </section>`;
  }

  /* ---------- 路由 ---------- */
  function route() {
    const h = location.hash || "#/";
    const sect = h.startsWith("#/odds") ? "#/odds" : h.startsWith("#/record") ? "#/record" : h.startsWith("#/about") ? "#/about" : "#/";
    document.querySelectorAll(".head-nav a").forEach((a) => {
      if (a.getAttribute("href") === sect) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!D) return;
    if (h.startsWith("#/m/")) renderMatch(decodeURIComponent(h.slice(4)));
    else if (h.startsWith("#/t/")) renderTeam(decodeURIComponent(h.slice(4)));
    else if (h.startsWith("#/odds")) renderOdds();
    else if (h.startsWith("#/record")) renderRecord();
    else if (h.startsWith("#/about")) renderAbout();
    else renderSchedule();
    if (h !== "#/" && h !== "") { window.scrollTo(0, 0); document.getElementById("main").focus({ preventScroll: true }); }
  }

  async function start() {
    view.innerHTML = `<div class="state state-loading"><span class="spinner" aria-hidden="true"></span>載入賽程中…</div>`;
    try {
      D = await load();
      // teams.json 沒有 lp 名稱時補上，供交手列表判斷「當時隊名」
      Object.values(D.teams).forEach((t) => { t.lp = t.lp || t.name; });
      const up = document.getElementById("updated");
      if (up && D.meta.updated) up.textContent = `資料更新於 ${fmt(D.meta.updated, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}（台灣時間）。`;
      route();
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="state state-error"><p>資料載入失敗，可能是網路不穩。</p><button class="btn" type="button" id="retry">重新載入</button></div>`;
      document.getElementById("retry").addEventListener("click", start);
    }
  }

  window.addEventListener("hashchange", route);
  start();
})();
