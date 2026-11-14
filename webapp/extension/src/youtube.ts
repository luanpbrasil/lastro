import { cleanTracks, type PlayerTracks } from "../../src/language-detect";
import type { Segment } from "../../../shared/schema";
import { segmentsFromJson3 } from "../../../shared/transcript";
import { onTranscriptResponse } from "./panel";

/**
 * What the content script reads from YouTube's page, as the first extension did (extension/src/content.ts):
 * the player's caption responses and video details, passed on by hook.ts, and the player's controls.
 */

/** `lang`: the language of the text ("pt", "en"…); for a machine translation, the language it was translated into. */
export type CaptionHit = { segments: Segment[]; lang: string; translated: boolean };
/** A caption response that came back empty or with an error (e.g. 429 when YouTube limits the connection). */
export type CaptionFail = { status: number; bytes: number };

/** Caption responses seen by the page hook, by video id. Filled from document_start. */
export const captionsByVideo = new Map<string, CaptionHit>();
export const captionFails = new Map<string, CaptionFail>();
export const captionListeners = new Set<(videoId: string) => void>();

export function onPageMessage(e: MessageEvent): void {
  if (e.source !== window) return;
  if (e.data?.__lastro_transcript) return onTranscriptResponse(Number(e.data.status), String(e.data.body ?? ""));
  if (e.data?.__lastro_meta) return onMetaMessage(e);
  if (!e.data?.__lastro_captions) return;
  try {
    const u = new URL(e.data.url as string, location.href);
    const v = u.searchParams.get("v");
    if (!v) return;
    const status = Number(e.data.status);
    const body = String(e.data.body ?? "");
    const segments = status === 200 && body ? segmentsFromJson3(JSON.parse(body)) : [];
    if (!segments.length) {
      if (!captionsByVideo.has(v)) captionFails.set(v, { status, bytes: body.length });
    } else {
      const tlang = u.searchParams.get("tlang");
      const prev = captionsByVideo.get(v);
      // Keep the original-language track over a machine translation.
      if (prev && !prev.translated && tlang) return;
      captionsByVideo.set(v, { segments, lang: tlang ?? u.searchParams.get("lang") ?? "", translated: !!tlang });
      captionFails.delete(v);
    }
    for (const l of captionListeners) l(v);
  } catch {
    /* not json3, or malformed: ignore */
  }
}

/** Title, full description and audio/caption tracks from the page's player data, via hook.ts; null if no matching data in time. */
type PlayerMeta = { title: string; description: string; tracks: PlayerTracks | null };
const META_REPLY_MS = 4_000; // the hook waits up to 3 s for a matching response
const metaWaiters = new Map<string, (m: PlayerMeta | null) => void>();
function onMetaMessage(e: MessageEvent): void {
  const done = metaWaiters.get(String(e.data.videoId));
  if (!done) return;
  metaWaiters.delete(String(e.data.videoId));
  done(e.data.found ? { title: String(e.data.title ?? ""), description: String(e.data.description ?? ""), tracks: cleanTracks(e.data.tracks) } : null);
}

export async function videoMeta(videoId: string): Promise<PlayerMeta> {
  const meta = await new Promise<PlayerMeta | null>((resolve) => {
    const t = window.setTimeout(() => {
      metaWaiters.delete(videoId);
      resolve(null);
    }, META_REPLY_MS);
    metaWaiters.set(videoId, (m) => {
      window.clearTimeout(t);
      resolve(m);
    });
    window.postMessage({ __lastro_meta_req: true, videoId }, location.origin);
  });
  if (meta?.title) return meta;
  // <meta name=description> is cut at ~160 chars and can be stale after in-app navigation.
  const h1 = document.querySelector("h1.ytd-watch-metadata, #title h1");
  return {
    title: (h1?.textContent ?? document.title.replace(/ - YouTube$/, "")).trim(),
    description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "",
    tracks: null,
  };
}

export function video(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.html5-main-video") ?? document.querySelector("video");
}

export const adShowing = () => !!document.querySelector(".ad-showing");

export function currentVideoId(): string | null {
  if (location.pathname !== "/watch") return null;
  const v = new URLSearchParams(location.search).get("v");
  return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
}

/** Ask the page (hook.ts) to switch the captions to another language: for auto-dubbed videos, the original one. */
let retracked = false;
export function requestOriginalTrack(videoId: string): void {
  retracked = true;
  window.postMessage({ __lastro_track_req: true, videoId }, location.origin);
}

const HIDE_CC = "lastro-hide-cc";
/** True while the captions are on because Lastro turned them on (and hid them), not the viewer. */
let ccOurs = false;

/**
 * The player only fetches captions when they are on. Turn them on and hide them, so the view is unchanged; once
 * they have arrived, restoreCaptions() turns them off again. refresh: captions are already on but their response came
 * before this script (late injection): turn them off and on again once, so the player asks again and the hook sees it.
 */
export function ensureCaptionsRequested(refresh = false): "ad" | "no button" | "already on" | "refreshed" | "unavailable" | "clicked" {
  if (adShowing()) return "ad";
  const btn = document.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
  if (!btn) return "no button";
  if (btn.getAttribute("aria-pressed") === "true") {
    if (!refresh) return "already on";
    btn.click();
    window.setTimeout(() => btn.getAttribute("aria-pressed") !== "true" && btn.click(), 300);
    return "refreshed";
  }
  if (btn.offsetParent === null || btn.getAttribute("aria-disabled") === "true") return "unavailable";
  if (!document.getElementById(HIDE_CC)) {
    const s = document.createElement("style");
    s.id = HIDE_CC;
    s.textContent = ".ytp-caption-window-container { opacity: 0 !important; }";
    (document.head ?? document.documentElement).append(s);
  }
  btn.click();
  ccOurs = true;
  return "clicked";
}

/** Captions read: if Lastro turned them on, turn them off and show captions again (for when the viewer wants them). */
export function restoreCaptions(): void {
  if (retracked) {
    window.postMessage({ __lastro_track_req: true, restore: true }, location.origin);
    retracked = false;
  }
  if (ccOurs) {
    const btn = document.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
    if (btn?.getAttribute("aria-pressed") === "true") btn.click();
    ccOurs = false;
  }
  window.setTimeout(() => document.getElementById(HIDE_CC)?.remove(), 300);
}
