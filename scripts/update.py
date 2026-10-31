"""每小時執行：抓 2026 世界賽賽程、比分、選手名單，重算實力分數。"""
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, WORLDS, load_teams, event_label, series_result, write_json
from ratings import compute_ratings

ROLE_ORDER = {"Top": 0, "Jungle": 1, "Mid": 2, "Bot": 3, "Support": 4}

def fetch_live():
    from cargo import cargo
    sched = cargo("MatchSchedule",
        "Team1,Team2,Team1Score,Team2Score,Winner,DateTime_UTC,BestOf,Tab,OverviewPage,MatchId",
        where=f'OverviewPage LIKE "{WORLDS}%"', order_by="DateTime_UTC", page=500)
    players = cargo("TournamentPlayers", "Team,Link,Role,OverviewPage",
        where=f'OverviewPage LIKE "{WORLDS}%"', page=500)
    from build_games import FIELDS, compact
    live_games = compact(cargo("ScoreboardGames", FIELDS, where=f'OverviewPage LIKE "{WORLDS}%"',
                               order_by="DateTime_UTC", page=500))
    return sched, players, live_games

def load_games(live):
    """data/games.json（2023 起每局）＋ 本屆世界賽即時每局資料，依 GameId 去重。"""
    path = os.path.join(DATA, "games.json")
    G = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"cols": [], "games": []}
    cols = G["cols"] or ["id", "match", "ov", "dt", "t1", "t2", "c1", "c2", "win", "p1", "p2", "g1", "g2", "len", "patch"]
    rows = {g[0]: g for g in G["games"]}
    for g in live or []:
        rows[g[0]] = g
    return [dict(zip(cols, g)) for g in rows.values()]

def build_schedule(rows, name2code):
    out = []
    for m in rows:
        ev, st, _ = event_label(m["OverviewPage"])
        r = series_result(m)
        c1 = name2code.get(m["Team1"]); c2 = name2code.get(m["Team2"])
        out.append({
            "id": m["MatchId"].split("/")[-1].replace(" ", "-"),
            "stage": st, "round": m.get("Tab") or "",
            "time": (m.get("DateTime UTC") or "").replace(" ", "T") + "Z",
            "bo": m.get("BestOf"),
            "c1": c1, "c2": c2,
            "s1": r[0] if r else m.get("Team1Score"), "s2": r[1] if r else m.get("Team2Score"),
            "w": r[2] if r else None,
            "live": (not r) and m.get("Team1Score") not in (None, "") and m.get("Team2Score") not in (None, ""),
        })
    return out

def build_rosters(rows, name2code):
    by = {}
    for p in rows:
        code = name2code.get(p["Team"])
        if not code:
            continue
        stage = (p.get("OverviewPage") or "").split("/")[-1]
        link = str(p["Link"])
        role = p.get("Role") or ""
        entry = {"name": link.split(" (")[0], "page": link, "role": role}
        t = by.setdefault(code, {"stage": stage, "players": [], "staff": []})
        # 同一隊在入圍賽與主賽事都有名單時，以主賽事為準
        if stage == "Main Event" and t["stage"] != "Main Event":
            t.update(stage=stage, players=[], staff=[])
        if stage != t["stage"]:
            continue
        key = "players" if role in ROLE_ORDER else "staff"
        if all(e["page"] != link for e in t[key]):
            t[key].append(entry)
    for t in by.values():
        t["players"].sort(key=lambda e: (ROLE_ORDER.get(e["role"], 9), e["name"].lower()))
        t["staff"].sort(key=lambda e: e["name"].lower())
    return by

STAGE_ZH = [("Rounds 1-2", "例行賽第 1-2 輪"), ("Rounds 3-4", "例行賽第 3-4 輪"), ("Road to MSI", "MSI 資格賽"),
            ("Season Play-In", "季後賽入圍賽"), ("Season Playoffs", "季後賽"), ("Grand Finals", "總決賽"),
            ("Regional Finals", "世界賽資格賽"), ("Spring Playoffs", "春季季後賽"), ("Summer Playoffs", "夏季季後賽"),
            ("Versus Playoffs", "Versus 季後賽"), ("Spring Season", "春季賽"), ("Summer Season", "夏季賽"),
            ("Versus Season", "Versus 賽季"), ("Lock-In", "Lock-In 盃賽"), ("Cup", "盃賽"), ("Promotion", "升降級賽")]

def stage_zh(ov):
    st = ov.split("/", 2)[-1] if ov.count("/") >= 2 else ov
    for en, zh in STAGE_ZH:
        if st == en:
            return zh
    import re
    m = re.match(r"Split (\d+)( Playoffs)?$", st)
    if m:
        return f"第 {m.group(1)} 賽段" + ("季後賽" if m.group(2) else "")
    return st

