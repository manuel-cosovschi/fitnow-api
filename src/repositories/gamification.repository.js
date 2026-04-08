// src/repositories/gamification.repository.js
import { query, queryOne } from '../db.js';

// ─── User Levels ──────────────────────────────────────────────────────────────

export async function getUserLevel(userId) {
  return queryOne(`SELECT * FROM user_levels WHERE user_id = ?`, [userId]);
}

export async function upsertUserLevel(userId, { total_xp, level, streak_days, last_active }) {
  const existing = await getUserLevel(userId);
  if (existing) {
    await query(
      `UPDATE user_levels SET total_xp = ?, level = ?, streak_days = ?, last_active = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [total_xp, level, streak_days, last_active, userId]
    );
    return queryOne(`SELECT * FROM user_levels WHERE user_id = ?`, [userId]);
  }
  const rows = await query(
    `INSERT INTO user_levels (user_id, total_xp, level, streak_days, last_active)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, total_xp, level, streak_days, last_active]
  );
  return rows[0];
}

// ─── XP Log ───────────────────────────────────────────────────────────────────

export async function addXpEntry({ user_id, xp, source, ref_type, ref_id, note }) {
  const rows = await query(
    `INSERT INTO user_xp_log (user_id, xp, source, ref_type, ref_id, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, xp, source, ref_type ?? null, ref_id ?? null, note ?? null]
  );
  return rows[0];
}

export async function getXpHistory(userId, { limit = 20, offset = 0 }) {
  return query(
    `SELECT * FROM user_xp_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

export async function countXpHistory(userId) {
  const row = await queryOne(`SELECT COUNT(*) AS total FROM user_xp_log WHERE user_id = ?`, [userId]);
  return row?.total ?? 0;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export async function getUserBadges(userId) {
  return query(
    `SELECT ub.id, ub.earned_at, b.code, b.name, b.description, b.icon, b.category, b.threshold
     FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = ?
     ORDER BY ub.earned_at DESC`,
    [userId]
  );
}

export async function awardBadge(userId, badgeId) {
  await query(
    `INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?) ON CONFLICT (user_id, badge_id) DO NOTHING`,
    [userId, badgeId]
  );
}

export async function findBadgeByCode(code) {
  return queryOne(`SELECT * FROM badges WHERE code = ?`, [code]);
}

export async function listAllBadges() {
  return query(`SELECT * FROM badges ORDER BY category, id`);
}

export async function hasUserBadge(userId, badgeCode) {
  const row = await queryOne(
    `SELECT ub.id FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = ? AND b.code = ?`,
    [userId, badgeCode]
  );
  return !!row;
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export async function getGlobalRanking({ limit = 20, offset = 0 }) {
  return query(
    `SELECT u.id, u.name, u.photo_url, ul.total_xp, ul.level, ul.streak_days
     FROM user_levels ul
     JOIN users u ON u.id = ul.user_id
     WHERE u.deleted_at IS NULL
     ORDER BY ul.total_xp DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

export async function countGlobalRanking() {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM user_levels ul JOIN users u ON u.id = ul.user_id WHERE u.deleted_at IS NULL`
  );
  return row?.total ?? 0;
}

export async function getProviderRanking(providerId, { limit = 20, offset = 0 }) {
  return query(
    `SELECT DISTINCT u.id, u.name, u.photo_url, ul.total_xp, ul.level, ul.streak_days
     FROM user_levels ul
     JOIN users u ON u.id = ul.user_id
     JOIN enrollments e ON e.user_id = u.id AND e.status = 'active'
     JOIN activities a ON a.id = e.activity_id AND a.provider_id = ?
     WHERE u.deleted_at IS NULL
     ORDER BY ul.total_xp DESC
     LIMIT ? OFFSET ?`,
    [providerId, limit, offset]
  );
}

export async function countProviderRanking(providerId) {
  const row = await queryOne(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM user_levels ul
     JOIN users u ON u.id = ul.user_id
     JOIN enrollments e ON e.user_id = u.id AND e.status = 'active'
     JOIN activities a ON a.id = e.activity_id AND a.provider_id = ?
     WHERE u.deleted_at IS NULL`,
    [providerId]
  );
  return row?.total ?? 0;
}

export async function getWeeklyRanking({ limit = 20, offset = 0 }) {
  return query(
    `SELECT xl.user_id AS id, u.name, u.photo_url, SUM(xl.xp) AS weekly_xp
     FROM user_xp_log xl
     JOIN users u ON u.id = xl.user_id
     WHERE xl.created_at >= NOW() - INTERVAL '7 days' AND u.deleted_at IS NULL
     GROUP BY xl.user_id, u.name, u.photo_url
     ORDER BY weekly_xp DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

export async function countWeeklyRanking() {
  const row = await queryOne(
    `SELECT COUNT(DISTINCT xl.user_id) AS total
     FROM user_xp_log xl
     JOIN users u ON u.id = xl.user_id
     WHERE xl.created_at >= NOW() - INTERVAL '7 days' AND u.deleted_at IS NULL`
  );
  return row?.total ?? 0;
}

// ─── User Stats ───────────────────────────────────────────────────────────────

export async function getUserStats(userId) {
  const runSessions = await queryOne(
    `SELECT COUNT(*) AS total, COALESCE(SUM(distance_m), 0) AS total_distance_m
     FROM run_sessions WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  const gymSessions = await queryOne(
    `SELECT COUNT(*) AS total FROM gym_sessions WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  const gymSets = await queryOne(
    `SELECT COALESCE(SUM(gs.total_sets), 0) AS total_sets
     FROM gym_sessions gs WHERE gs.user_id = ? AND gs.status = 'completed'`,
    [userId]
  );
  const enrollments = await queryOne(
    `SELECT COUNT(*) AS total FROM enrollments WHERE user_id = ?`,
    [userId]
  );
  const feedbacks = await queryOne(
    `SELECT COUNT(*) AS total FROM run_feedback WHERE user_id = ?`,
    [userId]
  );
  const hazards = await queryOne(
    `SELECT COUNT(*) AS total FROM hazards WHERE user_id = ?`,
    [userId]
  );

  return {
    total_run_sessions: runSessions?.total ?? 0,
    total_run_km: Math.round((runSessions?.total_distance_m ?? 0) / 1000 * 10) / 10,
    total_gym_sessions: gymSessions?.total ?? 0,
    total_gym_sets: gymSets?.total_sets ?? 0,
    total_enrollments: enrollments?.total ?? 0,
    total_feedbacks: feedbacks?.total ?? 0,
    total_hazards_reported: hazards?.total ?? 0,
  };
}

// ─── Badge Condition Queries ──────────────────────────────────────────────────

export async function getTotalSessions(userId) {
  const run = await queryOne(
    `SELECT COUNT(*) AS total FROM run_sessions WHERE user_id = ? AND status = 'completed'`, [userId]
  );
  const gym = await queryOne(
    `SELECT COUNT(*) AS total FROM gym_sessions WHERE user_id = ? AND status = 'completed'`, [userId]
  );
  return (run?.total ?? 0) + (gym?.total ?? 0);
}

export async function getTotalRunDistanceM(userId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(distance_m), 0) AS total FROM run_sessions WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function getDistinctRoutesRun(userId) {
  const row = await queryOne(
    `SELECT COUNT(DISTINCT route_id) AS total FROM run_sessions
     WHERE user_id = ? AND status = 'completed' AND route_id IS NOT NULL`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function getConfirmedHazards(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM hazards WHERE user_id = ? AND votes >= 3`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function getTotalGymSessions(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM gym_sessions WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function getTotalFeedbacks(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM run_feedback WHERE user_id = ?`,
    [userId]
  );
  return row?.total ?? 0;
}

export async function hasGymSessionWithSets(userId, minSets) {
  const row = await queryOne(
    `SELECT id FROM gym_sessions WHERE user_id = ? AND status = 'completed' AND total_sets >= ? LIMIT 1`,
    [userId, minSets]
  );
  return !!row;
}

export async function getTotalGymVolume(userId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(gs.total_volume_kg), 0) AS total
     FROM gym_sessions gs WHERE gs.user_id = ? AND gs.status = 'completed'`,
    [userId]
  );
  return row?.total ?? 0;
}
