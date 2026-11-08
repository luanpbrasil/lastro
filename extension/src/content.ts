import topicModel from "../../shared/topics-model.json";
import { shouldAnalyze, TopicScorer, type TopicModel } from "../../shared/topics";
import type { Card, Segment, StreamEvent } from "../../shared/schema";
import { segmentsFromJson3, transcriptHash } from "../../shared/transcript";
import { Overlay, type PillState } from "./overlay";
import { onTranscriptResponse, transcriptFromPanel } from "./panel";
import { CardTimeline } from "./timeline";

declare const __DEV__: boolean;

const MAX_CAPTION_CHARS = 60_000; // one call ≈ 60 min
const CAPTION_WAIT_MS = 20_000; // not counting ads
const NO_TRACK_MS = 5_000; // CC button disabled this long (outside ads): the video has no captions track

type Metrics = Record<string, number | string | null>;
type CaptionHit = { url: string; segments: Segment[]; lang: string; at: number };
/** A caption response that came back empty or with an error (e.g. 429 when YouTube limits the connection). */
type CaptionFail = { status: number; bytes: number };
type CaptionOutcome = { hit: CaptionHit } | { fail: CaptionFail } | { noTrack: true } | { timeout: true };

/** Caption responses seen by the page hook, by video id. Filled from document_start. */
const captionsByVideo = new Map<string, CaptionHit>();
const captionFails = new Map<string, CaptionFail>();
const captionListeners = new Set<(v: string) => void>();
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data?.__lastro_transcript) return onTranscriptResponse(Number(e.data.status), String(e.data.body ?? ""));
  if (!e.data?.__lastro_captions) return;
  let v: string | null = null;
  try {
    const u = new URL(e.data.url as string, location.href);
    v = u.searchParams.get("v");
    if (!v) return;
    const status = Number(e.data.status);
    const body = String(e.data.body ?? "");
    if (status !== 200 || !body) {
      if (!captionsByVideo.has(v)) captionFails.set(v, { status, bytes: body.length });
      for (const l of captionListeners) l(v);
      return;
    }
    const segments = segmentsFromJson3(JSON.parse(body));
    if (!segments.length) {
      if (!captionsByVideo.has(v)) captionFails.set(v, { status, bytes: body.length });
      for (const l of captionListeners) l(v);
      return;
    }
    const lang = `${u.searchParams.get("lang") ?? "?"}${u.searchParams.get("tlang") ? `→${u.searchParams.get("tlang")}` : ""}`;
    const prev = captionsByVideo.get(v);
    // keep the original-language track over a machine translation
    if (prev && !prev.lang.includes("→") && lang.includes("→")) return;
    captionsByVideo.set(v, { url: u.toString(), segments, lang, at: performance.now() });
    captionFails.delete(v);
    for (const l of captionListeners) l(v);
  } catch {
    /* not json3, or malformed: ignore */
  }
});

/** Dev build only: `localStorage.lastroForcePanel = "1"` on youtube.com skips the player's captions (tests the panel path). */
function forcePanel(): boolean {
  if (!__DEV__) return false;
  try {
    return localStorage.getItem("lastroForcePanel") === "1";
  } catch {
    return false;
  }
}

const topics = new TopicScorer(topicModel as TopicModel);
const overlay = new Overlay();
let state: PillState = "on";
let session: VideoSession | null = null;

overlay.onPauseClick = () => {
  state = state === "on" ? "paused" : "on";
  if (state === "paused") overlay.hide();
  overlay.setPill(state, session?.status ?? "");
};
overlay.onOpenList = () => session?.openList();
overlay.loadFact = async (indicator, period) => {
  const r = await chrome.runtime.sendMessage({ type: "fact", indicator, period });
  if (!r?.ok) throw new Error(r?.error ?? "fact failed");
  return r.fact;
};
overlay.loadSeries = async (indicator, from, to) => {
  const r = await chrome.runtime.sendMessage({ type: "series", indicator, from, to });
  if (!r?.ok) throw new Error(r?.error ?? "series failed");
  return r.series;
};

class VideoSession {
  readonly videoId: string;
  status = "";
  private timeline: CardTimeline;
  private alive = true;
  readonly m: Metrics = {};
  private t0 = performance.now();

  constructor(videoId: string) {
    this.videoId = videoId;
    this.m.videoId = videoId;
    overlay.hide();
    overlay.setQueued(0);
    overlay.setAction(null);
    this.timeline = new CardTimeline(
      overlay,
      {
        nowMs: () => {
          const v = video();
          return v ? v.currentTime * 1000 : null;
        },
        seekMs: (ms) => {
          const v = video();
          if (v) v.currentTime = ms / 1000;
        },
      },
      () => state === "on",
      () => this.status === "analisando…",
    );
    this.timeline.onFirstRender = () => this.mark("firstRender");
  }

  openList(): void {
    this.timeline.openList();
  }

  stop(): void {
    this.alive = false;
    this.timeline.stop();
  }

