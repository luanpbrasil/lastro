import type { SpeechError } from "../../src/web/transcriber";

/**
 * Messages between the extension's three parts:
 * - the content script, in each YouTube tab: the overlay, captions and the video's clock;
 * - the background service worker: talks to the Worker, and starts listening when the toolbar icon is clicked;
 * - the offscreen document: holds the tab's audio and runs speech recognition on it.
 */

/** Content → background: a request to the Worker, made from the extension's origin. */
export interface ApiRequest {
  type: "api";
  method: "GET" | "POST";
  /** "/api/videos/…" or the post-specific "/api/posts/…" routes. */
  path: string;
  body?: string;
}
/** status 0: the Worker couldn't be reached. */
export interface ApiResult {
  status: number;
  data: unknown;
}

/** Content → background. */
export type FromContent =
  | ApiRequest
  /** Fire and forget: the page is going away. */
  | { type: "beacon"; path: string; body: string }
  /** Stop listening to this tab: another video, or the page started again. */
  | { type: "listen-stop" }
  /** The keyboard shortcut for listening, to mention it: replies a string ("" if none). */
  | { type: "shortcut" };

/** A recognised phrase, from the offscreen document; the content script times it on the video's clock. */
export type SpeechEvent = { kind: "start"; id: number } | { kind: "final"; id: number; text: string };

/** Background → content. */
export type ToContent =
  /** The toolbar icon was clicked on this tab: reply a ListenReply. */
  | { type: "listen-request" }
  | { type: "speech"; event: SpeechEvent }
  /** Listening ended: stopped by the viewer (no error), or the tab's audio or recognition failed. */
  | { type: "listen-stopped"; error?: SpeechError | "capture" };
/** listen: false when this tab has nothing to listen to (not a video, or its captions are being used). */
export type ListenReply = { listen: true; lang: string } | { listen: false };

/** Background → offscreen. */
export type ToOffscreen = { target: "offscreen"; type: "start"; streamId: string; lang: string; tabId: number } | { target: "offscreen"; type: "stop" };

/** Offscreen → background, about the tab being listened to. */
export type FromOffscreen =
  | { target: "background"; tabId: number; type: "speech"; event: SpeechEvent }
  /** Listening ended (asked to stop, the tab's audio ended, or recognition failed), after the last words were sent. */
  | { target: "background"; tabId: number; type: "ended"; error?: SpeechError | "capture" };
