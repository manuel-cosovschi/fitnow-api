// src/repositories/ai.repository.js
import { query, queryOne } from '../db.js';

// ── Weights (existing) ────────────────────────────────────────────────────────

export async function getActiveWeights() {
  return queryOne(`SELECT * FROM ai_weights WHERE is_active = TRUE LIMIT 1`);
}

export async function upsertWeights({ version, label, weights }) {
  await query(`UPDATE ai_weights SET is_active = FALSE WHERE is_active = TRUE`);
  const result = await query(
    `INSERT INTO ai_weights
       (version, label, w_distance, w_elev, w_hz_cnt, w_hz_sev, w_feedback, w_popularity, is_active)
     VALUES (?,?,?,?,?,?,?,?,TRUE)`,
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
     WHERE starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())
     ORDER BY created_at DESC`
  );
}

// ── Usage log ──────────────────────────────────────────────────────────────────

export async function logUsage({ userId, endpoint, model, usage, status }) {
  return query(
    `INSERT INTO ai_usage_log
       (user_id, endpoint, model, prompt_tokens, completion_tokens, total_tokens, status)
     VALUES (?,?,?,?,?,?,?)`,
    [
      userId ?? null,
      endpoint,
      model,
      usage?.prompt_tokens     ?? 0,
      usage?.completion_tokens ?? 0,
      usage?.total_tokens      ?? 0,
      status ?? 'ok',
    ]
  );
}

export async function countUsageByUser(userId, sinceIso) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS calls, COALESCE(SUM(total_tokens),0)::int AS tokens
       FROM ai_usage_log
      WHERE user_id = ?
        AND created_at >= ?`,
    [userId, sinceIso]
  );
  return row ?? { calls: 0, tokens: 0 };
}

// ── Coach conversation history ────────────────────────────────────────────────

export async function saveCoachTurn({ userId, role, content, tokens, aiMode }) {
  const result = await query(
    `INSERT INTO coach_conversations (user_id, role, content, tokens, ai_mode)
     VALUES (?,?,?,?,?)`,
    [userId, role, content, tokens ?? null, aiMode ?? 'real']
  );
  return queryOne(`SELECT * FROM coach_conversations WHERE id = ?`, [result.insertId]);
}

export async function listCoachTurns({ userId, limit = 50, before = null }) {
  if (before) {
    return query(
      `SELECT id, role, content, tokens, ai_mode, created_at
         FROM coach_conversations
        WHERE user_id = ? AND id < ?
        ORDER BY id DESC
        LIMIT ?`,
      [userId, before, limit]
    );
  }
  return query(
    `SELECT id, role, content, tokens, ai_mode, created_at
       FROM coach_conversations
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?`,
    [userId, limit]
  );
}

// ── Form check sessions ───────────────────────────────────────────────────────

export async function saveFormCheck({ userId, exercise, score, feedback, joints }) {
  const result = await query(
    `INSERT INTO form_check_sessions (user_id, exercise, score, feedback, joints_json)
     VALUES (?,?,?,?,?)`,
    [userId, exercise, score, feedback, joints ? JSON.stringify(joints) : null]
  );
  return queryOne(`SELECT * FROM form_check_sessions WHERE id = ?`, [result.insertId]);
}

export async function listFormChecks({ userId, exercise = null, limit = 20 }) {
  if (exercise) {
    return query(
      `SELECT id, exercise, score, feedback, created_at
         FROM form_check_sessions
        WHERE user_id = ? AND exercise = ?
        ORDER BY created_at DESC
        LIMIT ?`,
      [userId, exercise, limit]
    );
  }
  return query(
    `SELECT id, exercise, score, feedback, created_at
       FROM form_check_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit]
  );
}
