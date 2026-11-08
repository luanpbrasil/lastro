"""Train the topic classifier (TF-IDF + one logistic regression per topic) and evaluate it.

Inputs (from `npm run topics:tokens` and the labelling/review steps):
  data/classifier/raw/docs.jsonl     token counts per video and variant (shared/topics.ts tokenizer)
  data/classifier/split.json         channel-level train/test split
  data/classifier/review.json        human labels (take precedence)
  data/classifier/raw/haiku_labels.json   weak labels
Outputs:
  shared/topics-model.json           vocab, idf, coefficients, intercepts, thresholds
  data/classifier/labels.csv         video id, channel, split, labels, label source (committed)
  eval/classifier/                   metrics.json, report.md, pr_curves.csv, calibration.csv, parity_py.json
"""
import csv, json, math, time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_recall_curve, precision_recall_fscore_support, brier_score_loss
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/classifier/raw"
EVAL = ROOT / "eval/classifier"
LABELS = ["economia", "politica", "filosofia"]
MIN_DF = 3
GRID_K = [3000, 6000, 12000]
GRID_C = [1.0, 4.0, 16.0]
MIN_FULL_TRAIN = 150  # train a caption variant only with at least this many captioned train videos
# Threshold policy per (variant, label): ("recall", r) = highest threshold keeping recall ≥ r; ("f1",) = max F1.
POLICY = {
    "meta": {"economia": ("recall", 0.95), "politica": ("f1",), "filosofia": ("f1",)},
    "full": {"economia": ("recall", 0.95), "politica": ("f1",), "filosofia": ("f1",)},
}
SIG = 6  # significant digits in the exported JSON (parity is checked against these exported values)


def load():
    docs = [json.loads(l) for l in (RAW / "docs.jsonl").read_text().splitlines() if l.strip()]
    split = json.loads((ROOT / "data/classifier/split.json").read_text())
    haiku = json.loads((RAW / "haiku_labels.json").read_text())
    review_path = ROOT / "data/classifier/review.json"
    review = json.loads(review_path.read_text()) if review_path.exists() else {}
    labels, source = {}, {}
    for vid in set(d["id"] for d in docs):
        if vid in review:
            labels[vid], source[vid] = [int(review[vid]["labels"][k]) for k in LABELS], "human"
        elif vid in haiku:
            labels[vid], source[vid] = [int(bool(haiku[vid][k])) for k in LABELS], "haiku"
    return docs, split, haiku, review, labels, source


def vocab_from(docs, k):
    df, tf = Counter(), Counter()
    for d in docs:
        df.update(d["counts"].keys())
        tf.update(d["counts"])
    kept = [t for t in df if df[t] >= MIN_DF]
    kept.sort(key=lambda t: (-tf[t], t))  # like TfidfVectorizer(max_features): top corpus frequency
    return sorted(kept[:k])


def matrix(docs, vocab):
    idx = {t: i for i, t in enumerate(vocab)}
    rows, cols, vals = [], [], []
    for r, d in enumerate(docs):
        for t, c in d["counts"].items():
            j = idx.get(t)
            if j is not None:
                rows.append(r); cols.append(j); vals.append(c)
    return sparse.csr_matrix((vals, (rows, cols)), shape=(len(docs), len(vocab)), dtype=np.float64)


def fit(docs, y, k, c):
    vocab = vocab_from(docs, k)
    tfidf = TfidfTransformer(sublinear_tf=True, smooth_idf=True, norm="l2")
    X = tfidf.fit_transform(matrix(docs, vocab))
    models = []
    for l in range(len(LABELS)):
        m = LogisticRegression(C=c, class_weight="balanced", solver="liblinear", max_iter=5000)
        m.fit(X, y[:, l])
        models.append(m)
    return vocab, tfidf, models


def predict(docs, vocab, tfidf, models):
    X = tfidf.transform(matrix(docs, vocab))
    return np.column_stack([m.predict_proba(X)[:, 1] for m in models])


def threshold(y, p, policy):
    prec, rec, th = precision_recall_curve(y, p)
    if policy[0] == "recall":
        ok = [t for pr, r, t in zip(prec[:-1], rec[:-1], th) if r >= policy[1]]
        return float(max(ok)) if ok else float(th.min())
    f1 = 2 * prec[:-1] * rec[:-1] / np.maximum(prec[:-1] + rec[:-1], 1e-12)
    return float(th[int(np.argmax(f1))])


