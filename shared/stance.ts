import { node, opponents, schoolsOf, testedIn, type KgNode } from "./kg";
import type { Card, NodeRole } from "./schema";

type Ref = KgNode["refs"][number];

/**
 * What a card shows, seen from the SPEAKER's side.
 * - relies_on / echoes: the speaker is with the node → its opponents disagree with the speaker;
 *   its intro/deep refs explain the speaker's line; its "opposing" ref is the other side.
 * - contradicts: the speaker is against the node → the node itself is the view that disagrees;
 *   its intro/deep refs are the other side; its "opposing" ref (a critique of the node) is on the speaker's line.
 * - A thinker with no `opposes` edge of its own borrows the opponents of the schools it is a proponent of.
 * - An institution with no `opposes` edge has no "Quem discorda" (the card hides the section).
 * - A school or thinker never gets an institution in "Quem discorda": institutions are not views.
 */
export interface StanceView {
  lead: { role: NodeRole; node: KgNode } | null;
  /** Views that disagree with what the speaker says. */
  disagree: { node: KgNode; note?: string }[];
  /** Readings that explain the speaker's line. */
  readSpeaker: Ref[];
  /** The strongest readings against the speaker's line. */
  readOpposing: Ref[];
  tested: { node: KgNode; note?: string }[];
}

const isPro = (r: NodeRole) => r === "relies_on" || r === "echoes";

function pick<T extends { node: KgNode }>(xs: T[]): T | undefined {
  return xs.find((x) => x.node.type === "school") ?? xs[0];
}

function uniqRefs(refs: Ref[], exclude: Set<string> = new Set()): Ref[] {
  const seen = new Set(exclude);
  return refs.filter((r) => !seen.has(r.title) && (seen.add(r.title), true));
}

export function stanceView(card: Pick<Card, "nodes">): StanceView {
  const linked = card.nodes
    .map((n) => ({ role: n.role, node: node(n.id) }))
    .filter((x): x is { role: NodeRole; node: KgNode } => !!x.node);
  const pro = linked.filter((x) => isPro(x.role));
  const con = linked.filter((x) => x.role === "contradicts");
  const mainPro = pick(pro);
  const mainCon = pick(con);
  const lead = mainPro ?? mainCon ?? null;

  const proIds = new Set(pro.map((x) => x.node.id));
  const disagreeMap = new Map<string, { node: KgNode; note?: string }>();
  for (const c of con) disagreeMap.set(c.node.id, { node: c.node });
  if (mainPro) {
    let opp = opponents(mainPro.node.id);
    if (!opp.length && mainPro.node.type === "thinker") opp = schoolsOf(mainPro.node.id).flatMap((s) => opponents(s.id));
    // "Quem discorda" lists views. An institution is not a view that disagrees with a school or thinker
    // (e.g. a liberal speaker gets no "Legislação trabalhista"); it still disagrees when the speaker relies on another institution.
    if (mainPro.node.type !== "institution") opp = opp.filter((o) => o.node.type !== "institution");
    for (const o of opp) if (!proIds.has(o.node.id) && o.node.id !== mainPro.node.id) disagreeMap.set(o.node.id, o);
  }

  const speakerRefs: Ref[] = [];
  const opposingRefs: Ref[] = [];
  if (mainPro) {
    speakerRefs.push(...mainPro.node.refs.filter((r) => r.level !== "opposing"));
    opposingRefs.push(...mainPro.node.refs.filter((r) => r.level === "opposing"));
  }
  for (const c of con) {
    opposingRefs.push(...c.node.refs.filter((r) => r.level !== "opposing"));
    speakerRefs.push(...c.node.refs.filter((r) => r.level === "opposing"));
  }
  const readSpeaker = uniqRefs(speakerRefs);
  const readOpposing = uniqRefs(opposingRefs, new Set(readSpeaker.map((r) => r.title)));

  return {
    lead,
    disagree: [...disagreeMap.values()],
    readSpeaker,
    readOpposing,
    tested: lead ? testedIn(lead.node.id) : [],
  };
}
