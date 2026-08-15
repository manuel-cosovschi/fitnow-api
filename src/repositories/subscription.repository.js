// src/repositories/subscription.repository.js
import { query, queryOne } from '../db.js';

const COLS = `id, user_id, platform, product_id, plan, status, original_transaction_id,
              latest_transaction_id, purchase_token, environment, verification, auto_renew,
              started_at, expires_at, revoked_at, created_at, updated_at`;

/**
 * Suscripción vigente del usuario, si tiene alguna.
 * Vigente = status active/grace y (sin vencimiento o con vencimiento futuro).
 * Si hay más de una (por ejemplo compró en iOS y en Android), gana la que vence más tarde.
 */
export async function findActiveByUser(userId) {
  return queryOne(
    `SELECT ${COLS}
       FROM subscriptions
      WHERE user_id = ?
        AND status IN ('active','grace')
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY expires_at DESC NULLS FIRST
      LIMIT 1`,
    [userId]
  );
}

/** Todas las suscripciones del usuario, incluidas las vencidas (para el historial del perfil). */
export async function findAllByUser(userId) {
  return query(
    `SELECT ${COLS} FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
}

export async function findByOriginalTransactionId(platform, originalTransactionId) {
  return queryOne(
    `SELECT ${COLS} FROM subscriptions
      WHERE platform = ? AND original_transaction_id = ? LIMIT 1`,
    [platform, originalTransactionId]
  );
}

export async function findByPurchaseToken(platform, purchaseToken) {
  return queryOne(
    `SELECT ${COLS} FROM subscriptions
      WHERE platform = ? AND purchase_token = ? LIMIT 1`,
    [platform, purchaseToken]
  );
}

/**
 * Alta o actualización de una suscripción a partir de un recibo ya validado.
 * La clave natural es (platform, original_transaction_id): Apple la mantiene
 * estable entre renovaciones y para Google usamos el purchase token original.
 */
export async function upsert(fields) {
  const {
    user_id,
    platform,
    product_id,
    plan = 'premium',
    status = 'active',
    original_transaction_id = null,
    latest_transaction_id = null,
    purchase_token = null,
    environment = 'production',
    verification = 'verified',
    auto_renew = true,
    started_at = null,
    expires_at = null,
    revoked_at = null,
    raw_payload = null,
  } = fields;

  const existing = original_transaction_id
    ? await findByOriginalTransactionId(platform, original_transaction_id)
    : null;

  if (existing) {
    await query(
      `UPDATE subscriptions
          SET user_id = ?, product_id = ?, plan = ?, status = ?,
              latest_transaction_id = ?, purchase_token = ?, environment = ?,
              verification = ?, auto_renew = ?, expires_at = ?, revoked_at = ?,
              raw_payload = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        user_id, product_id, plan, status,
        latest_transaction_id, purchase_token, environment,
        verification, auto_renew, expires_at, revoked_at,
        raw_payload ? JSON.stringify(raw_payload) : null,
        existing.id,
      ]
    );
    return findById(existing.id);
  }

  const rows = await query(
    `INSERT INTO subscriptions
       (user_id, platform, product_id, plan, status, original_transaction_id,
        latest_transaction_id, purchase_token, environment, verification,
        auto_renew, started_at, expires_at, revoked_at, raw_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?)`,
    [
      user_id, platform, product_id, plan, status, original_transaction_id,
      latest_transaction_id, purchase_token, environment, verification,
      auto_renew, started_at, expires_at, revoked_at,
      raw_payload ? JSON.stringify(raw_payload) : null,
    ]
  );
  return findById(rows.insertId);
}

export async function findById(id) {
  return queryOne(`SELECT ${COLS} FROM subscriptions WHERE id = ? LIMIT 1`, [id]);
}

/** Cambia el estado de una suscripción (lo usan los webhooks de Apple y Google). */
export async function updateStatus(id, { status, expires_at, auto_renew, revoked_at }) {
  await query(
    `UPDATE subscriptions
        SET status     = COALESCE(?, status),
            expires_at = COALESCE(?, expires_at),
            auto_renew = COALESCE(?, auto_renew),
            revoked_at = COALESCE(?, revoked_at),
            updated_at = NOW()
      WHERE id = ?`,
    [status ?? null, expires_at ?? null, auto_renew ?? null, revoked_at ?? null, id]
  );
  return findById(id);
}

// ─── Notificaciones de tienda ────────────────────────────────────────────────

/**
 * Registra una notificación de Apple/Google. Devuelve false si ya estaba
 * registrada, para que el webhook la ignore en vez de aplicarla dos veces.
 */
export async function recordNotification({ platform, notification_id, notification_type, subtype, payload }) {
  const existing = await queryOne(
    `SELECT id FROM store_notifications WHERE platform = ? AND notification_id = ? LIMIT 1`,
    [platform, notification_id]
  );
  if (existing) return false;

  await query(
    `INSERT INTO store_notifications (platform, notification_id, notification_type, subtype, payload)
     VALUES (?, ?, ?, ?, ?)`,
    [platform, notification_id, notification_type ?? null, subtype ?? null,
     payload ? JSON.stringify(payload) : null]
  );
  return true;
}
