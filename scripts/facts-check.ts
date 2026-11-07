/**
 * Hit every official data source once and print what a fact card would show. Free APIs, no Claude call.
 *   npm run facts
 */
import { compare, fmtDate, fmtNum, INDICATOR_DEFS, resolveFact } from "../shared/indicators";
import type { Indicator } from "../shared/schema";

const cases: { indicator: Indicator; period: string | null; claimed: number | null }[] = [
  { indicator: "selic_meta", period: null, claimed: 13.75 },
  { indicator: "selic_meta", period: "2012-10", claimed: 7.25 },
  { indicator: "selic_meta", period: "2020", claimed: 2 },
  { indicator: "ipca_12m", period: null, claimed: 6 },
  { indicator: "ipca_mensal", period: null, claimed: null },
  { indicator: "desemprego", period: null, claimed: 5.3 },
  { indicator: "pib_tri", period: null, claimed: null },
  { indicator: "dbgg_pib", period: null, claimed: 80 },
  { indicator: "dlsp_pib", period: null, claimed: null },
  { indicator: "cambio_usd", period: null, claimed: null },
  { indicator: "focus_selic", period: null, claimed: null },
];

let failed = 0;
for (const c of cases) {
  const t0 = performance.now();
  try {
    const r = await resolveFact(c.indicator, c.period);
    const ms = Math.round(performance.now() - t0);
    if (!r) {
      failed++;
      console.log(`✗ ${c.indicator} ${c.period ?? "now"}: no value (${ms} ms)`);
      continue;
    }
    const def = INDICATOR_DEFS[c.indicator];
    const verdict = compare(c.claimed, r.value);
    console.log(
      `✓ ${c.indicator.padEnd(12)} ${String(c.period ?? "now").padEnd(8)} ${fmtNum(r.value, r.unit).padEnd(16)} ${r.periodLabel.padEnd(26)} ` +
        `${r.series.length} pts (${fmtDate(r.series[0].date, def.freq)}→) ${c.claimed !== null ? `claimed ${c.claimed} → ${verdict}` : ""} [${ms} ms]`,
    );
  } catch (e) {
    failed++;
    console.log(`✗ ${c.indicator} ${c.period ?? "now"}: ${e instanceof Error ? e.message : e}`);
  }
}
process.exitCode = failed ? 1 : 0;
