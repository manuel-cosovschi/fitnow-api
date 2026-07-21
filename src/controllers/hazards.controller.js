// src/controllers/hazards.controller.js
import * as hazardService from '../services/hazard.service.js';

// Reporta un peligro en la ruta (obra, zona insegura...).
export async function create(req, res, next) {
  try {
    const hazard = await hazardService.create(req.user.id, req.body);
    res.status(201).json(hazard);
  } catch (err) { next(err); }
}

// Busca peligros cerca de un punto.
export async function findNear(req, res, next) {
  try {
    res.json(await hazardService.findNear(req.query));
  } catch (err) { next(err); }
}

// Vota si un peligro sigue vigente.
export async function vote(req, res, next) {
  try {
    res.json(await hazardService.vote(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

// Cambia el estado de un peligro.
export async function updateStatus(req, res, next) {
  try {
    res.json(await hazardService.updateStatus(Number(req.params.id), req.body.status));
  } catch (err) { next(err); }
}

// Lista todos los peligros.
export async function listAll(req, res, next) {
  try {
    res.json(await hazardService.listAll(req.query));
  } catch (err) { next(err); }
}

// Corre la ingesta de reportes desde la prensa local (solo admin).
import { ingestNews } from '../services/newsIngest.service.js';
export async function ingestFromNews(req, res, next) {
  try { res.json(await ingestNews({ maxCreates: Number(req.body?.max) || 10 })); } catch (err) { next(err); }
}
