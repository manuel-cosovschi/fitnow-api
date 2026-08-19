-- FitNow — Cobro directo a los proveedores (split de pagos)
--
-- Corre después de schema.sql porque referencia providers(id) y provider_ledger.
-- ───────────────────────────────────────────────────────────────────────────
-- Cuentas de cobro de los proveedores (split de pagos).
--
-- Cuando un proveedor conecta su cuenta de MercadoPago, el cobro de sus
-- actividades va directo a esa cuenta y MP nos deposita la comisión: no pasa
-- plata ajena por la cuenta de la plataforma ni hay que liquidar por CBU.
--
-- Los tokens se guardan cifrados (ver src/utils/secretBox.js): permiten cobrar
-- en nombre del proveedor, así que no pueden estar en texto plano.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_payment_accounts (
  id                    SERIAL       PRIMARY KEY,
  provider_id           INT          NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  platform              VARCHAR(20)  NOT NULL DEFAULT 'mercadopago'
                          CHECK (platform IN ('mercadopago')),
  external_user_id      VARCHAR(60)  NOT NULL,
  access_token_enc      TEXT         NOT NULL,
  refresh_token_enc     TEXT,
  public_key            VARCHAR(200),
  live_mode             BOOLEAN      NOT NULL DEFAULT TRUE,
  expires_at            TIMESTAMPTZ,
  status                VARCHAR(20)  NOT NULL DEFAULT 'connected'
                          CHECK (status IN ('connected','expired','revoked')),
  connected_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

-- Un proveedor tiene una sola cuenta por plataforma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payment_account
  ON provider_payment_accounts (provider_id, platform);

-- Una misma cuenta de MercadoPago no puede quedar conectada a dos proveedores.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payment_external
  ON provider_payment_accounts (platform, external_user_id)
  WHERE status = 'connected';

-- ───────────────────────────────────────────────────────────────────────────
-- Cómo se liquidó cada movimiento del libro del proveedor:
--   platform → lo cobró la plataforma y se lo debe (se retira por CBU)
--   direct   → fue directo a la cuenta del proveedor, no genera saldo
-- Sin esta distinción, un cobro directo inflaría el saldo retirable y se
-- terminaría pagando dos veces lo mismo.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS settlement VARCHAR(20) NOT NULL DEFAULT 'platform';
ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS gateway_ref VARCHAR(120);
