"""一次性：整理 2014 年起所有世界賽、MSI、First Stand、電競世界盃的系列賽結果（不含 2026 世界賽，那部分由 update.py 即時抓）。"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cargo import cargo
from common import WORLDS, load_teams, event_label, series_result, write_json

def fetch():
    return cargo("MatchSchedule",
        "Team1,Team2,Team1Score,Team2Score,Winner,DateTime_UTC,BestOf,Tab,OverviewPage,MatchId",
        where='(OverviewPage LIKE "%Season World Championship%" OR OverviewPage LIKE "%Mid-Season Invitational%" '
              'OR OverviewPage LIKE "%First Stand%" OR OverviewPage LIKE "Esports World Cup%") '
              'AND OverviewPage NOT LIKE "%Qualifier%" AND OverviewPage NOT LIKE "%Showmatch%" '
              f'AND OverviewPage NOT LIKE "{WORLDS}%"',
        order_by="DateTime_UTC", page=500)

def build(rows):
    _, name2code = load_teams()
    out = []
    for m in rows:
        r = series_result(m)
        if not r:
            continue
        s1, s2, w = r
        ev, st, kind = event_label(m["OverviewPage"])
        out.append({
            "date": (m.get("DateTime UTC") or "")[:10],
            "event": ev, "stage": st, "kind": kind, "round": m.get("Tab") or "",
            "bo": m.get("BestOf"),
            "t1": m["Team1"], "t2": m["Team2"],
            "c1": name2code.get(m["Team1"]), "c2": name2code.get(m["Team2"]),
            "s1": s1, "s2": s2, "w": w,
        })
    return out

DOMESTIC = ["LCK", "LPL", "LEC", "LCS", "LTA", "LTA North", "LTA South", "CBLOL", "LCP", "PCS", "VCS", "LJL"]

def fetch_domestic(since="2022-12-01"):
    """各主要聯賽（含季後賽、資格賽）的系列賽，用來補強實力分數。"""
    like = " OR ".join(f'OverviewPage LIKE "{l}/%"' for l in DOMESTIC)
    return cargo("MatchSchedule",
        "Team1,Team2,Team1Score,Team2Score,Winner,DateTime_UTC,BestOf,OverviewPage",
        where=f'({like}) AND DateTime_UTC >= "{since}"',
        order_by="DateTime_UTC", page=500)

def build_domestic(rows):
    _, name2code = load_teams()
    out = []
    for m in rows:
        r = series_result(m)
        if not r or not m.get("Team1") or not m.get("Team2"):
            continue
        out.append({"date": (m.get("DateTime UTC") or "")[:10], "league": m["OverviewPage"].split("/")[0],
                    "bo": m.get("BestOf"), "t1": m["Team1"], "t2": m["Team2"],
                    "c1": name2code.get(m["Team1"]), "c2": name2code.get(m["Team2"]),
                    "s1": r[0], "s2": r[1], "w": r[2]})
    return out

if __name__ == "__main__":
    rows = fetch()
    series = build(rows)
    write_json("history.json", {"source": "Leaguepedia MatchSchedule", "series": series})
    print("history series:", len(series))
    dom = build_domestic(fetch_domestic())
    write_json("domestic.json", {"source": "Leaguepedia MatchSchedule", "series": dom})
    print("domestic series:", len(dom))
