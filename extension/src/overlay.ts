import type { Card } from "../../shared/schema";
import { stanceView } from "../../shared/stance";
import { fmtTime } from "../../shared/transcript";

const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 360px; max-width: calc(100vw - 32px);
  font: 14px/1.45 "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #16203A;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.root > * { pointer-events: auto; }
.pill { display: inline-flex; align-items: center; gap: 8px; background: #10162A; color: #E6E9F2; border-radius: 99px;
  padding: 6px 12px; font: 12px/1 ui-monospace, Menlo, monospace; cursor: pointer; border: 1px solid #3A4466; user-select: none; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #3FD07F; }
.pill.paused .dot { background: #F5C431; }
.pill.off .dot { background: #8A93A8; }
.status { opacity: .8; }
.chip { background: #10162A; color: #E6E9F2; border-radius: 99px; padding: 4px 10px; font: 12px/1.2 ui-monospace, Menlo, monospace; cursor: pointer; border: 1px solid #3A4466; }
.card { background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 12px 32px rgba(0,0,0,.35); width: 100%;
  display: grid; gap: 8px; border: 1px solid #DADEE6; animation: in .18s ease-out; }
@keyframes in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.badge { font: 500 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em; padding: 4px 7px; border-radius: 4px; background: #E8EEFF; color: #2B55D6; }
.badge.fact { background: #E6F6EC; color: #1B7A43; }
.badge.forecast { background: #FFF4D6; color: #8A6100; }
.time { font: 12px ui-monospace, Menlo, monospace; color: #5A6378; cursor: pointer; }
.x { border: 0; background: none; font-size: 18px; line-height: 1; color: #5A6378; cursor: pointer; padding: 0 2px; }
.lead { font-weight: 600; }
.quote { font-size: 13px; color: #5A6378; border-left: 3px solid #FFD23F; padding: 0 4px 0 8px; overflow-wrap: anywhere; }
.k { font: 11px ui-monospace, Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; color: #5A6378; }
.row { display: grid; gap: 2px; }
ul { margin: 0; padding-left: 18px; font-size: 13px; }
.dbg { font: 11px ui-monospace, Menlo, monospace; color: #E6E9F2; background: rgba(16,22,42,.85); padding: 4px 8px; border-radius: 6px; }
.btn { font: 12px/1 ui-monospace, Menlo, monospace; background: #FFD23F; color: #16203A; border: 0; border-radius: 99px; padding: 6px 10px; cursor: pointer; }
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

export type PillState = "on" | "paused" | "off";

export class Overlay {
  private host: HTMLElement;
  private root: HTMLElement;
  private pill: HTMLElement;
  private statusEl: HTMLElement;
  private chip: HTMLElement;
  private cardSlot: HTMLElement;
  private dbg: HTMLElement;
  private actionSlot: HTMLElement;
  onPillClick: () => void = () => {};
  onSeek: (ms: number) => void = () => {};
  onChipClick: () => void = () => {};

  constructor() {
    this.host = document.createElement("lastro-overlay");
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root = el("div", "root");
    this.cardSlot = el("div");
    this.cardSlot.style.width = "100%";
    this.actionSlot = el("div");
    this.chip = el("div", "chip");
    this.chip.hidden = true;
    this.chip.onclick = () => this.onChipClick();
    this.dbg = el("div", "dbg");
    this.dbg.hidden = true;
    this.pill = el("div", "pill");
    this.pill.append(el("span", "dot"), el("span", "", "Lastro"));
    this.statusEl = el("span", "status");
    this.pill.append(this.statusEl);
    this.pill.title = "Clique para pausar ou retomar";
    this.pill.onclick = () => this.onPillClick();
    this.root.append(this.cardSlot, this.actionSlot, this.chip, this.dbg, this.pill);
    shadow.append(style, this.root);
    document.documentElement.append(this.host);
  }

  setPill(state: PillState, status: string): void {
    this.pill.className = `pill ${state === "on" ? "" : state}`;
    this.statusEl.textContent = `· ${state === "paused" ? "pausado" : state === "off" ? "desligado" : "ligado"}${status ? ` · ${status}` : ""}`;
  }

  setQueued(n: number): void {
    this.chip.hidden = n <= 0;
    this.chip.textContent = `+${n} ${n === 1 ? "ideia" : "ideias"} neste vídeo`;
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

  hideCard(): void {
    this.cardSlot.replaceChildren();
  }

  showCard(c: Card, mentions = 1): void {
    const card = el("div", "card");
    card.dataset.testid = "lastro-card";
    const top = el("div", "top");
    const badge = el("span", `badge ${c.kind}`, KIND_LABEL[c.kind]);
    const time = el("span", "time", `▶ ${fmtTime(c.startMs)}${mentions > 1 ? ` · ${mentions} menções` : ""}`);
    time.title = "Voltar a este trecho";
    time.onclick = () => this.onSeek(c.startMs);
    const x = el("button", "x", "×");
    x.title = "Recolher";
    x.onclick = () => this.hideCard();
    const left = el("div");
    left.style.display = "flex";
    left.style.gap = "8px";
    left.style.alignItems = "center";
    left.append(badge, time);
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

    const row = (label: string, text: string) => {
      const r = el("div", "row");
      r.append(el("span", "k", label), el("span", "", text));
      card.append(r);
    };
    if (v.disagree.length) {
      row("Quem discorda desta fala", v.disagree.map((o) => `${o.node.name}${o.note ? `: ${o.note}` : ""}`).join(" · "));
    }
    if (v.tested.length) {
      row("Já foi testado?", v.tested.map((t) => `${t.node.name}${t.note ? `: ${t.note}` : ""}`).join(" · "));
    }
    const refs = [
      ...v.readSpeaker.slice(0, 2).map((r) => `${r.title} (para entender esta fala)`),
      ...v.readOpposing.slice(0, 2).map((r) => `${r.title} (visão contrária)`),
    ];
    if (refs.length) {
      const r = el("div", "row");
      r.append(el("span", "k", "Para ir além"));
      const ul = el("ul");
      for (const t of refs) ul.append(el("li", "", t));
      r.append(ul);
      card.append(r);
    }
    if (c.kind === "fact" && c.indicator) {
      const r = el("div", "row");
      r.append(el("span", "k", "Dado oficial"));
      r.append(el("span", "", `${c.indicator}${c.claimed_value !== null ? ` · valor citado: ${c.claimed_value}` : ""} · consulta ao BCB/IBGE: próxima etapa`));
      card.append(r);
    }
    this.cardSlot.replaceChildren(card);
  }
}
