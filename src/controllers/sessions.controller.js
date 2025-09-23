// src/controllers/sessions.controller.js
import pool from '../db.js';

export async function listSessionsByActivity(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, activity_id, start_at, end_at, capacity, seats_left, price
         FROM activity_sessions
        WHERE activity_id = ?
        ORDER BY start_at ASC`,
      [id]
    );
    return res.json({ items: rows }); // <- siempre un array
  } catch (e) {
    console.error('listSessionsByActivity error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function bookSession(req, res) {
  try {
    const { sid } = req.params;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[s]] = await conn.query(
        'SELECT id, seats_left FROM activity_sessions WHERE id = ? FOR UPDATE',
        [sid]
      );
      if (!s) { await conn.rollback(); return res.status(404).json({ error: 'Session not found' }); }
      if (s.seats_left <= 0) { await conn.rollback(); return res.status(409).json({ error: 'No seats left' }); }

      // única por usuario/sesión
      await conn.query(
        'INSERT INTO enrollments (user_id, activity_id, session_id) SELECT ?, activity_id, ? FROM activity_sessions WHERE id = ?',
        [req.user.id, sid, sid]
      );

      await conn.query('UPDATE activity_sessions SET seats_left = seats_left - 1 WHERE id = ?', [sid]);

      await conn.commit();
      return res.json({ status: 'ok' });
    } catch (e) {
      await conn.rollback();
      if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already enrolled' });
      console.error('bookSession error:', e);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('bookSession outer error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function cancelSession(req, res) {
  try {
    const { sid } = req.params;
    const uid = req.user.id;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[row]] = await conn.query(
        'SELECT id FROM enrollments WHERE user_id = ? AND session_id = ? FOR UPDATE',
        [uid, sid]
      );
      if (!row) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }); }

      await conn.query('DELETE FROM enrollments WHERE id = ?', [row.id]);
      await conn.query('UPDATE activity_sessions SET seats_left = seats_left + 1 WHERE id = ?', [sid]);

      await conn.commit();
      return res.json({ status: 'ok' });
    } catch (e) {
      await conn.rollback();
      console.error('cancelSession error:', e);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('cancelSession outer error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

