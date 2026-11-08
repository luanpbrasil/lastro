import type { Card } from "../../shared/schema";
import type { Overlay } from "./overlay";

/** What the timeline needs from a video player: the extension's <video> element, or the demo page's IFrame player. */
export interface PlayerAdapter {
  /** Playhead in ms, or null when there is no player yet. */
  nowMs(): number | null;
  seekMs(ms: number): void;
}

const MIN_GAP_MS = 40_000; // ≥ 40 s between pop-ups
const QUIET_START_MS = 10_000; // no pop-up in the first 10 s
const STALE_MS = 30_000; // a card passed by more than this (a skip ahead) goes to the list, not a pop-up
const DUE_SLACK_MS = 500;

/**
 * Cards of one video against the playhead: pops each new idea once (≥ 40 s apart, none in the first 10 s,
 * never over the open list), keeps the "Ideias neste vídeo" list current, opens and jumps to cards.
 */
export class CardTimeline {
  private cards: Card[] = [];
  private handled = new Set<Card>();
  /** Ideas that have appeared so far, by primary node + side: number of mentions. Used to pop each idea once. */
  private ideas = new Map<string, number>();
  /** How many cards were due when the list was last drawn (redraw the open list when it changes). */
  private listDue = -1;
  private queue: Card[] = [];
  private lastPopAt = -Infinity;
  private timer: number | undefined;
  /** Called on the first pop-up (metrics). */
  onFirstRender: () => void = () => {};

  constructor(
    private overlay: Overlay,
    private player: PlayerAdapter,
    /** false while the viewer paused Lastro */
    private active: () => boolean,
    /** true while cards are still streaming in (the empty list says "Analisando…") */
    private analysing: () => boolean = () => false,
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

  add(c: Card): void {
    this.cards.push(c);
    this.cards.sort((a, b) => a.startMs - b.startMs);
  }

  private tick(): void {
    const nowMs = this.player.nowMs();
    if (nowMs === null || !this.active()) return;
    for (const c of this.cards) {
      if (this.handled.has(c) || c.startMs > nowMs + DUE_SLACK_MS) continue;
      const isNew = this.see(c);
      // skipped past it: it is in the list, no pop-up
      if (isNew && nowMs - c.startMs <= STALE_MS) this.queue.push(c);
    }
    // after a seek, drop queued cards that are far behind or ahead of the playhead
    this.queue = this.queue.filter((c) => c.startMs <= nowMs + DUE_SLACK_MS && nowMs - c.startMs <= 4 * STALE_MS);
    if (this.overlay.isListOpen()) {
      if (this.dueCount(nowMs) !== this.listDue) this.openList({ redraw: true });
    } else if (nowMs >= QUIET_START_MS && performance.now() - this.lastPopAt >= MIN_GAP_MS) this.popNext();
    this.overlay.setQueued(this.queue.length);
  }

  /** Mark a card as seen. Returns true if it is the first card of its idea. */
  private see(c: Card): boolean {
    if (this.handled.has(c)) return false;
    this.handled.add(c);
    const key = this.ideaKey(c);
    const n = this.ideas.get(key) ?? 0;
    this.ideas.set(key, n + 1);
    return n === 0;
  }

  private ideaKey(c: Card): string {
    const n = c.nodes[0];
    return n ? `${n.id}:${n.role === "contradicts" ? "con" : "pro"}` : (c.indicator ?? c.quote);
  }

  private mentions(c: Card): number {
    return this.ideas.get(this.ideaKey(c)) ?? 1;
  }

  private dueCount(nowMs: number): number {
    return this.cards.filter((c) => c.startMs <= nowMs + DUE_SLACK_MS).length;
  }

  private popNext(): void {
    const c = this.queue.shift();
    if (!c) return;
    this.lastPopAt = performance.now();
    this.overlay.onSeek = (ms) => this.player.seekMs(ms);
    this.overlay.showCard(c, { mentions: this.mentions(c) });
    this.onFirstRender();
    this.onFirstRender = () => {};
  }

  /** Every card of the video in time order: the ones already passed, then the ones ahead. */
  openList(opts: { redraw?: boolean; focus?: Card } = {}): void {
    const nowMs = this.player.nowMs() ?? 0;
    this.listDue = this.dueCount(nowMs);
    const items = this.cards.map((card) => ({ card, ahead: card.startMs > nowMs + DUE_SLACK_MS }));
    this.overlay.showList(items, nowMs, {
      analysing: this.analysing(),
      redraw: opts.redraw,
      focus: opts.focus,
      onOpen: (card) => this.openCard(card),
      onJump: (card) => this.jumpTo(card),
    });
  }

  /** Seek to a card (1 s early, so the sentence starts on screen); it counts as seen, so it won't pop later. */
  jumpTo(card: Card): void {
    this.player.seekMs(Math.max(0, card.startMs - 1000));
    this.see(card);
    this.queue = this.queue.filter((q) => q !== card);
    this.lastPopAt = performance.now();
  }

  openCard(card: Card): void {
    this.see(card);
    this.queue = this.queue.filter((q) => q !== card); // opened by hand: no need to pop it later
    this.lastPopAt = performance.now(); // and don't auto-pop over it right away
    this.overlay.onSeek = (ms) => this.player.seekMs(ms);
    this.overlay.showCard(card, { mentions: this.mentions(card), onBack: () => this.openList({ focus: card }) });
    this.overlay.setQueued(this.queue.length);
  }
}
