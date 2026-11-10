import type { Segment } from "../../../shared/schema";
import type { ErrorCode } from "../types";

/**
 * Fast feedback: the first upload goes 15 s after listening starts, then one every 30 s, or sooner once enough
 * speech has built up (~45 s of talk). The Worker refuses uploads less than 10 s apart, so this never floods it.
 */
const FIRST_FLUSH_MS = 15_000;
const FLUSH_EVERY_MS = 30_000;
const FLUSH_CHARS = 900;
const BATCH_SEGMENTS = 160;
const BATCH_CHARS = 8000;
const TOO_FAST_WAIT_MS = 11_000;
const TOO_FAST_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collects final transcript segments and sends them to the Worker about every 30 s. */
export class TranscriptUploader {
  private buffer: Segment[] = [];
  private timer: number | null = null;
  private first: number | null = null;
  private sending: Promise<void> | null = null;
  private finishing = false;

  /** `onBlocked` runs when the Worker refuses more text for this listening session. */
  constructor(
    private videoId: string,
    private session: string,
    /** The language speech recognition is set to, so the model knows what it's reading. */
    private lang: string,
    private onBlocked: (code: ErrorCode) => void,
    private onSent: (segments: number) => void,
  ) {}

  private get url(): string {
    return `/api/videos/${this.videoId}/transcript`;
  }

  private body(segments: Segment[]): string {
    return JSON.stringify({ session: this.session, lang: this.lang, segments });
  }

  start(): void {
    this.first ??= window.setTimeout(() => void this.flush(), FIRST_FLUSH_MS);
    this.timer ??= window.setInterval(() => void this.flush(), FLUSH_EVERY_MS);
  }

  add(segment: Segment): void {
    this.buffer.push(segment);
    if (!this.sending && this.buffer.reduce((n, s) => n + s.t.length, 0) >= FLUSH_CHARS) void this.flush();
  }

  /** Send everything left. */
  async finish(): Promise<void> {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.first !== null) window.clearTimeout(this.first);
    this.timer = null;
    this.first = null;
    this.finishing = true;
    await this.sending;
    await this.flush();
  }

  /** Last chance when the page is closing: fetch would be cancelled. */
  beacon(): void {
    if (!this.buffer.length) return;
    navigator.sendBeacon(this.url, new Blob([this.body(this.takeBatch())], { type: "application/json" }));
  }

  private takeBatch(): Segment[] {
    let chars = 0;
    let n = 0;
    while (n < this.buffer.length && n < BATCH_SEGMENTS && (n === 0 || chars + this.buffer[n].t.length <= BATCH_CHARS)) chars += this.buffer[n++].t.length;
    return this.buffer.splice(0, n);
  }

  private flush(): Promise<void> {
    this.sending ??= this.drain().finally(() => (this.sending = null));
    return this.sending;
  }

  private post(batch: Segment[]): Promise<Response | null> {
    return fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: this.body(batch) }).catch(() => null);
  }

  private async drain(): Promise<void> {
    while (this.buffer.length) {
      const batch = this.takeBatch();
      let r = await this.post(batch);
      // The last words often arrive right after a regular upload: wait for the Worker's pacing instead of losing them.
      for (let i = 0; this.finishing && r?.status === 425 && i < TOO_FAST_RETRIES; i++) {
        await sleep(TOO_FAST_WAIT_MS);
        r = await this.post(batch);
      }
      if (!r || r.status >= 500 || r.status === 425) {
        this.buffer.unshift(...batch); // try again at the next upload
        return;
      }
      if (r.ok) {
        this.onSent(batch.length);
        continue;
      }
      if (r.status !== 400) {
        const { error } = (await r.json().catch(() => ({ error: "unavailable" }))) as { error: ErrorCode };
        this.buffer = [];
        this.onBlocked(error);
        return;
      }
    }
  }
}
