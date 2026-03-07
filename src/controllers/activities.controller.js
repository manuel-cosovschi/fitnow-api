// src/controllers/activities.controller.js
import * as actService from '../services/activity.service.js';

export async function list(req, res, next) {
  try {
    res.json(await actService.list(req.query));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await actService.getById(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const activity = await actService.create(req.body, req.user);
    res.status(201).json(activity);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    res.json(await actService.update(Number(req.params.id), req.body, req.user));
  } catch (err) { next(err); }
}

export async function activate(req, res, next) {
  try {
    res.json(await actService.activate(Number(req.params.id)));
  } catch (err) { next(err); }
}

export async function addSession(req, res, next) {
  try {
    const session = await actService.addSession(Number(req.params.id), req.body);
    res.status(201).json(session);
  } catch (err) { next(err); }
}
