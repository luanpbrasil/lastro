import type { Segment } from "../../../shared/schema";
import { sha256Hex } from "../../../shared/transcript";
import { MAX_CHUNK_CHARS, MAX_SEGMENTS, type CardsResponse, type StoredCard, type TranscriptResponse } from "../types";
import { factCheckChunk } from "./factcheck";

interface Env {
  ANTHROPIC_API_KEY: string;
  DB: D1Database;
  MAX_SPEND_USD?: string;
  DAILY_CHUNK_CAP?: string;
  IP_DAILY_CHUNK_CAP?: string;
}

const BUCKET_MS = 10_000;
const MAX_VIDEO_MS = 24 * 3600 * 1000;
/** A chunk still pending after this long was lost with its Worker. */
const STALE_MS = 2 * 60 * 1000;
const CONTEXT_SEGMENTS = 4;
const KNOWN_IDEAS = 12;
const MAX_CARDS_PER_POLL = 100;

const today = () => new Date().toISOString().slice(0, 10);
const bucketOf = (s: Segment) => Math.floor(s.s / BUCKET_MS);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/videos\/([A-Za-z0-9_-]{11})\/(transcript|cards)$/);
    if (m && m[2] === "transcript" && req.method === "POST") return postTranscript(req, env, ctx, m[1]);
    if (m && m[2] === "cards" && req.method === "GET") return getCards(env, m[1], Number(url.searchParams.get("after") ?? "0"));
    return json({ error: "not found" }, 404);
  },
};

function parseSegments(body: unknown): Segment[] | null {
  const raw = (body as { segments?: unknown } | null)?.segments;
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

async function postTranscript(req: Request, env: Env, ctx: ExecutionContext, videoId: string): Promise<Response> {
  const segments = parseSegments(await req.json().catch(() => null));
  if (!segments) return json({ error: "bad transcript" }, 400);
  const video = await ensureVideo(env, videoId);
  if (!video) return json({ error: "video not found" }, 404);

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM coverage WHERE video_id = ? AND chunk_id IN (SELECT id FROM chunks WHERE video_id = ? AND status = 'pending' AND created_at < ?)").bind(videoId, videoId, now - STALE_MS),
    env.DB.prepare("UPDATE chunks SET status = 'failed', error = 'lost' WHERE video_id = ? AND status = 'pending' AND created_at < ?").bind(videoId, now - STALE_MS),
  ]);

  const chunk = await env.DB.prepare("INSERT INTO chunks (video_id, status, start_ms, end_ms, segments, created_at) VALUES (?, 'pending', 0, 0, '[]', ?) RETURNING id")
    .bind(videoId, now)
    .first<{ id: number }>();
  const chunkId = chunk!.id;

  // Claim each 10-second stretch. The primary key makes this atomic: of two viewers at the same moment, one wins each bucket.
  const claim = env.DB.prepare("INSERT OR IGNORE INTO coverage (video_id, bucket, chunk_id) VALUES (?, ?, ?)");
  const results = await env.DB.batch<{ bucket: number }>([
    ...[...new Set(segments.map(bucketOf))].map((b) => claim.bind(videoId, b, chunkId)),
    env.DB.prepare("SELECT bucket FROM coverage WHERE video_id = ? AND chunk_id = ?").bind(videoId, chunkId),
  ]);
  const claimed = new Set(results[results.length - 1].results.map((r) => r.bucket));
  const kept = segments.filter((s) => claimed.has(bucketOf(s)));
  const reply: TranscriptResponse = { accepted: kept.length, skipped: segments.length - kept.length };

  const release = () =>
    env.DB.batch([env.DB.prepare("DELETE FROM coverage WHERE chunk_id = ?").bind(chunkId), env.DB.prepare("DELETE FROM chunks WHERE id = ?").bind(chunkId)]);

  if (kept.length === 0) {
    await release();
    return json(reply);
  }
  const refused = await reserve(env, req);
  if (refused) {
    await release();
    return refused;
  }
  const startMs = kept[0].s;
  const endMs = Math.max(...kept.map((s) => s.s + s.d));
  await env.DB.prepare("UPDATE chunks SET start_ms = ?, end_ms = ?, segments = ? WHERE id = ?").bind(startMs, endMs, JSON.stringify(kept), chunkId).run();

  ctx.waitUntil(runChunk(env, videoId, chunkId, video.title, kept));
  return json(reply, 202);
}

