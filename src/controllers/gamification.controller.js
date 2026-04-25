// src/controllers/gamification.controller.js
import { queryOne, query } from '../db.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';

function calcLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export async function getMe(req, res, next) {
  try {
    const uid = req.user.id;
    const [gami, badges, runStats, gymStats, enrollStats] = await Promise.all([
      queryOne(`SELECT * FROM user_gamification WHERE user_id = ?`, [uid]),
      query(
        `SELECT b.*, ub.earned_at FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ?`,
        [uid]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS sessions, COALESCE(SUM(distance_m),0)::float AS km
         FROM run_sessions WHERE user_id = ? AND status='completed'`,
        [uid]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS sessions, COALESCE(SUM(total_sets),0)::int AS sets
         FROM gym_sessions WHERE user_id = ? AND status='completed'`,
        [uid]
      ),
      queryOne(`SELECT COUNT(*)::int AS total FROM enrollments WHERE user_id = ? AND status='active'`, [uid]),
    ]);

    const totalXp = gami?.total_xp ?? 0;
    res.json({
      level:       gami?.level ?? calcLevel(totalXp),
      total_xp:    totalXp,
      streak_days: gami?.streak_days ?? 0,
      last_active: gami?.last_active ?? null,
      badges:      badges.map((b) => ({
        id:          b.id,
        code:        b.code,
        name:        b.name,
        description: b.description,
        icon:        b.icon,
        category:    b.category,
        threshold:   b.threshold,
        earned_at:   b.earned_at,
      })),
      stats: {
        total_run_sessions:    runStats?.sessions      ?? 0,
        total_run_km:          (runStats?.km ?? 0) / 1000,
        total_gym_sessions:    gymStats?.sessions      ?? 0,
        total_gym_sets:        gymStats?.sets          ?? 0,
        total_enrollments:     enrollStats?.total      ?? 0,
        total_feedbacks:       0,
        total_hazards_reported: 0,
      },
    });
  } catch (err) { next(err); }
}

export async function getHistory(req, res, next) {
  try {
    const { page, perPage, offset } = parsePagination(req.query);
    const uid = req.user.id;
    const [items, total] = await Promise.all([
      query(
        `SELECT id, xp, source, ref_type, note, created_at FROM xp_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [uid, perPage, offset]
      ),
      queryOne(`SELECT COUNT(*) AS total FROM xp_log WHERE user_id = ?`, [uid]),
    ]);
    res.json(paginatedResponse(items, { page, perPage, total: total?.total ?? 0 }));
  } catch (err) { next(err); }
}

export async function listBadges(req, res, next) {
  try {
    const uid  = req.user.id;
    const all  = await query(`SELECT * FROM badges ORDER BY id ASC`);
    const mine = await query(`SELECT badge_id FROM user_badges WHERE user_id = ?`, [uid]);
    const earnedSet = new Set(mine.map((r) => r.badge_id));
    res.json(all.map((b) => ({ ...b, earned: earnedSet.has(b.id) })));
  } catch (err) { next(err); }
}

export async function getRanking(req, res, next) {
  try {
    const { page, perPage, offset } = parsePagination(req.query);
    const type = req.query.type === 'weekly' ? 'weekly' : 'global';
    let items, total;

    if (type === 'weekly') {
      [items, total] = await Promise.all([
        query(
          `SELECT u.id, u.name, u.photo_url,
                  COALESCE(SUM(x.xp),0)::int AS weekly_xp,
                  g.total_xp, g.level, g.streak_days
           FROM users u
           LEFT JOIN xp_log x ON x.user_id = u.id AND x.created_at >= NOW() - INTERVAL '7 days'
           LEFT JOIN user_gamification g ON g.user_id = u.id
           WHERE u.deleted_at IS NULL
           GROUP BY u.id, u.name, u.photo_url, g.total_xp, g.level, g.streak_days
           ORDER BY weekly_xp DESC LIMIT ? OFFSET ?`,
          [perPage, offset]
        ),
        queryOne(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`),
      ]);
    } else {
      [items, total] = await Promise.all([
        query(
          `SELECT u.id, u.name, u.photo_url,
                  COALESCE(g.total_xp,0)::int AS total_xp,
                  g.level, g.streak_days
           FROM users u
           LEFT JOIN user_gamification g ON g.user_id = u.id
           WHERE u.deleted_at IS NULL
           ORDER BY total_xp DESC LIMIT ? OFFSET ?`,
          [perPage, offset]
        ),
        queryOne(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`),
      ]);
    }
    res.json(paginatedResponse(items, { page, perPage, total: total?.total ?? 0 }));
  } catch (err) { next(err); }
}
