// src/services/routeGenerator.service.js
// Generates dynamic running route options from an origin point + desired distance.
// Tries OSRM (public routing engine) first; falls back to geometric circles.
//
// Env (all optional):
//   OSRM_BASE              default 'https://router.project-osrm.org'
//   OSRM_TIMEOUT_MS        default 6000
//   OSRM_CACHE_TTL_MS      default 300000 (5 min)
//   OSRM_CACHE_MAX_ENTRIES default 500

import { LRUCache } from '../utils/lruCache.js';
import * as runRepo from '../repositories/run.repository.js';
import * as hazardRepo from '../repositories/hazard.repository.js';
import * as aiRepo from '../repositories/ai.repository.js';
import { scorePortfolio, DEFAULT_PLANNER_WEIGHTS, applyProfile, isNight } from './routeEvaluator.service.js';

const OSRM_BASE       = () => process.env.OSRM_BASE || 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = () => parseInt(process.env.OSRM_TIMEOUT_MS, 10) || 6000;

const tripCache = new LRUCache({
  ttlMs:      parseInt(process.env.OSRM_CACHE_TTL_MS, 10)      || 5 * 60 * 1000,
  maxEntries: parseInt(process.env.OSRM_CACHE_MAX_ENTRIES, 10) || 500,
});

/**
 * Build a stable cache key from the request shape. We round lat/lng to ~110m
 * buckets so nearby starts share cache entries.
 */
// Arma una 'llave' para guardar rutas ya calculadas y no pedirlas de nuevo.
function cacheKey(lat, lng, distance_m, variant) {
  const round = (n) => Math.round(n * 1000) / 1000; // ~110m precision
  return `${round(lat)}|${round(lng)}|${distance_m}|${variant}`;
}

/**
 * Offset a coordinate by a bearing (degrees) and distance (meters).
 */
// Calcula un punto a X metros y en cierta dirección desde el origen (trigonometría sobre el mapa).
function offsetCoord(lat, lng, bearing, distance) {
  const R = 6371000;
  const b = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance / R) +
    Math.cos(lat1) * Math.sin(distance / R) * Math.cos(b),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(b) * Math.sin(distance / R) * Math.cos(lat1),
    Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2),
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (((lng2 * 180) / Math.PI) + 540) % 360 - 180,
  };
}

/**
 * Request a round-trip route from OSRM through the given waypoints.
 */
// Le pide a OSRM el recorrido real por las calles pasando por unos puntos.
async function fetchOsrmTrip(waypoints) {
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url =
    `${OSRM_BASE()}/trip/v1/foot/${coords}` +
    `?roundtrip=true&source=first&destination=last&geometries=geojson&overview=full`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS()) });
  if (!resp.ok) throw new Error(`OSRM ${resp.status}`);
  const data = await resp.json();
  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('OSRM: no trips returned');
  return data.trips[0];
}

/**
 * Geometric fallback: approximate circular loop starting at a given bearing.
 */
// Plan B si OSRM falla: dibuja un círculo con la circunferencia justa para dar la distancia pedida.
export function circularFallback(lat, lng, distance_m, startBearing = 0) {
  const R = 6371000;
  const radius = distance_m / (2 * Math.PI);
  const n = 36;
  const startRad = (startBearing * Math.PI) / 180;
  const coordinates = [];

  for (let i = 0; i <= n; i++) {
    const angle = startRad + (2 * Math.PI * i) / n;
    const dlat = (radius / R) * Math.cos(angle);
    const dlng = (radius / R) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
    coordinates.push([
      lng + (dlng * 180) / Math.PI,
      lat + (dlat * 180) / Math.PI,
    ]);
  }

  return { type: 'LineString', coordinates };
}

// Template for the 3 route styles
export const TEMPLATES = [
  {
    preference: 'directa',
    label: 'Ruta directa',
    rationale: 'Salida y regreso en línea recta. Ideal para mantener el ritmo constante.',
    bearings: [0],
    legFraction: 0.5,
  },
  {
    preference: 'circular',
    label: 'Ruta circular',
    rationale: 'Loop sin repetir camino. Pasás por zonas distintas de ida y vuelta.',
    bearings: [0, 120, 240],
    legFraction: 0.38,
  },
  {
    preference: 'aventura',
    label: 'Ruta aventura',
    rationale: 'Dirección alternativa para explorar otra zona de la ciudad.',
    bearings: [135],
    legFraction: 0.5,
  },
];

