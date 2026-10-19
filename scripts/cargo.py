"""Leaguepedia Cargo 查詢小工具：放慢速度、遇到限流自動等待重試。"""
import json, time, urllib.parse, urllib.request

API = "https://lol.fandom.com/api.php"
UA = "lol-worlds-fan-site/1.0 (https://github.com/ch3ngka1/lol-worlds)"
GAP = 12          # 每次請求至少間隔秒數
_last = [0.0]

def _get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(8):
        wait = GAP - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
        except Exception as e:  # 網路錯誤
            data = {"error": {"code": "net", "info": str(e)}}
        err = data.get("error")
        if not err:
            return data
        backoff = min(30 * (2 ** attempt), 300)
        print(f"  ! {err.get('code')} -> 等 {backoff}s 再試", flush=True)
        time.sleep(backoff)
    raise RuntimeError("Leaguepedia 一直限流或錯誤，放棄這次")

def cargo(tables, fields, where="", join_on="", order_by="", group_by="", page=500, max_rows=20000):
    rows, offset = [], 0
    while True:
        p = {"action": "cargoquery", "format": "json", "tables": tables, "fields": fields,
             "limit": page, "offset": offset}
        if where: p["where"] = where
        if join_on: p["join_on"] = join_on
        if order_by: p["order_by"] = order_by
        if group_by: p["group_by"] = group_by
        data = _get(p)
        batch = [x["title"] for x in data.get("cargoquery", [])]
        rows += batch
        if len(batch) < page or len(rows) >= max_rows:
            return rows
        offset += page
