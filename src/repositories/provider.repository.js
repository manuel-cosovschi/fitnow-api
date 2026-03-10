// src/repositories/provider.repository.js
import { query, queryOne } from '../db.js';

export async function findMany({ status, kind, city, q, limit = 20, offset = 0 } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`p.status = ?`);  params.push(status); }
  if (kind)   { where.push(`p.kind = ?`);    params.push(kind); }
  if (city)   { where.push(`p.city = ?`);    params.push(city); }
  if (q)      { where.push(`p.name LIKE ?`); params.push(`%${q}%`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT * FROM providers p ${whereClause} ORDER BY p.name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function countMany({ status, kind, city, q } = {}) {
  const where  = [];
  const params = [];
  if (status) { where.push(`p.status = ?`);  params.push(status); }
  if (kind)   { where.push(`p.kind = ?`);    params.push(kind); }
  if (city)   { where.push(`p.city = ?`);    params.push(city); }
  if (q)      { where.push(`p.name LIKE ?`); params.push(`%${q}%`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await queryOne(`SELECT COUNT(*) AS total FROM providers p ${whereClause}`, params);
  return row?.total ?? 0;
}

export async function findById(id) {
  return queryOne(`SELECT * FROM providers WHERE id = ? LIMIT 1`, [id]);
}

export async function create({ name, kind, description, address, city, lat, lng, phone, website_url }) {
  const result = await query(
    `INSERT INTO providers (name, kind, description, address, city, lat, lng, phone, website_url, status)
     VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
    [name, kind ?? 'gym', description ?? null, address ?? null, city ?? null,
     lat ?? null, lng ?? null, phone ?? null, website_url ?? null]
  );
  return findById(result.insertId);
}

export async function update(id, fields) {
  const allowed = ['name','kind','description','address','city','lat','lng','phone','website_url','logo_url','status'];
  const payload = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(payload).length) return findById(id);
  const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
  await query(`UPDATE providers SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(payload), id]);
  return findById(id);
}

export async function findHours(providerId) {
  return query(`SELECT * FROM provider_hours WHERE provider_id = ? ORDER BY weekday ASC`, [providerId]);
}

export async function replaceHours(providerId, hours) {
  await query(`DELETE FROM provider_hours WHERE provider_id = ?`, [providerId]);
  if (!hours?.length) return [];
  const { pool } = await import('../db.js');
  const COLS = 5;
  const flatValues = hours.flatMap((h) => [
    providerId, h.weekday, h.open_time ?? '00:00', h.close_time ?? '00:00', !!h.closed,
  ]);
  const placeholders = hours
    .map((_, idx) => {
      const base = idx * COLS;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`;
    })
    .join(', ');
  await pool.query(
    `INSERT INTO provider_hours (provider_id, weekday, open_time, close_time, closed) VALUES ${placeholders}`,
    flatValues
  );
  return findHours(providerId);
}

export async function findServices(providerId) {
  return query(
    `SELECT ps.id, ps.provider_id, ps.sport_id, ps.description, s.name AS sport_name
     FROM provider_sports ps
     JOIN sports s ON s.id = ps.sport_id
     WHERE ps.provider_id = ?
     ORDER BY ps.id ASC`,
    [providerId]
  );
}

export async function addService(providerId, { sport_id, description }) {
  const result = await query(
    `INSERT INTO provider_sports (provider_id, sport_id, description) VALUES (?,?,?)`,
    [providerId, sport_id, description ?? null]
  );
  return queryOne(
    `SELECT ps.id, ps.provider_id, ps.sport_id, ps.description, s.name AS sport_name
     FROM provider_sports ps JOIN sports s ON s.id = ps.sport_id WHERE ps.id = ?`,
    [result.insertId]
  );
}

export async function removeService(serviceId) {
  await query(`DELETE FROM provider_sports WHERE id = ?`, [serviceId]);
}