def build_league_h2h(games, league, year="2026"):
    """今年同賽區隊伍在自家聯賽的系列賽交手（依每局資料彙整）。"""
    from ratings import kind_of
    series = {}
    for g in games:
        if not g["dt"].startswith(year) or kind_of(g["ov"]) != "dom":
            continue
        a, b = g["c1"], g["c2"]
        if not a or not b or league.get(a) != league.get(b):
            continue
        k = g["match"] or g["id"]
        s = series.setdefault(k, {"date": g["dt"][:10], "league": g["ov"].split("/")[0], "stage": stage_zh(g["ov"]),
                                  "c1": min(a, b), "c2": max(a, b), "s1": 0, "s2": 0})
        s["date"] = min(s["date"], g["dt"][:10])
        winner = a if g["win"] == 1 else b
        if winner == s["c1"]: s["s1"] += 1
        else: s["s2"] += 1
    out = {}
    for s in sorted(series.values(), key=lambda x: x["date"], reverse=True):
        out.setdefault(s["c1"] + "|" + s["c2"], []).append(s)
    return out

SPREAD = 1.25   # 回測：實際比賽比「每局獨立」更容易一面倒，所以排比數時把單局勝率拉開一點

def score_dist(g, bo, p_series):
    """各比數的機率（以 a 隊角度，鍵如 "2-0"、"1-2"）。
    比數的形狀用拉開後的單局勝率計算，再把 a 勝、b 勝兩邊分別縮放回原本的系列賽勝率，讓兩個數字一致。"""
    import math
    gs = 1 / (1 + math.exp(-SPREAD * math.log(g / (1 - g))))
    need = bo // 2 + 1
    a_side = {f"{need}-{j}": math.comb(need - 1 + j, j) * gs ** need * (1 - gs) ** j for j in range(need)}
    b_side = {f"{j}-{need}": math.comb(need - 1 + j, j) * (1 - gs) ** need * gs ** j for j in range(need)}
    ta, tb = sum(a_side.values()), sum(b_side.values())
    out = {k: v / ta * p_series for k, v in a_side.items()}
    out.update({k: v / tb * (1 - p_series) for k, v in b_side.items()})
    return out

def main(offline=None):
    teams, name2code = load_teams()
    sched_rows, player_rows, live_games = offline or fetch_live()
    schedule = build_schedule(sched_rows, name2code)
    rosters = build_rosters(player_rows, name2code)
    history = json.load(open(os.path.join(DATA, "history.json"), encoding="utf-8"))["series"]
    all_games = load_games(live_games)
    ratings = compute_ratings(teams, history, all_games, rosters)
    write_json("league_h2h.json", build_league_h2h(all_games, {t["code"]: t["league"] for t in teams}))
    changed = False
    changed |= write_json("schedule.json", {"matches": schedule})
    changed |= write_json("rosters.json", rosters)
    changed |= write_json("ratings.json", ratings)
    # 晉級機率
    from sim import simulate, series_prob
    from ratings import expected
    elo = {c: v["elo"] for c, v in ratings["teams"].items()}
    odds = simulate(schedule, elo)
    if odds:
        changed |= write_json("odds.json", odds)
    # 賽前勝率紀錄：開打前每小時覆寫，開打後凍結
    pred_path = os.path.join(DATA, "predictions.json")
    preds = json.load(open(pred_path, encoding="utf-8")) if os.path.exists(pred_path) else {}
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for m in schedule:
        if m["c1"] and m["c2"] and m["time"] > now and not m["w"]:
            g = expected(elo[m["c1"]], elo[m["c2"]])
            ps = min(.97, max(.03, series_prob(g, int(m["bo"] or 1))))
            new = {"a": m["c1"], "b": m["c2"], "bo": m["bo"], "game": round(g, 4), "p": round(ps, 4)}
            if int(m["bo"] or 1) > 1:
                new["scores"] = {k: round(v, 4) for k, v in score_dist(g, int(m["bo"]), ps).items()}
            old = preds.get(m["id"], {})
            if {k: old.get(k) for k in new} != new:
                preds[m["id"]] = dict(new, at=now)
    changed |= write_json("predictions.json", preds)
    # 隊伍國際賽成績（依賽事彙總）
    summary = {}
    for s_ in history:
        for side, other in ((1, 2), (2, 1)):
            c = s_["c%d" % side]
            if not c: continue
            e = summary.setdefault(c, {}).setdefault(s_["event"], {"w": 0, "l": 0, "names": set()})
            e["w" if s_["w"] == side else "l"] += 1; e["names"].add(s_["t%d" % side])
    team_hist = {c: [{"event": k, "w": v["w"], "l": v["l"], "as": sorted(v["names"])} for k, v in sorted(evs.items(), reverse=True)]
                 for c, evs in summary.items()}
    changed |= write_json("team_history.json", team_hist)
    codes = {t["code"] for t in teams}
    h2h = [x for x in history if x["c1"] in codes and x["c2"] in codes and x["c1"] != x["c2"]]
    changed |= write_json("h2h.json", {"series": h2h})
    changed |= write_json("teams.json", {t["code"]: {"name": t["name"], "lp": t["lp"], "league": t["league"],
                                         "seed": t.get("seed"), "qualified": t.get("qualified"),
                                         "lineage": t["lineage"]} for t in teams})
    if changed or not os.path.exists(os.path.join(DATA, "meta.json")):
        write_json("meta.json", {"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    print("matches:", len(schedule), "rosters:", len(rosters), "changed:", changed)

if __name__ == "__main__":
    main()
