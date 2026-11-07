import type { Segment } from "./schema";
import { looseNorm } from "./transcript";

interface Tok {
  norm: string;
  orig: string;
  seg: number;
}

/** Word index over the transcript, built once per analysis. */
export class TranscriptIndex {
  private toks: Tok[] = [];

  constructor(segs: Segment[]) {
    segs.forEach((s, seg) => {
      for (const orig of s.t.split(/\s+/)) {
        const norm = looseNorm(orig).replace(/ /g, "");
        if (norm) this.toks.push({ norm, orig, seg });
      }
    });
  }

  /**
   * Find where a (possibly slightly reworded) quote occurs.
   * Score = share of the quote's distinct words present in a same-length window.
   * Returns the segment of the window's first matching word and the exact caption text of the window.
   */
  locate(quote: string, minScore = 0.75): { seg: number; text: string; score: number } | null {
    const q = looseNorm(quote).split(" ").filter(Boolean);
    if (q.length < 3) return null;
    const qset = new Set(q);
    const L = q.length;
    let best = { start: -1, score: 0 };
    for (let i = 0; i + 1 <= this.toks.length; i++) {
      // cheap pre-filter: window must start on a quote word
      if (!qset.has(this.toks[i].norm)) continue;
      const seen = new Set<string>();
      for (let j = i; j < Math.min(i + L + 2, this.toks.length); j++) {
        if (qset.has(this.toks[j].norm)) seen.add(this.toks[j].norm);
      }
      const score = seen.size / qset.size;
      if (score > best.score) best = { start: i, score };
      if (score === 1) break;
    }
    if (best.start < 0 || best.score < minScore) return null;
    const win = this.toks.slice(best.start, Math.min(best.start + L, this.toks.length));
    return { seg: win[0].seg, text: win.map((t) => t.orig).join(" "), score: best.score };
  }
}
