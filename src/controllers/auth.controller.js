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

export async function forgotPassword(req, res, next) {
  try {
    await authService.forgotPassword(req.body.email);
    // Always return 200 regardless of whether email exists (prevent enumeration)
    res.json({ status: 'ok', message: 'Si el email está registrado, recibirás un enlace en breve.' });
  } catch (err) { next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body.token, req.body.new_password);
    res.json({ status: 'ok', message: 'Contraseña restablecida correctamente.' });
  } catch (err) { next(err); }
}

export async function registerProvider(req, res, next) {
  try {
    const result = await authService.registerProvider(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function refresh(req, res, next) {
  try {
    const result = await authService.refreshToken(req.body?.refresh_token);
    res.json(result);
  } catch (err) { next(err); }
}

export async function verifyEmail(req, res, next) {
  try {
    res.json(await authService.verifyEmail(req.body));
  } catch (err) { next(err); }
}

export async function magicLink(req, res, next) {
  try {
    res.json(await authService.magicLink(req.body));
  } catch (err) { next(err); }
}

export async function verify2fa(req, res, next) {
  try {
    res.json(await authService.verify2fa(req.body));
  } catch (err) { next(err); }
}

export async function appleSignIn(req, res, next) {
  try {
    res.json(await authService.appleSignIn(req.body));
  } catch (err) { next(err); }
}
