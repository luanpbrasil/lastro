CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- One upload from a listening page. `segments` holds only the parts this chunk was the first to cover.
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES videos(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  segments TEXT NOT NULL,
  error TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX chunks_by_video ON chunks (video_id, end_ms);

-- Which 10-second stretches of a video already have a transcript, so a rewatch or a second viewer costs nothing.
CREATE TABLE coverage (
  video_id TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  chunk_id INTEGER NOT NULL,
  PRIMARY KEY (video_id, bucket)
) WITHOUT ROWID;
CREATE INDEX coverage_by_chunk ON coverage (chunk_id);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES videos(id),
  chunk_id INTEGER NOT NULL REFERENCES chunks(id),
  start_ms INTEGER NOT NULL,
  card TEXT NOT NULL
);
CREATE INDEX cards_by_video ON cards (video_id, id);

CREATE TABLE usage_daily (
  day TEXT PRIMARY KEY,
  chunks INTEGER NOT NULL DEFAULT 0,
  spend_usd REAL NOT NULL DEFAULT 0
);

CREATE TABLE ip_daily (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  chunks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
) WITHOUT ROWID;
