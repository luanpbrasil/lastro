/**
 * Eval, $0 by default.
 * 1. Card stance logic (eval/stance-cases.json) against shared/stance.ts.
 * 2. Model labels (eval/gold/*.json) against recorded streams in fixtures/streams/ (or --stream <file>).
 *
 *   npm run eval [-- --stream fixtures/streams/<videoId>.ndjson]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { TranscriptIndex } from "../shared/locate";
import type { Card, NodeRole, Segment, StreamEvent } from "../shared/schema";
import { stanceView } from "../shared/stance";
import { looseNorm } from "../shared/transcript";

interface StanceCase {
  name: string;
  nodes: { id: string; role: NodeRole }[];
  expect: {
    lead?: { id: string; role: NodeRole };
    disagreeIncludes?: string[];
    disagreeExcludes?: string[];
    readOpposingIncludes?: string[];
    readOpposingExcludes?: string[];
    readSpeakerIncludes?: string[];
    readSpeakerExcludes?: string[];
  };
}

let pass = 0;
let fail = 0;
const check = (ok: boolean, what: string) => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`    ✗ ${what}`);
  }
};

console.log("1. Card stance logic");
const stance = JSON.parse(readFileSync("eval/stance-cases.json", "utf8")).cases as StanceCase[];
for (const c of stance) {
  const before = fail;
  const v = stanceView({ nodes: c.nodes });
  const e = c.expect;
  const dis = v.disagree.map((d) => d.node.id);
  const opp = v.readOpposing.map((r) => r.title).join(" | ");
  const spk = v.readSpeaker.map((r) => r.title).join(" | ");
  if (e.lead) check(v.lead?.node.id === e.lead.id && v.lead?.role === e.lead.role, `lead ${v.lead?.node.id}/${v.lead?.role}, want ${e.lead.id}/${e.lead.role}`);
  for (const id of e.disagreeIncludes ?? []) check(dis.includes(id), `disagree should include ${id} (got ${dis.join(",")})`);
  for (const id of e.disagreeExcludes ?? []) check(!dis.includes(id), `disagree should exclude ${id} (got ${dis.join(",")})`);
  for (const t of e.readOpposingIncludes ?? []) check(opp.includes(t), `opposing reading should include "${t}" (got ${opp})`);
  for (const t of e.readOpposingExcludes ?? []) check(!opp.includes(t), `opposing reading should exclude "${t}" (got ${opp})`);
  for (const t of e.readSpeakerIncludes ?? []) check(spk.includes(t), `speaker reading should include "${t}" (got ${spk})`);
  for (const t of e.readSpeakerExcludes ?? []) check(!spk.includes(t), `speaker reading should exclude "${t}" (got ${spk})`);
  console.log(`  ${fail === before ? "✓" : "✗"} ${c.name}`);
}

console.log("\n2. Model labels vs gold (recorded streams)");
const args = process.argv.slice(2);
const si = args.indexOf("--stream");
for (const f of readdirSync("eval/gold").filter((x) => x.endsWith(".json"))) {
  const gold = JSON.parse(readFileSync(`eval/gold/${f}`, "utf8"));
  const stream = si >= 0 ? args[si + 1] : `fixtures/streams/${gold.videoId}.ndjson`;
  if (!existsSync(stream)) {
    console.log(`  - ${gold.videoId}: no recorded stream at ${stream}; run npm run analyze first`);
    continue;
  }
  const cards = readFileSync(stream, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as StreamEvent)
    .flatMap((e) => (e.type === "card" ? [e.card as Card] : []));
  // With a transcript, timestamps are re-checked with the current quote locator ($0).
  const index = gold.transcript && existsSync(gold.transcript)
    ? { segs: JSON.parse(readFileSync(gold.transcript, "utf8")).segments as Segment[] }
    : null;
  const locator = index ? new TranscriptIndex(index.segs) : null;
  for (const g of gold.cases) {
    const before = fail;
    const card = cards.find((c) => looseNorm(c.quote).includes(looseNorm(g.quoteContains)));
    check(!!card, `no card quoting "${g.quoteContains}"`);
    if (card) {
      if (g.expectNode) {
        const n = card.nodes.find((x) => x.id === g.expectNode);
        check(!!n, `card should link ${g.expectNode} (got ${card.nodes.map((x) => x.id).join(",")})`);
        if (n && g.expectRole) check(n.role === g.expectRole, `${g.expectNode} role ${n.role}, want ${g.expectRole}`);
      }
      if (g.expectIndicator) check(card.indicator === g.expectIndicator, `indicator ${card.indicator}, want ${g.expectIndicator}`);
      if ("expectClaimed" in g) check(card.claimed_value === g.expectClaimed, `claimed ${card.claimed_value}, want ${g.expectClaimed}`);
      if ("expectPeriod" in g) check((card.period ?? null) === g.expectPeriod, `period ${card.period}, want ${g.expectPeriod}`);
      if ("expectStartS" in g && locator && index) {
        const hit = locator.locate(card.modelQuote ?? card.quote);
        const s = hit ? Math.round(index.segs[hit.seg].s / 1000) : null;
        check(s === g.expectStartS, `located at ${s}s, want ${g.expectStartS}s`);
      }
    }
    console.log(`  ${fail === before ? "✓" : "✗"} ${gold.videoId}: ${g.name}`);
  }
}

console.log(`\n${pass} checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
