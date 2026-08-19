import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/run.repository.js', () => ({
  findSessionById:          vi.fn(),
  insertTelemetryPoints:    vi.fn(),
  findLastTelemetryPoint:   vi.fn(),
  updateSessionProgress:    vi.fn(),
  finishSession:            vi.fn(),
  abandonSession:           vi.fn(),
  findRouteById:            vi.fn(),
  findFeedbackByUserAndRoute: vi.fn(),
  createFeedback:           vi.fn(),
}));

vi.mock('../../src/repositories/ai.repository.js', () => ({
  getActiveWeights: vi.fn(),
}));

process.env.JWT_SECRET = 'test_secret_32chars!!';
process.env.DB_HOST    = 'localhost';
process.env.DB_USER    = 'test';
process.env.DB_NAME    = 'test';

import * as runRepo from '../../src/repositories/run.repository.js';
import * as runService from '../../src/services/run.service.js';

const ACTIVE_SESSION = { id: 1, user_id: 42, route_id: null, status: 'active', live_distance_m: 0 };
const FINISHED_SESSION = { id: 1, user_id: 42, route_id: null, status: 'completed' };

// Entitlements que resuelve el middleware antes de llegar al servicio.
const PREMIUM = { plan: 'premium', run_max_distance_m: null, ai_enabled: true };
const FREE    = { plan: 'free',    run_max_distance_m: 2000, ai_enabled: false };

beforeEach(() => vi.clearAllMocks());

// ── pushTelemetry ─────────────────────────────────────────────────────────────

describe('runService.pushTelemetry', () => {
  it('throws NOT_FOUND when session does not exist', async () => {
    runRepo.findSessionById.mockResolvedValue(null);
    await expect(runService.pushTelemetry(1, 42, []))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when session belongs to another user', async () => {
    runRepo.findSessionById.mockResolvedValue({ ...ACTIVE_SESSION, user_id: 99 });
    await expect(runService.pushTelemetry(1, 42, [{ lat: 0, lng: 0 }]))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws BAD_REQUEST when session is not active', async () => {
    runRepo.findSessionById.mockResolvedValue(FINISHED_SESSION);
    await expect(runService.pushTelemetry(1, 42, [{ lat: 0, lng: 0 }]))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when points array is empty', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    await expect(runService.pushTelemetry(1, 42, []))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('normalizes client-friendly names to repo-aligned names', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.insertTelemetryPoints.mockResolvedValue();

    const clientPoints = [{
      lat:        -34.6,
      lng:        -58.4,
      recorded_at: '2026-06-01T09:00:00Z',
      altitude:   120,
      speed:      3.5,
      heart_rate: 145,
    }];

    const result = await runService.pushTelemetry(1, 42, clientPoints, PREMIUM);

    expect(result.saved).toBe(1);
    const [, mapped] = runRepo.insertTelemetryPoints.mock.calls[0];
    const p = mapped[0];
    expect(p.elevation_m).toBe(120);
    expect(p.speed_mps).toBe(3.5);
    expect(p.hr_bpm).toBe(145);
    expect(typeof p.ts_ms).toBe('number');
    expect(p.ts_ms).toBeGreaterThan(0);
    // client-friendly aliases must not be forwarded to repo
    expect(p.altitude).toBeUndefined();
    expect(p.speed).toBeUndefined();
    expect(p.heart_rate).toBeUndefined();
    expect(p.recorded_at).toBeUndefined();
  });

  it('prefers repo-aligned names over client aliases when both present', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.insertTelemetryPoints.mockResolvedValue();

    await runService.pushTelemetry(1, 42, [{
      lat: 0, lng: 0,
      ts_ms: 1234567890000,
      elevation_m: 200,
      altitude: 100,           // should be ignored in favour of elevation_m
      speed_mps: 4.0,
      speed: 2.0,              // should be ignored in favour of speed_mps
      hr_bpm: 160,
      heart_rate: 130,         // should be ignored in favour of hr_bpm
    }], PREMIUM);

    const [, mapped] = runRepo.insertTelemetryPoints.mock.calls[0];
    expect(mapped[0].ts_ms).toBe(1234567890000);
    expect(mapped[0].elevation_m).toBe(200);
    expect(mapped[0].speed_mps).toBe(4.0);
    expect(mapped[0].hr_bpm).toBe(160);
  });

  it('uses ts_ms derived from recorded_at when ts_ms not provided', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.insertTelemetryPoints.mockResolvedValue();

    const isoDate = '2026-06-01T09:00:00.000Z';
    await runService.pushTelemetry(1, 42, [{ lat: 0, lng: 0, recorded_at: isoDate }], PREMIUM);

    const [, mapped] = runRepo.insertTelemetryPoints.mock.calls[0];
    expect(mapped[0].ts_ms).toBe(new Date(isoDate).getTime());
  });

  it('returns saved count equal to number of points', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.insertTelemetryPoints.mockResolvedValue();

    const points = Array.from({ length: 5 }, (_, i) => ({ lat: i, lng: i }));
    const result = await runService.pushTelemetry(1, 42, points, PREMIUM);
    expect(result.saved).toBe(5);
  });
});

