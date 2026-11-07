import Anthropic from "@anthropic-ai/sdk";
import { node } from "../../shared/kg";
import { gateB } from "../../shared/lexicon";
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
import { transcriptHash } from "../../shared/transcript";
import { UnitStreamParser } from "../../shared/unitStream";

interface Env {
  ANTHROPIC_API_KEY: string;
  CARDS: KVNamespace;
  /** Worker stops calling Claude once the ledger reaches this (USD). */
  MAX_SPEND_USD?: string;
  /** Max uncached analyses per UTC day. */
  DAILY_CAP?: string;
  /** "1" lets a request skip the cache (dev and bench only). */
  ALLOW_CACHE_BYPASS?: string;
}

const MAX_CAPTION_CHARS = 60_000; // ≈ 60 min of speech
const MAX_TOKENS = 6000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const SYSTEM = systemPrompt();
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
  const { videoId, title = "", hash, segments } = body;
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

  // Server-side gate, so the endpoint is not a free LLM proxy.
  const last = segments[segments.length - 1];
  const g = gateB(`${title} ${segments.map((s) => s.t).join(" ")}`, last.s + last.d);
  if (!g.pass) return json({ error: "off topic", perMin: g.perMin }, 422);

  // Spend guardrails.
  const maxSpend = Number(env.MAX_SPEND_USD ?? "4");
  const cap = Number(env.DAILY_CAP ?? "100");
  const [spent, count, pending] = await Promise.all([
    readNumber(env.CARDS, "spend:total"),
    readNumber(env.CARDS, `count:${today()}`),
    env.CARDS.get(`pending:${key}`),
  ]);
  if (spent >= maxSpend) return json({ error: "spend limit reached; cache only" }, 402);
  if (count >= cap) return json({ error: "daily cap reached" }, 429);
  if (pending && !bypass) return json({ error: "analysis in progress; retry shortly" }, 409);
  await env.CARDS.put(`pending:${key}`, "1", { expirationTtl: 120 });
  await env.CARDS.put(`count:${today()}`, String(count + 1), { expirationTtl: 3 * 86400 });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (e: StreamEvent) => writer.write(enc.encode(JSON.stringify(e) + "\n"));

  ctx.waitUntil(
    (async () => {
      try {
        await send({ type: "meta", cached: false, promptVersion: PROMPT_VERSION, tRecv });
        await runModel(env, body, tRecv, send, key);
      } catch (err) {
        console.error("analyze failed", err instanceof Error ? err.message : String(err));
        await send({ type: "error", message: "analysis failed" }).catch(() => {});
      } finally {
        await env.CARDS.delete(`pending:${key}`).catch(() => {});
        await writer.close().catch(() => {});
      }
    })(),
  );

  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
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

  if (msg.stop_reason === "end_turn") {
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
  }
  await send({
    type: "done",
    cards: cards.length,
    usage,
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
