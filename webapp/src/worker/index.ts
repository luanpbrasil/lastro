import type { Segment } from "../../../shared/schema";
import { sha256Hex } from "../../../shared/transcript";
import { MAX_CHUNK_CHARS, MAX_SEGMENTS, type CardsResponse, type CheckedCard, type CoverageResponse, type LanguageResponse, type ErrorCode, type SessionResponse, type StoredCard, type TranscriptResponse, type VideosResponse } from "../types";
import { CLAUDE_MODEL, factCheckChunk, factCheckWithClaude, MAX_NEURONS_PER_CALL, MAX_USD_PER_CALL, WORKERS_AI_MODEL } from "./factcheck";
import { detectLanguage } from "./language";
import { cleanSpeech, cleanTitle } from "./sanitize";
import { parsePost, postWithClaude, postWithWorkersAI } from "./posts";
import type { PostAnalysis, PostCard } from "../types";

interface Env {
  AI: Ai;
  DB: D1Database;
  API_LIMITER: RateLimit;
  /** Secret. When set, Claude Haiku is the main model and Workers AI the fallback. */
  ANTHROPIC_API_KEY?: string;
  DAILY_USD_CAP?: string;
  IP_DAILY_VIDEO_CAP?: string;
  DAILY_NEURON_CAP?: string;
  MAX_MINUTES_PER_VIDEO?: string;
  IP_SESSION_CAP?: string;
  LOG_RETENTION_DAYS?: string;
  /** Captions time analysed per video, for sessions that send a video's captions (the Chrome extension). */
  MAX_CAPTION_MINUTES_PER_VIDEO?: string;
  /** The Chrome extension's origins ("chrome-extension://<id>", comma-separated), allowed to send like the page. */
  EXTENSION_ORIGINS?: string;
}

type TextSource = "speech" | "captions";

const BUCKET_MS = 10_000;
const MAX_VIDEO_MS = 24 * 3600 * 1000;
const MAX_BODY_CHARS = 48_000;
/** A chunk still pending after this long was lost with its Worker. */
const STALE_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 2 * 3600 * 1000;
const CONTEXT_SEGMENTS = 10;
const KNOWN_IDEAS = 20;
const MAX_CARDS_PER_POLL = 100;
/** A session can only send text as fast as someone can speak it, so nobody can pour in hours of text at once. */
const CHARS_PER_SECOND = 30;
const CHAR_BURST = 1200;
const MIN_CHUNK_INTERVAL_MS = 10_000;
/**
 * Captions come whole with the video, so a captions session may send faster than anyone speaks: about ten times,
 * enough to analyse an hour of video in a few minutes. Its own cap per video (MAX_CAPTION_MINUTES_PER_VIDEO) and the
 * daily budget still bound it.
 */
const CAPTION_CHARS_PER_SECOND = 300;
const CAPTION_BURST = 12_000;

const today = () => new Date().toISOString().slice(0, 10);
const bucketOf = (s: Segment) => Math.floor(s.s / BUCKET_MS);
const num = (v: string | undefined, fallback: number) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));
const hashIp = async (req: Request) => (await sha256Hex(`lastro-live:${req.headers.get("cf-connecting-ip") ?? "local"}`)).slice(0, 16);

const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}
const refuse = (error: ErrorCode, status: number) => json({ error }, status);

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const isExtension = (env: Env, origin: string) =>
  EXTENSION_ORIGIN.test(origin) && (env.EXTENSION_ORIGINS ?? "").split(",").some((o) => o.trim() === origin);

/**
 * Writes must come from this site's own page or the Lastro extension: JSON only (an HTML form can't send it) and, when
 * the browser says where the request comes from, this origin or an allowed extension. Other websites can't make
 * their visitors' browsers send text here. This isn't authentication (any program can set these headers): the
 * per-connection and daily caps are what bound use.
 */
