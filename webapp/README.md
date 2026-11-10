# Lastro ao vivo

A web version of Lastro with no extension. Paste a YouTube link, press **Ouvir este vídeo**, and the page transcribes the tab's audio and shows fact-checked context cards.

```
Page: YouTube IFrame player
  │  getDisplayMedia (this tab, with audio) → SpeechRecognition.start(audioTrack), pt-BR
  │  POST /api/videos/:id/transcript   about every 30 s
  ▼
Worker: stores the chunk, answers 202, then in the background
  │  one Claude Haiku call over the chunk → cards checked against the transcript and the knowledge graph
  │  fact cards → official value from BCB / IBGE → confere / diferente
  ▼
D1: videos, chunks, coverage, cards, usage
  ▲
  │  GET /api/videos/:id/cards?after=<cursor>   every 4 s while active, 15 s when idle
Page: shows the cards
```

Polling is the only way cards reach the page, so a video someone has already listened to shows its cards right away.

The prompt, card schema, knowledge graph and official-data code come from `../shared/`. Everything else is separate from the extension and its Worker.

## Run locally

Run these from this folder, after `npm install` in the repository root.

1. Create `webapp/.dev.vars` with one line: `ANTHROPIC_API_KEY=your-key-here`
2. Create the local database: `npm run db:local`
3. Start it: `npm run dev`
4. Open http://localhost:8788 in desktop Chrome. Tab capture needs `localhost` or HTTPS.
5. Paste a link, press **Ouvir este vídeo**, choose **this tab**, turn on **share tab audio**. The video starts playing.

Cards show up about 30 seconds after the speech.

## Deploy

```bash
npx wrangler d1 create lastro-live     # put the id in wrangler.toml
npm run db:remote
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

## Limits

- **Desktop Chrome only for listening.** Other browsers can still read cards that are already saved.
- **The video has to play in real time** for its transcript to be built, and only the parts that actually played get cards.
- **Accuracy depends on Chrome's speech recognition.** It is weaker than captions on names and numbers. Chrome sends the audio to its recognition service.
- **Only one transcript per moment of a video.** The first listener to cover a 10-second stretch wins, and later ones cost nothing. A failed analysis frees its stretch for retry.
- **Transcripts aren't verified.** Anyone can post text for any video id and it becomes that video's cards for everyone. Add sign-in or a review step before opening this to the public.
- **Spend limits** are in `wrangler.toml`: `MAX_SPEND_USD`, `DAILY_CHUNK_CAP`, `IP_DAILY_CHUNK_CAP`.
- **YouTube's terms** restrict separating the audio of embedded content. Review the [developer policies](https://developers.google.com/youtube/terms/developer-policies) before launching publicly.
