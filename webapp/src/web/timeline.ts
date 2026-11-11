import type { StoredCard } from "../types";
import type { Overlay } from "./overlay";

/** What the timeline needs from the player. */
export interface PlayerAdapter {
  /** Playhead in ms, or null when there is no player yet. */
  nowMs(): number | null;
  seekMs(ms: number): void;
}

const MIN_GAP_MS = 20_000; // ≥ 20 s between pop-ups (the extension uses 40 s; live cards come in bursts)
const QUIET_START_MS = 10_000; // no pop-up in the first 10 s of the video
const STALE_MS = 30_000; // a card passed by more than this (a skip ahead) goes to the list, not a pop-up
const FRESH_MS = 90_000; // …unless it was analysed just now: it pops as it arrives
const DUE_SLACK_MS = 500;

/**
 * The extension's card timeline (extension/src/timeline.ts) for this page. Cards saved earlier pop as the playhead
 * reaches them, exactly as in the extension. Cards analysed while the viewer listens arrive a few minutes after the
 * speech, so they pop when they arrive instead. Each idea pops once, ≥ 40 s apart, never over the open list.
 */
export class CardTimeline {
  private cards: StoredCard[] = [];
  private handled = new Set<StoredCard>();
  private arrived = new Map<StoredCard, number>();
  /** Ideas seen so far, by primary node and side: number of mentions. Used to pop each idea once. */
  private ideas = new Map<string, number>();
  private listDue = -1;
  private listCount = -1;
  private queue: StoredCard[] = [];
  private lastPopAt = -Infinity;
  private timer: number;

  constructor(
    private overlay: Overlay,
    private player: PlayerAdapter,
    /** false while the viewer paused pop-ups */
    private active: () => boolean,
    /** true while text is being analysed (the empty list says so) */
    private analysing: () => boolean,
  ) {
    overlay.onSeek = (ms) => player.seekMs(ms);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  get count(): number {
    return this.cards.length;
  }

  stop(): void {
    window.clearInterval(this.timer);
  }

  /** `fresh`: just analysed (not loaded with the video), so it may pop even if its moment has passed. */
  add(cards: StoredCard[], fresh: boolean): void {
    const now = performance.now();
    for (const c of cards) {
      this.cards.push(c);
      if (fresh) this.arrived.set(c, now);
    }
    this.cards.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
  }

  private tick(): void {
    const nowMs = this.player.nowMs();
    if (nowMs === null) return;
    if (this.overlay.isListOpen()) {
      // Keep the open list current: the playhead passed a card, or new cards arrived.
      if (this.dueCount(nowMs) !== this.listDue || this.cards.length !== this.listCount) this.openList({ redraw: true });
    }
    if (!this.active()) return;
    const t = performance.now();
    for (const c of this.cards) {
      if (this.handled.has(c) || c.startMs > nowMs + DUE_SLACK_MS) continue;
      const isNew = this.see(c);
      const recent = nowMs - c.startMs <= STALE_MS || t - (this.arrived.get(c) ?? -Infinity) <= FRESH_MS;
      if (isNew && recent) this.queue.push(c);
    }
    // After a seek, drop queued cards far from the playhead, unless they were analysed just now.
    this.queue = this.queue.filter(
      (c) => c.startMs <= nowMs + DUE_SLACK_MS && (nowMs - c.startMs <= 4 * STALE_MS || t - (this.arrived.get(c) ?? -Infinity) <= FRESH_MS),
    );
    if (!this.overlay.isBusy() && nowMs >= QUIET_START_MS && t - this.lastPopAt >= MIN_GAP_MS) this.popNext();
    this.overlay.setQueued(this.queue.length);
  }

  /** Mark a card as seen. Returns true if it is the first card of its idea. */
  private see(c: StoredCard): boolean {
    if (this.handled.has(c)) return false;
    this.handled.add(c);
    const key = this.ideaKey(c);
    const n = this.ideas.get(key) ?? 0;
    this.ideas.set(key, n + 1);
    return n === 0;
  }

  private ideaKey(c: StoredCard): string {
    const n = c.nodes[0];
    return n ? `${n.id}:${n.role === "contradicts" ? "con" : "pro"}` : (c.indicator ?? c.quote);
  }

  private mentions(c: StoredCard): number {
    return this.ideas.get(this.ideaKey(c)) ?? 1;
  }

  private dueCount(nowMs: number): number {
    return this.cards.filter((c) => c.startMs <= nowMs + DUE_SLACK_MS).length;
  }

  private popNext(): void {
    const c = this.queue.shift();
    if (!c) return;
    this.lastPopAt = performance.now();
    this.overlay.showCard(c, this.nav(c, false));
  }

  /** Where a card sits among the video's cards, and how to step to its neighbours or back to the list. */
  private nav(card: StoredCard, manual: boolean) {
    const i = this.cards.indexOf(card);
    const prev = this.cards[i - 1];
    const next = this.cards[i + 1];
    return {
      index: i + 1,
      total: this.cards.length,
      onPrev: prev ? () => this.openCard(prev) : undefined,
      onNext: next ? () => this.openCard(next) : undefined,
      onList: () => this.openList(),
      mentions: this.mentions(card),
      manual,
    };
  }

  /** Every card of the video in time order: the ones already passed, then the ones ahead. */
  openList(opts: { redraw?: boolean } = {}): void {
    const nowMs = this.player.nowMs() ?? 0;
    this.listDue = this.dueCount(nowMs);
    this.listCount = this.cards.length;
    const items = this.cards.map((card) => ({ card, ahead: card.startMs > nowMs + DUE_SLACK_MS }));
    this.overlay.showList(items, nowMs, {
      analysing: this.analysing(),
      redraw: opts.redraw,
      onOpen: (card) => this.openCard(card),
      onJump: (card) => this.jumpTo(card),
    });
  }

  /** Seek to a card (1 s early, so the sentence starts on screen); it counts as seen, so it won't pop later. */
  jumpTo(card: StoredCard): void {
    this.player.seekMs(Math.max(0, card.startMs - 1000));
    this.see(card);
    this.queue = this.queue.filter((q) => q !== card);
    this.lastPopAt = performance.now();
  }

  openCard(card: StoredCard): void {
    this.see(card);
    this.queue = this.queue.filter((q) => q !== card); // opened by hand: no need to pop it later
    this.lastPopAt = performance.now(); // and don't pop another over it right away
    this.overlay.showCard(card, this.nav(card, true));
    this.overlay.setQueued(this.queue.length);
  }
}
