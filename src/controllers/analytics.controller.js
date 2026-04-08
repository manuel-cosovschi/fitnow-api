// src/controllers/analytics.controller.js
import * as analyticsService from '../services/analytics.service.js';

export async function runningSummary(req, res, next) {
  try {
    res.json(await analyticsService.getRunningSummary(req.user.id));
  } catch (err) { next(err); }
}

export async function runningWeekly(req, res, next) {
  try {
    const weeks = Math.min(52, Math.max(1, parseInt(req.query.weeks ?? '12', 10) || 12));
    res.json(await analyticsService.getRunningWeekly(req.user.id, weeks));
  } catch (err) { next(err); }
}

export async function runningProgress(req, res, next) {
  try {
    res.json(await analyticsService.getRunningProgress(req.user.id));
  } catch (err) { next(err); }
}

export async function gymSummary(req, res, next) {
  try {
    res.json(await analyticsService.getGymSummary(req.user.id));
  } catch (err) { next(err); }
}

export async function gymWeekly(req, res, next) {
  try {
    const weeks = Math.min(52, Math.max(1, parseInt(req.query.weeks ?? '12', 10) || 12));
    res.json(await analyticsService.getGymWeekly(req.user.id, weeks));
  } catch (err) { next(err); }
}

export async function gymMuscleDistribution(req, res, next) {
  try {
    res.json(await analyticsService.getGymMuscleDistribution(req.user.id));
  } catch (err) { next(err); }
}

export async function combinedStreak(req, res, next) {
  try {
    res.json(await analyticsService.getCombinedStreak(req.user.id));
  } catch (err) { next(err); }
}
