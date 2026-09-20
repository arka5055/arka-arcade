CREATE TABLE IF NOT EXISTS arcade_progress (
  player_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
