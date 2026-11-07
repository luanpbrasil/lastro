import type { Segment } from "./schema";
import { looseNorm } from "./transcript";

/** One normalised token, tokenised exactly like quotes are ("7,25%" → "7", "25%"). */
interface Tok {
  norm: string;
  /** index into `words` (the original caption words) */
  word: number;
}

/** Word index over the transcript, built once per analysis. */
export class TranscriptIndex {
  private toks: Tok[] = [];
  private words: { orig: string; seg: number }[] = [];

  constructor(segs: Segment[]) {
    segs.forEach((s, seg) => {
      for (const orig of s.t.split(/\s+/)) {
        const parts = looseNorm(orig).split(" ").filter(Boolean);
        if (!parts.length) continue;
        const word = this.words.push({ orig, seg }) - 1;
        for (const norm of parts) this.toks.push({ norm, word });
      }
    });
  }

  /**
   * Find where a (possibly slightly reworded) quote occurs.
   * Score = share of the quote's distinct tokens present in a window of about the quote's length.
   * Returns the segment where the match starts and the exact caption words of the match.
   */
  locate(quote: string, minScore = 0.75): { seg: number; text: string; score: number } | null {
    const q = looseNorm(quote).split(" ").filter(Boolean);
    if (q.length < 3) return null;
    const qset = new Set(q);
    // Prefer windows that start on one of the quote's first two tokens; fall back to any quote token
    // (a window starting on an earlier "a"/"em" can also contain the whole quote and win the tie).
    const heads = new Set(q.slice(0, 2));
    return this.best(q, qset, minScore, (t) => heads.has(t)) ?? this.best(q, qset, minScore, (t) => qset.has(t));
  }

  private best(q: string[], qset: Set<string>, minScore: number, canStart: (norm: string) => boolean): { seg: number; text: string; score: number } | null {
    const L = q.length;
    let best = { start: -1, score: 0, eff: 0 };
    for (let i = 0; i < this.toks.length; i++) {
      if (!canStart(this.toks[i].norm)) continue;
      const seen = new Set<string>();
      for (let j = i; j < Math.min(i + L + 2, this.toks.length); j++) {
        if (qset.has(this.toks[j].norm)) seen.add(this.toks[j].norm);
      }
      const score = seen.size / qset.size;
      const exactHead = this.toks[i].norm === q[0];
      // tiny bonus so a window starting exactly on the quote's first token wins ties
      const eff = score + (exactHead ? 0.001 : 0);
      if (eff > best.eff) best = { start: i, score, eff };
      if (score === 1 && exactHead) break;
    }
    if (best.start < 0 || best.score < minScore) return null;
    let end = Math.min(best.start + L, this.toks.length);
    // trim trailing tokens that are not in the quote
    while (end - 1 > best.start && !qset.has(this.toks[end - 1].norm)) end--;
    const first = this.toks[best.start].word;
    const last = this.toks[end - 1].word;
    const words = this.words.slice(first, last + 1);
    return { seg: words[0].seg, text: words.map((w) => w.orig).join(" "), score: best.score };
  }
}
