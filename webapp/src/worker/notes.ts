import type { Card, ModelNote } from "../../../shared/schema";
import { stanceView } from "../../../shared/stance";
import { namesIn } from "./names";
import { isSafeText } from "./sanitize";

/**
 * p9 context and counterpoint (as in the extension's Worker, shared/prompt.ts): the model writes them as a "notes"
 * array after all units, one per unit. Written inside each unit they changed which nodes the model picked, so they
 * come last. Only Claude is asked for them: Workers AI keeps the shorter reply its neuron budget was measured on,
 * and its cards show the layout without context.
 */
export function notesRules(source: "transcript" | "post"): string {
  const where = source === "transcript" ? "the Transcript block" : "the post";
  const lang = source === "transcript" ? "in the language of the video" : "in the language of the post";
  return `After all units, return "notes": one note for EACH unit, in the same order, skipping none (notes has as many entries as units). Every unit with nodes, a fact included, gets a context; only a unit without nodes gets context and counterpoint "".
- i: the unit's position in units (the first is 0).
- context: 1 or 2 sentences on why this claim belongs to the first node in nodes, following the author's own argument here: which step of their reasoning is typical of that node. Don't repeat the paraphrase or the node's summary.
- against: the id of the view that disagrees with this claim: the node with an "opposes" link to the first node in nodes (if the first node is a thinker, to their school); if the claim goes against the first node (role "contradicts"), that node. Never a node on the author's side. null when the map has no such link.
- counterpoint: 1 or 2 sentences on how the "against" view would answer this claim, starting from the note on that link. "" when against is null.
- In context and counterpoint use only what is in ${where} and in the map: no name, number, date or work that isn't there, no party or politician, and never say who is right. Plain words for someone who isn't an economist, ${lang}.`;
}

/** The shared schema without "notes", for Workers AI. */
export function withoutNotes(schema: Record<string, unknown>): Record<string, unknown> {
  const s = structuredClone(schema) as { required: string[]; properties: Record<string, unknown> };
  delete s.properties.notes;
  s.required = s.required.filter((k) => k !== "notes");
  return s;
}

const MAX_NOTE_CHARS = 500;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Free text from the model, shown as text: no links, handles or markup, and short. */
const safe = (t: string) => t.length > 0 && t.length <= MAX_NOTE_CHARS && isSafeText(t);

/**
 * A card with its note. Context only on a card with nodes (it explains the first one). The counterpoint is kept only
 * when it speaks for a view the card shows under "Who disagrees" (shared/stance.ts); otherwise that list keeps the
 * map's note on the link.
 */
export function withNote<C extends Pick<Card, "nodes">>(card: C, raw: unknown, where: "chunk" | "post" = "chunk"): C {
  const n = (raw ?? {}) as Partial<ModelNote>;
  const context = clean(n.context);
  // A party or politician in either text: that text is left out, and the card shows the map's text instead.
  if (!card.nodes.length || !safe(context) || namesIn(context, where, "context", "cleared")) return card;
  const out: C & Pick<Card, "context" | "counterpoint" | "counterpointBy"> = { ...card, context };
  const by = typeof n.against === "string" && stanceView(card).disagree.some((d) => d.node.id === n.against) ? n.against : null;
  const counterpoint = clean(n.counterpoint);
  if (by && safe(counterpoint) && !namesIn(counterpoint, where, "counterpoint", "cleared")) {
    out.counterpoint = counterpoint;
    out.counterpointBy = by;
  }
  return out;
}

/** The note's unit position, when it is a whole number. */
export const noteIndex = (raw: unknown): number | null => {
  const i = (raw as { i?: unknown } | null)?.i;
  return typeof i === "number" && Number.isInteger(i) && i >= 0 ? i : null;
};
