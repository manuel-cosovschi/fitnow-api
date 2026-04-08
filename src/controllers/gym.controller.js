// src/controllers/gym.controller.js
import * as gymService from '../services/gym.service.js';

export async function startSession(req, res, next) {
  try {
    const session = await gymService.startSession(req.user.id, req.body);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function listMySessions(req, res, next) {
  try {
    res.json(await gymService.listMySessions(req.user.id, req.query));
  } catch (err) { next(err); }
}

export async function getSession(req, res, next) {
  try {
    res.json(await gymService.getSession(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function logSet(req, res, next) {
  try {
    const set = await gymService.logSet(Number(req.params.id), req.user.id, req.body);
    res.status(201).json(set);
  } catch (err) { next(err); }
}

export async function reroute(req, res, next) {
  try {
    const plan = await gymService.reroute(Number(req.params.id), req.user.id, req.body);
    res.json(plan);
  } catch (err) { next(err); }
}

export async function finishSession(req, res, next) {
  try {
    res.json(await gymService.finishSession(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function abandonSession(req, res, next) {
  try {
    res.json(await gymService.abandonSession(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}
