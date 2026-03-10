// src/services/activity.service.js
import * as actRepo from '../repositories/activity.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function list(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const where  = [];
  const params = [];

  const { q, difficulty, modality, kind, sport_id, provider_id, status = 'active', min_price, max_price } = queryParams;

  where.push(`a.status = ?`); params.push(status);

  if (q?.trim()) {
    where.push(`(a.title LIKE ? OR a.description LIKE ? OR a.location LIKE ?)`);
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  if (difficulty)  { where.push(`a.difficulty  = ?`); params.push(difficulty);       }
  if (modality)    { where.push(`a.modality    = ?`); params.push(modality);         }
  if (kind)        { where.push(`a.kind        = ?`); params.push(kind);             }
  if (sport_id)    { where.push(`a.sport_id    = ?`); params.push(Number(sport_id)); }
  if (provider_id) { where.push(`a.provider_id = ?`); params.push(Number(provider_id)); }
  if (min_price)   { where.push(`a.price       >= ?`); params.push(Number(min_price)); }
  if (max_price)   { where.push(`a.price       <= ?`); params.push(Number(max_price)); }

  const [items, total] = await Promise.all([
    actRepo.findMany({ where, params, limit: perPage, offset }),
    actRepo.countMany({ where, params }),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}

export async function getById(id) {
  const activity = await actRepo.findById(id);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');
  const sessions = await actRepo.findSessions(id);
  return { ...activity, sessions };
}

export async function create(fields, requestingUser) {
  if (!fields.title?.trim()) throw Errors.badRequest('El título es requerido.');

  // provider_admin can only create activities for their own provider
  if (requestingUser.role === 'provider_admin') {
    if (!requestingUser.provider_id) throw Errors.forbidden('No tenés proveedor asignado.');
    fields = { ...fields, provider_id: requestingUser.provider_id };
  }

  return actRepo.create({ ...fields, status: 'draft' });
}

export async function update(id, fields, requestingUser) {
  const activity = await actRepo.findById(id);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');
  if (requestingUser.role === 'provider_admin' && activity.provider_id !== requestingUser.provider_id) {
    throw Errors.forbidden('No podés editar actividades de otro proveedor.');
  }
  return actRepo.update(id, fields);
}

export async function activate(id) {
  const activity = await actRepo.findById(id);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');
  return actRepo.update(id, { status: 'active' });
}

export async function addSession(activityId, fields) {
  const activity = await actRepo.findById(activityId);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');
  if (!fields.start_at || !fields.end_at) throw Errors.badRequest('start_at y end_at son requeridos.');
  return actRepo.createSession(activityId, fields);
}
