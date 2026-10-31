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
    """回傳 (賽事名稱, 階段, 種類)。種類：worlds / msi / fs（First Stand）/ ewc（電競世界盃）"""
    m = re.match(r"(\d{4}) (Season World Championship|Mid-Season Invitational|First Stand)(?:/(.*))?", overview)
    if m:
        year, kind, stage = m.groups()
        k = {"Season World Championship": "worlds", "Mid-Season Invitational": "msi", "First Stand": "fs"}[kind]
        ev = f"{year} " + {"worlds": "世界賽", "msi": "MSI", "fs": "First Stand"}[k]
    else:
        m = re.match(r"Esports World Cup (\d{4})(?:/(.*))?", overview)
        if not m:
            return overview, "", "other"
        year, stage = m.groups()
        k, ev = "ewc", f"{year} 電競世界盃"
    st = {"Play-In": "入圍賽", "Main Event": "主賽事"}.get(stage or "", stage or "")
    return ev, st, k

def series_result(m):
    """回傳 (s1, s2, winner) 或 None（還沒打）。"""
    s1, s2, w = m.get("Team1Score"), m.get("Team2Score"), m.get("Winner")
    try:
        w = int(w) if w not in (None, "") else None
    except ValueError:
        w = None
    s1 = int(s1) if s1 not in (None, "") else None
    s2 = int(s2) if s2 not in (None, "") else None
    try:
        bo = int(m.get("BestOf") or 0)
    except ValueError:
        bo = 0
    need = bo // 2 + 1 if bo else None
    # 只有某一隊拿到足夠勝場（Bo3 要 2 勝、Bo5 要 3 勝）才算結束；
    # Leaguepedia 在比賽進行中會先填目前比分（例如 1:0），不能當成已經分出勝負。
    if w is None and s1 is not None and s2 is not None and s1 != s2:
        if need is None or max(s1, s2) >= need:
            w = 1 if s1 > s2 else 2
    if w in (1, 2) and need and s1 is not None and s2 is not None and max(s1, s2) < need:
        w = None   # 勝方欄位提前被填、但比分還不夠時，也視為進行中
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
