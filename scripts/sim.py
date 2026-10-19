"""晉級與奪冠機率：用目前的實力分數，把本屆剩下的比賽模擬很多次。
瑞士輪：同戰績互抽、避免重複交手；決定晉級或淘汰的比賽打 Bo3，其餘 Bo1。
淘汰賽：3-0 的隊伍抽 3-2 的隊伍，其餘隨機；全部 Bo5。
（實際抽籤還有其他規則，例如同賽區迴避，這裡簡化處理。）"""
import random
from collections import defaultdict
from ratings import expected

def series_prob(p, bo):
    from math import comb
    need = bo // 2 + 1
    return sum(comb(need - 1 + j, j) * p ** need * (1 - p) ** j for j in range(need))

def simulate(schedule, elo, n=20000, seed=2026):
    rnd = random.Random(seed)
    main = [m for m in schedule if m["stage"] == "主賽事"]
    swiss = defaultdict(list); ko = defaultdict(list)
    for m in main:
        r = m["round"]
        if r.startswith("Round"):
            swiss[int(r.split()[-1])].append(m)
        else:
            ko[r].append(m)
    teams = sorted({c for m in swiss[1] for c in (m["c1"], m["c2"]) if c})
    if len(teams) != 16:
        return None
    cache = {}
    def win_p(a, b, bo):
        k = (a, b, bo)
        if k not in cache:
            cache[k] = series_prob(expected(elo[a], elo[b]), bo)
        return cache[k]
    def play(a, b, bo):
        return a if rnd.random() < win_p(a, b, bo) else b

    cnt = {t: defaultdict(int) for t in teams}
    for _ in range(n):
        W = dict.fromkeys(teams, 0); L = dict.fromkeys(teams, 0); met = set()
        for r in range(1, 6):
            active = [t for t in teams if W[t] < 3 and L[t] < 3]
            paired = set(); games = []
            for m in swiss.get(r, []):
                if m["c1"] and m["c2"]:
                    games.append((m["c1"], m["c2"], m))
                    paired |= {m["c1"], m["c2"]}
            pools = defaultdict(list)
            for t in active:
                if t not in paired:
                    pools[(W[t], L[t])].append(t)
            for pool in pools.values():
                for _try in range(30):
                    rnd.shuffle(pool)
                    pairs = [(pool[i], pool[i + 1]) for i in range(0, len(pool) - 1, 2)]
                    if all(frozenset(p) not in met for p in pairs):
                        break
                games += [(a, b, None) for a, b in pairs]
            for a, b, m in games:
                if m and m["w"]:
                    w = m["c1"] if m["w"] == 1 else m["c2"]
                else:
                    deciding = W[a] == 2 or L[a] == 2
                    bo = (m and m.get("bo")) or (3 if deciding else 1)
                    w = play(a, b, int(bo))
                lo = b if w == a else a
                W[w] += 1; L[lo] += 1; met.add(frozenset((a, b)))
        adv = [t for t in teams if W[t] >= 3]
        for t in teams:
            cnt[t]["rec_%d-%d" % (min(W[t], 3), min(L[t], 3))] += 1
        for t in adv:
            cnt[t]["qf"] += 1
        # 淘汰賽
        qf_known = [(m["c1"], m["c2"], m) for m in ko.get("Quarterfinals", []) if m["c1"] and m["c2"]]
        if len(qf_known) == 4:
            qf = qf_known
        else:
            a30 = [t for t in adv if L[t] == 0]; a32 = [t for t in adv if L[t] == 2]; a31 = [t for t in adv if L[t] == 1]
            rnd.shuffle(a30); rnd.shuffle(a32); rnd.shuffle(a31)
            qf = []
            while a30 and a32:
                qf.append((a30.pop(), a32.pop(), None))
            rest = a30 + a31 + a32; rnd.shuffle(rest)
            qf += [(rest[i], rest[i + 1], None) for i in range(0, len(rest) - 1, 2)]
        def run_round(pairs):
            out = []
            for a, b, m in pairs:
                w = (m["c1"] if m["w"] == 1 else m["c2"]) if (m and m["w"]) else play(a, b, 5)
                out.append(w)
            return out
        sfw = run_round(qf)
        for t in sfw: cnt[t]["sf"] += 1
        sf_known = [(m["c1"], m["c2"], m) for m in ko.get("Semifinals", []) if m["c1"] and m["c2"]]
        sf = sf_known if len(sf_known) == 2 else [(sfw[0], sfw[1], None), (sfw[2], sfw[3], None)]
        fw = run_round(sf)
        for t in fw: cnt[t]["final"] += 1
        f_known = [(m["c1"], m["c2"], m) for m in ko.get("Finals", []) if m["c1"] and m["c2"]]
        champ = run_round(f_known if f_known else [(fw[0], fw[1], None)])[0]
        cnt[champ]["champ"] += 1
    out = {}
    for t in teams:
        c = cnt[t]
        out[t] = {k: round(v / n, 4) for k, v in c.items()}
        for k in ("qf", "sf", "final", "champ"):
            out[t].setdefault(k, 0.0)
    return {"n": n, "note": __doc__.strip(), "teams": out}
