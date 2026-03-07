// src/repositories/user.repository.js
import { query, queryOne } from '../db.js';

const PUBLIC_COLS = 'id, name, email, role, provider_id, phone, units, language, photo_url, pref_goal_km, pref_surface, created_at, updated_at';

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

// ─── Password reset tokens ────────────────────────────────────────────────────

export async function createResetToken(userId, tokenHash, expiresAt) {
  // Invalidate any previous unused tokens for this user
  await query(`DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`, [userId]);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt]
  );
}

export async function findResetToken(tokenHash) {
  return queryOne(
    `SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash]
  );
}

export async function markResetTokenUsed(id) {
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`, [id]);
}

export async function setRoleAndProvider(id, role, providerId) {
  await query(
    `UPDATE users SET role = ?, provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [role, providerId ?? null, id]
  );
  return findById(id);
}

export async function findMany({ q, role, limit = 20, offset = 0 } = {}) {
  const where  = ['deleted_at IS NULL'];
  const params = [];
  if (q)    { where.push(`(name LIKE ? OR email LIKE ?)`); params.push(`%${q}%`, `%${q}%`); }
  if (role) { where.push(`role = ?`); params.push(role); }
  const whereClause = `WHERE ${where.join(' AND ')}`;
  return query(
    `SELECT ${PUBLIC_COLS} FROM users ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function countMany({ q, role } = {}) {
  const where  = ['deleted_at IS NULL'];
  const params = [];
  if (q)    { where.push(`(name LIKE ? OR email LIKE ?)`); params.push(`%${q}%`, `%${q}%`); }
  if (role) { where.push(`role = ?`); params.push(role); }
  const whereClause = `WHERE ${where.join(' AND ')}`;
  const row = await queryOne(`SELECT COUNT(*) AS total FROM users ${whereClause}`, params);
  return row?.total ?? 0;
}
