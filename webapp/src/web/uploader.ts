import type { Segment } from "../../../shared/schema";

const FLUSH_EVERY_MS = 30_000;
const BATCH_SEGMENTS = 80;
const BATCH_CHARS = 4000;

/** Collects final transcript segments and sends them to the Worker about every 30 s. */
export class TranscriptUploader {
  private buffer: Segment[] = [];
  private timer: number | null = null;
  private sending: Promise<void> | null = null;

  /** `onBlocked` runs when the Worker refuses more text (spend or daily limit). */
  constructor(
    private videoId: string,
    private onBlocked: (status: number) => void,
    private onSent: (segments: number) => void,
  ) {}

  private get url(): string {
    return `/api/videos/${this.videoId}/transcript`;
  }

  start(): void {
    this.timer ??= window.setInterval(() => void this.flush(), FLUSH_EVERY_MS);
  }

  add(segment: Segment): void {
    this.buffer.push(segment);
  }

  /** Send everything left. */
  async finish(): Promise<void> {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    await this.sending;
    await this.flush();
  }

  /** Last chance when the page is closing: fetch would be cancelled. */
  beacon(): void {
    if (!this.buffer.length) return;
    const body = JSON.stringify({ segments: this.takeBatch() });
    navigator.sendBeacon(this.url, new Blob([body], { type: "application/json" }));
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

  private async drain(): Promise<void> {
    while (this.buffer.length) {
      const batch = this.takeBatch();
      let status = 0;
      try {
        status = (await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ segments: batch }) })).status;
      } catch {
        /* offline: status stays 0 */
      }
      if (status === 0 || status >= 500) {
        this.buffer.unshift(...batch); // try again at the next flush
        return;
      }
      if (status === 402 || status === 429) {
        this.buffer = [];
        this.onBlocked(status);
        return;
      }
      if (status < 300) this.onSent(batch.length);
    }
  }
}
