import type { Segment } from "../../../shared/schema";
import { shouldAnalyze, TopicScorer, type TopicModel } from "../../../shared/topics";
import topicModel from "../../../shared/topics-model.json";
import type { CardsResponse, CoverageResponse, ErrorCode, LanguageResponse, SessionResponse, StoredCard } from "../../src/types";
import { plural, refusal, t } from "../../src/web/i18n";
import { nameOf, recognitionTag } from "../../src/web/languages";
import { Overlay, type PillState } from "../../src/web/overlay";
import { CardTimeline } from "../../src/web/timeline";
import { SegmentTimer, speechErrorMessage, type Clock, type SpeechError } from "../../src/web/transcriber";
import { TranscriptUploader, type ApiReply, type Transport } from "../../src/web/uploader";
import { CaptionFeeder } from "./captions";
import type { ApiResult, FromContent, ListenReply, SpeechEvent, ToContent } from "./messages";
import { mountOverlay, type Mount } from "./mount";
import { transcriptFromPanel } from "./panel";
import {
  adShowing,
  captionFails,
  captionListeners,
  captionsByVideo,
  currentVideoId,
  ensureCaptionsRequested,
  onPageMessage,
  requestOriginalTrack,
  restoreCaptions,
  video,
  videoMeta,
  type CaptionHit,
} from "./youtube";

/**
 * Lastro on YouTube, with the same overlay and cards as the site (src/web). For each video:
 * 1. The cards already saved for it (by anyone, on the site or here) show at once, popping as the playhead gets there.
 * 2. Videos about the economy or politics (title and description, as in the first extension) are analysed from their
 *    captions, which the player fetches anyway (hook.ts); any other video, when the viewer asks.
 * 3. Without captions, the viewer can ask Lastro to listen to the tab instead (the toolbar icon, background.ts).
 */

const CAPTION_WAIT_MS = 20_000; // not counting ads
const NO_TRACK_MS = 5_000; // CC button disabled this long (outside ads): the video has no captions track
const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 30_000;
const NOTE_MS = 12_000;
const LANG_WAIT_MS = 1500; // the tab's audio is waiting: don't hold it long for the language
/** A card analysed from captions pops on arrival only if its moment is this close behind the playhead. */
const FRESH_BEHIND_MS = 60_000;
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

type CaptionOutcome = { hit: CaptionHit } | { fail: true } | { noTrack: true } | { timeout: true };
type Phase = "start" | "offTopic" | "captions" | "panel" | "analysing" | "done" | "noCaptions" | "listening" | "stopped";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the extension's context ----------------------------------------------------------------

/**
 * After the extension is reloaded or updated, tabs that were already open keep this old script, cut off from the
 * extension: every chrome.runtime call throws "Extension context invalidated". Detect that and stop quietly.
 * A tab reload brings Lastro back.
 */
