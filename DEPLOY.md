# Deploy the hosted demo

This puts the Lastro server (a Cloudflare Worker) online and pre-analyses the demo videos. One deploy ships three things:

- the API the extension uses, so judges can install it with no API key and no local server;
- `/`, a landing page, and `/demo`, where judges see Lastro over a YouTube player with nothing to install;
- the cards for the demo videos, in the cache.

About 30 minutes. Steps marked **check** must pass before you go on. If one fails, stop and tell Luan.

## What you need

- Node.js 20 or newer (`node -v`), git, Google Chrome.
- Your own Cloudflare account (free plan is enough).
- Collaborator access to `luanpbrasil/lastro` on GitHub (Luan adds you).
- **A dedicated Anthropic API key for the demo**, from Luan. It lives in its own Console workspace with a spend limit (~$5), so it can be revoked without touching anything else.
  - Never send the key by chat, email, WhatsApp or Slack, and never put it in a file in the repo. Either Luan invites you to that Console workspace and you create the key there, or he sends it with a one-time secret link from a password manager.
  - You only ever paste it into the `wrangler secret put` prompt in step 4. Not in a command line, not in `.dev.vars`.

The spending limits are already in `wrangler.toml` under `[env.production]` (approved by Luan on 2026-11-08). Don't change them without asking him:

| Setting | Value | Meaning |
|---|---|---|
| `MAX_SPEND_USD` | 3 | The server stops calling Claude once it has spent $3 in total; cached cards keep working. |
| `DAILY_CAP` | 100 | New analyses per day, all users together. |
| `FORCED_DAILY_CAP` | 20 | Of those, analyses of videos the topic check rejected ("Analisar este vídeo"). |
| `IP_DAILY_CAP` | 10 | New analyses per day from one connection. IPs are stored only as a short hash, for 2 days. |
| `ALLOW_CACHE_BYPASS` | 0 | Dev-only switch, off. |

## 1. Get the code

```bash
git clone https://github.com/luanpbrasil/lastro.git
```

```bash
cd lastro && npm install
```

## 2. Log in to Cloudflare

```bash
npx wrangler login
```

```bash
npx wrangler whoami
```

**Check:** `whoami` shows your own account.

## 3. Create the cache storage (KV namespace)

```bash
npx wrangler kv namespace create CARDS --env production
```

It prints an `id` (32 hex characters). If wrangler offers to edit `wrangler.toml` for you, say no. Open `wrangler.toml` and replace `REPLACE_WITH_PRODUCTION_KV_ID` (in the `[[env.production.kv_namespaces]]` block, near the end) with that id. The id is not a secret.

**Check:** `grep REPLACE_WITH wrangler.toml` prints nothing.

## 4. Deploy and set the key

```bash
npx wrangler deploy --env production
```

The first time, Cloudflare may ask you to pick a `workers.dev` subdomain. At the end it prints the URL, like `https://lastro.<your-subdomain>.workers.dev`. Below, `$URL` means that address.

```bash
npx wrangler secret put ANTHROPIC_API_KEY --env production
```

Paste the demo key at the prompt and press Enter. The prompt doesn't show it or save it in your shell history.

## 5. Free checks ($0, no Claude calls)

```bash
curl -s $URL/health
```

**Check:** `{"ok":true,"promptVersion":"p8","model":"claude-haiku-5-5"}`.

```bash
curl -s $URL/spend
```

**Check:** `"total":0` and `"maxSpendUsd":3`.

```bash
npm run analyze -- eval/transcripts/TESTcook001.json --base $URL
```

**Check:** it prints `422 {"error":"off topic",...}`. That's a cake recipe: the server must refuse it before calling Claude.

The judge site is served by the same Worker (built automatically by `wrangler deploy`):

```bash
for p in / /demo/ /api/demo/cards/1FzdBFDbMUs /api/demo/cards/nc55w2yFyoE; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' $URL$p)"; done
```

