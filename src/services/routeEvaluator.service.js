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
  w_dist_fid:   0.40,
  w_hazard_exp: 0.35,
  w_turns:      0.15,
  w_hist:       0.10,
};

// Perfiles del corredor: multiplicadores sobre los pesos base. El usuario
// elige qué priorizar sin tocar la calibración del admin.
export const PLANNER_PROFILES = {
  equilibrado: { w_dist_fid: 1.0, w_hazard_exp: 1.0, w_turns: 1.0, w_hist: 1.0 },
  seguridad:   { w_dist_fid: 0.7, w_hazard_exp: 1.7, w_turns: 1.0, w_hist: 1.0 },
  distancia:   { w_dist_fid: 1.6, w_hazard_exp: 0.5, w_turns: 1.0, w_hist: 0.8 },
};

// Aplica el perfil elegido sobre los pesos base (el score renormaliza solo).
export function applyProfile(weights, profile) {
  const mult = PLANNER_PROFILES[profile] ?? PLANNER_PROFILES.equilibrado;
  return {
    w_dist_fid:   Number(weights.w_dist_fid   ?? DEFAULT_PLANNER_WEIGHTS.w_dist_fid)   * mult.w_dist_fid,
    w_hazard_exp: Number(weights.w_hazard_exp ?? DEFAULT_PLANNER_WEIGHTS.w_hazard_exp) * mult.w_hazard_exp,
    w_turns:      Number(weights.w_turns      ?? DEFAULT_PLANNER_WEIGHTS.w_turns)      * mult.w_turns,
    w_hist:       Number(weights.w_hist       ?? DEFAULT_PLANNER_WEIGHTS.w_hist)       * mult.w_hist,
  };
}

/**
 * C4 — Horario: de noche, los hazards de iluminación pesan el doble en la
 * exposición. La hora se interpreta en hora argentina (UTC-3), donde opera
 * el prototipo.
 */
// Dice si una corrida es nocturna (20:00 a 07:00 hora argentina).
export function isNight(when) {
  if (!when) return false;
  const d = new Date(when);
  if (isNaN(d)) return false;
  const hourART = (d.getUTCHours() + 21) % 24; // UTC-3
  return hourART >= 20 || hourART < 7;
}

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
export function hazardExposure(coords, hazards, { radiusM = HAZARD_RADIUS_M, stepM = SAMPLE_STEP_M, night = false } = {}) {
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
        // peso del hazard: severidad (1..3) amplificada suavemente por votos;
        // de noche, los reportes de mala iluminación pesan el doble.
        let weight = (Number(h.severity) || 1) * (1 + Math.log2(1 + (Number(h.votes) || 1)) / 4);
        if (night && h.type === 'iluminacion') weight *= 2;
        exposure += stepM * weight;
        touched.add(h.id);
      }
    }
  }
  return { exposureM: Math.round(exposure), hazardsTouched: touched.size };
}

/**
 * C5 — Historial: afinidad de la candidata con rutas ya calificadas por
 * usuarios. Mide el solape geométrico (muestras a menos de 60 m de la ruta
 * calificada) y lo pondera por la calificación. Devuelve el mejor match
 * (0..1) o null si no hay rutas calificadas cerca (el criterio se saltea).
 */
