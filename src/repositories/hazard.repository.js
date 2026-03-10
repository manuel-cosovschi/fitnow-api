// src/repositories/hazard.repository.js
import { query, queryOne } from '../db.js';
import { radiusToDeg } from '../utils/geo.js';

export async function create({ user_id, lat, lng, type, note, severity }) {
  const result = await query(
    `INSERT INTO hazards (user_id, lat, lng, type, note, severity, votes, status)
     VALUES (?,?,?,?,?,?,1,'active')`,
    [user_id, lat, lng, type, note ?? null, Math.min(3, Math.max(1, severity ?? 1))]
  );
  return queryOne(`SELECT * FROM hazards WHERE id = ?`, [result.insertId]);
}

export async function findNear({ lat, lng, radius_m = 500, type } = {}) {
  const deg   = radiusToDeg(radius_m);
  const where = [
    `h.status = 'active'`,
    `h.lat BETWEEN ? AND ?`,
    `h.lng BETWEEN ? AND ?`,
  ];
  const params = [lat - deg, lat + deg, lng - deg, lng + deg];

  if (type) { where.push(`h.type = ?`); params.push(type); }

  return query(
    `SELECT * FROM (
       SELECT h.id, h.lat, h.lng, h.type, h.note, h.severity, h.votes, h.status, h.created_at,
              (6371000 * ACOS(LEAST(1.0, COS(RADIANS(${lat})) * COS(RADIANS(h.lat))
                * COS(RADIANS(h.lng) - RADIANS(${lng}))
                + SIN(RADIANS(${lat})) * SIN(RADIANS(h.lat))))) AS distance_m
       FROM hazards h
       WHERE ${where.join(' AND ')}
     ) sub
     WHERE distance_m < ?
     ORDER BY distance_m ASC
     LIMIT 100`,
    [...params, radius_m]
  );
}

export async function findById(id) {
  return queryOne(`SELECT * FROM hazards WHERE id = ? LIMIT 1`, [id]);
}

export async function findVote(hazardId, userId) {
  return queryOne(`SELECT * FROM hazard_votes WHERE hazard_id = ? AND user_id = ? LIMIT 1`, [hazardId, userId]);
}

export async function addVote(hazardId, userId) {
  await query(`INSERT INTO hazard_votes (hazard_id, user_id) VALUES (?,?) ON CONFLICT DO NOTHING`, [hazardId, userId]);
  await query(`UPDATE hazards SET votes = votes + 1 WHERE id = ?`, [hazardId]);
  return queryOne(`SELECT id, votes FROM hazards WHERE id = ?`, [hazardId]);
}

export async function updateStatus(id, status) {
  await query(`UPDATE hazards SET status = ? WHERE id = ?`, [status, id]);
}

// Admin: listado completo con filtros
export async function findAll({ status, type, limit = 50, offset = 0 } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`status = ?`); params.push(status); }
  if (type)   { where.push(`type   = ?`); params.push(type); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT h.*, u.name AS reporter_name
     FROM hazards h
     LEFT JOIN users u ON u.id = h.user_id
     ${whereClause}
     ORDER BY h.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function countAll({ status, type } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`status = ?`); params.push(status); }
  if (type)   { where.push(`type   = ?`); params.push(type); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await queryOne(`SELECT COUNT(*) AS total FROM hazards ${whereClause}`, params);
  return row?.total ?? 0;
}
