// src/repositories/gym.repository.js
import { query, queryOne } from '../db.js';

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession({ user_id, activity_id, goal, time_available_min, equipment_available, muscle_groups, ai_plan }) {
  const rows = await query(
    `INSERT INTO gym_sessions (user_id, activity_id, goal, time_available_min, equipment_available, muscle_groups, ai_plan)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, activity_id ?? null, goal ?? null, time_available_min ?? null,
     equipment_available ?? null, muscle_groups ?? null, ai_plan ? JSON.stringify(ai_plan) : null]
  );
  return findSessionById(rows.insertId);
}

export async function findSessionById(id) {
  return queryOne(`SELECT * FROM gym_sessions WHERE id = ?`, [id]);
}

export async function findActiveSession(userId) {
  return queryOne(
    `SELECT * FROM gym_sessions WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [userId]
  );
}

export async function updateSession(id, fields) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(key === 'ai_plan' ? JSON.stringify(val) : val);
  }
  if (sets.length === 0) return findSessionById(id);
  params.push(id);
  await query(`UPDATE gym_sessions SET ${sets.join(', ')} WHERE id = ?`, params);
  return findSessionById(id);
}

export async function findSessionsByUser(userId, { status, limit = 20, offset = 0 }) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  params.push(limit, offset);
  return query(
    `SELECT id, activity_id, started_at, finished_at, status, goal, muscle_groups,
            total_sets, total_reps, total_volume_kg, duration_s, reroute_count, created_at
     FROM gym_sessions WHERE ${where.join(' AND ')}
     ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    params
  );
}

export async function countSessionsByUser(userId, { status }) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const row = await queryOne(`SELECT COUNT(*) AS total FROM gym_sessions WHERE ${where.join(' AND ')}`, params);
  return row?.total ?? 0;
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export async function createSet({ session_id, exercise_name, muscle_group, set_number, planned_reps, planned_weight }) {
  const rows = await query(
    `INSERT INTO gym_session_sets (session_id, exercise_name, muscle_group, set_number, planned_reps, planned_weight)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [session_id, exercise_name, muscle_group ?? null, set_number, planned_reps ?? null, planned_weight ?? null]
  );
  return rows[0];
}

export async function findSet(sessionId, exerciseName, setNumber) {
  return queryOne(
    `SELECT * FROM gym_session_sets WHERE session_id = ? AND exercise_name = ? AND set_number = ?`,
    [sessionId, exerciseName, setNumber]
  );
}

export async function updateSet(id, fields) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(val);
  }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE gym_session_sets SET ${sets.join(', ')} WHERE id = ?`, params);
  return queryOne(`SELECT * FROM gym_session_sets WHERE id = ?`, [id]);
}

export async function findSetsBySession(sessionId) {
  return query(
    `SELECT * FROM gym_session_sets WHERE session_id = ? ORDER BY created_at, set_number`,
    [sessionId]
  );
}

export async function deleteUncompletedSets(sessionId) {
  await query(`DELETE FROM gym_session_sets WHERE session_id = ? AND completed = FALSE`, [sessionId]);
}

// ─── History for AI context ───────────────────────────────────────────────────

export async function getRecentSessions(userId, limit = 3) {
  const sessions = await query(
    `SELECT id, goal, muscle_groups, total_sets, total_reps, total_volume_kg, duration_s, ai_plan
     FROM gym_sessions WHERE user_id = ? AND status = 'completed'
     ORDER BY finished_at DESC LIMIT ?`,
    [userId, limit]
  );
  for (const s of sessions) {
    s.sets = await query(
      `SELECT exercise_name, set_number, actual_reps, actual_weight, rpe
       FROM gym_session_sets WHERE session_id = ? AND completed = TRUE
       ORDER BY created_at, set_number`,
      [s.id]
    );
  }
  return sessions;
}
