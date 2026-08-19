// src/repositories/payoutAccount.repository.js
//
// Cuentas de cobro de los proveedores. Los tokens viajan cifrados hacia y desde
// la base: quien llama trabaja siempre con el texto plano y nunca ve la columna
// `_enc`, así que no hay forma de guardar uno sin cifrar por descuido.
import { query, queryOne } from '../db.js';
import { seal, open } from '../utils/secretBox.js';

const COLS = `id, provider_id, platform, external_user_id, access_token_enc, refresh_token_enc,
              public_key, live_mode, expires_at, status, connected_at, updated_at`;

/** Fila de la base → objeto de dominio, con los tokens ya descifrados. */
function hydrate(row) {
  if (!row) return null;
  const { access_token_enc, refresh_token_enc, ...rest } = row;
  return {
    ...rest,
    access_token:  open(access_token_enc),
    refresh_token: open(refresh_token_enc),
  };
}

export async function findByProvider(providerId, platform = 'mercadopago') {
  return hydrate(await queryOne(
    `SELECT ${COLS} FROM provider_payment_accounts
      WHERE provider_id = ? AND platform = ? LIMIT 1`,
    [providerId, platform]
  ));
}

/** Cuenta conectada y usable. Devuelve null si está revocada o sin token legible. */
export async function findConnected(providerId, platform = 'mercadopago') {
  const account = await findByProvider(providerId, platform);
  if (!account || account.status !== 'connected' || !account.access_token) return null;
  return account;
}

export async function upsert({
  provider_id,
  platform = 'mercadopago',
  external_user_id,
  access_token,
  refresh_token = null,
  public_key = null,
  live_mode = true,
  expires_at = null,
}) {
  await query(
    `INSERT INTO provider_payment_accounts
       (provider_id, platform, external_user_id, access_token_enc, refresh_token_enc,
        public_key, live_mode, expires_at, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', NOW())
     ON CONFLICT (provider_id, platform) DO UPDATE SET
       external_user_id  = EXCLUDED.external_user_id,
       access_token_enc  = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       public_key        = EXCLUDED.public_key,
       live_mode         = EXCLUDED.live_mode,
       expires_at        = EXCLUDED.expires_at,
       status            = 'connected',
       updated_at        = NOW()`,
    [provider_id, platform, String(external_user_id), seal(access_token), seal(refresh_token),
     public_key, live_mode, expires_at]
  );
  return findByProvider(provider_id, platform);
}

/** Guarda los tokens nuevos después de refrescarlos, sin tocar el resto. */
export async function updateTokens(id, { access_token, refresh_token, expires_at }) {
  await query(
    `UPDATE provider_payment_accounts
        SET access_token_enc  = ?,
            refresh_token_enc = COALESCE(?, refresh_token_enc),
            expires_at        = ?,
            status            = 'connected',
            updated_at        = NOW()
      WHERE id = ?`,
    [seal(access_token), refresh_token ? seal(refresh_token) : null, expires_at ?? null, id]
  );
}

/**
 * Marca la cuenta como desconectada. No se borra la fila: sirve para explicar
 * por qué un cobro viejo fue directo y este no.
 */
export async function markStatus(id, status) {
  await query(
    `UPDATE provider_payment_accounts SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id]
  );
}

/** Resuelve la cuenta del proveedor dueño de una inscripción. */
export async function findByEnrollment(enrollmentId, platform = 'mercadopago') {
  const row = await queryOne(
    `SELECT a.provider_id
       FROM enrollments e
       JOIN activities a ON a.id = e.activity_id
      WHERE e.id = ? LIMIT 1`,
    [enrollmentId]
  );
  if (!row?.provider_id) return null;
  return findConnected(row.provider_id, platform);
}
