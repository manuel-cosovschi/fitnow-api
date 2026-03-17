-- FitNow — Esquema completo PostgreSQL (Supabase)
-- Tablas ordenadas por dependencias de FK

-- providers
CREATE TABLE IF NOT EXISTS providers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  kind        VARCHAR(20)  NOT NULL DEFAULT 'gym'
                CHECK (kind IN ('gym','trainer','club','studio','other')),
  description TEXT,
  address     VARCHAR(300),
  city        VARCHAR(100),
  lat         DECIMAL(10,7),
  lng         DECIMAL(10,7),
  phone       VARCHAR(30),
  website_url VARCHAR(500),
  logo_url    VARCHAR(500),
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','suspended')),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_providers_city   ON providers(city);
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_kind   ON providers(kind);

-- sports
CREATE TABLE IF NOT EXISTS sports (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) UNIQUE,
  password_hash VARCHAR(255),
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',
  provider_id   INT          REFERENCES providers(id) ON DELETE SET NULL,
  provider      VARCHAR(20)  NOT NULL DEFAULT 'email',
  apple_sub     VARCHAR(200),
  google_sub    VARCHAR(200),
  phone         VARCHAR(30),
  units         VARCHAR(10),
  language      VARCHAR(10),
  photo_url     VARCHAR(500),
  bio           TEXT,
  pref_goal_km  FLOAT,
  pref_surface  VARCHAR(50),
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);

-- activities
CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  provider_id INT           REFERENCES providers(id) ON DELETE SET NULL,
  sport_id    INT           REFERENCES sports(id)    ON DELETE SET NULL,
  kind        VARCHAR(40)   DEFAULT 'gym',
  status      VARCHAR(20)   NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft','active','cancelled')),
  title       VARCHAR(160)  NOT NULL,
  description TEXT,
  modality    VARCHAR(20)   DEFAULT 'clase'
                CHECK (modality IN ('gimnasio','outdoor','clase','torneo')),
  difficulty  VARCHAR(10)   DEFAULT 'media'
                CHECK (difficulty IN ('baja','media','alta')),
  location    VARCHAR(200),
  price       DECIMAL(10,2) DEFAULT 0,
  date_start  TIMESTAMPTZ,
  date_end    TIMESTAMPTZ,
  lat         DECIMAL(10,7),
  lng         DECIMAL(10,7),
  capacity    INT           DEFAULT 20,
  seats_left  INT           DEFAULT 20,
  rules       JSONB,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_act_provider_id ON activities(provider_id);
CREATE INDEX IF NOT EXISTS idx_act_sport_id    ON activities(sport_id);
CREATE INDEX IF NOT EXISTS idx_act_status      ON activities(status);
CREATE INDEX IF NOT EXISTS idx_act_date_start  ON activities(date_start);

-- activity_sessions
CREATE TABLE IF NOT EXISTS activity_sessions (
  id          SERIAL PRIMARY KEY,
  activity_id INT            NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_at    TIMESTAMPTZ    NOT NULL,
  end_at      TIMESTAMPTZ    NOT NULL,
  capacity    INT            DEFAULT 20,
  price       DECIMAL(10,2)  DEFAULT 0,
  seats_left  INT            DEFAULT 20,
  level       VARCHAR(30),
  created_at  TIMESTAMPTZ    DEFAULT NOW()
);

-- enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id          SERIAL PRIMARY KEY,
  user_id     INT           NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
  activity_id INT           NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,
  session_id  INT           REFERENCES activity_sessions(id)          ON DELETE CASCADE,
  price_paid  DECIMAL(10,2) NOT NULL DEFAULT 0,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  status      VARCHAR(20)   NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','cancelled')),
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enr_session_id ON enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_enr_status     ON enrollments(status);

