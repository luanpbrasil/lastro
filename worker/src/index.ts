import Anthropic from "@anthropic-ai/sdk";
import { node } from "../../shared/kg";
import topicModel from "../../shared/topics-model.json";
import { shouldAnalyze, TopicScorer, type TopicModel } from "../../shared/topics";
import { costUsd, RUNTIME_MODEL } from "../../shared/prices";
import { systemPrompt, userPrompt } from "../../shared/prompt";
import {
  outputSchema,
  PROMPT_VERSION,
  type AnalyzeRequest,
  type CachedAnalysis,
  type Card,
  type ModelUnit,
  type StreamEvent,
  type Usage,
} from "../../shared/schema";
import { TranscriptIndex } from "../../shared/locate";
import { DEMO_IDS, LIVE_TRANSCRIPTS, type LiveId } from "../../shared/demo";
import demoCards1Fz from "../../fixtures/demo-cards/1FzdBFDbMUs.json";
import demoCardsGaucha from "../../fixtures/demo-cards/wOpqx7XvD54.json";
import liveFacts from "../../eval/transcripts/TESTfacts01.json";
import { sha256Hex, transcriptHash } from "../../shared/transcript";
import { UnitStreamParser } from "../../shared/unitStream";

interface Env {
  ANTHROPIC_API_KEY: string;
  CARDS: KVNamespace;
  /** Worker stops calling Claude once the ledger reaches this (USD). */
  MAX_SPEND_USD?: string;
  /** Max uncached analyses per UTC day. */
  DAILY_CAP?: string;
  /** Max uncached analyses per UTC day of videos the topic check rejected ("Analisar este vídeo"). */
  FORCED_DAILY_CAP?: string;
  /** Max uncached analyses per client IP per UTC day (0 or unset = no per-IP limit). IPs are stored hashed. */
  IP_DAILY_CAP?: string;
  /** "1" lets a request skip the cache (dev and bench only). */
  ALLOW_CACHE_BYPASS?: string;
}

const MAX_CAPTION_CHARS = 60_000; // ≈ 60 min of speech
const MAX_TOKENS = 6000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const SYSTEM = systemPrompt();
/** Recorded cards for demo videos, used until the hosted cache has a fresh analysis of them. */
const DEMO_FALLBACK: Record<string, { promptVersion: string; cards: Card[] }> = {
  "1FzdBFDbMUs": demoCards1Fz as unknown as { promptVersion: string; cards: Card[] },
  wOpqx7XvD54: demoCardsGaucha as unknown as { promptVersion: string; cards: Card[] },
};
const LIVE: Record<LiveId, { videoId: string; title: string; segments: AnalyzeRequest["segments"] }> = {
  TESTfacts01: liveFacts as { videoId: string; title: string; segments: AnalyzeRequest["segments"] },
};
const TOPICS = new TopicScorer(topicModel as TopicModel);
const SCHEMA = outputSchema();

const cacheKey = (videoId: string, hash: string) => `v1:${PROMPT_VERSION}:${videoId}:${hash}`;
const today = () => new Date().toISOString().slice(0, 10);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

async function readNumber(kv: KVNamespace, key: string): Promise<number> {
  return Number((await kv.get(key)) ?? "0") || 0;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }
    if (url.pathname === "/health") return json({ ok: true, promptVersion: PROMPT_VERSION, model: RUNTIME_MODEL });

    // GET /c/:videoId/:hash → cached cards
    const m = url.pathname.match(/^\/c\/([A-Za-z0-9_-]{11})\/([0-9a-f]{64})$/);
    if (req.method === "GET" && m) {
      const hit = await env.CARDS.get(cacheKey(m[1], m[2]));
      return hit ? new Response(hit, { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }) : json({ error: "miss" }, 404);
    }

    if (req.method === "POST" && url.pathname === "/analyze") return analyze(req, env, ctx, url);

    // Judge demo (static page at /demo): precomputed cards by video id, and the live button.
    const dm = url.pathname.match(/^\/api\/demo\/cards\/([A-Za-z0-9_-]{11})$/);
    if (req.method === "GET" && dm) return demoCards(env, dm[1]);
    if (req.method === "POST" && url.pathname === "/api/demo/live") return demoLive(req, env, ctx);

    if (req.method === "GET" && url.pathname === "/spend") {
      return json({
        today: await readNumber(env.CARDS, `spend:${today()}`),
        total: await readNumber(env.CARDS, "spend:total"),
        analysesToday: await readNumber(env.CARDS, `count:${today()}`),
        maxSpendUsd: Number(env.MAX_SPEND_USD ?? "4"),
      });
    }
    return json({ error: "not found" }, 404);
  },
};

