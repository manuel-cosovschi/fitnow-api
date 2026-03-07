// src/services/auth.service.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import * as userRepo from '../repositories/user.repository.js';
import { Errors } from '../utils/errors.js';
import * as mailer from '../utils/mailer.js';

const SALT_ROUNDS = 12;
const JWT_SECRET  = () => process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES = () => process.env.JWT_EXPIRES_IN || '30d';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role ?? 'user' },
    JWT_SECRET(),
    { expiresIn: JWT_EXPIRES() }
  );
}

export async function register({ name, email, password }) {
  if (!name?.trim())  throw Errors.badRequest('El nombre es requerido.');
  if (!email?.trim()) throw Errors.badRequest('El email es requerido.');
  if (!password || password.length < 6) throw Errors.badRequest('La contraseña debe tener al menos 6 caracteres.');

  const existing = await userRepo.findByEmail(email.toLowerCase().trim());
  if (existing) throw Errors.conflict('EMAIL_ALREADY_EXISTS', 'El email ya está registrado.');

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user  = await userRepo.create({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash });
  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  if (!email || !password) throw Errors.badRequest('Email y contraseña son requeridos.');

  const user = await userRepo.findByEmail(email.toLowerCase().trim());
  if (!user || !user.password_hash) throw Errors.unauthorized('Credenciales incorrectas.');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw Errors.unauthorized('Credenciales incorrectas.');

  // Remover hash del objeto de respuesta
  const { password_hash: _ph, ...safeUser } = user;
  return { user: safeUser, token: signToken(user) };
}

export async function getMe(userId) {
  const user = await userRepo.findById(userId);
  if (!user) throw Errors.notFound('Usuario no encontrado.');
  return user;
}

export async function updateMe(userId, fields) {
  if (fields.email) {
    const other = await userRepo.findByEmail(fields.email.toLowerCase().trim());
    if (other && other.id !== userId) throw Errors.conflict('EMAIL_IN_USE', 'El email ya está en uso.');
    fields.email = fields.email.toLowerCase().trim();
  }
  return userRepo.update(userId, fields);
}

export async function forgotPassword(email) {
  const user = await userRepo.findByEmail(email.toLowerCase().trim());
  // Always resolve without error to prevent email enumeration
  if (!user) return;

  const token    = crypto.randomBytes(32).toString('hex');
  const hash     = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await userRepo.createResetToken(user.id, hash, expiresAt);
  await mailer.sendPasswordReset(user.email, token);
}

export async function resetPassword(token, newPassword) {
  const hash   = crypto.createHash('sha256').update(token).digest('hex');
  const record = await userRepo.findResetToken(hash);

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    throw Errors.badRequest('Token inválido o expirado.');
  }

  await userRepo.updatePassword(record.user_id, await bcrypt.hash(newPassword, SALT_ROUNDS));
  await userRepo.markResetTokenUsed(record.id);
}

export async function changePassword(userId, { current_password, new_password }) {
  if (!current_password || !new_password) throw Errors.badRequest('Campos requeridos.');
  if (new_password.length < 6) throw Errors.badRequest('La nueva contraseña debe tener al menos 6 caracteres.');

  const user = await userRepo.findByIdWithHash(userId);
  if (!user) throw Errors.notFound('Usuario no encontrado.');

  const ok = await bcrypt.compare(current_password, user.password_hash ?? '');
  if (!ok) throw Errors.unauthorized('Contraseña actual incorrecta.');

  await userRepo.updatePassword(userId, await bcrypt.hash(new_password, SALT_ROUNDS));
}