function checkWrite(req: Request, url: URL, env: Env): Response | null {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return refuse("bad_request", 415);
  const origin = req.headers.get("origin");
  const extension = !!origin && isExtension(env, origin);
  if (origin && origin !== url.origin && !extension) return refuse("forbidden", 403);
  const site = req.headers.get("sec-fetch-site");
  if (!extension && site && site !== "same-origin" && site !== "none") return refuse("forbidden", 403);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_CHARS) return refuse("bad_request", 413);
  return null;
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return refuse("bad_request", 404);
  const { success } = await env.API_LIMITER.limit({ key: await hashIp(req) });
  if (!success) return refuse("rate_limited", 429);
  if (req.method === "POST") {
    const bad = checkWrite(req, url, env);
    if (bad) return bad;
  } else if (req.method !== "GET") return refuse("bad_request", 405);

  if (url.pathname === "/api/videos" && req.method === "GET") return getVideos(env);
  if (url.pathname === "/api/posts/analyze" && req.method === "POST") {
    const work = analysePost(req, env);
    ctx.waitUntil(work);
    return work;
  }
  const postResult = url.pathname.match(/^\/api\/posts\/results\/([0-9a-f-]{36})$/);
  if (postResult && req.method === "GET") return getPostResult(env, postResult[1]);
  const m = url.pathname.match(/^\/api\/videos\/([A-Za-z0-9_-]{11})\/(sessions|transcript|cards|language|coverage)$/);
  if (m && m[2] === "language" && req.method === "GET") return getLanguage(env, m[1]);
  if (m && m[2] === "coverage" && req.method === "GET") return getCoverage(env, m[1]);
  if (m && m[2] === "sessions" && req.method === "POST") return postSession(req, env, m[1]);
  if (m && m[2] === "transcript" && req.method === "POST") return postTranscript(req, env, ctx, m[1]);
  if (m && m[2] === "cards" && req.method === "GET") {
    const after = url.searchParams.get("after") ?? "0";
    if (!/^\d{1,10}$/.test(after)) return refuse("bad_request", 400);
    return getCards(env, m[1], Number(after));
  }
  return refuse("bad_request", 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      // Never send internals (SQL, stack traces) to the client.
      console.error("unhandled", err instanceof Error ? err.message : String(err));
      return refuse("unavailable", 500);
    }
  },
};

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_CHARS) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseSegments(raw: unknown): Segment[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SEGMENTS) return null;
  const out: Segment[] = [];
  let chars = 0;
  for (const x of raw as Partial<Segment>[]) {
    const { s, d, t } = x ?? {};
    if (typeof s !== "number" || typeof d !== "number" || typeof t !== "string") return null;
    if (!Number.isFinite(s) || !Number.isFinite(d) || s < 0 || s > MAX_VIDEO_MS || d < 0 || d > MAX_VIDEO_MS) return null;
    chars += t.length;
    const text = cleanSpeech(t);
    if (text) out.push({ s: Math.round(s), d: Math.round(d), t: text });
  }
  if (chars > MAX_CHUNK_CHARS || out.length === 0) return null;
  return out.sort((a, b) => a.s - b.s);
}

/** The video's row, created on first sight with its title from YouTube. Null when YouTube says the video doesn't exist. */
async function ensureVideo(env: Env, id: string): Promise<{ title: string } | null> {
  const row = await env.DB.prepare("SELECT title FROM videos WHERE id = ?").bind(id).first<{ title: string }>();
  if (row) return row;
  let title = "";
  let author = "";
  try {
    const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
    const r = await fetch(`https://www.youtube.com/oembed?url=${watch}&format=json`, { signal: AbortSignal.timeout(4000) });
    if (r.status === 400 || r.status === 404) return null;
    if (r.ok) {
      const j = (await r.json()) as { title?: string; author_name?: string };
      // The video's owner chooses the title, so it goes into the prompt only after the same cleaning as the transcript.
      title = cleanTitle(String(j.title ?? ""));
      author = cleanTitle(String(j.author_name ?? ""));
    }
  } catch {
    /* the title only helps the model: go on without it */
  }
  await env.DB.prepare("INSERT OR IGNORE INTO videos (id, title, author, created_at) VALUES (?, ?, ?, ?)").bind(id, title, author, Date.now()).run();
  return { title };
}

