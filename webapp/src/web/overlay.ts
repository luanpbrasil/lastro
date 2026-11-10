import { fmtTime } from "../../../shared/transcript";
import type { StoredCard } from "../types";
import { el, fullCard, kindLabel, stanceLine, titleOf } from "./cardview";
import { t } from "./i18n";

/**
 * The extension's overlay (extension/src/overlay.ts), over this page's player: a pill to open the list or pause
 * pop-ups, one card at a time, and every idea in order with a "Now" line. Navigation is flat: a list row opens its
 * card in one click; a card steps to the previous or next idea (buttons or ← →) and goes back to the list.
 * Styles live in style.css (.ov-*), so the landing page's screenshots use exactly the same parts.
 */

export type PillState = "on" | "paused";
export interface ListItem {
  card: StoredCard;
  /** still ahead of the playhead */
  ahead: boolean;
}
interface ListOptions {
  analysing?: boolean;
  redraw?: boolean;
  onOpen: (c: StoredCard) => void;
  onJump: (c: StoredCard) => void;
}
export interface CardNav {
  /** 1-based position among the video's cards, in time order */
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onList: () => void;
  mentions?: number;
  /** Opened by the viewer (from the list or by stepping), not popped: pop-ups wait until it is closed. */
  manual?: boolean;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function iconButton(cls: string, text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", cls, text);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.onclick = onClick;
  return b;
}

export class Overlay {
  private slot = el("div", "ov-slot");
  private chip = el("button", "ov-chip");
  private pill = el("div", "ov-pill");
  private statusEl = el("span", "ov-status");
  private pauseBtn = el("button", "ov-pause");
  private mode: "none" | "card" | "list" = "none";
  private nav: CardNav | null = null;
  onPauseClick: () => void = () => {};
  onOpenList: () => void = () => {};
  onSeek: (ms: number) => void = () => {};

