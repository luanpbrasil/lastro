/**
 * Parties and active politicians that Lastro-written card text (headline, paraphrase, context, counterpoint) must never
 * name: the graph maps ideas to traditions and institutions, not to people in office. Quotes are verbatim and may name
 * them. Used by the webapp's Worker to clear or drop such text, and by the evals to check for it.
 *
 * Party acronyms match case-sensitively as whole words ("PT" the party, not "pt"); "Novo" only as "partido Novo"
 * (Novo consenso is a node).
 */
const ACRONYMS = "PT|PSDB|MDB|PSOL";
/**
 * "PL" is also a bill (projeto de lei: "PL 1087", "o PL da reforma", "PL das fake news"), so it counts as the party
 * only when that is clear: after "partido", or in a list with another party ("PT e PL", "PL, PSDB"). Never before a
 * number. "O PL de Bolsonaro" is missed; the paraphrase still names Bolsonaro.
 */
const PL_PARTY = new RegExp(
  [
    String.raw`\b[Pp]artido\s+(?:do\s+)?PL\b(?!\s*(?:n[º°o.]\s*)?\d)`,
    String.raw`\b(?:${ACRONYMS})\s*(?:,|\/|\be\b|\bou\b)\s*PL\b(?!\s*(?:n[º°o.]\s*)?\d)`,
    String.raw`\bPL\s*(?:,|\/|\be\b|\bou\b)\s*(?:${ACRONYMS})\b`,
  ].join("|"),
);
const PARTIES: RegExp[] = [new RegExp(String.raw`\b(${ACRONYMS})\b`), PL_PARTY, /partido (novo|liberal)/i, /\b(União Brasil|Republicanos)\b/i];
/**
 * Alexandre de Moraes is a justice, not a politician; he is listed, in full and as "Moraes" alone, because a card
 * naming him reads as partisan. Short forms cards use ("Moraes", "Nikolas", "Ciro") are listed too; "Marina" and
 * "Michelle" alone are not, being common first names ("Bolsonaro" already catches Michelle Bolsonaro).
 * A full name comes before its short form, so the match reports the full name ("Ciro Gomes", not "Ciro").
 */
const POLITICIANS = [
  "Michelle Bolsonaro", "Lula", "Bolsonaro", "Haddad", "Tarcísio", "Alckmin", "Dilma", "Ciro Gomes", "Ciro", "Marina Silva",
  "Boulos", "Pacheco", "Motta", "Alcolumbre", "Milei", "Trump", "Campos Neto", "Galípolo", "Fernando Henrique", "FHC",
  "Collor", "Nikolas Ferreira", "Nikolas", "Gleisi", "Alexandre de Moraes", "Moraes",
];
/** Also Portuguese words ("moro" I live, "lira" a currency, "temer" to fear): matched capitalised even in the evals. */
const ALSO_WORDS = ["Moro", "Lira", "Temer"];
/**
 * In card text the names are proper nouns, so the Worker matches them capitalised. "Lira turca" is the currency even
 * capitalised.
 */
const NAMES_CASED = new RegExp(`\\b(${[...POLITICIANS, ...ALSO_WORDS].join("|")})\\b(?!\\s+turca)`);
const NAMES_ANY_CASE = new RegExp(`\\b(${POLITICIANS.join("|")})\\b`, "i");

/** The forbidden names in a text. `anyCase`: the evals' stricter reading, any capitalisation. */
export function namesPolitics(text: string, anyCase = false): string[] {
  const hits = [...PARTIES, ...(anyCase ? [NAMES_ANY_CASE] : []), NAMES_CASED].flatMap((r) => text.match(r)?.[0] ?? []);
  return [...new Set(hits)];
}
