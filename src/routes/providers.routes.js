// src/routes/providers.routes.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/** GET /api/providers/:id/sports */
router.get('/providers/:id/sports', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT s.id, s.name
         FROM provider_sports ps
         JOIN sports s ON s.id = ps.sport_id
        WHERE ps.provider_id = ?
        ORDER BY s.name ASC`, [id]
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error('list provider sports error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;

