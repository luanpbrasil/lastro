import type { Card, Segment } from "../../shared/schema";

/** Limits for one POST /transcript. The page stays well under them. */
export const MAX_SEGMENTS = 100;
export const MAX_CHUNK_CHARS = 6000;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** The Turnstile action of the listen widget, checked by the Worker. */
export const TURNSTILE_ACTION = "listen";

export interface OfficialValue {
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  value: number;
  date: string;
  periodLabel: string;
}

/** Result of checking a fact card against the official series. `official` is null when no value could be fetched. */
export interface FactCheck {
  verdict: "confere" | "diferente" | null;
  official: OfficialValue | null;
}

export type CheckedCard = Omit<Card, "modelQuote"> & { check: FactCheck | null };
export type StoredCard = CheckedCard & { id: number };

export interface TranscriptRequest {
  session: string;
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

export interface SessionRequest {
  turnstileToken: string;
}

export interface SessionResponse {
  session: string;
}

/** Why the Worker refused. The page turns each code into a message. */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "bot_check"
  | "video_not_found"
  | "session_invalid"
  | "too_fast"
  | "rate_limited"
  | "ip_sessions"
  | "ip_videos"
  | "daily_videos"
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