def sig(x):
    return float(f"{x:.{SIG}g}")


def main():
    t0 = time.time()
    docs, split, haiku, review, labels, source = load()
    docs = [d for d in docs if d["id"] in labels]
    train_ids, test_ids = set(split["train"]), set(split["test"])
    cap_train = len({d["id"] for d in docs if d["variant"] == "full" and d["id"] in train_ids})
    variants = ["meta"] + (["full"] if cap_train >= MIN_FULL_TRAIN else [])
    docs = [d for d in docs if d["variant"] in variants]
    tr = [d for d in docs if d["id"] in train_ids]
    te = [d for d in docs if d["id"] in test_ids]
    y_tr = np.array([labels[d["id"]] for d in tr])
    y_te = np.array([labels[d["id"]] for d in te])
    groups = [d["channel"] for d in tr]
    print(f"variants {variants} · captioned train videos {cap_train} · train docs {len(tr)} · test docs {len(te)}")

    # Model selection: channel-grouped 5-fold out-of-fold predictions on train; mean average precision.
    folds = list(GroupKFold(n_splits=5).split(tr, groups=groups))
    best = None
    for k in GRID_K:
        for c in GRID_C:
            oof = np.zeros_like(y_tr, dtype=float)
            for a, b in folds:
                v, t, ms = fit([tr[i] for i in a], y_tr[a], k, c)
                oof[b] = predict([tr[i] for i in b], v, t, ms)
            ap = np.mean([average_precision_score(y_tr[:, l], oof[:, l]) for l in range(len(LABELS))])
            print(f"  K={k:5} C={c:4}: mean AP {ap:.3f}")
            if best is None or ap > best[0] + 0.005:  # prefer the smaller model unless clearly better
                best = (ap, k, c, oof)
    ap, K, C, oof = best
    print(f"chosen K={K} C={C} (mean OOF AP {ap:.3f})")

    thresholds = {}
    for var in variants:
        mask = np.array([d["variant"] == var for d in tr])
        thresholds[var] = [threshold(y_tr[mask, l], oof[mask, l], POLICY[var][lab]) for l, lab in enumerate(LABELS)]

    vocab, tfidf, models = fit(tr, y_tr, K, C)
    p_te = predict(te, vocab, tfidf, models)

    model = {
        "version": time.strftime("%Y-%m-%d") + f"-K{K}-C{C:g}",
        "labels": LABELS,
        "vocab": vocab,
        "idf": [sig(x) for x in tfidf.idf_],
        "coef": [[sig(x) for x in m.coef_[0]] for m in models],
        "intercept": [sig(m.intercept_[0]) for m in models],
        "thresholds": {v: [round(x, 6) for x in thresholds[v]] for v in variants},
    }
    out = ROOT / "shared/topics-model.json"
    out.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024

    # Reference probabilities from the exported (rounded) parameters, for the TS parity test.
    idx = {t: i for i, t in enumerate(model["vocab"])}
    idf, W, B = np.array(model["idf"]), np.array(model["coef"]), np.array(model["intercept"])
    parity, max_round = {}, 0.0
    for d, p_sk in zip(te, p_te):
        feats = [(idx[t], (1 + math.log(c)) * idf[idx[t]]) for t, c in d["counts"].items() if t in idx]
        norm = math.sqrt(sum(v * v for _, v in feats)) or 1.0
        z = B + sum(W[:, i] * (v / norm) for i, v in feats) if feats else B.copy()
        p = 1 / (1 + np.exp(-z))
        parity[f"{d['id']}|{d['variant']}"] = [float(x) for x in p]
        max_round = max(max_round, float(np.max(np.abs(p - p_sk))))

    # Evaluation on the held-out channels.
    EVAL.mkdir(parents=True, exist_ok=True)
    metrics = {"model": model["version"], "K": K, "C": C, "oof_mean_ap": round(ap, 4), "json_kb": round(size_kb, 1),
               "rounding_max_abs_diff": max_round, "train_videos": len({d["id"] for d in tr}),
               "test_videos": len({d["id"] for d in te}), "test_channels": len(split["test_channels"]),
               "test_label_source": dict(Counter(source[d["id"]] for d in te if d["variant"] == "meta")),
               "per_variant": {}}
    pr_rows, cal_rows = [], []
    for var in variants:
        m = np.array([d["variant"] == var for d in te])
        res = {}
        for l, lab in enumerate(LABELS):
            yt, pt = y_te[m, l], p_te[m, l]
            pred = (pt >= thresholds[var][l]).astype(int)
            P, R, F, _ = precision_recall_fscore_support(yt, pred, average="binary", zero_division=0)
            res[lab] = {"threshold": round(thresholds[var][l], 4), "precision": round(P, 3), "recall": round(R, 3),
                        "f1": round(F, 3), "ap": round(average_precision_score(yt, pt), 3) if yt.sum() else None,
                        "brier": round(brier_score_loss(yt, pt), 4), "positives": int(yt.sum()), "n": int(len(yt))}
            prec, rec, th = precision_recall_curve(yt, pt)
            for a, b, t in zip(prec[:-1], rec[:-1], th):
                pr_rows.append([var, lab, round(float(t), 4), round(float(a), 4), round(float(b), 4)])
            bins = np.clip((pt * 10).astype(int), 0, 9)
            for b in range(10):
                sel = bins == b
                if sel.any():
                    cal_rows.append([var, lab, f"{b/10:.1f}-{(b+1)/10:.1f}", int(sel.sum()), round(float(pt[sel].mean()), 3), round(float(yt[sel].mean()), 3)])
        none_true = (y_te[m].sum(1) == 0)
        none_pred = np.all(p_te[m] < np.array(thresholds[var]), axis=1)
        res["none"] = {"true": int(none_true.sum()), "predicted": int(none_pred.sum()), "agree": int((none_true == none_pred).sum())}
        metrics["per_variant"][var] = res

    # Haiku vs human on the reviewed videos.
    agree = {lab: [0, 0] for lab in LABELS}
    for vid, r in review.items():
        if vid in haiku:
            for lab in LABELS:
                agree[lab][0] += int(bool(haiku[vid][lab]) == bool(r["labels"][lab]))
                agree[lab][1] += 1
    metrics["haiku_vs_human"] = {lab: {"agree": a, "n": n, "rate": round(a / n, 3) if n else None} for lab, (a, n) in agree.items()}

    (EVAL / "metrics.json").write_text(json.dumps(metrics, indent=1, ensure_ascii=False))
    (EVAL / "parity_py.json").write_text(json.dumps(parity))
    with open(EVAL / "pr_curves.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["variant", "label", "threshold", "precision", "recall"]); w.writerows(pr_rows)
    with open(EVAL / "calibration.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["variant", "label", "bin", "n", "mean_predicted", "observed_rate"]); w.writerows(cal_rows)
    with open(ROOT / "data/classifier/labels.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["video_id", "channel_id", "split", *LABELS, "source"])
        chan = {d["id"]: d["channel"] for d in docs}
        for vid in sorted(labels):
            if vid in chan:
                w.writerow([vid, chan[vid], "test" if vid in test_ids else "train", *labels[vid], source[vid]])

    lines = [f"# Topic classifier · {model['version']}", "",
             f"TF-IDF (word 1–2-grams + char 3–5-grams, top {K} features, min_df {MIN_DF}) + logistic regression per topic (C={C:g}, balanced).",
             f"Train {metrics['train_videos']} videos · test {metrics['test_videos']} videos from {metrics['test_channels']} channels never seen in training.",
             f"Test labels: {metrics['test_label_source']}. Model JSON {size_kb:.0f} KB.", ""]
    for var in variants:
        lines += [f"## Variant `{var}` ({'title + description + 3 min captions' if var == 'full' else 'title + description'})", "",
                  "| Topic | Threshold | Precision | Recall | F1 | AP | Brier | Positives / n |", "|---|---|---|---|---|---|---|---|"]
        for lab in LABELS:
            r = metrics["per_variant"][var][lab]
            lines.append(f"| {lab} | {r['threshold']} | {r['precision']} | {r['recall']} | {r['f1']} | {r['ap']} | {r['brier']} | {r['positives']} / {r['n']} |")
        lines.append("")
    lines += ["Thresholds are set on channel-grouped out-of-fold predictions on the train set, never on test: "
              "economia = highest threshold with recall ≥ 0.95; politica and filosofia = max F1.",
              "PR curves: `pr_curves.csv`. Calibration bins: `calibration.csv`."]
    (EVAL / "report.md").write_text("\n".join(lines) + "\n")
    print(json.dumps(metrics["per_variant"], indent=1))
    print(f"model {size_kb:.0f} KB · rounding max |Δp| {max_round:.2e} · {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
