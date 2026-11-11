-- Every transcript upload with a valid session, kept for LOG_RETENTION_DAYS to investigate abuse.
-- Nothing about the sender is stored: no IP, country or browser. The session hash only groups one listening session.
CREATE TABLE transcript_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  -- "accepted", "skipped" (already covered) or the refusal code
  outcome TEXT NOT NULL,
  -- every segment as received, after cleaning
  segments TEXT NOT NULL
);
CREATE INDEX transcript_log_by_time ON transcript_log (created_at);
CREATE INDEX transcript_log_by_video ON transcript_log (video_id);