// ── finishSession ─────────────────────────────────────────────────────────────

describe('runService.finishSession', () => {
  it('throws NOT_FOUND when session does not exist', async () => {
    runRepo.findSessionById.mockResolvedValue(null);
    await expect(runService.finishSession(1, 42, {}))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when session belongs to another user', async () => {
    runRepo.findSessionById.mockResolvedValue({ ...ACTIVE_SESSION, user_id: 99 });
    await expect(runService.finishSession(1, 42, {}))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws BAD_REQUEST when session is already finished', async () => {
    runRepo.findSessionById.mockResolvedValue(FINISHED_SESSION);
    await expect(runService.finishSession(1, 42, {}))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('passes normalized summary to repo with canonical field names', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({ id: 1, status: 'completed' });

    await runService.finishSession(1, 42, {
      duration_s:      3600,
      distance_m:      10000,
      avg_pace:        360,    // alias for avg_pace_s
      avg_speed_mps:   2.8,
      avg_hr_bpm:      150,
      deviates_count:  2,
      max_elevation_m: 300,
      min_elevation_m: 100,
    }, PREMIUM);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.duration_s).toBe(3600);
    expect(summary.distance_m).toBe(10000);
    expect(summary.avg_pace_s).toBe(360);   // alias resolved
    expect(summary.avg_speed_mps).toBe(2.8);
    expect(summary.avg_hr_bpm).toBe(150);
    expect(summary.deviates_count).toBe(2);
    expect(summary.max_elevation_m).toBe(300);
    expect(summary.min_elevation_m).toBe(100);
    // client-only fields must not be forwarded
    expect(summary.avg_pace).toBeUndefined();
    expect(summary.calories).toBeUndefined();
    expect(summary.notes).toBeUndefined();
  });

  it('prefers avg_pace_s over avg_pace alias', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({});

    await runService.finishSession(1, 42, { avg_pace_s: 300, avg_pace: 360 }, PREMIUM);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.avg_pace_s).toBe(300);
  });

  it('sets deviates_count to 0 when not provided', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({});

    await runService.finishSession(1, 42, { duration_s: 100 }, PREMIUM);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.deviates_count).toBe(0);
  });
});

// ── submitFeedback ────────────────────────────────────────────────────────────

