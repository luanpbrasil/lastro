import type { CardsResponse } from "../types";
import { CardList } from "./cards";
import { CaptureError, isSupported, TabTranscriber } from "./transcriber";
import { TranscriptUploader } from "./uploader";
import { parseVideoId, Player } from "./youtube";

const POLL_ACTIVE_MS = 4000;
const POLL_IDLE_MS = 15_000;
const BLOCKED: Record<number, string> = {
  402: "O limite de gasto foi atingido. Os cartões já salvos continuam disponíveis.",
  429: "O limite diário de análises foi atingido. Tente de novo amanhã.",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const input = $<HTMLInputElement>("url");
const formError = $("form-error");
const watch = $("watch");
const listenBtn = $<HTMLButtonElement>("listen");
const statusEl = $("status");
const interimEl = $("interim");
const hint = $("hint");
const empty = $("empty");

const player = new Player();
const list = new CardList($("cards"), $("count"), (ms) => player.seek(ms));

let videoId = "";
let cursor = 0;
let pollGeneration = 0;
let pollTimer: number | null = null;
let pendingChunks = 0;
let failedChunks = 0;
let sentSegments = 0;
let notice = "";

let listening = false;
let uploader: TranscriptUploader | null = null;
const transcriber = new TabTranscriber({
  clock: () => player.clock(),
  onSegment: (s) => uploader?.add(s),
  onInterim: (t) => (interimEl.textContent = t),
  onStopped: (message) => void endListening(message),
});

function render(): void {
  listenBtn.textContent = listening ? "Parar de ouvir" : "Ouvir este vídeo";
  const parts: string[] = [];
  if (notice) parts.push(notice);
  else if (listening) parts.push(sentSegments ? `ouvindo · ${sentSegments} falas enviadas` : "ouvindo…");
  if (pendingChunks) parts.push("analisando…");
  if (failedChunks) parts.push("um trecho não pôde ser analisado");
  statusEl.textContent = parts.join(" · ");
  empty.hidden = list.size > 0;
  empty.textContent = listening || pendingChunks ? "As ideias aparecem aqui cerca de 30 segundos depois da fala." : "Ainda não há ideias para este vídeo. Clique em “Ouvir este vídeo” e dê play.";
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
      list.add(data.cards, listening);
      render();
    }
  } catch {
    /* offline: the next poll tries again */
  }
  if (generation === pollGeneration) pollTimer = window.setTimeout(() => void poll(generation), listening || pendingChunks ? POLL_ACTIVE_MS : POLL_IDLE_MS);
}

function restartPolling(): void {
  pollGeneration++;
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  void poll(pollGeneration);
}

// ---- listening ------------------------------------------------------------------------

async function startListening(): Promise<void> {
  listenBtn.disabled = true;
  notice = "";
  try {
    await transcriber.start();
  } catch (err) {
    notice = err instanceof CaptureError ? err.message : "Não foi possível ouvir esta aba.";
    listenBtn.disabled = false;
    render();
    return;
  }
  listening = true;
  sentSegments = 0;
  uploader = new TranscriptUploader(
    videoId,
    (status) => void endListening(BLOCKED[status]),
    (n) => {
      sentSegments += n;
      restartPolling(); // cards for this text are on their way: go back to the fast rate at once
    },
  );
  uploader.start();
  listenBtn.disabled = false;
  player.play();
  render();
  restartPolling();
}

/** Called when the user stops, sharing ends or the Worker refuses more text. */
async function endListening(message?: string): Promise<void> {
  if (!listening) return;
  listening = false;
  listenBtn.disabled = true;
  await transcriber.stop();
  interimEl.textContent = "";
  notice = message ?? "";
  const done = uploader;
  uploader = null;
  await done?.finish();
  listenBtn.disabled = false;
  render();
  restartPolling();
}

// ---- choosing a video -----------------------------------------------------------------

async function openVideo(id: string): Promise<void> {
  await endListening();
  videoId = id;
  cursor = 0;
  pendingChunks = 0;
  failedChunks = 0;
  notice = "";
  list.clear();
  watch.hidden = false;
  history.replaceState(null, "", `?v=${id}`);
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

if (!isSupported()) {
  listenBtn.disabled = true;
  hint.textContent = "Ouvir um vídeo só funciona no Chrome para computador. Aqui você ainda vê as ideias já salvas de cada vídeo.";
}

const initial = new URLSearchParams(location.search).get("v");
const initialId = initial ? parseVideoId(initial) : null;
if (initialId) {
  input.value = `https://www.youtube.com/watch?v=${initialId}`;
  void openVideo(initialId);
}
