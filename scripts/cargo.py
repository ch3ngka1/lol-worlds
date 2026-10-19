"""Leaguepedia 資料抓取：用 Special:CargoExport（匯出頁），放慢速度、失敗自動重試。
資料授權：Leaguepedia（Fandom）文字內容 CC BY-SA 3.0。"""
import json, time, urllib.parse, urllib.request

EXPORT = "https://lol.fandom.com/wiki/Special:CargoExport"
UA = "lol-worlds-fan-site/1.0 (https://github.com/ch3ngka1/lol-worlds)"
GAP = 4
_last = [0.0]

def _get(params):
    url = EXPORT + "?" + urllib.parse.urlencode(params)
    last_err = None
    for attempt in range(6):
        wait = GAP - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            if isinstance(data, list):
                return data
            last_err = str(data)[:300]
        except Exception as e:
            last_err = str(e)
        backoff = min(20 * (2 ** attempt), 240)
        print(f"  ! {last_err} -> 等 {backoff}s 再試", flush=True)
        time.sleep(backoff)
    raise RuntimeError("Leaguepedia 匯出失敗：" + str(last_err))

def cargo(tables, fields, where="", join_on="", order_by="", group_by="", page=500, max_rows=20000):
    rows, offset = [], 0
    while True:
        p = {"tables": tables, "fields": fields, "limit": page, "offset": offset, "format": "json"}
        if where: p["where"] = where
        if join_on: p["join on"] = join_on
        if order_by: p["order by"] = order_by
        if group_by: p["group by"] = group_by
        batch = _get(p)
        rows += batch
        if len(batch) < page or len(rows) >= max_rows:
            return rows
        offset += page
