import { gateA, gateB } from "../../shared/lexicon";
import type { Card, Segment, StreamEvent } from "../../shared/schema";
import { segmentsFromJson3, transcriptHash } from "../../shared/transcript";
import { Overlay, type PillState } from "./overlay";

declare const __DEV__: boolean;

const MIN_GAP_MS = 40_000; // ≥ 40 s between pop-ups
const QUIET_START_MS = 10_000; // no pop-up in the first 10 s
const MAX_CAPTION_CHARS = 60_000; // one call ≈ 60 min
const CAPTION_WAIT_MS = 20_000; // not counting ads

type Metrics = Record<string, number | string | null>;
type CaptionHit = { url: string; segments: Segment[]; lang: string; at: number };

/** Caption responses seen by the page hook, by video id. Filled from document_start. */
const captionsByVideo = new Map<string, CaptionHit>();
const captionListeners = new Set<(v: string) => void>();
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data?.__lastro_captions) return;
  try {
    const u = new URL(e.data.url as string, location.href);
    const v = u.searchParams.get("v");
    if (!v) return;
    const segments = segmentsFromJson3(JSON.parse(e.data.body as string));
    if (!segments.length) return;
    const lang = `${u.searchParams.get("lang") ?? "?"}${u.searchParams.get("tlang") ? `→${u.searchParams.get("tlang")}` : ""}`;
    const prev = captionsByVideo.get(v);
    // keep the original-language track over a machine translation
    if (prev && !prev.lang.includes("→") && lang.includes("→")) return;
    captionsByVideo.set(v, { url: u.toString(), segments, lang, at: performance.now() });
    for (const l of captionListeners) l(v);
  } catch {
    /* not json3, or malformed: ignore */
  }
});

const overlay = new Overlay();
let state: PillState = "on";
let session: VideoSession | null = null;

overlay.onPillClick = () => {
  state = state === "on" ? "paused" : "on";
  if (state === "paused") overlay.hideCard();
  overlay.setPill(state, session?.status ?? "");
};

class VideoSession {
  readonly videoId: string;
  status = "";
  private cards: Card[] = [];
  private handled = new Set<Card>();
  private shownNodes = new Map<string, number>(); // node id → mentions
  private queue: Card[] = [];
  private lastPopAt = -Infinity;
  private timer: number | undefined;
  private alive = true;
  readonly m: Metrics = {};
  private t0 = performance.now();

