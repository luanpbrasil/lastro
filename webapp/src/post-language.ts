/**
 * An X post's language is X's own `lang` attribute on the post text, a BCP 47 tag ("pt", "en", "es"; "und" when X
 * can't tell). Lastro supports Portuguese, English and Spanish posts and writes their cards in that language; posts in
 * any other language are skipped in the page and refused by the Worker. Kept apart from post-relevance.ts so the
 * Worker doesn't bundle the topic model.
 */
export type PostLanguage = "pt" | "en" | "es";

/** The supported language of an X `lang` tag, or null. */
export function postLanguage(tag: string): PostLanguage | null {
  const base = /^([a-z]{2,3})(?:-[A-Za-z0-9]{2,4})?$/i.exec(tag.trim())?.[1].toLowerCase();
  return base === "pt" || base === "en" || base === "es" ? base : null;
}
