// src/repositories/ai.repository.js
import { query, queryOne } from '../db.js';

export async function getActiveWeights() {
  return queryOne(`SELECT * FROM ai_weights WHERE is_active = 1 LIMIT 1`);
}

export async function upsertWeights({ version, label, weights }) {
  await query(`UPDATE ai_weights SET is_active = 0 WHERE is_active = 1`);
  const result = await query(
    `INSERT INTO ai_weights
       (version, label, w_distance, w_elev, w_hz_cnt, w_hz_sev, w_feedback, w_popularity, is_active)
     VALUES (?,?,?,?,?,?,?,?,1)`,
    [version, label ?? null,
     weights.w_distance, weights.w_elev, weights.w_hz_cnt,
     weights.w_hz_sev, weights.w_feedback, weights.w_popularity]
  );
  return queryOne(`SELECT * FROM ai_weights WHERE id = ?`, [result.insertId]);
}

export async function listWeights() {
  return query(`SELECT id, version, label, is_active, created_at, updated_at FROM ai_weights ORDER BY id DESC`);
}

export async function findNewsActive() {
  return query(
    `SELECT * FROM news
     WHERE starts_at <= UTC_TIMESTAMP()
       AND (ends_at IS NULL OR ends_at >= UTC_TIMESTAMP())
     ORDER BY created_at DESC`
  );
}
