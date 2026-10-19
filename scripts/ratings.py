"""實力分數（Elo 制）：只用國際賽的系列賽勝負計算。

- 採計世界賽、MSI、First Stand（Riot 官方國際賽）與電競世界盃（非 Riot 官方的邀請賽，權重 0.75）。
- 每支隊伍從 1500 分起算；勝了加分、輸了扣分，贏強隊加得多。
- Bo1 / Bo3 / Bo5 的權重不同（K = 20 / 28 / 36）。
- 每到新的一年，分數往「所屬賽區平均」拉回 1/3，反映陣容變動。
- 從沒打過國際賽的隊伍，以同賽區隊伍的平均分數起算。
"""
from collections import defaultdict

K = {1: 20, 3: 28, 5: 36}
KIND_WEIGHT = {"ewc": 0.75}
BASE = 1500.0

def expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))

def compute_ratings(teams, history, schedule):
    league = {t["code"]: t["league"] for t in teams}
    r = defaultdict(lambda: BASE)            # key：隊伍代碼，或沒有對應代碼的舊隊名
    played = defaultdict(int)
    year_seen = None

    def key(code, name):
        return code or ("~" + name)

    def league_avg(lg):
        vals = [r[c] for c, l in league.items() if l == lg and played[c] > 0]
        return sum(vals) / len(vals) if vals else BASE

    def new_year():
        snapshot = {}
        for c in list(r.keys()):
            lg = league.get(c)
            target = league_avg(lg) if lg else BASE
            snapshot[c] = r[c] + (target - r[c]) / 3.0
        r.update(snapshot)

    def ensure(k):
        if k not in r and k in league and played[k] == 0:
            r[k] = league_avg(league[k])

    events = []
    for s in history:
        events.append((s["date"], key(s["c1"], s["t1"]), key(s["c2"], s["t2"]), s["w"], s.get("bo") or 3,
                       KIND_WEIGHT.get(s.get("kind"), 1.0)))
    for m in schedule:
        if m["w"] and m["c1"] and m["c2"]:
            events.append((m["time"][:10], m["c1"], m["c2"], m["w"], m.get("bo") or 3, 1.0))
    events.sort(key=lambda e: e[0])

    for date, a, b, w, bo, wt in events:
        y = date[:4]
        if year_seen and y != year_seen:
            new_year()
        year_seen = y
        ensure(a); ensure(b)
        ea = expected(r[a], r[b])
        k = K.get(int(bo), 28) * wt
        sa = 1.0 if w == 1 else 0.0
        r[a] += k * (sa - ea)
        r[b] -= k * (sa - ea)
        played[a] += 1; played[b] += 1

    # 進入 2026 年後若尚未經過年度回歸（今年沒比賽的情況已在上面處理）
    out = {}
    for c in league:
        ensure(c)
        out[c] = {"elo": round(r[c], 1), "intlSeries": played[c]}
    return {"method": __doc__.strip(), "teams": out}
