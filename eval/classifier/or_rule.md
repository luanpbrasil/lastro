# Trigger rule: economia OR política (2026-11-08)

Rule: analyse if p(economia) ≥ 0.416 OR p(politica) ≥ 0.462 (the thresholds from `final.md`). Same 101 test videos, Luan's labels, $0.
Test set: 26 economia, 43 politica, 53 economia-or-politica, 36 with none of the three topics, 12 filosofia only.

"Trigger precision" counts a trigger as correct if the video is economia or politica. "Extra" is vs today's economia-only rule, at $0.002 per analysis.

| Rule | Triggered | Economia recall | Trigger precision | Share neither | Triggers per 100 none-videos | Extra per 100 none-videos | Economia-or-politica recall |
|---|---|---|---|---|---|---|---|
| economia only (today) | 37 | 0.846 (22/26) | 0.784 | 0.216 | 17 | +0 ($+0.000) | 0.547 |
| econ OR pol≥0.400 | 80 | 1.000 (26/26) | 0.637 | 0.362 | 69 | +53 ($+0.106) | 0.962 |
| econ OR pol≥0.462 | 61 | 0.962 (25/26) | 0.787 | 0.213 | 31 | +14 ($+0.028) | 0.906 |
| econ OR pol≥0.550 | 46 | 0.885 (23/26) | 0.804 | 0.196 | 19 | +3 ($+0.006) | 0.698 |
| econ OR pol≥0.650 | 40 | 0.846 (22/26) | 0.800 | 0.200 | 17 | +0 ($+0.000) | 0.604 |

## The 4 economia misses of the economia-only rule
3 are caught by the OR rule: Eduardo Moreira on Trump and Latin America, ICL on betting regulation at the STF, CNN on Itaipu funds.
Still missed: Folha C-Level interview on investment (p_econ 0.35, p_pol 0.43).

## Is the extra analysis useful? (judged from titles, no live calls)
The OR rule adds 24 triggers: 3 economia, 16 politica-only, 5 none.
Of the 16 politica-only, about 4 could produce a card: the ICL Urgente daily news shows, which usually cover the economy.
The other 12 (US midterms, the criminal-age amendment, the Pope, Israel, climate, elections, public security) touch no graph node:
the graph's political nodes are traditions and institutions (liberalism, social democracy, Rawls, fiscal rules, BC autonomy), so those analyses would likely return no cards.
Counting only videos likely to produce a card, precision of the OR trigger is about 0.48 (29 / 61), against 0.59 for economia only.

Cost on the test set: 24 extra analyses per 101 videos ≈ $0.05; on videos with none of the three topics, +14 per 100 ≈ $0.03.

## Decision
The rule meets the orchestrator's bar (economia recall ≥ 0.92 and trigger precision ≥ 0.6), so it is wired in (`ANALYZE_TOPICS` in `shared/topics.ts`).
Trade-off for Luan: it buys 3 of 4 missed economia videos for about 17 analyses per 100 test videos that will likely show no card.
To revert, remove "politica" from `ANALYZE_TOPICS`.
