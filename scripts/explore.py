import json, sys
sys.path.insert(0, "scripts")
from cargo import cargo
qs = json.load(open("scripts/explore.json"))
out = {}
for name, q in qs.items():
    print("query", name, flush=True)
    try:
        out[name] = cargo(**q)
    except Exception as e:
        out[name] = {"error": str(e)}
json.dump(out, open("explore-output.json", "w"), ensure_ascii=False, indent=1)
