// src/services/mercadopagoOAuth.service.js
//
// Conexión de la cuenta de MercadoPago de un proveedor (MP Marketplace).
//
// Con la cuenta conectada, el cobro de sus actividades va directo a su cuenta y
// MP nos deposita la comisión — no pasa plata ajena por la cuenta de FitNow ni
// hay que liquidar por CBU. El proveedor que no conecta sigue con el circuito
// de saldo y retiro de siempre.
//
// Necesita una aplicación en MercadoPago Developers con la Redirect URI
// apuntando a  <API>/api/payments/mercadopago/oauth/callback

import jwt from 'jsonwebtoken';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';
import * as accounts from '../repositories/payoutAccount.repository.js';
import { queryOne } from '../db.js';

const AUTH_URL  = 'https://auth.mercadopago.com.ar/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

// El state vale poco tiempo: solo tiene que sobrevivir el ida y vuelta al
// navegador. Va firmado para que nadie pueda conectar una cuenta a un proveedor
// que no es el suyo.
const STATE_TTL = '15m';

function config() {
  return {
    clientId:     process.env.MERCADOPAGO_CLIENT_ID,
    clientSecret: process.env.MERCADOPAGO_CLIENT_SECRET,
    redirectUri:  process.env.MERCADOPAGO_REDIRECT_URI
      || `${process.env.APP_BASE_URL || 'https://api.fitnow.com'}/api/payments/mercadopago/oauth/callback`,
  };
}

export function isConfigured() {
  const { clientId, clientSecret } = config();
  return Boolean(clientId && clientSecret);
}

function stateSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Errors.internal('JWT_SECRET no configurado.');
  return secret;
}

// ─── Inicio de la conexión ────────────────────────────────────────────────────

/**
 * Arma la URL de autorización a la que hay que mandar al proveedor.
 * @param {number} providerId
 */
export function buildAuthorizationUrl(providerId) {
  if (!isConfigured()) {
    throw Errors.internal('La conexión con MercadoPago no está configurada.');
  }
  const { clientId, redirectUri } = config();

  const state = jwt.sign({ provider_id: providerId, purpose: 'mp_oauth' }, stateSecret(), {
    expiresIn: STATE_TTL,
  });

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id',    clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id',  'mp');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state',        state);

  return { authorization_url: url.toString(), expires_in_minutes: 15 };
}

function providerIdFromState(state) {
  try {
    const payload = jwt.verify(state, stateSecret());
    if (payload.purpose !== 'mp_oauth' || !payload.provider_id) throw new Error('state inesperado');
    return Number(payload.provider_id);
  } catch (err) {
    throw Errors.badRequest('El enlace de conexión venció o no es válido. Probá de nuevo.');
  }
}

// ─── Intercambio del código ───────────────────────────────────────────────────

async function requestToken(payload) {
  const resp = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    logger.warn(`[mp-oauth] ${resp.status}: ${data?.message || data?.error || 'sin detalle'}`);
    throw Errors.badRequest('MercadoPago rechazó la conexión.');
  }
  return data;
}

function expiryFrom(data) {
  const seconds = Number(data.expires_in);
  return Number.isFinite(seconds) ? new Date(Date.now() + seconds * 1000) : null;
}

/**
 * Cierra el flujo: cambia el código por los tokens y guarda la cuenta.
 * @returns {{ provider_id: number, external_user_id: string }}
 */
export async function completeConnection({ code, state }) {
  if (!code)  throw Errors.badRequest('Falta el código de autorización.');
  if (!state) throw Errors.badRequest('Falta el state.');

  const providerId = providerIdFromState(state);
  const { clientId, clientSecret, redirectUri } = config();

  const data = await requestToken({
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
  });

  if (!data.access_token || !data.user_id) {
    throw Errors.badRequest('MercadoPago no devolvió una cuenta usable.');
  }

  await accounts.upsert({
    provider_id:      providerId,
    external_user_id: data.user_id,
    access_token:     data.access_token,
    refresh_token:    data.refresh_token ?? null,
    public_key:       data.public_key ?? null,
    live_mode:        data.live_mode !== false,
    expires_at:       expiryFrom(data),
  });

  logger.info(`[mp-oauth] proveedor ${providerId} conectó la cuenta ${data.user_id}`);
  return { provider_id: providerId, external_user_id: String(data.user_id) };
}

// ─── Refresco ─────────────────────────────────────────────────────────────────

// Se refresca un rato antes de vencer: si el token muere entre que se crea la
// preferencia y el cliente paga, el cobro se cae.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * Devuelve la cuenta con un access token vigente, refrescándolo si hace falta.
 * Si el refresco falla, marca la cuenta como vencida y devuelve null: el cobro
 * cae al circuito de la plataforma en vez de romperse.
 */
export async function ensureFreshAccount(account) {
  if (!account) return null;

  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : null;
  const needsRefresh = expiresAt != null && expiresAt - Date.now() < REFRESH_MARGIN_MS;
  if (!needsRefresh) return account;

  if (!account.refresh_token || !isConfigured()) {
    await accounts.markStatus(account.id, 'expired');
    return null;
  }

  try {
    const { clientId, clientSecret } = config();
    const data = await requestToken({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: account.refresh_token,
    });

    await accounts.updateTokens(account.id, {
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? null,
      expires_at:    expiryFrom(data),
    });

    return {
      ...account,
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? account.refresh_token,
      expires_at:    expiryFrom(data),
    };
  } catch (err) {
    logger.warn(`[mp-oauth] no se pudo refrescar la cuenta ${account.id}: ${err.message}`);
    await accounts.markStatus(account.id, 'expired');
    return null;
  }
}

// ─── Consulta y baja ──────────────────────────────────────────────────────────

async function providerIdFor(userId) {
  const u = await queryOne(`SELECT provider_id FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!u?.provider_id) throw Errors.forbidden('Tu usuario no está asociado a un proveedor.');
  return u.provider_id;
}

/** Estado de la cuenta para mostrar en el panel del proveedor. */
export async function getStatus(userId) {
  const providerId = await providerIdFor(userId);
  const account = await accounts.findByProvider(providerId);

  return {
    available: isConfigured(),
    connected: Boolean(account && account.status === 'connected' && account.access_token),
    status: account?.status ?? 'not_connected',
    external_user_id: account?.external_user_id ?? null,
    live_mode: account?.live_mode ?? null,
    connected_at: account?.connected_at ?? null,
    expires_at: account?.expires_at ?? null,
  };
}

/** Devuelve la URL de autorización para el proveedor del usuario logueado. */
export async function startConnection(userId) {
  const providerId = await providerIdFor(userId);
  return buildAuthorizationUrl(providerId);
}

/**
 * Desconecta la cuenta. Los cobros vuelven al circuito de la plataforma: se
 * acredita saldo y se retira por CBU, como antes de conectar.
 */
export async function disconnect(userId) {
  const providerId = await providerIdFor(userId);
  const account = await accounts.findByProvider(providerId);
  if (!account) throw Errors.notFound('No hay ninguna cuenta conectada.');

  await accounts.markStatus(account.id, 'revoked');
  logger.info(`[mp-oauth] proveedor ${providerId} desconectó su cuenta`);
  return { disconnected: true };
}
