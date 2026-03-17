// src/repositories/enrollment.repository.js
import { query, queryOne } from '../db.js';

export async function findDuplicate(userId, activityId) {
  return queryOne(
    `SELECT id FROM enrollments WHERE user_id = ? AND activity_id = ? AND status != 'cancelled' LIMIT 1`,
    [userId, activityId]
  );
}

export async function create(conn, { user_id, activity_id, session_id, price_paid, plan_name, plan_price, payment_type, payment_method }) {
  const [result] = await conn.query(
    `INSERT INTO enrollments (user_id, activity_id, session_id, price_paid, plan_name, plan_price, payment_type, payment_method)
     VALUES (?,?,?,?,?,?,?,?)`,
    [user_id, activity_id, session_id ?? null, price_paid ?? 0,
     plan_name ?? null, plan_price ?? null,
     payment_type ?? 'full', payment_method ?? 'card']
  );
  const [rows] = await conn.query(`SELECT * FROM enrollments WHERE id = ?`, [result.insertId]);
  return rows[0] ?? null;
}

export async function findById(id) {
  return queryOne(`SELECT * FROM enrollments WHERE id = ? LIMIT 1`, [id]);
}

export async function cancel(conn, id) {
  await conn.query(`UPDATE enrollments SET status = 'cancelled' WHERE id = ?`, [id]);
}

export async function findManyByUser(userId, { when = 'all', limit = 20, offset = 0 } = {}) {
  const effStart = 'COALESCE(e.start_at, a.date_start)';
  let extra = '';
  let order = `${effStart} DESC`;

  if (when === 'upcoming') {
    extra = `AND e.status != 'cancelled' AND (${effStart} IS NULL OR ${effStart} >= NOW())`;
    order = `${effStart} ASC`;
  } else if (when === 'past') {
    extra = `AND ${effStart} < NOW()`;
    order = `${effStart} DESC`;
  }

  return query(
    `SELECT e.id, e.activity_id, e.session_id, e.status,
            a.kind AS activity_kind, a.title, a.location, a.modality, a.difficulty,
            ${effStart} AS date_start, COALESCE(e.end_at, a.date_end) AS date_end,
            COALESCE(e.price_paid, a.price) AS price_paid,
            e.plan_name, e.plan_price, e.payment_type, e.payment_method,
            p.id AS provider_id, p.name AS provider_name,
            s.id AS sport_id, s.name AS sport_name,
            a.enable_running, a.enable_deposit, a.deposit_percent, a.has_capacity_limit,
            e.created_at
     FROM enrollments e
     JOIN activities a ON a.id = e.activity_id
     LEFT JOIN providers p ON p.id = a.provider_id
     LEFT JOIN sports    s ON s.id = a.sport_id
     WHERE e.user_id = ? ${extra}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

export async function countManyByUser(userId, { when = 'all' } = {}) {
  const effStart = 'COALESCE(e.start_at, a.date_start)';
  let extra = '';

  if (when === 'upcoming') {
    extra = `AND e.status != 'cancelled' AND (${effStart} IS NULL OR ${effStart} >= NOW())`;
  } else if (when === 'past') {
    extra = `AND ${effStart} < NOW()`;
  }

  const row = await queryOne(
    `SELECT COUNT(*) AS total
     FROM enrollments e
     JOIN activities a ON a.id = e.activity_id
     WHERE e.user_id = ? ${extra}`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function findManyByProvider(providerId, { limit = 20, offset = 0 } = {}) {
  return query(
    `SELECT e.id, e.user_id, u.name AS user_name,
            e.activity_id, a.title AS activity_title,
            COALESCE(e.price_paid, a.price) AS price_paid,
            e.status, e.created_at
     FROM enrollments e
     JOIN activities a ON a.id = e.activity_id
     JOIN users      u ON u.id = e.user_id
     WHERE a.provider_id = ?
     ORDER BY e.created_at DESC
     LIMIT ? OFFSET ?`,
    [providerId, limit, offset]
  );
}

export async function countManyByProvider(providerId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total
     FROM enrollments e
     JOIN activities a ON a.id = e.activity_id
     WHERE a.provider_id = ?`,
    [providerId]
  );
  return row?.total ?? 0;
}
