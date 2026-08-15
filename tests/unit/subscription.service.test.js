import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/repositories/subscription.repository.js', () => ({
  findActiveByUser: vi.fn(),
  findAllByUser: vi.fn(),
  findByOriginalTransactionId: vi.fn(),
  findByPurchaseToken: vi.fn(),
  upsert: vi.fn(),
  updateStatus: vi.fn(),
  recordNotification: vi.fn(),
  findById: vi.fn(),
}));

import * as subsRepo from '../../src/repositories/subscription.repository.js';
import * as service from '../../src/services/subscription.service.js';
import { resetRootCertificateCache } from '../../src/utils/appleStore.js';
import { signAppleJws, makeTransaction, ROOT_PEM } from '../fixtures/apple/signJws.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  process.env.APPLE_ROOT_CA_G3 = ROOT_PEM;
  process.env.APPLE_BUNDLE_ID = 'com.fitnow.app';
  delete process.env.ALLOW_UNVERIFIED_RECEIPTS;
  resetRootCertificateCache();

  subsRepo.findByOriginalTransactionId.mockResolvedValue(null);
  subsRepo.upsert.mockImplementation(async (fields) => ({ id: 1, ...fields }));
  subsRepo.findActiveByUser.mockResolvedValue(null);
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.APPLE_ROOT_CA_G3;
  resetRootCertificateCache();
});

