/* 2026 LoL 世界賽分析 — 前端（無框架、無建置步驟） */
(() => {
  "use strict";

  const TZ = "Asia/Taipei";
  const FILES = ["meta", "teams", "schedule", "rosters", "ratings", "h2h"];
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
    const res = await Promise.all(FILES.map((f) =>
      fetch(`data/${f}.json${bust}`).then((r) => { if (!r.ok) throw new Error(`${f}.json ${r.status}`); return r.json(); })));
    const d = Object.fromEntries(FILES.map((f, i) => [f, res[i]]));
    d.matches = d.schedule.matches;
    d.series = d.h2h.series;
    return d;
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
  function predict(a, b) {
    const ra = D.ratings.teams[a].elo, rb = D.ratings.teams[b].elo;
    const base = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const now = Date.now();
    let net = 0, tot = 0;
    headToHead(a, b).rows.forEach((s) => {
      const years = (now - Date.parse(s.date)) / (365.25 * 864e5);
      const w = Math.pow(0.5, years / 2);       // 每 2 年權重減半
      const aWon = (s.w === 1) === (s.c1 === a);
      net += aWon ? w : -w; tot += w;
    });
    const adj = 0.12 * net / (tot + 2);           // 最多約 ±12%，交手越少影響越小
    const p = Math.min(0.95, Math.max(0.05, base + adj));
    return { p, base, adj, ra, rb };
  }

  /* ---------- 共用片段 ---------- */
  function sideHTML(code, align, state) {
    const t = team(code);
    if (!t) return `<div class="side ${align} tbd"><span class="names"><span class="code">待定</span></span></div>`;
    const dot = `<span class="dot ${lgClass(code)}" aria-hidden="true"></span>`;
    const names = `<span class="names"><span class="code">${esc(code)}</span><span class="full">${esc(t.name)}</span></span>`;
    return `<div class="side ${align} ${state || ""}">${align === "right" ? names + dot : dot + names}</div>`;
  }

  function matchRow(m) {
    const done = isDone(m);
    const s1 = done ? (m.w === 1 ? "won" : "lost") : "", s2 = done ? (m.w === 2 ? "won" : "lost") : "";
    const score = done
      ? `<div class="score" aria-label="比分 ${m.s1} 比 ${m.s2}">${m.s1 ?? ""}<span class="vs"> : </span>${m.s2 ?? ""}<small>Bo${m.bo}・已結束</small></div>`
      : `<div class="score"><span class="vs">vs</span><small>Bo${m.bo}</small></div>`;
    let extra = "";
    if (!done && known(m)) {
      const p = predict(m.c1, m.c2).p;
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
    const rows = r.players.map((p) => `<tr><th scope="row">${ROLE[p.role] || esc(p.role)}</th>
      <td><a href="https://lol.fandom.com/wiki/${encodeURIComponent(p.page.replace(/ /g, "_"))}" rel="noopener">${esc(p.name)}</a></td></tr>`).join("");
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
      probBlock = `<div class="panel"><p style="margin:0">這場已經打完，由 <b>${esc(winner)}</b> 以 ${Math.max(m.s1, m.s2)}:${Math.min(m.s1, m.s2)} 獲勝。</p>
        <p class="note">打完的比賽不再顯示勝率，因為實力分數已經把這場結果算進去了。</p></div>`;
    } else {
      const P = predict(a, b);
      const adjTxt = Math.abs(P.adj) < 0.005 ? "無明顯影響" : `${P.adj > 0 ? a : b} +${Math.abs(pct(P.adj))}%`;
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
          <li><b>國際賽實力分數</b><span class="val">${Math.round(P.ra)} : ${Math.round(P.rb)}</span>
            <span class="why">依兩隊（含前身隊名）在世界賽、MSI 每場系列賽勝負計算，本屆結果也會即時算進去。只看這項是 ${esc(a)} ${pct(P.base)}%。${ra.intlSeries < 10 || rb.intlSeries < 10 ? "其中一隊國際賽經驗少，分數主要參考同賽區隊伍的平均，誤差較大。" : ""}</span></li>
          <li><b>過去交手修正</b><span class="val">${esc(adjTxt)}</span>
            <span class="why">${h.rows.length ? `${h.rows.length} 次交手，越久以前的比賽影響越小（每 2 年減半）。` : "兩隊從未在國際賽交手，不做修正。"}</span></li>
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
            <span class="ev">${esc(s.event)}<br>${esc(s.stage || "")}${roundZh(s.round) ? "・" + esc(roundZh(s.round)) : ""}</span>
            <span class="teams"><span class="${aWon ? "w" : ""}">${esc(a)}</span> vs <span class="${aWon ? "" : "w"}">${esc(b)}</span>
              <span class="old">${esc(s.date)}・Bo${esc(s.bo || "?")}</span>${oldTxt}</span>
            <span class="sc" aria-label="${esc(a)} ${as} 比 ${bs}">${as ?? "-"}:${bs ?? "-"}</span></li>`;
        }).join("")}</ul>
        <p class="note">2014 年起的世界賽與 MSI。顏色較淡的是 4 年以上的舊紀錄，陣容多半已大不相同。</p>
      </div>` : `<div class="state">兩隊（含前身隊名）從 2014 年起，從未在世界賽或 MSI 交手過。</div>`;

    const hero = (code, side) => {
      const t = team(code);
      const st = done ? ((m.w === 1) === (side === 1) ? "won" : "lost") : "";
      return `<div class="hero-team ${st}"><div class="code">${esc(code)}</div><div class="full">${esc(t.name)}</div>
        <div class="league"><span class="dot ${lgClass(code)}" aria-hidden="true"></span>${esc(LEAGUE_ZH[t.league] || t.league)}</div></div>`;
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
      <section class="section"><h2>國際賽交手紀錄 <small>世界賽・MSI</small></h2>${h2hBlock}</section>
      <section class="section"><h2>本屆戰績</h2>
        <div class="panel"><div class="rosters">
          <div><b>${esc(a)}</b>　${formHTML(a)}</div><div><b>${esc(b)}</b>　${formHTML(b)}</div>
        </div></div></section>
      <section class="section"><h2>選手名單 <small>本屆登錄名單</small></h2>
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
      <p>範圍是 2014 年起的世界賽與 MSI（含入圍賽），加上本屆已打完的比賽。單位是「系列賽」，例如 Bo5 打 3:1 算一次勝利。</p>
      <p>隊伍改名、品牌更換、被收購時，舊隊名的戰績會算進現在的隊伍，依據是 Leaguepedia 記錄的隊伍沿革。單純買下聯賽席位、隊伍本身沒有延續的情況不算。列表裡會標出當時的隊名，方便你自己判斷。</p>
      <ul>${lineage}</ul>
      <h2>勝率參考怎麼算</h2>
      <p>主要依據是「國際賽實力分數」（Elo 制）：每支隊伍從 1500 分起算，在世界賽、MSI 贏了加分、輸了扣分，贏強隊加得多、輸弱隊扣得多；Bo5 的影響比 Bo1 大。每到新的一年，分數會往所屬賽區平均拉回三分之一，反映陣容變動。從沒打過國際賽的隊伍，以同賽區隊伍的平均起算。</p>
      <p>再用兩隊過去的交手紀錄做小幅修正（最多約 ±12%），越久以前的交手影響越小。最後結果限制在 5%～95% 之間。</p>
      <p>這只是根據過去勝負算出的參考值，沒有考慮版本、選手狀態、陣容異動，請不要當成真正的預測。</p>
      <h2>聲明</h2>
      <p>本站為粉絲自製的非營利網站，與 Riot Games 及各戰隊無關，不使用 Riot 或戰隊的商標與 logo。</p>
      <p lang="en">2026 LoL Worlds Analysis was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.</p>
      <p>原始碼：<a href="https://github.com/ch3ngka1/lol-worlds" rel="noopener">github.com/ch3ngka1/lol-worlds</a></p>
    </article>`;
  }

  /* ---------- 路由 ---------- */
  function route() {
    const h = location.hash || "#/";
    document.querySelectorAll(".head-nav a").forEach((a) => {
      const on = (a.getAttribute("href") === "#/about") === h.startsWith("#/about");
      a.toggleAttribute("aria-current", on); if (on) a.setAttribute("aria-current", "page");
    });
    if (!D) return;
    if (h.startsWith("#/m/")) renderMatch(decodeURIComponent(h.slice(4)));
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
