import { namesPolitics } from "../../../shared/politics";

/**
 * Lastro-written card text never names a party, government or politician (shared/politics.ts); the prompt says so, and
 * this catches what still gets through. Quotes are verbatim and aren't checked. Logged so `wrangler tail` shows how
 * often it happens; the names are public figures, nothing about the viewer.
 */
export function namesIn(text: string | undefined, where: "chunk" | "post", field: string, action: "dropped" | "cleared"): boolean {
  const names = text ? namesPolitics(text) : [];
  if (names.length) console.log(JSON.stringify({ event: "politics_filtered", where, field, action, names }));
  return names.length > 0;
}