-- run_routes
CREATE TABLE IF NOT EXISTS run_routes (
  id               SERIAL PRIMARY KEY,
  provider_id      INT              REFERENCES providers(id) ON DELETE SET NULL,
  title            VARCHAR(160)     NOT NULL,
  description      TEXT,
  city             VARCHAR(100),
  surface          VARCHAR(20)      NOT NULL DEFAULT 'road'
                     CHECK (surface IN ('road','trail','mixed')),
  difficulty       VARCHAR(10)      NOT NULL DEFAULT 'media'
                     CHECK (difficulty IN ('baja','media','alta')),
  distance_m       INT              NOT NULL DEFAULT 0,
  duration_s       INT,
  elevation_up_m   INT              NOT NULL DEFAULT 0,
  elevation_down_m INT              NOT NULL DEFAULT 0,
  polyline         TEXT             NOT NULL,
  center_lat       DOUBLE PRECISION NOT NULL DEFAULT 0,
  center_lng       DOUBLE PRECISION NOT NULL DEFAULT 0,
  bbox_min_lat     DOUBLE PRECISION NOT NULL DEFAULT 0,
  bbox_min_lng     DOUBLE PRECISION NOT NULL DEFAULT 0,
  bbox_max_lat     DOUBLE PRECISION NOT NULL DEFAULT 0,
  bbox_max_lng     DOUBLE PRECISION NOT NULL DEFAULT 0,
  thumbnail_url    VARCHAR(500),
  status           VARCHAR(20)      NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ      DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rr_center  ON run_routes(center_lat, center_lng);
CREATE INDEX IF NOT EXISTS idx_rr_status  ON run_routes(status);
CREATE INDEX IF NOT EXISTS idx_rr_surface ON run_routes(surface);

-- run_feedback
CREATE TABLE IF NOT EXISTS run_feedback (
  id                   SERIAL PRIMARY KEY,
  route_id             INT       NOT NULL REFERENCES run_routes(id) ON DELETE CASCADE,
  user_id              INT       NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  session_id           INT,
  rating               SMALLINT  NOT NULL DEFAULT 3,
  notes                TEXT,
  fatigue_level        SMALLINT,
  perceived_difficulty SMALLINT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, route_id)
);

-- hazards
CREATE TABLE IF NOT EXISTS hazards (
  id         SERIAL           PRIMARY KEY,
  user_id    INT              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  type       VARCHAR(50)      NOT NULL,
  note       TEXT,
  severity   SMALLINT         NOT NULL DEFAULT 1,
  votes      INT              NOT NULL DEFAULT 1,
  status     VARCHAR(20)      NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','resolved','removed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ      DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hz_location ON hazards(lat, lng);
CREATE INDEX IF NOT EXISTS idx_hz_status   ON hazards(status);

-- hazard_votes
CREATE TABLE IF NOT EXISTS hazard_votes (
  hazard_id  INT         NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id    INT         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hazard_id, user_id)
);

-- provider_sports
CREATE TABLE IF NOT EXISTS provider_sports (
  id          SERIAL PRIMARY KEY,
  provider_id INT          NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  sport_id    INT          NOT NULL REFERENCES sports(id)    ON DELETE CASCADE,
  description VARCHAR(255),
  UNIQUE (provider_id, sport_id)
);

-- provider_hours
CREATE TABLE IF NOT EXISTS provider_hours (
  id          SERIAL   PRIMARY KEY,
  provider_id INT      NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL,
  open_time   TIME     NOT NULL DEFAULT '00:00:00',
  close_time  TIME     NOT NULL DEFAULT '00:00:00',
  closed      BOOLEAN  NOT NULL DEFAULT FALSE,
  UNIQUE (provider_id, weekday)
);

-- run_sessions
CREATE TABLE IF NOT EXISTS run_sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INT              NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  route_id         INT              REFERENCES run_routes(id)          ON DELETE SET NULL,
  origin_lat       DECIMAL(10,7),
  origin_lng       DECIMAL(10,7),
  started_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  status           VARCHAR(20)      NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','abandoned')),
  duration_s       INT,
  distance_m       INT,
  avg_pace_s       SMALLINT,
  avg_speed_mps    DECIMAL(5,2),
  avg_hr_bpm       SMALLINT,
  deviates_count   SMALLINT         NOT NULL DEFAULT 0,
  max_elevation_m  SMALLINT,
  min_elevation_m  SMALLINT,
  device           VARCHAR(120),
  created_at       TIMESTAMPTZ      DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsessions_user_id    ON run_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rsessions_route_id   ON run_sessions(route_id);
CREATE INDEX IF NOT EXISTS idx_rsessions_status     ON run_sessions(status);
CREATE INDEX IF NOT EXISTS idx_rsessions_started_at ON run_sessions(started_at);

