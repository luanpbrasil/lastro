import type { Segment } from "./schema";
import { looseNorm } from "./transcript";

/**
 * Topic classifier: TF-IDF (word 1–2-grams + char 3–5-grams) → one logistic regression per topic.
 * Trained offline (scripts/classifier/train.py) on tokens produced by `topicTokens` below, so the
 * browser, the Worker and training share one tokenizer. The model is shared/topics-model.json.
 */
export const TOPICS = ["economia", "politica", "filosofia"] as const;
export type Topic = (typeof TOPICS)[number];
/** "full" = title + description + first 3 min of captions; "meta" = title + description only. */
export type TopicVariant = "full" | "meta";

export const CAPTION_WINDOW_MS = 180_000;
const MAX_DESCRIPTION_CHARS = 1500;

export interface TopicModel {
  version: string;
  labels: Topic[];
  vocab: string[];
  idf: number[];
  /** coef[label][feature] */
  coef: number[][];
  intercept: number[];
  /** Per variant, per label (same order as `labels`). A model trained without captions has no "full". */
  thresholds: Partial<Record<TopicVariant, number[]>> & { meta: number[] };
}

/** The text the classifier sees. Captions: only the first 3 minutes. */
export function topicText(title: string, description: string, captions?: Pick<Segment, "s" | "t">[]): string {
  const desc = description.replace(/https?:\/\/\S+/g, " ").slice(0, MAX_DESCRIPTION_CHARS);
  const cap = captions ? captions.filter((s) => s.s < CAPTION_WINDOW_MS).map((s) => s.t).join(" ") : "";
  return `${title}\n${desc}\n${cap}`;
}

/** Word unigrams/bigrams ("w:") and per-word char 3–5-grams with boundary spaces ("c:"). */
export function topicTokens(text: string): string[] {
  const words = looseNorm(text).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    out.push(`w:${words[i]}`);
    if (i + 1 < words.length) out.push(`w:${words[i]} ${words[i + 1]}`);
    const p = ` ${words[i]} `;
    for (let n = 3; n <= 5; n++) {
      for (let j = 0; j + n <= p.length; j++) out.push(`c:${p.slice(j, j + n)}`);
    }
  }
  return out;
}

/**
 * Which topics trigger an analysis (Luan, 2026-11-08: "economia OR política", each at its own threshold).
 * Test set (eval/classifier/or_rule.md): economia recall 0.85 → 0.96, trigger precision 0.79.
 * Most política-only videos yield few cards today; drop "politica" here to go back to economia only.
 */
export const ANALYZE_TOPICS: Topic[] = ["economia", "politica"];

export function shouldAnalyze(r: TopicResult): boolean {
  return r.topics.some((t) => ANALYZE_TOPICS.includes(t));
}

export interface TopicResult {
  variant: TopicVariant;
  scores: Record<Topic, number>;
  /** Topics whose score clears their threshold for this variant. Empty = none of the three. */
  topics: Topic[];
}

export class TopicScorer {
  private index = new Map<string, number>();
  constructor(private m: TopicModel) {
    m.vocab.forEach((t, i) => this.index.set(t, i));
  }

  /** Probability per label, same order as model.labels. */
  probabilities(tokens: string[]): number[] {
    const counts = new Map<number, number>();
    for (const t of tokens) {
      const i = this.index.get(t);
      if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    // sublinear tf × idf, then l2 norm (same as sklearn TfidfVectorizer(sublinear_tf=True, norm="l2"))
    const feats: [number, number][] = [];
    let sq = 0;
    for (const [i, c] of counts) {
      const v = (1 + Math.log(c)) * this.m.idf[i];
      feats.push([i, v]);
      sq += v * v;
    }
    const norm = Math.sqrt(sq) || 1;
    return this.m.labels.map((_, l) => {
      const w = this.m.coef[l];
      let z = this.m.intercept[l];
      for (const [i, v] of feats) z += w[i] * (v / norm);
      return 1 / (1 + Math.exp(-z));
    });
  }

  classify(title: string, description: string, captions?: Pick<Segment, "s" | "t">[]): TopicResult {
    const full = this.m.thresholds.full;
    const variant: TopicVariant = full && captions && captions.length ? "full" : "meta";
    const p = this.probabilities(topicTokens(topicText(title, description, variant === "full" ? captions : undefined)));
    const th = variant === "full" && full ? full : this.m.thresholds.meta;
    const scores = Object.fromEntries(this.m.labels.map((l, i) => [l, p[i]])) as Record<Topic, number>;
    return { variant, scores, topics: this.m.labels.filter((_, i) => p[i] >= th[i]) };
  }
}
