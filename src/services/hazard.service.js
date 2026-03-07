// src/services/hazard.service.js
import * as hazardRepo from '../repositories/hazard.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function create(userId, { lat, lng, type, note, severity }) {
  if (!lat || !lng)  throw Errors.badRequest('lat y lng son requeridos.');
  if (!type?.trim()) throw Errors.badRequest('type es requerido.');

  const sev = Math.min(3, Math.max(1, Number(severity ?? 1)));

  return hazardRepo.create({
    user_id:  userId,
    lat:      Number(lat),
    lng:      Number(lng),
    type:     type.trim(),
    note:     note?.trim() ?? null,
    severity: sev,
  });
}

export async function findNear(queryParams) {
  const { lat, lng, radius_m = 1000 } = queryParams;
  if (!lat || !lng) throw Errors.badRequest('lat y lng son requeridos.');

  return hazardRepo.findNear({
    lat:      Number(lat),
    lng:      Number(lng),
    radius_m: Number(radius_m),
  });
}

export async function vote(hazardId, userId) {
  const hazard = await hazardRepo.findById(hazardId);
  if (!hazard) throw Errors.notFound('Peligro no encontrado.');
  if (hazard.status !== 'active') throw Errors.badRequest('El peligro ya no está activo.');

  const existing = await hazardRepo.findVote(hazardId, userId);
  if (existing) throw Errors.conflict('ALREADY_VOTED', 'Ya votaste este peligro.');

  await hazardRepo.addVote(hazardId, userId);
  return hazardRepo.findById(hazardId);
}

export async function updateStatus(hazardId, status) {
  const hazard = await hazardRepo.findById(hazardId);
  if (!hazard) throw Errors.notFound('Peligro no encontrado.');

  const allowed = ['active', 'resolved', 'removed'];
  if (!allowed.includes(status)) throw Errors.badRequest(`status debe ser: ${allowed.join(', ')}.`);

  return hazardRepo.updateStatus(hazardId, status);
}

export async function listAll(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const status = queryParams.status ?? null;

  const [items, total] = await Promise.all([
    hazardRepo.findAll({ status, limit: perPage, offset }),
    hazardRepo.countAll({ status }),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}
