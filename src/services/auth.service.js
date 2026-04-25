// src/services/auth.service.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import * as userRepo from '../repositories/user.repository.js';
import * as provRepo from '../repositories/provider.repository.js';
import { query, queryOne } from '../db.js';
import { Errors } from '../utils/errors.js';
import * as mailer from '../utils/mailer.js';

const SALT_ROUNDS    = 12;
const JWT_SECRET     = () => process.env.JWT_SECRET         || 'dev_secret_change_me';
const JWT_EXPIRES    = () => process.env.JWT_EXPIRES_IN     || '15m';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev_refresh_secret';
const REFRESH_EXPIRES_IN = () => process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function refreshExpiryDate() {
  const val = REFRESH_EXPIRES_IN();
  const match = String(val).match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const n = parseInt(match[1], 10);
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return new Date(Date.now() + n * multipliers[match[2]]);
}

async function createRefreshToken(userId) {
  const raw  = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const exp  = refreshExpiryDate();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)`,
    [userId, hash, exp]
  );
  return raw;
}

function signRefreshJwt(user) {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET(),
    { expiresIn: REFRESH_EXPIRES_IN() }
  );
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role ?? 'user', provider_id: user.provider_id ?? null },
    JWT_SECRET(),
    { expiresIn: JWT_EXPIRES() }
  );
}

function buildAuthResponse(user, withRefresh = true) {
  const token         = signToken(user);
  const refresh_token = withRefresh ? signRefreshJwt(user) : undefined;
  const { password_hash: _ph, ...safeUser } = user;
  return { token, refresh_token, user: { id: safeUser.id, name: safeUser.name, email: safeUser.email, role: safeUser.role, provider_id: safeUser.provider_id ?? null } };
}

export async function register({ name, email, password }) {
  if (!name?.trim())  throw Errors.badRequest('El nombre es requerido.');
  if (!email?.trim()) throw Errors.badRequest('El email es requerido.');
  if (!password || password.length < 6) throw Errors.badRequest('La contraseña debe tener al menos 6 caracteres.');

  const existing = await userRepo.findByEmail(email.toLowerCase().trim());
  if (existing) throw Errors.conflict('EMAIL_ALREADY_EXISTS', 'El email ya está registrado.');

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user  = await userRepo.create({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash });
  return buildAuthResponse(user);
}

export async function login({ email, password }) {
  if (!email || !password) throw Errors.badRequest('Email y contraseña son requeridos.');

  const user = await userRepo.findByEmail(email.toLowerCase().trim());
  if (!user || !user.password_hash) throw Errors.unauthorized('Credenciales incorrectas.');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw Errors.unauthorized('Credenciales incorrectas.');

  return buildAuthResponse(user);
}

export async function refreshToken(rawToken) {
  if (!rawToken) throw Errors.badRequest('refresh_token requerido.');
  let payload;
  try {
    payload = jwt.verify(rawToken, REFRESH_SECRET());
  } catch {
    throw Errors.unauthorized('Refresh token inválido o expirado.');
  }
  const user = await userRepo.findById(payload.id);
  if (!user) throw Errors.unauthorized('Usuario no encontrado.');
  const token         = signToken(user);
  const refresh_token = signRefreshJwt(user);
  return { token, refresh_token };
}

export async function verifyEmail({ token }) {
  if (!token) throw Errors.badRequest('Token requerido.');
  const record = await queryOne(
    `SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [crypto.createHash('sha256').update(token).digest('hex')]
  );
  if (!record) throw Errors.badRequest('Token inválido o expirado.');
  await query(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?`, [record.id]);
  await query(`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = ?`, [record.user_id]);
  return { status: 'ok' };
}

export async function magicLink({ token }) {
  if (!token) throw Errors.badRequest('Token requerido.');
  const record = await queryOne(
    `SELECT * FROM magic_link_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [crypto.createHash('sha256').update(token).digest('hex')]
  );
  if (!record) throw Errors.unauthorized('Magic link inválido o expirado.');
  await query(`UPDATE magic_link_tokens SET used_at = NOW() WHERE id = ?`, [record.id]);
  const user = await userRepo.findById(record.user_id);
  if (!user) throw Errors.notFound('Usuario no encontrado.');
  return buildAuthResponse(user);
}

