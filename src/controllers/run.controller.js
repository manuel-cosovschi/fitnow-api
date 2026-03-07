// src/controllers/run.controller.js
import * as runService from '../services/run.service.js';

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
