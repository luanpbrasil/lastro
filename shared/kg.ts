import kgData from "./kg.json";

export type NodeType = "school" | "thinker" | "episode";
export type RefLevel = "intro" | "deep" | "opposing";

export interface KgNode {
  id: string;
  type: NodeType;
  name: string;
  aliases: string[];
  summary: string;
  claims: string[];
  refs: { level: RefLevel; title: string; url?: string }[];
  series?: { indicator: string; from: string; to: string; mark?: "min" | "max" };
}

export interface KgEdge {
  from: string;
  type: "opposes" | "derives_from" | "tested_in" | "proponent_of";
  to: string;
  note?: string;
}

export interface Kg {
  version: string;
  nodes: KgNode[];
  edges: KgEdge[];
}

export const KG = kgData as Kg;
export const NODE_IDS: string[] = KG.nodes.map((n) => n.id);
const byId = new Map(KG.nodes.map((n) => [n.id, n]));

export function node(id: string): KgNode | undefined {
  return byId.get(id);
}

/** Nodes that oppose `id`, in either direction of an `opposes` edge. */
export function opponents(id: string): { node: KgNode; note?: string }[] {
  const out: { node: KgNode; note?: string }[] = [];
  for (const e of KG.edges) {
    if (e.type !== "opposes") continue;
    const other = e.from === id ? e.to : e.to === id ? e.from : null;
    const n = other ? byId.get(other) : undefined;
    if (n) out.push({ node: n, note: e.note });
  }
  return out;
}

/** Episodes where `id` was tested. */
export function testedIn(id: string): { node: KgNode; note?: string }[] {
  return KG.edges
    .filter((e) => e.type === "tested_in" && e.from === id)
    .map((e) => ({ node: byId.get(e.to)!, note: e.note }))
    .filter((x) => x.node);
}

/** Compact text form of the graph for the prompt (stable order, so it caches). */
export function kgPromptText(): string {
  const lines: string[] = [];
  for (const n of KG.nodes) {
    lines.push(`- ${n.id} [${n.type}] ${n.name}: ${n.summary}`);
    for (const c of n.claims) lines.push(`    · ${c}`);
  }
  lines.push("", "Relações:");
  for (const e of KG.edges) {
    lines.push(`- ${e.from} ${e.type} ${e.to}${e.note ? ` (${e.note})` : ""}`);
  }
  return lines.join("\n");
}
