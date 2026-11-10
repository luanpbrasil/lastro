import type { Segment } from "../../../shared/schema";
import { sha256Hex } from "../../../shared/transcript";
import { MAX_CHUNK_CHARS, MAX_SEGMENTS, type CardsResponse, type ErrorCode, type SessionResponse, type StoredCard, type TranscriptResponse } from "../types";
import { factCheckChunk, MAX_NEURONS_PER_CALL } from "./factcheck";

interface Env {
  AI: Ai;
  DB: D1Database;
  API_LIMITER: RateLimit;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  DAILY_VIDEO_CAP?: string;
  IP_DAILY_VIDEO_CAP?: string;
  DAILY_NEURON_CAP?: string;
  MAX_MINUTES_PER_VIDEO?: string;
  IP_SESSION_CAP?: string;
}

const BUCKET_MS = 10_000;
const MAX_VIDEO_MS = 24 * 3600 * 1000;
const MAX_BODY_CHARS = 32_000;
/** A chunk still pending after this long was lost with its Worker. */
const STALE_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 2 * 3600 * 1000;
const CONTEXT_SEGMENTS = 4;
const KNOWN_IDEAS = 12;
const MAX_CARDS_PER_POLL = 100;
/** A session can only send text as fast as someone can speak it, so nobody can pour in hours of text at once. */
const CHARS_PER_SECOND = 30;
const CHAR_BURST = 1200;
const MIN_CHUNK_INTERVAL_MS = 10_000;

const today = () => new Date().toISOString().slice(0, 10);
const bucketOf = (s: Segment) => Math.floor(s.s / BUCKET_MS);
const num = (v: string | undefined, fallback: number) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));
const hashIp = async (req: Request) => (await sha256Hex(`lastro-live:${req.headers.get("cf-connecting-ip") ?? "local"}`)).slice(0, 16);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
const refuse = (error: ErrorCode, status: number) => json({ error }, status);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return refuse("bad_request", 404);
    const { success } = await env.API_LIMITER.limit({ key: await hashIp(req) });
    if (!success) return refuse("rate_limited", 429);

    if (url.pathname === "/api/config" && req.method === "GET") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "" });
    const m = url.pathname.match(/^\/api\/videos\/([A-Za-z0-9_-]{11})\/(sessions|transcript|cards)$/);
    if (m && m[2] === "sessions" && req.method === "POST") return postSession(req, env, url, m[1]);
    if (m && m[2] === "transcript" && req.method === "POST") return postTranscript(req, env, ctx, m[1]);
    if (m && m[2] === "cards" && req.method === "GET") return getCards(env, m[1], Number(url.searchParams.get("after") ?? "0"));
    return refuse("bad_request", 404);
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
    if (!Number.isFinite(s) || !Number.isFinite(d) || s < 0 || s > MAX_VIDEO_MS || d < 0 || !t.trim()) return null;
    chars += t.length;
    out.push({ s: Math.round(s), d: Math.round(d), t: t.trim() });
  }
  if (chars > MAX_CHUNK_CHARS) return null;
  return out.sort((a, b) => a.s - b.s);
}

/** Ask Cloudflare whether this page view passed the bot check. Cloudflare's test keys report another hostname, so they only pass locally. */
async function passedBotCheck(env: Env, url: URL, req: Request, token: string): Promise<boolean> {
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: req.headers.get("cf-connecting-ip") ?? undefined }),
    signal: AbortSignal.timeout(4000),
  });
  const outcome = (await r.json()) as { success?: boolean; hostname?: string };
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return outcome.success === true && (local || outcome.hostname === url.hostname);
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
      title = String(j.title ?? "").slice(0, 300);
      author = String(j.author_name ?? "").slice(0, 200);
    }
  } catch {
    /* the title only helps the model: go on without it */
  }
  await env.DB.prepare("INSERT OR IGNORE INTO videos (id, title, author, created_at) VALUES (?, ?, ?, ?)").bind(id, title, author, Date.now()).run();
  return { title };
}

