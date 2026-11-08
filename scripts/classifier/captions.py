"""Fetch the first 3 minutes of Portuguese captions per video (youtube-transcript-api), throttled.
One request every 3-5 s. Stops at the first sign of blocking. Resumable: skips videos already done.
Writes data/classifier/raw/captions/<id>.json ({"status": "ok"|"none", "segments": [...]})."""
import json, random, sys, time
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable,
                                            RequestBlocked, IpBlocked)

ROOT = Path(__file__).resolve().parents[2]
FIRST_MS = 180_000

def main():
    videos = json.loads((ROOT / "data/classifier/raw/videos.json").read_text())
    outdir = ROOT / "data/classifier/raw/captions"
    outdir.mkdir(parents=True, exist_ok=True)
    api = YouTubeTranscriptApi()
    todo = [v for v in videos if not (outdir / f"{v}.json").exists()]
    print(f"{len(todo)} to fetch", flush=True)
    ok = none = 0
    for i, vid in enumerate(todo):
        try:
            t = api.fetch(vid, languages=["pt", "pt-BR", "pt-PT"])
            segs = [{"s": int(s.start * 1000), "d": int(s.duration * 1000), "t": s.text} for s in t.snippets if s.start * 1000 < FIRST_MS]
            rec = {"status": "ok", "lang": t.language_code, "generated": t.is_generated, "segments": segs}
            ok += 1
        except (RequestBlocked, IpBlocked) as e:
            print(f"BLOCKED at {vid} after {i} requests: stopping. ({type(e).__name__})", flush=True)
            sys.exit(2)
        except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
            rec = {"status": "none", "reason": type(e).__name__}
            none += 1
        except Exception as e:  # unknown: record and keep going, but slow down
            rec = {"status": "none", "reason": f"error:{type(e).__name__}"}
            none += 1
            time.sleep(10)
        (outdir / f"{vid}.json").write_text(json.dumps(rec, ensure_ascii=False))
        if i % 25 == 0:
            print(f"{i}/{len(todo)} ok={ok} none={none}", flush=True)
        time.sleep(random.uniform(3, 5))
    print(f"done ok={ok} none={none}", flush=True)

if __name__ == "__main__":
    main()
