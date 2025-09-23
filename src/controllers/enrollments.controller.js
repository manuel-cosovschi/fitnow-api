// src/controllers/enrollments.controller.js
import pool from '../db.js';

export async function createEnrollment(req, res) {
  try {
    const { activity_id } = req.body;
    if (!activity_id) return res.status(400).json({ error: 'activity_id is required' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [actRows] = await conn.query(
        `SELECT id, seats_left, kind, rules FROM activities WHERE id = ? FOR UPDATE`,
        [activity_id]
      );
      if (!actRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Activity not found' }); }
      const act  = actRows[0];
      const kind = (act.kind || 'gym').toLowerCase();

      const rules = (() => { try { return act.rules ? JSON.parse(act.rules) : {}; } catch { return {}; } })();
      const m = rules.membership || {};
      const startDelayDays = Number.isFinite(+m.start_delay_days) ? +m.start_delay_days : 0;
      const durationDays   = Number.isFinite(+m.duration_days)   ? +m.duration_days   : 30;

      // Trainers, club (membresía) y gym: NO consumen cupo global (ilimitadas)
      if (kind === 'trainer' || kind === 'club' || kind === 'gym') {
        const [dup] = await conn.query(
          `SELECT id FROM enrollments WHERE user_id = ? AND activity_id = ? AND session_id IS NULL`,
          [req.user.id, activity_id]
        );
        if (dup.length) { await conn.rollback(); return res.status(409).json({ error: 'Already enrolled' }); }

        await conn.query(
          `INSERT INTO enrollments (user_id, activity_id, start_at, end_at)
           VALUES (
             ?,
             ?,
             DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY),
             DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), INTERVAL ? DAY)
           )`,
          [req.user.id, activity_id, startDelayDays, startDelayDays, durationDays]
        );

        await conn.commit();
        return res.status(201).json({ status: 'ok' });
      }

      // club_sport u otros: sí respetan cupos en activities
      if (act.seats_left <= 0) { await conn.rollback(); return res.status(409).json({ error: 'No seats left' }); }

      const [dup] = await conn.query(
        `SELECT id FROM enrollments WHERE user_id = ? AND activity_id = ? AND session_id IS NULL`,
        [req.user.id, activity_id]
      );
      if (dup.length) { await conn.rollback(); return res.status(409).json({ error: 'Already enrolled' }); }

      await conn.query(
        `INSERT INTO enrollments (user_id, activity_id, start_at, end_at)
         VALUES (
           ?,
           ?,
           DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY),
           DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), INTERVAL ? DAY)
         )`,
        [req.user.id, activity_id, startDelayDays, startDelayDays, durationDays]
      );
      await conn.query('UPDATE activities SET seats_left = seats_left - 1 WHERE id = ?', [activity_id]);

      await conn.commit();
      return res.status(201).json({ status: 'ok' });
    } catch (e) {
      await conn.rollback();
      if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already enrolled' });
      console.error('createEnrollment error:', e);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('createEnrollment outer error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function listMyEnrollments(req, res) {
  try {
    const when = String((req.query.when ?? 'upcoming')).toLowerCase();
    const effStart = 'COALESCE(e.start_at, a.date_start)';
    const effEnd   = 'COALESCE(e.end_at,   a.date_end)';

    let extra = ` AND (${effStart} IS NULL OR ${effStart} >= UTC_TIMESTAMP()) `;
    let order = ` ${effStart} ASC `;
    if (when === 'past') { extra = ` AND ${effStart} < UTC_TIMESTAMP() `; order = ` ${effStart} DESC `; }
    else if (when === 'all') { extra = ''; order = ` ${effStart} DESC `; }

    const [rows] = await pool.query(
      `
      SELECT
        e.id,
        e.activity_id,
        e.session_id,
        a.kind AS activity_kind,
        a.provider_id,
        p.name AS provider_name,
        a.title,
        a.location,
        ${effStart} AS date_start,
        ${effEnd}   AS date_end,
        COALESCE(e.price_paid, a.price) AS price
      FROM enrollments e
      JOIN activities a ON a.id = e.activity_id
      LEFT JOIN providers p ON p.id = a.provider_id
      WHERE e.user_id = ? ${extra}
      ORDER BY ${order}
      `,
      [req.user.id]
    );

    return res.json({ items: rows });
  } catch (e) {
    console.error('listMyEnrollments error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function cancelEnrollment(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, activity_id FROM enrollments WHERE id = ? AND user_id = ? FOR UPDATE',
        [id, userId]
      );
      if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Enrollment not found' }); }
      const activityId = rows[0].activity_id;

      await conn.query('DELETE FROM enrollments WHERE id = ? AND user_id = ?', [id, userId]);

      // Devolvemos cupo SOLO si la actividad lo usa (club_sport). Gym ya no.
      await conn.query(
        `UPDATE activities SET seats_left = seats_left + 1
         WHERE id = ? AND kind IN ('club_sport')`,
        [activityId]
      );

      await conn.commit();
      return res.json({ status: 'ok' });
    } catch (e) {
      await conn.rollback();
      console.error('cancelEnrollment error:', e);
      return res.status(500).json({ error: 'Server error' });
    } finally { conn.release(); }
  } catch (e) {
    console.error('cancelEnrollment outer error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}








