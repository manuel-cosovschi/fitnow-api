// src/routes/sessions.routes.js
// Handles activity session listings and session bookings (gym classes, PT sessions, etc.)
// Run (GPS) sessions are handled separately in run.routes.js
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/activities/:id/sessions
 * Lista las sesiones (clases) de una actividad.
 */
router.get('/activities/:id/sessions', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, activity_id, start_at, end_at, capacity, price, seats_left, level
         FROM activity_sessions
        WHERE activity_id = ?
        ORDER BY start_at ASC`,
      [req.params.id]
    );
    return res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sessions/:sid/book
 * Reserva una sesión. Requiere membresía vigente a la actividad.
 * Respeta el límite semanal definido en activity.rules.sessions.per_week_limit.
 */
router.post('/sessions/:sid/book', requireAuth, async (req, res, next) => {
  const sid  = Number(req.params.sid);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1) Traer y bloquear la sesión
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
      return next(Errors.notFound('Sesión no encontrada.'));
    }
    const s = srows[0];

    if (s.seats_left <= 0) {
      await conn.rollback();
      return next(Errors.conflict('NO_SEATS', 'No quedan lugares en esta sesión.'));
    }

    // 2) Validar membresía vigente (inscripción general a la actividad)
    const [mem] = await conn.query(
      `SELECT id, start_at, end_at
         FROM enrollments
        WHERE user_id = ? AND activity_id = ? AND session_id IS NULL AND status = 'active'
        ORDER BY id DESC
        LIMIT 1`,
      [req.user.id, s.activity_id]
    );
    if (!mem.length) {
      await conn.rollback();
      return next(Errors.conflict('MEMBERSHIP_REQUIRED', 'Necesitás una membresía activa para esta actividad.'));
    }

    // Validar ventana temporal de la membresía si tiene fechas
    const m = mem[0];
    if (m.start_at && m.end_at) {
      const sessStart = new Date(s.start_at).getTime();
      if (sessStart < new Date(m.start_at).getTime() || sessStart > new Date(m.end_at).getTime()) {
        await conn.rollback();
        return next(Errors.conflict('MEMBERSHIP_DATE', 'Tu membresía no cubre la fecha de esta sesión.'));
      }
    }

    // 3) Respetar límite semanal (si está definido en rules JSON)
    let perWeekLimit = 0;
    try {
      const rules = typeof s.rules === 'string' ? JSON.parse(s.rules) : (s.rules || {});
      perWeekLimit = rules?.sessions?.per_week_limit ?? 0;
    } catch { /* sin reglas válidas → sin límite */ }

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
        return next(Errors.conflict('WEEKLY_LIMIT', `Alcanzaste el límite de ${perWeekLimit} sesiones semanales.`));
      }
    }

    // 4) Evitar doble booking (excluir cancelados para permitir re-inscripción)
    const [dup] = await conn.query(
      `SELECT id FROM enrollments WHERE user_id = ? AND session_id = ? AND status != 'cancelled' LIMIT 1`,
      [req.user.id, sid]
    );
    if (dup.length) {
      await conn.rollback();
      return next(Errors.conflict('ALREADY_BOOKED', 'Ya tenés esta sesión reservada.'));
    }

    // 5) Descontar cupo + crear inscripción
    await conn.query(`UPDATE activity_sessions SET seats_left = seats_left - 1 WHERE id = ?`, [sid]);
    await conn.query(
      `INSERT INTO enrollments (user_id, activity_id, session_id, start_at, end_at, price_paid)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, s.activity_id, sid, s.start_at, s.end_at, s.price]
    );

    await conn.commit();
    return res.status(201).json({ status: 'ok' });
  } catch (e) {
    await conn.rollback();
    logger.error('book session error', { sid, userId: req.user?.id, error: e.message });
    next(e);
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/sessions/:sid/book
 * Cancela la reserva de una sesión y devuelve el cupo.
 */
router.delete('/sessions/:sid/book', requireAuth, async (req, res, next) => {
  const sid  = Number(req.params.sid);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM enrollments
        WHERE user_id = ? AND session_id = ? AND status = 'active' FOR UPDATE`,
      [req.user.id, sid]
    );
    if (!rows.length) {
      await conn.rollback();
      return next(Errors.notFound('Reserva no encontrada.'));
    }

    await conn.query(`UPDATE enrollments SET status = 'cancelled' WHERE id = ?`, [rows[0].id]);
    await conn.query(`UPDATE activity_sessions SET seats_left = seats_left + 1 WHERE id = ?`, [sid]);

    await conn.commit();
    return res.json({ status: 'cancelled' });
  } catch (e) {
    await conn.rollback();
    logger.error('cancel session booking error', { sid, userId: req.user?.id, error: e.message });
    next(e);
  } finally {
    conn.release();
  }
});

export default router;