/** A token that lets this page send transcript for this one video: speech heard in the tab, or the video's captions. */
async function postSession(req: Request, env: Env, videoId: string): Promise<Response> {
  const source: TextSource = (await readBody(req))?.source === "captions" ? "captions" : "speech";
  if (!(await ensureVideo(env, videoId))) return refuse("video_not_found", 404);

  const now = Date.now();
  const day = today();
  const ipHash = await hashIp(req);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE created_at < ?").bind(now - SESSION_TTL_MS),
    env.DB.prepare("DELETE FROM daily_videos WHERE day < ?").bind(day),
    env.DB.prepare("DELETE FROM transcript_log WHERE created_at < ?").bind(now - num(env.LOG_RETENTION_DAYS, 30) * 86_400_000),
  ]);

  // Say so before the viewer shares the tab. The slot itself is only taken by the first analysed text.
  const [slot, mine, usage] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM daily_videos WHERE day = ? AND video_id = ?").bind(day, videoId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM daily_videos WHERE day = ? AND ip_hash = ?").bind(day, ipHash),
    env.DB.prepare("SELECT COALESCE(SUM(neurons), 0) AS n, COALESCE(SUM(usd), 0) AS usd FROM usage_daily WHERE day = ?").bind(day),
  ]);
  const spent = usage.results[0] as { n: number; usd?: number };
  const claudeRoom = !!env.ANTHROPIC_API_KEY && (spent.usd ?? 0) + MAX_USD_PER_CALL <= num(env.DAILY_USD_CAP, 1);
  const neuronRoom = spent.n + MAX_NEURONS_PER_CALL <= num(env.DAILY_NEURON_CAP, 9000);
  if (!claudeRoom && !neuronRoom) return refuse("neurons", 429);
  if (slot.results[0].n === 0) {
    if (mine.results[0].n >= num(env.IP_DAILY_VIDEO_CAP, 3)) return refuse("ip_videos", 429);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const session = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const created = await env.DB.prepare(
    "INSERT INTO sessions (token_hash, video_id, ip_hash, created_at, source) SELECT ?1, ?2, ?3, ?4, ?6 WHERE (SELECT COUNT(*) FROM sessions WHERE ip_hash = ?3) < ?5 RETURNING token_hash",
  )
    .bind(await sha256Hex(session), videoId, ipHash, now, num(env.IP_SESSION_CAP, 6), source)
    .first();
  if (!created) return refuse("ip_sessions", 429);
  const body: SessionResponse = { session };
  return json(body, 201);
}

