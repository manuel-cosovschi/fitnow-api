// src/services/enrollment.service.js
import * as enrollRepo from '../repositories/enrollment.repository.js';
import * as actRepo    from '../repositories/activity.repository.js';
import { transaction }  from '../db.js';
import { parsePagination, paginatedResponse } from '../utils/paginate.js';
import { Errors } from '../utils/errors.js';

export async function enroll(userId, { activity_id, session_id, plan_name, plan_price, payment_type, payment_method }) {
  if (!activity_id) throw Errors.badRequest('activity_id requerido.');

  const activity = await actRepo.findById(activity_id);
  if (!activity) throw Errors.notFound('Actividad no encontrada.');
  if (activity.status !== 'active') throw Errors.badRequest('La actividad no está activa.');

  const dup = await enrollRepo.findDuplicate(userId, activity_id);
  if (dup) throw Errors.conflict('ALREADY_ENROLLED', 'Ya estás inscripto en esta actividad.');

  return transaction(async (conn) => {
    if (session_id) {
      const session = await actRepo.findSessionByIdForUpdate(conn, session_id);
      if (!session || session.activity_id !== Number(activity_id))
        throw Errors.notFound('Sesión no encontrada.');
      if (session.seats_left <= 0) throw Errors.conflict('NO_SEATS', 'No quedan lugares en esta sesión.');
      await actRepo.decrementSessionSeats(conn, session_id);
    } else {
      const act = await actRepo.findByIdForUpdate(conn, activity_id);
      if (!act) throw Errors.notFound('Actividad no encontrada.');
      if (act.has_capacity_limit && act.seats_left <= 0)
        throw Errors.conflict('NO_CAPACITY', 'No quedan lugares en esta actividad.');
      if (!act.has_capacity_limit && act.seats_left <= 0)
        throw Errors.conflict('NO_SEATS', 'No quedan lugares en esta actividad.');
      await actRepo.decrementSeats(conn, activity_id);
    }

    return enrollRepo.create(conn, {
      user_id:        userId,
      activity_id:    Number(activity_id),
      session_id:     session_id ? Number(session_id) : null,
      price_paid:     plan_price ?? activity.price ?? 0,
      plan_name:      plan_name ?? null,
      plan_price:     plan_price ?? null,
      payment_type:   payment_type ?? 'full',
      payment_method: payment_method ?? 'card',
    });
  });
}

export async function listMine(userId, queryParams) {
  const { page, perPage, offset } = parsePagination(queryParams);
  const when = queryParams.when ?? 'all';

  const [items, total] = await Promise.all([
    enrollRepo.findManyByUser(userId, { when, limit: perPage, offset }),
    enrollRepo.countManyByUser(userId, { when }),
  ]);

  return paginatedResponse(items, { page, perPage, total });
}

export async function cancel(userId, enrollmentId) {
  const enrollment = await enrollRepo.findById(enrollmentId);
  if (!enrollment) throw Errors.notFound('Inscripción no encontrada.');
  if (enrollment.user_id !== userId) throw Errors.forbidden('No podés cancelar esta inscripción.');
  if (enrollment.status === 'cancelled') throw Errors.badRequest('La inscripción ya fue cancelada.');

  return transaction(async (conn) => {
    await enrollRepo.cancel(conn, enrollmentId);

    if (enrollment.session_id) {
      await actRepo.incrementSessionSeats(conn, enrollment.session_id);
    } else {
      await actRepo.incrementSeats(conn, enrollment.activity_id);
    }

    return { status: 'cancelled' };
  });
}
