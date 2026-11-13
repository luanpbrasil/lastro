-- Only versioned compatible results are reusable. Earlier opaque results stay readable.
CREATE TABLE post_analysis_keys (
  post_id TEXT NOT NULL,
  text_fingerprint TEXT NOT NULL,
  metadata_fingerprint TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  result_id TEXT REFERENCES post_results(id),
  attempt_id TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  PRIMARY KEY (post_id, text_fingerprint, metadata_fingerprint, analysis_version)
);
