import Anthropic from "@anthropic-ai/sdk";
import { compare, resolveFact } from "../../../shared/indicators";
import { node } from "../../../shared/kg";
import { TranscriptIndex } from "../../../shared/locate";
import { costUsd, RUNTIME_MODEL } from "../../../shared/prices";
import { systemPrompt } from "../../../shared/prompt";
import { outputSchema, type Card, type ModelUnit, type Segment } from "../../../shared/schema";
import { fmtTime } from "../../../shared/transcript";
import { UnitStreamParser } from "../../../shared/unitStream";
import type { CheckedCard, FactCheck } from "../types";

const MAX_TOKENS = 3000;
const FACT_TIMEOUT_MS = 6000;

const LIVE_RULES = `

Esta transcrição é um trecho de cerca de 30 segundos, gerada ao vivo por reconhecimento de fala:
- Ela não tem pontuação confiável, pode trocar nomes próprios e pode escrever números por extenso ("treze vírgula setenta e cinco por cento" → claimed_value 13.75).
- Copie a quote exatamente como está na transcrição, mesmo com erros.
- Gere units apenas do bloco "Transcrição". O bloco "Contexto" serve só para entender o começo da fala.
- Não repita ideias listadas em "Ideias já registradas".
- No máximo 4 units por trecho. Se o trecho não tiver nenhuma ideia que se encaixe nas regras, devolva units vazio.`;

const SYSTEM = systemPrompt() + LIVE_RULES;
const SCHEMA = outputSchema();

export interface ChunkInput {
  title: string;
  context: Segment[];
  segments: Segment[];
  knownIdeas: string[];
}

const lines = (segs: Segment[]) => segs.map((s) => `(${fmtTime(s.s)}) ${s.t}`).join("\n");

function buildPrompt({ title, context, segments, knownIdeas }: ChunkInput): string {
  const parts = [`Título do vídeo: ${title}`];
  if (knownIdeas.length) parts.push(`Ideias já registradas:\n${knownIdeas.map((p) => `- ${p}`).join("\n")}`);
  if (context.length) parts.push(`Contexto:\n${lines(context)}`);
  parts.push(`Transcrição:\n${lines(segments)}`);
  return parts.join("\n\n");
}

/** Keep a unit only if its quote is really in the new part of the transcript and it points at known nodes. */
function toCard(u: ModelUnit, all: Segment[], index: TranscriptIndex, contextLen: number): Card | null {
  if (!u || typeof u.quote !== "string") return null;
  const nodes = (u.nodes ?? []).filter((n) => node(n.id)).slice(0, 3);
  if (nodes.length === 0 && !u.indicator) return null;
  const hit = index.locate(u.quote);
  if (!hit || hit.seg < contextLen) return null;
  return { ...u, nodes, quote: hit.text, seg: hit.seg, startMs: all[hit.seg].s, matchScore: Math.round(hit.score * 100) / 100 };
}

async function checkFact(card: Card): Promise<FactCheck | null> {
  if (card.kind !== "fact" || !card.indicator) return null;
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FACT_TIMEOUT_MS));
    const fact = await Promise.race([resolveFact(card.indicator, card.period ?? null), timeout]);
    if (!fact) return { verdict: null, official: null };
    const { label, unit, source, sourceUrl, value, date, periodLabel } = fact;
    return { verdict: compare(card.claimed_value, value), official: { label, unit, source, sourceUrl, value, date, periodLabel } };
  } catch (err) {
    console.error("official data failed", card.indicator, err instanceof Error ? err.message : String(err));
    return { verdict: null, official: null };
  }
}

/** One Claude call over one transcript chunk, then an official-data lookup for each fact card. */
export async function factCheckChunk(apiKey: string, input: ChunkInput): Promise<{ cards: CheckedCard[]; costUsd: number }> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: RUNTIME_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  if (msg.stop_reason === "refusal") throw new Error("model refused");

  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const all = [...input.context, ...input.segments];
  const index = new TranscriptIndex(all);
  // The stream parser also keeps the complete units of a reply cut off by max_tokens.
  const cards = new UnitStreamParser()
    .push(text)
    .map((u) => toCard(u as ModelUnit, all, index, input.context.length))
    .filter((c): c is Card => c !== null);

  const checked = await Promise.all(cards.map(async (card): Promise<CheckedCard> => ({ ...card, check: await checkFact(card) })));
  return {
    cards: checked,
    costUsd: costUsd(RUNTIME_MODEL, {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      cache_read_input_tokens: msg.usage.cache_read_input_tokens,
      cache_creation_input_tokens: msg.usage.cache_creation_input_tokens,
    }),
  };
}
