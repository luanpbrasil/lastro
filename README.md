# Lastro

**Working on the codebase?** Start with the [codebase guide](docs/codebase-guide.md) for the two implementations, verified status, and source map, then the [development workflow](docs/development-workflow.md). The instructions below describe the original extension and KV-backed Worker; the newer live app and its extension live in [`webapp/`](webapp/README.md).

Context cards for economics videos on YouTube. While you watch, Lastro shows where each idea comes from (school of thought, thinkers, Brazilian episodes), who argues the opposite, what the official data says, and what to read next. It never says who is right.

Hack Brasil 2026 · track: Acesso à educação.

## Try it without installing anything

Open the demo page: **`https://<hosted-demo-url>/demo/`** (link added once the hosted demo is deployed, see [DEPLOY.md](DEPLOY.md)).
Pick a video and press play: cards appear as the speaker reaches each idea. Click **Lastro** on the pill for every idea in the video, then expand one and jump to it. **Rodar ao vivo** runs a fresh analysis of a test transcript and shows the time to the first card and the cost.

The page uses the same overlay as the extension, over the YouTube player, with cards computed in advance. The extension itself works on any economics or politics video on YouTube; to install it, follow the steps below.

## Install and try it (step by step)

This takes about 10 minutes. You need a terminal, but no coding.

### 1. What you need

