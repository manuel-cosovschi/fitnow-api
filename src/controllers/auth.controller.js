// src/controllers/auth.controller.js
import * as authService from '../services/auth.service.js';

export async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    res.json(user);
  } catch (err) { next(err); }
}

export async function updateMe(req, res, next) {
  try {
    const user = await authService.updateMe(req.user.id, req.body);
    res.json(user);
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.id, req.body);
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
}
