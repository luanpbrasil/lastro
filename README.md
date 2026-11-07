# Lastro

Context cards for economics videos on YouTube. While you watch, Lastro shows where each idea comes from (school of thought, thinkers, Brazilian episodes), who argues the opposite, what the official data says, and what to read next. It never says who is right.

Hack Brasil 2026 · track: Acesso à educação.

## Install and try it (step by step)

This takes about 10 minutes. You need a terminal, but no coding.

### 1. What you need

- **Google Chrome** (or another Chromium browser: Edge, Brave, Arc).
- **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), "LTS" download). Check with `node -v`. Tested with Node 26.
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
npm install
```

```bash
npm run build:demo
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
npm run dev:worker
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

Lastro only acts on economics videos. On other videos the pill says `fora do tema` (off topic) and offers **Analisar este vídeo** to run it anyway.

### No API key?

Today you need a key for the first viewing of each video: the cache lives on the machine that ran the analysis, and a fresh clone starts empty. Without a key, the pill shows `analysis failed` on a new video. A shared hosted server with pre-analysed demo videos is planned for the submission.

### Troubleshooting

| The pill says / you see | Fix |
|---|---|
| No pill on YouTube | Reload the YouTube tab. If you rebuilt the extension, first press the reload arrow on Lastro in `chrome://extensions`. |
| `servidor fora do ar` | The local server isn't running: start `npm run dev:worker` and reload the tab. |
| `analysis failed` | The key is missing or wrong in `.dev.vars`. Fix it, stop the server (Ctrl+C), start it again, reload the tab. |
| `sem legendas` | The video has no captions, or they didn't load. Wait for any ad to finish and reload the tab. |
| `erro 402` / `erro 429` | The server's spending or daily limit was reached (`MAX_SPEND_USD`, `DAILY_CAP` in `wrangler.toml`). |

## How it works

```
YouTube tab ── page hook reads the player's own caption response (no extra request)
   │            content script: lexicon gate → sha256(transcript)
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
- Guardrails in the Worker: Haiku-only model allowlist, server-side lexicon check, ≤ 60 min of captions per call, daily cap, `MAX_SPEND_USD` ledger.
- Official data: BCB SGS (Selic, IPCA, debt, dollar), BCB Focus (Selic expectations), IBGE SIDRA (unemployment, GDP). Public APIs, called directly from the extension, cached 6 h.

## Layout

| Path | What |
|---|---|
| `shared/` | knowledge graph (`kg.json`), schema, prompt, prices, lexicon gate, transcript helpers, stream parser, quote locator, card stance, official-data indicators |
| `worker/src/index.ts` | Cloudflare Worker: `/analyze`, `/c/:videoId/:hash`, `/spend`, `/health` |
| `extension/` | Chrome MV3 extension: `hook.ts` (page world), `content.ts` + `overlay.ts`, `background.ts`; `build.mjs` |
| `scripts/` | `analyze.ts` (send a saved transcript to the Worker, record the stream), `eval.ts`, `facts-check.ts` |
| `eval/` | stance cases and gold labels |
| `fixtures/streams/` | recorded Worker streams, for $0 UI work and evals |

## Development

```bash
npm run dev:worker   # Worker on http://127.0.0.1:8787
npm run build:ext    # dev build → extension/dist (adds a debug line: first-card latency and cost)
npm run watch:ext    # same, rebuilding on change
npm run build:demo   # demo build → extension/dist-demo (no debug line)
npm run typecheck
```

Point the extension at another Worker: `node extension/build.mjs --prod --worker https://your-worker.workers.dev`.

Check spend: `curl http://127.0.0.1:8787/spend`.

## Checks

```bash
npm run eval    # card stance logic + model labels vs gold, on recorded streams ($0)
npm run facts   # hits every official data source once (free APIs)
```

## Status

Prototype (2026-11-07): 12-node graph; theory, forecast and fact cards; episode charts; "Ideias neste vídeo" list with expandable rows and jump. Measured on a 5-min transcript: first card 2.1 s after the request, full analysis 7.6 s, $0.0016 per uncached video (Claude Haiku 5.5). Runs locally; no hosted Worker yet.
