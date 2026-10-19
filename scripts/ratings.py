"""實力分數（Elo 制）：國際賽 + 各隊所屬聯賽的系列賽勝負一起計算。

- 國際賽：世界賽、MSI、First Stand 全額計算；電競世界盃（非 Riot 官方）算 0.75 倍。
- 聯賽：LCK、LPL、LEC、LCS、LCP、CBLOL 等 2023 年起的比賽，算 0.5 倍。
  聯賽比賽讓同賽區隊伍拉開差距；國際賽決定各賽區之間誰強。
- 每支隊伍從 1500 分起算（新隊伍以同賽區平均起算）；勝了加分、輸了扣分，贏強隊加得多。
- Bo1 / Bo3 / Bo5 的基本權重不同（K = 20 / 28 / 36）。
- 參數（聯賽 0.5 倍、不做年度回歸）是用 2023-10～2025-06 的國際賽回測挑選，
  再用 2025-07 之後的國際賽驗證過，比只看國際賽準。
"""
from collections import defaultdict

K = {1: 20, 3: 28, 5: 36}
KIND_WEIGHT = {"ewc": 0.75, "dom": 0.5}
BASE = 1500.0
LEAGUE_NORM = {"LTA North": "LCS", "LTA South": "CBLOL"}

def expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))

def compute_ratings(teams, history, schedule, domestic=()):
    lg = {t["code"]: t["league"] for t in teams}
    fixed = set(lg)
    r = {}
    played = defaultdict(int)
    intl = defaultdict(int)

    def key(code, name):
        return code or ("~" + name)

    def league_avg(l):
        vals = [r[k] for k in r if lg.get(k) == l and played[k] > 0]
        return sum(vals) / len(vals) if vals else BASE

    def ensure(k, l=None):
        if l and k not in fixed:
            lg.setdefault(k, l)
        if k not in r:
            r[k] = league_avg(lg[k]) if k in lg else BASE

    events = []
    for s in history:
        events.append((s["date"], 1, key(s["c1"], s["t1"]), key(s["c2"], s["t2"]), s["w"],
                       s.get("bo") or 3, s.get("kind") or "worlds", None))
    for m in schedule:
        if m["w"] and m["c1"] and m["c2"]:
            events.append((m["time"][:10], 1, m["c1"], m["c2"], m["w"], m.get("bo") or 3, "worlds", None))
    for s in domestic:
        events.append((s["date"], 0, key(s["c1"], s["t1"]), key(s["c2"], s["t2"]), s["w"],
                       s.get("bo") or 3, "dom", LEAGUE_NORM.get(s["league"], s["league"])))
    events.sort(key=lambda e: (e[0], e[1]))   # 同一天先算聯賽、再算國際賽

    for date, is_intl, a, b, w, bo, kind, l in events:
        ensure(a, l); ensure(b, l)
        p = expected(r[a], r[b])
        k = K.get(int(bo), 28) * KIND_WEIGHT.get(kind, 1.0)
        s = 1.0 if w == 1 else 0.0
        r[a] += k * (s - p)
        r[b] -= k * (s - p)
        played[a] += 1; played[b] += 1
        if is_intl:
            intl[a] += 1; intl[b] += 1

    out = {}
    for c in fixed:
        ensure(c)
        out[c] = {"elo": round(r[c], 1), "intlSeries": intl[c], "allSeries": played[c]}
    return {"method": __doc__.strip(), "teams": out}
