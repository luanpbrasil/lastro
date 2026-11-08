# Topic classifier · 2026-11-08-K12000-C1

TF-IDF (word 1–2-grams + char 3–5-grams, top 12000 features, min_df 3) + logistic regression per topic (C=1, balanced).
Train 327 videos · test 101 videos from 17 channels never seen in training.
Test labels: {'haiku': 101}. Model JSON 570 KB.

## Variant `meta` (title + description)

| Topic | Threshold | Precision | Recall | F1 | AP | Brier | Positives / n |
|---|---|---|---|---|---|---|---|
| economia | 0.4148 | 0.59 | 0.821 | 0.687 | 0.873 | 0.1545 | 28 / 101 |
| politica | 0.4584 | 0.732 | 0.75 | 0.741 | 0.823 | 0.1898 | 40 / 101 |
| filosofia | 0.3835 | 0.917 | 1.0 | 0.957 | 0.998 | 0.092 | 22 / 101 |

Thresholds are set on channel-grouped out-of-fold predictions on the train set, never on test: economia = highest threshold with recall ≥ 0.95; politica and filosofia = max F1.
PR curves: `pr_curves.csv`. Calibration bins: `calibration.csv`.
