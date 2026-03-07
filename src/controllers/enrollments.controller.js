// src/controllers/enrollments.controller.js
import * as enrollService from '../services/enrollment.service.js';

export async function enroll(req, res, next) {
  try {
    const enrollment = await enrollService.enroll(req.user.id, req.body);
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
}

export async function listMine(req, res, next) {
  try {
    res.json(await enrollService.listMine(req.user.id, req.query));
  } catch (err) { next(err); }
}

export async function cancel(req, res, next) {
  try {
    res.json(await enrollService.cancel(req.user.id, Number(req.params.id)));
  } catch (err) { next(err); }
}