  constructor(videoId: string) {
    this.videoId = videoId;
    this.m.videoId = videoId;
    overlay.hideCard();
    overlay.setQueued(0);
    overlay.setAction(null);
    overlay.onSeek = (ms) => {
      const v = video();
      if (v) v.currentTime = ms / 1000;
    };
    overlay.onChipClick = () => this.popNext(true);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  stop(): void {
    this.alive = false;
    window.clearInterval(this.timer);
  }

  private mark(name: string): void {
    this.m[name] = Math.round(performance.now() - this.t0);
    document.documentElement.dataset.lastroMetrics = JSON.stringify(this.m);
    if (__DEV__) console.debug("[lastro]", name, this.m[name], "ms");
  }

  private setStatus(s: string): void {
    this.status = s;
    overlay.setPill(state, s);
  }

  /** Wait for the player's caption response (via the page hook), turning captions on if needed. */
  private waitCaptions(): Promise<CaptionHit | null> {
    const have = captionsByVideo.get(this.videoId);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      // The CC button appears late (and belongs to the ad while one plays): keep trying.
      // The timeout only counts time outside ads.
      let waited = 0;
      let finished = false;
      const done = (h: CaptionHit | null) => {
        if (finished) return;
        finished = true;
        window.clearInterval(poll);
        captionListeners.delete(listener);
        resolve(h);
      };
      const listener = (v: string) => {
        if (v === this.videoId) done(captionsByVideo.get(v) ?? null);
      };
      captionListeners.add(listener);
      const poll = window.setInterval(() => {
        if (!this.alive) return done(null);
        const r = ensureCaptionsRequested();
        this.m.ccButton = r;
        if (r !== "ad") waited += 1000;
        if (waited >= CAPTION_WAIT_MS) done(null);
      }, 1000);
    });
  }

  async run(force = false): Promise<void> {
    const title = videoTitle();
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
    if (!force && !gateA(`${title} ${desc}`)) {
      this.setStatus("fora do tema");
      overlay.setAction("Analisar este vídeo", () => {
        overlay.setAction(null);
        void this.run(true);
      });
      return;
    }

    this.setStatus("lendo legendas…");
    const hit = await this.waitCaptions();
    if (!this.alive) return;
    if (!hit) {
      this.setStatus("sem legendas");
      return;
    }
    this.mark("captions");
    this.m.captionLang = hit.lang;
    let segments = hit.segments;
    let chars = 0;
    segments = segments.filter((s) => (chars += s.t.length) <= MAX_CAPTION_CHARS);
    this.m.segments = segments.length;

    const hash = await transcriptHash(segments);
    this.mark("hash");

    const port = chrome.runtime.connect({ name: "lastro" });
    port.onMessage.addListener((msg) => this.onPortMessage(msg, port, title, hash, segments, force));
    port.postMessage({ type: "lookup", videoId: this.videoId, hash });
  }

  private onPortMessage(
    msg: { type: string; data?: { cards: Card[] }; ev?: StreamEvent; status?: number; body?: string; message?: string },
    port: chrome.runtime.Port,
    title: string,
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
        this.setStatus(`${this.cards.length} ideias`);
        port.disconnect();
        break;
      case "miss": {
        this.mark("cacheMiss");
        const last = segments[segments.length - 1];
        const g = gateB(`${title} ${segments.map((s) => s.t).join(" ")}`, last.s + last.d);
        if (!force && !g.pass) {
          this.setStatus("fora do tema");
          overlay.setAction("Analisar este vídeo", () => {
            overlay.setAction(null);
            void this.run(true);
          });
          return port.disconnect();
        }
        this.setStatus("analisando…");
        port.postMessage({ type: "analyze", body: { videoId: this.videoId, title, hash, segments } });
        this.mark("analyzeSent");
        break;
      }
      case "event": {
        const ev = msg.ev!;
        if (ev.type === "card") {
          if (this.m.firstCardEvent === undefined) this.mark("firstCardEvent");
          this.addCard(ev.card);
          this.setStatus(`${this.cards.length} ideias`);
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
          this.setStatus(`${this.cards.length} ideias`);
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
    this.cards.push(c);
    this.cards.sort((a, b) => a.startMs - b.startMs);
    if (__DEV__) {
      overlay.setDebug(
        `1º cartão ${this.m.firstCardEvent ?? this.m.cacheHit ?? "-"} ms · ${this.m.costUsd !== undefined ? `$${Number(this.m.costUsd).toFixed(4)}` : "…"}`,
      );
    }
  }

  private primaryNode(c: Card): string {
    return (c.nodes[0]?.id ?? c.indicator ?? c.quote).toString();
  }

  /** Pop due cards: one card per new idea, ≥ 40 s apart, none in the first 10 s. */
  private tick(): void {
    const v = video();
    if (!v || state !== "on") return;
    const nowMs = v.currentTime * 1000;
    for (const c of this.cards) {
      if (this.handled.has(c) || c.startMs > nowMs + 500) continue;
      this.handled.add(c);
      const key = this.primaryNode(c);
      if (this.shownNodes.has(key)) {
        this.shownNodes.set(key, this.shownNodes.get(key)! + 1);
        continue;
      }
      this.queue.push(c);
    }
    if (nowMs >= QUIET_START_MS && performance.now() - this.lastPopAt >= MIN_GAP_MS) this.popNext(false);
    overlay.setQueued(this.queue.length);
  }

  private popNext(manual: boolean): void {
    const c = this.queue.shift();
    if (!c) return;
    this.shownNodes.set(this.primaryNode(c), 1);
    this.lastPopAt = performance.now();
    overlay.showCard(c);
    if (this.m.firstRender === undefined) this.mark("firstRender");
    if (manual) overlay.setQueued(this.queue.length);
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
