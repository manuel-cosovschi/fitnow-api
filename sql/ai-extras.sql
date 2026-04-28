-- sql/ai-extras.sql
-- Persistence tables for AI features (coach, gym AI plans, form check).
-- Loaded by migrate.js between schema.sql and seed.sql.
-- All statements are idempotent: re-running on an existing DB is a no-op.

-- ───────────────────────────────────────────────────────────────────────────
-- ai_usage_log: per-call token + cost observability
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                SERIAL       PRIMARY KEY,
  user_id           INT          REFERENCES users(id) ON DELETE SET NULL,
  endpoint          VARCHAR(50)  NOT NULL,  -- e.g. 'coach', 'gym_plan', 'gym_reroute'
  model             VARCHAR(80)  NOT NULL,
  prompt_tokens     INT          NOT NULL DEFAULT 0,
  completion_tokens INT          NOT NULL DEFAULT 0,
  total_tokens      INT          NOT NULL DEFAULT 0,
  cost_estimate_usd DECIMAL(10,6),         -- nullable: filled when pricing table is configured
  status            VARCHAR(20)  NOT NULL DEFAULT 'ok'
                      CHECK (status IN ('ok','stub','error')),
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_endpoint     ON ai_usage_log(endpoint);

-- ───────────────────────────────────────────────────────────────────────────
-- coach_conversations: persistent chat history for the AI Coach
-- One row per turn (user message OR coach reply). Pair them via created_at.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_conversations (
  id           SERIAL        PRIMARY KEY,
  user_id      INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(20)   NOT NULL CHECK (role IN ('user','coach')),
  content      TEXT          NOT NULL,
  tokens       INT,
  ai_mode      VARCHAR(10)   NOT NULL DEFAULT 'real'
                 CHECK (ai_mode IN ('real','stub')),
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_conv_user_created ON coach_conversations(user_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- form_check_sessions: persisted form-check results from the iOS Vision pipeline
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_check_sessions (
  id          SERIAL        PRIMARY KEY,
  user_id     INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise    VARCHAR(20)   NOT NULL CHECK (exercise IN ('squat','pushup','plank','deadlift')),
  score       SMALLINT      NOT NULL CHECK (score BETWEEN 0 AND 100),
  feedback    TEXT          NOT NULL,
  joints_json JSONB,
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fcs_user_created ON form_check_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fcs_exercise     ON form_check_sessions(exercise);
