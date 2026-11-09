import kgData from "./kg.json";

export type NodeType = "school" | "thinker" | "episode" | "institution";
export type Domain = "economia" | "politica" | "filosofia";
export type RefLevel = "intro" | "deep" | "opposing";

export interface KgNode {
  id: string;
  type: NodeType;
  /** Fields the node belongs to (first = main). */
  domain: Domain[];
  name: string;
  aliases: string[];
  summary: string;
  claims: string[];
  /** unverified: the title is from memory and the least certain; check it before shipping. */
  refs: { level: RefLevel; title: string; url?: string; unverified?: boolean }[];
  series?: { indicator: string; from: string; to: string; mark?: "min" | "max" };
}

export interface KgEdge {
  from: string;
  /**
   * grounds: `from` is a philosophical or economic basis of `to`.
   * justifies: `from` is used to argue for the institution or policy `to`.
   */
  type: "opposes" | "derives_from" | "tested_in" | "proponent_of" | "grounds" | "justifies";
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

/** Schools a thinker is a proponent of. */
export function schoolsOf(id: string): KgNode[] {
  return KG.edges
    .filter((e) => e.type === "proponent_of" && e.from === id)
    .map((e) => byId.get(e.to))
    .filter((n): n is KgNode => !!n);
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
    const aka = n.aliases.length ? ` (também: ${n.aliases.join("; ")})` : "";
    lines.push(`- ${n.id} [${n.type} · ${n.domain.join("/")}] ${n.name}${aka}: ${n.summary}`);
    for (const c of n.claims) lines.push(`    · ${c}`);
  }
  lines.push("", "Relações:");
  for (const e of KG.edges) {
    lines.push(`- ${e.from} ${e.type} ${e.to}${e.note ? ` (${e.note})` : ""}`);
  }
  return lines.join("\n");
}