  constructor(private root: HTMLElement) {
    root.classList.add("ov");
    this.chip.type = "button";
    this.chip.hidden = true;
    this.chip.onclick = () => this.onOpenList();
    const main = el("button", "ov-main");
    main.type = "button";
    main.title = t("pill.title");
    main.append(el("span", "ov-dot"), el("span", "ov-name", "Lastro"), this.statusEl);
    main.onclick = () => (this.mode === "list" ? this.hide() : this.onOpenList());
    this.pauseBtn.type = "button";
    this.pauseBtn.onclick = () => this.onPauseClick();
    this.pill.append(main, el("span", "ov-sep"), this.pauseBtn);
    // The chip sits beside the pill, so its coming and going never moves the panel above.
    const dock = el("div", "ov-dock");
    dock.append(this.chip, this.pill);
    root.replaceChildren(this.slot, dock);
    // ← → step through the cards and Esc closes, while focus is in the overlay.
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.mode !== "none") {
        this.hide();
        main.focus();
      } else if (this.mode === "card" && e.key === "ArrowLeft" && this.nav?.onPrev) this.nav.onPrev();
      else if (this.mode === "card" && e.key === "ArrowRight" && this.nav?.onNext) this.nav.onNext();
      else return;
      e.preventDefault();
    });
    this.setPill("on", "");
  }

  setPill(state: PillState, status: string): void {
    this.pill.classList.toggle("paused", state === "paused");
    this.statusEl.textContent = state === "paused" ? `· ${t("pill.paused")}` : status ? `· ${status}` : "";
    this.pauseBtn.textContent = state === "paused" ? "▶" : "❚❚";
    this.pauseBtn.title = state === "paused" ? t("pill.resume") : t("pill.pause");
    this.pauseBtn.setAttribute("aria-label", this.pauseBtn.title);
  }

  /** Ideas that came up but haven't popped yet (one pop-up every 20 s at most). */
  setQueued(n: number): void {
    this.chip.hidden = n <= 0 || this.mode === "list";
    this.chip.textContent = t("chip.queued", { n });
  }

  isListOpen(): boolean {
    return this.mode === "list";
  }

  /** The viewer is reading: the list, or a card they opened themselves. Pop-ups wait. */
  isBusy(): boolean {
    return this.mode === "list" || (this.mode === "card" && !!this.nav?.manual);
  }

  /**
   * The panel stays while it is open; its views slide. Forward (list → card, ›) the new view comes in from the
   * right and the old one leaves to the left; back (card → list, ‹) the other way. A live redraw swaps in place.
   */
  private panel: HTMLElement | null = null;
  private view: HTMLElement | null = null;
  private listScroll: number | null = null;

  private swap(next: HTMLElement, dir: "forward" | "back" | "none"): void {
    next.classList.add("ov-view");
    if (reducedMotion()) dir = "none";
    if (!this.panel || !this.panel.isConnected) {
      // Opening: the panel itself appears, once.
      this.panel = el("div", "ov-panel");
      this.panel.append(next);
      this.slot.replaceChildren(this.panel);
      this.view = next;
      return;
    }
    this.panel.classList.remove("closing");
    const prev = this.view;
    this.view = next;
    // Views still leaving from a quick earlier step go at once, so at most two are ever on screen.
    for (const old of this.panel.querySelectorAll(".ov-view.leaving")) old.remove();
    if (!prev || dir === "none") {
      prev?.remove();
      this.panel.append(next);
      return;
    }
    prev.classList.add("leaving", `to-${dir}`);
    prev.setAttribute("aria-hidden", "true");
    prev.inert = true;
    next.classList.add(`from-${dir}`);
    this.panel.append(next);
    const done = () => prev.remove();
    prev.addEventListener("animationend", done, { once: true });
    window.setTimeout(done, 450); // reduced motion (no animation) or an interrupted one
    next.addEventListener("animationend", () => next.classList.remove(`from-${dir}`), { once: true });
  }

  hide(): void {
    this.mode = "none";
    this.nav = null;
    const panel = this.panel;
    this.panel = null;
    this.view = null;
    this.listScroll = null;
    if (!panel) return;
    if (reducedMotion()) {
      panel.remove();
      return;
    }
    // Closing: the panel fades and settles down, then goes.
    panel.classList.add("closing");
    const done = () => {
      if (panel.classList.contains("closing")) panel.remove();
    };
    panel.addEventListener("animationend", done, { once: true });
    window.setTimeout(done, 400);
  }

  /** One card, with a bar to go back to the list and step to the previous or next idea. */
  showCard(c: StoredCard, nav: CardNav): void {
    // Stepping with ‹ › swaps the card: keep the focus on the same arrow, so stepping and the keys keep working.
    const active = document.activeElement as HTMLElement | null;
    const refocus = active && this.root.contains(active) ? active.dataset.dir : undefined;
    const from = this.mode;
    const fromIndex = this.nav?.index ?? 0;
    if (from === "list") this.listScroll = this.view?.querySelector<HTMLElement>(".ov-rows")?.scrollTop ?? null;
    this.mode = "card";
    this.nav = nav;
    this.chip.hidden = true;
    const view = el("div", "ov-view-card");
    const bar = el("div", "ov-bar");
    const all = el("button", "ov-all", `☰ ${t("nav.all")}`);
    all.type = "button";
    all.onclick = nav.onList;
    const steps = el("div", "ov-steps");
    const prev = iconButton("ov-step", "‹", t("nav.prev"), () => nav.onPrev?.());
    prev.dataset.dir = "prev";
    prev.disabled = !nav.onPrev;
    const next = iconButton("ov-step", "›", t("nav.next"), () => nav.onNext?.());
    next.dataset.dir = "next";
    next.disabled = !nav.onNext;
    steps.append(prev, el("span", "ov-pos", t("nav.position", { i: nav.index, n: nav.total })), next);
    bar.append(all, steps, iconButton("ov-x", "×", t("close"), () => this.hide()));
    // Where this idea sits in the video's sequence.
    const progress = el("div", "ov-progress");
    const fill = el("i");
    const target = `${(100 * nav.index) / Math.max(1, nav.total)}%`;
    // Stepping from another card: the line grows or shrinks from where it was.
    fill.style.width = from === "card" && fromIndex ? `${(100 * fromIndex) / Math.max(1, nav.total)}%` : target;
    if (fill.style.width !== target) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = target)));
    progress.append(fill);
    const body = el("div", "ov-scroll");
    body.append(fullCard(c, (ms) => this.onSeek(ms), nav.mentions));
    view.append(bar, progress, body);
    this.swap(view, from === "card" ? (nav.index < fromIndex ? "back" : "forward") : from === "list" ? "forward" : "forward");
    if (refocus === "prev") (prev.disabled ? next : prev).focus();
    else if (refocus === "next") (next.disabled ? prev : next).focus();
  }

  /** Every card in time order, with a "Now" line at the playhead. A live redraw keeps the scroll position. */
  showList(items: ListItem[], nowMs: number, opts: ListOptions): void {
    const from = this.mode;
    const keepScroll = from === "list" ? this.view?.querySelector<HTMLElement>(".ov-rows")?.scrollTop : from === "card" ? this.listScroll : undefined;
    this.mode = "list";
    this.nav = null;
    this.chip.hidden = true;
    const view = el("div", "ov-view-list");
    const head = el("div", "ov-bar");
    const title = el("h3");
    const passed = items.filter((i) => !i.ahead).length;
    title.append(document.createTextNode(t("list.title")), el("span", "ov-count", t("list.count", { n: items.length, passed })));
    head.append(title, iconButton("ov-x", "×", t("close"), () => this.hide()));
    const rows = el("div", "ov-rows");
    view.append(head, rows);
    if (!items.length) rows.append(el("p", "ov-empty", opts.analysing ? t("list.analysing") : t("list.empty")));

    let marker: HTMLElement | null = null;
    const addMarker = () => {
      marker = el("div", "ov-now", t("list.now", { t: fmtTime(nowMs) }));
      rows.append(marker);
    };
    // The idea just played: the last one before the playhead.
    const current = items.reduce((last, it, i) => (it.ahead ? last : i), -1);
    items.forEach((it, i) => {
      if (it.ahead && !marker) addMarker();
      const r = this.row(it, opts);
      if (i === current) r.classList.add("current");
      rows.append(r);
    });
    if (items.length && !marker) addMarker();
    // A live redraw swaps in place; coming back from a card slides back; from the pill the panel opens.
    this.swap(view, from === "list" ? "none" : "back");
    if (keepScroll !== undefined && keepScroll !== null) rows.scrollTop = keepScroll;
    else if (marker) rows.scrollTop += (marker as HTMLElement).getBoundingClientRect().top - rows.getBoundingClientRect().top - rows.clientHeight / 3;
  }

  /** A list row: the time jumps the video there; the rest opens the card. */
  private row(it: ListItem, opts: ListOptions): HTMLElement {
    const c = it.card;
    const row = el("div", `ov-row is-${c.kind}${it.ahead ? " ahead" : ""}`);
    const time = el("button", "ov-row-time", fmtTime(c.startMs));
    time.type = "button";
    time.title = t("list.jump", { t: fmtTime(c.startMs) });
    time.onclick = () => opts.onJump(c);
    const open = el("button", "ov-row-open");
    open.type = "button";
    const meta = el("span", "ov-row-meta");
    meta.append(el("span", `kind ${c.kind}`, kindLabel(c.kind)));
    const stance = stanceLine(c);
    if (stance) meta.append(el("span", "ov-row-stance", stance));
    open.append(meta, el("span", "ov-row-title", titleOf(c)), el("span", "ov-row-go", "›"));
    open.onclick = () => opts.onOpen(c);
    row.append(time, open);
    return row;
  }
}
