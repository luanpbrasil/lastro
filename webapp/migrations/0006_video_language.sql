-- The language a video is spoken in (BCP 47, as YouTube writes it), found once so the page can set speech recognition.
ALTER TABLE videos ADD COLUMN lang TEXT;
ALTER TABLE videos ADD COLUMN lang_source TEXT;
