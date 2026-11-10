// Copied from extension/src/panel.ts (the first extension); only the import paths differ.
import type { Segment } from "../../../shared/schema";
import { parseClock, segmentsFromTranscriptResponse } from "../../../shared/transcript";

/**
 * Fallback when the player's captions fail: YouTube's own "Mostrar transcrição" panel, in the viewer's session.
 * We open it the way a viewer would (one click), read the page's own transcript response (passed on by hook.ts),
 * or the panel's rows if that response was missed, then close the panel.
 * YouTube serves two panel versions (checked 2026-11-08): the older one loads via /youtubei/v1/get_transcript,
 * the newer one ("PAmodern_transcript_view") via /youtubei/v1/get_panel. Both are handled.
 * The panel is hidden while we use it, so the page doesn't jump.
 */

const PANELS = ["engagement-panel-searchable-transcript", "PAmodern_transcript_view"].map(
  (id) => `ytd-engagement-panel-section-list-renderer[target-id="${id}"]`,
);
const PANEL = PANELS.join(", ");
const EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
const BUTTON = "ytd-video-description-transcript-section-renderer button";
const HIDE_ID = "lastro-hide-transcript";
const BUTTON_WAIT_MS = 6_000; // the description (and its button) can render late
const RESPONSE_WAIT_MS = 10_000;

export type PanelResult =
  | { segments: Segment[]; how: "network" | "dom"; status: number | null }
  | { segments: null; reason: "no button" | "timeout" | "empty" | "stopped"; status: number | null };

const byVideo = new Map<string, Segment[]>();
const listeners = new Set<() => void>();
let lastStatus: number | null = null;

/** Called by the content script for every __lastro_transcript message from hook.ts. */
export function onTranscriptResponse(status: number, body: string): void {
  lastStatus = status;
  try {
    if (status === 200 && body) {
      const { videoId, segments } = segmentsFromTranscriptResponse(JSON.parse(body));
      if (videoId && segments.length) byVideo.set(videoId, segments);
    }
  } catch {
    /* not JSON: ignore */
  }
  for (const l of listeners) l();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(get: () => T | null | undefined, ms: number, alive: () => boolean): Promise<T | null> {
  const end = performance.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (!alive() || performance.now() >= end) return null;
    await sleep(250);
  }
}

/** The panel's rows, if it has rendered (used only when the network response was missed). */
function segmentsFromDom(): Segment[] {
  const out: Segment[] = [];
  const rows = document.querySelectorAll(PANELS.map((p) => `${p} ytd-transcript-segment-renderer, ${p} transcript-segment-view-model`).join(", "));
  for (const row of rows) {
    const modern = row.tagName.toLowerCase() === "transcript-segment-view-model";
    const ts = row.querySelector(modern ? ".ytwTranscriptSegmentViewModelTimestamp" : ".segment-timestamp")?.textContent ?? "";
    const s = parseClock(ts);
    const t = (row.querySelector(modern ? ".ytAttributedStringHost" : ".segment-text")?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (s !== null && t) out.push({ s, d: 0, t });
  }
  for (let i = 0; i < out.length - 1; i++) out[i].d = Math.max(0, out[i + 1].s - out[i].s);
  return out;
}

function hidePanel(on: boolean): void {
  const have = document.getElementById(HIDE_ID);
  if (on && !have) {
    const s = document.createElement("style");
    s.id = HIDE_ID;
    // Invisible but still laid out: with display:none YouTube never loads the transcript (checked 2026-11-08).
    // Absolute, so the recommendations below don't move while it's open.
    s.textContent = `${PANELS.join(", ")} { opacity: 0 !important; position: absolute !important; pointer-events: none !important; z-index: -1 !important; }`;
    document.head.append(s);
  } else if (!on) have?.remove();
}

function openPanels(): Element[] {
  return [...document.querySelectorAll(PANEL)].filter((p) => p.getAttribute("visibility") === EXPANDED);
}

function closePanels(): void {
  for (const p of openPanels()) p.querySelector<HTMLButtonElement>("#visibility-button button")?.click();
}

export async function transcriptFromPanel(videoId: string, alive: () => boolean): Promise<PanelResult> {
  const have = byVideo.get(videoId);
  if (have) return { segments: have, how: "network", status: lastStatus };

  const wasOpen = openPanels().length > 0;
  if (wasOpen) {
    // the viewer opened it: read it, leave it open
    const dom = segmentsFromDom();
    if (dom.length) return { segments: dom, how: "dom", status: lastStatus };
  }

  const button = await waitFor(() => document.querySelector<HTMLButtonElement>(BUTTON), BUTTON_WAIT_MS, alive);
  if (!alive()) return { segments: null, reason: "stopped", status: lastStatus };
  if (!button) return { segments: null, reason: "no button", status: lastStatus };

  if (!wasOpen) hidePanel(true);
  let answered = false;
  const l = () => (answered = true);
  listeners.add(l);
  try {
    button.click();
    const got = await waitFor(
      () => byVideo.get(videoId) ?? (answered && lastStatus !== 200 ? [] : null) ?? (segmentsFromDom().length ? "dom" : null),
      RESPONSE_WAIT_MS,
      alive,
    );
    if (!alive()) return { segments: null, reason: "stopped", status: lastStatus };
    if (got === null) return { segments: null, reason: "timeout", status: lastStatus };
    if (got === "dom") {
      await sleep(500); // let the list finish rendering
      const dom = byVideo.get(videoId) ?? segmentsFromDom();
      return dom.length ? { segments: dom, how: byVideo.has(videoId) ? "network" : "dom", status: lastStatus } : { segments: null, reason: "empty", status: lastStatus };
    }
    return got.length ? { segments: got, how: "network", status: lastStatus } : { segments: null, reason: "empty", status: lastStatus };
  } finally {
    listeners.delete(l);
    if (!wasOpen) {
      closePanels();
      setTimeout(() => hidePanel(false), 400);
    }
  }
}