- **Google Chrome** (or another Chromium browser: Edge, Brave, Arc).
- **Node.js 22.12 or newer** ([nodejs.org](https://nodejs.org), "LTS" download). Check with `node -v`. Tested with Node 24.
- **pnpm**: run `corepack enable` once (it comes with Node) and the version pinned in `package.json` is used. Check with `pnpm -v`.
- **git**, to download the code.
- **An Anthropic API key** (from [console.anthropic.com](https://console.anthropic.com)), for videos that have not been analysed on your machine yet. One video costs about $0.002. See [No API key?](#no-api-key) below.

No Cloudflare account is needed to run it on your own computer.

### 2. Download and build

```bash
git clone https://github.com/luanpbrasil/lastro.git
```

```bash
cd lastro
```

```bash
pnpm install
```

```bash
pnpm build:demo
```

This creates the folder `extension/dist-demo`: the extension you load into Chrome.

### 3. Add your API key (server side only)

The key goes in a file named `.dev.vars` in the `lastro` folder. It is read only by the local server. It is never copied into the extension, and the file is ignored by git.

Create the file with a text editor and put one line in it:

```
ANTHROPIC_API_KEY=your-key-here
```

On a Mac you can create and open it with:

```bash
touch .dev.vars && chmod 600 .dev.vars && open -e .dev.vars
```

Don't type the key into a terminal command: it would stay in your shell history.

### 4. Start the local server

```bash
pnpm dev:worker
```

Leave this terminal open while you use Lastro. It runs on `http://127.0.0.1:8787`. The extension only talks to this address (and to the public BCB/IBGE data APIs). Check that it is up: open http://127.0.0.1:8787/health in the browser.

### 5. Load the extension in Chrome

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right switch).
3. Click **Load unpacked**.
4. Choose the folder `lastro/extension/dist-demo` (the folder itself, not a file inside it).
5. "Lastro" appears in the list. It can read YouTube pages and the BCB/IBGE data sites, nothing else.

### 6. Use it

Open the demo video: https://www.youtube.com/watch?v=1FzdBFDbMUs

- **The pill** in the bottom-right corner shows the state: `Lastro · ligado · lendo legendas…` → `analisando…` → `9 ideias`. The first card arrives a few seconds after the analysis starts. The next time you open the same video, cards load instantly from the local cache, at no cost.
- **Cards pop up on their own** as the speaker reaches each idea: at most one every 40 s, none in the first 10 s. A card says which school of thought the sentence relies on or goes against, who disagrees, whether the idea was tested in Brazil (with a chart), and what to read for and against. When the speaker cites a number (Selic, IPCA, unemployment…), the card shows the official value for that period and says "confere" (matches) or "diferente" (differs). It never says "false", and never judges theories.
- **× on a card** closes it. Nothing is lost: everything stays in the list.
- **Click "Lastro" on the pill** to open **Ideias neste vídeo**: every card of the video in time order, with a red **AGORA** line at the current moment.
  - Each row is a short teaser. Click it to expand: you see the quote and who disagrees.
  - **▶ Ir para 4:17** jumps the video to an idea further ahead; **▶ Rever** goes back to one you passed.
  - **Abrir cartão completo** opens the full card. **← ideias** brings you back to the list.
  - The list updates as the video plays. If you skip ahead, the ideas you skipped go into the list instead of all popping up at once.
- **▶ time on a card** takes the video back to that sentence.
- **Switch it off:** `⏸` on the pill pauses Lastro (no more pop-ups) until you press `▶` or reload the page. To turn it off completely, use the switch next to Lastro in `chrome://extensions`.

Lastro acts on economics and politics videos. On other videos the pill says `fora do tema` (off topic) and offers **Analisar este vídeo** to run it anyway.

### No API key?

Today you need a key for the first viewing of each video: the cache lives on the machine that ran the analysis, and a fresh clone starts empty. Without a key, the pill shows `analysis failed` on a new video. A shared hosted server with pre-analysed demo videos is planned for the submission.

### Troubleshooting

| The pill says / you see | Fix |
|---|---|
| No pill on YouTube | Reload the YouTube tab. If you rebuilt the extension, first press the reload arrow on Lastro in `chrome://extensions`. |
| `servidor fora do ar` | The local server isn't running: start `pnpm dev:worker` and reload the tab. |
| `analysis failed` | The key is missing or wrong in `.dev.vars`. Fix it, stop the server (Ctrl+C), start it again, reload the tab. |
| `sem legendas` | The video has no captions, or they didn't load. Wait for any ad to finish and reload the tab. |
| `erro 402` / `erro 429` | The server's spending or daily limit was reached (`MAX_SPEND_USD`, `DAILY_CAP` in `wrangler.toml`). |

## How it works

```
YouTube tab ── page hook reads the player's own caption response (no extra request)
   │            content script: topic classifier → sha256(transcript)
   ▼
background worker ── GET /c/:videoId/:hash  (cached cards, $0)
   │                 POST /analyze          (miss: one streamed Claude Haiku call per video)
   │                 BCB / IBGE APIs        (official numbers for fact cards, no key)
   ▼
Cloudflare Worker ── validates each card (quote located in the transcript, node ids in the graph)
                     streams cards as NDJSON, caches the result in KV, keeps a spend ledger
```

- One Claude call per video, streamed in time order. The first card arrives in ~2 s.
- Cache key = video id + transcript hash + prompt version, so a fake transcript can't poison other viewers' cards.
- The Anthropic API key lives only in the Worker (`.dev.vars` locally, `wrangler secret` when deployed). It is never in the extension.
- Guardrails in the Worker: Haiku-only model allowlist, server-side topic check (manual "Analisar este vídeo" requests have their own small daily cap), ≤ 60 min of captions per call, daily cap, `MAX_SPEND_USD` ledger.
- Official data: BCB SGS (Selic, IPCA, debt, dollar), BCB Focus (Selic expectations), IBGE SIDRA (unemployment, GDP). Public APIs, called directly from the extension, cached 6 h.

## Layout

| Path | What |
|---|---|
| `shared/` | knowledge graph (`kg.json`), schema, prompt, prices, topic classifier (`topics.ts` + `topics-model.json`), transcript helpers, stream parser, quote locator, card stance, official-data indicators |
| `worker/src/index.ts` | Cloudflare Worker: `/analyze`, `/c/:videoId/:hash`, `/spend`, `/health`, `/api/demo/cards/:id`, `/api/demo/live` |
| `extension/` | Chrome MV3 extension: `hook.ts` (page world), `content.ts` + `overlay.ts`, `background.ts`; `build.mjs` |
| `site/` | judge site served by the Worker: landing page (`/`) and `/demo` (overlay + YouTube IFrame player, precomputed cards) |
| `scripts/` | `analyze.ts` (send a saved transcript to the Worker, record the stream), `eval.ts`, `facts-check.ts` |
| `eval/` | stance cases, gold labels, topic-classifier results (`eval/classifier/`) |
| `scripts/classifier/` | topic-classifier data collection, labelling review page and training (Python) |
| `data/classifier/` | classifier dataset: video ids, channel ids, split and labels only (titles, descriptions and captions stay local) |
| `fixtures/streams/` | recorded Worker streams, for $0 UI work and evals |

## Topic classifier

Decides whether a video is about economia, politica or filosofia (or none). `economia` OR `politica` (each at its own threshold) triggers an analysis (`ANALYZE_TOPICS` in `shared/topics.ts`); "Analisar este vídeo" overrides it.

- Model: TF-IDF (word 1–2-grams + char 3–5-grams) + one logistic regression per topic, `shared/topics-model.json` (570 KB). The same tokenizer (`shared/topics.ts`) runs in training, the extension and the Worker; TS vs Python probabilities agree to 1e-15. Scoring takes 0.2 ms in the browser.
- Data: 428 Brazilian videos from 66 channels (public RSS feeds), split by channel. Labels: Claude Haiku via the Batch API ($0.04), 150 reviewed by hand. Only video ids and labels are committed (`data/classifier/`).
- Inputs today: title + description only. Captions were blocked by YouTube during collection.
- Test (101 videos from 17 unseen channels, human labels): see `eval/classifier/final.md`. With the economia-OR-politica rule, economia recall is 0.96 and 79% of triggered videos are economia or politica (`eval/classifier/or_rule.md`).

Retrain: `pnpm topics:train`, then `pnpm topics:parity`.

## Development

```bash
pnpm dev:worker   # Worker on http://127.0.0.1:8787
pnpm build:ext    # dev build → extension/dist (adds a debug line: first-card latency and cost)
pnpm watch:ext    # same, rebuilding on change
pnpm build:demo   # demo build → extension/dist-demo (no debug line)
pnpm typecheck
```

Point the extension at another Worker: `node extension/build.mjs --prod --worker https://your-worker.workers.dev`.

Hosted demo (Cloudflare, production caps, pre-analysed demo videos): see [DEPLOY.md](DEPLOY.md).

Check spend: `curl http://127.0.0.1:8787/spend`.

## Checks

```bash
pnpm eval    # card stance logic + model labels vs gold, on recorded streams ($0)
pnpm facts   # hits every official data source once (free APIs)
```

## Status

Prototype (2026-11-08): 22-node graph (12 economics + 10 politics/philosophy bridge nodes; ideas map to traditions and institutions, never to parties or politicians); theory, forecast and fact cards; episode charts; "Ideias neste vídeo" list with expandable rows and jump. Measured on a 5-min transcript: first card 2.1 s after the request, full analysis 7.6 s, $0.0016 per uncached video (Claude Haiku 5.5). Runs locally; no hosted Worker yet.
