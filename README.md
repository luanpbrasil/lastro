# Lastro

Context cards for economics videos on YouTube. While you watch, Lastro shows where each idea comes from (school of thought, thinkers, Brazilian episodes), who argues the opposite, and what to read next. It never says who is right.

Hack Brasil 2026 · track: Acesso à educação. Design: `BUILD_PLAN.md` rev 3 (kept outside this repo during the event).

## How it works

```
YouTube tab ── page hook reads the player's own caption response (no extra request)
   │            content script: lexicon gate → sha256(transcript)
   ▼
background worker ── GET /c/:videoId/:hash  (cached cards, $0)
   │                 POST /analyze          (miss: one streamed Claude Haiku call per video)
   ▼
Cloudflare Worker ── validates each card (quote located in the transcript, node ids in the graph)
                     streams cards as NDJSON, caches the result in KV, keeps a spend ledger
```

- One Claude call per video, streamed in time order. The first card arrives in ~2 s.
- Cache key = video id + transcript hash + prompt version, so a fake transcript can't poison other viewers' cards.
- The Anthropic API key lives only in the Worker (`.dev.vars` locally, `wrangler secret` when deployed). It is never in the extension.
- Guardrails in the Worker: Haiku-only model allowlist, server-side lexicon check, ≤ 60 min of captions per call, daily cap, `MAX_SPEND_USD` ledger.

## Layout

| Path | What |
|---|---|
| `shared/` | knowledge graph (`kg.json`), schema, prompt, prices, lexicon gate, transcript helpers, stream parser, quote locator |
| `worker/src/index.ts` | Cloudflare Worker: `/analyze`, `/c/:videoId/:hash`, `/spend`, `/health` |
| `extension/` | Chrome MV3 extension: `hook.ts` (page world), `content.ts` + `overlay.ts`, `background.ts` |
| `scripts/analyze.ts` | send a saved transcript to the Worker; records the stream to `fixtures/streams/` |
| `fixtures/streams/` | recorded Worker streams, for $0 UI work |

## Run locally

```bash
npm install
# put ANTHROPIC_API_KEY=... in .dev.vars (gitignored)
npm run dev:worker          # Worker on http://127.0.0.1:8787
npm run build:ext           # builds extension/dist
```

Load the extension: Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Open an economics video on YouTube. The pill in the bottom-right corner shows the state; the dev build also shows first-card latency and the cost of the call.

Check spend: `curl http://127.0.0.1:8787/spend`.

## Using it during a video

- Cards pop on their own: one per new idea, at least 40 s apart, none in the first 10 s.
- Click **Lastro** on the pill for every card of the video in time order, with an AGORA line at the playhead. Cards already passed reopen in place (`← ideias` goes back); cards ahead (▶ time) jump the video there. `⏸` pauses.
- Skipping ahead puts the cards you passed in the list without popping them.
- ▶ time on a card seeks the video back to that moment.
- Fact cards show the official number (BCB SGS, IBGE SIDRA, Focus) for the period the speaker means, a chart, and "confere" / "diferente" next to the number quoted in the video. Never "falso"; never on theories.

## Checks

```bash
npm run eval    # card stance logic + model labels vs gold, on recorded streams ($0)
npm run facts   # hits every official data source once (free APIs)
```

## Status

Prototype (2026-11-07): 12-node graph; theory, forecast and fact cards; episode charts; "ideias até agora" list. Measured on a 5-min transcript: first card 2.1 s after the request, full analysis 7.6 s, $0.0016 per uncached video (Claude Haiku 5.5).
