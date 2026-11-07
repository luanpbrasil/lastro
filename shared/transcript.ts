import type { Segment } from "./schema";

/** YouTube json3 caption format (only the fields we use). */
interface Json3 {
  events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
}

/** json3 → segments: drop empty and newline-only events, collapse whitespace. */
export function segmentsFromJson3(j: Json3): Segment[] {
  const out: Segment[] = [];
  for (const e of j.events ?? []) {
    if (!e.segs) continue;
    const t = e.segs.map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (!t) continue;
    out.push({ s: e.tStartMs ?? 0, d: e.dDurationMs ?? 0, t });
  }
  return out;
}

/** Canonical text used for the cache-key hash: same captions → same hash for every viewer. */
export function canonicalText(segs: Segment[]): string {
  return segs.map((s) => `${s.s}\t${s.t.normalize("NFC")}`).join("\n");
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function transcriptHash(segs: Segment[]): Promise<string> {
  return sha256Hex(canonicalText(segs));
}

/** Loose normalisation for checking that a quote appears in the transcript. */
export function looseNorm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
