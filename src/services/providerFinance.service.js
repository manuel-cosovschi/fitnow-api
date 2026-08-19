// src/services/providerFinance.service.js
//
// Libro de movimientos del proveedor. Cada pago confirmado se anota con su
// parte (precio menos comisión), pero hay dos formas de que esa plata le
// llegue, y la diferencia es la columna `settlement`:
//
//   direct   → el proveedor conectó su MercadoPago y el cobro le entró derecho
//              a su cuenta. El movimiento es historial de ventas y nada más.
//   platform → lo cobró FitNow y se lo debe: genera saldo, que el proveedor
//              retira por CBU y un admin liquida a mano.
//
// Mezclar los dos sería pagar dos veces lo mismo: el saldo disponible cuenta
// solamente los movimientos 'platform'.
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
export async function creditEnrollment(enrollmentId, { settlement = 'platform', gateway_ref = null } = {}) {
  try {
    const row = await queryOne(
      `SELECT e.id, e.price_paid, a.provider_id, a.title
       FROM enrollments e JOIN activities a ON a.id = e.activity_id
       WHERE e.id = ? LIMIT 1`,
      [enrollmentId]
    );
    if (!row || !row.provider_id || !(Number(row.price_paid) > 0)) return null;

    const { gross, commission, net } = splitAmount(row.price_paid);
    const description = settlement === 'direct'
      ? `Cobro directo: ${row.title ?? 'actividad'}`
      : `Inscripción pagada: ${row.title ?? 'actividad'}`;

    await query(
      `INSERT INTO provider_ledger
         (provider_id, enrollment_id, gross_amount, commission, amount, description, settlement, gateway_ref)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (enrollment_id) DO NOTHING`,
      [row.provider_id, enrollmentId, gross, commission, net, description, settlement, gateway_ref]
    );
    return { provider_id: row.provider_id, amount: net, settlement };
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

/**
 * Saldo del proveedor. Lo retirable son solo los cobros que hizo la plataforma:
 * lo que ya entró directo a su cuenta de MercadoPago se informa aparte, para
 * que se vea todo lo vendido sin que infle lo que se le debe.
 */
export async function getBalance(userId) {
  const providerId = await providerIdFor(userId);
  const owed = await queryOne(
    `SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(commission),0) AS commission, COUNT(*) AS movements
     FROM provider_ledger WHERE provider_id = ? AND settlement = 'platform'`, [providerId]);
  const direct = await queryOne(
    `SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(commission),0) AS commission, COUNT(*) AS movements
     FROM provider_ledger WHERE provider_id = ? AND settlement = 'direct'`, [providerId]);
  const holds = await queryOne(
    `SELECT COALESCE(SUM(amount),0) AS total
     FROM withdrawal_requests WHERE provider_id = ? AND status IN ('pending','paid')`, [providerId]);

  const available = Math.round((Number(owed.total) - Number(holds.total)) * 100) / 100;
  return {
    // Lo que FitNow le debe y puede retirar por CBU.
    available,
    credited_total: Number(owed.total),
    commission_total: Number(owed.commission) + Number(direct.commission),
    withdrawn_or_pending: Number(holds.total),
    movements: Number(owed.movements) + Number(direct.movements),
    commission_pct: commissionPct(),
    // Lo que ya cobró en su cuenta: no se retira porque ya lo tiene.
    direct_total: Number(direct.total),
    direct_movements: Number(direct.movements),
  };
}

// Lista los movimientos del proveedor (créditos por pagos).
export async function listLedger(userId, { limit = 30 } = {}) {
  const providerId = await providerIdFor(userId);
  const items = await query(
    `SELECT id, enrollment_id, gross_amount, commission, amount, description,
            settlement, gateway_ref, created_at
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
