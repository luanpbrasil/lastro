"""Channel-level train/test split and the human-review sample.

Test = whole channels (~20% of videos per sampling bucket), so no channel is in both sets.
Review sample = every test video + a stratified sample of train videos, up to REVIEW_N.
Writes data/classifier/split.json (committed: channel ids and video ids only).
"""
import json, random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEST_SHARE = 0.2
REVIEW_N = 150
SEED = 7
# Hard negatives must be in test too, or "none" there is only cooking/music/games: personal finance + political comedy.
FORCE_TEST = ["nathfinancas", "portadosfundos"]


def main():
    videos = json.loads((ROOT / "data/classifier/raw/videos.json").read_text())
    haiku = json.loads((ROOT / "data/classifier/raw/haiku_labels.json").read_text())
    rng = random.Random(SEED)

    by_bucket = defaultdict(lambda: defaultdict(list))
    for v in videos.values():
        by_bucket[v["bucket"]][v["channel"]].append(v["id"])

    handles = json.loads((ROOT / "data/classifier/raw/channels.json").read_text())
    forced = [handles[h]["id"] for h in FORCE_TEST if h in handles]
    test_channels = list(forced)
    for bucket, chans in sorted(by_bucket.items()):
        total = sum(len(ids) for ids in chans.values())
        order = sorted(c for c in chans if c not in forced)
        rng.shuffle(order)
        taken = sum(len(chans[c]) for c in forced if c in chans)
        for c in order:
            if taken >= TEST_SHARE * total:
                break
            test_channels.append(c)
            taken += len(chans[c])

    test_ids = sorted(v for v, x in videos.items() if x["channel"] in test_channels)
    train_ids = sorted(v for v in videos if v not in set(test_ids))

    # Stratify the extra train sample by Haiku's label combination, so rare combinations get reviewed too.
    def combo(vid):
        h = haiku.get(vid)
        return "?" if not h else "".join(k[0] for k in ("economia", "politica", "filosofia") if h[k]) or "none"

    strata = defaultdict(list)
    for v in train_ids:
        strata[combo(v)].append(v)
    for s in strata.values():
        rng.shuffle(s)
    extra, need = [], max(0, REVIEW_N - len(test_ids))
    while len(extra) < need and any(strata.values()):
        for k in sorted(strata):
            if strata[k] and len(extra) < need:
                extra.append(strata[k].pop())

    out = {"seed": SEED, "test_channels": sorted(test_channels), "test": test_ids, "train": train_ids,
           "review": test_ids + sorted(extra)}
    (ROOT / "data/classifier/split.json").write_text(json.dumps(out, indent=1))
    print(f"test: {len(test_channels)} channels, {len(test_ids)} videos · train: {len(train_ids)} · review: {len(out['review'])}")


if __name__ == "__main__":
    main()
