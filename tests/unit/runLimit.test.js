import { describe, it, expect } from 'vitest';
import { capTelemetryToLimit, limitStatus } from '../../src/utils/runLimit.js';

// ~111 m por cada 0.001° de latitud, alcanza para armar tramos previsibles.
const BASE_LAT = -38.0055;
const BASE_LNG = -57.5426;

function pointsNorth(count, stepDeg = 0.001, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({
    lat: BASE_LAT + i * stepDeg,
    lng: BASE_LNG,
    ts_ms: 1_700_000_000_000 + i * 1000,
    ...extra,
  }));
}

describe('capTelemetryToLimit', () => {
  it('no suma nada por el primer punto: no hay tramo anterior', () => {
    const result = capTelemetryToLimit({
      lastPoint: null,
      distanceSoFarM: 0,
      points: pointsNorth(1),
      limitM: 2000,
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.distanceM).toBe(0);
    expect(result.reached).toBe(false);
  });

  it('acumula la distancia entre puntos consecutivos', () => {
    const result = capTelemetryToLimit({
      lastPoint: null,
      distanceSoFarM: 0,
      points: pointsNorth(5),
      limitM: null,
    });
    expect(result.accepted).toHaveLength(5);
    // 4 tramos de ~111 m
    expect(result.distanceM).toBeGreaterThan(430);
    expect(result.distanceM).toBeLessThan(460);
    expect(result.reached).toBe(false);
  });

  it('encadena con el último punto ya guardado', () => {
    const sinArranque = capTelemetryToLimit({
      lastPoint: null, distanceSoFarM: 0, points: pointsNorth(2), limitM: null,
    });
    const conArranque = capTelemetryToLimit({
      lastPoint: { lat: BASE_LAT - 0.001, lng: BASE_LNG },
      distanceSoFarM: 0,
      points: pointsNorth(2),
      limitM: null,
    });
    expect(conArranque.distanceM).toBeGreaterThan(sinArranque.distanceM);
  });

  it('corta en el tope y descarta el punto que lo cruza', () => {
    // 30 puntos × ~111 m ≈ 3.2 km contra un tope de 2 km.
    const result = capTelemetryToLimit({
      lastPoint: null,
      distanceSoFarM: 0,
      points: pointsNorth(30),
      limitM: 2000,
    });
    expect(result.reached).toBe(true);
    expect(result.distanceM).toBe(2000);
    expect(result.accepted.length).toBeLessThan(30);
    expect(result.rejected).toBeGreaterThan(0);
  });

  it('no acepta más puntos si la sesión ya estaba en el tope', () => {
    const result = capTelemetryToLimit({
      lastPoint: { lat: BASE_LAT, lng: BASE_LNG },
      distanceSoFarM: 2000,
      points: pointsNorth(5),
      limitM: 2000,
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.reached).toBe(true);
    expect(result.rejected).toBe(5);
  });

  it('sin tope acepta todo el lote', () => {
    const result = capTelemetryToLimit({
      lastPoint: null, distanceSoFarM: 0, points: pointsNorth(100), limitM: null,
    });
    expect(result.accepted).toHaveLength(100);
    expect(result.reached).toBe(false);
  });

  it('ignora los puntos con GPS impreciso al sumar distancia', () => {
    const limpio = capTelemetryToLimit({
      lastPoint: null, distanceSoFarM: 0, points: pointsNorth(3, 0.001, { accuracy_m: 5 }), limitM: null,
    });
    const ruidoso = capTelemetryToLimit({
      lastPoint: null, distanceSoFarM: 0, points: pointsNorth(3, 0.001, { accuracy_m: 80 }), limitM: null,
    });
    expect(limpio.distanceM).toBeGreaterThan(200);
    expect(ruidoso.distanceM).toBe(0);
    // Los puntos igual se guardan: lo que se descarta es el aporte a la distancia.
    expect(ruidoso.accepted).toHaveLength(3);
  });

  it('descarta el temblor del GPS estando quieto', () => {
    const quieto = Array.from({ length: 10 }, (_, i) => ({
      lat: BASE_LAT + (i % 2) * 0.000005,   // ~0.5 m de ida y vuelta
      lng: BASE_LNG,
      ts_ms: 1_700_000_000_000 + i * 1000,
    }));
    const result = capTelemetryToLimit({
      lastPoint: null, distanceSoFarM: 0, points: quieto, limitM: 2000,
    });
    expect(result.distanceM).toBe(0);
  });
});

describe('limitStatus', () => {
  it('informa cuánto queda en el plan free', () => {
    const status = limitStatus({ plan: 'free', limitM: 2000, distanceM: 750, reached: false });
    expect(status).toEqual({
      plan: 'free',
      max_distance_m: 2000,
      distance_m: 750,
      remaining_m: 1250,
      reached: false,
    });
  });

  it('en premium no hay tope ni resto', () => {
    const status = limitStatus({ plan: 'premium', limitM: null, distanceM: 12000, reached: false });
    expect(status.max_distance_m).toBeNull();
    expect(status.remaining_m).toBeNull();
  });

  it('nunca informa un resto negativo', () => {
    const status = limitStatus({ plan: 'free', limitM: 2000, distanceM: 2400, reached: true });
    expect(status.remaining_m).toBe(0);
    expect(status.reached).toBe(true);
  });
});
