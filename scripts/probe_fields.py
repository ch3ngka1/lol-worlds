import json, sys, urllib.request, re, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
out = {}
try:
    from cargo import cargo, UA
except Exception:
    out["import"] = traceback.format_exc()
for t in ["ScoreboardGames", "ScoreboardPlayers"]:
    try:
        req = urllib.request.Request("https://lol.fandom.com/wiki/Special:CargoTables/" + t, headers={"User-Agent": "Mozilla/5.0 lol-worlds-fan-site"})
        h = urllib.request.urlopen(req, timeout=60).read().decode()
        i = h.find("mw-content-text"); seg = h[i:i+20000]
        out[t] = re.sub(r"<[^>]+>", " ", seg)[:3000]
    except Exception:
        out[t] = traceback.format_exc()
try:
    out["sample"] = cargo("ScoreboardGames", "GameId,MatchId,Team1,Team2,WinTeam,Team1Players,Team2Players,Team1Gold,Team2Gold,Gamelength_Number,Patch,N_GameInMatch,DateTime_UTC,OverviewPage",
                      where='OverviewPage="2026 Season World Championship/Play-In"', page=3, max_rows=3)
except Exception:
    out["sample"] = traceback.format_exc()
json.dump(out, open("probe-output.json", "w"), ensure_ascii=False, indent=1)
