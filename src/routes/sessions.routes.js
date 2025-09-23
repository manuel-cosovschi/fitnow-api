// src/routes/sessions.routes.js
import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware as auth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/activities/:id/sessions
 * Lista las sesiones (clases) de un Personal Trainer para una actividad dada.
 * Devuelve siempre { items: [...] } (aunque esté vacío).
 */
router.get('/activities/:id/sessions', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, activity_id, start_at, end_at, capacity, price, seats_left, level
         FROM activity_sessions
        WHERE activity_id = ?
        ORDER BY start_at ASC`,
      [id]
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error('list sessions error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/sessions/:sid/book
 * Requiere que el usuario tenga una membresía vigente (inscripción general a la actividad)
 * y respeta el límite semanal definido en a.rules.sessions.per_week_limit.
 */
router.post('/sessions/:sid/book', auth, async (req, res) => {
  const { sid } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1) Traemos la sesión + actividad + reglas y bloqueamos el registro de la sesión
    const [srows] = await conn.query(
      `SELECT s.id, s.activity_id, s.start_at, s.end_at, s.capacity, s.price, s.seats_left,
              a.rules
         FROM activity_sessions s
         JOIN activities a ON a.id = s.activity_id
        WHERE s.id = ? FOR UPDATE`,
      [sid]
    );
    if (!srows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Session not found' });
    }
    const s = srows[0];

    if (s.seats_left <= 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'No seats left' });
    }

    // 2) Validamos membresía (inscripción general a la actividad: session_id IS NULL)
    const [mem] = await conn.query(
      `SELECT id, start_at, end_at
         FROM enrollments
        WHERE user_id = ? AND activity_id = ? AND session_id IS NULL
        ORDER BY id DESC
        LIMIT 1`,
      [req.user.id, s.activity_id]
    );
    if (!mem.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Membership required' });
    }
    // (Opcional) si tu inscripción general tiene ventana de vigencia, la checamos:
    const m = mem[0];
    if (m.start_at && m.end_at) {
      // si la sesión cae fuera del rango de la membresía, rechazamos
      const sessStart = new Date(s.start_at).getTime();
      if (sessStart < new Date(m.start_at).getTime() || sessStart > new Date(m.end_at).getTime()) {
        await conn.rollback();
        return res.status(409).json({ error: 'Membership not valid for this date' });
      }
    }

    // 3) Límite semanal (opcional, por reglas JSON)
    let perWeekLimit = 0;
    try {
      // a.rules puede venir como JSON o string; normalizamos
      const rulesObj = typeof s.rules === 'string' ? JSON.parse(s.rules) : (s.rules || {});
      perWeekLimit = rulesObj?.sessions?.per_week_limit ?? 0;
    } catch {
      // sin reglas válidas -> sin límite
      perWeekLimit = 0;
    }

    if (perWeekLimit > 0) {
      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS c
           FROM enrollments e
           JOIN activity_sessions ss ON ss.id = e.session_id
          WHERE e.user_id = ?
            AND e.activity_id = ?
            AND e.session_id IS NOT NULL
            AND YEARWEEK(ss.start_at, 1) = YEARWEEK(?, 1)`,
        [req.user.id, s.activity_id, s.start_at]
      );
      if (cnt[0].c >= perWeekLimit) {
        await conn.rollback();
        return res.status(409).json({ error: 'Weekly limit reached' });
      }
    }

    // 4) Evitamos el doble booking de la misma sesión
    const [dup] = await conn.query(
      `SELECT id FROM enrollments WHERE user_id = ? AND session_id = ? LIMIT 1`,
      [req.user.id, sid]
    );
    if (dup.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Already enrolled' });
    }

    // 5) OK: descontamos cupo y creamos la inscripción a la sesión
    await conn.query(
      `UPDATE activity_sessions SET seats_left = seats_left - 1 WHERE id = ?`,
      [sid]
    );
    await conn.query(
      `INSERT INTO enrollments (user_id, activity_id, session_id, start_at, end_at, price_paid)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, s.activity_id, sid, s.start_at, s.end_at, s.price]
    );

    await conn.commit();
    return res.json({ status: 'ok' });
  } catch (e) {
    await conn.rollback();
    console.error('book session error:', e);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/sessions/:sid/book
 * Cancela la reserva de una sesión y devuelve el cupo.
 */
router.delete('/sessions/:sid/book', auth, async (req, res) => {
  const { sid } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM enrollments
        WHERE user_id = ? AND session_id = ? FOR UPDATE`,
      [req.user.id, sid]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Not found' });
    }

    await conn.query(`DELETE FROM enrollments WHERE id = ?`, [rows[0].id]);
    await conn.query(`UPDATE activity_sessions SET seats_left = seats_left + 1 WHERE id = ?`, [sid]);

    await conn.commit();
    return res.json({ status: 'ok' });
  } catch (e) {
    await conn.rollback();
    console.error('cancel session error:', e);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

export default router;




