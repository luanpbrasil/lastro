// Judge demo: the extension's overlay and card timeline over a YouTube IFrame player, with precomputed cards.
// No caption reading here. Cards come from /api/demo/cards/:id ($0); "Rodar ao vivo" streams /api/demo/live.
import { Overlay, shortParaphrase, type PillState } from "../../extension/src/overlay";
import { CardTimeline, type PlayerAdapter } from "../../extension/src/timeline";
import { DEMO_VIDEOS, LIVE_TRANSCRIPTS, type LiveId } from "../../shared/demo";
import { episodeSeries, resolveFact } from "../../shared/indicators";
import type { Card, StreamEvent } from "../../shared/schema";
import { stanceView } from "../../shared/stance";
import { fmtTime } from "../../shared/transcript";

interface YTPlayer {
  getCurrentTime(): number;
  seekTo(s: number, allowSeekAhead: boolean): void;
  cueVideoById(id: string): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const KIND: Record<Card["kind"], string> = { fact: "FATO", theory: "TEORIA", forecast: "PREVISÃO" };
const LIVE_ID: LiveId = "TESTfacts01";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const overlay = new Overlay();
overlay.loadFact = (i, p) => resolveFact(i, p);
overlay.loadSeries = (i, f, t) => episodeSeries(i, f, t);

let state: PillState = "on";
let status = "";
let player: YTPlayer | null = null;
let ready = false;
let timeline: CardTimeline | null = null;
let current = "";

const adapter: PlayerAdapter = {
  nowMs: () => (player && ready ? player.getCurrentTime() * 1000 : null),
  seekMs: (ms) => player?.seekTo(ms / 1000, true),
};

function setStatus(s: string): void {
  status = s;
  overlay.setPill(state, s);
}

overlay.onPauseClick = () => {
  state = state === "on" ? "paused" : "on";
  if (state === "paused") overlay.hide();
  overlay.setPill(state, status);
};
overlay.onOpenList = () => timeline?.openList();

async function selectVideo(id: string): Promise<void> {
  current = id;
  const v = DEMO_VIDEOS.find((x) => x.id === id)!;
  document.querySelectorAll<HTMLElement>(".vid").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
  $("hint").textContent = `${v.channel} · ${v.hint}`;
  $("preparing").hidden = true;
  timeline?.stop();
  overlay.hide();
  overlay.setQueued(0);
  timeline = new CardTimeline(overlay, adapter, () => state === "on", () => status === "carregando…");
  if (player && ready) player.cueVideoById(id);
  setStatus("carregando…");
  try {
    const r = await fetch(`/api/demo/cards/${id}`);
    if (current !== id) return;
    if (r.status === 404) {
      setStatus("preparando cartões…");
      $("preparing").hidden = false;
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json()) as { cards: Card[] };
    for (const c of data.cards) timeline.add(c);
    setStatus(`${timeline.count} ideias`);
  } catch {
    if (current === id) setStatus("servidor indisponível");
  }
}

function renderVideoList(): void {
  const box = $("videos");
  for (const v of DEMO_VIDEOS) {
    const b = document.createElement("button");
    b.className = "vid";
    b.dataset.id = v.id;
    const img = document.createElement("img");
    img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    img.alt = "";
    const text = document.createElement("span");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = v.title;
    const c = document.createElement("span");
    c.className = "c";
    c.textContent = v.channel;
    text.append(t, c);
    b.append(img, text);
    b.onclick = () => void selectVideo(v.id);
    box.append(b);
  }
}

function initPlayer(): void {
  if (player || !window.YT?.Player) return;
  player = new window.YT.Player("player", {
    videoId: current,
    playerVars: { playsinline: 1, rel: 0 },
    events: {
      onReady: () => {
        ready = true;
        if (current) player?.cueVideoById(current); // a different video may have been picked while the player loaded
      },
    },
  });
}

// ---- "Rodar ao vivo" --------------------------------------------------------------

const LIVE_ERRORS: Record<number, string> = {
  402: "O limite de gasto do demo foi atingido. Os cartões em cache continuam funcionando.",
  409: "Já há uma análise ao vivo em andamento. Tente de novo em alguns segundos.",
  429: "O limite diário de análises novas foi atingido. Os cartões em cache continuam funcionando.",
};

function usd(x: number): string {
  return `US$ ${x.toFixed(4).replace(".", ",")}`;
}

function liveItem(card: Card): HTMLElement {
  const b = document.createElement("button");
  b.className = "live-item";
  const v = stanceView(card);
  const stance = v.lead
    ? `${v.lead.role === "contradicts" ? "Vai contra" : v.lead.role === "echoes" ? "Lembra" : "Apoia-se em"} ${v.lead.node.name}`
    : "";
  const what = stance ? `${shortParaphrase(card.paraphrase)} · ${stance}` : shortParaphrase(card.paraphrase);
  const t = document.createElement("span");
  t.className = "mono muted";
  t.textContent = fmtTime(card.startMs);
  const k = document.createElement("span");
  k.className = `badge ${card.kind}`;
  k.textContent = KIND[card.kind];
  const s = document.createElement("span");
  s.className = "small";
  s.textContent = what;
  b.append(t, k, s);
  b.onclick = () => {
    overlay.onSeek = () => {}; // this transcript has no video to seek
    overlay.showCard(card);
  };
  return b;
}

async function runLive(): Promise<void> {
  const btn = $<HTMLButtonElement>("live");
  const list = $("live-list");
  const metrics = $("live-metrics");
  btn.disabled = true;
  list.replaceChildren();
  metrics.textContent = "chamando o Claude Haiku…";
  const t0 = performance.now();
  let first: number | null = null;
  let n = 0;
  try {
    const r = await fetch("/api/demo/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: LIVE_ID }) });
    if (!r.ok || !r.body) {
      metrics.textContent = LIVE_ERRORS[r.status] ?? `Não foi possível rodar agora (erro ${r.status}).`;
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as StreamEvent;
        if (ev.type === "card") {
          if (first === null) first = performance.now() - t0;
          n++;
          list.append(liveItem(ev.card));
          metrics.textContent = `1º cartão em ${(first / 1000).toFixed(1).replace(".", ",")} s · ${n} cartões…`;
        } else if (ev.type === "done") {
          const total = (performance.now() - t0) / 1000;
          const spend = await fetch("/spend").then((x) => (x.ok ? x.json() : null)).catch(() => null);
          metrics.textContent =
            `1º cartão em ${first !== null ? (first / 1000).toFixed(1).replace(".", ",") : "–"} s · ${n} cartões em ${total.toFixed(1).replace(".", ",")} s · ` +
            `custo desta análise ${usd(ev.costUsd ?? 0)}` +
            (spend ? ` · gasto do demo: ${usd(spend.total)} de US$ ${Number(spend.maxSpendUsd).toFixed(2).replace(".", ",")}` : "");
        } else if (ev.type === "error") {
          metrics.textContent = "A análise falhou. Tente de novo em instantes.";
        }
      }
    }
  } catch {
    metrics.textContent = "Servidor indisponível agora.";
  } finally {
    btn.disabled = false;
  }
}

// ---- start --------------------------------------------------------------------------

renderVideoList();
$("live-what").textContent = LIVE_TRANSCRIPTS[LIVE_ID];
$("live").onclick = () => void runLive();
void selectVideo(DEMO_VIDEOS[0].id);
window.onYouTubeIframeAPIReady = initPlayer;
initPlayer();
