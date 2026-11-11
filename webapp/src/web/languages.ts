/**
 * Languages Chrome's speech recognition handles well, for the "spoken language" picker. Values are the BCP 47 tags
 * recognition expects; YouTube's tags ("pt", "en", "es-419") are mapped onto them by `recognitionTag`.
 */
export const LANGUAGES: { tag: string; name: string }[] = [
  { tag: "en-US", name: "English" },
  { tag: "pt-BR", name: "Português (Brasil)" },
  { tag: "pt-PT", name: "Português (Portugal)" },
  { tag: "es-ES", name: "Español (España)" },
  { tag: "es-US", name: "Español (Latinoamérica)" },
  { tag: "fr-FR", name: "Français" },
  { tag: "de-DE", name: "Deutsch" },
  { tag: "it-IT", name: "Italiano" },
  { tag: "nl-NL", name: "Nederlands" },
  { tag: "pl-PL", name: "Polski" },
  { tag: "ru-RU", name: "Русский" },
  { tag: "uk-UA", name: "Українська" },
  { tag: "tr-TR", name: "Türkçe" },
  { tag: "ar-SA", name: "العربية" },
  { tag: "he-IL", name: "עברית" },
  { tag: "hi-IN", name: "हिन्दी" },
  { tag: "id-ID", name: "Bahasa Indonesia" },
  { tag: "vi-VN", name: "Tiếng Việt" },
  { tag: "th-TH", name: "ไทย" },
  { tag: "zh-CN", name: "中文 (普通话)" },
  { tag: "ja-JP", name: "日本語" },
  { tag: "ko-KR", name: "한국어" },
  { tag: "sv-SE", name: "Svenska" },
  { tag: "da-DK", name: "Dansk" },
  { tag: "nb-NO", name: "Norsk" },
  { tag: "fi-FI", name: "Suomi" },
  { tag: "cs-CZ", name: "Čeština" },
  { tag: "el-GR", name: "Ελληνικά" },
  { tag: "ro-RO", name: "Română" },
  { tag: "hu-HU", name: "Magyar" },
];

/** The default variant when YouTube gives only the language: "pt" → Brazil, "es" → Spain, "en" → US. */
const BY_LANGUAGE: Record<string, string> = { en: "en-US", pt: "pt-BR", es: "es-ES", zh: "zh-CN", no: "nb-NO", nb: "nb-NO", iw: "he-IL", he: "he-IL" };
/** Regional variants YouTube uses that recognition writes differently. */
const BY_TAG: Record<string, string> = { "es-419": "es-US", "es-MX": "es-US", "zh-Hans": "zh-CN", "zh-TW": "zh-CN", "en-GB": "en-US" };

/** The picker's tag for a YouTube language tag, or null if the picker has no such language. */
export function recognitionTag(youtubeTag: string): string | null {
  const exact = LANGUAGES.find((l) => l.tag.toLowerCase() === youtubeTag.toLowerCase());
  if (exact) return exact.tag;
  if (BY_TAG[youtubeTag]) return BY_TAG[youtubeTag];
  const base = youtubeTag.split("-")[0].toLowerCase();
  return BY_LANGUAGE[base] ?? LANGUAGES.find((l) => l.tag.split("-")[0] === base)?.tag ?? null;
}

export const nameOf = (tag: string) => LANGUAGES.find((l) => l.tag === tag)?.name ?? tag;
