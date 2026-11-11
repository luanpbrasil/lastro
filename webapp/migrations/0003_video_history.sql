-- Counters for the "Vídeos já analisados" list, so it is one indexed query instead of a scan of every card.
ALTER TABLE videos ADD COLUMN card_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE videos ADD COLUMN fact_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE videos ADD COLUMN analysed_at INTEGER;

UPDATE videos SET
  card_count = (SELECT COUNT(*) FROM cards WHERE cards.video_id = videos.id),
  fact_count = (SELECT COUNT(*) FROM cards WHERE cards.video_id = videos.id AND json_extract(cards.card, '$.kind') = 'fact'),
  analysed_at = (SELECT MAX(created_at) FROM chunks WHERE chunks.video_id = videos.id AND status = 'done');

CREATE INDEX videos_by_analysed ON videos (analysed_at);