/** Bot check first, then a token that lets this page send transcript for this one video. */
async function postSession(req: Request, env: Env, url: URL, videoId: string): Promise<Response> {
  if (!env.TURNSTILE_SECRET) return refuse("unavailable", 503);
  const token = (await readBody(req))?.turnstileToken;
  if (typeof token !== "string" || !token || token.length > 2048) return refuse("bot_check", 403);
  const passed = await passedBotCheck(env, url, req, token).catch(() => false);
  if (!passed) return refuse("bot_check", 403);
  if (!(await ensureVideo(env, videoId))) return refuse("video_not_found", 404);

  const now = Date.now();
  const day = today();
  const ipHash = await hashIp(req);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE created_at < ?").bind(now - SESSION_TTL_MS),
    env.DB.prepare("DELETE FROM daily_videos WHERE day < ?").bind(day),
  ]);

  // Say so before the viewer shares the tab. The slot itself is only taken by the first analysed text.
  const [slot, all, mine, usage] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM daily_videos WHERE day = ? AND video_id = ?").bind(day, videoId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM daily_videos WHERE day = ?").bind(day),
    env.DB.prepare("SELECT COUNT(*) AS n FROM daily_videos WHERE day = ? AND ip_hash = ?").bind(day, ipHash),
    env.DB.prepare("SELECT COALESCE(SUM(neurons), 0) AS n FROM usage_daily WHERE day = ?").bind(day),
  ]);
  if (usage.results[0].n + MAX_NEURONS_PER_CALL > num(env.DAILY_NEURON_CAP, 30000)) return refuse("neurons", 429);
  if (slot.results[0].n === 0) {
    if (all.results[0].n >= num(env.DAILY_VIDEO_CAP, 20)) return refuse("daily_videos", 429);
    if (mine.results[0].n >= num(env.IP_DAILY_VIDEO_CAP, 3)) return refuse("ip_videos", 429);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const session = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const created = await env.DB.prepare(
    "INSERT INTO sessions (token_hash, video_id, ip_hash, created_at) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM sessions WHERE ip_hash = ?3) < ?5 RETURNING token_hash",
  )
    .bind(await sha256Hex(session), videoId, ipHash, now, num(env.IP_SESSION_CAP, 6))
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
       AND ?2 - last_chunk_at >= ?6 AND chars + ?1 <= (?2 - created_at) / 1000.0 * ?7 + ?8
     RETURNING ip_hash`,
  )
    .bind(chars, now, tokenHash, videoId, now - SESSION_TTL_MS, MIN_CHUNK_INTERVAL_MS, CHARS_PER_SECOND, CHAR_BURST)
    .first<{ ip_hash: string }>();
  if (!paced) {
    const known = await env.DB.prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND video_id = ? AND created_at >= ?").bind(tokenHash, videoId, now - SESSION_TTL_MS).first();
    return known ? refuse("too_fast", 425) : refuse("session_invalid", 403);
  }

  const video = await env.DB.prepare("SELECT title FROM videos WHERE id = ?").bind(videoId).first<{ title: string }>();
  if (!video) return refuse("video_not_found", 404);

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
    return json(reply);
  }
  if ((results[results.length - 1].results[0].n ?? 0) * BUCKET_MS > num(env.MAX_MINUTES_PER_VIDEO, 30) * 60_000) {
    await release();
    return refuse("video_limit", 413);
  }

  const day = today();
  const refused = await reserve(env, day, videoId, paced.ip_hash);
  if (refused) {
    await release();
    return refused;
  }
  const startMs = kept[0].s;
  const endMs = Math.max(...kept.map((s) => s.s + s.d));
  await env.DB.prepare("UPDATE chunks SET start_ms = ?, end_ms = ?, segments = ? WHERE id = ?").bind(startMs, endMs, JSON.stringify(kept), chunkId).run();

  // The model can take longer than the 30 s allowed after a response, so hold the response open while it runs.
  // waitUntil only matters if the page goes away meanwhile.
  const work = runChunk(env, day, videoId, chunkId, video.title, kept);
  ctx.waitUntil(work);
  await work;
  return json(reply, 202);
}

/** The two hard limits before an AI call. Both are single atomic statements, so simultaneous requests can't pass together. */
async function reserve(env: Env, day: string, videoId: string, ipHash: string): Promise<Response | null> {
  const [, slot] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO daily_videos (day, video_id, ip_hash) SELECT ?1, ?2, ?3
       WHERE (SELECT COUNT(*) FROM daily_videos WHERE day = ?1) < ?4
         AND (SELECT COUNT(*) FROM daily_videos WHERE day = ?1 AND ip_hash = ?3) < ?5
       ON CONFLICT (day, video_id) DO NOTHING`,
    ).bind(day, videoId, ipHash, num(env.DAILY_VIDEO_CAP, 20), num(env.IP_DAILY_VIDEO_CAP, 3)),
    env.DB.prepare("SELECT 1 AS ok FROM daily_videos WHERE day = ? AND video_id = ?").bind(day, videoId),
  ]);
  if (slot.results.length === 0) return refuse("daily_videos", 429);
  const budget = await env.DB.prepare(
    "INSERT INTO usage_daily (day, neurons) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET neurons = neurons + ?2 WHERE neurons + ?2 <= ?3 RETURNING neurons",
  )
    .bind(day, MAX_NEURONS_PER_CALL, num(env.DAILY_NEURON_CAP, 30000))
    .first();
  return budget ? null : refuse("neurons", 429);
}

