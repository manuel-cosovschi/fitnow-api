import { describe, it, expect } from 'vitest';
import {
  resamplePolyline,
  hazardExposure,
  turnComplexity,
  distanceFidelity,
  scorePortfolio,
  isNight,
  applyProfile,
  historicalAffinity,
  DEFAULT_PLANNER_WEIGHTS,
} from '../../src/services/routeEvaluator.service.js';

// Línea recta de ~1 km hacia el norte desde el origen (0,0). En el ecuador,
// 0.009° de latitud ≈ 1000 m.
const straight1km = [[0, 0], [0, 0.009]];

// Cuadrado de ~400 m de lado (4 giros de 90°).
const square = [
  [0, 0], [0, 0.0036], [0.0036, 0.0036], [0.0036, 0], [0, 0],
];

describe('resamplePolyline', () => {
  it('muestrea una línea de 1 km cada 50 m (~20 puntos)', () => {
    const pts = resamplePolyline(straight1km, 50);
    expect(pts.length).toBeGreaterThan(15);
    expect(pts.length).toBeLessThan(25);
  });

  it('devuelve vacío para geometrías degeneradas', () => {
    expect(resamplePolyline([], 50)).toEqual([]);
    expect(resamplePolyline([[0, 0]], 50)).toEqual([]);
  });
});

describe('hazardExposure', () => {
  it('un hazard sobre el trazado genera exposición > 0', () => {
    const hz = [{ id: 1, lat: 0.0045, lng: 0, severity: 2, votes: 3, status: 'active' }];
    const { exposureM, hazardsTouched } = hazardExposure(straight1km, hz);
    expect(exposureM).toBeGreaterThan(0);
    expect(hazardsTouched).toBe(1);
  });

  it('un hazard lejos del trazado no suma', () => {
    const hz = [{ id: 1, lat: 0.0045, lng: 0.01, severity: 3, votes: 5, status: 'active' }]; // ~1.1 km al este
    const { exposureM, hazardsTouched } = hazardExposure(straight1km, hz);
    expect(exposureM).toBe(0);
    expect(hazardsTouched).toBe(0);
  });

  it('mayor severidad implica mayor exposición', () => {
    const leve  = [{ id: 1, lat: 0.0045, lng: 0, severity: 1, votes: 1, status: 'active' }];
    const grave = [{ id: 1, lat: 0.0045, lng: 0, severity: 3, votes: 1, status: 'active' }];
    expect(hazardExposure(straight1km, grave).exposureM)
      .toBeGreaterThan(hazardExposure(straight1km, leve).exposureM);
  });

  it('ignora hazards resueltos o vencidos', () => {
    const hz = [
      { id: 1, lat: 0.0045, lng: 0, severity: 3, votes: 5, status: 'resolved' },
      { id: 2, lat: 0.0045, lng: 0, severity: 3, votes: 5, status: 'active', expires_at: '2020-01-01T00:00:00Z' },
    ];
    expect(hazardExposure(straight1km, hz).exposureM).toBe(0);
  });
});

describe('turnComplexity', () => {
  it('una línea recta no tiene giros', () => {
    const { turns } = turnComplexity(straight1km, 1000);
    expect(turns).toBe(0);
  });

  it('un cuadrado tiene ~3 giros internos (4 lados)', () => {
    const { turns } = turnComplexity(square, 1600);
    expect(turns).toBeGreaterThanOrEqual(3);
  });
});

describe('distanceFidelity', () => {
  it('distancia exacta puntúa 1', () => {
    expect(distanceFidelity(5000, 5000)).toBe(1);
  });

  it('cae linealmente y llega a 0 al doble de la tolerancia', () => {
    expect(distanceFidelity(5250, 5000)).toBeCloseTo(0.5, 1); // 5% de error con tol 5%
    expect(distanceFidelity(5500, 5000)).toBe(0);              // 10% de error
  });
});

