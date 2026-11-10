import { fmtNum } from "../../../shared/indicators";
import { stanceView } from "../../../shared/stance";
import { fmtTime } from "../../../shared/transcript";
import type { StoredCard } from "../types";

const KIND_LABEL: Record<StoredCard["kind"], string> = { fact: "FATO", theory: "TEORIA", forecast: "PREVISÃO" };
const ROLE_LEAD = { relies_on: "Esta fala se apoia em", echoes: "Esta fala lembra", contradicts: "Esta fala vai contra" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function labelled(label: string, body: string | Node): HTMLElement {
  const r = el("div", "row");
  r.append(el("span", "k", label), typeof body === "string" ? el("span", "", body) : body);
  return r;
}

function factBlock(card: StoredCard): HTMLElement {
  const official = card.check?.official;
  if (!official) return labelled("Dado oficial", "não foi possível consultar a fonte oficial para esse período");
  const body = el("div");
  const line = el("div", "factline");
  line.append(el("span", "big", fmtNum(official.value, official.unit)), el("span", "muted", `${official.label}, ${official.periodLabel}`));
  body.append(line);
  const verdict = card.check?.verdict;
  if (verdict && card.claimed_value !== null) {
    const v = el("div", "factline");
    v.append(el("span", `verdict ${verdict}`, verdict), el("span", "muted", `valor citado no vídeo: ${fmtNum(card.claimed_value, official.unit)}`));
    body.append(v);
  }
  // Only official https links: never let stored data turn into a javascript: or other link.
  if (/^https:\/\/[^\s]+$/.test(official.sourceUrl)) {
    const src = el("a", "muted", `Fonte: ${official.source}`);
    src.href = official.sourceUrl;
    src.target = "_blank";
    src.rel = "noopener noreferrer";
    body.append(src);
  }
  return labelled("Dado oficial", body);
}

function renderCard(card: StoredCard, onSeek: (ms: number) => void): HTMLElement {
  const article = el("article", "card");
  const top = el("div", "top");
  const time = el("button", "time", `▶ ${fmtTime(card.startMs)}`);
  time.type = "button";
  time.title = "Ir para este trecho do vídeo";
  time.onclick = () => onSeek(card.startMs);
  top.append(el("span", `badge ${card.kind}`, KIND_LABEL[card.kind]), time);
  article.append(top);

  const v = stanceView(card);
  if (v.lead) article.append(el("p", "lead", `${ROLE_LEAD[v.lead.role]} ${v.lead.node.name}.`));
  article.append(el("p", "paraphrase", card.paraphrase), el("blockquote", "quote", `“${card.quote}”`));
  if (card.kind === "fact" && card.indicator) article.append(factBlock(card));
  if (v.disagree.length) article.append(labelled("Quem discorda desta fala", v.disagree.map((o) => o.node.name).join(" · ")));
  if (v.tested.length) article.append(labelled("Já foi testado?", v.tested.map((t) => `${t.node.name}${t.note ? `: ${t.note}` : ""}`).join(" · ")));
  const refs = [...v.readSpeaker.slice(0, 2).map((r) => `${r.title} (para entender esta fala)`), ...v.readOpposing.slice(0, 2).map((r) => `${r.title} (visão contrária)`)];
  if (refs.length) {
    const ul = el("ul");
    for (const t of refs) ul.append(el("li", "", t));
    article.append(labelled("Para ir além", ul));
  }
  return article;
}

/** The side panel: every card of the video in time order. */
export class CardList {
  private cards: StoredCard[] = [];

  constructor(
    private box: HTMLElement,
    private count: HTMLElement,
    private onSeek: (ms: number) => void,
  ) {}

  clear(): void {
    this.cards = [];
    this.box.replaceChildren();
    this.count.textContent = "";
  }

  add(cards: StoredCard[], followEnd: boolean): void {
    if (!cards.length) return;
    this.cards.push(...cards);
    this.cards.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
    this.box.replaceChildren(...this.cards.map((c) => renderCard(c, this.onSeek)));
    this.count.textContent = `(${this.cards.length})`;
    if (followEnd) this.box.scrollTop = this.box.scrollHeight;
  }

  get size(): number {
    return this.cards.length;
  }
}
