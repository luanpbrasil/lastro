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

/** The part of YouTube's /youtubei/v1/get_transcript response we read (the "Mostrar transcrição" panel). */
interface TranscriptSegmentRenderer {
  startMs?: string;
  endMs?: string;
  snippet?: { runs?: { text?: string }[]; simpleText?: string };
  targetId?: string;
}

/** The newer panel ("PAmodern_transcript_view", /youtubei/v1/get_panel): one row per macro marker, whole seconds only. */
interface MacroMarkerItem {
  item?: { timelineItemViewModel?: { timestamp?: string; contentItems?: { transcriptSegmentViewModel?: { simpleText?: string } }[] } };
  onTap?: { innertubeCommand?: { watchEndpoint?: { videoId?: string; startTimeSeconds?: number } } };
}

/**
 * Transcript-panel response → segments, plus the video id. Reads both panel versions YouTube serves:
 * /youtubei/v1/get_transcript (transcriptSegmentRenderer, ms; targetIds start with "<videoId>.") and
 * /youtubei/v1/get_panel (macroMarkersPanelItemViewModel, whole seconds; videoId in the row's watchEndpoint).
 * Walks the response instead of a fixed path, so small layout changes don't break it.
 */
export function segmentsFromTranscriptResponse(j: unknown): { videoId: string | null; segments: Segment[] } {
  const old: TranscriptSegmentRenderer[] = [];
  const modern: MacroMarkerItem[] = [];
  const walk = (o: unknown, depth: number): void => {
    if (!o || typeof o !== "object" || depth > 40) return;
    const r = (o as { transcriptSegmentRenderer?: TranscriptSegmentRenderer }).transcriptSegmentRenderer;
    if (r) return void old.push(r);
    const m = (o as { macroMarkersPanelItemViewModel?: MacroMarkerItem }).macroMarkersPanelItemViewModel;
    if (m?.item?.timelineItemViewModel?.contentItems?.some((c) => c.transcriptSegmentViewModel)) return void modern.push(m);
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(j, 0);
  let videoId: string | null = null;
  const segments: Segment[] = [];
  const clean = (t: string) => t.replace(/\s+/g, " ").trim();
  for (const r of old) {
    const t = clean(r.snippet?.runs?.map((x) => x.text ?? "").join("") ?? r.snippet?.simpleText ?? "");
    const s = Number(r.startMs);
    if (!t || !Number.isFinite(s)) continue;
    const e = Number(r.endMs);
    segments.push({ s, d: Number.isFinite(e) && e > s ? e - s : 0, t });
    videoId ??= r.targetId?.split(".")[0] || null;
  }
  const start = segments.length;
  for (const m of modern) {
    const tl = m.item!.timelineItemViewModel!;
    const t = clean(tl.contentItems!.map((c) => c.transcriptSegmentViewModel?.simpleText ?? "").join(" "));
    const we = m.onTap?.innertubeCommand?.watchEndpoint;
    const s = typeof we?.startTimeSeconds === "number" ? we.startTimeSeconds * 1000 : parseClock(tl.timestamp ?? "");
    if (!t || s === null) continue;
    segments.push({ s, d: 0, t });
    videoId ??= we?.videoId || null;
  }
  // modern rows carry no duration: each runs until the next one starts
  for (let i = start; i < segments.length - 1; i++) segments[i].d = Math.max(0, segments[i + 1].s - segments[i].s);
  return { videoId, segments };
}

/** Panel DOM timestamp ("1:02:03", "4:05") → ms. */
export function parseClock(s: string): number | null {
  const p = s.trim().split(":").map(Number);
  if (!p.length || p.some((n) => !Number.isFinite(n))) return null;
  return p.reduce((a, n) => a * 60 + n, 0) * 1000;
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
