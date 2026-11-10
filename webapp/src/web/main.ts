import type { CardsResponse, ErrorCode, LanguageResponse, SessionResponse } from "../types";
import { History } from "./history";
import { plural, refusal, t, translatePage } from "./i18n";
import { LANGUAGES, nameOf, recognitionTag } from "./languages";
import { Overlay, type PillState } from "./overlay";
import { CardTimeline } from "./timeline";
import { CaptureError, isSupported, TabTranscriber } from "./transcriber";
import { TranscriptUploader } from "./uploader";
import { parseVideoId, Player } from "./youtube";

// Worker requests and D1 reads count against the free plan: poll fast only while something is being analysed,
// and not at all from a background tab that isn't listening.
const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 30_000;
translatePage();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const input = $<HTMLInputElement>("url");
const formError = $("form-error");
const watch = $("watch");
const listenBtn = $<HTMLButtonElement>("listen");
const listenLabel = $("listen-label");
const langSelect = $<HTMLSelectElement>("lang");
// The language spoken in the video, for Chrome's recognition, which can't detect it itself.
// Each video's language is detected when it opens (YouTube's original audio or automatic captions); the viewer
// can override it. Without a detection: the last language the viewer chose, then the browser's.
const LANG_KEY = "lastro-lang";
let detectedLang: string | null = null;
let langNote = "";
function fillLanguages(): void {
  langSelect.replaceChildren(
    ...LANGUAGES.map((l) => {
      const o = document.createElement("option");
      o.value = l.tag;
      o.textContent = l.tag === detectedLang ? `${l.name} · ${t("lang.detected")}` : l.name;
      return o;
    }),
  );
}
function fallbackLang(): string {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && recognitionTag(saved)) return recognitionTag(saved)!;
  } catch {
    /* storage blocked */
  }
  return recognitionTag(navigator.language) ?? "en-US";
}
fillLanguages();
langSelect.value = fallbackLang();
langSelect.onchange = () => {
  langNote = langSelect.value === detectedLang ? langNote : "";
  try {
    localStorage.setItem(LANG_KEY, langSelect.value);
  } catch {
    /* storage blocked */
  }
  render();
};

let langRequest = 0;
async function detectLanguage(id: string): Promise<void> {
  const mine = ++langRequest;
  detectedLang = null;
  langNote = "";
  fillLanguages();
  langSelect.value = fallbackLang();
  render();
  try {
    const r = await fetch(`/api/videos/${id}/language`);
    if (!r.ok || mine !== langRequest) return;
    const data = (await r.json()) as LanguageResponse;
    const tag = data.lang ? recognitionTag(data.lang) : null;
    if (!tag || mine !== langRequest || listening) return;
    detectedLang = tag;
    fillLanguages();
    langSelect.value = tag;
    langNote = t("status.detected", { lang: nameOf(tag), from: data.source ? t(`source.${data.source}`) : "" }).replace(" .", ".");
    render();
  } catch {
    /* offline: keep the fallback */
  }
}
const statusEl = $("status");
const interimEl = $("interim");
const hint = $("hint");
const supported = isSupported();

const player = new Player();
const overlay = new Overlay($("overlay"));
let pillState: PillState = "on";
let timeline: CardTimeline | null = null;
overlay.onOpenList = () => timeline?.openList();
overlay.onPauseClick = () => {
  pillState = pillState === "on" ? "paused" : "on";
  if (pillState === "paused" && !overlay.isListOpen()) overlay.hide();
  render();
};
const history = new History($("history"), $("history-empty"), (id) => {
  input.value = `https://www.youtube.com/watch?v=${id}`;
  formError.hidden = true;
  void openVideo(id);
  window.scrollTo({ top: 0, behavior: "smooth" }); // the video sits at the top of the page
});

let videoId = "";
let cursor = 0;
let polls = 0;
let pollGeneration = 0;
let pollTimer: number | null = null;
let pendingChunks = 0;
let failedChunks = 0;
let sentSegments = 0;
let heard = 0;
/** No speech recognised long after listening started: probably the wrong language. */
let quiet = false;
let quietTimer: number | null = null;
const QUIET_MS = 45_000;
let notice = "";

let listening = false;
let uploader: TranscriptUploader | null = null;
const transcriber = new TabTranscriber({
  clock: () => player.clock(),
  // Sent as Chrome heard it: Claude reads through the recognition errors.
  onSegment: (s) => {
    heard++;
    uploader?.add(s);
    render();
  },
  onInterim: (text) => (interimEl.textContent = text),
  onStopped: (message) => void endListening(message),
});

