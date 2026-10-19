import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
WORLDS = "2026 Season World Championship"

def load_teams():
    t = json.load(open(os.path.join(ROOT, "scripts", "teams.json"), encoding="utf-8"))["teams"]
    name2code = {}
    for x in t:
        name2code[x["lp"]] = x["code"]
        for n, _ in x["lineage"]:
            name2code[n] = x["code"]
    return t, name2code

def event_label(overview):
    """'2019 Season World Championship/Main Event' -> ('2019 世界賽', '主賽事')"""
    m = re.match(r"(\d{4}) (Season World Championship|Mid-Season Invitational)(?:/(.*))?", overview)
    if not m:
        return overview, ""
    year, kind, stage = m.groups()
    ev = f"{year} {'世界賽' if 'World' in kind else 'MSI'}"
    st = {"Play-In": "入圍賽", "Main Event": "主賽事"}.get(stage or "", stage or "")
    return ev, st

def series_result(m):
    """回傳 (s1, s2, winner) 或 None（還沒打）。"""
    s1, s2, w = m.get("Team1Score"), m.get("Team2Score"), m.get("Winner")
    try:
        w = int(w) if w not in (None, "") else None
    except ValueError:
        w = None
    s1 = int(s1) if s1 not in (None, "") else None
    s2 = int(s2) if s2 not in (None, "") else None
    if w is None and s1 is not None and s2 is not None and s1 != s2:
        w = 1 if s1 > s2 else 2
    if w not in (1, 2):
        return None
    return s1, s2, w

def write_json(name, obj):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    new = json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False)
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old != new:
        open(path, "w", encoding="utf-8").write(new)
        return True
    return False
