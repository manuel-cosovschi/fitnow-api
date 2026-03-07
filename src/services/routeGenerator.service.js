// src/services/routeGenerator.service.js
// Generates dynamic running route options from an origin point + desired distance.
// Tries OSRM (public routing engine) first; falls back to geometric circles.

const OSRM_BASE = 'https://router.project-osrm.org';

/**
 * Offset a coordinate by a bearing (degrees) and distance (meters).
 */
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
async function fetchOsrmTrip(waypoints) {
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url =
    `${OSRM_BASE}/trip/v1/foot/${coords}` +
    `?roundtrip=true&source=first&destination=last&geometries=geojson&overview=full`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!resp.ok) throw new Error(`OSRM ${resp.status}`);
  const data = await resp.json();
  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('OSRM: no trips returned');
  return data.trips[0];
}

/**
 * Geometric fallback: approximate circular loop starting at a given bearing.
 */
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

/**
 * Generate 3 route options for the given origin and distance.
 * @param {{ origin_lat: number, origin_lng: number, distance_m: number }} params
 * @returns {{ items: RunRouteOption[] }}
 */
export async function generateRoutes({ origin_lat, origin_lng, distance_m }) {
  const items = await Promise.all(
    TEMPLATES.map(async (tmpl, idx) => {
      const legDist = distance_m * tmpl.legFraction;
      const waypoints = [{ lat: origin_lat, lng: origin_lng }];

      for (const bearing of tmpl.bearings) {
        waypoints.push(offsetCoord(origin_lat, origin_lng, bearing, legDist));
      }

      let geojson;
      let actual_distance_m = distance_m;

      try {
        const trip = await fetchOsrmTrip(waypoints);
        geojson = trip.geometry;
        actual_distance_m = Math.round(trip.distance);
      } catch {
        geojson = circularFallback(origin_lat, origin_lng, distance_m, tmpl.bearings[0]);
      }

      return {
        id: idx + 1,
        preference: tmpl.preference,
        label: tmpl.label,
        rationale: tmpl.rationale,
        distance_m: actual_distance_m,
        geojson,
      };
    }),
  );

  return { items };
}
