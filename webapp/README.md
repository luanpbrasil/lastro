# Lastro ao vivo

A web version of Lastro with no extension. Paste a YouTube link, press **Ouvir este vídeo**, and the page transcribes the tab's audio and shows fact-checked context cards.

```
Page: YouTube IFrame player + bot check (Turnstile)
  │  POST /api/videos/:id/sessions      bot check → a token for this video
  │  getDisplayMedia (this tab, with audio) → SpeechRecognition.start(audioTrack), pt-BR
  │  POST /api/videos/:id/transcript    about every 90 s
  ▼
Worker: stores the chunk, then
  │  one Workers AI call (GLM 4.7 Flash) → every card checked against the transcript and the knowledge graph
  │  fact cards → official value from BCB / IBGE → confere / diferente
  ▼
D1: videos, chunks, coverage, cards, sessions, daily limits
  ▲
  │  GET /api/videos/:id/cards?after=<cursor>   every 5 s while active, 30 s when idle, paused in a background tab
  │  GET /api/videos                            the history of analysed videos
Page: shows the cards and the history
```

Polling is the only way cards reach the page, so a video someone has already listened to shows its cards right away. The "Vídeos já analisados" list under the player opens any of them.

The prompt, card schema, knowledge graph and official-data code come from `../shared/`. Everything else is separate from the extension and its Worker.

## Run locally

Run these from this folder, after `npm install` in the repository root and `npx wrangler login`.

1. Create `webapp/.dev.vars` with Cloudflare's always-pass test secret: `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`
2. Create the local database: `npm run db:local`
3. Start it: `npm run dev`
4. Open http://localhost:8788 in desktop Chrome. Tab capture needs `localhost` or HTTPS.
5. Paste a link, press **Ouvir este vídeo**, choose **this tab**, turn on **share tab audio**. The video starts playing.

Cards show up about two minutes after the speech. Local runs call the real Workers AI and use your account's free neurons without being counted by the app's daily cap.

## Deploy

1. In the Cloudflare dashboard, create a Turnstile widget for your domain. Put its site key in `TURNSTILE_SITE_KEY` in `wrangler.toml`.
2. Then:

```bash
npx wrangler d1 create lastro-live     # put the id in wrangler.toml
npm run db:remote
npx wrangler secret put TURNSTILE_SECRET
npm run deploy
```

With Cloudflare's test keys, the bot check refuses every request outside localhost. Without the secret, listening is off and saved cards still work.

## Free tier

Everything is sized to stay inside Cloudflare's free allowances.

| Service | Free allowance | How the app stays inside it |
|---|---|---|
| Workers AI | 10000 neurons/day | `DAILY_NEURON_CAP` = 9000, reserved before each call, so simultaneous requests can't overrun it. The page says when the day's limit is reached |
| Workers | 100000 requests/day | Polling every 5 s only while analysing, 30 s otherwise, nothing from background tabs. Per-connection rate limit |
| D1 | 5 M rows read, 100 k written/day | Indexed queries. The history reads at most 24 rows |
| Turnstile, static assets | Free | – |

GLM 4.7 Flash uses about 40 neurons per 90-second upload, so 9000 neurons is about 20 videos of 15 minutes. The neuron cap is the hard guarantee: whichever limit comes first stops new analyses until 00:00 UTC.

Cloudflare's free allowance is per account. If anything else on the account uses Workers AI, lower `DAILY_NEURON_CAP`. On the Workers Free plan Cloudflare never bills; on the Paid plan the cap is what keeps the bill at zero. Free Workers also get 10 ms of CPU per request: the app's work is light, but check `wrangler tail` for CPU errors after deploying.

## Abuse limits

All set in `wrangler.toml`. A refused request never reaches the AI.

| Limit | Default | What it stops |
|---|---|---|
| `DAILY_VIDEO_CAP` | 20 different videos per UTC day | Total daily use. Set it to 0 to stop new analyses at once |
| `IP_DAILY_VIDEO_CAP` | 3 videos per connection per day | One person using up the day's videos |
| `DAILY_NEURON_CAP` | 9000 per day | Spending, whatever else happens |
| `MAX_MINUTES_PER_VIDEO` | 15 minutes analysed | One long video using up the budget |
| `IP_SESSION_CAP` | 6 sessions per connection per 2 hours | Repeatedly opening sessions |
| Bot check | Required for every session, tied to this site's hostname and its "listen" widget | Scripts |
| Real-time pacing | 30 characters/s, one upload per 10 s | Pouring in hours of text at once |
| `API_LIMITER` | 60 requests per minute per connection, approximate | Flooding the API |

