import type { Segment } from "../../../shared/schema";
import { t } from "./i18n";

/**
 * Speech in a tab's audio, as transcript segments on the video's clock. Three parts, so the Chrome extension can use
 * the first two apart: it recognises speech in its offscreen document but knows the video's clock in the page.
 * - SpeechListener: Chrome's speech recognition on an audio track, restarted whenever Chrome ends a session.
 * - SegmentTimer: turns recognised phrases into segments, timed by the video's playhead when each phrase began.
 * - TabTranscriber: this page's listening: the tab's audio from the sharing dialog, through both.
 */

/** The first words of a result reach us about this long after they were spoken. */
const RECOGNITION_LAG_MS = 1000;
const RESTART_DELAY_MS = 300;
const MAX_NETWORK_FAILURES = 3;
const STOP_TIMEOUT_MS = 1500;

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor = (globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

/** Chrome's speech recognition is there (desktop Chrome). */
export const hasRecognition = (): boolean => !!Ctor;
/** Tab audio into speech recognition needs desktop Chrome: the track overload of start() and tab capture with audio. */
export const isSupported = (): boolean => hasRecognition() && !!navigator.mediaDevices?.getDisplayMedia;

/** Why recognition stopped for good. */
export type SpeechError = "not-allowed" | "language-not-supported" | "audio-capture" | "network";
const FATAL_ERRORS: Record<string, SpeechError> = {
  "not-allowed": "not-allowed",
  "service-not-allowed": "not-allowed",
  "language-not-supported": "language-not-supported",
  "audio-capture": "audio-capture",
};
const ERROR_KEYS = {
  "not-allowed": "capture.notAllowed",
  "language-not-supported": "capture.language",
  "audio-capture": "capture.audio",
  network: "capture.network",
} as const;
export const speechErrorMessage = (e: SpeechError): string => t(ERROR_KEYS[e] ?? "capture.audio");

export interface SpeechHooks {
  /** A phrase began to be recognised. `id` is unique for this listener. */
  onStart(id: number): void;
  /** The phrase's final text (possibly empty). */
  onFinal(id: number, text: string): void;
  /** Words still being recognised, for display. */
  onInterim(text: string): void;
  /** Recognition stopped by itself and won't start again. */
  onFatal(error: SpeechError): void;
  /** Every error Chrome reports, fatal or not (for diagnostics). */
  onError?(error: string): void;
}

/** Chrome's speech recognition on an audio track, started again on the same track each time Chrome ends a session. */
export class SpeechListener {
  private recognition: Recognition | null = null;
  private active = false;
  private networkFailures = 0;
  private ended: (() => void) | null = null;
  private run = 0;

  /** BCP 47 tag of the language spoken, e.g. "en-US" or "pt-BR". Set before start(). */
  lang = "pt-BR";

  constructor(private hooks: SpeechHooks) {}

  start(track: MediaStreamTrack): void {
    this.active = true;
    this.networkFailures = 0;
    this.listen(track);
  }

  /** Stop and wait for the words still being recognised. */
  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    const done = new Promise<void>((resolve) => {
      this.ended = resolve;
      setTimeout(resolve, STOP_TIMEOUT_MS);
    });
    try {
      this.recognition?.stop();
    } catch {
      /* it had already ended */
    }
    await done;
    this.recognition = null;
    this.ended = null;
  }

  private listen(track: MediaStreamTrack): void {
    const r = new Ctor!();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    // Result indexes start again in every session: number the phrases so ids stay unique.
    const base = ++this.run * 100_000;
    const seen = new Set<number>();

    r.onresult = (e) => {
      this.networkFailures = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!seen.has(i)) {
          seen.add(i);
          this.hooks.onStart(base + i);
        }
        const text = result[0].transcript.trim();
        if (result.isFinal) this.hooks.onFinal(base + i, text);
        else interim += ` ${text}`;
      }
      this.hooks.onInterim(interim.trim());
    };

    r.onerror = (e) => {
      this.hooks.onError?.(e.error);
      if (FATAL_ERRORS[e.error]) this.fail(FATAL_ERRORS[e.error]);
      else if (e.error === "network" && ++this.networkFailures >= MAX_NETWORK_FAILURES) this.fail("network");
    };

    // Chrome ends a "continuous" session after silence or about a minute: start a new one on the same track.
    r.onend = () => {
      if (!this.active) {
        this.ended?.();
        return;
      }
      setTimeout(() => {
        if (this.active && track.readyState === "live") this.listen(track);
      }, RESTART_DELAY_MS);
    };

    this.recognition = r;
    r.start(track);
  }

  private fail(error: SpeechError): void {
    if (!this.active) return;
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      /* it had already ended */
    }
    this.recognition = null;
    this.hooks.onFatal(error);
  }
}

