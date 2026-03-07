// src/repositories/enrollment.repository.js
import { query, queryOne } from '../db.js';

export async function findDuplicate(userId, activityId) {
  return queryOne(
    `SELECT id FROM enrollments WHERE user_id = ? AND activity_id = ? AND status != 'cancelled' LIMIT 1`,
    [userId, activityId]
  );
}

export async function create(conn, { user_id, activity_id, session_id, price_paid }) {
  const [result] = await conn.query(
    `INSERT INTO enrollments (user_id, activity_id, session_id, price_paid)
     VALUES (?,?,?,?)`,
    [user_id, activity_id, session_id ?? null, price_paid ?? 0]
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
    extra = `AND e.status != 'cancelled' AND (${effStart} IS NULL OR ${effStart} >= UTC_TIMESTAMP())`;
    order = `${effStart} ASC`;
  } else if (when === 'past') {
    extra = `AND ${effStart} < UTC_TIMESTAMP()`;
    order = `${effStart} DESC`;
  }

  return query(
    `SELECT e.id, e.activity_id, e.session_id, e.status,
            a.kind AS activity_kind, a.title, a.location, a.modality, a.difficulty,
            ${effStart} AS date_start, COALESCE(e.end_at, a.date_end) AS date_end,
            COALESCE(e.price_paid, a.price) AS price_paid,
            p.id AS provider_id, p.name AS provider_name,
            s.id AS sport_id, s.name AS sport_name,
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
    extra = `AND e.status != 'cancelled' AND (${effStart} IS NULL OR ${effStart} >= UTC_TIMESTAMP())`;
  } else if (when === 'past') {
    extra = `AND ${effStart} < UTC_TIMESTAMP()`;
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
