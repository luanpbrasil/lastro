# Lastro (web app)

A web version of Lastro. Paste a YouTube link, press **Listen to this video**, and the page transcribes the tab's audio and shows fact-checked context cards.

This folder also holds a Chrome extension (`extension/`) that brings the same overlay and cards onto youtube.com itself, analysing videos from their captions: see [Chrome extension](#chrome-extension). The page and the extension share the interface code in `src/web/` and the Worker.

Three pages: the app at `/` (`index.html`), a landing page at `/about` (`about.html`) and the privacy policy at `/privacy` (`privacy.html`, also the Chrome Web Store listing's privacy policy; keep it in step with what the Worker stores). The app's interface is in English or Brazilian Portuguese, from the system language (`src/web/i18n.ts`); the landing page is in English. The model writes each card's headline and paraphrase in the language of the video. The knowledge-graph names and summaries from `../shared/` stay in Portuguese.

```
Page: YouTube IFrame player
  │  POST /api/videos/:id/sessions      a token for this video
  │  getDisplayMedia (this tab, with audio) → SpeechRecognition.start(audioTrack), pt-BR
  │  GET /api/videos/:id/language       the spoken language, detected once (YouTube original audio → auto captions → title)
  │  speech recognition in that language (30 to pick from, overridable); the raw transcript goes to the Worker
  │  POST /api/videos/:id/transcript    15 s after starting, then every 30 s (sooner after ~900 characters)
  ▼
Worker: stores the chunk, then
  │  one streamed Claude Haiku 5.5 call (fallback: Workers AI, GLM 4.7 Flash); each card is checked and saved as soon as it is written
  │  fact cards → official value from BCB / IBGE → confere / diferente
  ▼
D1: videos, chunks, coverage, cards, sessions, daily limits
  ▲
  │  GET /api/videos/:id/cards?after=<cursor>   every 3 s while active, 30 s when idle, paused in a background tab
  │  GET /api/videos                            the history of analysed videos
Page: shows the cards and the history
```

Polling is the only way cards reach the page, so a video someone has already listened to shows its cards right away. The "Recently analysed" list under the player opens any of them.

The prompt, card schema, knowledge graph and official-data code come from `../shared/`. Everything else is separate from the extension and its Worker.

## Design

**The player overlay is the extension's.** `src/web/overlay.ts` and `src/web/timeline.ts` port `../extension/src/overlay.ts` and `timeline.ts`: a pill over the video ("● Lastro · 7 ideas", with a pause button), one card that pops when its moment plays, and the list of every idea with a "Now" line at the playhead. Pop-up rules:
- at least 40 s between pop-ups, none in the first 10 s, each idea once, never over the open list;
- cards saved earlier pop as the playhead reaches them, exactly as in the extension;
- cards analysed while you listen arrive minutes after the speech, so they pop when they arrive.

On a narrow player the overlay moves below it (a container query on `.screen`). Fact cards carry a thinned slice of the official series (`check.official.series`, 36 points) for their chart, so the page never calls BCB or IBGE itself. Cards saved before that change show no chart.

**The video is the page.** The app (`/`) has a one-line toolbar (mark, link field, "How it works") and then the player, sized from the window height (`100svh` minus the toolbar and the Listen row), so the video, its cards and the Listen button are on screen without scrolling, from 1280×720 up. The recent videos sit below it, or right under the toolbar when no video is open.

**Navigation is flat.** In the list, a row opens its card in one click, and its time jumps the video there. A card has a bar with "All ideas", ‹ "3 of 12" › to step through the ideas in order (or ← → on the keyboard), and ×; Esc closes. A card the viewer opened stays put: pop-ups wait in the "+N new" chip until it is closed. The overlay is dark glass in both themes (a blurred, translucent panel, like a player's own controls), with its own colour tokens, so the shared card parts follow it. The filled green style belongs to the `.btn` class only, so it never leaks onto the overlay's buttons. The panel has one fixed size whatever it shows (list or card, short or long, up to 380 × 580 px). Content scrolls inside it, and the "+N new" chip sits beside the pill, so nothing ever resizes or moves the panel. Changing what it shows is a shared-axis transition inside the same panel: forward (list → card, ›) the old view fades out drifting left and the new one fades in from the right; back (card → list, ‹) the reverse. The list comes back at the scroll position it was left at; live list updates swap in place; only opening and closing animate the panel itself. With reduced motion, views swap at once.

**Two pages, no header or footer.** The app is at `/` and the landing page at `/about` (`about.html`, `src/web/about.ts`). The landing page's screenshots are HTML built from the same `.ov-*` components and drawn at a fixed size, then scaled to fit, so they match the real interface. "How it works" switches its screenshot as each step reaches the middle of the screen.

**Style.** One stylesheet (`src/web/style.css`), with colours as tokens on `:root` and a dark theme from `prefers-color-scheme`. One typeface, Schibsted Grotesk (variable), self-hosted from `@fontsource-variable/schibsted-grotesk` because the CSP allows fonts from this site only. Palette: warm paper, near-black ink, and a deep ledger green as the only accent, with gold for the mark and brick for "differs". The mark is `public/favicon.svg`, also inlined in each page: an L, for Lastro, with a gold block resting on its base, the reserve that backs a currency. Motion respects `prefers-reduced-motion`.

## Languages

Chrome's speech recognition can't detect the language. It must be told, and the wrong one returns almost nothing: one phrase in 9 minutes of an English video recognised as Portuguese. So when a video opens, `GET /api/videos/:id/language` (`src/worker/language.ts`) works out the language:

1. **Original audio track.** For an auto-dubbed video, YouTube lists several audio tracks, and the original is the one that isn't a dub ("Portuguese (BR) original").
2. **Automatic captions.** YouTube's automatic (`asr`) caption track is generated in the spoken language.
3. **Title.** Common words of six languages; it decides only clear cases.
4. Otherwise the viewer's last choice, then the browser's language.

The Worker reads YouTube's watch page only as far as the player data (about 0.9 MB in) and never scans it twice, to stay inside the free plan's 10 ms of CPU. Only the video id is sent, nothing about the viewer. The result is kept in `videos.lang`, so each video is looked up once.

**The Chrome extension never calls this endpoint.** It reads the same player data from the YouTube page the viewer already has open (`movie_player.getPlayerResponse()`, else `ytInitialPlayerResponse`, only when its video id matches; `extension/src/hook.ts`) and applies the same steps 1–3 in the content script. Both sides share `src/language-detect.ts`, so they give the same answer (`tests/language.test.mjs`). Then the extension falls back to the language of the captions it loaded, then the browser's: it has no language picker, so there is no viewer choice to remember. This keeps the Worker from fetching YouTube from Cloudflare's IPs for every extension user (block risk) and spends none of its CPU.

The page preselects the detected language in the picker ("English · detected") and says where it came from. If nothing is recognised 45 s after listening starts, it suggests checking the language. The chosen language also goes into the prompt, so the model knows what Chrome was set to.

## The prompt

`SYSTEM` in `src/worker/factcheck.ts`, in English, for both models. It is written for Chrome's live recognition:
- no punctuation, misheard names and acronyms, spelled-out numbers;
- any language: the model reads through the errors;
- the quote must still be copied exactly, because that is how a card is placed on the timeline.

It asks for recall on substance: a card for every claim a viewer could want context on (where the idea comes from, who disagrees, what the data says), about one every 20–40 s of argument. Cards are kept even when no node of the map fits.

Each card has a `headline` (3–9 words, used as its title in the list) and a paraphrase that attributes the claim to the speaker, both in the language of the video. `headline` is an addition to the shared schema for this page only. Indicators are used only for figures about Brazil. Any other fact with a number shows as "not checked".

**Context and counterpoint (p9, Claude only).** After all units, Claude writes a `notes` array, one note per unit, as the extension's Worker does (`shared/prompt.ts`; the rules are in `src/worker/notes.ts`):
- `context`: why the claim belongs to its first node, in the speaker's own terms. The card shows it under "The idea behind it", before the node's summary.
- `counterpoint`: how the opposing view would answer. It is kept only when the model names (`against`) a view the card already lists under "Who disagrees" (`shared/stance.ts`); otherwise that list keeps the map's note on the link.
- Both may use only the transcript and the map: no new names, numbers, dates or works, no party or politician, never who is right.

The notes come after the units because, written inside each unit, they changed which nodes the model picked. A card is saved to D1 once its note arrives (the page polls new cards by id, so a card saved earlier would never show its note), so a chunk's cards land a few seconds later than before. A reply cut off in the notes still saves every card, without context. Workers AI is not asked for notes (`SYSTEM_NO_NOTES`, same schema without `notes`): its neuron budget was measured on the shorter reply. Its cards, and cards saved before p9, show the layout without context. Cards are stored as JSON, so no migration was needed.

`pnpm eval:web` (repository root) runs the gold eval on this path: each gold transcript is cut into the page's uploads, analysed with the Worker's context and known ideas, and checked like the root eval. Recorded replies in `fixtures/web-streams/` replay at $0; `-- --live --tag <name> --runs 3` records new ones.

On the eval transcripts (via Workers AI, since no Anthropic key was available locally), 2 minutes of English ASR-style speech gave 10 cards, and the 13 real Portuguese uploads from production gave 36 cards (9 under the old prompt).

## Run locally

Run these from this folder, after `pnpm install` in the repository root and `pnpm wrangler login`. Workers AI needs a Cloudflare account with a `workers.dev` subdomain configured through Workers & Pages, even for local development. This does not require deploying the app.

1. Create the local database: `pnpm db:local`
2. Start it: `pnpm dev`. Vite serves the page with hot reload and runs the Worker in workerd, Cloudflare's runtime, with a local D1.
3. Open http://localhost:8788 in desktop Chrome. Tab capture needs `localhost` or HTTPS.
4. Paste a link, press **Listen to this video**, choose **this tab**, turn on **Share tab audio**. The video starts playing.

The first cards show up about 25–40 s after listening starts and then keep coming: the page uploads every 30 s, Claude's reply is streamed, and each card is saved the moment it is complete, so the page's next poll (every 3 s) shows it. To use Claude locally, put `ANTHROPIC_API_KEY=…` in `webapp/.dev.vars` (never committed); without it, local runs use Workers AI only. Local runs call the real services: Claude bills your Anthropic account, and Workers AI uses your Cloudflare account's free neurons, neither counted by the deployed app's daily caps.

## Deploy

The D1 database `lastro-live` already exists and its id is in `wrangler.toml`. To deploy:

```bash
pnpm db:remote     # applies any new migrations
pnpm wrangler secret put ANTHROPIC_API_KEY   # once; skip it to run on Workers AI only
pnpm run deploy    # vite build, then wrangler deploy (`run` is needed: `pnpm deploy` is a pnpm built-in)
```

`pnpm preview` builds and serves the production output locally, with the `_headers` security headers that `pnpm dev` leaves out.

The app is served at `https://lastro-live.<your-subdomain>.workers.dev`. For a new account, create the database first with `pnpm wrangler d1 create lastro-live` and put its id in `wrangler.toml`.

## Model

**Claude Haiku 5.5** (`claude-haiku-5-5`, Anthropic API) analyses each upload: no thinking, low effort, the JSON schema enforced by structured outputs, and the system prompt cached between calls. It uses the same prompt, schema and checks as the fallback, so cards look the same whichever model wrote them.

**Workers AI is the fallback**, used when:
- `ANTHROPIC_API_KEY` isn't set,
- the day's `DAILY_USD_CAP` is reached,
- or the Claude call fails: API error, rate limit, a 45 s timeout (one retry inside it), or a refusal. Haiku has no server-side fallback, so the Worker gives the dollar reservation back, reserves neurons and runs Workers AI on the same chunk.

`chunks.model` records which model wrote each chunk's cards, and `wrangler tail` logs `claude_failed` with the reason whenever the fallback runs.

### Fallback model

GLM 4.7 Flash (`@cf/zai-org/glm-4.7-flash`). On 2026-11-10 it was compared with every Workers AI text model that has no deprecation date and runs on the Free plan, on the labelled transcripts in `eval/`, both as captions and as lowercase unpunctuated text like Chrome's:

| Model | Time per call | Gold checks | Neurons per call |
|---|---|---|---|
| **GLM 4.7 Flash** | 8–24 s | 59/61 | 22–53 |
| Gemma 4 26B-A4B | 15–32 s | 58/60 | 35–64 |
| Llama 4 Scout 17B | 13–19 s | 62/64 | 85–135 |
| Qwen 3.8 27B | 21–42 s | 59/61 | 154–439 |
| gpt-oss-20b | 13–17 s | 6/26 (no cards) | 65–108 |

None is both faster and more accurate, and the others cost 1.3–8× the neurons. DeepSeek V4.1 Flash needs the Workers Paid plan. The time is mostly the answer being written (about 30 tokens/s), so streaming the cards would cut the wait more than another model. On a 3-minute batch GLM 4.7 Flash wrote 10–11 cards, passed 31–32/32 checks and used about 75 neurons.

## Costs

Cloudflare is sized to stay inside its free allowances. The Anthropic API is paid: one 3-minute upload costs about $0.001–0.003 with Haiku 5.5 ($0.10/M input, $0.50/M output, cached input $0.01/M). `DAILY_USD_CAP` (default $1) caps it per UTC day: each call reserves $0.004, the most one upload can cost (4500 output tokens: since p9 Claude also writes context and counterpoint), and gives back the difference afterwards. Past the cap, uploads go to Workers AI, and once both are used up new analyses stop until 00:00 UTC. To check the day's spend: `pnpm wrangler d1 execute lastro-live --remote --command "SELECT * FROM usage_daily ORDER BY day DESC LIMIT 7"`. Also set a spend limit on the API key's workspace in the Anthropic Console as a backstop.

| Service | Free allowance | How the app stays inside it |
|---|---|---|
| Workers AI | 10000 neurons/day | `DAILY_NEURON_CAP` = 9000, reserved before each call, so simultaneous requests can't overrun it. The page says when the day's limit is reached |
| Workers | 100000 requests/day | Polling every 5 s only while analysing, 30 s otherwise, nothing from background tabs. Per-connection rate limit |
| D1 | 5 M rows read, 100 k written/day | Indexed queries. The history reads at most 24 rows |
| Static assets | Free | – |

With 30-second uploads, Claude Haiku costs about $0.001 per upload, about $0.10 per hour of listening, so the default $1 cap is about 10 hours a day. The Workers AI fallback uses about 35 neurons per upload, so 9000 neurons is about 2 hours of fallback a day. Each call reserves 170 neurons, the most one upload can cost, and gives back the difference afterwards. When the cap is reached, new analyses stop until 00:00 UTC and saved cards keep working.

Cloudflare's free allowance is per account. If anything else on the account uses Workers AI, lower `DAILY_NEURON_CAP`. On the Workers Free plan Cloudflare never bills; on the Paid plan the cap is what keeps the bill at zero. Free Workers also get 10 ms of CPU per request: the app's work is light, but check `wrangler tail` for CPU errors after deploying.

## Chrome extension

`extension/` is Lastro for youtube.com, built from this app's code: the same overlay (`src/web/overlay.ts`, `overlay.css`, `cardview.ts`, `timeline.ts`), strings (`i18n.ts`), uploader and speech recognition (`transcriber.ts`), and the same Worker and D1. It replaces the first extension (`../extension`) and its Worker for this app; the two can be installed side by side, but there's no reason to.

```
YouTube tab
  │  hook.ts (page world)      passes on the player's own caption responses and video details; no extra requests
  │  content.ts                the overlay, in a shadow root inside the player; the video's clock
  │    1. the video's saved cards, at once (GET /cards, as on the page)
  │    2. economy or politics video (title + description, ../shared/topics.ts), or "Analyse this video":
  │       its captions (turned on and hidden while read; for an auto-dubbed video, the original language's track),
  │       else YouTube's transcript panel
  │       → GET /coverage, then POST /sessions {source: "captions"} and ~2500-character chunks to POST /transcript,
  │         from the playhead forward, then the rest; parts the video already has cards for are skipped
  │    3. no captions: "click Lastro in the toolbar" → listening
  ▼
background.ts (service worker): every Worker request, from the extension's origin
  │  toolbar icon / Alt+Shift+L → chrome.tabCapture stream id → offscreen.ts
  ▼
offscreen.ts: holds the tab's audio (and plays it back: capturing mutes the tab), SpeechListener → phrases → the tab,
  which times them on the video and uploads them like the page (POST /sessions, POST /transcript every 30 s)
```

Captions cards are ready before their moment: the chunk around the playhead goes first, each answered once its cards are saved, so a 10-minute video is analysed in about a minute and an hour in a few. A card analysed for a part already behind the playhead goes to the list instead of popping up. Listening works like the page: ideas show up about half a minute after they're said.

Chrome only gives an extension a tab's audio after the viewer invokes it, so listening starts from the toolbar icon (or its shortcut), not from a button in the overlay. Clicking it again stops. On a video whose captions are being used, the icon opens the list of ideas.

**Build and load**

```bash
pnpm ext:build                      # → extension/dist, talking to https://lastro.lovu.club
pnpm ext:build --worker http://127.0.0.1:8788  # one-off build for the local app
node extension/build.mjs --worker https://<other-worker>   # another deployment
pnpm ext:dev                        # rebuilds on change, talking to `pnpm dev` (http://127.0.0.1:8788)
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `webapp/extension/dist`. After a rebuild, press the reload arrow on the extension's card; open YouTube and X tabs pick up their respective scripts without a reload.

**The Worker side.** The Worker accepts writes from the extension's origin as well as its own (`EXTENSION_ORIGINS` in `wrangler.toml`, `chrome-extension://<id>`). The `key` in `extension/manifest.json` (a public key; there's no private key to keep) fixes the unpacked extension's id to `ohhohhbaolbbkfkfmjamaghddfchejkk`. The Chrome Web Store gives an item its own id: after uploading, add `chrome-extension://<store id>` to `EXTENSION_ORIGINS` and redeploy. Like the same-site check, this keeps other websites from using the API through their visitors' browsers; it isn't authentication, so the caps below are what bound use. Captions sessions (`source: "captions"`, migration `0007`) may send ten times faster than speech, with their own cap per video (`MAX_CAPTION_MINUTES_PER_VIDEO`).

**Who can install it.** Publish it as **Private** in the Chrome Web Store with a list of trusted testers (Google accounts), or share the `dist` folder zipped for **Load unpacked**.

**Checking listening.** The offscreen page counts what it hears: on `chrome://extensions`, under Lastro, inspect `offscreen.html` while listening and type `lastroStats` (phrases, words, errors, audio level).

## Abuse limits

All set in `wrangler.toml`. A refused request never reaches the AI.

| Limit | Default | What it stops |
|---|---|---|
| `DAILY_USD_CAP` | $1 per day | Anthropic API spend. Set it to 0 to send everything to Workers AI |
| `DAILY_NEURON_CAP` | 9000 per day | Workers AI use: stays inside the free 10000. Set both caps to 0 to stop new analyses at once |
| `IP_DAILY_VIDEO_CAP` | 3 videos per connection per day | One person using up the day's neurons |
| `MAX_MINUTES_PER_VIDEO` | 15 minutes analysed | One long video using up the day's neurons |
| `MAX_CAPTION_MINUTES_PER_VIDEO` | 60 minutes analysed, from captions (the extension) | The same, for captions |
| `IP_SESSION_CAP` | 6 sessions per connection per 2 hours | Repeatedly opening sessions |
| Real-time pacing | 30 characters/s (captions: 300), one upload per 10 s | Pouring in hours of text at once |
| `API_LIMITER` | 60 requests per minute per connection, approximate | Flooding the API |

A video takes one slot per day however many people listen to it, and already-covered parts cost nothing.

With the extension, every economics video someone opens takes a session and, if new, a video slot. Three videos a day and six sessions every 2 hours per connection suit the page's occasional listening; for regular extension use, raise `IP_DAILY_VIDEO_CAP` and `IP_SESSION_CAP` (the dollar and neuron caps still bound the total).

## Endpoint protection

- **Same-site writes only.** POSTs must be JSON, and are refused when the browser reports another origin (`Origin`, `Sec-Fetch-Site`), except the Lastro extension's (`EXTENSION_ORIGINS`). Request bodies over 48 KB are refused before they are read.
- **Strict validation.** Video ids, cursors, segment times and text lengths are all checked. Unknown routes and methods get 404 or 405.
- **No internals in errors.** Every error is a short code. Unexpected failures are logged and answered with `unavailable`.
- **Security headers.** `public/_headers` sets a CSP that only allows YouTube's player, plus `frame-ancestors 'none'`, so no other site can frame the page and trick someone into sharing a tab. It also sets nosniff, a referrer policy and HSTS. API responses send `default-src 'none'`.
- **Sessions.** Tokens are 256-bit random, stored only as a hash, bound to one video, and expire after 2 hours.

## Prompt injection

The transcript is posted by any page and the title is chosen by whoever uploaded the video, so both are treated as hostile.

- **In:** before text is stored or sent to the model, it is cut down to what speech contains: letters, digits and basic punctuation. Markup, braces, role tags, control and invisible characters are removed, and segments are capped at 600 characters. The data is fenced in the prompt between `<<<DADOS>>>` and `<<<FIM DOS DADOS>>>`. Since `<` can't reach the data, nothing inside can close the fence. The system prompt says that anything inside is speech, never instructions.
- **Out:** every field the model returns is checked. Node ids, indicators, kinds and roles must come from fixed lists, and the quote must really be in the new part of the transcript. The paraphrase, headline, context and counterpoint can't contain links, addresses, handles or markup, and all are rendered as text only. Since they are written in the video's language, their wording isn't checked. Anything else is dropped.
- **No authority:** the model never decides whether a claim is true. "confere" or "diferente" comes from BCB and IBGE data in code, and links only ever point to those official sources. The model has no tools, secrets or other users' data to leak.

What it can't stop: someone who says an injection out loud gets a card only if that sentence is an economic idea. The card then quotes it and attributes it to the speaker, which is accurate.

## Transcript log

Every upload from a valid session is logged in `transcript_log`: time, video, session, outcome (`accepted`, `skipped`, or the refusal code) and all segments as received after cleaning. Nothing about the sender is kept: no IP, country or browser. Rows older than `LOG_RETENTION_DAYS` (30) are deleted automatically. The API never exposes this table, and the page tells viewers what is kept.

The limits per connection use a hash of the IP. It is kept only while needed: up to 2 hours in `sessions`, and until the end of the UTC day in `daily_videos`.

```bash
# latest uploads
pnpm wrangler d1 execute lastro-live --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS at, video_id, outcome, substr(segments,1,120) AS text FROM transcript_log ORDER BY id DESC LIMIT 50"
# everything one listening session sent
pnpm wrangler d1 execute lastro-live --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS at, video_id, outcome, segments FROM transcript_log WHERE session_hash='HASH' ORDER BY id"
```

## Removing a video

To remove a video's cards so it can be analysed again:

```bash
pnpm wrangler d1 execute lastro-live --remote --command "DELETE FROM cards WHERE video_id='ID'; DELETE FROM coverage WHERE video_id='ID'; DELETE FROM chunks WHERE video_id='ID'; UPDATE videos SET card_count = 0, fact_count = 0, analysed_at = NULL WHERE id='ID';"
```

## X post context

The newer extension also contextualizes selected public Portuguese X posts on
home, detail, search, and profile feeds. Use the Lastro action in the post header;
the toolbar action remains YouTube listening. The standalone app has no X-post
paste input. See the [X feature contract](../docs/features/x/README.md) for the
experience, source boundaries, persistence, comparisons, and known limitations.

For request/storage and browser fixture checks, use
`pnpm --filter lastro-live run test:posts` from the repository root. The suite
runs Worker checks before extension checks, following observed local workerd
stalls in overlapping or Chrome-first runs. Install desktop Google Chrome for
fixtures; controlled inputs do not establish live site or provider quality.
See [contribution verification](../CONTRIBUTING.md#verification).

## Known limits

- **Desktop Chrome only for listening.** Other browsers can still read cards that are already saved.
- **The video has to play in real time** for its transcript to be built, and only the parts that actually played get cards.
- **Accuracy depends on Chrome's speech recognition.** It is weaker than captions on names and numbers. Chrome sends the audio to its recognition service.
- **The first listener's transcript stands.** The limits above make false transcripts slow and scarce, but anyone, including a script, can still submit invented text for a video nobody has covered. Cards show only quotes found in that text. Watch for this and remove such cards with the command above.
- **YouTube's terms** restrict separating the audio of embedded content. Review the [developer policies](https://developers.google.com/youtube/terms/developer-policies) before launching publicly.
