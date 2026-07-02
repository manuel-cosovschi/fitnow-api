// src/controllers/training-plans.controller.js
import * as svc from '../services/training-plans.service.js';

// Lista tus planes de entrenamiento.
export async function list(req, res, next) {
  try { res.json(await svc.list(req.user.id)); } catch (e) { next(e); }
}

// Devuelve tu plan activo.
export async function listActive(req, res, next) {
  try { res.json(await svc.listActive(req.user.id)); } catch (e) { next(e); }
}

// Genera un plan de entrenamiento.
export async function generate(req, res, next) {
  try { res.status(201).json(await svc.generate(req.user.id, req.body)); } catch (e) { next(e); }
}

// Detalle de un plan.
export async function getById(req, res, next) {
  try { res.json(await svc.getById(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
}

// Cancela un plan.
export async function cancel(req, res, next) {
  try {
    await svc.cancel(req.user.id, Number(req.params.id));
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}
