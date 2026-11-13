import { INDICATOR_DEFS } from "../../../shared/indicators";
import type { Indicator } from "../../../shared/schema";
import { stanceView } from "../../../shared/stance";
import { fmtTime } from "../../../shared/transcript";
import type { PostCard, StoredCard } from "../types";
import { intlLocale, locale, t } from "./i18n";

/**
 * How one card is drawn, adapted from the extension's overlay (extension/src/overlay.ts): labels in the
 * interface language around the model's text, which is in the language of the video.
 */

export const kindLabel = (kind: StoredCard["kind"]) => t(`kind.${kind}`);

/** English names for the official series; in Portuguese the series keep their names from shared/indicators.ts. */
const INDICATOR_EN: Record<Indicator, string> = {
  selic_meta: "Selic target",
  ipca_12m: "IPCA inflation, 12 months",
  ipca_mensal: "IPCA inflation, month",
  desemprego: "Unemployment rate (PNAD Contínua)",
  pib_tri: "GDP, change in the quarter",
  dbgg_pib: "General government gross debt",
  dlsp_pib: "Public sector net debt",
  cambio_usd: "US dollar (PTAX, selling rate)",
  focus_selic: "Year-end Selic expected (Focus survey)",
};
const indicatorName = (i: Indicator, fallback: string) => (locale === "pt" ? (INDICATOR_DEFS[i]?.label ?? fallback) : (INDICATOR_EN[i] ?? fallback));
const UNIT_EN: Record<string, string> = { "% a.a.": "% a year", "% do PIB": "% of GDP" };
const UNIT_PT: Record<string, string> = { "% a.a.": "% ao ano", "% do PIB": "% do PIB" };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function fmtValue(v: number, unit: string): string {
  const money = unit === "R$";
  const s = v.toLocaleString(intlLocale, { maximumFractionDigits: money ? 4 : 2, minimumFractionDigits: money ? 2 : 0 });
  if (money) return `R$ ${s}`;
  const units = locale === "pt" ? UNIT_PT : UNIT_EN;
  return unit.startsWith("%") ? `${s}${units[unit] ?? unit}` : `${s} ${unit}`;
}

type Freq = "daily" | "monthly" | "quarterly" | "annual";
const freqOf = (indicator: Indicator): Freq => INDICATOR_DEFS[indicator]?.freq ?? "daily";
const monthName = (m: number) => new Date(Date.UTC(2000, m - 1, 15)).toLocaleString(intlLocale, { month: "short", timeZone: "UTC" }).replace(".", "");

