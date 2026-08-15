import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  verifyAppleJws,
  decodeJwsPayload,
  transactionToSubscription,
  resetRootCertificateCache,
  appBundleId,
} from '../../src/utils/appleStore.js';
import {
  signAppleJws,
  makeTransaction,
  CHAIN,
  ROOT_PEM,
  OTHER_ROOT_PEM,
  WRONG_KEY,
} from '../fixtures/apple/signJws.js';

const ORIGINAL_ENV = process.env.APPLE_ROOT_CA_G3;

beforeEach(() => {
  delete process.env.APPLE_ROOT_CA_G3;
  resetRootCertificateCache();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.APPLE_ROOT_CA_G3;
  else process.env.APPLE_ROOT_CA_G3 = ORIGINAL_ENV;
  resetRootCertificateCache();
});

describe('verifyAppleJws', () => {
  it('acepta un JWS bien firmado y devuelve el payload', () => {
    const tx = makeTransaction();
    const { payload, verification } = verifyAppleJws(signAppleJws(tx));
    expect(payload.transactionId).toBe(tx.transactionId);
    expect(payload.productId).toBe('com.fitnow.plus.monthly');
    // Sin raíz configurada la cadena valida pero no queda fijada.
    expect(verification).toBe('unverified');
  });

  it('marca verified cuando la raíz configurada es la de la cadena', () => {
    process.env.APPLE_ROOT_CA_G3 = ROOT_PEM;
    resetRootCertificateCache();
    const { verification } = verifyAppleJws(signAppleJws(makeTransaction()));
    expect(verification).toBe('verified');
  });

  it('rechaza una cadena que no termina en la raíz configurada', () => {
    process.env.APPLE_ROOT_CA_G3 = OTHER_ROOT_PEM;
    resetRootCertificateCache();
    expect(() => verifyAppleJws(signAppleJws(makeTransaction())))
      .toThrow(/no es el certificado de Apple configurado/);
  });

  it('rechaza un payload alterado después de firmar', () => {
    const jws = signAppleJws(makeTransaction());
    const [header, , signature] = jws.split('.');
    const tampered = Buffer.from(JSON.stringify(makeTransaction({ expiresDate: Date.now() + 10 ** 12 })))
      .toString('base64url');
    expect(() => verifyAppleJws(`${header}.${tampered}.${signature}`))
      .toThrow(/no valida/);
  });

  it('rechaza una firma que no corresponde al certificado hoja', () => {
    // Cadena válida, pero firmado con la clave del intermedio en vez de la hoja.
    const jws = signAppleJws(makeTransaction(), { key: WRONG_KEY });
    expect(() => verifyAppleJws(jws)).toThrow(/no valida/);
  });

  it('rechaza un JWS sin cadena de certificados', () => {
    expect(() => verifyAppleJws(signAppleJws(makeTransaction(), { x5c: [] })))
      .toThrow(/cadena x5c/);
  });

  it('rechaza una cadena a la que le falta el intermedio', () => {
    expect(() => verifyAppleJws(signAppleJws(makeTransaction(), { x5c: [CHAIN[0], CHAIN[2]] })))
      .toThrow(/no encadena/);
  });

  it('rechaza algoritmos que no sean ES256', () => {
    const jws = signAppleJws(makeTransaction(), { alg: 'HS256' });
    expect(() => verifyAppleJws(jws)).toThrow(/Algoritmo de firma inesperado/);
  });

  it('rechaza un JWS malformado', () => {
    expect(() => verifyAppleJws('no-es-un-jws')).toThrow(/malformado/);
  });
});

describe('decodeJwsPayload', () => {
  it('lee el payload sin validar la firma', () => {
    const jws = signAppleJws(makeTransaction({ productId: 'com.fitnow.plus.annual' }));
    expect(decodeJwsPayload(jws).productId).toBe('com.fitnow.plus.annual');
  });
});

describe('transactionToSubscription', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('marca activa una compra con vencimiento futuro', () => {
    const sub = transactionToSubscription(
      makeTransaction({ expiresDate: now.getTime() + 86_400_000 }), null, now
    );
    expect(sub.status).toBe('active');
    expect(sub.platform).toBe('apple');
    expect(sub.environment).toBe('sandbox');
    expect(sub.original_transaction_id).toBe('2000000111111111');
  });

  it('marca vencida una compra pasada de fecha', () => {
    const sub = transactionToSubscription(
      makeTransaction({ expiresDate: now.getTime() - 86_400_000 }), null, now
    );
    expect(sub.status).toBe('expired');
  });

  it('respeta el período de gracia de Apple', () => {
    const sub = transactionToSubscription(
      makeTransaction({ expiresDate: now.getTime() - 86_400_000 }),
      { gracePeriodExpiresDate: now.getTime() + 86_400_000, autoRenewStatus: 1 },
      now
    );
    expect(sub.status).toBe('grace');
  });

  it('corta el acceso ante un reembolso aunque la fecha sea futura', () => {
    const sub = transactionToSubscription(
      makeTransaction({
        expiresDate: now.getTime() + 30 * 86_400_000,
        revocationDate: now.getTime() - 3600_000,
        revocationReason: 1,
      }),
      null,
      now
    );
    expect(sub.status).toBe('revoked');
    expect(sub.revoked_at).toBeInstanceOf(Date);
  });

  it('toma el estado de renovación automática del renewal info', () => {
    const activa = transactionToSubscription(makeTransaction(), { autoRenewStatus: 1 }, now);
    const dadaDeBaja = transactionToSubscription(makeTransaction(), { autoRenewStatus: 0 }, now);
    expect(activa.auto_renew).toBe(true);
    expect(dadaDeBaja.auto_renew).toBe(false);
  });

  it('lee production cuando la compra no es de sandbox', () => {
    const sub = transactionToSubscription(makeTransaction({ environment: 'Production' }), null, now);
    expect(sub.environment).toBe('production');
  });
});

describe('appBundleId', () => {
  const ORIGINAL = {
    apple: process.env.APPLE_BUNDLE_ID,
    apns:  process.env.APNS_BUNDLE_ID,
  };

  beforeEach(() => {
    delete process.env.APPLE_BUNDLE_ID;
    delete process.env.APNS_BUNDLE_ID;
  });

  afterEach(() => {
    for (const [key, value] of [['APPLE_BUNDLE_ID', ORIGINAL.apple], ['APNS_BUNDLE_ID', ORIGINAL.apns]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('usa APPLE_BUNDLE_ID cuando está configurado', () => {
    process.env.APPLE_BUNDLE_ID = 'com.ejemplo.app';
    process.env.APNS_BUNDLE_ID  = 'com.viejo.app';
    expect(appBundleId()).toBe('com.ejemplo.app');
  });

  it('cae en APNS_BUNDLE_ID para no romper los deploys viejos', () => {
    process.env.APNS_BUNDLE_ID = 'com.viejo.app';
    expect(appBundleId()).toBe('com.viejo.app');
  });

  it('por defecto usa el bundle con el que se firma la app', () => {
    expect(appBundleId()).toBe('com.manuelcosovschi.FitNow');
  });
});
