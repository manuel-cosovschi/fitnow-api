// src/services/offer.service.js
import * as offerRepo from '../repositories/offer.repository.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function create(providerId, { title, description, discount_label, activity_kind, valid_until, icon_name }) {
  if (!title?.trim()) throw Errors.badRequest('El título es requerido.');
  if (!discount_label?.trim()) throw Errors.badRequest('discount_label es requerido.');

  return offerRepo.create({ title, description, discount_label, activity_kind, provider_id: providerId, valid_until, icon_name });
}

export async function listApproved(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const [items, total] = await Promise.all([
    offerRepo.findMany({ status: 'approved', limit: perPage, offset }),
    offerRepo.countMany({ status: 'approved' }),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

export async function listMine(providerId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const [items, total] = await Promise.all([
    offerRepo.findManyByProvider(providerId, { limit: perPage, offset }),
    offerRepo.countManyByProvider(providerId),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

export async function listAdmin(queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const { status } = queryParams;
  const [items, total] = await Promise.all([
    offerRepo.findMany({ status: status || undefined, limit: perPage, offset }),
    offerRepo.countMany({ status: status || undefined }),
  ]);
  return paginatedResponse(items, { page, perPage, total });
}

export async function approve(id) {
  const offer = await offerRepo.findById(id);
  if (!offer) throw Errors.notFound('Oferta no encontrada.');
  return offerRepo.updateStatus(id, 'approved');
}

export async function reject(id) {
  const offer = await offerRepo.findById(id);
  if (!offer) throw Errors.notFound('Oferta no encontrada.');
  return offerRepo.updateStatus(id, 'rejected');
}
