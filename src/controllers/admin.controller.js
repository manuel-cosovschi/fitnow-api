// src/controllers/admin.controller.js
import * as aiService from '../services/ai.service.js';

export async function getWeights(req, res, next) {
  try {
    res.json(await aiService.getWeights());
  } catch (err) { next(err); }
}

export async function listWeights(req, res, next) {
  try {
    res.json(await aiService.listWeights());
  } catch (err) { next(err); }
}

export async function upsertWeights(req, res, next) {
  try {
    res.json(await aiService.upsertWeights(req.body));
  } catch (err) { next(err); }
}

export async function getNews(req, res, next) {
  try {
    res.json(await aiService.getNews());
  } catch (err) { next(err); }
}
