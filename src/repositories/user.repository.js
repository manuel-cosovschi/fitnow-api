// src/repositories/user.repository.js
import { query, queryOne } from '../db.js';

const PUBLIC_COLS = 'id, name, email, role, phone, units, language, photo_url, pref_goal_km, pref_surface, created_at, updated_at';

export async function findById(id) {
  return queryOne(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [id]);
}

export async function findByIdWithHash(id) {
  return queryOne(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [id]);
}

export async function findByEmail(email) {
  return queryOne(`SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`, [email]);
}

export async function create({ name, email, password_hash, role = 'user' }) {
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    [name, email, password_hash, role]
  );
  return findById(result.insertId);
}

export async function update(id, fields) {
  const allowed  = ['name', 'email', 'phone', 'units', 'language', 'photo_url', 'pref_goal_km', 'pref_surface'];
  const payload  = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(payload).length) return findById(id);
  const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
  await query(`UPDATE users SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(payload), id]);
  return findById(id);
}

export async function updatePassword(id, password_hash) {
  await query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [password_hash, id]);
}
