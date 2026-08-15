import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { requirePremium, attachEntitlement, premiumRequired } from '../../src/middleware/entitlements.js';
import { getEntitlement } from '../../src/services/subscription.service.js';
import { PREMIUM_FEATURES, FREE_RUN_LIMIT_M } from '../../src/config/plans.js';

const PREMIUM_ROW = {
  id: 1,
  user_id: 7,
  platform: 'apple',
  product_id: 'com.fitnow.plus.monthly',
  status: 'active',
  expires_at: new Date(Date.now() + 86_400_000),
  auto_renew: true,
  environment: 'production',
};

function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => resolve(err));
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('getEntitlement', () => {
  it('devuelve free cuando el usuario no tiene suscripción', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(null);
    const ent = await getEntitlement(7);
    expect(ent.plan).toBe('free');
    expect(ent.run_max_distance_m).toBe(FREE_RUN_LIMIT_M);
    expect(ent.ai_enabled).toBe(false);
  });

  it('devuelve premium con una suscripción vigente', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(PREMIUM_ROW);
    const ent = await getEntitlement(7);
    expect(ent.plan).toBe('premium');
    expect(ent.run_max_distance_m).toBeNull();
    expect(ent.ai_enabled).toBe(true);
    expect(ent.source).toBe('apple');
  });

  it('no da premium por un producto que no está en el catálogo', async () => {
    subsRepo.findActiveByUser.mockResolvedValue({ ...PREMIUM_ROW, product_id: 'com.otra.app.pro' });
    const ent = await getEntitlement(7);
    expect(ent.plan).toBe('free');
  });

  it('sin usuario devuelve free sin tocar la base', async () => {
    const ent = await getEntitlement(null);
    expect(ent.plan).toBe('free');
    expect(subsRepo.findActiveByUser).not.toHaveBeenCalled();
  });
});

describe('requirePremium', () => {
  it('deja pasar a un usuario premium', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(PREMIUM_ROW);
    const req = { user: { id: 7 } };
    const err = await runMiddleware(requirePremium(PREMIUM_FEATURES.AI_COACH), req);
    expect(err).toBeUndefined();
    expect(req.entitlement.plan).toBe('premium');
  });

  it('corta a un usuario free con 402 y la función que se intentó usar', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(null);
    const err = await runMiddleware(requirePremium(PREMIUM_FEATURES.AI_COACH), { user: { id: 7 } });
    expect(err.status).toBe(402);
    expect(err.code).toBe('PREMIUM_REQUIRED');
    expect(err.fields.feature).toBe('ai_coach');
  });

  it('reutiliza el entitlement ya resuelto en la request', async () => {
    const req = { user: { id: 7 }, entitlement: { plan: 'premium' } };
    const err = await runMiddleware(requirePremium(PREMIUM_FEATURES.AI_COACH), req);
    expect(err).toBeUndefined();
    expect(subsRepo.findActiveByUser).not.toHaveBeenCalled();
  });

  it('usa el mensaje personalizado en el error', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(null);
    const err = await runMiddleware(
      requirePremium(PREMIUM_FEATURES.AI_COACH, 'El Coach IA es parte de FitNow+.'),
      { user: { id: 7 } }
    );
    expect(err.message).toBe('El Coach IA es parte de FitNow+.');
  });
});

describe('attachEntitlement', () => {
  it('resuelve el plan del usuario autenticado', async () => {
    subsRepo.findActiveByUser.mockResolvedValue(PREMIUM_ROW);
    const req = { user: { id: 7 } };
    await runMiddleware(attachEntitlement, req);
    expect(req.entitlement.plan).toBe('premium');
  });

  it('deja free a un request sin sesión', async () => {
    const req = {};
    await runMiddleware(attachEntitlement, req);
    expect(req.entitlement.plan).toBe('free');
    expect(req.entitlement.run_max_distance_m).toBe(FREE_RUN_LIMIT_M);
  });
});

describe('premiumRequired', () => {
  it('arma un 402 con código PREMIUM_REQUIRED', () => {
    const err = premiumRequired(PREMIUM_FEATURES.RUN_UNLIMITED);
    expect(err.status).toBe(402);
    expect(err.code).toBe('PREMIUM_REQUIRED');
    expect(err.fields.feature).toBe('run_unlimited');
  });
});