async function runChunk(env: Env, day: string, videoId: string, chunkId: number, title: string, segments: Segment[]): Promise<void> {
  try {
    const startMs = segments[0].s;
    const [prev, known] = await env.DB.batch<Record<string, string>>([
      env.DB.prepare("SELECT segments FROM chunks WHERE video_id = ? AND id <> ? AND status <> 'failed' AND end_ms BETWEEN ? AND ? ORDER BY end_ms DESC LIMIT 1").bind(videoId, chunkId, startMs - 5000, startMs + 1000),
      env.DB.prepare("SELECT json_extract(card, '$.paraphrase') AS p FROM cards WHERE video_id = ? ORDER BY id DESC LIMIT ?").bind(videoId, KNOWN_IDEAS),
    ]);
    const context = prev.results[0] ? (JSON.parse(prev.results[0].segments) as Segment[]).slice(-CONTEXT_SEGMENTS) : [];
    const result = await factCheckChunk(env.AI, { title, context, segments, knownIdeas: known.results.map((r) => r.p) });

    const insert = env.DB.prepare("INSERT INTO cards (video_id, chunk_id, start_ms, card) VALUES (?, ?, ?, ?)");
    await env.DB.batch([
      ...result.cards.map((c) => insert.bind(videoId, chunkId, c.startMs, JSON.stringify(c))),
      env.DB.prepare("UPDATE chunks SET status = 'done', neurons = ? WHERE id = ?").bind(result.neurons, chunkId),
      env.DB.prepare("UPDATE usage_daily SET neurons = neurons + ? WHERE day = ?").bind(result.neurons - MAX_NEURONS_PER_CALL, day),
    ]);
    console.log(JSON.stringify({ event: "chunk", videoId, chunkId, segments: segments.length, cards: result.cards.length, neurons: result.neurons }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("chunk failed", chunkId, message);
    // Free the stretch of video so a later viewer can try it again, and give back the reservation.
    await env.DB.batch([
      env.DB.prepare("UPDATE chunks SET status = 'failed', error = ? WHERE id = ?").bind(message.slice(0, 300), chunkId),
      env.DB.prepare("DELETE FROM coverage WHERE chunk_id = ?").bind(chunkId),
      env.DB.prepare("UPDATE usage_daily SET neurons = neurons - ? WHERE day = ?").bind(MAX_NEURONS_PER_CALL, day),
    ]);
  }
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
