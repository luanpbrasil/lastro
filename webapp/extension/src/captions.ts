import type { Segment } from "../../../shared/schema";
import type { ErrorCode } from "../../src/types";
import type { ApiReply } from "../../src/web/uploader";

/**
 * Sends a video's captions to the Worker for analysis, a few minutes of text at a time, starting where the viewer is
 * watching: the cards just ahead of the playhead come first, the rest of the video fills in after. Stretches the
 * video already has cards for (from anyone, on lastro or here) are never sent. Each upload is answered once its
 * cards are saved, so uploads go one after another, at least 10 s apart (the Worker's pacing).
 */

const CHUNK_CHARS = 2500; // about 3 minutes of speech: one model call
const CHUNK_SEGMENTS = 150;
const MIN_GAP_MS = 10_500;
const BEHIND_MS = 5_000; // a chunk that ended just before the playhead still counts as "ahead"
const RETRY_MS = 15_000;
const MAX_RETRIES = 4;
const RATE_LIMITED_WAIT_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Chunk {
  segments: Segment[];
  startMs: number;
  endMs: number;
  sent: boolean;
}

export interface FeederHooks {
  /** Playhead in ms. */
  playhead(): number;
  /** A captions session token, or why the Worker refused one. */
  openSession(): Promise<{ session: string } | { error: ErrorCode }>;
  post(path: string, body: string): Promise<ApiReply | null>;
  /** A chunk's cards are saved: poll now. */
  onSent(): void;
  /** Done (no error), or the Worker refused more text. */
  onStopped(error?: ErrorCode): void;
}

/** Captions → chunks of whole segments, leaving out the stretches already covered. */
export function chunksOf(segments: Segment[], covered: [number, number][]): Chunk[] {
  const isCovered = (s: Segment) => covered.some(([a, b]) => s.s >= a && s.s < b);
  const chunks: Chunk[] = [];
  let cur: Segment[] = [];
  let chars = 0;
  const flush = () => {
    if (cur.length) chunks.push({ segments: cur, startMs: cur[0].s, endMs: Math.max(...cur.map((s) => s.s + s.d)), sent: false });
    cur = [];
    chars = 0;
  };
  for (const s of segments) {
    // A covered stretch ends the chunk: what follows it is another part of the video.
    if (isCovered(s)) {
      flush();
      continue;
    }
    if (cur.length && (chars + s.t.length > CHUNK_CHARS || cur.length >= CHUNK_SEGMENTS)) flush();
    cur.push(s);
    chars += s.t.length;
  }
  flush();
  return chunks;
}

export class CaptionFeeder {
  private chunks: Chunk[];
  private session: string | null = null;
  private alive = true;
  private lastSent = 0;

  constructor(
    private videoId: string,
    segments: Segment[],
    covered: [number, number][],
    /** The captions' language, for the model. */
    private lang: string,
    private hooks: FeederHooks,
  ) {
    this.chunks = chunksOf(segments, covered);
  }

  /** Share of the captions to analyse that has been sent (1 when there was nothing to send). */
  get progress(): number {
    return this.chunks.length ? this.chunks.filter((c) => c.sent).length / this.chunks.length : 1;
  }

  get running(): boolean {
    return this.alive;
  }

  stop(): void {
    this.alive = false;
  }

  /** The next chunk: the first not sent that isn't behind the playhead, else the earliest not sent. */
  private next(): Chunk | null {
    const p = this.hooks.playhead();
    const left = this.chunks.filter((c) => !c.sent);
    return left.find((c) => c.endMs > p - BEHIND_MS) ?? left[0] ?? null;
  }

  async run(): Promise<void> {
    let retries = 0;
    let renewed = false;
    while (this.alive) {
      const chunk = this.next();
      if (!chunk) break;
      if (!this.session) {
        const opened = await this.hooks.openSession();
        if (!this.alive) return;
        if ("error" in opened) return this.end(opened.error);
        this.session = opened.session;
      }
      const wait = this.lastSent + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      if (!this.alive) return;
      this.lastSent = Date.now();
      const r = await this.hooks.post(`/api/videos/${this.videoId}/transcript`, JSON.stringify({ session: this.session, lang: this.lang || undefined, segments: chunk.segments }));
      if (!this.alive) return;
      if (r?.ok || r?.status === 400) {
        // Analysed (or skipped: already covered). A malformed chunk would fail again, so it is dropped too.
        chunk.sent = true;
        retries = 0;
        if (r.ok) this.hooks.onSent();
        continue;
      }
      if (r?.status === 425) continue; // too soon after the last one: the gap above waits
      const error = r ? (((await r.json().catch(() => null)) as { error?: ErrorCode } | null)?.error ?? "unavailable") : "unavailable";
      if (r?.status === 403 && error === "session_invalid" && !renewed) {
        this.session = null; // expired (2 h): one new session
        renewed = true;
        continue;
      }
      if (error === "rate_limited") {
        await sleep(RATE_LIMITED_WAIT_MS);
        continue;
      }
      if (!r || r.status >= 500) {
        if (++retries > MAX_RETRIES) return this.end("unavailable");
        await sleep(RETRY_MS);
        continue;
      }
      return this.end(error); // video_limit, ip_videos, neurons…: no more for now
    }
    this.end();
  }

  private end(error?: ErrorCode): void {
    if (!this.alive) return;
    this.alive = false;
    this.hooks.onStopped(error);
  }
}
