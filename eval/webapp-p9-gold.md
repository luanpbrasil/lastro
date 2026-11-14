# Webapp: p9 context/counterpoint and the gold eval (lastro-19, 2026-11-14)

The webapp (`webapp/`) analyses a video in short uploads, about 30 s each, with its own English prompt (`webapp/src/worker/factcheck.ts`). This note covers two things:
- the gold eval of that path, before and after it got p9's context and counterpoint;
- the switch of the extension's language detection to the page.

## How it was measured

`pnpm eval:web` (`scripts/eval-web.ts`):
1. It cuts each gold transcript into the uploads the page sends (`src/web/uploader.ts`): the first at 15 s, then every 30 s or once 900 characters wait. That is 25 calls for the 5 gold videos, 12 of them for the Gaúcha video (`wOpqx7XvD54`).
2. It cleans the text like the Worker and builds the same context and "ideas already recorded".
3. It calls Claude Haiku 5.5 through `factCheckWithClaude` and runs the root eval's gold checks (`scripts/gold-checks.ts`, shared).

Recorded replies are in `fixtures/web-streams/<tag>/`. Replay costs $0: `pnpm eval:web [-- --tag <tag> --verbose]`.

| Tag | Prompt | Runs |
|---|---|---|
| `a-main` | main at `f4a3384`: no notes | 3 per video |
| `b-p9notes` | this branch: units, then a note per unit | 3 per video |
| `c-polit01-nonotes` / `c-polit01-notes` | A/B on TESTpolit01 only, same code (`--no-notes`) | 6 each |

## Results

| | main (`a-main`) | p9 notes (`b-p9notes`) | root Worker p9 (lastro-17) |
|---|---|---|---|
| Gaúcha: all gold cases pass | 1/3 | 2/3 | 3/3 |
| Gaúcha: André Lara Resende linked | 2/3 | 3/3 | 3/3 |
| Gaúcha: the Turkey/consensus case | 2/3 | 2/3 (r1 put Novo consenso as contradicts) | 3/3 |
| All 5 videos: all gold cases pass | 11/15 | 11/15 | 5/5 (one recorded run each) |
| TESTpolit01, 9 runs per arm | 3/9 | 5/9 | 1/1 (recorded run) |
| Cards per run, Gaúcha | 19 | 19 | 9 |
| Cost per video, Gaúcha | $0.0055 | $0.0081 | $0.0019 |
| Cost per 30 s upload | ~$0.0005 | ~$0.0007 | – |
| First card per upload, median (Gaúcha) | 2.0 s | 3.8 s | 1.4 s (whole video, one call) |
| Theory/forecast cards with nodes that have context | – | 102/102 | 28/28 |
| Party/politician names in context or counterpoint | – | 0 | 0 |
| Cards naming a party/politician (paraphrase or headline) | 6 in 15 runs | 6 in 15 runs | 0 |

What the numbers say:
- **The notes did not cost accuracy.** TESTpolit01 looked worse at 3 runs (0/3). The 6-run A/B on the same code shows it was noise: 5/9 with notes against 3/9 without, and 7/9 in both arms keep the partisan line without a card.
- **The webapp names politicians where the root Worker does not.** This is not from the notes; main does it too:
  - "Mercado precisa de posição clara de Lula" on 4–5 Gaúcha cards per run in runs 2–3;
  - "governos do PT e de Bolsonaro" on TESTpolit01.

  The webapp prompt is recall-oriented, and its rules allow describing who said what. Fixing it means tightening the webapp prompt's rule, a separate change.
- **Cost and speed.** Notes add ~45% cost per upload. Cards now appear ~1–2 s later per upload, because a card is saved once its note arrives.

## Not covered

- **Speech-recognition input.** The gold transcripts are captions. The page's main input is Chrome's live recognition (no punctuation, misheard names and numbers). There is no gold set for it yet.
- **The extension's own captions feeder.** It sends ~2500-character chunks (`extension/src/captions.ts`). `--chunker captions` simulates it, but it was not run here, to stay in budget.
- **Workers AI.** It is not asked for notes. The fallback was checked offline: its parsing and card saving are covered in `webapp/tests/notes.test.mjs`. No live Workers AI run was made: that needs the Cloudflare account.

Live spend for this note: $0.093 (a-main $0.032, b-p9notes $0.046, A/B $0.015).

## Second change: no parties or politicians in Lastro's text

Luan approved this follow-up on 2026-11-14 ("Yes, same PR").

**The fix has two layers.**
- **Prompt.** The webapp prompt (and the X posts prompt) says the headline and paraphrase never name a party, government or politician. They attribute the claim to the speaker; offices are fine.
- **Worker filter** (`webapp/src/worker/names.ts`, list in `shared/politics.ts`, shared with the evals). It checks every Lastro-written field:
  - a paraphrase with a name drops the card;
  - a headline, context or counterpoint with a name is cleared. The card keeps its paraphrase title, or the map's text.

  Names match capitalised in the Worker, so "moro" and "lira turca" are not hits. The evals match any capitalisation.

**One trade-off showed up.** Told not to name parties, the model rewrote a partisan attack anonymously: "os governos recentes são todos iguais" got a card in 2/3 `d-nonames` runs. The final prompt (`e-nonames2`, `f-nonames2-polit01`) adds that such judgements are attacks, not ideas, even without names.

Names (fields across all 5 videos, 3 runs):

| | main (`a-main`) | p9 notes (`b-p9notes`) | first rule (`d-nonames`) | final (`e-nonames2`) |
|---|---|---|---|---|
| Fields where the model wrote a name | 13 | 13 | 6 | 3 |
| Cards shown naming one, with the filter | 0 | 0 | 0 | 0 |

Without the filter, 6 cards in 15 runs named one on both `a-main` and `b-p9notes`.

Gold (3 runs per video):

| | main | p9 notes | final |
|---|---|---|---|
| All 5 videos: all gold cases pass | 11/15 | 11/15 | 13/15 |
| Gaúcha: all gold cases pass | 1/3 | 2/3 | 2/3 |
| Gaúcha: André Lara Resende linked | 2/3 | 3/3 | 2/3 (5/6 across `d` and `e`) |
| TESTpolit01: partisan line gets no card | 7/9 | 7/9 | 5/6 |
| Cost per Gaúcha video | $0.0055 | $0.0081 | $0.0080 |

Live spend for this change: $0.094 (`d` $0.045, `e` $0.045, `f` $0.004). lastro-19 total: $0.187.

**Name-list fix (offline, $0).** "PL" matched bills ("PL 1087", "PL das fake news"). It now counts as the party only after "partido" or next to another party acronym, never before a number. Added: Temer, FHC, Fernando Henrique, Collor, Nikolas Ferreira, Gleisi, Michelle Bolsonaro, and Alexandre de Moraes (a justice, listed because a card naming him reads as partisan). Moro, Lira and Temer are also Portuguese words, so they match only capitalised, in the evals too. Replaying `e-nonames2` and `f-nonames2-polit01` with the new list changes nothing shown: all-pass is still 13/15 and 3/3, and 0 shown cards name anyone. The one difference is one more model-written field that names someone, the headline "Gleisi elogia proposta de Lara Resende" (`e`, Gaúcha r2). It quoted the previous upload's context, so the Worker dropped that unit before the name check.
