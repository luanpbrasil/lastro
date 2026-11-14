import { detectFrom, type AudioTrack, type CaptionTrack, type DetectedLanguage, type PlayerTracks } from "../language-detect";

/**
 * Which language a YouTube video is spoken in, for the web page, so it can set Chrome's speech recognition before
 * listening. Chrome can't detect the language itself, and recognising in the wrong one returns almost nothing.
 * The order (original audio, automatic captions, title) is in src/language-detect.ts, shared with the extension,
 * which reads the same player data from the page the viewer has open and never calls this.
 * Only the video id goes to YouTube; nothing about the viewer.
 */

export type { DetectedLanguage, LanguageSource } from "../language-detect";

const FETCH_TIMEOUT_MS = 5000;
/** The player response sits ~0.8–0.9 MB into the page; stop reading once it has gone by. */
const MAX_PAGE_CHARS = 1_400_000;
const START_MARKER = "ytInitialPlayerResponse";
const END_MARKER = '"videoDetails"';

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

/** The tracks in the watch page's text, without parsing the whole player response (CPU budget). */
export function tracksFromSection(section: string): PlayerTracks {
  const audio: AudioTrack[] = [];
  for (const m of section.matchAll(/"audioTrack":(\{[^{}]*\})/g)) {
    try {
      audio.push(JSON.parse(m[1]) as AudioTrack);
    } catch {
      /* not JSON: skip */
    }
  }
  const at = section.indexOf('"captionTracks":');
  const captions = at >= 0 ? ((arrayAt(section, at) ?? []) as CaptionTrack[]) : [];
  return { audio, captions };
}

export async function detectLanguage(videoId: string, title: string): Promise<DetectedLanguage | null> {
  let tracks: PlayerTracks | null = null;
  try {
    const section = await playerSection(videoId);
    tracks = section ? tracksFromSection(section) : null;
  } catch (err) {
    console.error("language lookup failed", videoId, err instanceof Error ? err.message : String(err));
  }
  return detectFrom(tracks, title);
}