// How close the road distance must get to the requested distance before we
// accept the route (±5%). If OSRM can't get within this, we return an exact
// geometric loop instead, so the shown distance always matches what was asked.
const DISTANCE_TOLERANCE = 0.05;
const MAX_REFINE_ITERS   = 7;

/**
 * Build one route for a template. The road detour factor is impredecible and
 * varies a lot by zone, so instead of proportional scaling we BINARY-SEARCH the
 * leg length: distance grows with the leg, so we always converge. If OSRM still
 * can't land within tolerance (or is unavailable), we fall back to a geometric
 * loop whose length is EXACTLY the requested distance.
 */
// Arma UNA ruta buscando por bisección el largo del tramo hasta que la distancia por calles coincida con la pedida; si no lo logra, garantiza la distancia exacta con un loop geométrico.
export async function buildRoute(tmpl, origin_lat, origin_lng, distance_m) {
  const primaryBearing = tmpl.bearings[0];

  const tryLeg = async (legFraction) => {
    const legDist   = distance_m * legFraction;
    const waypoints = [{ lat: origin_lat, lng: origin_lng }];
    for (const bearing of tmpl.bearings) {
      waypoints.push(offsetCoord(origin_lat, origin_lng, bearing, legDist));
    }
    const trip = await fetchOsrmTrip(waypoints); // puede tirar error
    return { distance_m: Math.round(trip.distance), geojson: trip.geometry };
  };

  let lo = 0.1, hi = 1.2, best = null;
  try {
    for (let iter = 0; iter < MAX_REFINE_ITERS; iter++) {
      const mid  = (lo + hi) / 2;
      const cand = await tryLeg(mid);
      if (!best || Math.abs(cand.distance_m - distance_m) < Math.abs(best.distance_m - distance_m)) {
        best = cand;
      }
      const error = Math.abs(cand.distance_m - distance_m) / distance_m;
      if (error <= DISTANCE_TOLERANCE) return cand;
      // La distancia crece con el largo del tramo: ajustamos el intervalo.
      if (cand.distance_m < distance_m) lo = mid; else hi = mid;
    }
  } catch {
    // OSRM no disponible → caemos al loop geométrico exacto de abajo.
  }

  // Garantía de distancia: si OSRM no llegó lo bastante cerca (o falló), un
  // círculo con la circunferencia justa da EXACTAMENTE la distancia pedida.
  if (best && Math.abs(best.distance_m - distance_m) / distance_m <= DISTANCE_TOLERANCE) {
    return best;
  }
  return {
    distance_m: distance_m,
    geojson:    circularFallback(origin_lat, origin_lng, distance_m, primaryBearing),
  };
}

// ── Cartera de candidatas (el planificador multicriterio) ─────────────────────
// En lugar de generar 3 rutas fijas, generamos una cartera más grande variando
// el rumbo de salida y la forma del circuito, y después el evaluador
// multicriterio elige las mejores. El presupuesto limita las llamadas a OSRM
// por pedido para respetar el rate limit del servidor público.

const PORTFOLIO_BUDGET = () => parseInt(process.env.OSRM_PORTFOLIO_BUDGET, 10) || 30;
const REFINE_ITERS_PER_CANDIDATE = 3;

// Arma las especificaciones de las candidatas: 8 ida-y-vuelta (una por rumbo,
// cada 45°) y 4 triángulos (rotados de a 90°). 12 formas distintas de recorrer
// la misma distancia desde el mismo punto.
function candidateSpecs() {
  const specs = [];
  for (let b = 0; b < 360; b += 45) {
    specs.push({ kind: 'ida-vuelta', bearings: [b], legFraction: 0.5 });
  }
  for (let b = 0; b < 360; b += 90) {
    specs.push({ kind: 'triángulo', bearings: [b, b + 120, b + 240], legFraction: 0.38 });
  }
  return specs;
}

// Pide a OSRM el circuito de una spec con un largo de tramo dado.
export async function fetchSpec(spec, origin_lat, origin_lng, legDist) {
  const waypoints = [{ lat: origin_lat, lng: origin_lng }];
  for (const bearing of spec.bearings) {
    waypoints.push(offsetCoord(origin_lat, origin_lng, bearing, legDist));
  }
  const trip = await fetchOsrmTrip(waypoints);
  return { distance_m: Math.round(trip.distance), geojson: trip.geometry };
}

/**
 * Genera la cartera con presupuesto: primero sondea cada spec con UNA llamada;
 * después refina (ajuste por proporción + bisección corta) solo las candidatas
 * que quedaron fuera de tolerancia, hasta agotar el presupuesto. La distancia
 * crece con el largo del tramo, así que el refinamiento converge.
 */