let orphaned = false;
function contextAlive(): boolean {
  try {
    return !orphaned && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}
const isOrphanError = (e: unknown) => /context invalidated|disconnected port/i.test(e instanceof Error ? e.message : String(e));

async function send<T>(msg: FromContent): Promise<T> {
  if (!contextAlive()) {
    shutdown();
    throw new Error("lastro: stopped");
  }
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch (e) {
    if (isOrphanError(e) || !contextAlive()) shutdown();
    throw e;
  }
}

/** The Worker, through the background service worker. status 0: unreachable. */
async function api(method: "GET" | "POST", path: string, body?: string): Promise<ApiResult> {
  try {
    return await send<ApiResult>({ type: "api", method, path, body });
  } catch {
    return { status: 0, data: null };
  }
}
const asReply = (r: ApiResult): ApiReply | null => (r.status === 0 ? null : { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.data });
const transport: Transport = {
  post: async (path, body) => asReply(await api("POST", path, body)),
  beacon: (path, body) => void send({ type: "beacon", path, body }).catch(() => {}),
};

// ---- page state --------------------------------------------------------------------------

let mount: Mount | null = null;
let overlay!: Overlay;
let pill: PillState = "on";
let session: VideoSession | null = null;
/** True when background.ts injected this script into an already-open tab (install/update): the player loaded first. */
let lateInject = false;
let topics: TopicScorer | null = null;
let shortcut: string | null = null;

function clock(): Clock {
  const v = video();
  return { ms: (v?.currentTime ?? 0) * 1000, playing: !!v && !v.paused && !v.ended && !adShowing() };
}

class VideoSession {
  private timeline: CardTimeline;
  private alive = true;
  private phase: Phase = "start";
  /** Bumped to abandon a captions search still running (the viewer asked to listen instead). */
  private run = 0;
  private cursor = 0;
  private polls = 0;
  private pollGeneration = 0;
  private pollTimer: number | null = null;
  private pending = 0;
  private feeder: CaptionFeeder | null = null;
  private captionsLang = "";
  private ccRefreshed = false;
  private retracked = false;
  /** Waiting for captions that may still come (the viewer turns them on), after none were found. */
  private lateCaptions: ((videoId: string) => void) | null = null;
  private langLookup: Promise<string | null> | null = null;
  private noteTimer: number | null = null;
  // Listening
  private segments: SegmentTimer | null = null;
  private uploader: TranscriptUploader | null = null;
  private early: Segment[] = [];

  constructor(readonly videoId: string) {
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
      () => pill === "on",
      () => this.busy(),
    );
  }

  openList(): void {
    this.timeline.openList();
  }

  private busy(): boolean {
    return this.phase === "analysing" || this.phase === "listening" || this.pending > 0;
  }

  render(): void {
    const n = this.timeline.count;
    const parts: string[] = n ? [plural(n, "pill.idea", "pill.ideas")] : [];
    const phase: Partial<Record<Phase, string>> = {
      captions: t("ext.captions"),
      panel: t("ext.panel"),
      analysing: t("ext.analysing", { pct: Math.round(100 * (this.feeder?.progress ?? 0)) }),
      listening: t("pill.listening"),
      offTopic: t("ext.offTopic"),
      noCaptions: lateInject ? t("ext.reload") : t("ext.noCaptions"),
    };
    if (phase[this.phase]) parts.push(phase[this.phase]!);
    else if (this.pending) parts.push(t("pill.analysing"));
    overlay.setPill(pill, parts.join(" · ") || t("pill.none"));
  }

  /** A note above the pill; `timed` notes go away by themselves. */
  private note(text: string | null, timed = true): void {
    if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
    this.noteTimer = null;
    overlay.setAction(text);
    if (text && timed) this.noteTimer = window.setTimeout(() => overlay.setAction(null), NOTE_MS);
  }

  stop(): void {
    this.alive = false;
    this.run++;
    this.feeder?.stop();
    if (this.phase === "listening") {
      void send({ type: "listen-stop" }).catch(() => {});
      void this.uploader?.finish();
    }
    this.pollGeneration++;
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
    if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
    this.timeline.stop();
    this.stopWaitingForCaptions();
  }

  // ---- cards: the page only learns about them from here ---------------------------------

  restartPolling(): void {
    if (!this.alive) return;
    this.pollGeneration++;
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
    void this.poll(this.pollGeneration);
  }

  private async poll(generation: number): Promise<void> {
    const r = await api("GET", `/api/videos/${this.videoId}/cards?after=${this.cursor}`);
    if (generation !== this.pollGeneration || !this.alive) return;
    if (r.status === 200 && r.data) {
      const data = r.data as CardsResponse;
      this.cursor = data.cursor;
      this.pending = data.pendingChunks;
      this.addCards(data.cards, this.polls++ > 0);
      this.render();
    }
    if (document.hidden && this.phase !== "listening") return; // resumed by visibilitychange
    this.pollTimer = window.setTimeout(() => void this.poll(generation), this.busy() ? POLL_ACTIVE_MS : POLL_IDLE_MS);
  }

  /**
   * The first answer holds what was saved before: it pops as the playhead gets there. Later ones are new. Captions
   * are analysed ahead of the playhead and then behind it: a new card from far behind goes to the list, not a pop-up.
   */
  private addCards(cards: StoredCard[], later: boolean): void {
    if (!later) return this.timeline.add(cards, false);
    const now = clock().ms;
    const listening = this.phase === "listening";
    this.timeline.add(
      cards.filter((c) => listening || c.startMs >= now - FRESH_BEHIND_MS),
      true,
    );
    this.timeline.add(
      cards.filter((c) => !listening && c.startMs < now - FRESH_BEHIND_MS),
      false,
    );
  }

  // ---- captions ----------------------------------------------------------------------

  async start(force = false): Promise<void> {
    const run = ++this.run;
    const current = () => this.alive && run === this.run;
    this.restartPolling();
    this.phase = "start";
    this.render();
    const { title, description } = await videoMeta(this.videoId);
    if (!current()) return;
    topics ??= new TopicScorer(topicModel as TopicModel);
    if (!force && !shouldAnalyze(topics.classify(title, description))) {
      this.phase = "offTopic";
      overlay.setAction(t("ext.analyse"), () => {
        overlay.setAction(null);
        void this.start(true);
      });
      this.render();
      return;
    }
    const captions = await this.captions(current);
    if (!current()) return;
    if (!captions) return this.noCaptions();
    restoreCaptions();
    this.captionsLang = captions.translated ? "" : captions.lang;
    const covered = await api("GET", `/api/videos/${this.videoId}/coverage`);
    if (!current()) return;
    this.feeder = new CaptionFeeder(this.videoId, captions.segments, covered.status === 200 ? (covered.data as CoverageResponse).ranges : [], LANG_TAG.test(captions.lang) ? captions.lang : "", {
      playhead: () => clock().ms,
      openSession: () => this.openSession("captions"),
      post: transport.post,
      onSent: () => {
        this.render();
        this.restartPolling(); // the Worker answers once the cards are saved: fetch them now
      },
      onStopped: (error) => {
        this.phase = error ? "stopped" : "done";
        if (error) this.note(refusal(error), false);
        this.render();
        this.restartPolling();
      },
    });
    this.phase = "analysing";
    this.render();
    void this.feeder.run();
  }

  /** Player captions first; if they fail or are empty, YouTube's transcript panel. Null: nothing usable. */
  private async captions(current: () => boolean): Promise<CaptionHit | null> {
    this.phase = "captions";
    this.render();
    const outcome = await this.waitCaptions(current);
    if (!current()) return null;
    if ("hit" in outcome) return outcome.hit;
    this.phase = "panel";
    this.render();
    const p = await transcriptFromPanel(this.videoId, current);
    if (!current()) return null;
    return p.segments ? { segments: p.segments, lang: "", translated: false } : null;
  }

  /**
   * Wait for the player's caption response (via the page hook), turning captions on if needed.
   * Ends early on an empty or error response, or when the CC button stays disabled (no track).
   */
  private waitCaptions(current: () => boolean): Promise<CaptionOutcome> {
    const now = (): CaptionOutcome | null => {
      const hit = captionsByVideo.get(this.videoId);
      if (hit) return { hit };
      return captionFails.has(this.videoId) ? { fail: true } : null;
    };
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
        resolve(o);
      };
      const check = () => {
        const o = now();
        if (!o) return;
        // Empty captions: on an auto-dubbed video, those of the dub. Try the original language once.
        if ("fail" in o && !this.retracked) {
          this.retracked = true;
          captionFails.delete(this.videoId);
          requestOriginalTrack(this.videoId);
          return;
        }
        done(o);
      };
      const listener = (v: string) => {
        if (v === this.videoId) check();
      };
      captionListeners.add(listener);
      check();
      const poll = window.setInterval(() => {
        if (!current()) return done({ timeout: true });
        const r = ensureCaptionsRequested(lateInject && !this.ccRefreshed);
        if (r === "refreshed") this.ccRefreshed = true;
        if (r === "ad") return;
        waited += 1000;
        unavailable = r === "unavailable" ? unavailable + 1000 : 0;
        if (unavailable >= NO_TRACK_MS) done({ noTrack: true });
        else if (waited >= CAPTION_WAIT_MS) done({ timeout: true });
      }, 1000);
    });
  }

  private async openSession(source: "captions" | "speech"): Promise<{ session: string } | { error: ErrorCode }> {
    const r = await api("POST", `/api/videos/${this.videoId}/sessions`, JSON.stringify({ source }));
    if (r.status === 201) return { session: (r.data as SessionResponse).session };
    return { error: (r.data as { error?: ErrorCode } | null)?.error ?? "unavailable" };
  }

  // ---- listening, for videos without captions -------------------------------------------

  private async noCaptions(): Promise<void> {
    restoreCaptions();
    this.phase = "noCaptions";
    this.render();
    // Captions can still come: the viewer turns them on, or picks another track. Read them then.
    this.lateCaptions = (v) => {
      if (v !== this.videoId || !captionsByVideo.has(v) || this.phase !== "noCaptions") return;
      this.stopWaitingForCaptions();
      this.note(null);
      void this.start(true);
    };
    captionListeners.add(this.lateCaptions);
    void this.listenLang(); // look it up now: when the viewer clicks the icon, the tab's audio can't wait
    shortcut ??= await send<string>({ type: "shortcut" }).catch(() => "");
    if (this.alive && this.phase === "noCaptions") this.note(t("ext.listenHint", { key: shortcut ? t("ext.listenKey", { key: shortcut }) : "" }), false);
  }

  private stopWaitingForCaptions(): void {
    if (this.lateCaptions) captionListeners.delete(this.lateCaptions);
    this.lateCaptions = null;
  }

  /** The language to recognise: detected for the video by the Worker, else the captions', else the browser's. */
  private async listenLang(): Promise<string> {
    const fallback = recognitionTag(this.captionsLang) ?? recognitionTag(navigator.language) ?? "en-US";
    this.langLookup ??= api("GET", `/api/videos/${this.videoId}/language`).then((r) => {
      const lang = (r.data as LanguageResponse | null)?.lang;
      return lang ? recognitionTag(lang) : null;
    });
    return (await Promise.race([this.langLookup, sleep(LANG_WAIT_MS).then(() => null)])) ?? fallback;
  }

  /** The toolbar icon was clicked on this tab. */
  async listenRequest(): Promise<ListenReply> {
    if (this.phase === "listening") return { listen: false };
    // Captions are being used: nothing to listen for. Show what there is instead.
    if (this.feeder) {
      this.timeline.openList();
      return { listen: false };
    }
    const lang = await this.listenLang();
    if (!this.alive) return { listen: false };
    this.beginListening(lang);
    return { listen: true, lang };
  }

  private beginListening(lang: string): void {
    this.run++; // a captions search still going is abandoned
    this.stopWaitingForCaptions();
    this.phase = "listening";
    this.segments = new SegmentTimer(clock, (s) => (this.uploader ? this.uploader.add(s) : this.early.push(s)));
    this.early = [];
    this.note(t("ext.listening", { lang: nameOf(lang) }));
    this.render();
    this.restartPolling();
    void video()?.play().catch(() => {});
    void this.openSession("speech").then((r) => {
      if (!this.alive || this.phase !== "listening") return;
      if ("error" in r) return this.blocked(r.error);
      this.uploader = new TranscriptUploader(this.videoId, r.session, lang, (code) => this.blocked(code), () => this.restartPolling(), transport);
      this.uploader.start();
      for (const s of this.early.splice(0)) this.uploader.add(s);
    });
  }

  onSpeech(event: SpeechEvent): void {
    if (this.phase !== "listening" || !this.segments) return;
    if (event.kind === "start") this.segments.start(event.id);
    else this.segments.final(event.id, event.text);
  }

  /** The Worker refused more text: stop listening and say why. */
  private blocked(code: ErrorCode): void {
    void send({ type: "listen-stop" }).catch(() => {});
    this.endListening();
    this.note(refusal(code), false);
  }

  /** Listening ended (stopped from the icon, or the audio or recognition failed). The last words are still sent. */
  endListening(error?: SpeechError | "capture"): void {
    if (error === "capture") this.note(t("capture.tab"));
    if (this.phase !== "listening") return;
    this.phase = "stopped";
    this.segments = null;
    const done = this.uploader;
    this.uploader = null;
    void done?.finish().then(() => this.restartPolling());
    this.note(error && error !== "capture" ? speechErrorMessage(error) : t("ext.listenStopped"));
    this.render();
  }

  beacon(): void {
    this.uploader?.beacon();
  }
}

