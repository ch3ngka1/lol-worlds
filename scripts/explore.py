import json, sys, time
sys.path.insert(0, "scripts")
import cargo as C
C.RETRIES = 2
qs = json.load(open("scripts/explore.json"))
out = {}
for name, q in qs.items():
    t = time.time(); print("query", name, flush=True)
    try:
        out[name] = C.cargo(**q)
    except Exception as e:
        out[name] = {"error": str(e)}
    print("  done", round(time.time()-t), "s", flush=True)
    json.dump(out, open("explore-output.json", "w"), ensure_ascii=False, indent=1)