async function analyze(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const tRecv = Date.now();
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { videoId, title = "", description = "", hash, segments } = body;
  if (!VIDEO_ID.test(videoId ?? "") || !HEX64.test(hash ?? "") || !Array.isArray(segments) || segments.length === 0) {
    return json({ error: "bad request" }, 400);
  }
  const chars = segments.reduce((n, s) => n + (s.t?.length ?? 0), 0);
  if (chars > MAX_CAPTION_CHARS) return json({ error: "transcript too long for one call" }, 413);
  if ((await transcriptHash(segments)) !== hash) return json({ error: "hash mismatch" }, 400);

  const key = cacheKey(videoId, hash);
  const bypass = env.ALLOW_CACHE_BYPASS === "1" && url.searchParams.get("nocache") === "1";
  if (!bypass) {
    const hit = await env.CARDS.get(key);
    if (hit) return replayCached(JSON.parse(hit) as CachedAnalysis, tRecv);
  }

  // Server-side topic check, so the endpoint is not a free LLM proxy. Off-topic videos the viewer
  // asked for by hand ("Analisar este vídeo") are allowed under a small separate daily cap.
  const topic = TOPICS.classify(title, String(description).slice(0, 5000), segments);
  const onTopic = shouldAnalyze(topic);
  if (!onTopic && !body.force) return json({ error: "off topic", scores: topic.scores }, 422);
  if (!onTopic) {
    const forced = await readNumber(env.CARDS, `forced:${today()}`);
    if (forced >= Number(env.FORCED_DAILY_CAP ?? "20")) return json({ error: "off topic; manual analyses capped today" }, 429);
    await env.CARDS.put(`forced:${today()}`, String(forced + 1), { expirationTtl: 3 * 86400 });
  }

  const refused = await reserve(env, req, `pending:${key}`, bypass);
  if (refused) return refused;

  return streamAnalysis(env, ctx, body, tRecv, key, { cache: true, pendingKey: `pending:${key}` });
}

/**
 * Spend guardrails before any Claude call: total spend, daily cap, one analysis at a time per key,
 * per-IP daily cap. Counts the analysis when it is allowed. Returns a refusal, or null to go ahead.
 */
async function reserve(env: Env, req: Request, pendingKey: string, ignorePending = false): Promise<Response | null> {
  const maxSpend = Number(env.MAX_SPEND_USD ?? "4");
  const cap = Number(env.DAILY_CAP ?? "100");
  const [spent, count, pending] = await Promise.all([
    readNumber(env.CARDS, "spend:total"),
    readNumber(env.CARDS, `count:${today()}`),
    env.CARDS.get(pendingKey),
  ]);
  if (spent >= maxSpend) return json({ error: "spend limit reached; cache only" }, 402);
  if (count >= cap) return json({ error: "daily cap reached" }, 429);
  if (pending && !ignorePending) return json({ error: "analysis in progress; retry shortly" }, 409);
  const ipCap = Number(env.IP_DAILY_CAP ?? "0");
  const ip = req.headers.get("cf-connecting-ip");
  if (ipCap > 0 && ip) {
    const ipKey = `ip:${(await sha256Hex(`lastro:${ip}`)).slice(0, 16)}:${today()}`;
    const used = await readNumber(env.CARDS, ipKey);
    if (used >= ipCap) return json({ error: "too many new analyses from this connection today" }, 429);
    await env.CARDS.put(ipKey, String(used + 1), { expirationTtl: 2 * 86400 });
  }
  await env.CARDS.put(pendingKey, "1", { expirationTtl: 120 });
  await env.CARDS.put(`count:${today()}`, String(count + 1), { expirationTtl: 3 * 86400 });
  return null;
}

function streamAnalysis(
  env: Env,
  ctx: ExecutionContext,
  body: AnalyzeRequest,
  tRecv: number,
  key: string,
  opts: { cache: boolean; pendingKey: string; publicDone?: boolean },
): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (e: StreamEvent) => writer.write(enc.encode(JSON.stringify(e) + "\n"));

  ctx.waitUntil(
    (async () => {
      try {
        await send({ type: "meta", cached: false, promptVersion: PROMPT_VERSION, tRecv });
        await runModel(env, body, tRecv, send, key, opts);
      } catch (err) {
        console.error("analyze failed", err instanceof Error ? err.message : String(err));
        await send({ type: "error", message: "analysis failed" }).catch(() => {});
      } finally {
        await env.CARDS.delete(opts.pendingKey).catch(() => {});
        await writer.close().catch(() => {});
      }
    })(),
  );

  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}

/** Cards for a demo video: the latest analysis in the cache, else recorded cards, else 404 ("being prepared"). $0. */
async function demoCards(env: Env, videoId: string): Promise<Response> {
  if (!DEMO_IDS.has(videoId)) return json({ error: "not a demo video" }, 404);
  const latestKey = await env.CARDS.get(`latest:${PROMPT_VERSION}:${videoId}`);
  const hit = latestKey ? await env.CARDS.get(latestKey) : null;
  if (hit) {
    const c = JSON.parse(hit) as CachedAnalysis;
    return json({ videoId, source: "cache", promptVersion: c.promptVersion, cards: c.cards });
  }
  const f = DEMO_FALLBACK[videoId];
  if (f) return json({ videoId, source: "recorded", promptVersion: f.promptVersion, cards: f.cards });
  return json({ videoId, status: "preparing" }, 404);
}

