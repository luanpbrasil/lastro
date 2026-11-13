import { clean, compare, fmtDate, INDICATOR_DEFS, type Point } from "../../../shared/indicators";
import type { PostCard, PostSource } from "../types";

const MONTHS = "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split(" ");

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Period = { start: string; end: string; precision: "day" | "month" | "quarter" | "year" };
type PeriodResolution = { kind: "resolved"; period: Period; atEnd: boolean } | { kind: "absent" } | { kind: "unsafe" };

/** These qualifiers describe a range, offset or partial period, not the named observation. */
function hasUnresolvedTime(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /\b(?:antes|depois|desde|ate|apos|entre|durante|atras)\b|\ba partir\b/.test(normalized)
    || /\b(?:ha|faz|fazem|completa|completam|decorridos?|passados?)\b|\b(?:dentro de|daqui a)\b/.test(normalized)
    || /\b(?:inicio|comeco|meio|meados)\s+(?:de|do|da)\b/.test(normalized)
    || /\b(?:anteontem|ontem|amanha|antevespera|vespera|passad[oa]s?|retrasad[oa]s?|anterior(?:es)?|seguintes?|proxim[oa]s?)\b|\bque vem\b/.test(normalized);
}

function period(year: number, month: number, precision: Period["precision"], day = 1): Period | null {
  if (year < 1900 || year > 9999 || month < 1 || month > 12) return null;
  const start = `${year}-${pad(month)}-${pad(day)}`;
  const date = new Date(start);
  if (!Number.isFinite(date.getTime()) || iso(date) !== start) return null;
  const end = precision === "day" ? start : iso(new Date(Date.UTC(year, month - 1 + (precision === "year" ? 12 : precision === "quarter" ? 3 : 1), 0)));
  return { start, end, precision };
}

/** Recognize only unambiguous authored dates. A model period alone is not evidence. */
function explicitPeriod(text: string): PeriodResolution {
  if (hasUnresolvedTime(text)) return { kind: "unsafe" };
  const found: { period: Period | null; atEnd: boolean }[] = [];
  let rest = text.toLowerCase();
  const take = (pattern: RegExp, make: (...parts: string[]) => Period | null) => {
    rest = rest.replace(pattern, (match: string, ...parts: unknown[]) => {
      const offset = Number(parts.at(-2));
      // "fim de" must qualify this exact date, not a mandate/cycle in another clause.
      const atEnd = /\b(?:fim|final|fechamento)\s+de\s*$/.test(rest.slice(0, offset));
      found.push({ period: make(match, ...parts.slice(0, -2).map(String)), atEnd });
      return " ";
    });
  };
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => period(+y, +m, "day", +d));
  take(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, d, m, y) => period(+y, +m, "day", +d));
  take(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")}) de (\\d{4})\\b`, "g"), (_, d, m, y) => period(+y, MONTHS.indexOf(m) + 1, "day", +d));
  take(/\b([1-4])(?:º|o)?\s*(?:trimestre|tri)\s*(?:de\s*)?(\d{4})\b/g, (_, q, y) => period(+y, (+q - 1) * 3 + 1, "quarter"));
  take(/\b(\d{4})-(\d{2})\b/g, (_, y, m) => period(+y, +m, "month"));
  take(new RegExp(`\\b(${MONTHS.join("|")}) de (\\d{4})\\b`, "g"), (_, m, y) => period(+y, MONTHS.indexOf(m) + 1, "month"));
  take(/\b(\d{4})\b/g, (_, y) => period(+y, 1, "year"));
  // Unparsed date language prevents falling back to "today" in another clause.
  if (new RegExp(`\\b(${MONTHS.join("|")}|ontem|passado|amanhã)\\b|(?:este|nesse|neste|último|ultimo) (?:ano|mês|mes|trimestre)`, "i").test(rest)) return { kind: "unsafe" };
  if (!found.length) return { kind: "absent" };
  if (found.length > 1 || !found[0].period) return { kind: "unsafe" };
  return { kind: "resolved", period: found[0].period, atEnd: found[0].atEnd };
}

/** IBGE's documented explicit-period range; legacy video fetches intentionally stay unchanged.
 * https://servicodados.ibge.gov.br/api/docs/agregados?versao=3
 */
