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
