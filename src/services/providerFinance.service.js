// src/services/providerFinance.service.js
// Saldo del proveedor: cada pago confirmado le acredita su parte (precio menos
// la comisión de la plataforma) en un libro de movimientos. El proveedor ve su
// saldo disponible y pide retiros con su CBU o alias; el admin los liquida por
// transferencia y los marca como pagados. La división automática con las
// pasarelas (Stripe Connect / MercadoPago Marketplace) queda como evolución.
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Comisión de la plataforma sobre cada cobro, en porcentaje.
export function commissionPct() {
  const v = parseFloat(process.env.PLATFORM_COMMISSION_PCT);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
}

// Divide un cobro bruto en comisión y neto para el proveedor (2 decimales).
export function splitAmount(gross, pct = commissionPct()) {
  const g = Math.round(Number(gross) * 100) / 100;
  const commission = Math.round(g * pct) / 100;
  const net = Math.round((g - commission) * 100) / 100;
  return { gross: g, commission, net };
}

/**
 * Acredita al proveedor su parte de una inscripción pagada. Idempotente: el
 * índice único por enrollment garantiza un solo crédito aunque el webhook
 * llegue repetido. Nunca lanza: un fallo acá no debe frenar la activación.
 */
// Le anota al proveedor lo que le corresponde de un pago confirmado.
export async function creditEnrollment(enrollmentId) {
  try {
    const row = await queryOne(
      `SELECT e.id, e.price_paid, a.provider_id, a.title
       FROM enrollments e JOIN activities a ON a.id = e.activity_id
       WHERE e.id = ? LIMIT 1`,
      [enrollmentId]
    );
    if (!row || !row.provider_id || !(Number(row.price_paid) > 0)) return null;

    const { gross, commission, net } = splitAmount(row.price_paid);
    await query(
      `INSERT INTO provider_ledger (provider_id, enrollment_id, gross_amount, commission, amount, description)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT (enrollment_id) DO NOTHING`,
      [row.provider_id, enrollmentId, gross, commission, net,
       `Inscripción pagada: ${row.title ?? 'actividad'}`]
    );
    return { provider_id: row.provider_id, amount: net };
  } catch (err) {
    logger.error('creditEnrollment error:', err.message);
    return null;
  }
}

// Resuelve el proveedor asociado al usuario logueado (rol provider_admin).
async function providerIdFor(userId) {
  const u = await queryOne(`SELECT provider_id FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!u?.provider_id) throw Errors.forbidden('Tu usuario no está asociado a un proveedor.');
  return u.provider_id;
}

// Devuelve el saldo: acreditado menos retiros pedidos o pagados.
export async function getBalance(userId) {
  const providerId = await providerIdFor(userId);
  const credits = await queryOne(
    `SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(commission),0) AS commission, COUNT(*) AS movements
     FROM provider_ledger WHERE provider_id = ?`, [providerId]);
  const holds = await queryOne(
    `SELECT COALESCE(SUM(amount),0) AS total
     FROM withdrawal_requests WHERE provider_id = ? AND status IN ('pending','paid')`, [providerId]);
  const available = Math.round((Number(credits.total) - Number(holds.total)) * 100) / 100;
  return {
    available,
    credited_total: Number(credits.total),
    commission_total: Number(credits.commission),
    withdrawn_or_pending: Number(holds.total),
    movements: Number(credits.movements),
    commission_pct: commissionPct(),
  };
}

// Lista los movimientos del proveedor (créditos por pagos).
export async function listLedger(userId, { limit = 30 } = {}) {
  const providerId = await providerIdFor(userId);
  const items = await query(
    `SELECT id, enrollment_id, gross_amount, commission, amount, description, created_at
     FROM provider_ledger WHERE provider_id = ?
     ORDER BY created_at DESC LIMIT ?`, [providerId, limit]);
  return { items };
}

// Crea una solicitud de retiro validando el saldo disponible.
export async function requestWithdrawal(userId, { amount, cbu_alias }) {
  const providerId = await providerIdFor(userId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0)) throw Errors.badRequest('El monto debe ser mayor a cero.');
  const { available } = await getBalance(userId);
  if (amt > available) throw Errors.badRequest(`Saldo insuficiente: disponible $${available}.`);
  const result = await query(
    `INSERT INTO withdrawal_requests (provider_id, amount, cbu_alias) VALUES (?,?,?)`,
    [providerId, amt, String(cbu_alias).trim()]);
  return queryOne(`SELECT * FROM withdrawal_requests WHERE id = ?`, [result.insertId]);
}

// Lista los retiros del proveedor logueado.
export async function listMyWithdrawals(userId) {
  const providerId = await providerIdFor(userId);
  const items = await query(
    `SELECT * FROM withdrawal_requests WHERE provider_id = ? ORDER BY requested_at DESC LIMIT 50`,
    [providerId]);
  return { items };
}

// Admin: lista todas las solicitudes (por defecto las pendientes).
export async function listAllWithdrawals({ status = 'pending' } = {}) {
  const items = await query(
    `SELECT w.*, p.name AS provider_name
     FROM withdrawal_requests w JOIN providers p ON p.id = w.provider_id
     WHERE w.status = ? ORDER BY w.requested_at ASC LIMIT 100`, [status]);
  return { items };
}

// Admin: marca una solicitud como pagada o rechazada.
export async function resolveWithdrawal(id, { status, admin_note }) {
  const req = await queryOne(`SELECT * FROM withdrawal_requests WHERE id = ? LIMIT 1`, [id]);
  if (!req) throw Errors.notFound('Solicitud no encontrada.');
  if (req.status !== 'pending') throw Errors.badRequest('La solicitud ya fue resuelta.');
  await query(
    `UPDATE withdrawal_requests SET status = ?, admin_note = ?, resolved_at = NOW() WHERE id = ?`,
    [status, admin_note ?? null, id]);
  return queryOne(`SELECT * FROM withdrawal_requests WHERE id = ?`, [id]);
}
