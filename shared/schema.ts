import { NODE_IDS } from "./kg";

/** Bump when the prompt or schema changes; it is part of the cache key. */
export const PROMPT_VERSION = "p6";

export const INDICATORS = [
  "selic_meta",
  "ipca_12m",
  "ipca_mensal",
  "desemprego",
  "pib_tri",
  "dbgg_pib",
  "dlsp_pib",
  "cambio_usd",
  "focus_selic",
] as const;
export type Indicator = (typeof INDICATORS)[number];

export type UnitKind = "fact" | "theory" | "forecast";
export type NodeRole = "relies_on" | "echoes" | "contradicts";

/** One argument unit as the model returns it. */
export interface ModelUnit {
  quote: string;
  paraphrase: string;
  kind: UnitKind;
  nodes: { id: string; role: NodeRole }[];
  indicator: Indicator | null;
  claimed_value: number | null;
  /** When the claimed value applies: "YYYY" or "YYYY-MM"; null = now (latest data). */
  period: string | null;
}

/** A unit after server validation: located in the transcript, quote replaced by the exact caption text. */
export interface Card extends ModelUnit {
  seg: number;
  startMs: number;
  /** Share of the model's quote words found at that spot (1 = verbatim). */
  matchScore: number;
  /** The quote as the model wrote it, before it was replaced by the caption text (for re-locating in evals). */
  modelQuote?: string;
}

export interface Segment {
  /** start, ms */
  s: number;
  /** duration, ms */
  d: number;
  /** text */
  t: string;
}

export interface AnalyzeRequest {
  videoId: string;
  title: string;
  /** Video description; used only by the server-side topic check. */
  description?: string;
  hash: string;
  segments: Segment[];
  /** The viewer pressed "Analisar este vídeo" on a video the topic check rejected. */
  force?: boolean;
}

/** Lines of the NDJSON stream from /analyze, and the cached result. */
export type StreamEvent =
  | { type: "meta"; cached: boolean; promptVersion: string; tRecv: number }
  | { type: "card"; card: Card; tServer: number }
  | { type: "dropped"; reason: string; quote?: string }
  | {
      type: "done";
      cards: number;
      usage?: Usage;
      costUsd?: number;
      model?: string;
      timings?: { recvToFirstTokenMs: number; recvToFirstCardMs: number | null; recvToDoneMs: number };
    }
  | { type: "error"; message: string };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface CachedAnalysis {
  videoId: string;
  hash: string;
  promptVersion: string;
  model: string;
  createdAt: string;
  cards: Card[];
  usage: Usage;
  costUsd: number;
}

/** JSON schema for structured output (no min/max constraints: unsupported). */
export function outputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["units"],
    properties: {
      units: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["quote", "paraphrase", "kind", "nodes", "indicator", "claimed_value", "period"],
          properties: {
            quote: { type: "string" },
            paraphrase: { type: "string" },
            kind: { type: "string", enum: ["fact", "theory", "forecast"] },
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "role"],
                properties: {
                  id: { type: "string", enum: NODE_IDS },
                  role: { type: "string", enum: ["relies_on", "echoes", "contradicts"] },
                },
              },
            },
            indicator: { anyOf: [{ type: "string", enum: [...INDICATORS] }, { type: "null" }] },
            claimed_value: { anyOf: [{ type: "number" }, { type: "null" }] },
            period: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      },
    },
  };
}
