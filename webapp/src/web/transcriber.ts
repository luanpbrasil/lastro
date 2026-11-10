import type { Segment } from "../../../shared/schema";

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

const Ctor = (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

/** Tab audio into speech recognition needs desktop Chrome: the track overload of start() and tab capture with audio. */
export const isSupported = (): boolean => !!Ctor && !!navigator.mediaDevices?.getDisplayMedia;

const FATAL_ERRORS: Record<string, string> = {
  "not-allowed": "O navegador não permitiu o reconhecimento de fala.",
  "service-not-allowed": "O navegador não permitiu o reconhecimento de fala.",
  "language-not-supported": "O Chrome não reconhece português neste computador.",
  "audio-capture": "Não foi possível ler o áudio da aba.",
};

export interface TranscriberHooks {
  clock(): { ms: number; playing: boolean };
  onSegment(segment: Segment): void;
  onInterim(text: string): void;
  /** Listening ended by itself: the user stopped sharing (no message) or an error (message). */
  onStopped(message?: string): void;
}

/** Thrown by start() when the user closes the sharing dialog or doesn't turn on tab audio. */
export class CaptureError extends Error {}

export class TabTranscriber {
  private stream: MediaStream | null = null;
  private recognition: Recognition | null = null;
  private active = false;
  private networkFailures = 0;
  private ended: (() => void) | null = null;

  constructor(private hooks: TranscriberHooks) {}

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
      throw new CaptureError("Compartilhamento cancelado.");
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new CaptureError("Sem áudio: ao compartilhar, escolha esta aba e ative “Compartilhar áudio da aba”.");
    }
    this.stream = stream;
    this.active = true;
    this.networkFailures = 0;
    track.onended = () => this.finish();
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
    this.release();
  }

  private listen(track: MediaStreamTrack): void {
    const r = new Ctor!();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    const started = new Map<number, { ms: number; playing: boolean }>();

    r.onresult = (e) => {
      this.networkFailures = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!started.has(i)) started.set(i, this.hooks.clock());
        const text = result[0].transcript.trim();
        if (!result.isFinal) {
          interim += ` ${text}`;
          continue;
        }
        const from = started.get(i)!;
        // Speech heard while the video isn't playing is an ad or something else in the tab.
        if (text && from.playing) {
          const s = Math.max(0, Math.round(from.ms - RECOGNITION_LAG_MS));
          this.hooks.onSegment({ s, d: Math.max(0, Math.round(this.hooks.clock().ms - s)), t: text });
        }
      }
      this.hooks.onInterim(interim.trim());
    };

    r.onerror = (e) => {
      if (FATAL_ERRORS[e.error]) this.finish(FATAL_ERRORS[e.error]);
      else if (e.error === "network" && ++this.networkFailures >= MAX_NETWORK_FAILURES) this.finish("O serviço de reconhecimento de fala do Chrome não respondeu.");
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

  private finish(message?: string): void {
    if (!this.active) return;
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      /* it had already ended */
    }
    this.release();
    this.hooks.onStopped(message);
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.recognition = null;
    this.ended = null;
  }
}
