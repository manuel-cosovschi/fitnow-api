-- FitNow schema (MVP completo)

-- ─────────────────────────────────────────────
-- Usuarios
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120)  NOT NULL,
  email        VARCHAR(190)  UNIQUE,
  password_hash VARCHAR(255),
  role         VARCHAR(20)   NOT NULL DEFAULT 'user',
  provider     VARCHAR(20)   NOT NULL DEFAULT 'email',
  apple_sub    VARCHAR(200)  NULL,
  google_sub   VARCHAR(200)  NULL,
  phone        VARCHAR(30)   NULL,
  units        VARCHAR(10)   NULL,
  language     VARCHAR(10)   NULL,
  photo_url    VARCHAR(500)  NULL,
  pref_goal_km FLOAT         NULL,
  pref_surface VARCHAR(50)   NULL,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   TIMESTAMP     NULL DEFAULT NULL
);

-- ─────────────────────────────────────────────
-- Actividades
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(160) NOT NULL,
  description TEXT,
  modality    ENUM('gimnasio','outdoor','clase','torneo') DEFAULT 'clase',
  difficulty  ENUM('baja','media','alta') DEFAULT 'media',
  location    VARCHAR(200),
  price       DECIMAL(10,2) DEFAULT 0,
  date_start  DATETIME,
  date_end    DATETIME,
  lat         DECIMAL(10,7) NULL,
  lng         DECIMAL(10,7) NULL,
  capacity    INT           DEFAULT 20,
  seats_left  INT           DEFAULT 20,
  rules       JSON          NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Sesiones de actividad (clases recurrentes)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_sessions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT           NOT NULL,
  start_at    DATETIME      NOT NULL,
  end_at      DATETIME      NOT NULL,
  capacity    INT           DEFAULT 20,
  price       DECIMAL(10,2) DEFAULT 0,
  seats_left  INT           DEFAULT 20,
  level       VARCHAR(30)   NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_as_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- Inscripciones (membresías y reservas de sesión)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT           NOT NULL,
  activity_id INT           NOT NULL,
  session_id  INT           NULL,
  start_at    DATETIME      NULL,
  end_at      DATETIME      NULL,
  price_paid  DECIMAL(10,2) NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_session (user_id, session_id),
  CONSTRAINT fk_en_user     FOREIGN KEY (user_id)     REFERENCES users(id)              ON DELETE CASCADE,
  CONSTRAINT fk_en_activity FOREIGN KEY (activity_id) REFERENCES activities(id)         ON DELETE CASCADE,
  CONSTRAINT fk_en_session  FOREIGN KEY (session_id)  REFERENCES activity_sessions(id)  ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- Rutas de running
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_routes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(160)  NOT NULL,
  city            VARCHAR(100)  NULL,
  distance_m      INT           NOT NULL DEFAULT 0,
  duration_s      INT           NULL,
  elevation_up_m  INT           NOT NULL DEFAULT 0,
  polyline        MEDIUMTEXT    NOT NULL,
  center_lat      DOUBLE        NOT NULL DEFAULT 0,
  center_lng      DOUBLE        NOT NULL DEFAULT 0,
  bbox_min_lat    DOUBLE        NOT NULL DEFAULT 0,
  bbox_min_lng    DOUBLE        NOT NULL DEFAULT 0,
  bbox_max_lat    DOUBLE        NOT NULL DEFAULT 0,
  bbox_max_lng    DOUBLE        NOT NULL DEFAULT 0,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Feedback de rutas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_feedback (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  route_id   INT           NOT NULL,
  user_id    INT           NOT NULL,
  rating     TINYINT       NOT NULL DEFAULT 3,
  notes      TEXT          NULL,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rf_route FOREIGN KEY (route_id) REFERENCES run_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_rf_user  FOREIGN KEY (user_id)  REFERENCES users(id)      ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- Hazards (peligros en mapa)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hazards (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT           NOT NULL,
  lat        DOUBLE        NOT NULL,
  lng        DOUBLE        NOT NULL,
  type       VARCHAR(50)   NOT NULL,
  note       TEXT          NULL,
  severity   TINYINT       NOT NULL DEFAULT 1,
  votes      INT           NOT NULL DEFAULT 1,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hz_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- Deportes y providers
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sports (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS provider_sports (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  sport_id    INT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uniq_ps (provider_id, sport_id),
  CONSTRAINT fk_ps_user  FOREIGN KEY (provider_id) REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ps_sport FOREIGN KEY (sport_id)    REFERENCES sports(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_hours (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  weekday     TINYINT NOT NULL COMMENT '0=Mon … 6=Sun',
  open_time   TIME NOT NULL DEFAULT '00:00:00',
  close_time  TIME NOT NULL DEFAULT '00:00:00',
  closed      TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_ph (provider_id, weekday),
  CONSTRAINT fk_ph_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
