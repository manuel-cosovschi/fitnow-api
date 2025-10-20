// src/routes/run.routes.js
import express from 'express';
import polyline from '@mapbox/polyline';
import haversine from 'haversine-distance';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/* Utilidades comunes */
const asPool = (req) => req.app.get('db'); // pool seteado en app/server

// coords: [lat, lng]
function totalDistanceM(coords /*: [number, number][] */) {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { latitude: coords[i - 1][0], longitude: coords[i - 1][1] };
    const b = { latitude: coords[i][0], longitude: coords[i][1] };
    sum += haversine(a, b);
  }
  return Math.round(sum);
}

function bboxAndCenter(coords) {
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lng < minLng) minLng = lng;
    if (lat > maxLat) maxLat = lat;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    center_lat: (minLat + maxLat) / 2,
    center_lng: (minLng + maxLng) / 2,
    bbox_min_lat: minLat, bbox_min_lng: minLng,
    bbox_max_lat: maxLat, bbox_max_lng: maxLng
  };
}

/* =========================================================
   POST /run/routes
   Crea una ruta REAL a partir de una polyline codificada.
   body: { title, city?, polyline, duration_s? }
   Guarda en run_routes con bbox y centro.
   ========================================================= */
router.post('/routes', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const { title, city = null, polyline: enc, duration_s = null } = req.body || {};
    if (!title || typeof title !== 'string' || !enc || typeof enc !== 'string') {
      return res.status(400).json({ error: 'title (string) y polyline (string) son requeridos' });
    }

    const coords = polyline.decode(enc).map(([lat, lng]) => [lat, lng]);
    if (coords.length < 2) return res.status(400).json({ error: 'polyline insuficiente' });

    const distance_m = totalDistanceM(coords);
    const elevation_up_m = 0; // TODO: integrar proveedor de elevación si querés (OpenElevation/Mapbox)
    const g = bboxAndCenter(coords);

    const [ret] = await db.query(
      `INSERT INTO run_routes
       (title, city, distance_m, duration_s, elevation_up_m, polyline,
        center_lat, center_lng, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [title.trim(), city, distance_m, duration_s, elevation_up_m, enc,
       g.center_lat, g.center_lng, g.bbox_min_lat, g.bbox_min_lng, g.bbox_max_lat, g.bbox_max_lng]
    );

    return res.status(201).json({
      id: ret.insertId,
      title: title.trim(),
      city,
      distance_m,
      duration_s,
      elevation_up_m
    });
  } catch (e) {
    console.error('POST /run/routes error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================================================
   GET /run/routes
   Lista rutas (opcional: ?city=…)
   ========================================================= */
router.get('/routes', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const city = req.query.city || null;
    const [rows] = await db.query(
      `SELECT id, title, city, distance_m, duration_s, elevation_up_m,
              center_lat, center_lng, created_at
         FROM run_routes
        WHERE (? IS NULL OR city = ?)
        ORDER BY id DESC
        LIMIT 200`,
      [city, city]
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error('GET /run/routes error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================================================
   GET /run/routes/:id
   Meta de una ruta (sin decodificar polyline)
   ========================================================= */
router.get('/routes/:id', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const { id } = req.params;
    const [[row]] = await db.query(
      `SELECT id, title, city, distance_m, duration_s, elevation_up_m,
              center_lat, center_lng, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
         FROM run_routes
        WHERE id=? LIMIT 1`, [id]
    );
    if (!row) return res.status(404).json({ error: 'Route not found' });
    return res.json(row);
  } catch (e) {
    console.error('GET /run/routes/:id error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================================================
   GET /run/routes/:id/polyline?decode=1
   Devuelve la polyline original o el GeoJSON decodificado.
   ========================================================= */
router.get('/routes/:id/polyline', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const { id } = req.params;
    const decode = String(req.query.decode || '0') === '1';

    const [[row]] = await db.query(
      `SELECT id, title, city, distance_m, duration_s, elevation_up_m, polyline
         FROM run_routes WHERE id=? LIMIT 1`, [id]
    );
    if (!row) return res.status(404).json({ error: 'Route not found' });

    if (!decode) return res.json({ id: row.id, polyline: row.polyline });

    const coords = polyline.decode(row.polyline).map(([lat, lng]) => [lng, lat]); // GeoJSON [lng,lat]
    return res.json({
      id: row.id,
      title: row.title,
      city: row.city,
      distance_m: row.distance_m,
      duration_s: row.duration_s,
      elevation_up_m: row.elevation_up_m,
      geojson: { type: 'LineString', coordinates: coords }
    });
  } catch (e) {
    console.error('GET /run/routes/:id/polyline error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================================================
   GET /run/routes/recommendations?userId=&city=&radius_m=
   Recomendaciones reales en base a objetivo del user + hazards cercanos.
   ========================================================= */
router.get('/routes/recommendations', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const userId = Number(req.query.userId || req.user?.id);
    const city = req.query.city || null;
    const radius_m = Number(req.query.radius_m || 350);

    if (!userId) return res.status(400).json({ error: 'userId requerido' });

    const [[prefs]] = await db.query(
      `SELECT pref_goal_km, pref_surface FROM users WHERE id=? LIMIT 1`, [userId]
    );
    const goalM = (prefs?.pref_goal_km || 5) * 1000;

    const [routes] = await db.query(
      `SELECT id, title, city, distance_m, duration_s, elevation_up_m,
              center_lat, center_lng
         FROM run_routes
        WHERE (? IS NULL OR city = ?)`,
      [city, city]
    );

    const deg = radius_m / 111320; // ≈ grados por metro
    for (const rt of routes) {
      const lat = rt.center_lat, lng = rt.center_lng;

      const [[hz]] = await db.query(
        `SELECT COUNT(*) AS c
           FROM hazards
          WHERE lat BETWEEN ? AND ?
            AND lng BETWEEN ? AND ?`,
        [lat - deg, lat + deg, lng - deg, lng + deg]
      );

      const distancePenalty  = Math.abs(rt.distance_m - goalM) / 1000.0;
      const elevationPenalty = (rt.elevation_up_m || 0) / 100.0;
      const hazardPenalty    = (hz?.c || 0) * 0.5;

      rt.score = distancePenalty + elevationPenalty + hazardPenalty;
    }

    routes.sort((a, b) => a.score - b.score);
    return res.json({
      prefs: { goal_km: goalM / 1000, surface: prefs?.pref_surface || null },
      items: routes.slice(0, 20)
    });
  } catch (e) {
    console.error('GET /run/routes/recommendations error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* =========================================================
   POST /run/feedback
   Guarda feedback real de una ruta
   body: { route_id, rating, notes? }
   ========================================================= */
router.post('/feedback', authMiddleware, async (req, res) => {
  const db = asPool(req);
  try {
    const { route_id, rating, notes = null } = req.body || {};
    if (!Number.isFinite(route_id) || !Number.isFinite(rating)) {
      return res.status(400).json({ error: 'route_id y rating requeridos' });
    }
    await db.query(
      `INSERT INTO run_feedback (route_id, user_id, rating, notes)
       VALUES (?,?,?,?)`,
      [route_id, req.user.id, Math.max(1, Math.min(5, Math.round(rating))), notes]
    );
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('POST /run/feedback error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;

