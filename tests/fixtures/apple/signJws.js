// tests/fixtures/apple/signJws.js
//
// Arma JWS firmados como los de Apple usando una cadena de certificados de
// prueba (root → intermediate → leaf). Sirve para probar la verificación real
// sin depender de un recibo de producción.
//
// La cadena se genera con openssl la primera vez que se corren los tests y
// queda cacheada en .generated/ (ignorada por git): así no hay claves privadas
// versionadas, aunque sean de juguete.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const DIR       = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(DIR, '.generated');

function openssl(args, options = {}) {
  return execFileSync('openssl', args, { cwd: CACHE_DIR, stdio: 'pipe', ...options });
}

function generateChain() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const ec = (out) => openssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', out]);

  // Raíz: se hace pasar por la Apple Root CA - G3 para ejercitar el pinning.
  ec('root.key');
  openssl(['req', '-new', '-x509', '-key', 'root.key', '-sha256', '-days', '7300',
           '-out', 'root.pem', '-subj', '/C=US/O=Apple Inc./CN=Apple Root CA - G3']);

  ec('intermediate.key');
  openssl(['req', '-new', '-key', 'intermediate.key', '-out', 'intermediate.csr',
           '-subj', '/C=US/O=Apple Inc./CN=Apple WWDR Certification Authority']);
  fs.writeFileSync(path.join(CACHE_DIR, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\n');
  openssl(['x509', '-req', '-in', 'intermediate.csr', '-CA', 'root.pem', '-CAkey', 'root.key',
           '-CAcreateserial', '-out', 'intermediate.pem', '-days', '7300', '-sha256',
           '-extfile', 'ca.ext']);

  ec('leaf.key');
  openssl(['req', '-new', '-key', 'leaf.key', '-out', 'leaf.csr',
           '-subj', '/C=US/O=Apple Inc./CN=prod.itunes.apple.com']);
  openssl(['x509', '-req', '-in', 'leaf.csr', '-CA', 'intermediate.pem', '-CAkey', 'intermediate.key',
           '-CAcreateserial', '-out', 'leaf.pem', '-days', '7300', '-sha256']);

  // Otra raíz que también dice llamarse Apple Root CA - G3, para comprobar que
  // el pinning rechaza cadenas ajenas aunque el nombre coincida.
  ec('other-root.key');
  openssl(['req', '-new', '-x509', '-key', 'other-root.key', '-sha256', '-days', '7300',
           '-out', 'other-root.pem', '-subj', '/C=US/O=Impostor/CN=Apple Root CA - G3']);
}

function ensureChain() {
  const expected = ['root.pem', 'intermediate.pem', 'leaf.pem', 'leaf.key',
                    'intermediate.key', 'other-root.pem'];
  const complete = expected.every((f) => fs.existsSync(path.join(CACHE_DIR, f)));
  if (complete) return;

  try {
    generateChain();
  } catch (err) {
    throw new Error(
      `No se pudo generar la cadena de certificados de prueba con openssl: ${err.message}`
    );
  }
}

ensureChain();

const read = (file) => fs.readFileSync(path.join(CACHE_DIR, file), 'utf8');

export const ROOT_PEM       = read('root.pem');
export const OTHER_ROOT_PEM = read('other-root.pem');
/** Clave que NO corresponde a la hoja: sirve para probar firmas inválidas. */
export const WRONG_KEY      = read('intermediate.key');

const INTERMEDIATE_PEM      = read('intermediate.pem');
const LEAF_PEM              = read('leaf.pem');
const LEAF_KEY              = read('leaf.key');

/** PEM → base64 del DER, que es lo que va en el header x5c. */
function pemToB64(pem) {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
}

export const CHAIN = [LEAF_PEM, INTERMEDIATE_PEM, ROOT_PEM].map(pemToB64);

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Firma un payload como lo hace Apple: ES256 + cadena x5c en el header.
 * @param {object} payload
 * @param {{ x5c?: string[], key?: string, alg?: string }} [options]
 */
export function signAppleJws(payload, { x5c = CHAIN, key = LEAF_KEY, alg = 'ES256' } = {}) {
  const header  = b64url(JSON.stringify({ alg, x5c }));
  const body    = b64url(JSON.stringify(payload));
  const signing = Buffer.from(`${header}.${body}`, 'ascii');

  const signature = crypto.sign('sha256', signing, { key, dsaEncoding: 'ieee-p1363' });

  return `${header}.${body}.${b64url(signature)}`;
}

/** Transacción de StoreKit 2 con los campos que mira el servicio. */
export function makeTransaction(overrides = {}) {
  const now = Date.now();
  return {
    transactionId: '2000000123456789',
    originalTransactionId: '2000000111111111',
    bundleId: 'com.fitnow.app',
    productId: 'com.fitnow.plus.monthly',
    purchaseDate: now,
    originalPurchaseDate: now,
    expiresDate: now + 30 * 24 * 60 * 60 * 1000,
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    environment: 'Sandbox',
    ...overrides,
  };
}
