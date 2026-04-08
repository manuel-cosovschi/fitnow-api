// src/repositories/trainingPlan.repository.js
import { query, queryOne } from '../db.js';

export async function create({ user_id, title, goal, duration_weeks, difficulty, plan_data }) {
  const rows = await query(
    `INSERT INTO training_plans (user_id, title, goal, duration_weeks, difficulty, plan_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, title, goal, duration_weeks, difficulty, JSON.stringify(plan_data)]
  );
  return rows[0];
}

export async function findById(id) {
  return queryOne(`SELECT * FROM training_plans WHERE id = ?`, [id]);
}

export async function findActiveByUser(userId) {
  return queryOne(
    `SELECT * FROM training_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
}

export async function cancelActiveByUser(userId) {
  await query(
    `UPDATE training_plans SET status = 'cancelled', updated_at = NOW() WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
}

export async function cancelById(id) {
  await query(
    `UPDATE training_plans SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [id]
  );
  return findById(id);
}

export async function findByUser(userId, { limit = 20, offset = 0 }) {
  return query(
    `SELECT id, title, goal, duration_weeks, difficulty, status, started_at, created_at, updated_at
     FROM training_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

export async function countByUser(userId) {
  const row = await queryOne(`SELECT COUNT(*) AS total FROM training_plans WHERE user_id = ?`, [userId]);
  return row?.total ?? 0;
}

export async function countTodayByUser(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM training_plans
     WHERE user_id = ? AND created_at::DATE = CURRENT_DATE`,
    [userId]
  );
  return row?.total ?? 0;
}
