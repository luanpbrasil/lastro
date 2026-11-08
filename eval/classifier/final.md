# Topic classifier: final evaluation after human review (2026-11-08)

Model: TF-IDF (12k features) + logistic regression per topic, **title + description only** (captions were blocked by YouTube after 20 requests).
Test: 101 videos from 17 channels never seen in training. Same split as the preliminary run.
Training labels: Luan's on the 150 reviewed videos (101 test + 49 train), Haiku's on the other 278.

## Test metrics: preliminary (Haiku labels) vs final (Luan's labels)

P / R / F1 / AP (positives). Thresholds re-set by channel-grouped 5-fold CV on train only.

| Topic | Preliminary, Haiku test labels | Final, Luan's test labels |
|---|---|---|
| economia | 0.59 / 0.821 / 0.687 / 0.873 (28) | 0.595 / 0.846 / 0.698 / 0.884 (26) |
| politica | 0.732 / 0.75 / 0.741 / 0.823 (40) | 0.732 / 0.698 / 0.714 / 0.818 (43) |
| filosofia | 0.917 / 1.0 / 0.957 / 0.998 (22) | 0.917 / 1.0 / 0.957 / 0.998 (22) |

Thresholds (final): economia 0.4158 (policy: recall ≥ 0.95 on train CV), politica 0.4622, filosofia 0.3835 (max F1).

## Haiku vs Luan on the 150 reviewed videos

| Topic | Agreement | Cohen's κ | Haiku positives | Luan positives |
|---|---|---|---|---|
| economia | 0.980 | 0.955 | 51 | 48 |
| politica | 0.973 | 0.946 | 62 | 66 |
| filosofia | 1.000 | 1.000 | 37 | 37 |

143 / 150 videos unchanged. All 7 disagreements were on Haiku confidence "media"; none on "alta".

- **Haiku over-tags economia when money or business is mentioned without economic content (3):** a comedy sketch (Porta dos Fundos, "AJUDINHA"), a phone launch (TecMundo), an agribusiness course welcome video (Itaú BBA).
- **Haiku under-tags politica on policy topics framed as business or philosophy (4):** agro sustainability and bioeconomy (Itaú BBA, 2), an inequality debate (Economia Mainstream), "Um Homem Social" (Pensando Filosofia).

Caveat: the review page showed Haiku's labels pre-ticked, so part of the agreement may be anchoring. The 7 changes show the review was not a rubber stamp, but κ here is an upper bound.

Use of Haiku labels for the remaining 278 training videos: fine for filosofia and economia; for politica expect a few missed policy-adjacent videos.

## Economia recall: options (decision for Luan)

Test recall at the CV-chosen threshold is **0.846 (22 / 26)**, below the 0.95 target. With 26 positives, one video is 3.8 points of recall.
The 4 misses are all political news with an economic angle (ICL on betting regulation, Eduardo Moreira on Trump, Folha C-Level on investment, CNN on Itaipu funds), not pure economics videos.

Threshold sweep on the test set (75 videos that are not economia):

| Threshold | Recall | Precision | Misses | Extra analyses per 100 off-topic videos | Extra cost per 100 off-topic |
|---|---|---|---|---|---|
| 0.416 (now) | 0.846 | 0.595 | 4 | 20 | $0.04 |
| 0.35 | 0.885 | 0.348 | 3 | 57 | $0.11 |
| 0.30 | 0.923 | 0.308 | 2 | 72 | $0.14 |
| 0.25 | 0.962 | 0.275 | 1 | 88 | $0.18 |
| 0.20 | 1.000 | 0.277 | 0 | 91 | $0.18 |

At $0.002 per analysis. Precision collapses below 0.41: most off-topic scores sit between 0.25 and 0.41, so the model separates weakly on title + description.
Among videos with none of the three topics, the current threshold lets through 6 / 36 (17 per 100): a Coca-Cola CEO interview, a comedy sketch, 3 Manual do Mundo videos, a music video.

Other options, with what is known:
- **Captions once the IP block clears.** Not measurable yet: 19 captioned videos. Needs ~400 more caption fetches; the earlier fetch was blocked after 20.
- **More economia training data.** Learning curve on test AP: 25 channels 0.856, 38 channels 0.857, 51 channels 0.884. Gains are small and noisy; doubling data might add a few AP points, not reach 0.95 recall at 0.6 precision.
- **Keep the threshold; rely on the manual button.** Misses are mixed politics/economics news; the viewer still has "Analisar este vídeo".

## Test-set balance (political leaning, my judgment, unverified)

- Left-leaning in test: Eduardo Moreira (ICL), 10 videos, 8 labelled politica.
- Right-leaning in test: MBL, 6 videos, 4 politica.
- Mainstream in test: CNN Brasil, GloboNews, Estadão, Folha.
- The `@LauraCarvalho` channel is a singer, not the economist; its 5 test videos are labelled none (correct) and count as music, not left-leaning.
- Optional: move one left politics channel (e.g. Brasil de Fato: 6 videos, 5 politica per Haiku) from train to test; it would need Luan to review its 6 videos. Not moved.
