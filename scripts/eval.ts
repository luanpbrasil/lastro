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
import { KG, node, opponents, schoolsOf } from "../shared/kg";
import { looseNorm, parseClock, segmentsFromGetTranscript } from "../shared/transcript";

interface StanceCase {
  name: string;
  nodes: { id: string; role: NodeRole }[];
  expect: {
    lead?: { id: string; role: NodeRole };
    disagreeIncludes?: string[];
    /** true: no "Quem discorda" at all (e.g. an institution with no opposes edge). */
    disagreeEmpty?: boolean;
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
  if (e.disagreeEmpty) check(dis.length === 0, `disagree should be empty (got ${dis.join(",")})`);
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
  // Graph rule: card text never names a party or politician (only traditions and institutions).
  for (const w of (gold.forbidInParaphrase ?? []) as string[]) {
    const bad = cards.filter((c) => ` ${looseNorm(c.paraphrase)} `.includes(` ${looseNorm(w)} `));
    check(bad.length === 0, `paraphrase names "${w}": ${bad.map((c) => c.paraphrase).join(" | ")}`);
  }
  for (const g of gold.cases) {
    const before = fail;
    const quotes: string[] = Array.isArray(g.quoteContains) ? g.quoteContains : [g.quoteContains];
    const card = cards.find((c) => quotes.some((q) => looseNorm(c.quote).includes(looseNorm(q))));
    if (g.expectNoCard) {
      check(!card, `there should be no card quoting "${g.quoteContains}" (got: ${card?.paraphrase})`);
      console.log(`  ${fail === before ? "✓" : "✗"} ${gold.videoId}: ${g.name}`);
      continue;
    }
    check(!!card, `no card quoting "${g.quoteContains}"`);
    if (card) {
      if (g.expectNode) {
        const n = card.nodes.find((x) => x.id === g.expectNode);
        check(!!n, `card should link ${g.expectNode} (got ${card.nodes.map((x) => x.id).join(",")})`);
        if (n && g.expectRole) check(n.role === g.expectRole, `${g.expectNode} role ${n.role}, want ${g.expectRole}`);
      }
      if (g.expectAnyOf) {
        // Several readings are acceptable: at least one {node, role} pair must be on the card.
        const ok = (g.expectAnyOf as { node: string; role: string }[]).some((x) => card.nodes.some((n) => n.id === x.node && n.role === x.role));
        check(ok, `card should have one of ${g.expectAnyOf.map((x: { node: string; role: string }) => `${x.node}:${x.role}`).join(" / ")} (got ${card.nodes.map((n) => `${n.id}:${n.role}`).join(",")})`);
      }
      if (g.expectNodeAny) {
        const ids = card.nodes.map((x) => x.id);
        check((g.expectNodeAny as string[]).some((id) => ids.includes(id)), `card should link one of ${g.expectNodeAny.join(",")} (got ${ids.join(",")})`);
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

console.log("\n3. Graph rules");
{
  const before = fail;
  const DOMAINS = ["economia", "politica", "filosofia"];
  // Parties and active politicians must never be nodes or aliases: the graph maps ideas, not people in office.
  const FORBIDDEN = ["PT", "PL", "PSDB", "MDB", "PSOL", "Novo", "União Brasil", "Republicanos", "Lula", "Bolsonaro", "Haddad", "Tarcísio", "Alckmin", "Dilma", "Ciro Gomes", "Marina Silva", "Boulos", "Moro", "Lira", "Pacheco", "Motta", "Alcolumbre"];
  const forb = new Set(FORBIDDEN.map(looseNorm));
  for (const n of KG.nodes) {
    check(Array.isArray(n.domain) && n.domain.length > 0 && n.domain.every((d) => DOMAINS.includes(d)), `${n.id}: domain ${JSON.stringify(n.domain)}`);
    for (const a of [n.name, ...n.aliases]) check(!forb.has(looseNorm(a)), `${n.id}: alias "${a}" names a party or politician`);
    if (n.type === "school") check(opponents(n.id).length > 0, `${n.id}: school with no opposes edge (empty "Quem discorda")`);
    if (n.type === "thinker") check(opponents(n.id).length > 0 || schoolsOf(n.id).some((s) => opponents(s.id).length > 0), `${n.id}: thinker with no opponent, directly or via its schools`);
  }
  for (const e of KG.edges) check(!!node(e.from) && !!node(e.to), `edge ${e.from} ${e.type} ${e.to}: unknown node`);
  console.log(`  ${fail === before ? "✓" : "✗"} ${KG.nodes.length} nodes, ${KG.edges.length} edges: domains, opponents, no parties or politicians`);
}

console.log("\n4. Transcript panel parsing (synthetic get_transcript response)");
{
  const before = fail;
  const seg = (startMs: string, endMs: string, text: string) => ({
    transcriptSegmentRenderer: { startMs, endMs, snippet: { runs: [{ text }] }, targetId: `abcDEF12345.CgNhc3I.${startMs}.${endMs}` },
  });
  const resp = {
    actions: [{ updateEngagementPanelAction: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: { body: { transcriptSegmentListRenderer: {
      initialSegments: [seg("120", "2520", "Olá,  pessoal."), { transcriptSectionHeaderRenderer: { startMs: "2520" } }, seg("2520", "5000", " a Selic\nsubiu "), seg("5000", "5000", "")],
    } } } } } } } }],
  };
  const r = segmentsFromGetTranscript(resp);
  check(r.videoId === "abcDEF12345", `video id from targetId (got ${r.videoId})`);
  check(r.segments.length === 2, `2 segments: chapter headers and empty rows dropped (got ${r.segments.length})`);
  check(JSON.stringify(r.segments[0]) === JSON.stringify({ s: 120, d: 2400, t: "Olá, pessoal." }), `segment shape ${JSON.stringify(r.segments[0])}`);
  check(r.segments[1]?.t === "a Selic subiu", `whitespace collapsed (got ${JSON.stringify(r.segments[1]?.t)})`);
  check(segmentsFromGetTranscript({}).segments.length === 0, "empty response: no segments");
  check(parseClock("1:02:03") === 3_723_000 && parseClock("4:05") === 245_000 && parseClock("x") === null, "panel clock parsing");
  console.log(`  ${fail === before ? "✓" : "✗"} get_transcript → segments, video id, clock`);
}

console.log(`\n${pass} checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