function render(): void {
  listenLabel.textContent = listening ? t("listen.stop") : t("listen.start");
  listenBtn.classList.toggle("listening", listening);
  langSelect.disabled = listening;
  const parts: string[] = [];
  if (notice) parts.push(notice);
  else if (!listening && supported) parts.push(`${langNote ? `${langNote} ` : ""}${t("status.share")}`);
  else if (listening && !heard && quiet) parts.push(t("status.quiet", { lang: nameOf(langSelect.value) }));
  else if (listening) parts.push(heard ? t("status.heard", { heard, sent: sentSegments }) : t("status.listening"));
  if (pendingChunks) parts.push(t("status.analysing"));
  if (failedChunks) parts.push(t("status.failed"));
  if (listening && !pendingChunks && !notice && heard) parts.push(t("status.delay"));
  statusEl.textContent = parts.join(" · ");
  const n = timeline?.count ?? 0;
  const pill = [n ? plural(n, "pill.idea", "pill.ideas") : listening ? t("pill.listening") : t("pill.none")];
  if (pendingChunks) pill.push(t("pill.analysing"));
  overlay.setPill(pillState, pill.join(" · "));
}

// ---- polling: the page only ever learns about cards from here ------------------------

async function poll(generation: number): Promise<void> {
  try {
    const r = await fetch(`/api/videos/${videoId}/cards?after=${cursor}`);
    if (generation !== pollGeneration) return;
    if (r.ok) {
      const data = (await r.json()) as CardsResponse;
      if (generation !== pollGeneration) return;
      cursor = data.cursor;
      pendingChunks = data.pendingChunks;
      failedChunks = data.failedChunks;
      // The first answer holds what was saved before: it pops as the playhead gets there. Later ones are new.
      timeline?.add(data.cards, polls++ > 0);
      if (data.cards.length) void history.load(); // new ideas: counts and order in the history changed
      render();
    }
  } catch {
    /* offline: the next poll tries again */
  }
  if (generation !== pollGeneration) return;
  if (document.hidden && !listening) return; // resumed by visibilitychange
  pollTimer = window.setTimeout(() => void poll(generation), listening || pendingChunks ? POLL_ACTIVE_MS : POLL_IDLE_MS);
}

function restartPolling(): void {
  if (!videoId) return;
  pollGeneration++;
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  void poll(pollGeneration);
}

// ---- listening ------------------------------------------------------------------------

/** A token that lets this page send transcript for this video. Null with `notice` set when refused. */
async function openSession(): Promise<string | null> {
  try {
    const r = await fetch(`/api/videos/${videoId}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = (await r.json()) as SessionResponse & { error: ErrorCode };
    if (r.ok) return data.session;
    notice = refusal(data.error);
  } catch {
    notice = t("refusal.unavailable");
  }
  return null;
}

async function startListening(): Promise<void> {
  listenBtn.disabled = true;
  transcriber.lang = langSelect.value;
  notice = "";
  const session = await openSession();
  if (session) {
    try {
      await transcriber.start();
      listening = true;
      sentSegments = 0;
      heard = 0;
      quiet = false;
      if (quietTimer !== null) window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => {
        quiet = true;
        render();
      }, QUIET_MS);
      uploader = new TranscriptUploader(
        videoId,
        session,
        langSelect.value,
        (code) => void endListening(refusal(code)),
        (n) => {
          sentSegments += n;
          restartPolling(); // the Worker answers once the cards are saved: fetch them now
        },
      );
      uploader.start();
      player.play();
    } catch (err) {
      notice = err instanceof CaptureError ? err.message : t("capture.tab");
    }
  }
  listenBtn.disabled = false;
  render();
  if (listening) restartPolling();
}

/** Called when the user stops, sharing ends or the Worker refuses more text. */
async function endListening(message?: string): Promise<void> {
  if (!listening) return;
  listening = false;
  listenBtn.disabled = true;
  await transcriber.stop();
  interimEl.textContent = "";
  notice = message ?? "";
  // The last upload can take a while. The viewer doesn't have to wait for it, and polling picks up its cards.
  const done = uploader;
  uploader = null;
  void done?.finish();
  listenBtn.disabled = false;
  render();
  restartPolling();
}

// ---- choosing a video -----------------------------------------------------------------

async function openVideo(id: string): Promise<void> {
  await endListening();
  videoId = id;
  cursor = 0;
  polls = 0;
  pendingChunks = 0;
  failedChunks = 0;
  notice = "";
  timeline?.stop();
  overlay.hide();
  overlay.setQueued(0);
  timeline = new CardTimeline(
    overlay,
    { nowMs: () => (videoId ? player.clock().ms : null), seekMs: (ms) => player.seek(ms) },
    () => pillState === "on",
    () => listening || pendingChunks > 0,
  );
  watch.hidden = false;
  window.history.replaceState(null, "", `?v=${id}`);
  history.select(id);
  void detectLanguage(id);
  await player.show("player", id);
  render();
  restartPolling();
}

form.onsubmit = (e) => {
  e.preventDefault();
  const id = parseVideoId(input.value);
  formError.hidden = !!id;
  if (id) void openVideo(id);
};

listenBtn.onclick = () => void (listening ? endListening() : startListening());
window.addEventListener("pagehide", () => uploader?.beacon());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) restartPolling();
});
void history.load();

if (!supported) {
  listenBtn.disabled = true;
  hint.textContent = t("hint.unsupported");
}

const initial = new URLSearchParams(location.search).get("v");
const initialId = initial ? parseVideoId(initial) : null;
if (initialId) {
  input.value = `https://www.youtube.com/watch?v=${initialId}`;
  void openVideo(initialId);
}
