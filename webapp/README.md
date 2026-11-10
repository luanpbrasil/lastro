# Lastro ao vivo

A web version of Lastro with no extension. Paste a YouTube link, press **Ouvir este vídeo**, and the page transcribes the tab's audio and shows fact-checked context cards.

```
Page: YouTube IFrame player + bot check (Turnstile)
  │  POST /api/videos/:id/sessions      bot check → a token for this video
  │  getDisplayMedia (this tab, with audio) → SpeechRecognition.start(audioTrack), pt-BR
  │  POST /api/videos/:id/transcript    about once a minute
  ▼
Worker: stores the chunk, then
  │  one Workers AI call (GLM 4.7 Flash) → every card checked against the transcript and the knowledge graph
  │  fact cards → official value from BCB / IBGE → confere / diferente
  ▼
D1: videos, chunks, coverage, cards, sessions, daily limits
  ▲
  │  GET /api/videos/:id/cards?after=<cursor>   every 4 s while active, 15 s when idle
Page: shows the cards
```

Polling is the only way cards reach the page, so a video someone has already listened to shows its cards right away.

The prompt, card schema, knowledge graph and official-data code come from `../shared/`. Everything else is separate from the extension and its Worker.

## Run locally

Run these from this folder, after `npm install` in the repository root and `npx wrangler login`.

1. Create `webapp/.dev.vars` with Cloudflare's always-pass test secret: `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`
2. Create the local database: `npm run db:local`
3. Start it: `npm run dev`
4. Open http://localhost:8788 in desktop Chrome. Tab capture needs `localhost` or HTTPS.
5. Paste a link, press **Ouvir este vídeo**, choose **this tab**, turn on **share tab audio**. The video starts playing.

Cards show up about a minute after the speech. Local runs call the real Workers AI and use your account's neurons.

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

## Abuse limits

All set in `wrangler.toml`. A refused request never reaches the AI.

| Limit | Default | What it stops |
|---|---|---|
| `DAILY_VIDEO_CAP` | 20 different videos per UTC day | Total daily use. Set it to 0 to stop new analyses at once |
| `IP_DAILY_VIDEO_CAP` | 3 videos per connection per day | One person using up the day's videos |
| `DAILY_NEURON_CAP` | 30000 per day | Spending, whatever else happens. Reserved before each call, so simultaneous requests can't overrun it |
| `MAX_MINUTES_PER_VIDEO` | 30 minutes analysed | One long video using up the budget |
| `IP_SESSION_CAP` | 6 sessions per connection per 2 hours | Repeatedly opening sessions |
| Bot check | Required for every session | Scripts |
| Real-time pacing | 30 characters/s, one upload per 10 s | Pouring in hours of text at once |
| `API_LIMITER` | 60 requests per minute per connection, approximate | Flooding the API |

A video takes one slot per day however many people listen to it, and already-covered parts cost nothing.

At 30 minutes per video, 20 videos use about 30000 neurons, or about US$ 0.22 a day beyond the free 10000. A free Workers plan stops at 10000 neurons, which is around 200 minutes of video a day, and the page then says the chunk couldn't be analysed.

To remove a video's cards so it can be analysed again:

```bash
npx wrangler d1 execute lastro-live --remote --command "DELETE FROM cards WHERE video_id='ID'; DELETE FROM coverage WHERE video_id='ID'; DELETE FROM chunks WHERE video_id='ID';"
```

## Known limits

- **Desktop Chrome only for listening.** Other browsers can still read cards that are already saved.
- **The video has to play in real time** for its transcript to be built, and only the parts that actually played get cards.
- **Accuracy depends on Chrome's speech recognition.** It is weaker than captions on names and numbers. Chrome sends the audio to its recognition service.
- **The first listener's transcript stands.** The limits above make false transcripts slow and scarce, but a person who passes the bot check can still submit invented text for a video nobody has covered. Cards show only quotes found in that text. Watch for this and remove such cards with the command above.
- **YouTube's terms** restrict separating the audio of embedded content. Review the [developer policies](https://developers.google.com/youtube/terms/developer-policies) before launching publicly.
