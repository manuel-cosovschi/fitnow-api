// src/routes/hazards.routes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /hazards?lat=..&lng=..&radius=..(m)
 * Devuelve áreas de riesgo cercanas (polígonos simples o puntos con radio).
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || '800'); // metros

    if (![lat, lng].every(Number.isFinite)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    // Dummy data: dos zonas con radios (para demo)
    const hazards = [
      {
        id: 1,
        title: 'Obra en vereda',
        description: 'Media calzada cortada',
        center_lat: lat + 0.002,
        center_lng: lng - 0.002,
        radius_m: 120,
        severity: 'medium'
      },
      {
        id: 2,
        title: 'Iluminación deficiente',
        description: 'Bloque con postes fuera de servicio',
        center_lat: lat - 0.0015,
        center_lng: lng + 0.0015,
        radius_m: 180,
        severity: 'low'
      }
    ];

    // (Opcional) filtrar aproximadamente por distancia euclidiana en grados
    const degPerMeter = 1 / 111_320;
    const maxDeg = radius * degPerMeter;
    const filtered = hazards.filter(h =>
      Math.abs(h.center_lat - lat) <= maxDeg &&
      Math.abs(h.center_lng - lng) <= maxDeg
    );

    return res.json({ items: filtered });
  } catch (e) {
    console.error('GET /hazards error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
