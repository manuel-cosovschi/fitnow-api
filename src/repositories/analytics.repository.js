// src/repositories/analytics.repository.js
import { query, queryOne } from '../db.js';

// ─── Running Analytics ────────────────────────────────────────────────────────

export async function getRunningSummary(userId) {
  return queryOne(
    `SELECT
       COUNT(*)                         AS total_sessions,
       COALESCE(SUM(distance_m), 0)     AS total_distance_m,
       COALESCE(SUM(duration_s), 0)     AS total_duration_s,
       ROUND(AVG(avg_pace_s))           AS avg_pace_s,
       ROUND(AVG(avg_speed_mps)::NUMERIC, 2) AS avg_speed_mps,
       ROUND(AVG(avg_hr_bpm))           AS avg_hr_bpm,
       MIN(avg_pace_s)                  AS best_pace_s,
       MAX(distance_m)                  AS longest_run_m,
       COALESCE(SUM(max_elevation_m), 0) AS total_elevation_gain_m
     FROM run_sessions
     WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
}

export async function getRunningWeekly(userId, weeks = 12) {
  return query(
    `SELECT
       DATE_TRUNC('week', started_at)::DATE AS week_start,
       COUNT(*)                              AS sessions,
       COALESCE(SUM(distance_m), 0)          AS distance_m,
       COALESCE(SUM(duration_s), 0)          AS duration_s,
       ROUND(AVG(avg_pace_s))                AS avg_pace_s
     FROM run_sessions
     WHERE user_id = ? AND status = 'completed'
       AND started_at >= NOW() - (? || ' weeks')::INTERVAL
     GROUP BY DATE_TRUNC('week', started_at)
     ORDER BY week_start DESC`,
    [userId, weeks]
  );
}

export async function getRunningProgress(userId) {
  return query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', started_at), 'YYYY-MM') AS month,
       ROUND(AVG(avg_pace_s))                AS avg_pace_s,
       ROUND(AVG(distance_m))                AS avg_distance_m,
       COUNT(*)                              AS total_sessions,
       ROUND(AVG(avg_hr_bpm))                AS avg_hr_bpm
     FROM run_sessions
     WHERE user_id = ? AND status = 'completed'
       AND started_at >= NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', started_at)
     ORDER BY month DESC`,
    [userId]
  );
}

// ─── Gym Analytics ────────────────────────────────────────────────────────────

export async function getGymSummary(userId) {
  const summary = await queryOne(
    `SELECT
       COUNT(*)                                AS total_sessions,
       COALESCE(SUM(total_sets), 0)            AS total_sets,
       COALESCE(SUM(total_reps), 0)            AS total_reps,
       COALESCE(SUM(total_volume_kg), 0)       AS total_volume_kg,
       COALESCE(SUM(duration_s), 0)            AS total_duration_s,
       ROUND(AVG(total_sets))                  AS avg_sets_per_session,
       ROUND(AVG(total_volume_kg)::NUMERIC, 1) AS avg_volume_per_session
     FROM gym_sessions
     WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );

  const fav = await queryOne(
    `SELECT exercise_name, COUNT(*) AS cnt
     FROM gym_session_sets gss
     JOIN gym_sessions gs ON gs.id = gss.session_id
     WHERE gs.user_id = ? AND gs.status = 'completed' AND gss.completed = TRUE
     GROUP BY exercise_name
     ORDER BY cnt DESC
     LIMIT 1`,
    [userId]
  );

  return { ...summary, favorite_exercise: fav?.exercise_name ?? null };
}

export async function getGymWeekly(userId, weeks = 12) {
  return query(
    `SELECT
       DATE_TRUNC('week', started_at)::DATE AS week_start,
       COUNT(*)                              AS sessions,
       COALESCE(SUM(total_sets), 0)          AS total_sets,
       COALESCE(SUM(total_volume_kg), 0)     AS total_volume_kg
     FROM gym_sessions
     WHERE user_id = ? AND status = 'completed'
       AND started_at >= NOW() - (? || ' weeks')::INTERVAL
     GROUP BY DATE_TRUNC('week', started_at)
     ORDER BY week_start DESC`,
    [userId, weeks]
  );
}

export async function getGymMuscleDistribution(userId) {
  const rows = await query(
    `SELECT
       gss.muscle_group,
       COUNT(*)                          AS total_sets,
       COALESCE(SUM(gss.actual_weight * gss.actual_reps), 0) AS total_volume_kg
     FROM gym_session_sets gss
     JOIN gym_sessions gs ON gs.id = gss.session_id
     WHERE gs.user_id = ? AND gs.status = 'completed' AND gss.completed = TRUE
       AND gss.muscle_group IS NOT NULL
     GROUP BY gss.muscle_group
     ORDER BY total_sets DESC`,
    [userId]
  );

  const totalSets = rows.reduce((sum, r) => sum + (r.total_sets || 0), 0);
  return rows.map(r => ({
    ...r,
    percentage: totalSets > 0 ? Math.round((r.total_sets / totalSets) * 1000) / 10 : 0,
  }));
}

// ─── Combined Streak ──────────────────────────────────────────────────────────

export async function getCombinedStreak(userId) {
  // Get all active days combining run and gym sessions
  const rows = await query(
    `SELECT DISTINCT active_date FROM (
       SELECT DATE(started_at) AS active_date FROM run_sessions
         WHERE user_id = ? AND status = 'completed'
       UNION
       SELECT DATE(started_at) AS active_date FROM gym_sessions
         WHERE user_id = ? AND status = 'completed'
     ) combined
     ORDER BY active_date DESC`,
    [userId, userId]
  );

  const dates = rows.map(r => r.active_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current streak
  let currentStreak = 0;
  let checkDate = new Date(today);
  for (const d of dates) {
    const dDate = new Date(d);
    dDate.setHours(0, 0, 0, 0);
    const diff = Math.round((checkDate - dDate) / 86400000);
    if (diff <= 1) {
      currentStreak++;
      checkDate = new Date(dDate);
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;
  for (const d of [...dates].reverse()) {
    const dDate = new Date(d);
    dDate.setHours(0, 0, 0, 0);
    if (prevDate === null) {
      tempStreak = 1;
    } else {
      const diff = Math.round((dDate - prevDate) / 86400000);
      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = dDate;
  }

  // Active days in last 30 and 7
  const last30 = new Date(today);
  last30.setDate(last30.getDate() - 30);
  const last7 = new Date(today);
  last7.setDate(last7.getDate() - 7);

  const activeLast30 = dates.filter(d => new Date(d) >= last30).length;
  const activeLast7 = dates.filter(d => new Date(d) >= last7).length;

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    active_days_last_30: activeLast30,
    active_days_last_7: activeLast7,
  };
}
