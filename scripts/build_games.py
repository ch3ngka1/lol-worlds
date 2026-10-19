"""一次性：抓 2023 年起國際賽與各主要聯賽的「每一局」資料（藍紅方、勝方、經濟、時間、出場選手、版本）。
Team1 = 藍方，Team2 = 紅方（Leaguepedia ScoreboardGames 慣例）。輸出 data/games.json。"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cargo import cargo
from common import load_teams, write_json
from build_history import DOMESTIC

FIELDS = ("GameId,MatchId,OverviewPage,Team1,Team2,WinTeam,Team1Players,Team2Players,"
          "Team1Gold,Team2Gold,Gamelength_Number,Patch,DateTime_UTC")
INTL = ['OverviewPage LIKE "%Season World Championship%"', 'OverviewPage LIKE "%Mid-Season Invitational%"',
        'OverviewPage LIKE "%First Stand%"', 'OverviewPage LIKE "Esports World Cup%"']

def where(since="2022-12-01", until=None):
    pats = INTL + [f'OverviewPage LIKE "{l}/%"' for l in DOMESTIC]
    w = f'({" OR ".join(pats)}) AND OverviewPage NOT LIKE "%Qualifier%" AND OverviewPage NOT LIKE "%Showmatch%" AND DateTime_UTC >= "{since}"'
    if until:
        w += f' AND DateTime_UTC < "{until}"'
    return w

def compact(rows):
    _, name2code = load_teams()
    out = []
    for g in rows:
        t1, t2, wt = g.get("Team1"), g.get("Team2"), g.get("WinTeam")
        if not t1 or not t2 or wt not in (t1, t2):
            continue
        ov = g.get("OverviewPage") or ""
        def num(x):
            try: return float(x)
            except (TypeError, ValueError): return None
        out.append([g["GameId"], g.get("MatchId"), ov, (g.get("DateTime UTC") or "")[:16],
                    t1, t2, name2code.get(t1), name2code.get(t2), 1 if wt == t1 else 2,
                    g.get("Team1Players") or [], g.get("Team2Players") or [],
                    num(g.get("Team1Gold")), num(g.get("Team2Gold")), num(g.get("Gamelength Number")), g.get("Patch")])
    return out

COLS = ["id", "match", "ov", "dt", "t1", "t2", "c1", "c2", "win", "p1", "p2", "g1", "g2", "len", "patch"]

if __name__ == "__main__":
    rows = []
    # 分年抓，避免單一查詢過大
    for a, b in [("2022-12-01", "2024-01-01"), ("2024-01-01", "2025-01-01"), ("2025-01-01", "2026-01-01"), ("2026-01-01", None)]:
        part = cargo("ScoreboardGames", FIELDS, where=where(a, b), order_by="DateTime_UTC", page=500, max_rows=50000)
        print(a, len(part), flush=True)
        rows += part
    games = compact(rows)
    write_json("games.json", {"cols": COLS, "note": "Team1/p1 = 藍方", "games": games})
    print("games", len(games))