/** "2012-10-01" → "Oct 2012" / "out 2012" (monthly), "Q3 2026" / "3º tri 2026" (quarterly), "10 Oct 2012" (daily). */
function fmtDate(isoDate: string, freq: Freq, short = false): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (freq === "quarterly") return locale === "pt" ? `${Math.floor((m - 1) / 3) + 1}º tri ${y}` : `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (freq === "monthly" || short) return `${monthName(m)} ${y}`;
  return `${d} ${monthName(m)} ${y}`;
}

/**
 * A short title for a list row: the model's headline, or for older cards the paraphrase without its lead-in
 * ("The speaker argues that rates…" → "Rates…").
 */
export function titleOf(card: StoredCard): string {
  if (card.headline) return card.headline;
  const p = card.paraphrase
    .replace(/^the (speaker|guest|host|interviewee|presenter|narrator)s?\s+(says|argues|claims|states|suggests|believes|notes|explains|criticises|criticizes|proposes|points out|warns|predicts|asserts|mentions|cites|questions|defends|recalls|stresses)\s+(that\s+)?/i, "")
    .replace(/^(o|a) (falante|palestrante|entrevistad[oa]|autor[a]?)\s+(afirma|diz|argumenta|sugere|defende|explica|critica|aponta|acredita|observa|propõe)\s+(que\s+)?/i, "");
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** "Builds on MMT" / "Apoia-se em MMT": the idea behind a card, or "" when it has none. */
export function stanceLine(card: StoredCard): string {
  const v = stanceView(card);
  return v.lead ? t(`role.${v.lead.role}`, { name: v.lead.node.name }) : "";
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Small line chart with the card's value marked and labels for the first and last date. Colours come from CSS. */
export function sparkline(points: { date: string; value: number }[], markDate: string, label: (v: number) => string, dateLabel: (iso: string) => string): SVGElement {
  const W = 320, H = 72, padX = 4, top = 18, bottom = 16;
  const s = svgEl("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, role: "img" });
  if (points.length < 2) return s;
  const vs = points.map((p) => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => (hi === lo ? (top + H - bottom) / 2 : top + ((hi - v) * (H - top - bottom)) / (hi - lo));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  s.append(svgEl("path", { class: "spark-area", d: `${d} L${x(points.length - 1).toFixed(1)},${H - bottom} L${x(0).toFixed(1)},${H - bottom} Z` }));
  s.append(svgEl("path", { class: "spark-line", d }));
  s.append(svgEl("text", { class: "spark-label", x: padX, y: H - 3 }, dateLabel(points[0].date)));
  s.append(svgEl("text", { class: "spark-label", x: W - padX, y: H - 3, "text-anchor": "end" }, dateLabel(points[points.length - 1].date)));
  // The marked point: the one on the card's date, or the closest before it.
  let i = points.findIndex((p) => p.date === markDate);
  if (i < 0) i = points.reduce((best, p, k) => (p.date <= markDate ? k : best), points.length - 1);
  const cx = x(i), cy = y(points[i].value);
  s.append(svgEl("circle", { class: "spark-mark", cx, cy, r: 4 }));
  const anchor = cx > W * 0.7 ? "end" : cx < W * 0.3 ? "start" : "middle";
  s.append(svgEl("text", { class: "spark-value", x: cx, y: Math.max(11, cy - 8), "text-anchor": anchor }, label(points[i].value)));
  s.setAttribute("aria-label", `${label(points[i].value)}, ${dateLabel(points[i].date)}`);
  return s;
}

function section(label: string, ...body: (string | Node)[]): HTMLElement {
  const r = el("div", "row");
  r.append(el("span", "k", label));
  for (const b of body) r.append(typeof b === "string" ? el("p", "", b) : b);
  return r;
}

function factBlock(card: StoredCard | PostCard): HTMLElement | null {
  if (card.kind !== "fact") return null;
  const official = card.check?.official;
  if (!("startMs" in card) && !official) return section(t("card.official"), el("p", "muted", t("post.unchecked")));
  if (!card.indicator) return card.claimed_value !== null ? section(t("card.official"), el("p", "muted", t("card.notChecked"))) : null;
  if (!official) return section(t("card.official"), el("p", "muted", t("card.officialMissing")));
  const indicator = card.indicator;
  const freq = freqOf(indicator);
  const body = el("div", "fact-block");
  const line = el("div", "factline");
  const when = fmtDate(official.date, freq);
  line.append(el("span", "big", fmtValue(official.value, official.unit)), el("span", "muted", `${indicatorName(indicator, official.label)}, ${official.periodLabel.startsWith("mais recente") ? t("card.latest", { when }) : when}`));
  body.append(line);
  const verdict = card.check?.verdict;
  if (verdict && card.claimed_value !== null) {
    const v = el("div", "factline");
    const badge = el("span", `verdict ${verdict}`);
    badge.append(el("span", "v-icon", verdict === "confere" ? "✓" : "≠"), document.createTextNode(t(`verdict.${verdict}`)));
    v.append(badge, el("span", "muted", t("card.quoted", { v: fmtValue(card.claimed_value, official.unit) })));
    body.append(v);
  }
  if (official.series && official.series.length > 1) {
    body.append(sparkline(official.series, official.date, (v) => fmtValue(v, official.unit), (d) => fmtDate(d, freq, true)));
  }
  // Only official https links: never let stored data turn into a javascript: or other link.
  if (/^https:\/\/[^\s]+$/.test(official.sourceUrl)) {
    const src = el("a", "muted source", t("card.source", { s: official.source }));
    src.href = official.sourceUrl;
    src.target = "_blank";
    src.rel = "noopener noreferrer";
    body.append(src);
  }
  return section(t("card.official"), body);
}

/**
 * The full card, in reading order: what was said (paraphrase and exact quote), the idea behind it, the official
 * figure, who disagrees, whether it was tested, what to read. Navigation around it is the overlay's.
 */
export function fullCard(card: StoredCard | PostCard, onSeek?: (ms: number) => void, mentions = 1): HTMLElement {
  const box = el("article", "ov-card");
  const meta = el("div", "ov-meta");
  meta.append(el("span", `kind ${card.kind}`, kindLabel(card.kind)));
  if (mentions > 1) meta.append(el("span", "ov-mentions", t("card.mentions", { n: mentions })));
  if ("startMs" in card && onSeek) {
    const time = el("button", "ov-time", `▶ ${fmtTime(card.startMs)}`);
    time.type = "button";
    time.title = t("card.seek");
    time.onclick = () => onSeek(card.startMs);
    meta.append(time);
  }
  box.append(meta);
  // The headline leads; the paraphrase says it in full. Older cards have only the paraphrase.
  if (card.headline) box.append(el("h4", "ov-title", card.headline), el("p", "ov-lead", card.paraphrase));
  else box.append(el("h4", "ov-title ov-title-long", card.paraphrase));
  box.append(el("blockquote", "quote", `“${card.quote}”`));

  const v = stanceView(card);
  if (v.lead) {
    const name = el("p", "ov-stance", t(`role.${v.lead.role}`, { name: v.lead.node.name }));
    const summary = el("p", "muted", v.lead.role === "contradicts" ? t("card.thatView", { summary: v.lead.node.summary }) : v.lead.node.summary);
    box.append(section(t("card.behind"), name, summary));
  }
  const fact = factBlock(card);
  if (fact) box.append(fact);
  if (v.disagree.length) {
    const ul = el("ul", "ov-points");
    for (const o of v.disagree) {
      const li = el("li");
      li.append(el("strong", "", o.node.name));
      if (o.note) li.append(document.createTextNode(` — ${o.note}`));
      ul.append(li);
    }
    box.append(section(t("card.disagree"), ul));
  }
  if (v.tested.length) box.append(section(t("card.tested"), v.tested.map((x) => `${x.node.name}${x.note ? `: ${x.note}` : ""}`).join(" · ")));
  const refs = [...v.readSpeaker.slice(0, 2).map((r) => `${r.title} (${t("card.readSpeaker")})`), ...v.readOpposing.slice(0, 2).map((r) => `${r.title} (${t("card.readOpposing")})`)];
  if (refs.length) {
    const ul = el("ul", "ov-points");
    for (const x of refs) ul.append(el("li", "", x));
    box.append(section(t("card.reading"), ul));
  }
  return box;
}
