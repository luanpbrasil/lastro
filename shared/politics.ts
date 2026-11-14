/**
 * Parties and active politicians that Lastro-written card text (headline, paraphrase, context, counterpoint) must never
 * name: the graph maps ideas to traditions and institutions, not to people in office. Quotes are verbatim and may name
 * them. Used by the webapp's Worker to clear or drop such text, and by the evals to check for it.
 *
 * Party acronyms match case-sensitively as whole words ("PL" the party, not "pl"); "Novo" only as "partido Novo"
 * (Novo consenso is a node).
 */
const PARTIES: RegExp[] = [/\b(PT|PL|PSDB|MDB|PSOL)\b/, /partido novo/i, /\b(União Brasil|Republicanos)\b/i];
const POLITICIANS = ["Lula", "Bolsonaro", "Haddad", "Tarcísio", "Alckmin", "Dilma", "Ciro Gomes", "Marina Silva", "Boulos", "Moro", "Lira", "Pacheco", "Motta", "Alcolumbre", "Milei", "Trump", "Campos Neto", "Galípolo"];
const NAMES = POLITICIANS.join("|");
/**
 * In card text the names are proper nouns, so the Worker matches them capitalised: "moro" (Portuguese "I live") and
 * "lira" (a currency) are words too. "Lira turca" is the currency even capitalised.
 */
const NAMES_CASED = new RegExp(`\\b(${NAMES})\\b(?!\\s+turca)`);
const NAMES_ANY_CASE = new RegExp(`\\b(${NAMES})\\b`, "i");

/** The forbidden names in a text. `anyCase`: the evals' stricter reading, any capitalisation. */
export function namesPolitics(text: string, anyCase = false): string[] {
  return [...PARTIES, anyCase ? NAMES_ANY_CASE : NAMES_CASED].flatMap((r) => text.match(r)?.[0] ?? []);
}
