/**
 * The gold checks on one video's cards, shared by the root eval (recorded Worker streams) and eval:web (the webapp's
 * Claude path). `check` counts and prints each failure; the returned lines are the per-case summary.
 */
import { existsSync, readFileSync } from "node:fs";
import { node } from "../shared/kg";
import { TranscriptIndex } from "../shared/locate";
import type { Card, Segment } from "../shared/schema";
import { namesPolitics as namesPoliticsShared } from "../shared/politics";
import { stanceView } from "../shared/stance";
import { looseNorm } from "../shared/transcript";

/** Number tokens ("13,75", "2015") in a text. */
export const digitsIn = (t: string) => t.match(/\d+(?:[.,]\d+)*/g) ?? [];

/** Any capitalisation: the eval reads more strictly than the Worker's filter. */
export const namesPolitics = (t: string) => namesPoliticsShared(t, true);

export interface GoldCase {
  name: string;
  quoteContains: string | string[];
  expectNoCard?: boolean;
  expectNode?: string;
  expectRole?: string;
  expectAnyOf?: { node: string; role: string }[];
  expectNodeAny?: string[];
  expectIndicator?: string;
  expectClaimed?: number | null;
  expectPeriod?: string | null;
  expectStartS?: number;
}
export interface Gold {
  videoId: string;
  title?: string;
  transcript?: string;
  forbidInParaphrase?: string[];
  cases: GoldCase[];
}

/** Cards may carry the webapp's headline, also free text. */
type GoldCard = Card & { headline?: string };

/**
 * `version` is the prompt version the cards came from (9+: context/counterpoint expected on theory/forecast cards
 * with nodes). Returns one summary line per group of checks, "  ✓ …" or "  ✗ …".
 */
export function goldChecks(gold: Gold, cards: GoldCard[], version: number, check: (ok: boolean, what: string) => void): string[] {
  let failed = 0;
  const ck = (ok: boolean, what: string) => {
    if (!ok) failed++;
    check(ok, what);
  };
  const lines: string[] = [];
  // With a transcript, timestamps are re-checked with the current quote locator ($0).
  const index = gold.transcript && existsSync(gold.transcript)
    ? { segs: JSON.parse(readFileSync(gold.transcript, "utf8")).segments as Segment[] }
    : null;
  const locator = index ? new TranscriptIndex(index.segs) : null;
  // Graph rule: card text never names a party or politician (only traditions and institutions).
  for (const w of gold.forbidInParaphrase ?? []) {
    const bad = cards.filter((c) => ` ${looseNorm(c.paraphrase)} `.includes(` ${looseNorm(w)} `));
    ck(bad.length === 0, `paraphrase names "${w}": ${bad.map((c) => c.paraphrase).join(" | ")}`);
    const badHead = cards.filter((c) => c.headline !== undefined);
    if (badHead.length) {
      const named = badHead.filter((c) => ` ${looseNorm(c.headline!)} `.includes(` ${looseNorm(w)} `));
      ck(named.length === 0, `headline names "${w}": ${named.map((c) => c.headline).join(" | ")}`);
    }
  }
  // p9+ enrichment: theory/forecast cards with nodes carry context (a fact card's depth is the official data, and the
  // model often leaves its note empty: it then renders the p8 layout); context/counterpoint add no numbers and name
  // no party or politician.
  {
    const before = failed;
    for (const c of cards) {
      const at = `@${Math.round(c.startMs / 1000)}s`;
      if (version >= 9 && c.nodes.length && c.kind !== "fact") ck(!!c.context?.trim(), `${at}: ${c.kind} card with nodes but no context`);
      const v = stanceView(c);
      if (c.counterpoint) ck(!!c.counterpointBy && v.disagree.some((d) => d.node.id === c.counterpointBy), `${at}: counterpoint from ${c.counterpointBy}, not a view under "Quem discorda"`);
      const mapText = [...c.nodes.map((n) => node(n.id)), ...v.disagree.map((d) => d.node)]
        .flatMap((n) => (n ? [n.name, n.summary, ...n.claims, ...n.aliases] : []))
        .concat(v.disagree.map((d) => d.note ?? ""));
      const allowed = new Set(digitsIn([c.quote, c.modelQuote ?? "", ...mapText].join(" ")));
      for (const [field, text] of [["context", c.context], ["counterpoint", c.counterpoint]] as const) {
        if (!text) continue;
        const extra = digitsIn(text).filter((d) => !allowed.has(d));
        ck(extra.length === 0, `${at} ${field} has numbers not in the quote or map (${extra.join(", ")}): ${text}`);
        const named = namesPolitics(text);
        ck(named.length === 0, `${at} ${field} names ${named.join(", ")}: ${text}`);
      }
    }
    if (version >= 9) lines.push(`  ${failed === before ? "✓" : "✗"} ${gold.videoId}: context on theory/forecast node cards; no new numbers or political names (${cards.length} cards)`);
  }
  for (const g of gold.cases) {
    const before = failed;
    const quotes: string[] = Array.isArray(g.quoteContains) ? g.quoteContains : [g.quoteContains];
    const card = cards.find((c) => quotes.some((q) => looseNorm(c.quote).includes(looseNorm(q))));
    if (g.expectNoCard) {
      ck(!card, `there should be no card quoting "${g.quoteContains}" (got: ${card?.paraphrase})`);
      lines.push(`  ${failed === before ? "✓" : "✗"} ${gold.videoId}: ${g.name}`);
      continue;
    }
    ck(!!card, `no card quoting "${g.quoteContains}"`);
    if (card) {
      if (g.expectNode) {
        const n = card.nodes.find((x) => x.id === g.expectNode);
        ck(!!n, `card should link ${g.expectNode} (got ${card.nodes.map((x) => x.id).join(",")})`);
        if (n && g.expectRole) ck(n.role === g.expectRole, `${g.expectNode} role ${n.role}, want ${g.expectRole}`);
      }
      if (g.expectAnyOf) {
        // Several readings are acceptable: at least one {node, role} pair must be on the card.
        const ok = g.expectAnyOf.some((x) => card.nodes.some((n) => n.id === x.node && n.role === x.role));
        ck(ok, `card should have one of ${g.expectAnyOf.map((x) => `${x.node}:${x.role}`).join(" / ")} (got ${card.nodes.map((n) => `${n.id}:${n.role}`).join(",")})`);
      }
      if (g.expectNodeAny) {
        const ids = card.nodes.map((x) => x.id);
        ck(g.expectNodeAny.some((id) => ids.includes(id)), `card should link one of ${g.expectNodeAny.join(",")} (got ${ids.join(",")})`);
      }
      if (g.expectIndicator) ck(card.indicator === g.expectIndicator, `indicator ${card.indicator}, want ${g.expectIndicator}`);
      if ("expectClaimed" in g) ck(card.claimed_value === g.expectClaimed, `claimed ${card.claimed_value}, want ${g.expectClaimed}`);
      if ("expectPeriod" in g) ck((card.period ?? null) === g.expectPeriod, `period ${card.period}, want ${g.expectPeriod}`);
      if ("expectStartS" in g && locator && index) {
        const hit = locator.locate(card.modelQuote ?? card.quote);
        const s = hit ? Math.round(index.segs[hit.seg].s / 1000) : null;
        ck(s === g.expectStartS, `located at ${s}s, want ${g.expectStartS}s`);
      }
    }
    lines.push(`  ${failed === before ? "✓" : "✗"} ${gold.videoId}: ${g.name}`);
  }
  return lines;
}
