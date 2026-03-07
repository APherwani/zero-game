-- Users table (OAuth accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_id)
);

-- Completed games
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL DEFAULT (datetime('now')),
  num_players INTEGER NOT NULL,
  num_rounds INTEGER NOT NULL,
  winner_id TEXT,
  winner_name TEXT NOT NULL
);

-- Player results per game
CREATE TABLE IF NOT EXISTS game_players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  user_id TEXT REFERENCES users(id),
  player_name TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  final_score INTEGER NOT NULL,
  placement INTEGER NOT NULL,
  UNIQUE(game_id, player_name)
);

CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);

-- Chat messages (stored for moderation review)
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  player_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_game ON chat_messages(game_id);

-- Player reports
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT REFERENCES users(id),
  reported_player_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  message_id TEXT REFERENCES chat_messages(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
