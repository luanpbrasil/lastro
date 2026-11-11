-- Where a session's text comes from: speech recognised in the tab (the page) or the video's captions (the
-- Chrome extension). Captions sessions may send faster and have their own cap per video.
ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'speech';