export async function verify2fa({ temp_token, code }) {
  if (!temp_token || !code) throw Errors.badRequest('temp_token y code son requeridos.');
  let payload;
  try {
    payload = jwt.verify(temp_token, JWT_SECRET() + '_2fa');
  } catch {
    throw Errors.unauthorized('temp_token inválido o expirado.');
  }
  const record = await queryOne(
    `SELECT * FROM two_factor_codes WHERE user_id = ? AND code = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [payload.sub, code]
  );
  if (!record) throw Errors.unauthorized('Código 2FA inválido o expirado.');
  await query(`UPDATE two_factor_codes SET used_at = NOW() WHERE id = ?`, [record.id]);
  const user = await userRepo.findById(payload.sub);
  if (!user) throw Errors.notFound('Usuario no encontrado.');
  return buildAuthResponse(user);
}

export async function appleSignIn({ identity_token, name }) {
  if (!identity_token) throw Errors.badRequest('identity_token requerido.');
  let applePayload;
  try {
    const appleSignin = await import('apple-signin-auth');
    applePayload = await appleSignin.default.verifyIdToken(identity_token, {
      audience: process.env.APNS_BUNDLE_ID || 'com.fitnow.app',
      ignoreExpiration: false,
    });
  } catch (err) {
    throw Errors.unauthorized('Apple identity_token inválido.');
  }
  const appleSub = applePayload.sub;
  const email    = applePayload.email || null;
  let user = await queryOne(`SELECT * FROM users WHERE apple_sub = ? LIMIT 1`, [appleSub]);
  if (!user && email) user = await userRepo.findByEmail(email);
  if (!user) {
    const displayName = name?.trim() || email?.split('@')[0] || 'FitNow User';
    const result = await query(
      `INSERT INTO users (name, email, apple_sub, provider, role) VALUES (?,?,?,'apple','user')`,
      [displayName, email, appleSub]
    );
    user = await userRepo.findById(result.insertId);
  } else if (!user.apple_sub) {
    await query(`UPDATE users SET apple_sub = ?, updated_at = NOW() WHERE id = ?`, [appleSub, user.id]);
    user = await userRepo.findById(user.id);
  }
  return buildAuthResponse(user);
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

export async function registerProvider({ name, email, password, provider_name, provider_kind, provider_description, provider_address, provider_city, provider_phone, provider_lat, provider_lng }) {
  if (!name?.trim())          throw Errors.badRequest('El nombre es requerido.');
  if (!email?.trim())         throw Errors.badRequest('El email es requerido.');
  if (!password || password.length < 6) throw Errors.badRequest('La contraseña debe tener al menos 6 caracteres.');
  if (!provider_name?.trim()) throw Errors.badRequest('El nombre del proveedor es requerido.');

  const existing = await userRepo.findByEmail(email.toLowerCase().trim());
  if (existing) throw Errors.conflict('EMAIL_ALREADY_EXISTS', 'El email ya está registrado.');

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepo.create({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash, role: 'provider_admin' });

  const provider = await provRepo.create({
    name:        provider_name.trim(),
    kind:        provider_kind ?? 'gym',
    description: provider_description ?? null,
    address:     provider_address ?? null,
    city:        provider_city ?? null,
    phone:       provider_phone ?? null,
    lat:         provider_lat ?? null,
    lng:         provider_lng ?? null,
  });

  const updatedUser = await userRepo.setRoleAndProvider(user.id, 'provider_admin', provider.id);
  return { user: updatedUser, token: signToken(updatedUser), provider };
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