describe('scorePortfolio', () => {
  const target = 1000;
  const clean  = { spec: { kind: 'ida-vuelta' }, distance_m: 1000, geojson: { type: 'LineString', coordinates: straight1km } };
  // misma distancia pero desplazada al este, donde pusimos el hazard
  const risky  = { spec: { kind: 'ida-vuelta' }, distance_m: 1000, geojson: { type: 'LineString', coordinates: [[0.02, 0], [0.02, 0.009]] } };
  const hazards = [{ id: 9, lat: 0.0045, lng: 0.02, severity: 3, votes: 4, status: 'active' }];

  it('a igual distancia, la ruta limpia le gana a la que pasa por un hazard', () => {
    const ranked = scorePortfolio([risky, clean], { hazards, targetM: target });
    expect(ranked[0].geojson.coordinates[0][0]).toBe(0);   // la limpia primero
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].criteria.hazards_touched).toBe(1);
  });

  it('cada candidata sale con score, criterios y explicación', () => {
    const ranked = scorePortfolio([clean], { hazards: [], targetM: target });
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].criteria.distance_fidelity).toBe(1);
    expect(typeof ranked[0].explanation).toBe('string');
    expect(ranked[0].explanation).toContain('km');
  });
});

describe('isNight y modo nocturno', () => {
  it('detecta la noche en hora argentina', () => {
    expect(isNight('2026-07-15T02:00:00-03:00')).toBe(true);   // 2 AM ART
    expect(isNight('2026-07-15T15:00:00-03:00')).toBe(false);  // 3 PM ART
    expect(isNight(null)).toBe(false);
    expect(isNight('no es fecha')).toBe(false);
  });

  it('de noche, un hazard de iluminación pesa el doble', () => {
    const hz = [{ id: 1, lat: 0.0045, lng: 0, type: 'iluminacion', severity: 2, votes: 2, status: 'active' }];
    const dia   = hazardExposure(straight1km, hz, { night: false }).exposureM;
    const noche = hazardExposure(straight1km, hz, { night: true }).exposureM;
    expect(noche).toBe(dia * 2);
  });

  it('de noche, un hazard que no es de iluminación pesa igual', () => {
    const hz = [{ id: 1, lat: 0.0045, lng: 0, type: 'obra', severity: 2, votes: 2, status: 'active' }];
    expect(hazardExposure(straight1km, hz, { night: true }).exposureM)
      .toBe(hazardExposure(straight1km, hz, { night: false }).exposureM);
  });
});

describe('perfiles de pesos', () => {
  const target = 1000;
  // limpia pero con 6% de error de distancia (fidelidad baja)
  const limpiaImprecisa = { spec: { kind: 'ida-vuelta' }, distance_m: 1060, geojson: { type: 'LineString', coordinates: straight1km } };
  // exacta pero pasa por un hazard grave
  const exactaRiesgosa  = { spec: { kind: 'ida-vuelta' }, distance_m: 1000, geojson: { type: 'LineString', coordinates: [[0.02, 0], [0.02, 0.009]] } };
  const hazards = [{ id: 9, lat: 0.0045, lng: 0.02, severity: 3, votes: 6, status: 'active' }];

  it('el perfil seguridad prefiere la limpia; el perfil distancia prefiere la exacta', () => {
    const seg = scorePortfolio([limpiaImprecisa, exactaRiesgosa],
      { hazards, weights: applyProfile(DEFAULT_PLANNER_WEIGHTS, 'seguridad'), targetM: target });
    const dis = scorePortfolio([limpiaImprecisa, exactaRiesgosa],
      { hazards, weights: applyProfile(DEFAULT_PLANNER_WEIGHTS, 'distancia'), targetM: target });
    expect(seg[0].criteria.hazards_touched).toBe(0);        // gana la limpia
    expect(dis[0].criteria.distance_fidelity).toBe(1);      // gana la exacta
  });
});

describe('historicalAffinity', () => {
  it('una candidata que calca una ruta bien calificada tiene afinidad alta', () => {
    const rated = [{ coords: straight1km, avg_rating: 5, feedback_count: 3 }];
    const aff = historicalAffinity(straight1km, rated);
    expect(aff).toBeGreaterThan(0.8);
  });

  it('una candidata lejos de las calificadas tiene afinidad ~0', () => {
    const rated = [{ coords: straight1km, avg_rating: 5, feedback_count: 3 }];
    const lejos = [[0.05, 0], [0.05, 0.009]];
    expect(historicalAffinity(lejos, rated)).toBeLessThan(0.05);
  });

  it('sin rutas calificadas devuelve null y el criterio se saltea', () => {
    expect(historicalAffinity(straight1km, [])).toBe(null);
    const ranked = scorePortfolio(
      [{ spec: {}, distance_m: 1000, geojson: { type: 'LineString', coordinates: straight1km } }],
      { hazards: [], targetM: 1000, ratedRoutes: [] });
    expect(ranked[0].criteria.historical_affinity).toBeUndefined();
  });
});
