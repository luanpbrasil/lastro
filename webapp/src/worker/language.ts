/**
 * Which language a YouTube video is spoken in, so the page can set Chrome's speech recognition before listening.
 * Chrome can't detect the language itself, and recognising in the wrong one returns almost nothing.
 *
 * 1. The original audio track, when YouTube lists several (auto-dubbed videos): the one that isn't a dub.
 * 2. Otherwise YouTube's automatic captions ("asr" track): they are generated in the spoken language.
 * 3. Otherwise the title, by its most common words.
 * Only the video id goes to YouTube; nothing about the viewer.
 */

export type LanguageSource = "audio" | "captions" | "title";
export interface DetectedLanguage {
  /** BCP 47 tag as YouTube writes it ("pt-BR", "en") */
  lang: string;
  source: LanguageSource;
}

const TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;
const FETCH_TIMEOUT_MS = 5000;
/** The player response sits ~0.8–0.9 MB into the page; stop reading once it has gone by. */
const MAX_PAGE_CHARS = 1_400_000;
const START_MARKER = "ytInitialPlayerResponse";
const END_MARKER = '"videoDetails"';

interface CaptionTrack {
  languageCode?: string;
  kind?: string;
}
interface AudioTrack {
  id?: string;
  displayName?: string;
  audioIsDefault?: boolean;
  isAutoDubbed?: boolean;
}

/** The JSON array that starts at `from` (an index just past `[`'s key), found by matching brackets outside strings. */
function arrayAt(text: string, from: number): unknown[] | null {
  const start = text.indexOf("[", from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length && i < start + 200_000; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1)) as unknown[];
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Read the watch page only as far as the player response. Null if YouTube doesn't answer with the page. */
async function playerSection(videoId: string): Promise<string | null> {
  const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      "accept-language": "en",
      // Skips the cookie-consent page YouTube shows to requests from some regions.
      cookie: "SOCS=CAI",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok || !r.body) return null;
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let start = -1;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Search only the new part (plus a marker's length of overlap), so a long page isn't rescanned on every chunk:
    // the free plan allows 10 ms of CPU per request.
    const from = Math.max(0, text.length - 32);
    text += decoder.decode(value, { stream: true });
    if (start < 0) start = text.indexOf(START_MARKER, from);
    if ((start >= 0 && text.indexOf(END_MARKER, Math.max(start, from)) >= 0) || text.length > MAX_PAGE_CHARS) break;
  }
  void reader.cancel().catch(() => {});
  return start >= 0 ? text.slice(start) : null;
}

/** "pt-BR.4" → "pt-BR"; "en.4" → "en". */
const trackLang = (id: string | undefined) => (id ?? "").split(".")[0];

export function fromPlayer(section: string): DetectedLanguage | null {
  // 1. Several audio tracks: YouTube has dubbed the video. The original is the one that isn't auto-dubbed.
  const audio = new Map<string, AudioTrack>();
  for (const m of section.matchAll(/"audioTrack":(\{[^{}]*\})/g)) {
    try {
      const t = JSON.parse(m[1]) as AudioTrack;
      if (t.id) audio.set(t.id, t);
    } catch {
      /* not JSON: skip */
    }
  }
  if (audio.size > 1) {
    const tracks = [...audio.values()];
    const original = tracks.find((t) => /original/i.test(t.displayName ?? "")) ?? tracks.find((t) => !t.isAutoDubbed);
    const lang = trackLang(original?.id);
    if (TAG.test(lang)) return { lang, source: "audio" };
  }
  // 2. Automatic captions are generated from the speech, so their language is the spoken one.
  const at = section.indexOf('"captionTracks":');
  const captions = at >= 0 ? ((arrayAt(section, at) ?? []) as CaptionTrack[]) : [];
  const asr = captions.find((t) => t.kind === "asr" && TAG.test(t.languageCode ?? ""));
  if (asr?.languageCode) return { lang: asr.languageCode, source: "captions" };
  return null;
}

// 3. The title: count each language's most common short words. Titles are short, so this only decides clear cases.
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "is", "in", "what", "why", "how", "for", "with", "on", "are", "this", "will", "does", "you", "we", "about", "can", "it", "not", "be", "your", "from"],
  pt: ["o", "os", "as", "do", "da", "dos", "das", "que", "é", "não", "em", "para", "com", "um", "uma", "por", "como", "mais", "na", "no", "nas", "nos", "ao", "você", "sobre", "porque", "isso", "está"],
  es: ["el", "los", "las", "del", "que", "es", "no", "en", "para", "con", "un", "una", "por", "como", "más", "se", "su", "al", "lo", "qué", "cómo", "por qué", "sobre", "está", "porque"],
  fr: ["le", "les", "des", "du", "et", "est", "que", "pas", "pour", "dans", "une", "un", "en", "sur", "avec", "qui", "ce", "il", "au", "aux", "pourquoi", "comment"],
  de: ["der", "die", "das", "und", "ist", "nicht", "mit", "für", "ein", "eine", "den", "dem", "von", "zu", "auf", "wie", "was", "warum", "im", "es", "sich"],
  it: ["il", "lo", "gli", "le", "di", "del", "della", "che", "è", "non", "per", "con", "un", "una", "perché", "come", "più", "nel", "sono", "sul"],
};
const ACCENTS: Record<string, RegExp> = { pt: /[ãõç]/, es: /[ñ¿¡]/, de: /[ßäöü]/, fr: /[êëîïûœ]/ };

export function fromTitle(title: string): DetectedLanguage | null {
  const words = title.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length) return null;
  const scores = Object.entries(STOPWORDS).map(([lang, list]) => {
    const set = new Set(list);
    let score = words.filter((w) => set.has(w)).length;
    if (ACCENTS[lang]?.test(title.toLowerCase())) score += 2;
    return { lang, score };
  });
  scores.sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  return best.score >= 2 && best.score > next.score ? { lang: best.lang, source: "title" } : null;
}

export async function detectLanguage(videoId: string, title: string): Promise<DetectedLanguage | null> {
  try {
    const section = await playerSection(videoId);
    const found = section ? fromPlayer(section) : null;
    if (found) return found;
  } catch (err) {
    console.error("language lookup failed", videoId, err instanceof Error ? err.message : String(err));
  }
  return fromTitle(title);
}
