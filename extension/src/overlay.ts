import { compare, fmtDate, fmtNum, INDICATOR_DEFS, type FactResult, type Point } from "../../shared/indicators";
import type { Card, Indicator } from "../../shared/schema";
import { stanceView } from "../../shared/stance";
import { fmtTime } from "../../shared/transcript";

const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 360px; max-width: calc(100vw - 32px);
  font: 14px/1.45 "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #16203A;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.root > * { pointer-events: auto; }
.pill { display: inline-flex; align-items: stretch; background: #10162A; color: #E6E9F2; border-radius: 99px;
  font: 12px/1 ui-monospace, Menlo, monospace; border: 1px solid #3A4466; user-select: none; overflow: hidden; }
.pill button { all: unset; cursor: pointer; padding: 7px 10px; display: inline-flex; align-items: center; gap: 8px; }
.pill button:hover { background: #1B2340; }
.pill button:focus-visible { outline: 2px solid #FFD23F; outline-offset: -2px; }
.pill .sep { width: 1px; background: #3A4466; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #3FD07F; flex: none; }
.pill.paused .dot { background: #F5C431; }
.pill.off .dot { background: #8A93A8; }
.status { opacity: .8; }
.chip { all: unset; background: #10162A; color: #E6E9F2; border-radius: 99px; padding: 5px 10px; font: 12px/1.2 ui-monospace, Menlo, monospace; cursor: pointer; border: 1px solid #3A4466; }
.panel { background: #fff; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.35); width: 100%; border: 1px solid #DADEE6;
  max-height: calc(100vh - 120px); overflow: auto; animation: in .18s ease-out; }
.card { padding: 14px 16px; display: grid; gap: 8px; }
@keyframes in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.badge { font: 500 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em; padding: 4px 7px; border-radius: 4px; background: #E8EEFF; color: #2B55D6; white-space: nowrap; }
.badge.fact { background: #E6F6EC; color: #1B7A43; }
.badge.forecast { background: #FFF4D6; color: #8A6100; }
.verdict { font: 500 11px/1 ui-monospace, Menlo, monospace; padding: 4px 7px; border-radius: 4px; }
.verdict.confere { background: #E6F6EC; color: #1B7A43; }
.verdict.diferente { background: #FDECEA; color: #A3261B; }
.time { font: 12px ui-monospace, Menlo, monospace; color: #5A6378; cursor: pointer; }
.x { all: unset; font-size: 18px; line-height: 1; color: #5A6378; cursor: pointer; padding: 0 2px; }
.back { all: unset; font: 12px ui-monospace, Menlo, monospace; color: #2B55D6; cursor: pointer; }
.lead { font-weight: 600; }
.quote { font-size: 13px; color: #5A6378; border-left: 3px solid #FFD23F; padding: 0 4px 0 8px; overflow-wrap: anywhere; }
.k { font: 11px ui-monospace, Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; color: #5A6378; }
.row { display: grid; gap: 2px; }
.muted { color: #5A6378; font-size: 12.5px; }
.big { font: 600 20px/1.2 "IBM Plex Sans", -apple-system, Arial, sans-serif; font-variant-numeric: tabular-nums; }
.factline { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
a { color: #2B55D6; }
ul { margin: 0; padding-left: 18px; font-size: 13px; }
svg.spark { width: 100%; height: 64px; display: block; }
.list { padding: 8px 0; }
.list h3 { position: sticky; top: 0; background: #fff; z-index: 1; margin: 0; padding: 6px 16px 8px; font: 600 13px/1.3 "IBM Plex Sans", -apple-system, Arial, sans-serif; display: flex; justify-content: space-between; align-items: center; }
.item { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 52px 76px minmax(0, 1fr); gap: 8px; align-items: baseline; padding: 8px 16px; cursor: pointer; width: 100%; }
.item:hover, .item:focus-visible { background: #F4F5F7; }
.entry.open { background: #F7F8FA; box-shadow: inset 3px 0 0 #FFD23F; }
.entry.open .item:hover { background: transparent; }
.entry.open .item .p { -webkit-line-clamp: unset; display: block; }
.chev { font-size: 11px; color: #8A93A8; margin-left: 4px; }
.more { display: grid; gap: 8px; padding: 0 16px 12px 16px; }
.more .quote { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; }
.act { all: unset; font: 12px/1 ui-monospace, Menlo, monospace; border-radius: 99px; padding: 7px 11px; cursor: pointer; border: 1px solid #DADEE6; color: #16203A; background: #fff; }
.act.primary { background: #FFD23F; border-color: #FFD23F; }
.item .t { font: 12px ui-monospace, Menlo, monospace; color: #5A6378; }
.item .badge { justify-self: start; }
.item .s { display: grid; gap: 2px; min-width: 0; }
.item .p { font-size: 13px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.item .w { font-size: 11.5px; color: #5A6378; }
.item.ahead .p { color: #5A6378; }
.item.ahead .t { color: #2B55D6; }
.now { display: flex; align-items: center; gap: 8px; padding: 4px 16px; font: 11px ui-monospace, Menlo, monospace; color: #A3261B; letter-spacing: .06em; }
.now::after { content: ""; flex: 1; border-top: 1px solid #F0B7B1; }
.empty { padding: 8px 16px 12px; color: #5A6378; font-size: 13px; }
.dbg { font: 11px ui-monospace, Menlo, monospace; color: #E6E9F2; background: rgba(16,22,42,.85); padding: 4px 8px; border-radius: 6px; }
@media (max-width: 560px) { .panel { max-height: 55vh; } }
.btn { all: unset; font: 12px/1 ui-monospace, Menlo, monospace; background: #FFD23F; color: #16203A; border-radius: 99px; padding: 7px 11px; cursor: pointer; }
`;

const KIND_LABEL: Record<Card["kind"], string> = { fact: "FATO", theory: "TEORIA", forecast: "PREVISÃO" };
const ROLE_LEAD: Record<string, string> = {
  relies_on: "Esta fala se apoia em",
  echoes: "Esta fala lembra",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Small line chart with one marked point and labels for the first/last date and the marked value. */
export function sparkline(points: Point[], mark: Point | undefined, label: (p: Point) => string, dateLabel: (iso: string) => string): SVGElement {
  const W = 320, H = 64, padX = 4, top = 14, bottom = 14;
  const s = svgEl("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": mark ? label(mark) : "série" });
  if (points.length < 2) return s;
  const vs = points.map((p) => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => (hi === lo ? (top + H - bottom) / 2 : top + ((hi - v) * (H - top - bottom)) / (hi - lo));
  s.append(svgEl("polyline", { fill: "none", stroke: "#2B55D6", "stroke-width": 2, points: points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ") }));
  const font = { "font-size": 10, "font-family": "ui-monospace, Menlo, monospace", fill: "#5A6378" };
  s.append(svgEl("text", { x: padX, y: H - 2, ...font }, dateLabel(points[0].date)));
  s.append(svgEl("text", { x: W - padX, y: H - 2, "text-anchor": "end", ...font }, dateLabel(points[points.length - 1].date)));
  if (mark) {
    const i = points.findIndex((p) => p.date === mark.date);
    if (i >= 0) {
      const cx = x(i), cy = y(mark.value);
      s.append(svgEl("circle", { cx, cy, r: 4, fill: "#FFD23F", stroke: "#16203A", "stroke-width": 1.5 }));
      const anchor = cx > W * 0.7 ? "end" : cx < W * 0.3 ? "start" : "middle";
      s.append(svgEl("text", { x: cx, y: Math.max(10, cy - 7), "text-anchor": anchor, ...font, fill: "#16203A" }, label(mark)));
    }
  }
  return s;
}

/** "O falante afirma que o BC…" → "O BC…": the list has no room for the lead-in. */
export function shortParaphrase(p: string): string {
  const t = p.replace(/^(o|a) (falante|palestrante|entrevistad[oa]|autor[a]?)\s+(afirma|diz|argumenta|sugere|defende|explica|critica|aponta|acredita|observa|propõe)\s+(que\s+)?/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type PillState = "on" | "paused" | "off";
export interface ListItem {
  card: Card;
  /** still ahead of the playhead: clicking jumps there */
  ahead: boolean;
}

export class Overlay {
  private host: HTMLElement;
  private root: HTMLElement;
  private pill: HTMLElement;
  private statusEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private chip: HTMLButtonElement;
  private slot: HTMLElement;
  private dbg: HTMLElement;
  private actionSlot: HTMLElement;
  private mode: "none" | "card" | "list" = "none";
  onPauseClick: () => void = () => {};
  onOpenList: () => void = () => {};
  onSeek: (ms: number) => void = () => {};
  loadFact: (indicator: Indicator, period: string | null) => Promise<FactResult | null> = async () => null;
  loadSeries: (indicator: Indicator, from: string, to: string) => Promise<Point[]> = async () => [];

  constructor() {
    this.host = document.createElement("lastro-overlay");
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root = el("div", "root");
    this.slot = el("div");
    this.slot.style.width = "100%";
    this.actionSlot = el("div");
    this.chip = el("button", "chip");
    this.chip.hidden = true;
    this.chip.onclick = () => this.onOpenList();
    this.dbg = el("div", "dbg");
    this.dbg.hidden = true;

    this.pill = el("div", "pill");
    const main = el("button");
    main.title = "Ver as ideias deste vídeo";
    main.append(el("span", "dot"), el("span", "", "Lastro"));
    this.statusEl = el("span", "status");
    main.append(this.statusEl);
    main.onclick = () => this.toggleList();
    this.pauseBtn = el("button", "", "⏸");
    this.pauseBtn.title = "Pausar o Lastro";
    this.pauseBtn.onclick = () => this.onPauseClick();
    this.pill.append(main, el("span", "sep"), this.pauseBtn);

    this.root.append(this.slot, this.actionSlot, this.chip, this.dbg, this.pill);
    shadow.append(style, this.root);
    document.documentElement.append(this.host);
  }

  setPill(state: PillState, status: string): void {
    this.pill.className = `pill ${state === "on" ? "" : state}`;
    this.statusEl.textContent = `· ${state === "paused" ? "pausado" : state === "off" ? "desligado" : "ligado"}${status ? ` · ${status}` : ""}`;
    this.pauseBtn.textContent = state === "paused" ? "▶" : "⏸";
    this.pauseBtn.title = state === "paused" ? "Retomar o Lastro" : "Pausar o Lastro";
  }

  /** Cards that already appeared but were not popped yet (rate limit). */
  setQueued(n: number): void {
    this.chip.hidden = n <= 0 || this.mode === "list";
    this.chip.textContent = `+${n} ${n === 1 ? "ideia" : "ideias"} até aqui · ver`;
  }

  setDebug(text: string | null): void {
    this.dbg.hidden = !text;
    this.dbg.textContent = text ?? "";
  }

  setAction(label: string | null, onClick?: () => void): void {
    this.actionSlot.replaceChildren();
    if (!label) return;
    const b = el("button", "btn", label);
    b.onclick = () => onClick?.();
    this.actionSlot.append(b);
  }

  isListOpen(): boolean {
    return this.mode === "list";
  }

  hide(): void {
    this.mode = "none";
    this.slot.replaceChildren();
  }

  private toggleList(): void {
    if (this.mode === "list") this.hide();
    else this.onOpenList();
  }

  /**
   * Every card of the video in time order, with an "agora" marker at the playhead.
   * Each row is a teaser; clicking it expands it in place (quote, who disagrees, actions).
   * A live redraw keeps the expanded row and the scroll position.
   */
  showList(
    items: ListItem[],
    nowMs: number,
    opts: { analysing?: boolean; redraw?: boolean; focus?: Card; onOpen: (c: Card) => void; onJump: (c: Card) => void },
  ): void {
    const prevScroll = opts.redraw ? (this.slot.querySelector(".panel.list") as HTMLElement | null)?.scrollTop : undefined;
    if (opts.focus) this.expanded = opts.focus;
    else if (!opts.redraw) this.expanded = null;
    this.mode = "list";
    this.chip.hidden = true;
    const panel = el("div", "panel list");
    if (opts.redraw) panel.style.animation = "none";
    const h = el("h3");
    const passed = items.filter((i) => !i.ahead).length;
    h.append(el("span", "", `Ideias neste vídeo (${items.length}) · ${passed} até agora`));
    const x = el("button", "x", "×");
    x.title = "Fechar";
    x.onclick = () => this.hide();
    h.append(x);
    panel.append(h);
    if (!items.length) panel.append(el("div", "empty", opts.analysing ? "Analisando o vídeo…" : "Nenhuma ideia encontrada neste vídeo."));
    let marker: HTMLElement | null = null;
    let focusEl: HTMLElement | null = null;
    const addMarker = () => {
      marker = el("div", "now", `AGORA · ${fmtTime(nowMs)}`);
      panel.append(marker);
    };
    for (const it of items) {
      if (it.ahead && !marker) addMarker();
      const entry = this.listEntry(it, opts, () => {
        this.expanded = this.expanded === it.card ? null : it.card;
        const keep = panel.scrollTop;
        this.showList(items, nowMs, { ...opts, focus: undefined, redraw: true });
        const p = this.slot.querySelector(".panel.list") as HTMLElement | null;
        if (p) p.scrollTop = keep;
      });
      if (this.expanded === it.card) focusEl = entry;
      panel.append(entry);
    }
    if (items.length && !marker) addMarker();
    this.slot.replaceChildren(panel);
    const center = (e: HTMLElement) =>
      (panel.scrollTop += e.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight / 3);
    if (prevScroll !== undefined) panel.scrollTop = prevScroll;
    else if (opts.focus && focusEl) center(focusEl);
    else if (marker) center(marker); // first open: keep the playhead in view
  }

  private expanded: Card | null = null;

  private listEntry(
    it: ListItem,
    opts: { onOpen: (c: Card) => void; onJump: (c: Card) => void },
    toggle: () => void,
  ): HTMLElement {
    const c = it.card;
    const open = this.expanded === c;
    const entry = el("div", `entry${open ? " open" : ""}`);
    const b = el("button", `item${it.ahead ? " ahead" : ""}`);
    b.title = open ? "Recolher" : "Ver mais";
    b.setAttribute("aria-expanded", String(open));
    const v = stanceView(c);
    const what = v.lead
      ? `${v.lead.role === "contradicts" ? "Vai contra" : v.lead.role === "echoes" ? "Lembra" : "Apoia-se em"} ${v.lead.node.name}`
      : "";
    const s = el("span", "s");
    s.append(el("span", "p", shortParaphrase(c.paraphrase)));
    const w = el("span", "w", what);
    w.append(el("span", "chev", open ? "▴ menos" : "▾ mais"));
    s.append(w);
    b.append(el("span", "t", fmtTime(c.startMs)), el("span", `badge ${c.kind}`, KIND_LABEL[c.kind]), s);
    b.onclick = toggle;
    entry.append(b);
    if (!open) return entry;

    const more = el("div", "more");
    more.append(el("div", "quote", `“${c.quote}”`));
    if (v.disagree.length) {
      const d = el("div", "muted");
      d.append(el("span", "k", "Quem discorda  "), document.createTextNode(v.disagree.map((x) => x.node.name).join(" · ")));
      more.append(d);
    }
    const acts = el("div", "acts");
    const jump = el("button", `act${it.ahead ? " primary" : ""}`, `▶ ${it.ahead ? "Ir para" : "Rever"} ${fmtTime(c.startMs)}`);
    jump.onclick = () => opts.onJump(c);
    const full = el("button", `act${it.ahead ? "" : " primary"}`, "Abrir cartão completo");
    full.onclick = () => opts.onOpen(c);
    acts.append(jump, full);
    more.append(acts);
    entry.append(more);
    return entry;
  }

  showCard(c: Card, opts: { mentions?: number; onBack?: () => void } = {}): void {
    this.mode = "card";
    const panel = el("div", "panel");
    const card = el("div", "card");
    card.dataset.testid = "lastro-card";
    panel.append(card);
    const top = el("div", "top");
    const left = el("div");
    left.style.cssText = "display:flex;gap:8px;align-items:center";
    if (opts.onBack) {
      const back = el("button", "back", "← ideias");
      back.onclick = opts.onBack;
      left.append(back);
    }
    const time = el("span", "time", `▶ ${fmtTime(c.startMs)}${(opts.mentions ?? 1) > 1 ? ` · ${opts.mentions} menções` : ""}`);
    time.title = "Voltar a este trecho do vídeo";
    time.onclick = () => this.onSeek(c.startMs);
    left.append(el("span", `badge ${c.kind}`, KIND_LABEL[c.kind]), time);
    const x = el("button", "x", "×");
    x.title = "Recolher (reabra pelo botão Lastro)";
    x.onclick = () => this.hide();
    top.append(left, x);
    card.append(top);

    const v = stanceView(c);
    if (v.lead) {
      const lead = el("div");
      if (v.lead.role === "contradicts") {
        lead.append(el("span", "lead", `Esta fala vai contra ${v.lead.node.name}.`), document.createTextNode(` Essa visão diz: ${v.lead.node.summary}`));
      } else {
        lead.append(el("span", "lead", `${ROLE_LEAD[v.lead.role]} ${v.lead.node.name}.`), document.createTextNode(` ${v.lead.node.summary}`));
      }
      card.append(lead);
    } else {
      card.append(el("div", "lead", c.paraphrase));
    }
    card.append(el("div", "quote", `“${c.quote}”`));

    if (c.kind === "fact" && c.indicator) card.append(this.factBlock(c));

    const row = (label: string, body: string | Node) => {
      const r = el("div", "row");
      r.append(el("span", "k", label), typeof body === "string" ? el("span", "", body) : body);
      card.append(r);
      return r;
    };
    if (v.disagree.length) {
      row("Quem discorda desta fala", v.disagree.map((o) => `${o.node.name}${o.note ? `: ${o.note}` : ""}`).join(" · "));
    }
    if (v.tested.length) {
      const r = row("Já foi testado?", v.tested.map((t) => `${t.node.name}${t.note ? `: ${t.note}` : ""}`).join(" · "));
      const ep = v.tested.find((t) => t.node.series)?.node;
      if (ep?.series) this.episodeChart(r, ep.series);
    }
    const refs = [
      ...v.readSpeaker.slice(0, 2).map((r) => `${r.title} (para entender esta fala)`),
      ...v.readOpposing.slice(0, 2).map((r) => `${r.title} (visão contrária)`),
    ];
    if (refs.length) {
      const ul = el("ul");
      for (const t of refs) ul.append(el("li", "", t));
      row("Para ir além", ul);
    }
    this.slot.replaceChildren(panel);
  }

  private factBlock(c: Card): HTMLElement {
    const r = el("div", "row");
    r.append(el("span", "k", "Dado oficial"));
    const body = el("div", "muted", "consultando…");
    r.append(body);
    const indicator = c.indicator as Indicator;
    const def = INDICATOR_DEFS[indicator];
    this.loadFact(indicator, c.period ?? null)
      .then((f) => {
        if (!f) {
          body.textContent = "sem dado oficial para esse período";
          return;
        }
        body.className = "";
        body.replaceChildren();
        const line = el("div", "factline");
        line.append(el("span", "big", fmtNum(f.value, f.unit)), el("span", "muted", `${f.label}, ${f.periodLabel}`));
        body.append(line);
        const verdict = compare(c.claimed_value, f.value);
        if (verdict && c.claimed_value !== null) {
          const vline = el("div", "factline");
          vline.append(el("span", `verdict ${verdict}`, verdict), el("span", "muted", `valor citado no vídeo: ${fmtNum(c.claimed_value, f.unit)}`));
          body.append(vline);
        }
        const mark = f.series.find((p) => p.date === f.date);
        body.append(sparkline(f.series, mark, (p) => fmtNum(p.value, f.unit), (d) => fmtDate(d, def.freq === "daily" ? "monthly" : def.freq)));
        const src = el("a", "muted", `Fonte: ${f.source}`);
        src.href = f.sourceUrl;
        src.target = "_blank";
        src.rel = "noopener";
        body.append(src);
      })
      .catch(() => {
        body.textContent = "não foi possível consultar a fonte oficial agora";
      });
    return r;
  }

  private episodeChart(row: HTMLElement, series: { indicator: string; from: string; to: string; mark?: "min" | "max" }): void {
    const indicator = series.indicator as Indicator;
    const def = INDICATOR_DEFS[indicator];
    if (!def) return;
    this.loadSeries(indicator, series.from, series.to)
      .then((pts) => {
        if (pts.length < 2) return;
        const pick = series.mark === "max" ? Math.max(...pts.map((p) => p.value)) : Math.min(...pts.map((p) => p.value));
        const mark = pts.find((p) => p.value === pick);
        row.append(sparkline(pts, mark, (p) => fmtNum(p.value, def.unit), (d) => fmtDate(d, def.freq === "daily" ? "monthly" : def.freq)));
        row.append(el("span", "muted", `${def.label} · Fonte: ${def.source}`));
      })
      .catch(() => {});
  }
}
