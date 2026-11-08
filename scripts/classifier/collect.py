"""List recent videos per channel from YouTube's public RSS feeds (no key). Skips Shorts.
Samples up to PER_BUCKET[bucket] videos per channel. Writes data/classifier/raw/videos.json."""
import json, random, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PER_BUCKET = {"economia": 10, "politica": 6, "filosofia": 10, "none": 8}
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "media": "http://search.yahoo.com/mrss/"}

def main():
    chans = json.loads((ROOT / "data/classifier/raw/channels.json").read_text())
    out_path = ROOT / "data/classifier/raw/videos.json"
    videos = json.loads(out_path.read_text()) if out_path.exists() else {}
    rng = random.Random(42)
    for handle, c in chans.items():
        if any(v["channel"] == c["id"] for v in videos.values()):
            continue
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={c['id']}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lastro-research"}), timeout=20) as r:
                root = ET.fromstring(r.read())
        except Exception as e:
            print(f"@{handle}: feed failed ({e})"); continue
        entries = []
        for e in root.findall("a:entry", NS):
            link = e.find("a:link", NS).get("href", "")
            if "/shorts/" in link:
                continue
            g = e.find("media:group", NS)
            entries.append({
                "id": e.find("yt:videoId", NS).text,
                "channel": c["id"], "handle": handle, "bucket": c["bucket"],
                "title": e.find("a:title", NS).text or "",
                "description": (g.find("media:description", NS).text or "") if g is not None else "",
                "published": e.find("a:published", NS).text,
            })
        pick = rng.sample(entries, min(PER_BUCKET[c["bucket"]], len(entries)))
        for v in pick:
            videos[v["id"]] = v
        print(f"{c['bucket']:9} @{handle:22} feed {len(entries):2} long videos, kept {len(pick)}", flush=True)
        time.sleep(1)
    out_path.write_text(json.dumps(videos, ensure_ascii=False, indent=1))
    from collections import Counter
    print("total", len(videos), dict(Counter(v["bucket"] for v in videos.values())))

if __name__ == "__main__":
    main()