// Genera todas las rutas candidatas gastando como mucho ~30 llamadas a OSRM.
export async function generatePortfolio(origin_lat, origin_lng, distance_m) {
  let callsLeft = PORTFOLIO_BUDGET();
  const specs = candidateSpecs();
  const candidates = [];

  // Fase 1: un sondeo por spec, en tandas de 4 en paralelo (baja la latencia
  // total sin castigar al servidor público de OSRM).
  const PROBE_BATCH = 4;
  for (let i = 0; i < specs.length && callsLeft > 0; i += PROBE_BATCH) {
    const batch = specs.slice(i, i + Math.min(PROBE_BATCH, callsLeft));
    callsLeft -= batch.length;
    const results = await Promise.allSettled(
      batch.map(spec => fetchSpec(spec, origin_lat, origin_lng, distance_m * spec.legFraction)),
    );
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        candidates.push({ spec: batch[j], legFraction: batch[j].legFraction, refines: 0, ...r.value });
      }
    });
  }

  // Fase 2: refinamiento de a UNA llamada por vez, siempre sobre el candidato
  // con peor error. Rinde más que un número fijo de intentos por candidato:
  // el presupuesto va a donde más hace falta. Primer intento proporcional,
  // después bisección sobre el intervalo conocido (la distancia crece con el
  // largo del tramo, así que converge).
  const err = c => Math.abs(c.distance_m - distance_m) / distance_m;
  while (callsLeft > 0) {
    const worst = candidates
      .filter(c => err(c) > DISTANCE_TOLERANCE && c.refines < REFINE_ITERS_PER_CANDIDATE)
      .sort((a, b) => err(b) - err(a))[0];
    if (!worst) break;

    if (worst.lo == null) {
      worst.lo = worst.distance_m < distance_m ? worst.legFraction : Math.max(worst.legFraction * 0.4, 0.08);
      worst.hi = worst.distance_m < distance_m ? Math.min(worst.legFraction * 2, 1.2) : worst.legFraction;
    }
    const frac = worst.refines === 0
      ? Math.min(Math.max(worst.legFraction * (distance_m / worst.distance_m), worst.lo), worst.hi)
      : (worst.lo + worst.hi) / 2;

    callsLeft--;
    worst.refines++;
    try {
      const attempt = await fetchSpec(worst.spec, origin_lat, origin_lng, distance_m * frac);
      if (Math.abs(attempt.distance_m - distance_m) < Math.abs(worst.distance_m - distance_m)) {
        worst.distance_m  = attempt.distance_m;
        worst.geojson     = attempt.geojson;
        worst.legFraction = frac;
      }
      if (attempt.distance_m < distance_m) worst.lo = frac; else worst.hi = frac;
    } catch {
      worst.refines = REFINE_ITERS_PER_CANDIDATE; // no insistir con esta spec
    }
  }

  return candidates;
}

// Lee los pesos del planificador desde ai_weights (si la fila los tiene);
// si la base no responde o faltan columnas, usa los defaults del evaluador.
async function getPlannerWeights() {
  try {
    const row = await aiRepo.getActiveWeights();
    if (row && row.w_dist_fid != null) return row;
  } catch { /* sin base en tests/dev: defaults */ }
  return DEFAULT_PLANNER_WEIGHTS;
}

/**
 * Persist a generated route into run_routes so it gets a real DB id (needed for
 * sessions and feedback). Returns the new id, or null if the insert fails —
 * generation still works without it.
 */
