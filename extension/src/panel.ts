import type { Segment } from "../../shared/schema";
import { parseClock, segmentsFromGetTranscript } from "../../shared/transcript";

/**
 * Fallback when the player's captions fail: YouTube's own "Mostrar transcrição" panel, in the viewer's session.
 * We open it the way a viewer would (one click), read the page's own /youtubei/v1/get_transcript response
 * (passed on by hook.ts), or the panel's text if that response was missed, then close the panel.
 * The panel is hidden while we use it, so the page doesn't jump.
 */

const PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
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
      const { videoId, segments } = segmentsFromGetTranscript(JSON.parse(body));
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
  for (const row of document.querySelectorAll(`${PANEL} ytd-transcript-segment-renderer`)) {
    const s = parseClock(row.querySelector(".segment-timestamp")?.textContent ?? "");
    const t = (row.querySelector(".segment-text")?.textContent ?? "").replace(/\s+/g, " ").trim();
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
    s.textContent = `${PANEL} { opacity: 0 !important; position: absolute !important; pointer-events: none !important; z-index: -1 !important; }`;
    document.head.append(s);
  } else if (!on) have?.remove();
}

function closePanel(): void {
  const p = document.querySelector(PANEL);
  const btn = p?.querySelector<HTMLButtonElement>('#visibility-button button, button[aria-label="Fechar transcrição"], button[aria-label="Close transcript"]');
  btn?.click();
}

export async function transcriptFromPanel(videoId: string, alive: () => boolean): Promise<PanelResult> {
  const have = byVideo.get(videoId);
  if (have) return { segments: have, how: "network", status: lastStatus };

  const panel = document.querySelector(PANEL);
  const wasOpen = panel?.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
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
      closePanel();
      setTimeout(() => hidePanel(false), 400);
    }
  }
}
