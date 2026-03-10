// src/services/run.service.js
import * as runRepo from '../repositories/run.repository.js';
import * as aiRepo  from '../repositories/ai.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { normalize } from '../utils/geo.js';
import { Errors } from '../utils/errors.js';

// ── Routes ────────────────────────────────────────────────────────────────────

export async function listRoutes(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const filters = {
    lat:        queryParams.lat        ? Number(queryParams.lat)        : null,
    lng:        queryParams.lng        ? Number(queryParams.lng)        : null,
    radius_m:   queryParams.radius_m   ? Number(queryParams.radius_m)   : null,
    difficulty: queryParams.difficulty ?? null,
    surface:    queryParams.surface    ?? null,
    status:     queryParams.status     ?? 'active',
    q:          queryParams.q?.trim()  ?? null,
  };

  const [items, total] = await Promise.all([
    runRepo.findRoutes({ ...filters, limit: perPage, offset }),
    runRepo.countRoutes(filters),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}

export async function getRoute(id) {
  const route = await runRepo.findRouteById(id);
  if (!route) throw Errors.notFound('Ruta no encontrada.');
  return route;
}

export async function createRoute(fields, requestingUser) {
  if (!fields.title?.trim()) throw Errors.badRequest('El título es requerido.');
  if (!fields.distance_m)    throw Errors.badRequest('distance_m es requerido.');
  if (!fields.polyline)      throw Errors.badRequest('polyline es requerido.');
  if (!fields.center_lat || !fields.center_lng) throw Errors.badRequest('center_lat y center_lng son requeridos.');

  return runRepo.createRoute(fields);
}

export async function recommendRoutes(queryParams) {
  const { lat, lng, radius_m = 10000 } = queryParams;
  if (!lat || !lng) throw Errors.badRequest('lat y lng son requeridos.');

  const weights = await aiRepo.getActiveWeights();
  if (!weights) throw Errors.internal('No hay pesos AI configurados.');

  const routes = await runRepo.getRoutesWithMetrics({
    lat: Number(lat),
    lng: Number(lng),
    radius_m: Number(radius_m),
  });

  if (routes.length === 0) return [];

  // Normalize each metric and compute weighted score
  const maxDist    = Math.max(...routes.map(r => r.distance_m));
  const maxElev    = Math.max(...routes.map(r => r.elevation_up_m ?? 0));
  const maxHzCnt   = Math.max(...routes.map(r => r.hazard_count ?? 0));
  const maxHzSev   = Math.max(...routes.map(r => r.avg_hazard_severity ?? 0));
  const maxFb      = Math.max(...routes.map(r => r.avg_rating ?? 0));
  const maxPop     = Math.max(...routes.map(r => r.feedback_count ?? 0));

  const scored = routes.map(r => {
    const s_distance   = normalize(r.distance_m,          0, maxDist,  true);
    const s_elev       = normalize(r.elevation_up_m ?? 0, 0, maxElev,  true);
    const s_hz_cnt     = normalize(r.hazard_count ?? 0,       0, maxHzCnt, false); // fewer = better
    const s_hz_sev     = normalize(r.avg_hazard_severity ?? 0, 0, maxHzSev, false); // lower = better
    const s_feedback   = normalize(r.avg_rating ?? 0,     0, maxFb,    true);
    const s_popularity = normalize(r.feedback_count ?? 0, 0, maxPop,   true);

    const score =
      weights.w_distance   * s_distance   +
      weights.w_elev       * s_elev       +
      weights.w_hz_cnt     * s_hz_cnt     +
      weights.w_hz_sev     * s_hz_sev     +
      weights.w_feedback   * s_feedback   +
      weights.w_popularity * s_popularity;

    return { ...r, score: Math.round(score * 1000) / 1000 };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ── Sessions (telemetry) ───────────────────────────────────────────────────────

export async function startSession(userId, { route_id, origin_lat, origin_lng, device }) {
  return runRepo.createSession({
    user_id:    userId,
    route_id:   route_id    ? Number(route_id)    : null,
    origin_lat: origin_lat  ? Number(origin_lat)  : null,
    origin_lng: origin_lng  ? Number(origin_lng)  : null,
    device:     device      ?? null,
  });
}

export async function getSession(sessionId, userId) {
  const session = await runRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés ver esta sesión.');
  return session;
}

export async function pushTelemetry(sessionId, userId, points) {
  const session = await runRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés actualizar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión no está activa.');
  if (!Array.isArray(points) || points.length === 0) throw Errors.badRequest('Se requiere al menos un punto.');

  // Normalize client-friendly field names to repo-aligned names before persisting
  const mapped = points.map((p) => ({
    ts_ms:       typeof p.ts_ms === 'number' ? p.ts_ms
                   : p.recorded_at ? new Date(p.recorded_at).getTime() : Date.now(),
    lat:         p.lat,
    lng:         p.lng,
    elevation_m: p.elevation_m ?? p.altitude   ?? null,
    speed_mps:   p.speed_mps  ?? p.speed       ?? null,
    pace_s:      p.pace_s     ?? null,
    hr_bpm:      p.hr_bpm     ?? p.heart_rate  ?? null,
    off_route:   p.off_route  ?? false,
    accuracy_m:  p.accuracy_m ?? null,
  }));

  await runRepo.insertTelemetryPoints(sessionId, mapped);
  return { saved: points.length };
}

export async function finishSession(sessionId, userId, stats) {
  const session = await runRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés finalizar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión ya fue finalizada.');

  // Normalize client-friendly field names to repo-aligned names
  const summary = {
    finished_at:     stats.finished_at    ?? null,
    duration_s:      stats.duration_s     ?? null,
    distance_m:      stats.distance_m     ?? null,
    avg_pace_s:      stats.avg_pace_s     ?? stats.avg_pace ?? null,
    avg_speed_mps:   stats.avg_speed_mps  ?? null,
    avg_hr_bpm:      stats.avg_hr_bpm     ?? null,
    deviates_count:  stats.deviates_count ?? 0,
    max_elevation_m: stats.max_elevation_m ?? null,
    min_elevation_m: stats.min_elevation_m ?? null,
  };

  return runRepo.finishSession(sessionId, summary);
}

export async function abandonSession(sessionId, userId) {
  const session = await runRepo.findSessionById(sessionId);
  if (!session) throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId) throw Errors.forbidden('No podés abandonar esta sesión.');
  if (session.status !== 'active') throw Errors.badRequest('La sesión ya fue finalizada.');

  return runRepo.abandonSession(sessionId);
}

export async function listMySessions(userId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);

  const [items, total] = await Promise.all([
    runRepo.findSessionsByUser(userId, { limit: perPage, offset }),
    runRepo.countSessionsByUser(userId),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}

// ── Feedback ───────────────────────────────────────────────────────────────────

export async function submitFeedback(userId, routeId, fields) {
  const route = await runRepo.findRouteById(routeId);
  if (!route) throw Errors.notFound('Ruta no encontrada.');

  const existing = await runRepo.findFeedbackByUserAndRoute(userId, routeId);
  if (existing) throw Errors.conflict('FEEDBACK_EXISTS', 'Ya enviaste feedback para esta ruta.');

  const { rating, notes, fatigue_level, perceived_difficulty, session_id } = fields;
  if (!rating || rating < 1 || rating > 5) throw Errors.badRequest('rating debe ser entre 1 y 5.');

  return runRepo.createFeedback({
    user_id:              userId,
    route_id:             routeId,
    session_id:           session_id           ? Number(session_id)           : null,
    rating,
    notes:                notes                ?? null,
    fatigue_level:        fatigue_level        ? Number(fatigue_level)        : null,
    perceived_difficulty: perceived_difficulty ? Number(perceived_difficulty) : null,
  });
}

export async function getRouteFeedback(routeId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);

  const route = await runRepo.findRouteById(routeId);
  if (!route) throw Errors.notFound('Ruta no encontrada.');

  const [items, total] = await Promise.all([
    runRepo.findFeedbackByRoute(routeId, { limit: perPage, offset }),
    runRepo.countFeedbackByRoute(routeId),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}
