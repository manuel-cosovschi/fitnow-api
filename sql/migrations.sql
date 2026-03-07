-- ============================================================
-- FitNow — Migrations sobre schema existente
-- Ejecutar UNA VEZ sobre una DB que ya tiene schema.sql
-- Todos los ALTER usan IF NOT EXISTS via column check
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PROVIDERS (faltaba por completo)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200)  NOT NULL,
  kind        ENUM('gym','trainer','club','studio','other') NOT NULL DEFAULT 'gym',
  description TEXT          NULL,
  address     VARCHAR(300)  NULL,
  city        VARCHAR(100)  NULL,
  lat         DECIMAL(10,7) NULL,
  lng         DECIMAL(10,7) NULL,
  phone       VARCHAR(30)   NULL,
  website_url VARCHAR(500)  NULL,
  logo_url    VARCHAR(500)  NULL,
  status      ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_providers_city   (city),
  INDEX idx_providers_status (status),
  INDEX idx_providers_kind   (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 2. NEWS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  icon       VARCHAR(50)   NULL,
  title      VARCHAR(200)  NOT NULL,
  subtitle   VARCHAR(500)  NULL,
  color      VARCHAR(20)   NULL,
  url        VARCHAR(500)  NULL,
  starts_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at    DATETIME      NULL,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_news_dates (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 3. RUN SESSIONS (reemplaza telemetría en memoria)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT           NOT NULL,
  route_id         INT           NULL,
  origin_lat       DECIMAL(10,7) NULL,
  origin_lng       DECIMAL(10,7) NULL,
  started_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME      NULL,
  status           ENUM('active','completed','abandoned') NOT NULL DEFAULT 'active',
  duration_s       INT           NULL,
  distance_m       INT           NULL,
  avg_pace_s       SMALLINT      NULL,
  avg_speed_mps    DECIMAL(5,2)  NULL,
  avg_hr_bpm       SMALLINT      NULL,
  deviates_count   SMALLINT      NOT NULL DEFAULT 0,
  max_elevation_m  SMALLINT      NULL,
  min_elevation_m  SMALLINT      NULL,
  device           VARCHAR(120)  NULL,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rsessions_user_id    (user_id),
  INDEX idx_rsessions_route_id   (route_id),
  INDEX idx_rsessions_status     (status),
  INDEX idx_rsessions_started_at (started_at),
  CONSTRAINT fk_rsessions_user  FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rsessions_route FOREIGN KEY (route_id) REFERENCES run_routes(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 4. RUN TELEMETRY POINTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_telemetry_points (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT           NOT NULL,
  ts_ms        BIGINT        NOT NULL,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  speed_mps    DECIMAL(5,2)  NULL,
  pace_s       SMALLINT      NULL,
  elevation_m  DECIMAL(7,2)  NULL,
  hr_bpm       SMALLINT      NULL,
  off_route    TINYINT(1)    NOT NULL DEFAULT 0,
  accuracy_m   DECIMAL(6,2)  NULL,
  INDEX idx_rtp_session_id (session_id),
  INDEX idx_rtp_ts         (session_id, ts_ms),
  CONSTRAINT fk_rtp_session FOREIGN KEY (session_id) REFERENCES run_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 5. AI WEIGHTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_weights (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  version      VARCHAR(50)  NOT NULL,
  label        VARCHAR(200) NULL,
  w_distance   DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
  w_elev       DECIMAL(6,4) NOT NULL DEFAULT 0.1500,
  w_hz_cnt     DECIMAL(6,4) NOT NULL DEFAULT 0.2500,
  w_hz_sev     DECIMAL(6,4) NOT NULL DEFAULT 0.2500,
  w_feedback   DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
  w_popularity DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
  is_active    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aiw_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 6. HAZARD VOTES (evitar votos duplicados)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hazard_votes (
  hazard_id  INT NOT NULL,
  user_id    INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (hazard_id, user_id),
  CONSTRAINT fk_hv_hazard FOREIGN KEY (hazard_id) REFERENCES hazards(id) ON DELETE CASCADE,
  CONSTRAINT fk_hv_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 7. ALTER ACTIVITIES — columnas faltantes
-- ─────────────────────────────────────────────
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS provider_id INT          NULL           AFTER id,
  ADD COLUMN IF NOT EXISTS sport_id    INT          NULL           AFTER provider_id,
  ADD COLUMN IF NOT EXISTS kind        VARCHAR(40)  DEFAULT 'gym'  AFTER sport_id,
  ADD COLUMN IF NOT EXISTS status      ENUM('draft','active','cancelled') NOT NULL DEFAULT 'active' AFTER kind,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE activities
  ADD INDEX IF NOT EXISTS idx_act_provider_id (provider_id),
  ADD INDEX IF NOT EXISTS idx_act_sport_id    (sport_id),
  ADD INDEX IF NOT EXISTS idx_act_status      (status),
  ADD INDEX IF NOT EXISTS idx_act_date_start  (date_start);

-- ─────────────────────────────────────────────
-- 8. ALTER RUN_ROUTES — columnas faltantes
-- ─────────────────────────────────────────────
ALTER TABLE run_routes
  ADD COLUMN IF NOT EXISTS provider_id      INT          NULL          AFTER id,
  ADD COLUMN IF NOT EXISTS description      TEXT         NULL          AFTER title,
  ADD COLUMN IF NOT EXISTS surface          ENUM('road','trail','mixed') NOT NULL DEFAULT 'road' AFTER city,
  ADD COLUMN IF NOT EXISTS difficulty       ENUM('baja','media','alta') NOT NULL DEFAULT 'media' AFTER surface,
  ADD COLUMN IF NOT EXISTS elevation_down_m INT          NOT NULL DEFAULT 0 AFTER elevation_up_m,
  ADD COLUMN IF NOT EXISTS thumbnail_url    VARCHAR(500) NULL          AFTER bbox_max_lng,
  ADD COLUMN IF NOT EXISTS status           ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER thumbnail_url,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE run_routes
  ADD INDEX IF NOT EXISTS idx_rr_center  (center_lat, center_lng),
  ADD INDEX IF NOT EXISTS idx_rr_status  (status),
  ADD INDEX IF NOT EXISTS idx_rr_surface (surface);

-- ─────────────────────────────────────────────
-- 9. ALTER RUN_FEEDBACK — columnas faltantes
-- ─────────────────────────────────────────────
ALTER TABLE run_feedback
  ADD COLUMN IF NOT EXISTS session_id          INT     NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS fatigue_level       TINYINT NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS perceived_difficulty TINYINT NULL AFTER fatigue_level;

-- Unique: un feedback por ruta por usuario
ALTER TABLE run_feedback
  ADD UNIQUE KEY IF NOT EXISTS uq_rf_user_route (user_id, route_id);

-- ─────────────────────────────────────────────
-- 10. ALTER HAZARDS — columnas faltantes
-- ─────────────────────────────────────────────
ALTER TABLE hazards
  ADD COLUMN IF NOT EXISTS status     ENUM('active','resolved','removed') NOT NULL DEFAULT 'active' AFTER votes,
  ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER status;

ALTER TABLE hazards
  ADD INDEX IF NOT EXISTS idx_hz_location (lat, lng),
  ADD INDEX IF NOT EXISTS idx_hz_status   (status);

-- ─────────────────────────────────────────────
-- 11. SEEDS INICIALES
-- ─────────────────────────────────────────────

-- Sports
INSERT IGNORE INTO sports (name) VALUES
  ('Running'), ('CrossFit'), ('Yoga'), ('Ciclismo'),
  ('Natación'), ('Pilates'), ('Fútbol'), ('Pádel'),
  ('HIIT'), ('Funcional');

-- AI Weights v1.0
INSERT INTO ai_weights (version, label, w_distance, w_elev, w_hz_cnt, w_hz_sev, w_feedback, w_popularity, is_active)
SELECT 'v1.0', 'Pesos heurísticos iniciales', 0.20, 0.15, 0.25, 0.25, 0.10, 0.05, 1
WHERE NOT EXISTS (SELECT 1 FROM ai_weights WHERE is_active = 1);

-- News de ejemplo
INSERT IGNORE INTO news (icon, title, subtitle, color, starts_at, ends_at) VALUES
  ('🏃', '¡Bienvenido a FitNow!', 'Explorá actividades y rutas de running cerca tuyo.', '#00C27C', NOW(), DATE_ADD(NOW(), INTERVAL 60 DAY));

-- ─────────────────────────────────────────────
-- 12. ALTER ENROLLMENTS — columnas faltantes
-- ─────────────────────────────────────────────
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS session_id  INT     NULL            AFTER activity_id,
  ADD COLUMN IF NOT EXISTS price_paid  DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER session_id,
  ADD COLUMN IF NOT EXISTS start_at    DATETIME NULL           AFTER price_paid,
  ADD COLUMN IF NOT EXISTS end_at      DATETIME NULL           AFTER start_at,
  ADD COLUMN IF NOT EXISTS status      ENUM('active','cancelled') NOT NULL DEFAULT 'active' AFTER end_at;

ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_enr_session_id (session_id),
  ADD INDEX IF NOT EXISTS idx_enr_status     (status);
