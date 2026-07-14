// src/services/routeEvaluator.service.js
// El evaluador multicriterio del planificador de rutas: recibe una cartera de
// rutas candidatas (con su geometría real por calles) y le pone un puntaje a
// cada una combinando varios criterios sobre el trazado. Acá vive el "método
// propio" del planificador: OSRM resuelve el camino por calles; decidir cuál
// de todos los caminos posibles es el mejor para salir a correr lo decide esto.
//
// Criterios (cada uno normalizado a [0,1], donde 1 = mejor):
//   C1 fidelidad de distancia  — qué tan cerca quedó de lo que pediste
//   C2 exposición a hazards    — cuántos metros del trazado pasan cerca de
//                                zonas reportadas, ponderado por severidad
//   C6 complejidad de giros    — cuántos cambios bruscos de rumbo por km
// (C3 superficie, C4 horario y C5 historial se incorporan en la fase 2.)

import { haversineM } from '../utils/geo.js';

// Pesos por defecto del score (se pisan con los de ai_weights si existen).
export const DEFAULT_PLANNER_WEIGHTS = {
  w_dist_fid:   0.45,
  w_hazard_exp: 0.35,
  w_turns:      0.20,
};

// Cada cuántos metros muestreamos el trazado para medir exposición.
const SAMPLE_STEP_M = 50;
// A menos de esta distancia de un hazard, el tramo cuenta como "expuesto".
const HAZARD_RADIUS_M = 75;
// Un cambio de rumbo mayor a esto cuenta como giro brusco.
const TURN_THRESHOLD_DEG = 60;
// Segmentos más cortos que esto se ignoran al medir giros (ruido de la geometría).
const MIN_SEGMENT_M = 15;

/**
 * Re-muestrea la polilínea en puntos equiespaciados (~stepM metros).
 * Sirve para medir exposición sin depender de cómo vengan repartidos los
 * vértices que devuelve el motor de ruteo.
 * @param {Array<[lng,lat]>} coords geometría GeoJSON (LineString.coordinates)
 */
// Recorre el dibujo de la ruta y devuelve un punto cada ~50 metros.
export function resamplePolyline(coords, stepM = SAMPLE_STEP_M) {
  if (!coords || coords.length < 2) return [];
  const out = [{ lat: coords[0][1], lng: coords[0][0] }];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][1], lng: coords[i - 1][0] };
    const b = { lat: coords[i][1],     lng: coords[i][0] };
    const seg = haversineM(a.lat, a.lng, b.lat, b.lng);
    if (seg <= 0) continue;
    let d = stepM - carry;
    while (d < seg) {
      const t = d / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      d += stepM;
    }
    carry = (carry + seg) % stepM;
  }
  return out;
}

/**
 * C2 — Exposición a hazards: suma, para cada hazard activo, los metros del
 * trazado que pasan a menos de HAZARD_RADIUS_M, ponderados por severidad y
 * votos. Devuelve "metros ponderados" (0 = trazado limpio).
 */
// Mide cuántos metros de la ruta pasan cerca de peligros reportados.
export function hazardExposure(coords, hazards, { radiusM = HAZARD_RADIUS_M, stepM = SAMPLE_STEP_M } = {}) {
  const active = (hazards || []).filter(h =>
    (h.status ?? 'active') === 'active' &&
    (!h.expires_at || new Date(h.expires_at) > new Date())
  );
  if (active.length === 0) return { exposureM: 0, hazardsTouched: 0 };

  const samples = resamplePolyline(coords, stepM);
  const touched = new Set();
  let exposure = 0;
  for (const p of samples) {
    for (const h of active) {
      if (haversineM(p.lat, p.lng, Number(h.lat), Number(h.lng)) <= radiusM) {
        // peso del hazard: severidad (1..3) amplificada suavemente por votos
        const weight = (Number(h.severity) || 1) * (1 + Math.log2(1 + (Number(h.votes) || 1)) / 4);
        exposure += stepM * weight;
        touched.add(h.id);
      }
    }
  }
  return { exposureM: Math.round(exposure), hazardsTouched: touched.size };
}

/**
 * C6 — Complejidad de giros: cambios de rumbo > TURN_THRESHOLD_DEG por km.
 * Menos giros = circuito más fluido para correr.
 */
