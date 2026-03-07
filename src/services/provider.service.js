// src/services/provider.service.js
import * as provRepo from '../repositories/provider.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function list(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const filters = {
    status: queryParams.status ?? 'active',
    kind:   queryParams.kind   ?? null,
    city:   queryParams.city   ?? null,
    q:      queryParams.q?.trim() ?? null,
  };

  const [items, total] = await Promise.all([
    provRepo.findMany({ ...filters, limit: perPage, offset }),
    provRepo.countMany(filters),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}

export async function getById(id) {
  const provider = await provRepo.findById(id);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');

  const [hours, services] = await Promise.all([
    provRepo.findHours(id),
    provRepo.findServices(id),
  ]);

  return { ...provider, hours, services };
}

export async function create(fields) {
  if (!fields.name?.trim()) throw Errors.badRequest('El nombre es requerido.');

  return provRepo.create({
    ...fields,
    status: 'pending',
  });
}

export async function update(id, fields, requestingUser) {
  const provider = await provRepo.findById(id);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');

  // provider_admin can only update their own provider
  if (requestingUser.role === 'provider_admin' && requestingUser.provider_id !== provider.id) {
    throw Errors.forbidden('No podés editar este proveedor.');
  }

  return provRepo.update(id, fields);
}

export async function activate(id) {
  const provider = await provRepo.findById(id);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');
  return provRepo.update(id, { status: 'active' });
}

export async function suspend(id) {
  const provider = await provRepo.findById(id);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');
  return provRepo.update(id, { status: 'suspended' });
}

export async function setHours(providerId, hours, requestingUser) {
  const provider = await provRepo.findById(providerId);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');

  if (requestingUser.role === 'provider_admin' && requestingUser.provider_id !== provider.id) {
    throw Errors.forbidden('No podés editar este proveedor.');
  }

  if (!Array.isArray(hours)) throw Errors.badRequest('hours debe ser un array.');

  await provRepo.replaceHours(providerId, hours);
  return provRepo.findHours(providerId);
}

export async function addService(providerId, { sport_id, description }, requestingUser) {
  const provider = await provRepo.findById(providerId);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');

  if (requestingUser.role === 'provider_admin' && requestingUser.provider_id !== provider.id) {
    throw Errors.forbidden('No podés editar este proveedor.');
  }

  if (!sport_id) throw Errors.badRequest('sport_id es requerido.');

  return provRepo.addService(providerId, { sport_id: Number(sport_id), description: description ?? null });
}

export async function removeService(providerId, serviceId, requestingUser) {
  const provider = await provRepo.findById(providerId);
  if (!provider) throw Errors.notFound('Proveedor no encontrado.');

  if (requestingUser.role === 'provider_admin' && requestingUser.provider_id !== provider.id) {
    throw Errors.forbidden('No podés editar este proveedor.');
  }

  await provRepo.removeService(serviceId);
  return { status: 'removed' };
}
