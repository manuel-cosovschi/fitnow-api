// src/routes/run.routes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /run/routes
 * body: { origin_lat, origin_lng, distance_m }
 * Devuelve 3 opciones geojson line string: segura / fluida / escénica
 */
router.post('/routes', authMiddleware, async (req, res) => {
  try {
    const { origin_lat, origin_lng, distance_m } = req.body || {};
    if (![origin_lat, origin_lng, distance_m].every(Number.isFinite)) {
      return res.status(400).json({ error: 'origin_lat, origin_lng, distance_m are required' });
    }

    // Utilidades de ruta “sintética” para el MVP (sin Mapbox/OSRM)
    const mToDeg = (m) => m / 111_320; // aprox grados lat por metro (simplificación)
    const mkLeg = (ox, oy, dx, dy) => ([ [ox, oy], [dx, dy] ]);

    const OX = +origin_lng; // GeoJSON es [lng, lat]
    const OY = +origin_lat;
    const leg = mToDeg(distance_m / 4);

    // Tres variantes: segura (rectas cerca de avenidas), fluida (pocos giros), escénica (parques)
    const variants = [
      {
        id: 101,
        label: 'Más segura',
        preference: 'safe',
        rationale: 'Calles anchas y bien iluminadas, minimiza callejones.',
        coords: [
          ...mkLeg(OX, OY, OX + leg, OY),
          ...mkLeg(OX + leg, OY, OX + leg, OY + leg),
          ...mkLeg(OX + leg, OY + leg, OX, OY + leg),
          ...mkLeg(OX, OY + leg, OX, OY)
        ]
      },
      {
        id: 102,
        label: 'Más fluida',
        preference: 'smooth',
        rationale: 'Menos cruces y giros, ideal para pace estable.',
        coords: [
          ...mkLeg(OX, OY, OX + leg*1.2, OY + leg*0.2),
          ...mkLeg(OX + leg*1.2, OY + leg*0.2, OX + leg*0.2, OY + leg*1.2),
          ...mkLeg(OX + leg*0.2, OY + leg*1.2, OX - leg*0.8, OY + leg*0.2),
          ...mkLeg(OX - leg*0.8, OY + leg*0.2, OX, OY)
        ]
      },
      {
        id: 103,
        label: 'Más escénica',
        preference: 'scenic',
        rationale: 'Prioriza áreas verdes y bordes de parques.',
        coords: [
          ...mkLeg(OX, OY, OX, OY + leg*0.8),
          ...mkLeg(OX, OY + leg*0.8, OX - leg*0.6, OY + leg*1.3),
          ...mkLeg(OX - leg*0.6, OY + leg*1.3, OX + leg*0.7, OY + leg*1.0),
          ...mkLeg(OX + leg*0.7, OY + leg*1.0, OX, OY)
        ]
      }
    ];

    const items = variants.map(v => ({
      id: v.id,
      preference: v.preference,
      label: v.label,
      rationale: v.rationale,
      distance_m: distance_m,
      geojson: {
        type: 'LineString',
        coordinates: v.coords
      }
    }));

    return res.json({ items });
  } catch (e) {
    console.error('POST /run/routes error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /run/feedback
 * body: { route_id, rating }
 */
router.post('/feedback', authMiddleware, async (req, res) => {
  try {
    const { route_id, rating } = req.body || {};
    if (!Number.isFinite(route_id) || !Number.isFinite(rating)) {
      return res.status(400).json({ error: 'route_id and rating are required' });
    }
    // Guardá en DB si querés; por ahora log
    console.log('Feedback', { user: req.user.id, route_id, rating });
    return res.json({ status: 'ok' });
  } catch (e) {
    console.error('POST /run/feedback error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;