describe('runService.submitFeedback', () => {
  const FAKE_ROUTE = { id: 5, title: 'Parque Centenario' };

  it('throws NOT_FOUND when route does not exist', async () => {
    runRepo.findRouteById.mockResolvedValue(null);
    await expect(runService.submitFeedback(42, 5, { rating: 4 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FEEDBACK_EXISTS when user already submitted feedback for this route', async () => {
    runRepo.findRouteById.mockResolvedValue(FAKE_ROUTE);
    runRepo.findFeedbackByUserAndRoute.mockResolvedValue({ id: 1 });
    await expect(runService.submitFeedback(42, 5, { rating: 4 }))
      .rejects.toMatchObject({ code: 'FEEDBACK_EXISTS' });
  });

  it('throws BAD_REQUEST when rating is out of range', async () => {
    runRepo.findRouteById.mockResolvedValue(FAKE_ROUTE);
    runRepo.findFeedbackByUserAndRoute.mockResolvedValue(null);
    await expect(runService.submitFeedback(42, 5, { rating: 6 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates feedback with all provided fields', async () => {
    runRepo.findRouteById.mockResolvedValue(FAKE_ROUTE);
    runRepo.findFeedbackByUserAndRoute.mockResolvedValue(null);
    runRepo.createFeedback.mockResolvedValue({ id: 10, rating: 4 });

    await runService.submitFeedback(42, 5, {
      rating:               4,
      notes:                'Muy buena ruta',
      fatigue_level:        3,
      perceived_difficulty: 2,
      session_id:           7,
    });

    expect(runRepo.createFeedback).toHaveBeenCalledWith({
      user_id:              42,
      route_id:             5,
      session_id:           7,
      rating:               4,
      notes:                'Muy buena ruta',
      fatigue_level:        3,
      perceived_difficulty: 2,
    });
  });

  it('passes null for optional fields when not provided', async () => {
    runRepo.findRouteById.mockResolvedValue(FAKE_ROUTE);
    runRepo.findFeedbackByUserAndRoute.mockResolvedValue(null);
    runRepo.createFeedback.mockResolvedValue({ id: 10, rating: 5 });

    await runService.submitFeedback(42, 5, { rating: 5 });

    const call = runRepo.createFeedback.mock.calls[0][0];
    expect(call.notes).toBeNull();
    expect(call.fatigue_level).toBeNull();
    expect(call.perceived_difficulty).toBeNull();
    expect(call.session_id).toBeNull();
  });
});

// ── Límite de distancia del plan free ─────────────────────────────────────────

describe('límite de 2 km del plan free', () => {
  // Puntos hacia el norte separados ~111 m cada uno.
  const northPoints = (count) => Array.from({ length: count }, (_, i) => ({
    lat: -38.0055 + i * 0.001,
    lng: -57.5426,
    ts_ms: 1_700_000_000_000 + i * 1000,
  }));

  it('un usuario free recibe cuánto le queda antes del tope', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.findLastTelemetryPoint.mockResolvedValue(null);

    const result = await runService.pushTelemetry(1, 42, northPoints(5), FREE);

    expect(result.limit.plan).toBe('free');
    expect(result.limit.max_distance_m).toBe(2000);
    expect(result.limit.reached).toBe(false);
    expect(result.limit.remaining_m).toBeGreaterThan(1500);
    expect(result.saved).toBe(5);
  });

  it('corta la telemetría al llegar a los 2 km', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.findLastTelemetryPoint.mockResolvedValue(null);

    const result = await runService.pushTelemetry(1, 42, northPoints(40), FREE);

    expect(result.limit.reached).toBe(true);
    expect(result.limit.remaining_m).toBe(0);
    expect(result.saved).toBeLessThan(40);

    // Solo se guardan los puntos de acá para abajo del tope.
    const [, guardados] = runRepo.insertTelemetryPoints.mock.calls[0];
    expect(guardados.length).toBe(result.saved);
    expect(runRepo.updateSessionProgress).toHaveBeenCalledWith(1, {
      live_distance_m: 2000,
      limited_by_plan: true,
    });
  });

  it('un usuario premium no tiene tope', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.findLastTelemetryPoint.mockResolvedValue(null);

    const result = await runService.pushTelemetry(1, 42, northPoints(40), PREMIUM);

    expect(result.saved).toBe(40);
    expect(result.limit.reached).toBe(false);
    expect(result.limit.max_distance_m).toBeNull();
  });

  it('sin entitlement se asume free: es el lado seguro', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.findLastTelemetryPoint.mockResolvedValue(null);

    const result = await runService.pushTelemetry(1, 42, northPoints(40));
    expect(result.limit.max_distance_m).toBe(2000);
    expect(result.limit.reached).toBe(true);
  });

  it('continúa la cuenta desde lo que ya llevaba la sesión', async () => {
    runRepo.findSessionById.mockResolvedValue({ ...ACTIVE_SESSION, live_distance_m: 1900 });
    runRepo.findLastTelemetryPoint.mockResolvedValue({ lat: -38.0055, lng: -57.5426 });

    const result = await runService.pushTelemetry(1, 42, northPoints(5), FREE);

    expect(result.limit.reached).toBe(true);
    expect(result.limit.distance_m).toBe(2000);
  });

  it('recorta la distancia que declara el cliente al cerrar la corrida', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({ id: 1, status: 'completed' });

    const result = await runService.finishSession(1, 42, { distance_m: 12000, duration_s: 3600 }, FREE);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.distance_m).toBe(2000);
    expect(summary.limited_by_plan).toBe(true);
    expect(result.limit.reached).toBe(true);
  });

  it('no toca la distancia si el usuario free no llegó al tope', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({ id: 1, status: 'completed' });

    await runService.finishSession(1, 42, { distance_m: 1500, duration_s: 600 }, FREE);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.distance_m).toBe(1500);
    expect(summary.limited_by_plan).toBeNull();
  });

  it('marca la corrida como limitada si se cortó durante la telemetría', async () => {
    runRepo.findSessionById.mockResolvedValue({ ...ACTIVE_SESSION, limited_by_plan: true });
    runRepo.finishSession.mockResolvedValue({ id: 1, status: 'completed' });

    await runService.finishSession(1, 42, { distance_m: 2000, duration_s: 900 }, FREE);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.limited_by_plan).toBe(true);
  });

  it('un premium guarda la distancia completa', async () => {
    runRepo.findSessionById.mockResolvedValue(ACTIVE_SESSION);
    runRepo.finishSession.mockResolvedValue({ id: 1, status: 'completed' });

    await runService.finishSession(1, 42, { distance_m: 21097, duration_s: 7200 }, PREMIUM);

    const [, summary] = runRepo.finishSession.mock.calls[0];
    expect(summary.distance_m).toBe(21097);
    expect(summary.limited_by_plan).toBeNull();
  });
});
