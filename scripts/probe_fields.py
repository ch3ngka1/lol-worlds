import json, sys, urllib.request, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cargo import cargo, UA
out = {}
for t in ["ScoreboardGames", "ScoreboardPlayers"]:
    req = urllib.request.Request("https://lol.fandom.com/wiki/Special:CargoTables/" + t, headers={"User-Agent": UA})
    h = urllib.request.urlopen(req, timeout=60).read().decode()
    out[t] = re.findall(r"<li><span class=\"cargo-field-name\">([^<]+)</span>", h) or re.findall(r"<li>([A-Za-z0-9_]+) - ", h)
out["sample"] = cargo("ScoreboardGames", "GameId,MatchId,Team1,Team2,WinTeam,Team1Players,Team2Players,Team1Gold,Team2Gold,Gamelength_Number,Patch,N_GameInMatch,DateTime_UTC,OverviewPage",
                      where='OverviewPage="2026 Season World Championship/Play-In"', page=3, max_rows=3)
json.dump(out, open("probe-output.json", "w"), ensure_ascii=False, indent=1)
