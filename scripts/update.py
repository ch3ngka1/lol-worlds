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
    return sched, players

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

def main(offline=None):
    teams, name2code = load_teams()
    sched_rows, player_rows = offline or fetch_live()
    schedule = build_schedule(sched_rows, name2code)
    rosters = build_rosters(player_rows, name2code)
    history = json.load(open(os.path.join(DATA, "history.json"), encoding="utf-8"))["series"]
    dom_path = os.path.join(DATA, "domestic.json")
    domestic = json.load(open(dom_path, encoding="utf-8"))["series"] if os.path.exists(dom_path) else []
    ratings = compute_ratings(teams, history, schedule, domestic)
    changed = False
    changed |= write_json("schedule.json", {"matches": schedule})
    changed |= write_json("rosters.json", rosters)
    changed |= write_json("ratings.json", ratings)
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