async function historicalIbge(indicator: "desemprego" | "pib_tri", from: Date, to: Date): Promise<Point[]> {
  const quarterly = indicator === "pib_tri";
  const code = (d: Date) => `${d.getUTCFullYear()}${pad(quarterly ? Math.floor(d.getUTCMonth() / 3) + 1 : d.getUTCMonth() + 1)}`;
  const table = quarterly ? 5932 : 6381;
  const variable = quarterly ? 6564 : 4099;
  const response = await fetch(`https://servicodados.ibge.gov.br/api/v3/agregados/${table}/periodos/${code(from)}-${code(to)}/variaveis/${variable}?localidades=N1[all]${quarterly ? "&classificacao=11255[90707]" : ""}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Official series unavailable");
  const body = await response.json() as { resultados: { series: { serie: Record<string, string> }[] }[] }[];
  return Object.entries(body[0].resultados[0].series[0].serie)
    .filter(([key, value]) => /^\d{6}$/.test(key) && /^-?\d+(\.\d+)?$/.test(value))
    .map(([key, value]) => ({ date: `${key.slice(0, 4)}-${pad(quarterly ? (Number(key.slice(4)) - 1) * 3 + 1 : Number(key.slice(4)))}-01`, value: Number(value) }));
}

async function resolve(card: PostCard, source: PostSource): Promise<PostCard> {
  if (card.kind !== "fact" || !card.indicator || card.indicator === "focus_selic" || card.claimed_value === null || !source.publishedAt || Date.parse(source.publishedAt) > Date.now()) return card;
  // Quote grounding alone does not preserve a preceding "antes de" or relative offset.
  // Conservatively refuse such source wording even when the model omitted it from the quote.
  if (hasUnresolvedTime(source.text)) return card;
  const resolution = explicitPeriod(card.quote);
  if (resolution.kind === "unsafe") return card;
  const target = resolution.kind === "resolved" ? resolution.period : null;
  const def = INDICATOR_DEFS[card.indicator];
  const published = source.publishedAt.slice(0, 10);
  if (!target) {
    // An omitted explicit date elsewhere in the source must not become a relative comparison.
    if (explicitPeriod(source.text).kind !== "absent" || !/\b(hoje|agora|atualmente)\b/i.test(card.quote)) return card;
    // Period starts do not establish release dates. No relative monthly/quarterly/Focus verdicts.
    if (def.freq !== "daily") return card;
  } else {
    if (target.end > published) return card;
    if (def.freq === "daily" && target.precision !== "day" && (resolution.kind !== "resolved" || !resolution.atEnd)) return card;
    if (def.freq === "monthly" && target.precision !== "month") return card;
    if (def.freq === "quarterly" && target.precision !== "quarter") return card;
  }
  const to = new Date(target?.end ?? published);
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const raw = card.indicator === "desemprego" || card.indicator === "pib_tri"
    ? await historicalIbge(card.indicator, from, to) : await def.fetch(from, to);
  const points = raw.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Date.parse(p.date)) && iso(new Date(p.date)) === p.date
    && Number.isFinite(p.value) && p.date >= iso(from) && p.date <= iso(to)
    && (def.freq === "daily" || p.date.endsWith("-01")))
    .sort((a, b) => a.date.localeCompare(b.date));
  const point = points.filter(p => !target || (p.date >= target.start && p.date <= target.end)).at(-1);
  if (!point) return card;
  // Daily observations cannot establish intraday changes. Refuse stale/missing daily evidence.
  if (def.freq === "daily" && to.getTime() - Date.parse(point.date) > 7 * 86400_000) return card;
  if (target && def.freq !== "daily" && point.date !== target.start) return card;
  const chart = clean(points.filter(p => p.date <= point.date), def.freq, to);
  const series = chart.length <= 36 ? chart : [...Array.from({ length: 35 }, (_, i) => chart[Math.floor(i * (chart.length - 1) / 35)]), chart[chart.length - 1]];
  return { ...card, period: target ? target.precision === "year" ? target.start.slice(0, 4) : target.precision === "month" ? target.start.slice(0, 7) : target.start : null,
    check: { verdict: compare(card.claimed_value, point.value), official: {
      label: def.label, unit: def.unit, source: def.source, sourceUrl: def.sourceUrl,
      ...point, periodLabel: fmtDate(point.date, def.freq), series, vintage: "current-series",
    } } };
}

/** Missing/slow official data preserves useful context and never triggers a provider retry. */
export async function comparePostCard(card: PostCard, source: PostSource): Promise<PostCard> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([resolve(card, source), new Promise<PostCard>(done => { timer = setTimeout(() => done(card), 6000); })]);
  } catch { return card; }
  finally { if (timer) clearTimeout(timer); }
}