/** Spend guardrails before a Claude call. Counters are atomic in D1. Returns a refusal, or null to go ahead. */
async function reserve(env: Env, req: Request): Promise<Response | null> {
  const day = today();
  const spent = await env.DB.prepare("SELECT COALESCE(SUM(spend_usd), 0) AS total FROM usage_daily").first<{ total: number }>();
  if ((spent?.total ?? 0) >= Number(env.MAX_SPEND_USD ?? "3")) return json({ error: "spend limit reached" }, 402);

  const ip = req.headers.get("cf-connecting-ip");
  if (ip) {
    const ipHash = (await sha256Hex(`lastro-live:${ip}`)).slice(0, 16);
    await env.DB.prepare("DELETE FROM ip_daily WHERE day < ?").bind(day).run();
    const row = await env.DB.prepare("INSERT INTO ip_daily (ip_hash, day, chunks) VALUES (?, ?, 1) ON CONFLICT (ip_hash, day) DO UPDATE SET chunks = chunks + 1 WHERE chunks < ? RETURNING chunks")
      .bind(ipHash, day, Number(env.IP_DAILY_CHUNK_CAP ?? "240"))
      .first();
    if (!row) return json({ error: "too many chunks from this connection today" }, 429);
  }
  const row = await env.DB.prepare("INSERT INTO usage_daily (day, chunks) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET chunks = chunks + 1 WHERE chunks < ? RETURNING chunks")
    .bind(day, Number(env.DAILY_CHUNK_CAP ?? "2000"))
    .first();
  return row ? null : json({ error: "daily cap reached" }, 429);
}

async function runChunk(env: Env, videoId: string, chunkId: number, title: string, segments: Segment[]): Promise<void> {
  try {
    const startMs = segments[0].s;
    const [prev, known] = await env.DB.batch<Record<string, string>>([
      env.DB.prepare("SELECT segments FROM chunks WHERE video_id = ? AND id <> ? AND status <> 'failed' AND end_ms BETWEEN ? AND ? ORDER BY end_ms DESC LIMIT 1").bind(videoId, chunkId, startMs - 5000, startMs + 1000),
      env.DB.prepare("SELECT json_extract(card, '$.paraphrase') AS p FROM cards WHERE video_id = ? ORDER BY id DESC LIMIT ?").bind(videoId, KNOWN_IDEAS),
    ]);
    const context = prev.results[0] ? (JSON.parse(prev.results[0].segments) as Segment[]).slice(-CONTEXT_SEGMENTS) : [];
    const result = await factCheckChunk(env.ANTHROPIC_API_KEY, { title, context, segments, knownIdeas: known.results.map((r) => r.p) });

    const insert = env.DB.prepare("INSERT INTO cards (video_id, chunk_id, start_ms, card) VALUES (?, ?, ?, ?)");
    await env.DB.batch([
      ...result.cards.map((c) => insert.bind(videoId, chunkId, c.startMs, JSON.stringify(c))),
      env.DB.prepare("UPDATE chunks SET status = 'done', cost_usd = ? WHERE id = ?").bind(result.costUsd, chunkId),
      env.DB.prepare("UPDATE usage_daily SET spend_usd = spend_usd + ? WHERE day = ?").bind(result.costUsd, today()),
    ]);
    console.log(JSON.stringify({ event: "chunk", videoId, chunkId, segments: segments.length, cards: result.cards.length, costUsd: result.costUsd }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("chunk failed", chunkId, message);
    // Free the stretch of video so a later viewer can try it again.
    await env.DB.batch([
      env.DB.prepare("UPDATE chunks SET status = 'failed', error = ? WHERE id = ?").bind(message.slice(0, 300), chunkId),
      env.DB.prepare("DELETE FROM coverage WHERE chunk_id = ?").bind(chunkId),
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