A video takes one slot per day however many people listen to it, and already-covered parts cost nothing.

## Endpoint protection

- **Same-site writes only.** POSTs must be JSON, and are refused when the browser reports another origin (`Origin`, `Sec-Fetch-Site`). Request bodies over 32 KB are refused before they are read.
- **Strict validation.** Video ids, cursors, segment times and text lengths are all checked. Unknown routes and methods get 404 or 405.
- **No internals in errors.** Every error is a short code. Unexpected failures are logged and answered with `unavailable`.
- **Security headers.** `static/_headers` sets a CSP that only allows YouTube's player and Turnstile, plus `frame-ancestors 'none'`, so no other site can frame the page and trick someone into sharing a tab. It also sets nosniff, a referrer policy and HSTS. API responses send `default-src 'none'`.
- **Sessions.** Tokens are 256-bit random, stored only as a hash, bound to one video, and expire after 2 hours.

## Prompt injection

The transcript is posted by any page and the title is chosen by whoever uploaded the video, so both are treated as hostile.

- **In:** before text is stored or sent to the model, it is cut down to what speech contains: letters, digits and basic punctuation. Markup, braces, role tags, control and invisible characters are removed, and segments are capped at 600 characters. The data is fenced in the prompt between `<<<DADOS>>>` and `<<<FIM DOS DADOS>>>`. Since `<` can't reach the data, nothing inside can close the fence. The system prompt says that anything inside is speech, never instructions.
- **Out:** every field the model returns is checked. Node ids, indicators, kinds and roles must come from fixed lists, and the quote must really be in the new part of the transcript. The paraphrase must start with "O falante" and can't contain links, addresses, handles or markup. Anything else is dropped.
- **No authority:** the model never decides whether a claim is true. "confere" or "diferente" comes from BCB and IBGE data in code, and links only ever point to those official sources. The model has no tools, secrets or other users' data to leak.

What it can't stop: someone who says an injection out loud gets a card only if that sentence is an economic idea. The card then quotes it and attributes it to the speaker, which is accurate.

## Transcript log

Every upload from a valid session is logged in `transcript_log`: time, video, session, outcome (`accepted`, `skipped`, or the refusal code) and all segments as received after cleaning. Nothing about the sender is kept: no IP, country or browser. Rows older than `LOG_RETENTION_DAYS` (30) are deleted automatically. The API never exposes this table, and the page tells viewers what is kept.

The limits per connection use a hash of the IP. It is kept only while needed: up to 2 hours in `sessions`, and until the end of the UTC day in `daily_videos`.

```bash
# latest uploads
npx wrangler d1 execute lastro-live --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS at, video_id, outcome, substr(segments,1,120) AS text FROM transcript_log ORDER BY id DESC LIMIT 50"
# everything one listening session sent
npx wrangler d1 execute lastro-live --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS at, video_id, outcome, segments FROM transcript_log WHERE session_hash='HASH' ORDER BY id"
```

## Removing a video

To remove a video's cards so it can be analysed again:

```bash
npx wrangler d1 execute lastro-live --remote --command "DELETE FROM cards WHERE video_id='ID'; DELETE FROM coverage WHERE video_id='ID'; DELETE FROM chunks WHERE video_id='ID'; UPDATE videos SET card_count = 0, fact_count = 0, analysed_at = NULL WHERE id='ID';"
```

## Known limits

- **Desktop Chrome only for listening.** Other browsers can still read cards that are already saved.
- **The video has to play in real time** for its transcript to be built, and only the parts that actually played get cards.
- **Accuracy depends on Chrome's speech recognition.** It is weaker than captions on names and numbers. Chrome sends the audio to its recognition service.
- **The first listener's transcript stands.** The limits above make false transcripts slow and scarce, but a person who passes the bot check can still submit invented text for a video nobody has covered. Cards show only quotes found in that text. Watch for this and remove such cards with the command above.
- **YouTube's terms** restrict separating the audio of embedded content. Review the [developer policies](https://developers.google.com/youtube/terms/developer-policies) before launching publicly.