-- run_telemetry_points
CREATE TABLE IF NOT EXISTS run_telemetry_points (
  id          BIGSERIAL        PRIMARY KEY,
  session_id  INT              NOT NULL REFERENCES run_sessions(id) ON DELETE CASCADE,
  ts_ms       BIGINT           NOT NULL,
  lat         DECIMAL(10,7)    NOT NULL,
  lng         DECIMAL(10,7)    NOT NULL,
  speed_mps   DECIMAL(5,2),
  pace_s      SMALLINT,
  elevation_m DECIMAL(7,2),
  hr_bpm      SMALLINT,
  off_route   BOOLEAN          NOT NULL DEFAULT FALSE,
  accuracy_m  DECIMAL(6,2)
);
CREATE INDEX IF NOT EXISTS idx_rtp_session_id ON run_telemetry_points(session_id);
CREATE INDEX IF NOT EXISTS idx_rtp_ts         ON run_telemetry_points(session_id, ts_ms);

-- ai_weights
CREATE TABLE IF NOT EXISTS ai_weights (
  id           SERIAL       PRIMARY KEY,
  version      VARCHAR(50)  NOT NULL,
  label        VARCHAR(200),
  w_distance   DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
  w_elev       DECIMAL(6,4) NOT NULL DEFAULT 0.1500,
  w_hz_cnt     DECIMAL(6,4) NOT NULL DEFAULT 0.2500,
  w_hz_sev     DECIMAL(6,4) NOT NULL DEFAULT 0.2500,
  w_feedback   DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
  w_popularity DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
  is_active    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aiw_active ON ai_weights(is_active);

-- news
CREATE TABLE IF NOT EXISTS news (
  id         SERIAL       PRIMARY KEY,
  icon       VARCHAR(50),
  title      VARCHAR(200) NOT NULL,
  subtitle   VARCHAR(500),
  color      VARCHAR(20),
  url        VARCHAR(500),
  starts_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ends_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_dates ON news(starts_at, ends_at);

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL      PRIMARY KEY,
  user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token   ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent ALTER TABLE statements for existing deployments
-- These fix constraint mismatches between API (English) and legacy DB (Spanish).
-- migrate.js ignores duplicate_object (42710) so these are safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- activities.difficulty: restore Spanish values
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_difficulty_check;
ALTER TABLE activities ADD CONSTRAINT activities_difficulty_check
  CHECK (difficulty IN ('baja','media','alta'));
ALTER TABLE activities ALTER COLUMN difficulty SET DEFAULT 'media';

-- activities.modality: restore Spanish values
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_modality_check;
ALTER TABLE activities ADD CONSTRAINT activities_modality_check
  CHECK (modality IN ('gimnasio','outdoor','clase','torneo'));
ALTER TABLE activities ALTER COLUMN modality SET DEFAULT 'clase';

-- run_routes.difficulty: restore Spanish values
ALTER TABLE run_routes DROP CONSTRAINT IF EXISTS run_routes_difficulty_check;
ALTER TABLE run_routes ADD CONSTRAINT run_routes_difficulty_check
  CHECK (difficulty IN ('baja','media','alta'));
ALTER TABLE run_routes ALTER COLUMN difficulty SET DEFAULT 'media';

-- users.bio: add if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- activities: new provider-configurable flags
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE activities ADD COLUMN IF NOT EXISTS enable_running    BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS enable_deposit    BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS deposit_percent   SMALLINT      NOT NULL DEFAULT 50;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS has_capacity_limit BOOLEAN      NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- enrollments: plan and payment fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS plan_name       VARCHAR(100);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS plan_price      DECIMAL(10,2);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS payment_type    VARCHAR(20)   NOT NULL DEFAULT 'full'
                          CHECK (payment_type IN ('full','deposit'));
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(20)   NOT NULL DEFAULT 'card'
                          CHECK (payment_method IN ('card','transfer'));

-- ─────────────────────────────────────────────────────────────────────────────
-- offers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id             SERIAL        PRIMARY KEY,
  title          VARCHAR(200)  NOT NULL,
  description    TEXT,
  discount_label VARCHAR(60)   NOT NULL,
  activity_kind  VARCHAR(40),
  provider_id    INT           REFERENCES providers(id) ON DELETE CASCADE,
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  valid_until    TIMESTAMPTZ,
  icon_name      VARCHAR(100),
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offers_status      ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_provider_id ON offers(provider_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- offers: add new fields (discount_percent, valid_from, rejection_reason, updated_at)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE offers ALTER COLUMN discount_label DROP NOT NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS discount_percent  INT         CHECK (discount_percent BETWEEN 1 AND 100);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS valid_from        TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();
