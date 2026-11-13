import type { Card, Segment } from "../../shared/schema";

/** Limits for one POST /transcript. The page stays well under them. */
export const MAX_SEGMENTS = 200;
export const MAX_CHUNK_CHARS = 10_000;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface OfficialValue {
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  value: number;
  date: string;
  periodLabel: string;
  /** A thinned slice of the official series around the value, for the card's chart. Cards saved before it have none. */
  series?: { date: string; value: number }[];
}

/** Result of checking a fact card against the official series. `official` is null when no value could be fetched. */
export interface FactCheck {
  verdict: "confere" | "diferente" | null;
  official: OfficialValue | null;
}

/** `headline`: a few words naming the claim, in the language of the video (cards saved before it have none). */
export type CheckedCard = Omit<Card, "modelQuote"> & { headline?: string; check: FactCheck | null };
export type StoredCard = CheckedCard & { id: number };

/** Browser-observed public source; this is not platform attestation. */
export interface PostSource {
  postId: string;
  url: string;
  author: string;
  handle: string;
  publishedAt: string | null;
  text: string;
  lang: "pt";
  visibility: "public";
  complete: true;
}
export type PostCard = Omit<CheckedCard, "seg" | "startMs" | "matchScore">;
export interface PostAnalysis {
  id: string;
  status: "complete" | "empty";
  source: PostSource;
  cards: PostCard[];
  analysedAt: number;
}

export interface TranscriptRequest {
  session: string;
  /** BCP 47 tag of the captions, or the one speech recognition is set to */
  lang?: string;
  segments: Segment[];
}

export interface VideoSummary {
  id: string;
  title: string;
  author: string;
  cards: number;
  facts: number;
  /** ms since epoch of the latest analysis */
  analysedAt: number;
}

export interface VideosResponse {
  videos: VideoSummary[];
}

/** GET /api/videos/:id/language. `lang` is BCP 47 as YouTube writes it ("pt-BR", "en"); null when unknown. */
export interface LanguageResponse {
  lang: string | null;
  source: "audio" | "captions" | "title" | null;
}

/** POST /api/videos/:id/sessions. `captions`: the video's captions, sent by the extension (faster pacing, own cap). */
export interface SessionRequest {
  source?: "speech" | "captions";
}

/** GET /api/videos/:id/coverage: the stretches already transcribed, as [startMs, endMs]. */
export interface CoverageResponse {
  ranges: [number, number][];
}

export interface SessionResponse {
  session: string;
}

/** Why the Worker refused. The page turns each code into a message. */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "video_not_found"
  | "session_invalid"
  | "too_fast"
  | "rate_limited"
  | "ip_sessions"
  | "ip_videos"
  | "neurons"
  | "video_limit"
  | "unavailable";

export interface TranscriptResponse {
  /** Segments that will be analysed. */
  accepted: number;
  /** Segments dropped because that part of the video already has a transcript. */
  skipped: number;
}

export interface CardsResponse {
  videoId: string;
  title: string;
  cards: StoredCard[];
  /** Pass as `after` on the next poll. */
  cursor: number;
  pendingChunks: number;
  failedChunks: number;
  /** How much of the video has a transcript so far. */
  coveredMs: number;
}
