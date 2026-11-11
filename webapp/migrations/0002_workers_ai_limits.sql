-- Workers AI bills in neurons, and limits now count videos instead of chunks.
DROP TABLE usage_daily;
DROP TABLE ip_daily;
ALTER TABLE chunks RENAME COLUMN cost_usd TO neurons;

CREATE TABLE usage_daily (
  day TEXT PRIMARY KEY,
  neurons REAL NOT NULL DEFAULT 0
);

-- A listening session, granted after the bot check. Only the hash of its token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_chunk_at INTEGER NOT NULL DEFAULT 0,
  chars INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX sessions_by_ip ON sessions (ip_hash);

-- The videos that got analysis each UTC day. A video takes one slot per day, however many people listen to it.
CREATE TABLE daily_videos (
  day TEXT NOT NULL,
  video_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (day, video_id)
) WITHOUT ROWID;
