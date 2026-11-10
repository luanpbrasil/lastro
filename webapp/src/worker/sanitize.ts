/**
 * Everything the model reads comes from the public: the transcript is posted by any page, and the title is whatever
 * the video's owner typed. Text is cut down to what speech can contain before it is stored or put in a prompt.
 * That also removes "<", so nobody can forge the markers that fence the data in the prompt (see factcheck.ts).
 */

/** Control, format (zero-width, bidi overrides), private-use and unassigned characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu;
/** Anything speech recognition doesn't write: markup, braces, brackets, backticks, role tags. */
const NOT_SPEECH = /[^\p{L}\p{M}\p{N}\s.,;:!?%$ºª°'’"“”()\-–—/+]/gu;

export const MAX_SEGMENT_CHARS = 600;

export function cleanSpeech(text: string, max = MAX_SEGMENT_CHARS): string {
  return text.normalize("NFKC").replace(INVISIBLE, " ").replace(NOT_SPEECH, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanTitle(title: string): string {
  return cleanSpeech(title, 200);
}

/** A paraphrase states what the speaker said ("O falante afirma que…"). */
const ATTRIBUTED = /^(o|a) (falante|palestrante|entrevistad[oa]|apresentador[a]?|convidad[oa]|autor[a]?)\b/i;
/** Links, addresses, handles and markup have no place in a card, whatever the video says. */
const LINKISH = /https?:|www\.|\.(com|net|org|br|io|xyz|ly|me|app|site)\b|@\w|[<>{}[\]`\\|]/i;

/** The paraphrase is the only free text the model writes into a card, so it is where an injection would show. */
export function isSafeParaphrase(p: string): boolean {
  return p.length >= 15 && p.length <= 400 && ATTRIBUTED.test(p) && !LINKISH.test(p);
}
