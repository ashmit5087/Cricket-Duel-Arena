-- ============================================================
-- Cricket DNA — Full Database Schema
-- Run once via docker-compose volume mount on first boot
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- fuzzy search on player names

-- ============================================================
-- PLAYERS
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_id         TEXT UNIQUE NOT NULL,        -- e.g. "virat-kohli"
  cricbuzz_player_id  TEXT UNIQUE,                 -- cricbuzz numeric id
  name                TEXT NOT NULL,
  full_name           TEXT,
  country             TEXT NOT NULL DEFAULT 'Unknown',
  flag                TEXT DEFAULT '🏏',
  role                TEXT NOT NULL DEFAULT 'Batter', -- Batter | Bowler | All-Rounder | Wicket-Keeper
  batting_style       TEXT,
  bowling_style       TEXT,
  date_of_birth       DATE,
  archetype_id        TEXT NOT NULL DEFAULT 'A',
  archetype_name      TEXT,
  dna_score           NUMERIC(5,2) DEFAULT 50,
  elo_rating          NUMERIC(8,2) DEFAULT 1500,
  aura_label          TEXT DEFAULT 'Rising',       -- Ice Cold | Inferno Mode | Chase Beast | etc.
  aura_score          NUMERIC(5,2) DEFAULT 50,
  image_url           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_internal_id ON players(internal_id);
CREATE INDEX IF NOT EXISTS idx_players_name_trgm ON players USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_players_country ON players(country);
CREATE INDEX IF NOT EXISTS idx_players_archetype ON players(archetype_id);

-- ============================================================
-- PLAYER CAREER STATS (aggregated per format)
-- ============================================================

CREATE TABLE IF NOT EXISTS player_career_stats (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  format      TEXT NOT NULL CHECK (format IN ('TEST','ODI','T20I','IPL')),
  matches     INT DEFAULT 0,
  innings     INT DEFAULT 0,
  runs        INT DEFAULT 0,
  avg         NUMERIC(6,2) DEFAULT 0,
  sr          NUMERIC(6,2) DEFAULT 0,
  hundreds    INT DEFAULT 0,
  fifties     INT DEFAULT 0,
  highest     TEXT DEFAULT '0',
  wickets     INT DEFAULT 0,
  bowl_avg    NUMERIC(6,2) DEFAULT 0,
  economy     NUMERIC(5,2) DEFAULT 0,
  best_bowl   TEXT DEFAULT '-',
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  stats_source TEXT NOT NULL DEFAULT 'rapidapi',     -- 'scraper' | 'rapidapi' (Task 3)
  UNIQUE(player_id, format)
);

CREATE INDEX IF NOT EXISTS idx_career_stats_player ON player_career_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_career_stats_source ON player_career_stats(stats_source);

-- ============================================================
-- MATCHES
-- ============================================================

CREATE TABLE IF NOT EXISTS matches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cricbuzz_match_id TEXT UNIQUE NOT NULL,
  series_name       TEXT,
  match_type        TEXT NOT NULL DEFAULT 'T20',    -- TEST | ODI | T20 | IPL
  status            TEXT NOT NULL DEFAULT 'upcoming', -- live | completed | upcoming
  team_a            TEXT NOT NULL,
  team_b            TEXT NOT NULL,
  venue             TEXT,
  start_time        TIMESTAMPTZ,
  result            TEXT,
  winning_team      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_cricbuzz_id ON matches(cricbuzz_match_id);

-- ============================================================
-- INNINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS innings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number  INT NOT NULL CHECK (innings_number IN (1,2,3,4)),
  batting_team    TEXT NOT NULL,
  bowling_team    TEXT NOT NULL,
  runs            INT DEFAULT 0,
  wickets         INT DEFAULT 0,
  overs           NUMERIC(5,1) DEFAULT 0,
  extras          INT DEFAULT 0,
  is_complete     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, innings_number)
);

-- ============================================================
-- BALL EVENTS (every ball stored for ML training)
-- ============================================================

CREATE TABLE IF NOT EXISTS ball_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id      UUID NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  over_number     INT NOT NULL,
  ball_number     INT NOT NULL,
  batsman_id      UUID REFERENCES players(id),
  bowler_id       UUID REFERENCES players(id),
  runs_scored     INT NOT NULL DEFAULT 0,
  extras          INT DEFAULT 0,
  extra_type      TEXT,                             -- wide | noball | bye | legbye
  is_wicket       BOOLEAN DEFAULT FALSE,
  wicket_type     TEXT,                             -- bowled | lbw | caught | runout | etc.
  shot_type       TEXT,
  commentary      TEXT,
  team_score_at   INT,                              -- team score at this ball
  required_rate   NUMERIC(5,2),                    -- for chases
  momentum_delta  NUMERIC(5,2),                    -- ML computed
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ball_events_match ON ball_events(match_id);
CREATE INDEX IF NOT EXISTS idx_ball_events_innings ON ball_events(innings_id);
CREATE INDEX IF NOT EXISTS idx_ball_events_batsman ON ball_events(batsman_id);
CREATE INDEX IF NOT EXISTS idx_ball_events_bowler ON ball_events(bowler_id);

