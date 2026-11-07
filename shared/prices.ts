import type { Usage } from "./schema";

/**
 * USD per million tokens. Anthropic price table as cached 2026-10-06 (BUILD_PLAN rev 3, 💲).
 * Haiku 5.5 rates apply to prompts ≤ 100K tokens. Cache read = 0.1× input (Haiku) / $0.20 (Opus);
 * 5-minute cache write = 1.25× input.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** The only model the Worker may call (rev 3 guardrail). */
export const RUNTIME_MODEL = "claude-haiku-5-5";

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`no price for ${model}`);
  const m = 1_000_000;
  return (
    (u.input_tokens * p.input) / m +
    (u.output_tokens * p.output) / m +
    ((u.cache_read_input_tokens ?? 0) * p.cacheRead) / m +
    ((u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / m
  );
}
