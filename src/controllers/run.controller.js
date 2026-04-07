// src/controllers/run.controller.js
import * as runService    from '../services/run.service.js';
import * as rerouteService from '../services/reroute.service.js';
import { generateRoutes } from '../services/routeGenerator.service.js';
import { Errors } from '../utils/errors.js';

// ── Routes ────────────────────────────────────────────────────────────────────
export async function listRoutes(req, res, next) {
  try {
    res.json(await runService.listRoutes(req.query));
  } catch (err) { next(err); }
}

export async function getRoute(req, res, next) {
  try {
    res.json(await runService.getRoute(Number(req.params.id)));
  } catch (err) { next(err); }
}

/**
 * POST /run/routes
 * - If body contains origin_lat/origin_lng/distance_m → generate routes dynamically (any authenticated user)
 * - Otherwise → create/store a route in DB (admin or provider_admin only)
 */
export async function routesPost(req, res, next) {
  try {
    const { origin_lat, origin_lng, distance_m } = req.body;

    if (origin_lat !== undefined && origin_lng !== undefined && distance_m !== undefined) {
      const result = await generateRoutes({
        origin_lat: Number(origin_lat),
        origin_lng: Number(origin_lng),
        distance_m: Number(distance_m),
      });
      return res.json(result);
    }

    // Route creation: restricted to admin / provider_admin
    if (!['admin', 'provider_admin'].includes(req.user?.role)) {
      return next(Errors.forbidden('Se requiere rol admin o provider_admin.'));
    }
    const route = await runService.createRoute(req.body, req.user);
    return res.status(201).json(route);
  } catch (err) { next(err); }
}

export async function createRoute(req, res, next) {
  try {
    const route = await runService.createRoute(req.body, req.user);
    res.status(201).json(route);
  } catch (err) { next(err); }
}

export async function recommend(req, res, next) {
  try {
    res.json(await runService.recommendRoutes(req.query));
  } catch (err) { next(err); }
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function startSession(req, res, next) {
  try {
    const session = await runService.startSession(req.user.id, req.body);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function getSession(req, res, next) {
  try {
    res.json(await runService.getSession(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function pushTelemetry(req, res, next) {
  try {
    const { points } = req.body;
    res.json(await runService.pushTelemetry(Number(req.params.id), req.user.id, points));
  } catch (err) { next(err); }
}

export async function finishSession(req, res, next) {
  try {
    res.json(await runService.finishSession(Number(req.params.id), req.user.id, req.body));
  } catch (err) { next(err); }
}

export async function abandonSession(req, res, next) {
  try {
    res.json(await runService.abandonSession(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function listMySessions(req, res, next) {
  try {
    res.json(await runService.listMySessions(req.user.id, req.query));
  } catch (err) { next(err); }
}

// ── Feedback ──────────────────────────────────────────────────────────────────
export async function submitFeedback(req, res, next) {
  try {
    const fb = await runService.submitFeedback(req.user.id, Number(req.params.id), req.body);
    res.status(201).json(fb);
  } catch (err) { next(err); }
}

export async function getRouteFeedback(req, res, next) {
  try {
    res.json(await runService.getRouteFeedback(Number(req.params.id), req.query));
  } catch (err) { next(err); }
}

// ── Reroute ───────────────────────────────────────────────────────────────────
export async function rerouteSession(req, res, next) {
  try {
    const result = await rerouteService.rerouteSession(
      Number(req.params.id),
      req.user.id,
      req.body,
    );
    res.json(result);
  } catch (err) { next(err); }
}