// ---- the tab -----------------------------------------------------------------------------

function startVideo(): void {
  if (!contextAlive()) return shutdown();
  const id = currentVideoId();
  if (session?.videoId === id) return;
  session?.stop();
  session = null;
  overlay.hide();
  overlay.setAction(null);
  mount?.show(!!id);
  if (!id) return;
  session = new VideoSession(id);
  session.render();
  if (pill === "on") void session.start();
}

function onRuntimeMessage(msg: ToContent, _sender: chrome.runtime.MessageSender, reply: (r: ListenReply) => void): boolean {
  if (!contextAlive()) return false;
  if (msg.type === "listen-request") {
    if (!session) {
      reply({ listen: false });
      return false;
    }
    void session.listenRequest().then(reply);
    return true; // replies later
  }
  if (msg.type === "speech") session?.onSpeech(msg.event);
  else if (msg.type === "listen-stopped") session?.endListening(msg.error);
  return false;
}

const onNavigate = () => {
  if (!contextAlive()) return shutdown();
  setTimeout(startVideo, 300);
};
const onVisible = () => {
  if (!document.hidden) session?.restartPolling();
};
const onPageHide = () => session?.beacon();
/** Another (newer) copy of this script took over this tab: stop this one. */
const onTakeover = () => shutdown();
const TAKEOVER = "lastro-live:takeover";

