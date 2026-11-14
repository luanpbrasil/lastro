/**
 * Which language a YouTube video is spoken in, from its player data. Pure: shared by the Worker (src/worker/language.ts,
 * which reads the player data from the watch page, for the web page) and the extension (extension/src/hook.ts and
 * content.ts, which read it from the page the viewer already has open, so the extension never makes the Worker fetch
 * YouTube).
 *
 * 1. The original audio track, when YouTube lists several (auto-dubbed videos): the one that isn't a dub.
 * 2. Otherwise YouTube's automatic captions ("asr" track): they are generated in the spoken language.
 * 3. Otherwise the title, by its most common words.
 */

export type LanguageSource = "audio" | "captions" | "title";
export interface DetectedLanguage {
  /** BCP 47 tag as YouTube writes it ("pt-BR", "en") */
  lang: string;
  source: LanguageSource;
}

export const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

export interface CaptionTrack {
  languageCode?: string;
  kind?: string;
}
export interface AudioTrack {
  id?: string;
  displayName?: string;
  audioIsDefault?: boolean;
  isAutoDubbed?: boolean;
}
export interface PlayerTracks {
  audio: AudioTrack[];
  captions: CaptionTrack[];
}

/** "pt-BR.4" → "pt-BR"; "en.4" → "en". */
const trackLang = (id: string | undefined) => (id ?? "").split(".")[0];
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Steps 1 and 2. */
export function fromTracks({ audio, captions }: PlayerTracks): DetectedLanguage | null {
  // 1. Several audio tracks: YouTube has dubbed the video. The original is the one that isn't auto-dubbed.
  const byId = new Map<string, AudioTrack>();
  for (const t of audio) if (t?.id) byId.set(t.id, t);
  if (byId.size > 1) {
    const tracks = [...byId.values()];
    const original = tracks.find((t) => /original/i.test(t.displayName ?? "")) ?? tracks.find((t) => !t.isAutoDubbed);
    const lang = trackLang(original?.id);
    if (LANG_TAG.test(lang)) return { lang, source: "audio" };
  }
  // 2. Automatic captions are generated from the speech, so their language is the spoken one.
  const asr = captions.find((t) => t?.kind === "asr" && LANG_TAG.test(t.languageCode ?? ""));
  if (asr?.languageCode) return { lang: asr.languageCode, source: "captions" };
  return null;
}

/**
 * The tracks in a parsed player response (movie_player.getPlayerResponse() or ytInitialPlayerResponse): audio tracks
 * from streamingData.adaptiveFormats, caption tracks from captions.playerCaptionsTracklistRenderer. Only the fields
 * detection reads are kept, as strings and booleans, so the result is small and safe to post between worlds.
 */
export function tracksFromPlayerResponse(pr: unknown): PlayerTracks {
  const p = (pr ?? {}) as {
    streamingData?: { adaptiveFormats?: { audioTrack?: Record<string, unknown> }[] };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Record<string, unknown>[] } };
  };
  const formats = Array.isArray(p.streamingData?.adaptiveFormats) ? p.streamingData.adaptiveFormats : [];
  const seen = new Set<string>();
  const audio: AudioTrack[] = [];
  for (const f of formats) {
    const t = f?.audioTrack;
    const id = str(t?.id);
    if (!t || !id || seen.has(id)) continue;
    seen.add(id);
    audio.push({ id, displayName: str(t.displayName), audioIsDefault: t.audioIsDefault === true, isAutoDubbed: t.isAutoDubbed === true });
  }
  const list = p.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const captions = (Array.isArray(list) ? list : []).map((t) => ({ languageCode: str(t?.languageCode), kind: str(t?.kind) }));
  return { audio, captions };
}

/** Tracks posted from the page's world (hook.ts): rebuilt field by field, since any script on the page can post. */
export function cleanTracks(raw: unknown): PlayerTracks | null {
  const r = raw as { audio?: unknown; captions?: unknown } | null;
  if (!r || !Array.isArray(r.audio) || !Array.isArray(r.captions)) return null;
  const audio = (r.audio as Record<string, unknown>[]).slice(0, 50).map((t) => ({ id: str(t?.id), displayName: str(t?.displayName), audioIsDefault: t?.audioIsDefault === true, isAutoDubbed: t?.isAutoDubbed === true }));
  const captions = (r.captions as Record<string, unknown>[]).slice(0, 200).map((t) => ({ languageCode: str(t?.languageCode), kind: str(t?.kind) }));
  return { audio, captions };
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

/** Steps 1–3 over what the page already has. */
export const detectFrom = (tracks: PlayerTracks | null, title: string): DetectedLanguage | null => (tracks ? fromTracks(tracks) : null) ?? fromTitle(title);