/**
 * "Rodar ao vivo": a fresh Haiku analysis of one transcript stored with the Worker, picked by id.
 * Never takes text from the client. Same caps as /analyze (spend, daily, per-IP); not cached.
 * The stream carries cards, timings and cost, not token usage.
 */
async function demoLive(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const tRecv = Date.now();
  let id: string | undefined;
  try {
    id = ((await req.json()) as { id?: string }).id;
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (!id || !(id in LIVE_TRANSCRIPTS)) return json({ error: "unknown transcript" }, 400);
  const t = LIVE[id as LiveId];
  const refused = await reserve(env, req, "pending:demo-live");
  if (refused) return refused;
  const body: AnalyzeRequest = { videoId: t.videoId, title: t.title, hash: await transcriptHash(t.segments), segments: t.segments };
  return streamAnalysis(env, ctx, body, tRecv, "", { cache: false, pendingKey: "pending:demo-live", publicDone: true });
}

function replayCached(c: CachedAnalysis, tRecv: number): Response {
  const lines: StreamEvent[] = [
    { type: "meta", cached: true, promptVersion: c.promptVersion, tRecv },
    ...c.cards.map((card): StreamEvent => ({ type: "card", card, tServer: Date.now() })),
    { type: "done", cards: c.cards.length, costUsd: 0, model: c.model },
  ];
  return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

async function runModel(
  env: Env,
  body: AnalyzeRequest,
  tRecv: number,
  send: (e: StreamEvent) => Promise<void>,
  key: string,
  opts: { cache: boolean; publicDone?: boolean } = { cache: true },
): Promise<void> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const { segments } = body;
  const index = new TranscriptIndex(segments);
  const parser = new UnitStreamParser();
  const cards: Card[] = [];
  let tFirstToken = 0;
  let tFirstCard: number | null = null;

  const stream = client.messages.stream({
    model: RUNTIME_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt(body.title ?? "", segments) }],
  });

  for await (const ev of stream) {
    if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") continue;
    if (!tFirstToken) tFirstToken = Date.now();
    for (const raw of parser.push(ev.delta.text)) {
      const res = validate(raw as ModelUnit, segments, index);
      if ("reason" in res) {
        await send({ type: "dropped", reason: res.reason, quote: (raw as ModelUnit)?.quote });
        continue;
      }
      cards.push(res);
      if (tFirstCard === null) tFirstCard = Date.now();
      await send({ type: "card", card: res, tServer: Date.now() });
    }
  }

  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    await send({ type: "error", message: "análise indisponível (refusal)" });
    return;
  }
  const usage: Usage = {
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
    cache_read_input_tokens: msg.usage.cache_read_input_tokens,
    cache_creation_input_tokens: msg.usage.cache_creation_input_tokens,
  };
  const cost = costUsd(RUNTIME_MODEL, usage);
  const tDone = Date.now();

  // Spend ledger (approximate under concurrency; the Console workspace limit is the backstop).
  const [spentToday, spentTotal] = await Promise.all([
    readNumber(env.CARDS, `spend:${today()}`),
    readNumber(env.CARDS, "spend:total"),
  ]);
  await Promise.all([
    env.CARDS.put(`spend:${today()}`, String(spentToday + cost)),
    env.CARDS.put("spend:total", String(spentTotal + cost)),
  ]);
  console.log(JSON.stringify({ event: "analysis", videoId: body.videoId, cards: cards.length, usage, costUsd: cost, stop: msg.stop_reason, ms: tDone - tRecv }));

  if (opts.cache && msg.stop_reason === "end_turn") {
    const cached: CachedAnalysis = {
      videoId: body.videoId,
      hash: body.hash,
      promptVersion: PROMPT_VERSION,
      model: RUNTIME_MODEL,
      createdAt: new Date().toISOString(),
      cards,
      usage,
      costUsd: cost,
    };
    await env.CARDS.put(key, JSON.stringify(cached));
    // pointer for the judge demo, which looks cards up by video id
    await env.CARDS.put(`latest:${PROMPT_VERSION}:${body.videoId}`, key);
  }
  await send({
    type: "done",
    cards: cards.length,
    ...(opts.publicDone ? {} : { usage }),
    costUsd: cost,
    model: RUNTIME_MODEL,
    timings: {
      recvToFirstTokenMs: tFirstToken ? tFirstToken - tRecv : -1,
      recvToFirstCardMs: tFirstCard ? tFirstCard - tRecv : null,
      recvToDoneMs: tDone - tRecv,
    },
  });
}

function validate(u: ModelUnit, segments: AnalyzeRequest["segments"], index: TranscriptIndex): Card | { reason: string } {
  if (!u || typeof u.quote !== "string") return { reason: "malformed" };
  const nodes = (u.nodes ?? []).filter((n) => node(n.id)).slice(0, 3);
  if (nodes.length === 0 && !u.indicator) return { reason: "no node and no indicator" };
  const hit = index.locate(u.quote);
  if (!hit) return { reason: "quote not in transcript" };
  return {
    ...u,
    nodes,
    modelQuote: u.quote,
    quote: hit.text,
    seg: hit.seg,
    startMs: segments[hit.seg].s,
    matchScore: Math.round(hit.score * 100) / 100,
  };
}
