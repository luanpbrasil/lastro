-- Written posts have no video, coverage, session or public recent-history row.
CREATE TABLE post_results (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'empty')),
  cards TEXT NOT NULL,
  analysed_at INTEGER NOT NULL
);
CREATE INDEX post_results_by_post ON post_results (post_id);
