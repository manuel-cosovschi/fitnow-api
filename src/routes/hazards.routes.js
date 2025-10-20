// src/routes/hazards.routes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const asPool = (req) => req.app.get('db');

/**
 * POST /hazards
 * body: { lat, lng, type, note?, severity? (1..3) }
 * Crea un hazard real en DB.
 */
router.post('/', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const { lat, lng, type, note = null, severity = 1 } = req.body || {};
    if (![lat, lng].every(Number.isFinite) || !type) {
      return res.status(400).json({ error: 'lat, lng y type son requeridos' });
    }
    const sev = Math.min(Math.max(Number(severity) || 1, 1), 3);
    const [r] = await db.query(
      `INSERT INTO hazards (user_id, lat, lng, type, note, severity, votes)
       VALUES (?,?,?,?,?,?,1)`,
      [req.user.id, lat, lng, type, note, sev]
    );
    return res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('POST /hazards error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /hazards/near?lat=&lng=&radius_m=
 * Lista hazards cercanos a un punto (para overlay del mapa).
 */
router.get('/near', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius_m = Number(req.query.radius_m || 400);
    if (![lat, lng].every(Number.isFinite)) {
      return res.status(400).json({ error: 'lat y lng requeridos' });
    }
    const deg = radius_m / 111320;
    const [rows] = await db.query(
      `SELECT id, lat, lng, type, note, severity, votes, created_at
         FROM hazards
        WHERE lat BETWEEN ? AND ?
          AND lng BETWEEN ? AND ?
        ORDER BY created_at DESC
        LIMIT 200`,
      [lat - deg, lat + deg, lng - deg, lng + deg]
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error('GET /hazards/near error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