export interface Clock {
  ms: number;
  playing: boolean;
}

/** Recognised phrases → transcript segments, timed by where the video was when each phrase began. */
export class SegmentTimer {
  private started = new Map<number, Clock>();

  constructor(
    private clock: () => Clock,
    private emit: (segment: Segment) => void,
  ) {}

  start(id: number): void {
    if (!this.started.has(id)) this.started.set(id, this.clock());
  }

  final(id: number, text: string): void {
    const from = this.started.get(id) ?? this.clock();
    this.started.delete(id);
    // Speech heard while the video isn't playing is an ad or something else in the tab.
    if (!text || !from.playing) return;
    const s = Math.max(0, Math.round(from.ms - RECOGNITION_LAG_MS));
    this.emit({ s, d: Math.max(0, Math.round(this.clock().ms - s)), t: text });
  }

  clear(): void {
    this.started.clear();
  }
}

export interface TranscriberHooks {
  clock(): Clock;
  onSegment(segment: Segment): void;
  onInterim(text: string): void;
  /** Listening ended by itself: the user stopped sharing (no message) or an error (message). */
  onStopped(message?: string): void;
}

/** Thrown by start() when the user closes the sharing dialog or doesn't turn on tab audio. */
export class CaptureError extends Error {}

/** This page's listening: the tab chosen in Chrome's sharing dialog, recognised and timed by the player's clock. */
export class TabTranscriber {
  private stream: MediaStream | null = null;
  private active = false;
  private timer: SegmentTimer;
  private listener: SpeechListener;

  /** BCP 47 tag of the language spoken in the video, e.g. "en-US" or "pt-BR". Set before start(). */
  lang = "pt-BR";

  constructor(private hooks: TranscriberHooks) {
    this.timer = new SegmentTimer(
      () => hooks.clock(),
      (s) => hooks.onSegment(s),
    );
    this.listener = new SpeechListener({
      onStart: (id) => this.timer.start(id),
      onFinal: (id, text) => this.timer.final(id, text),
      onInterim: (text) => hooks.onInterim(text),
      onFatal: (error) => this.finish(speechErrorMessage(error)),
    });
  }

  /** Must be called from a click: Chrome asks which tab to share. */
  async start(): Promise<void> {
    const options = {
      // Video can't be turned off in getDisplayMedia, so ask for as little as possible.
      video: { frameRate: 1, width: { max: 320 }, height: { max: 240 } },
      // Voice processing is meant for microphones and only degrades tab audio. The viewer must keep hearing the video.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
      systemAudio: "exclude",
    } as DisplayMediaStreamOptions;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(options);
    } catch {
      throw new CaptureError(t("capture.cancelled"));
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new CaptureError(t("capture.noAudio"));
    }
    this.stream = stream;
    this.active = true;
    track.onended = () => this.finish();
    this.listener.lang = this.lang;
    this.listener.start(track);
  }

  /** Stop and wait for the words still being recognised. */
  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await this.listener.stop();
    this.release();
  }

  private finish(message?: string): void {
    if (!this.active) return;
    this.active = false;
    void this.listener.stop();
    this.release();
    this.hooks.onStopped(message);
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.timer.clear();
  }
}
