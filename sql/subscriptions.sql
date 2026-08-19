-- FitNow — Suscripciones (planes free / premium)
--
-- Una fila por suscripción de tienda (App Store o Google Play). El plan
-- efectivo de un usuario se resuelve mirando si tiene alguna fila activa y
-- sin vencer: si no tiene ninguna, es free.
--
-- Corre después de schema.sql porque referencia users(id).

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      SERIAL PRIMARY KEY,
  user_id                 INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform                VARCHAR(10)  NOT NULL
                            CHECK (platform IN ('apple','google','promo')),
  product_id              VARCHAR(120) NOT NULL,
  plan                    VARCHAR(20)  NOT NULL DEFAULT 'premium'
                            CHECK (plan IN ('free','premium')),
  -- active  → vigente
  -- grace   → venció el cobro pero Apple/Google siguen dando acceso
  -- expired → venció y no se renovó
  -- revoked → reembolso o baja forzada (corta el acceso al instante)
  status                  VARCHAR(20)  NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','grace','expired','revoked')),
  -- Apple: originalTransactionId (estable entre renovaciones).
  -- Google: no existe equivalente, se guarda el purchase_token más reciente.
  original_transaction_id VARCHAR(190),
  latest_transaction_id   VARCHAR(190),
  purchase_token          TEXT,
  environment             VARCHAR(20)  NOT NULL DEFAULT 'production'
                            CHECK (environment IN ('production','sandbox')),
  -- Cuando no hay claves de tienda cargadas el recibo se acepta sin validar
  -- criptográficamente y queda marcado acá, igual que el ai_mode de la IA.
  verification            VARCHAR(20)  NOT NULL DEFAULT 'verified'
                            CHECK (verification IN ('verified','unverified')),
  auto_renew              BOOLEAN      NOT NULL DEFAULT TRUE,
  started_at              TIMESTAMPTZ  DEFAULT NOW(),
  expires_at              TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ,
  raw_payload             JSONB,
  created_at              TIMESTAMPTZ  DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  DEFAULT NOW()
);

-- Una suscripción de tienda pertenece a un solo usuario: evita que dos cuentas
-- compartan la misma compra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_apple_original
  ON subscriptions (platform, original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions (user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_expires
  ON subscriptions (expires_at)
  WHERE status IN ('active','grace');

-- Notificaciones de tienda ya procesadas. Apple y Google reintentan el envío,
-- así que guardamos el id para no aplicar dos veces el mismo evento.
CREATE TABLE IF NOT EXISTS store_notifications (
  id            SERIAL       PRIMARY KEY,
  platform      VARCHAR(10)  NOT NULL CHECK (platform IN ('apple','google')),
  notification_id VARCHAR(190) NOT NULL,
  notification_type VARCHAR(60),
  subtype       VARCHAR(60),
  payload       JSONB,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_notifications
  ON store_notifications (platform, notification_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Límite de distancia del plan free sobre las corridas.
-- live_distance_m acumula lo recorrido mientras la sesión está activa, para
-- poder cortar en los 2 km sin recalcular toda la telemetría en cada push.
-- limited_by_plan marca las corridas que se cortaron por el límite.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE run_sessions ADD COLUMN IF NOT EXISTS live_distance_m INT NOT NULL DEFAULT 0;
ALTER TABLE run_sessions ADD COLUMN IF NOT EXISTS limited_by_plan BOOLEAN NOT NULL DEFAULT FALSE;