// Guarda la ruta generada en la base para que se pueda calificar y asociar a corridas.
async function persistGeneratedRoute(tmpl, payload, origin_lat, origin_lng, distance_m) {
  try {
    const coords = payload.geojson?.coordinates || [];
    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    const saved = await runRepo.createRoute({
      title:        `${tmpl.label} ${(distance_m / 1000).toFixed(1)} km`,
      description:  tmpl.rationale,
      surface:      'road',
      difficulty:   'media',
      distance_m:   payload.distance_m,
      polyline:     JSON.stringify(payload.geojson),
      center_lat:   origin_lat,
      center_lng:   origin_lng,
      bbox_min_lat: lats.length ? Math.min(...lats) : origin_lat,
      bbox_min_lng: lngs.length ? Math.min(...lngs) : origin_lng,
      bbox_max_lat: lats.length ? Math.max(...lats) : origin_lat,
      bbox_max_lng: lngs.length ? Math.max(...lngs) : origin_lng,
    });
    return saved?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate route options for the given origin and distance.
 *
 * Flujo del planificador multicriterio:
 *   1. Cartera: hasta 12 candidatas por calles (rumbos × formas de circuito),
 *      con presupuesto de llamadas a OSRM y refinamiento de distancia.
 *   2. Garantía: si OSRM aportó menos de 3, se completa con loops geométricos
 *      de distancia exacta (que también se evalúan).
 *   3. Contexto: hazards activos cercanos al origen.
 *   4. Evaluación multicriterio (routeEvaluator) y selección del top-3, cada
 *      ruta con su puntaje, el desglose de criterios y la explicación.
 */
// Genera la cartera de rutas, las evalúa con el puntaje propio y devuelve las 3 mejores.
export async function generateRoutes({ origin_lat, origin_lng, distance_m, profile = 'equilibrado', when = null }) {
  const night = isNight(when);
  const key = cacheKey(origin_lat, origin_lng, distance_m, `portfolio-v2|${profile}|${night ? 'n' : 'd'}`);
  const cached = tripCache.get(key);
  if (cached) return cached;

  // 1) Cartera de candidatas por calles.
  const candidates = await generatePortfolio(origin_lat, origin_lng, distance_m);

  // 2) Contexto: hazards activos cercanos y rutas ya calificadas de la zona
  //    (para el criterio de historial). Ambas consultas toleran base caída.
  const radius = Math.min(distance_m / 2 + 800, 8000);
  const hazards = await hazardRepo
    .findNear({ lat: origin_lat, lng: origin_lng, radius_m: radius })
    .catch(() => []);
  const ratedRoutes = await runRepo
    .getRoutesWithMetrics({ lat: origin_lat, lng: origin_lng, radius_m: radius })
    .then(rows => rows
      .filter(r => (Number(r.feedback_count) || 0) > 0 && r.polyline)
      .map(r => {
        try {
          const g = JSON.parse(r.polyline);
          return { coords: g.coordinates ?? g, avg_rating: r.avg_rating, feedback_count: r.feedback_count };
        } catch { return null; }
      })
      .filter(Boolean))
    .catch(() => []);

  // 4) Evaluación multicriterio y selección. La selección final mantiene la
  //    garantía de distancia: solo entran candidatas dentro de la tolerancia;
  //    si no llegan a 3, se completa con loops geométricos exactos (que
  //    también pasan por el evaluador, así compiten en igualdad).
  const weights   = applyProfile(await getPlannerWeights(), profile);
  const inRange   = c => Math.abs(c.distance_m - distance_m) / distance_m <= DISTANCE_TOLERANCE;
  let eligible    = candidates.filter(inRange);
  const usedBearings = new Set();
  for (const b of [0, 90, 180, 270]) {
    if (eligible.length >= 3) break;
    if (usedBearings.has(b)) continue;
    usedBearings.add(b);
    eligible.push({
      spec: { kind: 'circular', bearings: [b] },
      distance_m,
      geojson: circularFallback(origin_lat, origin_lng, distance_m, b),
      fallback: true,
    });
  }
  const ranked = scorePortfolio(eligible, { hazards, weights, targetM: distance_m, night, ratedRoutes });
  // Las rutas por calles van SIEMPRE antes que los respaldos geométricos: el
  // círculo tiene distancia perfecta y cero giros, pero corta las manzanas —
  // solo debe aparecer cuando no hay ruta real disponible.
  const ordered = [...ranked.filter(c => !c.fallback), ...ranked.filter(c => c.fallback)];
  const top     = ordered.slice(0, 3);

  // 5) Salida compatible con la app + persistencia con id real.
  const PREFS  = ['directa', 'circular', 'aventura'];
  const LABELS = ['Ruta recomendada', 'Alternativa 1', 'Alternativa 2'];
  const items  = [];
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const payload  = { distance_m: c.distance_m, geojson: c.geojson };
    const tmplLike = { label: `${LABELS[i]} (${c.spec?.kind ?? 'circuito'})`, rationale: c.explanation };
    const dbId = await persistGeneratedRoute(tmplLike, payload, origin_lat, origin_lng, distance_m);
    items.push({
      id:         dbId ?? i + 1,
      preference: PREFS[i],
      label:      LABELS[i],
      rationale:  c.explanation,
      distance_m: c.distance_m,
      geojson:    c.geojson,
      score:      c.score,
      criteria:   c.criteria,
    });
  }

  const result = {
    items,
    planner: {
      candidates_evaluated: candidates.length,
      hazards_considered:   hazards.length,
      rated_routes_considered: ratedRoutes.length,
      profile,
      night,
      weights,
    },
  };
  tripCache.set(key, result);
  return result;
}
