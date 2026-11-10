-- Claude Haiku (Anthropic API, billed in dollars) is the main model; Workers AI (neurons) is the fallback.
ALTER TABLE usage_daily ADD COLUMN usd REAL NOT NULL DEFAULT 0;
ALTER TABLE chunks ADD COLUMN usd REAL NOT NULL DEFAULT 0;
ALTER TABLE chunks ADD COLUMN model TEXT;
