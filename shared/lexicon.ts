import { KG } from "./kg";
import { looseNorm } from "./transcript";

/** Economics terms (pt-BR), plus every graph alias. Matched on accent-free lowercase words. */
const BASE_TERMS = [
  "selic", "juros", "taxa de juros", "copom", "banco central", "inflacao", "ipca", "deflacao",
  "divida publica", "divida bruta", "deficit", "superavit", "arcabouco", "teto de gastos", "fiscal",
  "austeridade", "cambio", "dolar", "pib", "recessao", "desemprego", "economia", "economista",
  "politica monetaria", "politica fiscal", "rentismo", "orcamento", "tesouro", "haddad", "galipolo",
  "campos neto", "plano real", "mmt", "keynes", "friedman", "imposto", "gasto publico",
];

const TERMS = [...new Set([...BASE_TERMS, ...KG.nodes.flatMap((n) => n.aliases.map(looseNorm))])]
  .map((t) => looseNorm(t))
  .filter((t) => t.length >= 3);

/** Number of distinct-term hits in `text`. */
export function lexiconHits(text: string): number {
  const hay = ` ${looseNorm(text)} `;
  let hits = 0;
  for (const t of TERMS) {
    let i = hay.indexOf(` ${t} `);
    while (i !== -1) {
      hits++;
      i = hay.indexOf(` ${t} `, i + t.length + 1);
    }
  }
  return hits;
}

/** Gate A: title + description. */
export function gateA(titleAndDescription: string): boolean {
  return lexiconHits(titleAndDescription) >= 1;
}

/** Gate B: hits per minute of captions. Threshold to tune on ~60 labelled videos (rev 3, 1.9). */
export const GATE_B_MIN_PER_MIN = 0.6;
export function gateB(captionText: string, durationMs: number): { pass: boolean; perMin: number } {
  const minutes = Math.max(1, durationMs / 60000);
  const perMin = lexiconHits(captionText) / minutes;
  return { pass: perMin >= GATE_B_MIN_PER_MIN, perMin };
}
