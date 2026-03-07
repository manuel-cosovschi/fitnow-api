// src/utils/geo.js

const EARTH_RADIUS_M = 6_371_000;

/**
 * Distancia Haversine entre dos coordenadas. Resultado en metros.
 */
export function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Convierte un radio en metros a grados aproximados (válido para latitudes bajas).
 * Útil para bounding-box queries en MySQL sin extensión espacial.
 */
export function radiusToDeg(radiusM) {
  return radiusM / 111_320;
}

/**
 * Normaliza un valor al rango [0, 1] dado un min y un max de negocio.
 * higherIsBetter: true  → mayor valor = mejor score
 * higherIsBetter: false → menor valor = mejor score
 */
export function normalize(value, min, max, higherIsBetter = true) {
  const v   = Math.max(min, Math.min(max, value ?? 0));
  const rat = (v - min) / ((max - min) || 1);
  return higherIsBetter ? rat : 1 - rat;
}
