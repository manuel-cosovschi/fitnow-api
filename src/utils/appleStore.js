// src/utils/appleStore.js
//
// Verificación de los JWS que firma Apple: las transacciones de StoreKit 2
// (Transaction.jwsRepresentation) y las App Store Server Notifications v2.
//
// Los JWS de Apple vienen firmados con ES256 y traen la cadena de certificados
// completa en el header `x5c`: [hoja, intermedio, raíz]. Verificar de verdad
// implica tres cosas:
//   1. que la cadena esté bien encadenada y vigente,
//   2. que la raíz sea la Apple Root CA - G3 que tenemos fijada,
//   3. que la firma del JWS valide contra la clave pública de la hoja.
//
// El certificado raíz viene versionado en src/certs/AppleRootCA-G3.pem: es
// público (solo tiene la clave pública) y así el backend valida compras apenas
// se despliega, sin un paso de configuración que alguien pueda olvidarse.
// APPLE_ROOT_CA_G3 lo sobreescribe si Apple llega a rotar la raíz.
//
// Una cadena que no termina en esa raíz —por ejemplo la que genera la
// configuración local de StoreKit para probar en el simulador— no se rechaza
// acá: se devuelve como 'unverified' y es el servicio el que decide, aceptándola
// fuera de producción y rechazándola en producción.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BUNDLED_ROOT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'certs', 'AppleRootCA-G3.pem'
);

/**
 * Bundle id de la app iOS. Lo usan dos cosas distintas que tienen que estar de
 * acuerdo: el `aud` del identity token de Sign in with Apple y el `bundleId`
 * del comprobante de compra. Si no coincide con el PRODUCT_BUNDLE_IDENTIFIER
 * con el que se firma la app, ambas fallan.
 *
 * APNS_BUNDLE_ID queda como respaldo porque es lo que usaban los deploys
 * anteriores a que existiera APPLE_BUNDLE_ID.
 */
export function appBundleId() {
  return process.env.APPLE_BUNDLE_ID
      || process.env.APNS_BUNDLE_ID
      || 'com.manuelcosovschi.FitNow';
}

// ─── Helpers de base64url ────────────────────────────────────────────────────

function b64urlToBuffer(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function decodeSegment(segment) {
  return JSON.parse(b64urlToBuffer(segment).toString('utf8'));
}

/** Decodifica el payload sin verificar la firma. Solo para logs y tests. */
export function decodeJwsPayload(jws) {
  if (typeof jws !== 'string') throw new Error('El JWS debe ser un string.');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('JWS malformado: se esperaban 3 segmentos.');
  return decodeSegment(parts[1]);
}

// ─── Certificado raíz fijado ─────────────────────────────────────────────────

let cachedRoot;

/**
 * Raíz de Apple contra la que se fija la cadena: la de APPLE_ROOT_CA_G3 si está
 * configurada, si no la que viene en el repo. Acepta PEM o DER en base64.
 */
export function getPinnedRootCertificate() {
  if (cachedRoot !== undefined) return cachedRoot;

  const raw = (process.env.APPLE_ROOT_CA_G3 || '').trim();

  if (raw) {
    try {
      const pem = raw.includes('BEGIN CERTIFICATE')
        ? raw.replace(/\\n/g, '\n')
        : `-----BEGIN CERTIFICATE-----\n${raw.replace(/\s+/g, '')}\n-----END CERTIFICATE-----`;
      cachedRoot = new crypto.X509Certificate(pem);
      return cachedRoot;
    } catch (err) {
      throw new Error(`[apple] APPLE_ROOT_CA_G3 no es un certificado válido: ${err.message}`);
    }
  }

  try {
    cachedRoot = new crypto.X509Certificate(fs.readFileSync(BUNDLED_ROOT_PATH));
  } catch (err) {
    // Solo pasa si alguien borró el archivo del repo o el empaquetado se lo
    // comió. Sin raíz no se puede fijar nada, y el servicio lo trata como
    // comprobante no verificado.
    cachedRoot = null;
  }
  return cachedRoot;
}

/** Solo para tests: olvida el certificado cacheado. */
export function resetRootCertificateCache() {
  cachedRoot = undefined;
}

// ─── Verificación de la cadena ───────────────────────────────────────────────

function assertValidityWindow(cert, now) {
  const from = new Date(cert.validFrom);
  const to   = new Date(cert.validTo);
  if (now < from || now > to) {
    throw new Error(`Certificado fuera de vigencia: ${cert.subject}`);
  }
}

/**
 * Valida la cadena x5c y devuelve la hoja más el nivel de confianza alcanzado.
 * @returns {{ leaf: crypto.X509Certificate, verification: 'verified'|'unverified' }}
 */
function verifyCertificateChain(x5c, now = new Date()) {
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error('El header del JWS no trae una cadena x5c usable.');
  }

  const chain = x5c.map((b64) => new crypto.X509Certificate(
    Buffer.from(String(b64).replace(/\s+/g, ''), 'base64')
  ));

  for (const cert of chain) assertValidityWindow(cert, now);

  // Cada certificado tiene que estar firmado por el siguiente.
  for (let i = 0; i < chain.length - 1; i++) {
    const child  = chain[i];
    const issuer = chain[i + 1];
    if (!child.checkIssued(issuer) || !child.verify(issuer.publicKey)) {
      throw new Error('La cadena de certificados de Apple no encadena.');
    }
  }

  // La cadena encadena y las firmas validan; lo único que falta es saber si el
  // ancla es la raíz de Apple. Si no lo es, el comprobante no está probado —
  // decide el servicio si eso alcanza según el entorno.
  const root = chain[chain.length - 1];
  const pinned = getPinnedRootCertificate();
  const verification = pinned && root.raw.equals(pinned.raw) ? 'verified' : 'unverified';

  return { leaf: chain[0], verification };
}