-- ============================================================
-- BATTLE OUTCOMES
-- ============================================================

CREATE TABLE IF NOT EXISTS battle_outcomes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_a_id     UUID NOT NULL REFERENCES players(id),
  player_b_id     UUID NOT NULL REFERENCES players(id),
  match_id        UUID REFERENCES matches(id),
  battle_context  TEXT NOT NULL DEFAULT 'career',   -- career | live | format
  format          TEXT,
  winner_id       UUID REFERENCES players(id),
  dna_similarity  NUMERIC(5,2),
  ml_confidence   NUMERIC(5,2),                    -- XGBoost confidence
  narrative       TEXT,                             -- Gemini-generated
  ml_verdicts     JSONB,                             -- full multi-algorithm verdicts + judge
  momentum_a      NUMERIC(5,2),
  momentum_b      NUMERIC(5,2),
  elo_change_a    NUMERIC(6,2),
  elo_change_b    NUMERIC(6,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battles_player_a ON battle_outcomes(player_a_id);
CREATE INDEX IF NOT EXISTS idx_battles_player_b ON battle_outcomes(player_b_id);
CREATE INDEX IF NOT EXISTS idx_battles_created ON battle_outcomes(created_at DESC);

-- ============================================================
-- MOMENTUM HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS momentum_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id      UUID REFERENCES matches(id),
  score         NUMERIC(5,2) NOT NULL,
  phase         TEXT,                               -- powerplay | middle | death
  context       TEXT,                               -- chase | defend | neutral
  computed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_momentum_player ON momentum_history(player_id, computed_at DESC);

-- ============================================================
-- ARCHETYPE EVOLUTION
-- ============================================================

CREATE TABLE IF NOT EXISTS archetype_evolution (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  archetype_id  TEXT NOT NULL,
  archetype_name TEXT NOT NULL,
  confidence    NUMERIC(5,2),
  trigger_event TEXT,                              -- what caused the change
  valid_from    TIMESTAMPTZ DEFAULT NOW(),
  valid_until   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_archetype_player ON archetype_evolution(player_id, valid_from DESC);

-- ============================================================
-- AURA HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS aura_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  aura_label  TEXT NOT NULL,
  aura_score  NUMERIC(5,2) NOT NULL,
  reason      TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aura_player ON aura_history(player_id, recorded_at DESC);

-- ============================================================
-- RIVALRY HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS rivalries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_a_id     UUID NOT NULL REFERENCES players(id),
  player_b_id     UUID NOT NULL REFERENCES players(id),
  battles_total   INT DEFAULT 0,
  player_a_wins   INT DEFAULT 0,
  player_b_wins   INT DEFAULT 0,
  current_streak_holder UUID REFERENCES players(id),
  streak_count    INT DEFAULT 0,
  dominance_score NUMERIC(5,2) DEFAULT 50,         -- 0-100, 50 = even
  heat_score      NUMERIC(5,2) DEFAULT 0,           -- intensity of rivalry
  last_battle_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_a_id, player_b_id)
);

-- ============================================================
-- ELO RATINGS (updated after every battle)
-- ============================================================

CREATE TABLE IF NOT EXISTS elo_ratings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating      NUMERIC(8,2) NOT NULL DEFAULT 1500,
  format      TEXT DEFAULT 'overall',
  wins        INT DEFAULT 0,
  losses      INT DEFAULT 0,
  peak_rating NUMERIC(8,2) DEFAULT 1500,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, format)
);

-- ============================================================
-- STREAK TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS streaks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  streak_type     TEXT NOT NULL,                   -- battle_win | form | clutch | pressure
  current_count   INT DEFAULT 0,
  best_count      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  UNIQUE(player_id, streak_type)
);

-- ============================================================
-- LIVE MATCH STATE (fast lookup, also in Redis)
-- ============================================================

CREATE TABLE IF NOT EXISTS live_match_state (
  match_id          UUID PRIMARY KEY REFERENCES matches(id),
  current_innings   INT DEFAULT 1,
  batting_team      TEXT,
  bowling_team      TEXT,
  team_score        INT DEFAULT 0,
  wickets           INT DEFAULT 0,
  current_over      NUMERIC(4,1) DEFAULT 0,
  last_ball         TEXT,
  required_runs     INT,
  required_rate     NUMERIC(5,2),
  current_batsman_a TEXT,
  current_batsman_b TEXT,
  current_bowler    TEXT,
  momentum_score    NUMERIC(5,2) DEFAULT 50,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT auto-trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_live_state_updated_at
  BEFORE UPDATE ON live_match_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- QUIZ ATTEMPTS (result only — questions are NOT stored)
-- ============================================================

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id     TEXT NOT NULL,
  user_id     TEXT,
  score       INT NOT NULL,
  max_score   INT NOT NULL,
  percentage  INT NOT NULL,
  tier        TEXT NOT NULL,
  answers     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz
  ON quiz_attempts(quiz_id, score DESC);