**Check:** `/` 200, `/demo/` 200, `/api/demo/cards/1FzdBFDbMUs` 200 (recorded cards ship with the Worker), `/api/demo/cards/nc55w2yFyoE` 404 (not analysed yet: the page shows "being prepared"). Then open `$URL/demo/` in a browser: the video list shows, and the pill says `Lastro · ligado · 9 ideias` on the first video.

## 6. Build the extension for the hosted server

```bash
node extension/build.mjs --prod --worker $URL
```

In Chrome: `chrome://extensions` → Developer mode → remove any older Lastro → **Load unpacked** → `lastro/extension/dist-demo`.

## 7. Pre-analyse the demo videos (~$0.02–0.03 in total)

Open each video in Chrome, let it play until the pill in the bottom-right corner says `Lastro · ligado · N ideias`, then move to the next. Each new video takes 5–15 seconds.

1. https://www.youtube.com/watch?v=1FzdBFDbMUs
2. https://www.youtube.com/watch?v=wOpqx7XvD54
3. https://www.youtube.com/watch?v=nc55w2yFyoE
4. https://www.youtube.com/watch?v=p7YTkl30MQ4
5. https://www.youtube.com/watch?v=M4xUpAnuMJ4
6. https://www.youtube.com/watch?v=4wZdCOvolDU
7. (optional) https://www.youtube.com/watch?v=rtIxeUMZj-M

If the pill says `fora do tema` (off topic) with an **Analisar este vídeo** button, click it: the topic check judges by title and description and can miss. All 7 passed it when checked on 2026-11-08.
If the pill says `sem legendas` (no captions), reload the tab once after any ad; if it persists, note the video and move on.

**Check:** run `curl -s $URL/spend`: `analysesToday` equals the number of videos that showed ideas, and `total` is a few cents.
Then reload one of the videos: the cards appear at once and `analysesToday` doesn't go up (cache hit).

**Check the judge demo now has every video** (each line should say `cache`):

```bash
for id in 1FzdBFDbMUs wOpqx7XvD54 nc55w2yFyoE p7YTkl30MQ4 M4xUpAnuMJ4 4wZdCOvolDU; do echo "$id $(curl -s $URL/api/demo/cards/$id | grep -o '"source":"[a-z]*"')"; done
```

Then open `$URL/demo/` and click through the videos: each one's cards load at once (the pill shows `N ideias`). Press **Rodar ao vivo** once (one Haiku call, ~$0.0015): cards appear one by one, with the time to the first card and the cost.

## 8. Send Luan

- The Worker URL.
- The KV id you put in `wrangler.toml` (or a pull request with that one-line change).
- The output of `curl -s $URL/spend` and of the `/api/demo/cards` loop above.
- Any video that showed `sem legendas`, an error, or 0 ideas.

He'll commit the URL into the judge build and update the README.

## Running it until 12-15

The demo has to stay up from submission (11-29) until the end of the public period (12-15).

- **Spend:** `curl -s $URL/spend` anytime. The server stops new analyses at $3; the Console workspace limit is the hard stop.
- **Pause new analyses, keep the cache:** `npx wrangler secret delete ANTHROPIC_API_KEY --env production`. Cached videos still work; new ones show an error.
- **Change a cap:** edit `[env.production.vars]` in `wrangler.toml` and run `npx wrangler deploy --env production`. Agree it with Luan first.
- **Logs:** `npx wrangler tail --env production` shows requests live.

## If something goes wrong

| You see | Why / fix |
|---|---|
| Deploy fails mentioning the KV id | Step 3 not done: the id is still the placeholder. |
| Pill says `analysis failed` | The key is missing or wrong: redo `secret put` (step 4). |
| `erro 402` | The $3 limit was reached. Ask Luan. |
| `erro 429` | A daily cap was reached (all users, per connection, or manual analyses). Resets at 00:00 UTC. |
| Pill says `servidor fora do ar` | The extension can't reach `$URL`: check step 6 used the right URL, then reload the extension and the tab. |
| `sem legendas` | YouTube didn't send captions for that video in this browser. |