// Chequea si la candidata se parece a rutas que a la gente ya le gustaron.
export function historicalAffinity(coords, ratedRoutes, { nearM = 60, stepM = 100 } = {}) {
  const rated = (ratedRoutes || []).filter(r =>
    (Number(r.feedback_count) || 0) > 0 && Array.isArray(r.coords) && r.coords.length >= 2
  );
  if (rated.length === 0) return null;

  const samples = resamplePolyline(coords, stepM);
  if (samples.length === 0) return null;

  let best = 0;
  for (const r of rated) {
    const refSamples = resamplePolyline(r.coords, stepM);
    if (refSamples.length === 0) continue;
    let near = 0;
    for (const p of samples) {
      if (refSamples.some(q => haversineM(p.lat, p.lng, q.lat, q.lng) <= nearM)) near++;
    }
    const overlap = near / samples.length;
    const rating  = Math.max(0, Math.min(5, Number(r.avg_rating) || 0)) / 5;
    best = Math.max(best, overlap * rating);
  }
  return Math.round(best * 1000) / 1000;
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
export function scorePortfolio(candidates, { hazards = [], weights = DEFAULT_PLANNER_WEIGHTS, targetM, night = false, ratedRoutes = [] }) {
  const w = {
    dist:   Number(weights.w_dist_fid   ?? DEFAULT_PLANNER_WEIGHTS.w_dist_fid),
    hazard: Number(weights.w_hazard_exp ?? DEFAULT_PLANNER_WEIGHTS.w_hazard_exp),
    turns:  Number(weights.w_turns      ?? DEFAULT_PLANNER_WEIGHTS.w_turns),
    hist:   Number(weights.w_hist       ?? DEFAULT_PLANNER_WEIGHTS.w_hist),
  };

  const enriched = candidates.map(c => {
    const coords = c.geojson?.coordinates ?? [];
    const { exposureM, hazardsTouched } = hazardExposure(coords, hazards, { night });
    const { turns, turnsPerKm } = turnComplexity(coords, c.distance_m);
    const hist = historicalAffinity(coords, ratedRoutes);
    return { ...c, _exposureM: exposureM, _hazardsTouched: hazardsTouched, _turns: turns, _turnsPerKm: turnsPerKm, _hist: hist };
  });

  // Normalización relativa a la cartera (peor candidata = 0 en ese criterio).
  const maxExp   = Math.max(...enriched.map(c => c._exposureM), 0);
  const maxTurns = Math.max(...enriched.map(c => c._turnsPerKm), 0);
  // El historial solo participa si hay rutas calificadas cerca; si no, su
  // peso se redistribuye automáticamente (queda fuera de la suma).
  const hasHist  = enriched.some(c => c._hist != null);

  const scored = enriched.map(c => {
    const cDist   = distanceFidelity(c.distance_m, targetM);
    const cHazard = maxExp   > 0 ? 1 - c._exposureM  / maxExp   : 1;
    const cTurns  = maxTurns > 0 ? 1 - c._turnsPerKm / maxTurns : 1;
    const cHist   = hasHist ? (c._hist ?? 0) : null;

    const wSum  = w.dist + w.hazard + w.turns + (hasHist ? w.hist : 0) || 1;
    const score = (w.dist * cDist + w.hazard * cHazard + w.turns * cTurns + (hasHist ? w.hist * cHist : 0)) / wSum;

    return {
      ...c,
      score: Math.round(score * 1000) / 1000,
      criteria: {
        distance_fidelity: cDist,
        hazard_exposure_m: c._exposureM,
        hazards_touched:   c._hazardsTouched,
        turns_per_km:      c._turnsPerKm,
        ...(hasHist ? { historical_affinity: cHist } : {}),
      },
      explanation: buildExplanation(c, targetM, night),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// Arma la frase corta que ve el usuario: por qué se eligió esta ruta.
function buildExplanation(c, targetM, night = false) {
  const km = (c.distance_m / 1000).toFixed(2);
  const parts = [`${km} km`];
  if (c._hazardsTouched === 0) parts.push('sin zonas reportadas en el trazado');
  else parts.push(`pasa cerca de ${c._hazardsTouched} zona${c._hazardsTouched > 1 ? 's' : ''} reportada${c._hazardsTouched > 1 ? 's' : ''}`);
  parts.push(`${c._turns} giro${c._turns === 1 ? '' : 's'}`);
  if (night) parts.push('horario nocturno considerado');
  if (c._hist != null && c._hist >= 0.4) parts.push('parecida a rutas bien calificadas');
  return parts.join(' · ');
}
