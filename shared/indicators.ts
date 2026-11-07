import type { Indicator } from "./schema";

/**
 * Official series behind each fact indicator. All sources are free, need no key and send CORS `*`
 * (BUILD_PLAN finding 6). Daily SGS series refuse ranges > 10 years and list future dates for
 * the Selic target (finding 7): we always pass a range and drop dates after today.
 */
export interface IndicatorDef {
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  /** daily series are downsampled to month-end for charts */
  freq: "daily" | "monthly" | "quarterly" | "annual";
  fetch: (from: Date, to: Date) => Promise<Point[]>;
}

export interface Point {
  /** ISO date (period start for monthly/quarterly) */
  date: string;
  value: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function sgs(id: number) {
  return async (from: Date, to: Date): Promise<Point[]> => {
    // ≤ 10-year windows
    const out: Point[] = [];
    let start = new Date(from);
    while (start <= to) {
      const end = new Date(Math.min(to.getTime(), Date.UTC(start.getUTCFullYear() + 9, 11, 31)));
      const rows = (await getJson(
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados?formato=json&dataInicial=${br(start)}&dataFinal=${br(end)}`,
      )) as { data: string; valor: string }[];
      for (const r of rows) {
        const [d, m, y] = r.data.split("/");
        out.push({ date: `${y}-${m}-${d}`, value: Number(r.valor) });
      }
      start = new Date(Date.UTC(end.getUTCFullYear() + 1, 0, 1));
    }
    return out;
  };
}

function sidra(table: number, variable: number) {
  return async (from: Date, to: Date): Promise<Point[]> => {
    const months = Math.ceil((to.getTime() - from.getTime()) / (30.44 * 86400e3)) + 3;
    const rows = (await getJson(
      `https://apisidra.ibge.gov.br/values/t/${table}/n1/all/v/${variable}/p/last%20${Math.min(months, 600)}?formato=json`,
    )) as Record<string, string>[];
    return rows
      .slice(1) // header row
      .filter((r) => r.V && r.V !== "..." && r.V !== "-")
      .map((r) => ({ date: `${r.D3C.slice(0, 4)}-${r.D3C.slice(4, 6)}-01`, value: Number(r.V) }));
  };
}

async function pibTri(from: Date, to: Date): Promise<Point[]> {
  const q = Math.ceil((to.getTime() - from.getTime()) / (91.3 * 86400e3)) + 2;
  const j = (await getJson(
    `https://servicodados.ibge.gov.br/api/v3/agregados/5932/periodos/-${Math.min(q, 120)}/variaveis/6564?localidades=N1[all]&classificacao=11255[90707]`,
  )) as { resultados: { series: { serie: Record<string, string> }[] }[] }[];
  const serie = j[0].resultados[0].series[0].serie;
  return Object.entries(serie)
    .filter(([, v]) => v && v !== "...")
    .map(([k, v]) => ({ date: `${k.slice(0, 4)}-${String((Number(k.slice(4)) - 1) * 3 + 1).padStart(2, "0")}-01`, value: Number(v) }));
}

async function focusSelic(): Promise<Point[]> {
  const year = new Date().getUTCFullYear();
  const j = (await getJson(
    `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=60&$filter=Indicador%20eq%20'Selic'%20and%20DataReferencia%20eq%20'${year}'%20and%20baseCalculo%20eq%200&$orderby=Data%20desc&$format=json&$select=Data,Mediana`,
  )) as { value: { Data: string; Mediana: number }[] };
  return j.value.map((r) => ({ date: r.Data, value: r.Mediana })).reverse();
}

export const INDICATOR_DEFS: Record<Indicator, IndicatorDef> = {
  selic_meta: { label: "Meta da Selic", unit: "% a.a.", source: "Banco Central (SGS 432)", sourceUrl: "https://www3.bcb.gov.br/sgspub/", freq: "daily", fetch: sgs(432) },
  ipca_12m: { label: "IPCA acumulado em 12 meses", unit: "%", source: "IBGE / BCB (SGS 13522)", sourceUrl: "https://www.ibge.gov.br/explica/inflacao.php", freq: "monthly", fetch: sgs(13522) },
  ipca_mensal: { label: "IPCA no mês", unit: "%", source: "IBGE / BCB (SGS 433)", sourceUrl: "https://www.ibge.gov.br/explica/inflacao.php", freq: "monthly", fetch: sgs(433) },
  desemprego: { label: "Taxa de desocupação (PNAD Contínua)", unit: "%", source: "IBGE (SIDRA 6381)", sourceUrl: "https://sidra.ibge.gov.br/tabela/6381", freq: "monthly", fetch: sidra(6381, 4099) },
  pib_tri: { label: "PIB, variação no trimestre", unit: "%", source: "IBGE (Contas Nacionais, 5932)", sourceUrl: "https://sidra.ibge.gov.br/tabela/5932", freq: "quarterly", fetch: pibTri },
  dbgg_pib: { label: "Dívida bruta do governo geral", unit: "% do PIB", source: "Banco Central (SGS 13762)", sourceUrl: "https://www3.bcb.gov.br/sgspub/", freq: "monthly", fetch: sgs(13762) },
  dlsp_pib: { label: "Dívida líquida do setor público", unit: "% do PIB", source: "Banco Central (SGS 4513)", sourceUrl: "https://www3.bcb.gov.br/sgspub/", freq: "monthly", fetch: sgs(4513) },
  cambio_usd: { label: "Dólar (PTAX venda)", unit: "R$", source: "Banco Central (SGS 1)", sourceUrl: "https://www3.bcb.gov.br/sgspub/", freq: "daily", fetch: sgs(1) },
  focus_selic: { label: "Selic esperada para o fim do ano (Focus)", unit: "% a.a.", source: "Banco Central (Boletim Focus)", sourceUrl: "https://www.bcb.gov.br/publicacoes/focus", freq: "annual", fetch: () => focusSelic() },
};

/** Clean a raw series: drop future dates, sort, downsample daily series to the last value of each month. */
export function clean(points: Point[], freq: IndicatorDef["freq"], today = new Date()): Point[] {
  const t = iso(today);
  const sorted = points.filter((p) => p.date <= t && Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (freq !== "daily") return sorted;
  const byMonth = new Map<string, Point>();
  for (const p of sorted) byMonth.set(p.date.slice(0, 7), p);
  const monthly = [...byMonth.values()];
  // keep the very last daily point so "now" is exact
  const last = sorted[sorted.length - 1];
  if (last && monthly[monthly.length - 1]?.date !== last.date) monthly[monthly.length - 1] = last;
  return monthly;
}

export interface FactResult {
  indicator: Indicator;
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  /** the official value for the claim's period (or the latest) */
  value: number;
  date: string;
  /** "now" if no period was claimed */
  periodLabel: string;
  series: Point[];
}

/** Value of a cleaned series at a claimed period: "YYYY-MM" → last point in that month, "YYYY" → last point of that year. */
export function valueAt(series: Point[], period: string | null): Point | undefined {
  if (!period) return series[series.length - 1];
  const inPeriod = series.filter((p) => p.date.startsWith(period));
  return inPeriod[inPeriod.length - 1];
}

/** Window to fetch: 2 years around the claim (or the last 2 years). */
export function windowFor(period: string | null, today = new Date()): { from: Date; to: Date } {
  if (!period) return { from: new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1)), to: today };
  const y = Number(period.slice(0, 4));
  const to = new Date(Math.min(Date.UTC(y + 1, 11, 31), today.getTime()));
  return { from: new Date(Date.UTC(y - 1, 0, 1)), to };
}

/**
 * Compare a claimed number with the official one. Tolerance: 0.1 point or 3%, whichever is larger.
 * Words only, never "falso": confere / diferente.
 */
export function compare(claimed: number | null, official: number): "confere" | "diferente" | null {
  if (claimed === null || claimed === undefined) return null;
  const tol = Math.max(0.1, Math.abs(official) * 0.03);
  return Math.abs(claimed - official) <= tol ? "confere" : "diferente";
}

export function fmtNum(v: number, unit: string): string {
  const s = v.toLocaleString("pt-BR", { maximumFractionDigits: unit === "R$" ? 4 : 2, minimumFractionDigits: unit === "R$" ? 2 : 0 });
  if (unit === "R$") return `R$ ${s}`;
  return unit.startsWith("%") ? `${s}${unit}` : `${s} ${unit}`;
}

export function fmtDate(isoDate: string, freq: IndicatorDef["freq"]): string {
  const [y, m, d] = isoDate.split("-");
  if (freq === "quarterly") return `${Math.floor((Number(m) - 1) / 3) + 1}º tri/${y}`;
  if (freq === "monthly") return `${m}/${y}`;
  return `${d}/${m}/${y}`;
}

/** Fetch and resolve one fact. Runs in the extension background (or Node for tests). */
export async function resolveFact(indicator: Indicator, period: string | null, today = new Date()): Promise<FactResult | null> {
  const def = INDICATOR_DEFS[indicator];
  if (!def) return null;
  const { from, to } = windowFor(period, today);
  const series = clean(await def.fetch(from, to), def.freq, today);
  const p = valueAt(series, period);
  if (!p) return null;
  return {
    indicator,
    label: def.label,
    unit: def.unit,
    source: def.source,
    sourceUrl: def.sourceUrl,
    value: p.value,
    date: p.date,
    periodLabel: period ? fmtDate(p.date, def.freq) : `mais recente (${fmtDate(p.date, def.freq)})`,
    series,
  };
}

/** Series for an episode chart (e.g. Selic 2011–2014). */
export async function episodeSeries(indicator: Indicator, fromIso: string, toIso: string, today = new Date()): Promise<Point[]> {
  const def = INDICATOR_DEFS[indicator];
  return clean(await def.fetch(new Date(fromIso), new Date(Math.min(new Date(toIso).getTime(), today.getTime()))), def.freq, today);
}
