// src/utils/runLimit.js
//
// Corte de la telemetría cuando un usuario free llega al tope de distancia.
// Es una función pura para poder testearla sin base de datos: recibe el último
// punto conocido, lo que ya llevaba acumulado y el lote nuevo, y devuelve qué
// puntos entran y cuánta distancia suman.

import { haversineM } from './geo.js';

// Umbrales para no inflar la distancia con ruido del GPS. Son los mismos
// criterios que aplica el tracker del iPhone antes de sumar un tramo.
const MIN_STEP_M     = 2;
const MAX_ACCURACY_M = 30;

/**
 * @param {object}   params
 * @param {{lat:number,lng:number}|null} params.lastPoint  último punto ya guardado
 * @param {number}   params.distanceSoFarM  metros acumulados en la sesión
 * @param {Array}    params.points          lote nuevo, ya normalizado
 * @param {number|null} params.limitM       tope del plan (null = sin tope)
 * @returns {{ accepted: Array, distanceM: number, reached: boolean, rejected: number }}
 */
export function capTelemetryToLimit({ lastPoint, distanceSoFarM = 0, points = [], limitM = null }) {
  const accepted = [];
  let distanceM  = distanceSoFarM;
  let previous   = lastPoint;
  let reached    = limitM != null && distanceSoFarM >= limitM;

  for (const point of points) {
    if (reached) break;

    let step = 0;
    if (previous) {
      const noisy = point.accuracy_m != null && point.accuracy_m > MAX_ACCURACY_M;
      if (!noisy) {
        const delta = haversineM(previous.lat, previous.lng, point.lat, point.lng);
        if (delta >= MIN_STEP_M) step = delta;
      }
    }

    if (limitM != null && distanceM + step > limitM) {
      // El tramo cruza el tope: el punto que lo cruza no se guarda y la
      // sesión queda clavada justo en el límite.
      distanceM = limitM;
      reached   = true;
      break;
    }

    distanceM += step;
    accepted.push(point);
    previous = point;

    if (limitM != null && distanceM >= limitM) {
      reached = true;
      break;
    }
  }

  return {
    accepted,
    distanceM: Math.round(distanceM),
    reached,
    rejected: points.length - accepted.length,
  };
}

/**
 * Bloque `limit` que viaja en las respuestas de running para que la app sepa
 * cuánto le queda antes del paywall sin tener que adivinarlo.
 */
export function limitStatus({ plan, limitM, distanceM, reached }) {
  return {
    plan,
    max_distance_m: limitM,
    distance_m: distanceM,
    remaining_m: limitM == null ? null : Math.max(0, limitM - distanceM),
    reached: Boolean(reached),
  };
}