  private mark(name: string): void {
    this.m[name] = Math.round(performance.now() - this.t0);
    this.flush();
    if (__DEV__) console.debug("[lastro]", name, this.m[name], "ms");
  }

  /** Metrics on the page (dataset.lastroMetrics), on success and failure paths alike. */
  private flush(): void {
    document.documentElement.dataset.lastroMetrics = JSON.stringify(this.m);
  }

  private setStatus(s: string): void {
    this.status = s;
    overlay.setPill(state, s);
  }

  /**
   * Wait for the player's caption response (via the page hook), turning captions on if needed.
   * Ends early on an empty or error response, or when the CC button stays disabled (no track).
   */
  private waitCaptions(): Promise<CaptionOutcome> {
    const start = performance.now();
    const settle = (o: CaptionOutcome): CaptionOutcome => {
      this.m.captionWaitMs = Math.round(performance.now() - start);
      return o;
    };
    const now = (): CaptionOutcome | null => {
      const hit = captionsByVideo.get(this.videoId);
      if (hit) return { hit };
      const fail = captionFails.get(this.videoId);
      return fail ? { fail } : null;
    };
    const ready = now();
    if (ready) return Promise.resolve(settle(ready));
    return new Promise((resolve) => {
      // The CC button appears late (and belongs to the ad while one plays): keep trying.
      // The timeouts only count time outside ads.
      let waited = 0;
      let unavailable = 0;
      let finished = false;
      const done = (o: CaptionOutcome) => {
        if (finished) return;
        finished = true;
        window.clearInterval(poll);
        captionListeners.delete(listener);
        resolve(settle(o));
      };
      const listener = (v: string) => {
        if (v !== this.videoId) return;
        const o = now();
        if (o) done(o);
      };
      captionListeners.add(listener);
      const poll = window.setInterval(() => {
        if (!this.alive) return done({ timeout: true });
        const r = ensureCaptionsRequested();
        this.m.ccButton = r;
        if (r === "ad") return;
        waited += 1000;
        unavailable = r === "unavailable" ? unavailable + 1000 : 0;
        if (unavailable >= NO_TRACK_MS) done({ noTrack: true });
        else if (waited >= CAPTION_WAIT_MS) done({ timeout: true });
      }, 1000);
    });
  }

  /** Player captions first; if they fail or are empty, YouTube's transcript panel. Null: nothing usable (status set). */
  private async getTranscript(): Promise<{ segments: Segment[]; lang: string } | null> {
    let outcome: CaptionOutcome | null = null;
    if (forcePanel()) {
      this.m.captionTried = "panel (forced)";
    } else {
      this.setStatus("lendo legendas…");
      outcome = await this.waitCaptions();
      if (!this.alive) return null;
      if ("hit" in outcome) {
        this.m.captionSource = "player";
        this.m.captionStatus = 200;
        return { segments: outcome.hit.segments, lang: outcome.hit.lang };
      }
      this.m.captionTried = "player,panel";
      this.m.captionPlayer = "fail" in outcome ? `status ${outcome.fail.status}` : "noTrack" in outcome ? "no track" : "timeout";
      if ("fail" in outcome) {
        this.m.captionStatus = outcome.fail.status;
        this.m.captionBytes = outcome.fail.bytes;
      }
      this.flush();
    }

    this.setStatus("lendo transcrição…");
    const t = performance.now();
    const p = await transcriptFromPanel(this.videoId, () => this.alive);
    if (!this.alive) return null;
    this.m.panelMs = Math.round(performance.now() - t);
    this.m.panelStatus = p.status;
    if (p.segments) {
      this.m.captionSource = "panel";
      this.m.panel = p.how;
      this.flush();
      return { segments: p.segments, lang: "panel" };
    }
    this.m.captionSource = "none";
    this.m.panel = p.reason;
    this.flush();
    const noTrack = outcome !== null && "noTrack" in outcome && p.reason === "no button";
    this.setStatus(noTrack ? "este vídeo não tem legendas" : "o YouTube não enviou as legendas");
    return null;
  }

  async run(force = false): Promise<void> {
    const title = videoTitle();
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
    // Topic check before captions (title + description): decides whether to turn captions on.
    const pre = topics.classify(title, desc);
    this.m.topicsPre = pre.topics.join(",") || "none";
    this.m.economiaPre = Number(pre.scores.economia.toFixed(3));
    if (!force && !shouldAnalyze(pre)) {
      this.setStatus("fora do tema");
      overlay.setAction("Analisar este vídeo", () => {
        overlay.setAction(null);
        void this.run(true);
      });
      return;
    }

    const hit = await this.getTranscript();
    if (!this.alive || !hit) return;
    this.mark("captions");
    this.m.captionLang = hit.lang;
    let segments = hit.segments;
    let chars = 0;
    segments = segments.filter((s) => (chars += s.t.length) <= MAX_CAPTION_CHARS);
    this.m.segments = segments.length;

    const hash = await transcriptHash(segments);
    this.mark("hash");

    const port = chrome.runtime.connect({ name: "lastro" });
    port.onMessage.addListener((msg) => this.onPortMessage(msg, port, title, desc, hash, segments, force));
    port.postMessage({ type: "lookup", videoId: this.videoId, hash });
  }