/**
 * Verifica un JWS firmado por Apple y devuelve su payload.
 *
 * @param {string} jws
 * @param {{ now?: Date }} [options]
 * @returns {{ payload: object, verification: 'verified'|'unverified' }}
 */
export function verifyAppleJws(jws, { now = new Date() } = {}) {
  const parts = String(jws).split('.');
  if (parts.length !== 3) throw new Error('JWS malformado: se esperaban 3 segmentos.');

  const header = decodeSegment(parts[0]);
  if (header.alg !== 'ES256') {
    throw new Error(`Algoritmo de firma inesperado: ${header.alg}`);
  }

  const { leaf, verification } = verifyCertificateChain(header.x5c, now);

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
  const signature    = b64urlToBuffer(parts[2]);

  // Los JWS usan la firma cruda R||S, no el DER que espera OpenSSL por defecto.
  const ok = crypto.verify(
    'sha256',
    signingInput,
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!ok) throw new Error('La firma del JWS de Apple no valida.');

  return { payload: decodeSegment(parts[1]), verification };
}

// ─── Traducción del payload al modelo de FitNow ──────────────────────────────

/** Estados de Apple que cortan el acceso al instante. */
const REVOKED_REASONS = new Set([0, 1]);

/**
 * Convierte una transacción decodificada de StoreKit 2 en los campos que
 * guardamos en la tabla `subscriptions`.
 *
 * @param {object} tx      JWSTransactionDecodedPayload
 * @param {object} [renewal] JWSRenewalInfoDecodedPayload (opcional)
 */
export function transactionToSubscription(tx, renewal = null, now = new Date()) {
  const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null;
  const revokedAt = tx.revocationDate ? new Date(tx.revocationDate) : null;

  let status;
  if (revokedAt || REVOKED_REASONS.has(tx.revocationReason)) {
    status = 'revoked';
  } else if (!expiresAt || expiresAt > now) {
    status = 'active';
  } else if (renewal?.gracePeriodExpiresDate && new Date(renewal.gracePeriodExpiresDate) > now) {
    status = 'grace';
  } else {
    status = 'expired';
  }

  return {
    platform: 'apple',
    product_id: tx.productId,
    status,
    original_transaction_id: tx.originalTransactionId ?? tx.transactionId ?? null,
    latest_transaction_id: tx.transactionId ?? null,
    environment: String(tx.environment || '').toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    auto_renew: renewal ? renewal.autoRenewStatus === 1 : true,
    started_at: tx.originalPurchaseDate ? new Date(tx.originalPurchaseDate) : null,
    expires_at: expiresAt,
    revoked_at: revokedAt,
    raw_payload: tx,
  };
}
