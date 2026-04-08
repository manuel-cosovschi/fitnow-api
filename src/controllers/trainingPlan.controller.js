// src/controllers/trainingPlan.controller.js
import * as planService from '../services/trainingPlan.service.js';

export async function generate(req, res, next) {
  try {
    const plan = await planService.generatePlan(req.user.id, req.body);
    res.status(201).json(plan);
  } catch (err) { next(err); }
}

export async function listMyPlans(req, res, next) {
  try {
    res.json(await planService.listMyPlans(req.user.id, req.query));
  } catch (err) { next(err); }
}

export async function getActivePlan(req, res, next) {
  try {
    res.json(await planService.getActivePlan(req.user.id));
  } catch (err) { next(err); }
}

export async function getPlan(req, res, next) {
  try {
    res.json(await planService.getPlan(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}

export async function cancelPlan(req, res, next) {
  try {
    res.json(await planService.cancelPlan(Number(req.params.id), req.user.id));
  } catch (err) { next(err); }
}
