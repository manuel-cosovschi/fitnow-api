// src/controllers/hazards.controller.js
import * as hazardService from '../services/hazard.service.js';

export async function create(req, res, next) {
  try {
    const hazard = await hazardService.create(req.user.id, req.body);
    res.status(201).json(hazard);
  } catch (err) { next(err); }
}

export async function findNear(req, res, next) {
  try {
    res.json(await hazardService.findNear(req.query));
  } catch (err) { next(err); }
}

export async function vote(req, res, next) {
  try {
    res.json(await hazardService.vote(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req, res, next) {
  try {
    res.json(await hazardService.updateStatus(Number(req.params.id), req.body.status));
  } catch (err) { next(err); }
}

export async function listAll(req, res, next) {
  try {
    res.json(await hazardService.listAll(req.query));
  } catch (err) { next(err); }
}
