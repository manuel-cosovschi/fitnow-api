// src/repositories/offer.repository.js
import { query, queryOne } from '../db.js';

export async function create({ title, description, discount_percent, discount_label, valid_from, valid_until, activity_kind, icon_name, provider_id }) {
  const result = await query(
    `INSERT INTO offers
       (title, description, discount_percent, discount_label, valid_from, valid_until,
        activity_kind, icon_name, provider_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
    [title, description ?? null,
     discount_percent ?? null, discount_label ?? null,
     valid_from ?? null, valid_until ?? null,
     activity_kind ?? null, icon_name ?? null,
     provider_id]
  );
  return findById(result.insertId);
}

export async function findById(id) {
  return queryOne(
    `SELECT o.*, p.name AS provider_name
     FROM offers o
     LEFT JOIN providers p ON p.id = o.provider_id
     WHERE o.id = ?`,
    [id]
  );
}

export async function findMany({ status, limit = 20, offset = 0 } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`o.status = ?`); params.push(status); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT o.*, p.name AS provider_name
     FROM offers o
     LEFT JOIN providers p ON p.id = o.provider_id
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function countMany({ status } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`o.status = ?`); params.push(status); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await queryOne(`SELECT COUNT(*) AS total FROM offers o ${whereClause}`, params);
  return row?.total ?? 0;
}

export async function findManyByProvider(providerId, { limit = 20, offset = 0 } = {}) {
  return query(
    `SELECT o.*, p.name AS provider_name
     FROM offers o
     LEFT JOIN providers p ON p.id = o.provider_id
     WHERE o.provider_id = ?
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [providerId, limit, offset]
  );
}

export async function countManyByProvider(providerId) {
  const row = await queryOne(`SELECT COUNT(*) AS total FROM offers WHERE provider_id = ?`, [providerId]);
  return row?.total ?? 0;
}

export async function updateStatus(id, status, rejectionReason = null) {
  await query(
    `UPDATE offers SET status = ?, rejection_reason = ?, updated_at = NOW() WHERE id = ?`,
    [status, rejectionReason, id]
  );
  return findById(id);
}
