// src/controllers/analytics.controller.js
import { queryOne, query } from '../db.js';

export async function runningSummary(req, res, next) {
  try {
    const uid = req.user.id;
    const row = await queryOne(
      `SELECT
         COUNT(*)::int                                              AS total_sessions,
         COALESCE(SUM(distance_m),0)::float                        AS total_distance_m,
         COALESCE(SUM(duration_s),0)::float                        AS total_duration_s,
         COALESCE(AVG(avg_pace_s),0)::float                        AS avg_pace_s,
         COALESCE(AVG(avg_speed_mps),0)::float                     AS avg_speed_mps,
         COALESCE(AVG(avg_hr_bpm),0)::float                        AS avg_hr_bpm,
         COALESCE(MIN(avg_pace_s),0)::float                        AS best_pace_s,
         COALESCE(MAX(distance_m),0)::float                        AS longest_run_m,
         0::float                                                   AS total_elevation_gain_m
       FROM run_sessions WHERE user_id = ? AND status = 'completed'`,
      [uid]
    );
    res.json(row);
  } catch (err) { next(err); }
}

export async function runningWeekly(req, res, next) {
  try {
    const uid = req.user.id;
    const items = await query(
      `SELECT
         DATE_TRUNC('week', started_at)::date                AS week_start,
         COUNT(*)::int                                        AS sessions,
         COALESCE(SUM(distance_m),0)::float                  AS distance_m,
         COALESCE(SUM(duration_s),0)::float                  AS duration_s,
         COALESCE(AVG(avg_pace_s),0)::float                  AS avg_pace_s
       FROM run_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1 DESC`,
      [uid]
    );
    res.json({ items });
  } catch (err) { next(err); }
}

export async function gymSummary(req, res, next) {
  try {
    const uid = req.user.id;
    const [sess, sets, fav] = await Promise.all([
      queryOne(
        `SELECT
           COUNT(*)::int                                     AS total_sessions,
           COALESCE(SUM(total_sets),0)::int                 AS total_sets,
           COALESCE(SUM(total_reps),0)::int                 AS total_reps,
           COALESCE(SUM(total_volume_kg),0)::float          AS total_volume_kg,
           COALESCE(SUM(duration_s),0)::float               AS total_duration_s,
           COALESCE(AVG(total_sets),0)::float               AS avg_sets_per_session,
           COALESCE(AVG(total_volume_kg),0)::float          AS avg_volume_per_session
         FROM gym_sessions WHERE user_id = ? AND status = 'completed'`,
        [uid]
      ),
      null,
      queryOne(
        `SELECT exercise_name FROM gym_sets gs
         JOIN gym_sessions s ON s.id = gs.session_id
         WHERE s.user_id = ?
         GROUP BY exercise_name ORDER BY COUNT(*) DESC LIMIT 1`,
        [uid]
      ),
    ]);
    res.json({ ...sess, favorite_exercise: fav?.exercise_name ?? null });
  } catch (err) { next(err); }
}

export async function gymWeekly(req, res, next) {
  try {
    const uid = req.user.id;
    const items = await query(
      `SELECT
         DATE_TRUNC('week', started_at)::date  AS week_start,
         COUNT(*)::int                          AS sessions,
         COALESCE(SUM(total_sets),0)::int       AS total_sets,
         COALESCE(SUM(total_volume_kg),0)::float AS total_volume_kg
       FROM gym_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1 DESC`,
      [uid]
    );
    res.json({ items });
  } catch (err) { next(err); }
}

export async function gymMuscleDist(req, res, next) {
  try {
    const uid = req.user.id;
    const rows = await query(
      `SELECT gs.muscle_group,
              COUNT(*)::int                     AS total_sets,
              COALESCE(SUM(gs.actual_weight * gs.actual_reps),0)::float AS total_volume_kg
       FROM gym_sets gs
       JOIN gym_sessions s ON s.id = gs.session_id
       WHERE s.user_id = ? AND gs.muscle_group IS NOT NULL
       GROUP BY gs.muscle_group`,
      [uid]
    );
    const grandTotal = rows.reduce((s, r) => s + r.total_sets, 0) || 1;
    const items = rows.map((r) => ({
      ...r,
      percentage: Math.round((r.total_sets / grandTotal) * 100),
    }));
    res.json({ items });
  } catch (err) { next(err); }
}

export async function streak(req, res, next) {
  try {
    const uid = req.user.id;
    const [g, act30, act7] = await Promise.all([
      queryOne(`SELECT streak_days FROM user_gamification WHERE user_id = ?`, [uid]),
      queryOne(
        `SELECT COUNT(DISTINCT d)::int AS cnt FROM (
           SELECT DATE(started_at) AS d FROM run_sessions WHERE user_id = ? AND status='completed' AND started_at >= NOW()-INTERVAL '30 days'
           UNION
           SELECT DATE(started_at) AS d FROM gym_sessions WHERE user_id = ? AND status='completed' AND started_at >= NOW()-INTERVAL '30 days'
         ) t`,
        [uid, uid]
      ),
      queryOne(
        `SELECT COUNT(DISTINCT d)::int AS cnt FROM (
           SELECT DATE(started_at) AS d FROM run_sessions WHERE user_id = ? AND status='completed' AND started_at >= NOW()-INTERVAL '7 days'
           UNION
           SELECT DATE(started_at) AS d FROM gym_sessions WHERE user_id = ? AND status='completed' AND started_at >= NOW()-INTERVAL '7 days'
         ) t`,
        [uid, uid]
      ),
    ]);
    res.json({
      current_streak:      g?.streak_days ?? 0,
      longest_streak:      g?.streak_days ?? 0,
      active_days_last_30: act30?.cnt ?? 0,
      active_days_last_7:  act7?.cnt  ?? 0,
    });
  } catch (err) { next(err); }
}