async function postTranscript(req: Request, env: Env, ctx: ExecutionContext, videoId: string): Promise<Response> {
  const body = await readBody(req);
  const segments = parseSegments(body?.segments);
  const session = body?.session;
  if (!segments || typeof session !== "string" || !/^[0-9a-f]{64}$/.test(session)) return refuse("bad_request", 400);

  const now = Date.now();
  const chars = segments.reduce((n, s) => n + s.t.length, 0);
  const tokenHash = await sha256Hex(session);
  const paced = await env.DB.prepare(
    `UPDATE sessions SET chars = chars + ?1, last_chunk_at = ?2
     WHERE token_hash = ?3 AND video_id = ?4 AND created_at >= ?5
       AND ?2 - last_chunk_at >= ?6
       AND chars + ?1 <= (?2 - created_at) / 1000.0 * (CASE source WHEN 'captions' THEN ?9 ELSE ?7 END) + (CASE source WHEN 'captions' THEN ?10 ELSE ?8 END)
     RETURNING ip_hash, source`,
  )
    .bind(chars, now, tokenHash, videoId, now - SESSION_TTL_MS, MIN_CHUNK_INTERVAL_MS, CHARS_PER_SECOND, CHAR_BURST, CAPTION_CHARS_PER_SECOND, CAPTION_BURST)
    .first<{ ip_hash: string; source: string }>();
  if (!paced) {
    const known = await env.DB.prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND video_id = ? AND created_at >= ?").bind(tokenHash, videoId, now - SESSION_TTL_MS).first();
    if (!known) return refuse("session_invalid", 403);
    logUpload(env, ctx, videoId, tokenHash, "too_fast", segments);
    return refuse("too_fast", 425);
  }

  // From here the session is valid: every outcome goes to the transcript log.
  const finish = (outcome: string, res: Response) => {
    logUpload(env, ctx, videoId, tokenHash, outcome, segments);
    return res;
  };

  const video = await env.DB.prepare("SELECT title FROM videos WHERE id = ?").bind(videoId).first<{ title: string }>();
  const source: TextSource = paced.source === "captions" ? "captions" : "speech";
  // The language of the captions, or the one the viewer set for speech recognition, so the model knows what it's reading.
  const lang = typeof body?.lang === "string" && LANG_TAG.test(body.lang) ? body.lang : null;
  if (!video) return finish("video_not_found", refuse("video_not_found", 404));

  await env.DB.batch([
    env.DB.prepare("DELETE FROM coverage WHERE video_id = ? AND chunk_id IN (SELECT id FROM chunks WHERE video_id = ? AND status = 'pending' AND created_at < ?)").bind(videoId, videoId, now - STALE_MS),
    env.DB.prepare("UPDATE chunks SET status = 'failed', error = 'lost' WHERE video_id = ? AND status = 'pending' AND created_at < ?").bind(videoId, now - STALE_MS),
  ]);

  const chunk = await env.DB.prepare("INSERT INTO chunks (video_id, status, start_ms, end_ms, segments, created_at) VALUES (?, 'pending', 0, 0, '[]', ?) RETURNING id")
    .bind(videoId, now)
    .first<{ id: number }>();
  const chunkId = chunk!.id;
  const release = () =>
    env.DB.batch([env.DB.prepare("DELETE FROM coverage WHERE chunk_id = ?").bind(chunkId), env.DB.prepare("DELETE FROM chunks WHERE id = ?").bind(chunkId)]);

  // Claim each 10-second stretch. The primary key makes this atomic: of two viewers at the same moment, one wins each bucket.
  const claim = env.DB.prepare("INSERT OR IGNORE INTO coverage (video_id, bucket, chunk_id) VALUES (?, ?, ?)");
  const results = await env.DB.batch<{ bucket?: number; n?: number }>([
    ...[...new Set(segments.map(bucketOf))].map((b) => claim.bind(videoId, b, chunkId)),
    env.DB.prepare("SELECT bucket FROM coverage WHERE video_id = ? AND chunk_id = ?").bind(videoId, chunkId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM coverage WHERE video_id = ?").bind(videoId),
  ]);
  const claimed = new Set(results[results.length - 2].results.map((r) => r.bucket));
  const kept = segments.filter((s) => claimed.has(bucketOf(s)));
  const reply: TranscriptResponse = { accepted: kept.length, skipped: segments.length - kept.length };
  if (kept.length === 0) {
    await release();
    return finish("skipped", json(reply));
  }
  const maxMinutes = source === "captions" ? num(env.MAX_CAPTION_MINUTES_PER_VIDEO, 60) : num(env.MAX_MINUTES_PER_VIDEO, 15);
  if ((results[results.length - 1].results[0].n ?? 0) * BUCKET_MS > maxMinutes * 60_000) {
    await release();
    return finish("video_limit", refuse("video_limit", 413));
  }

  const day = today();
  const reserved = await reserve(env, day, videoId, paced.ip_hash);
  if (typeof reserved === "string") {
    await release();
    return finish(reserved, refuse(reserved, 429));
  }
  logUpload(env, ctx, videoId, tokenHash, "accepted", segments);
  const startMs = kept[0].s;
  const endMs = Math.max(...kept.map((s) => s.s + s.d));
  await env.DB.prepare("UPDATE chunks SET start_ms = ?, end_ms = ?, segments = ? WHERE id = ?").bind(startMs, endMs, JSON.stringify(kept), chunkId).run();

  // The model can take longer than the 30 s allowed after a response, so hold the response open while it runs.
  // waitUntil only matters if the page goes away meanwhile.
  const work = runChunk(env, day, videoId, chunkId, { title: video.title, lang, source }, kept, reserved.provider);
  ctx.waitUntil(work);
  await work;
  return json(reply, 202);
}

/**
 * Record an upload for abuse investigations: what was sent and what happened, nothing about who sent it.
 * Never returned by the API, deleted after LOG_RETENTION_DAYS. Written after the response so it never slows the page.
 */
function logUpload(env: Env, ctx: ExecutionContext, videoId: string, sessionHash: string, outcome: string, segments: Segment[]): void {
  ctx.waitUntil(
    env.DB.prepare("INSERT INTO transcript_log (created_at, video_id, session_hash, outcome, segments) VALUES (?, ?, ?, ?, ?)")
      .bind(Date.now(), videoId, sessionHash, outcome, JSON.stringify(segments))
      .run()
      .catch((err) => console.error("log failed", err instanceof Error ? err.message : String(err))),
  );
}

type Provider = "claude" | "workers-ai";

/**
 * The hard limits before an AI call: videos per connection, then a budget for the model. Claude comes first while
 * its daily dollar cap has room, then the free Workers AI neurons. Each is a single atomic statement, so simultaneous
 * requests can't pass together. `SELECT … WHERE` also refuses the day's first call when a cap is 0.
 */
async function reserve(env: Env, day: string, videoId: string, ipHash: string): Promise<ErrorCode | { provider: Provider }> {
  const [, slot] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO daily_videos (day, video_id, ip_hash) SELECT ?1, ?2, ?3
       WHERE (SELECT COUNT(*) FROM daily_videos WHERE day = ?1 AND ip_hash = ?3) < ?4
       ON CONFLICT (day, video_id) DO NOTHING`,
    ).bind(day, videoId, ipHash, num(env.IP_DAILY_VIDEO_CAP, 3)),
    env.DB.prepare("SELECT 1 AS ok FROM daily_videos WHERE day = ? AND video_id = ?").bind(day, videoId),
  ]);
  if (slot.results.length === 0) return "ip_videos";
  if (env.ANTHROPIC_API_KEY && (await reserveUsd(env, day))) return { provider: "claude" };
  return (await reserveNeurons(env, day)) ? { provider: "workers-ai" } : "neurons";
}

async function reserveUsd(env: Env, day: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "INSERT INTO usage_daily (day, usd) SELECT ?1, ?2 WHERE ?2 <= ?3 ON CONFLICT (day) DO UPDATE SET usd = usd + ?2 WHERE usd + ?2 <= ?3 RETURNING usd",
  )
    .bind(day, MAX_USD_PER_CALL, num(env.DAILY_USD_CAP, 1))
    .first();
  return row !== null;
}

async function reserveNeurons(env: Env, day: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "INSERT INTO usage_daily (day, neurons) SELECT ?1, ?2 WHERE ?2 <= ?3 ON CONFLICT (day) DO UPDATE SET neurons = neurons + ?2 WHERE neurons + ?2 <= ?3 RETURNING neurons",
  )
    .bind(day, MAX_NEURONS_PER_CALL, num(env.DAILY_NEURON_CAP, 9000))
    .first();
  return row !== null;
}

/** Give back what a call didn't use: `actual` replaces the reservation in the day's total. */
function settle(env: Env, day: string, provider: Provider, actual: number) {
  return provider === "claude"
    ? env.DB.prepare("UPDATE usage_daily SET usd = usd + ? WHERE day = ?").bind(actual - MAX_USD_PER_CALL, day)
    : env.DB.prepare("UPDATE usage_daily SET neurons = neurons + ? WHERE day = ?").bind(actual - MAX_NEURONS_PER_CALL, day);
}

async function runChunk(
  env: Env,
  day: string,
  videoId: string,
  chunkId: number,
  about: { title: string; lang: string | null; source: TextSource },
  segments: Segment[],
  provider: Provider,
): Promise<void> {
  // Whatever is still reserved when something fails, so the catch can give it back.
  let holding: Provider | null = provider;
  // Cards are saved one by one as the model writes them, so the page's next poll shows them.
  const insert = env.DB.prepare("INSERT INTO cards (video_id, chunk_id, start_ms, card) VALUES (?, ?, ?, ?)");
  let saved = 0;
  let facts = 0;
  const save = async (c: CheckedCard) => {
    await insert.bind(videoId, chunkId, c.startMs, JSON.stringify(c)).run();
    saved++;
    if (c.check?.official) facts++;
  };
  const finishChunk = (model: string, neurons: number, usd: number, spend: ReturnType<typeof settle>) =>
    env.DB.batch([
      env.DB.prepare("UPDATE videos SET card_count = card_count + ?, fact_count = fact_count + ?, analysed_at = ? WHERE id = ?").bind(saved, facts, Date.now(), videoId),
      env.DB.prepare("UPDATE chunks SET status = 'done', neurons = ?, usd = ?, model = ? WHERE id = ?").bind(neurons, usd, model, chunkId),
      spend,
    ]);
  try {
    const startMs = segments[0].s;
    // The stretch before this one, for context. Chrome's phrases can last a minute, so look back generously.
    const [prev, known] = await env.DB.batch<Record<string, string>>([
      env.DB.prepare("SELECT segments FROM chunks WHERE video_id = ? AND id <> ? AND status <> 'failed' AND start_ms < ? AND end_ms >= ? ORDER BY end_ms DESC LIMIT 1").bind(videoId, chunkId, startMs, startMs - 120_000),
      env.DB.prepare("SELECT json_extract(card, '$.paraphrase') AS p FROM cards WHERE video_id = ? ORDER BY id DESC LIMIT ?").bind(videoId, KNOWN_IDEAS),
    ]);
    const context = prev.results[0] ? (JSON.parse(prev.results[0].segments) as Segment[]).slice(-CONTEXT_SEGMENTS) : [];
    const input = { ...about, context, segments, knownIdeas: known.results.map((r) => r.p) };

    if (provider === "claude") {
      const t0 = Date.now();
      try {
        const r = await factCheckWithClaude(env.ANTHROPIC_API_KEY!, input, save);
        holding = null;
        await finishChunk(CLAUDE_MODEL, 0, r.usd, settle(env, day, "claude", r.usd));
        console.log(JSON.stringify({ event: "chunk", videoId, chunkId, model: CLAUDE_MODEL, segments: segments.length, cards: saved, usd: r.usd, ms: Date.now() - t0 }));
        return;
      } catch (err) {
        console.error(JSON.stringify({ event: "claude_failed", videoId, chunkId, saved, ms: Date.now() - t0, error: describe(err) }));
        if (saved > 0) {
          // Cut off after some cards: keep them rather than analyse the stretch twice. The cost isn't known, so the reservation stands.
          holding = null;
          await finishChunk(CLAUDE_MODEL, 0, MAX_USD_PER_CALL, settle(env, day, "claude", MAX_USD_PER_CALL));
          return;
        }
        // Down, rate-limited, timed out or refused before any card: give the reservation back and let Workers AI try.
        // A failed call is billed only for what it used, and a refusal's cost isn't known here, so this can undercount.
        holding = null;
        await env.DB.prepare("UPDATE usage_daily SET usd = usd - ? WHERE day = ?").bind(MAX_USD_PER_CALL, day).run();
        if (!(await reserveNeurons(env, day))) throw new Error(`claude failed and no neurons left: ${describe(err)}`);
        holding = "workers-ai";
      }
    }
    const r = await factCheckChunk(env.AI, input);
    for (const c of r.cards) await save(c);
    holding = null;
    await finishChunk(WORKERS_AI_MODEL, r.neurons, 0, settle(env, day, "workers-ai", r.neurons));
    console.log(JSON.stringify({ event: "chunk", videoId, chunkId, model: WORKERS_AI_MODEL, segments: segments.length, cards: saved, neurons: r.neurons }));
  } catch (err) {
    const message = describe(err);
    console.error("chunk failed", chunkId, message);
    // Free the stretch of video so a later viewer can try it again, and give back what is still reserved.
    // Cards already saved stay; the stretch is only freed when there are none, so it is never analysed twice.
    await env.DB.batch([
      env.DB.prepare("UPDATE chunks SET status = ?, error = ? WHERE id = ?").bind(saved ? "done" : "failed", message.slice(0, 300), chunkId),
      ...(saved ? [] : [env.DB.prepare("DELETE FROM coverage WHERE chunk_id = ?").bind(chunkId)]),
      ...(holding ? [settle(env, day, holding, 0)] : []),
    ]);
  }
}

const describe = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

async function analysePost(req: Request, env: Env): Promise<Response> {
  const source = parsePost(await readBody(req));
  if (!source) return refuse("bad_request", 400);
  const day = today();
  let cards: PostCard[] | undefined;
  // Share exactly the existing atomic daily provider budgets. No video/session/history rows.
  // Unknown failed-call usage keeps its reservation, so retries cannot release paid capacity.
  if (env.ANTHROPIC_API_KEY && await reserveUsd(env, day)) {
    try {
      const result = await postWithClaude(env.ANTHROPIC_API_KEY, source);
      await settle(env, day, "claude", result.usd).run();
      cards = result.cards;
    } catch { console.error("post Claude analysis failed; trying Workers AI"); }
  }
  if (!cards) {
    if (!await reserveNeurons(env, day)) return refuse("neurons", 429);
    try {
      const result = await postWithWorkersAI(env.AI, source);
      await settle(env, day, "workers-ai", result.neurons).run();
      cards = result.cards;
    } catch {
      return refuse("unavailable", 503);
    }
  }
  const result: PostAnalysis = { id: crypto.randomUUID(), status: cards.length ? "complete" : "empty", source, cards, analysedAt: Date.now() };
  await env.DB.prepare("INSERT INTO post_results (id, post_id, source, status, cards, analysed_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(result.id, source.postId, JSON.stringify(source), result.status, JSON.stringify(cards), result.analysedAt).run();
  return json(result);
}

async function getPostResult(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT source, status, cards, analysed_at FROM post_results WHERE id = ?").bind(id)
    .first<{ source: string; status: PostAnalysis["status"]; cards: string; analysed_at: number }>();
  if (!row) return refuse("bad_request", 404);
  return json({ id, status: row.status, source: JSON.parse(row.source), cards: JSON.parse(row.cards), analysedAt: row.analysed_at } satisfies PostAnalysis);
}

const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/**
 * The language a video is spoken in, looked up once and kept with the video. Failures aren't kept, so a later
 * visit tries again; the per-connection rate limit bounds how often YouTube is asked.
 */
async function getLanguage(env: Env, videoId: string): Promise<Response> {
  if (!(await ensureVideo(env, videoId))) return refuse("video_not_found", 404);
  const row = await env.DB.prepare("SELECT title, lang, lang_source FROM videos WHERE id = ?").bind(videoId).first<{ title: string; lang: string | null; lang_source: LanguageResponse["source"] }>();
  if (row?.lang) return json({ lang: row.lang, source: row.lang_source } satisfies LanguageResponse);
  const found = await detectLanguage(videoId, row?.title ?? "");
  if (found) await env.DB.prepare("UPDATE videos SET lang = ?, lang_source = ? WHERE id = ?").bind(found.lang, found.source, videoId).run();
  return json({ lang: found?.lang ?? null, source: found?.source ?? null } satisfies LanguageResponse);
}

/**
 * The stretches of a video that already have a transcript (analysed, or being analysed), as [startMs, endMs] ranges,
 * so the extension sends only the rest of its captions. Fetched once per video, not polled.
 */
async function getCoverage(env: Env, videoId: string): Promise<Response> {
  const rows = await env.DB.prepare("SELECT bucket FROM coverage WHERE video_id = ? ORDER BY bucket").bind(videoId).all<{ bucket: number }>();
  const ranges: [number, number][] = [];
  for (const { bucket } of rows.results) {
    const start = bucket * BUCKET_MS;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === start) last[1] = start + BUCKET_MS;
    else ranges.push([start, start + BUCKET_MS]);
  }
  return json({ ranges } satisfies CoverageResponse);
}

const HISTORY_SIZE = 24;

/** The most recently analysed videos, for the history on the page. Reads at most HISTORY_SIZE rows. */
async function getVideos(env: Env): Promise<Response> {
  const rows = await env.DB.prepare("SELECT id, title, author, card_count, fact_count, analysed_at FROM videos WHERE analysed_at IS NOT NULL ORDER BY analysed_at DESC LIMIT ?")
    .bind(HISTORY_SIZE)
    .all<{ id: string; title: string; author: string; card_count: number; fact_count: number; analysed_at: number }>();
  const body: VideosResponse = {
    videos: rows.results.map((r) => ({ id: r.id, title: r.title, author: r.author, cards: r.card_count, facts: r.fact_count, analysedAt: r.analysed_at })),
  };
  return json(body);
}

async function getCards(env: Env, videoId: string, after: number): Promise<Response> {
  const cursor = Number.isInteger(after) && after > 0 ? after : 0;
  const recent = Date.now() - STALE_MS;
  const [video, cards, status, covered] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare("SELECT title FROM videos WHERE id = ?").bind(videoId),
    env.DB.prepare("SELECT id, card FROM cards WHERE video_id = ? AND id > ? ORDER BY id LIMIT ?").bind(videoId, cursor, MAX_CARDS_PER_POLL),
    env.DB.prepare("SELECT COALESCE(SUM(status = 'pending'), 0) AS pending, COALESCE(SUM(status = 'failed'), 0) AS failed FROM chunks WHERE video_id = ? AND created_at >= ?").bind(videoId, recent),
    env.DB.prepare("SELECT COUNT(*) AS n FROM coverage WHERE video_id = ?").bind(videoId),
  ]);
  const rows = cards.results as { id: number; card: string }[];
  const body: CardsResponse = {
    videoId,
    title: (video.results[0]?.title as string | undefined) ?? "",
    cards: rows.map((r): StoredCard => ({ ...JSON.parse(r.card), id: r.id })),
    cursor: rows.length ? rows[rows.length - 1].id : cursor,
    pendingChunks: Number(status.results[0].pending),
    failedChunks: Number(status.results[0].failed),
    coveredMs: Number(covered.results[0].n) * BUCKET_MS,
  };
  return json(body);
}
