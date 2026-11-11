import { SpeechListener, type SpeechError } from "../../src/web/transcriber";
import type { FromOffscreen, ToOffscreen } from "./messages";

/**
 * The offscreen document: an invisible extension page that holds the tab's audio while Lastro listens.
 * Chrome gives the audio only to an extension page, after the viewer clicks the toolbar icon (background.ts).
 * Speech is recognised here (the page's SpeechListener) and each phrase goes to the tab, which times it on the video.
 */

let stream: MediaStream | null = null;
let audio: AudioContext | null = null;
let listener: SpeechListener | null = null;
let tabId = -1;
let stopping: Promise<void> | null = null;
let meter: number | null = null;

/**
 * What listening has heard, to check from this page's DevTools (chrome://extensions → Lastro → offscreen.html):
 * `lastroStats` in the console. `level` is the audio's loudness (0 = silence).
 */
const stats = { listening: false, lang: "", phrases: 0, finals: 0, words: 0, errors: [] as string[], level: 0 };
(globalThis as unknown as { lastroStats: typeof stats }).lastroStats = stats;

type Body<M> = M extends unknown ? Omit<M, "target" | "tabId"> : never;
const send = (m: Body<FromOffscreen>) =>
  chrome.runtime.sendMessage({ target: "background", tabId, ...m } as FromOffscreen).catch(() => {});

chrome.runtime.onMessage.addListener((msg: ToOffscreen) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "start") void start(msg.streamId, msg.lang, msg.tabId);
  else void stop();
});

async function start(streamId: string, lang: string, tab: number): Promise<void> {
  await stop(false);
  tabId = tab;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as MediaTrackConstraints,
      video: false,
    });
  } catch {
    void send({ type: "ended", error: "capture" });
    return;
  }
  // Capturing a tab mutes it: play its audio back, so the viewer keeps hearing the video.
  audio = new AudioContext();
  const source = audio.createMediaStreamSource(stream);
  source.connect(audio.destination);
  const analyser = audio.createAnalyser();
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  meter = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    stats.level = Math.round(1000 * Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length)) / 1000;
  }, 1000);
  const track = stream.getAudioTracks()[0];
  track.onended = () => void stop(); // the tab closed, or went somewhere Chrome can't capture
  const l = new SpeechListener({
    onStart: (id) => {
      stats.phrases++;
      void send({ type: "speech", event: { kind: "start", id } });
    },
    onFinal: (id, text) => {
      stats.finals++;
      stats.words += text.split(/\s+/).filter(Boolean).length;
      void send({ type: "speech", event: { kind: "final", id, text } });
    },
    onInterim: () => {}, // the overlay doesn't show words being recognised
    onFatal: (error) => void stop(true, error),
    onError: (error) => void stats.errors.push(`${new Date().toISOString().slice(11, 19)} ${error}`),
  });
  l.lang = lang;
  Object.assign(stats, { listening: true, lang, phrases: 0, finals: 0, words: 0, errors: [] });
  listener = l;
  l.start(track);
}

/** Stop listening, after the words still being recognised have been sent; then say so (`notify`). */
function stop(notify = true, error?: SpeechError | "capture"): Promise<void> {
  stopping ??= (async () => {
    const l = listener;
    listener = null;
    if (l) await l.stop();
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    stream = null;
    if (meter !== null) window.clearInterval(meter);
    meter = null;
    stats.listening = false;
    await audio?.close().catch(() => {});
    audio = null;
    if (notify && tabId >= 0) await send({ type: "ended", error });
  })().finally(() => (stopping = null));
  return stopping;
}
