// src/controllers/gym.controller.js
import * as svc from '../services/gym.service.js';
import { parsePagination } from '../utils/paginate.js';

export async function listMine(req, res, next) {
  try {
    const { page, perPage, offset } = parsePagination(req.query);
    res.json(await svc.listMine(req.user.id, { limit: perPage, offset, page, perPage }));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    res.status(201).json(await svc.create(req.user.id, req.body));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await svc.getById(req.user.id, Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function addSet(req, res, next) {
  try {
    res.status(201).json(await svc.addSet(req.user.id, Number(req.params.id), req.body));
  } catch (err) { next(err); }
}

export async function finish(req, res, next) {
  try {
    res.json(await svc.finish(req.user.id, Number(req.params.id), req.body));
  } catch (err) { next(err); }
}

export async function reroute(req, res, next) {
  try {
    res.json(await svc.reroute(req.user.id, Number(req.params.id), req.body));
  } catch (err) { next(err); }
}
