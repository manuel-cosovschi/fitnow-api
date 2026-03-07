// src/services/ai.service.js
import * as aiRepo from '../repositories/ai.repository.js';
import { Errors } from '../utils/errors.js';

export async function getWeights() {
  const w = await aiRepo.getActiveWeights();
  if (!w) throw Errors.notFound('No hay pesos activos configurados.');
  return w;
}

export async function listWeights() {
  return aiRepo.listWeights();
}

export async function upsertWeights({ version, label, weights }) {
  if (!version?.trim()) throw Errors.badRequest('version es requerido.');

  const required = ['w_distance', 'w_elev', 'w_hz_cnt', 'w_hz_sev', 'w_feedback', 'w_popularity'];
  for (const key of required) {
    if (weights[key] === undefined || weights[key] === null)
      throw Errors.badRequest(`${key} es requerido.`);
    if (typeof weights[key] !== 'number' || weights[key] < 0 || weights[key] > 1)
      throw Errors.badRequest(`${key} debe ser un número entre 0 y 1.`);
  }

  const sum = required.reduce((acc, k) => acc + weights[k], 0);
  if (Math.abs(sum - 1) > 0.01)
    throw Errors.badRequest(`Los pesos deben sumar 1.0 (actual: ${sum.toFixed(4)}).`);

  return aiRepo.upsertWeights({ version: version.trim(), label, weights });
}

export async function getNews() {
  return aiRepo.findNewsActive();
}