describe('verifyAppleTransaction', () => {
  it('guarda la compra y devuelve el entitlement premium', async () => {
    const jws = signAppleJws(makeTransaction());
    // Después del upsert, el usuario ya tiene suscripción activa.
    subsRepo.findActiveByUser.mockResolvedValue({
      platform: 'apple',
      product_id: 'com.fitnow.plus.monthly',
      status: 'active',
      expires_at: new Date(Date.now() + 86_400_000),
      auto_renew: true,
      environment: 'sandbox',
    });

    const entitlement = await service.verifyAppleTransaction(7, { signed_transaction: jws });

    expect(subsRepo.upsert).toHaveBeenCalledOnce();
    const saved = subsRepo.upsert.mock.calls[0][0];
    expect(saved.user_id).toBe(7);
    expect(saved.platform).toBe('apple');
    expect(saved.status).toBe('active');
    expect(saved.verification).toBe('verified');
    expect(entitlement.plan).toBe('premium');
  });

  it('rechaza un comprobante de otra app', async () => {
    const jws = signAppleJws(makeTransaction({ bundleId: 'com.otra.app' }));
    await expect(service.verifyAppleTransaction(7, { signed_transaction: jws }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(subsRepo.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un producto que no está en el catálogo', async () => {
    const jws = signAppleJws(makeTransaction({ productId: 'com.fitnow.otracosa' }));
    await expect(service.verifyAppleTransaction(7, { signed_transaction: jws }))
      .rejects.toThrow(/Producto desconocido/);
  });

  it('rechaza un JWS inválido sin filtrar el detalle interno', async () => {
    await expect(service.verifyAppleTransaction(7, { signed_transaction: 'a.b.c' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'El comprobante de compra no es válido.' });
  });

  it('no deja canjear una suscripción ya asociada a otra cuenta', async () => {
    subsRepo.findByOriginalTransactionId.mockResolvedValue({ id: 9, user_id: 42 });
    const jws = signAppleJws(makeTransaction());
    await expect(service.verifyAppleTransaction(7, { signed_transaction: jws }))
      .rejects.toMatchObject({ code: 'SUBSCRIPTION_ALREADY_CLAIMED', status: 409 });
  });

  it('deja re-canjear la misma suscripción al mismo usuario', async () => {
    subsRepo.findByOriginalTransactionId.mockResolvedValue({ id: 9, user_id: 7 });
    const jws = signAppleJws(makeTransaction());
    await expect(service.verifyAppleTransaction(7, { signed_transaction: jws })).resolves.toBeDefined();
    expect(subsRepo.upsert).toHaveBeenCalledOnce();
  });

  it('en producción rechaza el recibo si no está la raíz de Apple configurada', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APPLE_ROOT_CA_G3;
    resetRootCertificateCache();

    const jws = signAppleJws(makeTransaction());
    await expect(service.verifyAppleTransaction(7, { signed_transaction: jws }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(subsRepo.upsert).not.toHaveBeenCalled();
  });

  it('fuera de producción acepta el recibo sin raíz fijada y lo marca unverified', async () => {
    delete process.env.APPLE_ROOT_CA_G3;
    resetRootCertificateCache();

    const jws = signAppleJws(makeTransaction());
    await service.verifyAppleTransaction(7, { signed_transaction: jws });
    expect(subsRepo.upsert.mock.calls[0][0].verification).toBe('unverified');
  });

  it('pide el signed_transaction', async () => {
    await expect(service.verifyAppleTransaction(7, {})).rejects.toThrow(/signed_transaction/);
  });
});

describe('handleAppleNotification', () => {
  function notification(type, tx, extra = {}) {
    return signAppleJws({
      notificationType: type,
      notificationUUID: 'uuid-1',
      version: '2.0',
      signedDate: Date.now(),
      data: { signedTransactionInfo: signAppleJws(tx), ...extra },
    });
  }

  it('descarta las notificaciones repetidas', async () => {
    subsRepo.recordNotification.mockResolvedValue(false);
    const result = await service.handleAppleNotification(notification('DID_RENEW', makeTransaction()));
    expect(result.status).toBe('duplicate');
    expect(subsRepo.upsert).not.toHaveBeenCalled();
  });

  it('aplica una renovación sobre la suscripción existente', async () => {
    subsRepo.recordNotification.mockResolvedValue(true);
    subsRepo.findByOriginalTransactionId.mockResolvedValue({ id: 3, user_id: 7 });

    const result = await service.handleAppleNotification(notification('DID_RENEW', makeTransaction()));

    expect(result.status).toBe('ok');
    expect(subsRepo.upsert.mock.calls[0][0]).toMatchObject({ user_id: 7, status: 'active' });
  });

  it('un reembolso corta el acceso aunque la fecha de vencimiento sea futura', async () => {
    subsRepo.recordNotification.mockResolvedValue(true);
    subsRepo.findByOriginalTransactionId.mockResolvedValue({ id: 3, user_id: 7 });

    await service.handleAppleNotification(notification('REFUND', makeTransaction()));

    expect(subsRepo.upsert.mock.calls[0][0].status).toBe('revoked');
  });

  it('ignora una notificación de una compra que no tenemos asociada', async () => {
    subsRepo.recordNotification.mockResolvedValue(true);
    subsRepo.findByOriginalTransactionId.mockResolvedValue(null);

    const result = await service.handleAppleNotification(notification('DID_RENEW', makeTransaction()));
    expect(result.status).toBe('ignored');
    expect(subsRepo.upsert).not.toHaveBeenCalled();
  });

  it('rechaza una notificación que no verifica', async () => {
    await expect(service.handleAppleNotification('a.b.c'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('handleGoogleNotification', () => {
  function pubsub(payload, messageId = 'msg-1') {
    return { message: { messageId, data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
  }

  it('descarta las notificaciones repetidas', async () => {
    subsRepo.recordNotification.mockResolvedValue(false);
    const result = await service.handleGoogleNotification(pubsub({
      subscriptionNotification: { notificationType: 2, purchaseToken: 'tok' },
    }));
    expect(result.status).toBe('duplicate');
  });

  it('ignora los mensajes que no son de suscripciones', async () => {
    const result = await service.handleGoogleNotification(pubsub({ testNotification: { version: '1.0' } }));
    expect(result.status).toBe('ignored');
  });

  it('pide el message.data', async () => {
    await expect(service.handleGoogleNotification({})).rejects.toThrow(/message.data/);
  });
});

describe('getPlanCatalog', () => {
  it('expone los dos planes con el tope del free', () => {
    const { plans, limits } = service.getPlanCatalog();
    expect(plans.map((p) => p.id)).toEqual(['free', 'premium']);
    expect(limits.run_max_distance_m).toBe(2000);

    const free = plans.find((p) => p.id === 'free');
    expect(free.features.find((f) => f.key === 'ai_coach').included).toBe(false);
    expect(free.features.find((f) => f.key === 'run_limited').label).toContain('2 km');

    const premium = plans.find((p) => p.id === 'premium');
    expect(premium.product_ids).toContain('com.fitnow.plus.monthly');
    expect(premium.features.every((f) => f.included)).toBe(true);
  });
});