  private onPortMessage(
    msg: { type: string; data?: { cards: Card[] }; ev?: StreamEvent; status?: number; body?: string; message?: string },
    port: chrome.runtime.Port,
    title: string,
    description: string,
    hash: string,
    segments: Segment[],
    force: boolean,
  ): void {
    if (!this.alive) return port.disconnect();
    switch (msg.type) {
      case "cached":
        this.mark("cacheHit");
        this.m.cached = "yes";
        for (const c of msg.data!.cards) this.addCard(c);
        this.updateDebug();
        this.setStatus(`${this.timeline.count} ideias`);
        port.disconnect();
        break;
      case "miss": {
        this.mark("cacheMiss");
        // Topic check with captions (uses them only if the model was trained with captions).
        const post = topics.classify(title, description, segments);
        this.m.topics = post.topics.join(",") || "none";
        if (!force && !shouldAnalyze(post)) {
          this.setStatus("fora do tema");
          overlay.setAction("Analisar este vídeo", () => {
            overlay.setAction(null);
            void this.run(true);
          });
          return port.disconnect();
        }
        this.setStatus("analisando…");
        port.postMessage({ type: "analyze", body: { videoId: this.videoId, title, description, hash, segments, force } });
        this.mark("analyzeSent");
        break;
      }
      case "event": {
        const ev = msg.ev!;
        if (ev.type === "card") {
          if (this.m.firstCardEvent === undefined) this.mark("firstCardEvent");
          this.addCard(ev.card);
          this.setStatus(`${this.timeline.count} ideias`);
        } else if (ev.type === "done") {
          this.mark("done");
          this.m.costUsd = ev.costUsd ?? null;
          this.m.model = ev.model ?? null;
          this.m.inputTokens = ev.usage?.input_tokens ?? null;
          this.m.outputTokens = ev.usage?.output_tokens ?? null;
          if (ev.timings) {
            this.m.serverFirstTokenMs = ev.timings.recvToFirstTokenMs;
            this.m.serverFirstCardMs = ev.timings.recvToFirstCardMs;
            this.m.serverDoneMs = ev.timings.recvToDoneMs;
          }
          document.documentElement.dataset.lastroMetrics = JSON.stringify(this.m);
          this.setStatus(`${this.timeline.count} ideias`);
          this.updateDebug();
        } else if (ev.type === "error") {
          this.setStatus(ev.message);
        }
        break;
      }
      case "http":
        this.setStatus(msg.status === 422 ? "fora do tema" : `erro ${msg.status}`);
        break;
      case "neterror":
        this.setStatus("servidor fora do ar");
        break;
    }
  }

  private addCard(c: Card): void {
    this.timeline.add(c);
    this.updateDebug();
  }

  /** Dev build only: latency and cost of this video's analysis. Never shown in the demo build. */
  private updateDebug(): void {
    if (!__DEV__) return;
    const src =
      this.m.cached === "yes"
        ? "cache · $0"
        : this.m.costUsd !== undefined
          ? `ao vivo · $${Number(this.m.costUsd).toFixed(4)}`
          : "ao vivo · …";
    overlay.setDebug(`1º cartão ${this.m.firstCardEvent ?? this.m.cacheHit ?? "-"} ms · ${src}`);
  }
}

function video(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.html5-main-video") ?? document.querySelector("video");
}

function videoTitle(): string {
  const h1 = document.querySelector("h1.ytd-watch-metadata, #title h1");
  return (h1?.textContent ?? document.title.replace(/ - YouTube$/, "")).trim();
}

/** The player only fetches captions when they are on. Turn them on once and hide them, so the view is unchanged. */
function ensureCaptionsRequested(): string | null {
  if (document.querySelector(".ad-showing")) return "ad";
  const btn = document.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
  if (!btn) return "no button";
  if (btn.getAttribute("aria-pressed") === "true") return "already on";
  if (btn.offsetParent === null || btn.getAttribute("aria-disabled") === "true") return "unavailable";
  btn.click();
  if (!document.getElementById("lastro-hide-cc")) {
    const s = document.createElement("style");
    s.id = "lastro-hide-cc";
    s.textContent = ".ytp-caption-window-container { opacity: 0 !important; }";
    document.head.append(s);
  }
  return "clicked";
}

function currentVideoId(): string | null {
  if (location.pathname !== "/watch") return null;
  return new URLSearchParams(location.search).get("v");
}

function start(): void {
  const id = currentVideoId();
  if (session?.videoId === id) return;
  session?.stop();
  session = null;
  if (!id) {
    overlay.setPill(state, "");
    return;
  }
  session = new VideoSession(id);
  overlay.setPill(state, "");
  if (state === "on") void session.run();
}

document.addEventListener("yt-navigate-finish", () => setTimeout(start, 300));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 300));
else start();
