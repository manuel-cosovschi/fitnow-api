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
function circularFallback(lat, lng, distance_m, startBearing = 0) {
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
const TEMPLATES = [
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
// stop refining (±12%). Roads detour, so the straight-line leg that produces a
// given road distance is unknown up front — we converge on it iteratively.
const DISTANCE_TOLERANCE = 0.12;
const MAX_REFINE_ITERS   = 3;

/**
 * Build one route for a template, refining the leg length until OSRM's road
 * distance lands within DISTANCE_TOLERANCE of the requested distance. Returns
 * the closest attempt. Falls back to a geometric loop (exact circumference) if
 * OSRM is unavailable.
 */
// Arma UNA ruta y la va corrigiendo: mide lo que da OSRM y reajusta hasta acercarse a la distancia que pediste.
async function buildRoute(tmpl, origin_lat, origin_lng, distance_m) {
  const primaryBearing = tmpl.bearings[0];
  let legFraction = tmpl.legFraction;
  let best = null;

  for (let iter = 0; iter < MAX_REFINE_ITERS; iter++) {
    const legDist   = distance_m * legFraction;
    const waypoints = [{ lat: origin_lat, lng: origin_lng }];
    for (const bearing of tmpl.bearings) {
      waypoints.push(offsetCoord(origin_lat, origin_lng, bearing, legDist));
    }

    let trip;
    try {
      trip = await fetchOsrmTrip(waypoints);
    } catch {
      // OSRM unavailable: a geometric circle whose circumference is exactly the
      // requested distance is the most faithful answer we can give.
      return {
        distance_m: distance_m,
        geojson:    circularFallback(origin_lat, origin_lng, distance_m, primaryBearing),
      };
    }

    const actual    = Math.round(trip.distance);
    const candidate = { distance_m: actual, geojson: trip.geometry };
    if (!best || Math.abs(actual - distance_m) < Math.abs(best.distance_m - distance_m)) {
      best = candidate;
    }

    const error = Math.abs(actual - distance_m) / distance_m;
    if (error <= DISTANCE_TOLERANCE) return candidate;

    // Scale the leg toward the target (clamped so one noisy reading can't send
    // the next iteration wild) and try again.
    const scale = distance_m / actual;
    legFraction = legFraction * Math.min(1.5, Math.max(0.55, scale));
  }

  return best;
}

/**
 * Generate 3 route options for the given origin and distance.
 * Cached per (lat-bucket, lng-bucket, distance, bearing) — see tripCache above.
 */
// Arma las 3 opciones de ruta (directa, circular, aventura) que ves en el planner.
export async function generateRoutes({ origin_lat, origin_lng, distance_m }) {
  const items = await Promise.all(
    TEMPLATES.map(async (tmpl, idx) => {
      // Key by the route variant (not its bearing) — "directa" and "circular"
      // share bearing 0 and would otherwise collide into one identical route.
      const key = cacheKey(origin_lat, origin_lng, distance_m, tmpl.preference);

      let payload = tripCache.get(key);
      if (!payload) {
        payload = await buildRoute(tmpl, origin_lat, origin_lng, distance_m);
        tripCache.set(key, payload);
      }

      return {
        id: idx + 1,
        preference: tmpl.preference,
        label:      tmpl.label,
        rationale:  tmpl.rationale,
        ...payload,
      };
    }),
  );

  return { items };
}
