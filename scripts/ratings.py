"""實力分數（選手制 Elo）。

怎麼算：
- 用 2023 年起每一局的比賽（國際賽 + LCK、LPL、LEC、LCS、LCP、CBLOL 等聯賽）。
- 每位選手各有一個分數；一局比賽中，隊伍實力 = 該局五名出場選手的平均分數。
  贏了五人一起加分、輸了一起扣分，贏強隊加得多。換人、轉隊時，分數跟著選手走。
- 國際賽（世界賽、MSI、First Stand）全額計算；電競世界盃 0.75 倍；聯賽 0.5 倍。每局 K = 8。
- 新選手以所屬隊伍當時的分數起算；2023 年以前的國際賽系列賽只用來給隊伍打底。
- 預測時：用本屆世界賽登錄名單中，每個位置最近有上場的那位選手，五人平均就是隊伍實力；
  再把「單局勝率」換算成 Bo1 / Bo3 / Bo5 的系列賽勝率。
- 參數是把 3,200 多種組合，用 2023-10～2026-10 的 275 場國際賽系列賽交叉回測挑出來的
  （前半段挑、後半段驗，反過來也驗過）。經濟差、藍紅方、每年回歸、交手修正都試過，沒有幫助所以沒用。
"""
from collections import defaultdict

K_GAME = 8
WEIGHT = {"dom": 0.5, "ewc": 0.75}
LEAGUE_NORM = {"LTA North": "LCS", "LTA South": "CBLOL"}
DOMESTIC = {"LCK", "LPL", "LEC", "LCS", "LTA", "LTA North", "LTA South", "CBLOL", "LCP", "PCS", "VCS", "LJL"}
ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]

def expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))

def kind_of(ov):
    if "World Championship" in ov: return "worlds"
    if "Mid-Season" in ov: return "msi"
    if "First Stand" in ov: return "fs"
    if ov.startswith("Esports World Cup"): return "ewc"
    lg = ov.split("/")[0]
    return "dom" if lg in DOMESTIC else None

def base(name):
    return str(name).split(" (")[0].strip().lower()

def compute_ratings(teams, history, games, rosters):
    """history：國際系列賽（舊資料暖機用）；games：每局資料（dict）；rosters：本屆登錄名單。"""
    lg = {t["code"]: t["league"] for t in teams}
    fixed = set(lg)
    T, P = {}, {}
    played = defaultdict(int)
    last_seen = {}                    # (隊伍, 選手) -> 最後上場時間
    last_lineup = {}
    games_played = defaultdict(int)   # 選手出場局數

    key = lambda c, n: c or "~" + n

    def tavg(l):
        v = [T[k] for k in T if lg.get(k) == l and played[k] > 0]
        return sum(v) / len(v) if v else 1500.0

    def ensure(k, l=None):
        if l and k not in fixed:
            lg.setdefault(k, l)
        if k not in T:
            T[k] = tavg(lg[k]) if k in lg else 1500.0

    first = min((g["dt"] for g in games), default="9999")[:10]
    ev = []
    for s in history:
        if s["date"] < first:
            ev.append((s["date"] + " 00:00", "s", s))
    for g in games:
        if kind_of(g["ov"]):
            ev.append((g["dt"], "g", g))
    ev.sort(key=lambda e: e[0])

    for dt, t, x in ev:
        if t == "s":
            a, b = key(x["c1"], x["t1"]), key(x["c2"], x["t2"])
            ensure(a); ensure(b)
            p = expected(T[a], T[b]); s = 1.0 if x["w"] == 1 else 0.0
            k = {1: 20, 3: 28, 5: 36}.get(int(x.get("bo") or 3), 28) * (0.75 if x.get("kind") == "ewc" else 1.0)
            T[a] += k * (s - p); T[b] -= k * (s - p); played[a] += 1; played[b] += 1
            continue
        kd = kind_of(x["ov"])
        l = None
        if kd == "dom":
            l = x["ov"].split("/")[0]; l = LEAGUE_NORM.get(l, l)
        a, b = key(x["c1"], x["t1"]), key(x["c2"], x["t2"])
        ensure(a, l); ensure(b, l)
        p1, p2 = [str(q) for q in x["p1"]], [str(q) for q in x["p2"]]
        for pl in p1: P.setdefault(pl, T[a])
        for pl in p2: P.setdefault(pl, T[b])
        sa = sum(P[q] for q in p1) / len(p1) if p1 else T[a]
        sb = sum(P[q] for q in p2) / len(p2) if p2 else T[b]
        s = 1.0 if x["win"] == 1 else 0.0
        d = K_GAME * WEIGHT.get(kd, 1.0) * (s - expected(sa, sb))
        T[a] += d; T[b] -= d
        for q in p1: P[q] += d; games_played[q] += 1; last_seen[(a, q)] = dt
        for q in p2: P[q] -= d; games_played[q] += 1; last_seen[(b, q)] = dt
        played[a] += 1; played[b] += 1
        if p1: last_lineup[a] = list(p1)
        if p2: last_lineup[b] = list(p2)

    out = {}
    for c in fixed:
        ensure(c)
        lineup = list(last_lineup.get(c, []))
        reg = (rosters.get(c) or {}).get("players", [])
        # 每個位置：登錄名單中、最近為這隊上場的人
        names_in_data = {}
        for (team, q), when in last_seen.items():
            if team == c:
                names_in_data.setdefault(base(q), []).append((when, q))
        chosen = []
        for i, role in enumerate(ROLES):
            cands = [pl for pl in reg if pl["role"] == role]
            best = None
            for pl in cands:
                for when, q in names_in_data.get(base(pl["page"]), []) + names_in_data.get(base(pl["name"]), []):
                    if best is None or when > best[0]:
                        best = (when, q)
            if best:
                chosen.append(best[1])
            elif i < len(lineup):
                chosen.append(lineup[i])
        if len(chosen) == 5:
            strength = sum(P.get(q, T[c]) for q in chosen) / 5
        else:
            strength = T[c]
        out[c] = {"elo": round(strength, 1),
                  "lineup": [{"name": q.split(" (")[0], "role": ROLES[i], "elo": round(P.get(q, T[c]), 1),
                              "games": games_played.get(q, 0)} for i, q in enumerate(chosen)]}
    return {"method": __doc__.strip(), "kGame": K_GAME, "teams": out}
