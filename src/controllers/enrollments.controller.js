// src/controllers/enrollments.controller.js
import * as enrollService from '../services/enrollment.service.js';

// Recibe el pedido de inscripción y se lo pasa al servicio.
export async function enroll(req, res, next) {
  try {
    const enrollment = await enrollService.enroll(req.user.id, req.body);
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
}

// Devuelve tus inscripciones.
export async function listMine(req, res, next) {
  try {
    res.json(await enrollService.listMine(req.user.id, req.query));
  } catch (err) { next(err); }
}

// Devuelve los inscriptos del proveedor logueado.
export async function listByProvider(req, res, next) {
  try {
    if (!req.user.provider_id) {
      return res.status(403).json({ code: 'NO_PROVIDER', message: 'No tenés proveedor asignado.' });
    }
    res.json(await enrollService.listByProvider(req.user.provider_id, req.query));
  } catch (err) { next(err); }
}

// Cancela una inscripción tuya.
export async function cancel(req, res, next) {
  try {
    res.json(await enrollService.cancel(req.user.id, Number(req.params.id)));
  } catch (err) { next(err); }
}

// Hace el check-in de un inscripto.
export async function checkin(req, res, next) {
  try {
    res.json(await enrollService.checkin(req.user.provider_id, Number(req.params.enrollmentId)));
  } catch (err) { next(err); }
}
