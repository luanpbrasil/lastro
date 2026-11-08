"""Resolve channel handles to channel ids (one page fetch per handle). Writes data/classifier/raw/channels.json."""
import json, re, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) lastro-research", "Accept-Language": "pt-BR,pt;q=0.9"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def main():
    cfg = json.loads((ROOT / "scripts/classifier/channels.json").read_text())
    out_path = ROOT / "data/classifier/raw/channels.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    for bucket, handles in cfg["channels"].items():
        for h in handles:
            if h in out and out[h].get("id"):
                continue
            try:
                html = fetch(f"https://www.youtube.com/@{h}")
                m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', html)
                t = re.search(r'<meta property="og:title" content="([^"]*)"', html)
                out[h] = {"bucket": bucket, "id": m.group(1) if m else None, "title": t.group(1) if t else None}
            except urllib.error.HTTPError as e:
                out[h] = {"bucket": bucket, "id": None, "error": e.code}
            print(f"{bucket:9} @{h:24} {out[h].get('id') or out[h].get('error')}  {out[h].get('title') or ''}", flush=True)
            time.sleep(1.5)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