function shutdown(): void {
  if (orphaned) return;
  orphaned = true;
  session?.stop();
  session = null;
  window.removeEventListener("message", onPageMessage);
  document.removeEventListener("yt-navigate-finish", onNavigate);
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener(TAKEOVER, onTakeover);
  try {
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
  } catch {
    /* cut off from the extension */
  }
  mount?.remove();
  mount = null;
}

function makeOverlay(root: HTMLElement): Overlay {
  const o = new Overlay(root);
  o.onOpenList = () => session?.openList();
  o.onPauseClick = () => {
    pill = pill === "on" ? "paused" : "on";
    if (pill === "paused" && !o.isListOpen()) o.hide();
    session?.render();
  };
  return o;
}

/**
 * Start Lastro in this tab, once. The script also arrives late, from background.ts, into tabs that were open on
 * install/update: skip if a live copy already runs here, and replace any copy cut off by an extension reload.
 */
function boot(): void {
  const g = globalThis as unknown as { __lastroLive?: () => boolean };
  try {
    if (g.__lastroLive?.()) return; // a live copy already runs in this world
  } catch {
    /* an old copy's check threw: treat it as dead */
  }
  g.__lastroLive = contextAlive;
  lateInject = document.readyState !== "loading"; // the manifest injects at document_start
  document.dispatchEvent(new CustomEvent(TAKEOVER)); // a live older copy in another world stops
  document.addEventListener(TAKEOVER, onTakeover);
  window.addEventListener("message", onPageMessage);
  document.addEventListener("yt-navigate-finish", onNavigate);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", onPageHide);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  // A new page: whatever this tab was listening to before belongs to a page that's gone.
  void send({ type: "listen-stop" }).catch(() => {});
  const ready = () => {
    mount = mountOverlay();
    overlay = makeOverlay(mount.root);
    setTimeout(startVideo, 300);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
}

boot();