// Cuenta los giros bruscos de la ruta y los expresa por kilómetro.
export function turnComplexity(coords, totalM) {
  if (!coords || coords.length < 3) return { turns: 0, turnsPerKm: 0 };
  const bearing = (a, b) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const dLng = toRad(b[0] - a[0]);
    const y = Math.sin(dLng) * Math.cos(toRad(b[1]));
    const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
              Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  let turns = 0;
  let prevBearing = null;
  let prevPoint = coords[0];
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineM(prevPoint[1], prevPoint[0], coords[i][1], coords[i][0]);
    if (seg < MIN_SEGMENT_M) continue; // ruido: no evaluar giros de segmentos mínimos
    const br = bearing(prevPoint, coords[i]);
    if (prevBearing != null) {
      let diff = Math.abs(br - prevBearing);
      if (diff > 180) diff = 360 - diff;
      if (diff > TURN_THRESHOLD_DEG) turns++;
    }
    prevBearing = br;
    prevPoint = coords[i];
  }
  const km = Math.max((totalM || 0) / 1000, 0.001);
  return { turns, turnsPerKm: Math.round((turns / km) * 100) / 100 };
}

/**
 * C1 — Fidelidad de distancia: 1 si es exacta, cae linealmente hasta 0 cuando
 * el error llega al doble de la tolerancia.
 */
// Puntúa qué tan cerca quedó la distancia real de la pedida.
export function distanceFidelity(actualM, targetM, tolerance = 0.05) {
  if (!targetM) return 0;
  const err = Math.abs(actualM - targetM) / targetM;
  const v = 1 - err / (2 * tolerance);
  return Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
}

/**
 * Evalúa la cartera completa: calcula los criterios de cada candidata, los
 * normaliza dentro de la cartera y arma el score ponderado + la explicación.
 * @returns las candidatas con { criteria, score, explanation }, ordenadas.
 */
// Pone nota a cada ruta candidata y las ordena de mejor a peor.
export function scorePortfolio(candidates, { hazards = [], weights = DEFAULT_PLANNER_WEIGHTS, targetM }) {
  const w = {
    dist:   Number(weights.w_dist_fid   ?? DEFAULT_PLANNER_WEIGHTS.w_dist_fid),
    hazard: Number(weights.w_hazard_exp ?? DEFAULT_PLANNER_WEIGHTS.w_hazard_exp),
    turns:  Number(weights.w_turns      ?? DEFAULT_PLANNER_WEIGHTS.w_turns),
  };
  const wSum = w.dist + w.hazard + w.turns || 1;

  const enriched = candidates.map(c => {
    const coords = c.geojson?.coordinates ?? [];
    const { exposureM, hazardsTouched } = hazardExposure(coords, hazards);
    const { turns, turnsPerKm } = turnComplexity(coords, c.distance_m);
    return { ...c, _exposureM: exposureM, _hazardsTouched: hazardsTouched, _turns: turns, _turnsPerKm: turnsPerKm };
  });

  // Normalización relativa a la cartera (peor candidata = 0 en ese criterio).
  const maxExp   = Math.max(...enriched.map(c => c._exposureM), 0);
  const maxTurns = Math.max(...enriched.map(c => c._turnsPerKm), 0);

  const scored = enriched.map(c => {
    const cDist   = distanceFidelity(c.distance_m, targetM);
    const cHazard = maxExp   > 0 ? 1 - c._exposureM  / maxExp   : 1;
    const cTurns  = maxTurns > 0 ? 1 - c._turnsPerKm / maxTurns : 1;
    const score   = (w.dist * cDist + w.hazard * cHazard + w.turns * cTurns) / wSum;

    return {
      ...c,
      score: Math.round(score * 1000) / 1000,
      criteria: {
        distance_fidelity: cDist,
        hazard_exposure_m: c._exposureM,
        hazards_touched:   c._hazardsTouched,
        turns_per_km:      c._turnsPerKm,
      },
      explanation: buildExplanation(c, targetM),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// Arma la frase corta que ve el usuario: por qué se eligió esta ruta.
function buildExplanation(c, targetM) {
  const km = (c.distance_m / 1000).toFixed(2);
  const parts = [`${km} km`];
  if (c._hazardsTouched === 0) parts.push('sin zonas reportadas en el trazado');
  else parts.push(`pasa cerca de ${c._hazardsTouched} zona${c._hazardsTouched > 1 ? 's' : ''} reportada${c._hazardsTouched > 1 ? 's' : ''}`);
  parts.push(`${c._turns} giro${c._turns === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
