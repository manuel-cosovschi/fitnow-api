// src/routes/run.telemetry.routes.js
import { Router } from 'express';
import { authMiddleware as auth } from '../middleware/auth.js';

const router = Router();

// Para MVP: memoria. (Luego se puede pasar a MySQL)
const SESSIONS = new Map();

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * POST /api/run/sessions/start
 * body: { route_id, origin_lat, origin_lng }
 * resp: { session_id }
 */
router.post('/sessions/start', auth, (req, res) => {
  try {
    const { route_id, origin_lat, origin_lng } = req.body || {};
    const id = newId();
    const now = Date.now();

    SESSIONS.set(id, {
      id,
      user_id: req.user?.id ?? null,
      route_id: route_id ?? null,
      origin: { lat: origin_lat ?? null, lng: origin_lng ?? null },
      started_at: now,
      progress: [],
      finished_at: null,
      summary: null
    });

    console.log('[RUN][START]', { id, route_id, origin_lat, origin_lng, user: req.user?.id });
    return res.json({ session_id: id });
  } catch (e) {
    console.error('run start error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/run/sessions/progress
 * body: { session_id, ts, lat, lng, speed, off_route }
 * resp: { ok: true }
 */
router.post('/sessions/progress', auth, (req, res) => {
  try {
    const { session_id, ts, lat, lng, speed, off_route } = req.body || {};
    const s = SESSIONS.get(session_id);
    if (!s) return res.status(404).json({ error: 'session not found' });

    const point = {
      ts: ts ?? Date.now(),
      lat: Number(lat),
      lng: Number(lng),
      speed: Number.isFinite(speed) ? Number(speed) : null,
      off_route: !!off_route
    };
    s.progress.push(point);
    return res.json({ ok: true });
  } catch (e) {
    console.error('run progress error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/run/sessions/finish
 * body: { session_id, duration, distance, deviates_count }
 * resp: { ok: true }
 */
router.post('/sessions/finish', auth, (req, res) => {
  try {
    const { session_id, duration, distance, deviates_count } = req.body || {};
    const s = SESSIONS.get(session_id);
    if (!s) return res.status(404).json({ error: 'session not found' });

    s.finished_at = Date.now();
    s.summary = {
      duration: Number(duration) || null,
      distance: Number(distance) || null,
      deviates_count: Number(deviates_count) || 0
    };

    console.log('[RUN][FINISH]', { session_id, summary: s.summary });
    return res.json({ ok: true });
  } catch (e) {
    console.error('run finish error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;