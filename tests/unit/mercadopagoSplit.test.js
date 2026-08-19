import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  query:    vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/repositories/payoutAccount.repository.js', () => ({
  findConnected:   vi.fn(),
  findByEnrollment: vi.fn(),
  findByProvider:  vi.fn(),
  upsert:          vi.fn(),
  updateTokens:    vi.fn(),
  markStatus:      vi.fn(),
}));

vi.mock('../../src/services/mercadopagoOAuth.service.js', () => ({
  ensureFreshAccount: vi.fn(async (account) => account),
  isConfigured: vi.fn(() => true),
}));

vi.mock('../../src/services/providerFinance.service.js', () => ({
  creditEnrollment: vi.fn(),
  commissionPct:    vi.fn(() => 10),
  splitAmount:      vi.fn((gross) => ({
    gross,
    commission: Math.round(gross * 10) / 100,
    net: Math.round(gross * 90) / 100,
  })),
}));

import { query, queryOne, transaction } from '../../src/db.js';
import * as payoutAccounts from '../../src/repositories/payoutAccount.repository.js';
import { createMpPreference, handleMpWebhook } from '../../src/services/payments.service.js';

const ACTIVITY = { id: 5, title: 'Spinning 19h', price: 10000, status: 'active', provider_id: 3 };

const CONNECTED = {
  id: 1, provider_id: 3, access_token: 'APP_USR-token-del-proveedor',
  status: 'connected', expires_at: null,
};

let fetchMock;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-token-de-la-plataforma';
  process.env.APP_BASE_URL = 'https://api.fitnow.test';

  queryOne.mockResolvedValue(ACTIVITY);
  const inserted = [];
  inserted.insertId = 77;
  query.mockResolvedValue(inserted);

  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ id: 'pref-1', init_point: 'https://mp.test/checkout' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

function preferenceCall() {
  const [url, options] = fetchMock.mock.calls[0];
  return { url, headers: options.headers, body: JSON.parse(options.body) };
}

describe('createMpPreference — proveedor con cuenta conectada', () => {
  beforeEach(() => { payoutAccounts.findConnected.mockResolvedValue(CONNECTED); });

  it('cobra con el token del proveedor, no con el de la plataforma', async () => {
    await createMpPreference(9, { activity_id: 5 });
    const { headers } = preferenceCall();
    expect(headers.Authorization).toBe('Bearer APP_USR-token-del-proveedor');
  });

  it('manda la comisión como marketplace_fee', async () => {
    const { commission_pct } = await createMpPreference(9, { activity_id: 5 });
    const { body } = preferenceCall();
    // 10 % de 10 000: lo cobra MP y lo deposita en la cuenta de la plataforma.
    expect(body.marketplace_fee).toBe(1000);
    expect(commission_pct).toBe(10);
  });

  it('informa que el cobro es directo', async () => {
    const result = await createMpPreference(9, { activity_id: 5 });
    expect(result.settlement).toBe('direct');
  });

  it('el webhook puede resolver la inscripción desde la URL de aviso', async () => {
    await createMpPreference(9, { activity_id: 5 });
    const { body } = preferenceCall();
    // Sin esto el webhook no sabría con qué token consultar el pago.
    expect(body.notification_url).toContain('enrollment_id=77');
    expect(body.external_reference).toBe('77');
  });
});

describe('createMpPreference — proveedor sin cuenta conectada', () => {
  beforeEach(() => { payoutAccounts.findConnected.mockResolvedValue(null); });

  it('cobra con el token de la plataforma', async () => {
    await createMpPreference(9, { activity_id: 5 });
    expect(preferenceCall().headers.Authorization).toBe('Bearer APP_USR-token-de-la-plataforma');
  });

  it('no manda marketplace_fee: la comisión se descuenta del saldo', async () => {
    await createMpPreference(9, { activity_id: 5 });
    expect(preferenceCall().body.marketplace_fee).toBeUndefined();
  });

  it('informa que la liquidación queda a cargo de la plataforma', async () => {
    const result = await createMpPreference(9, { activity_id: 5 });
    expect(result.settlement).toBe('platform');
  });

  it('falla claro si tampoco hay token de plataforma', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    await expect(createMpPreference(9, { activity_id: 5 }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('createMpPreference — errores de MercadoPago', () => {
  beforeEach(() => { payoutAccounts.findConnected.mockResolvedValue(CONNECTED); });

  it('no deja pasar una preferencia rechazada', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid marketplace_fee' });
    await expect(createMpPreference(9, { activity_id: 5 }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

describe('handleMpWebhook — con qué token consulta el pago', () => {
  beforeEach(() => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;   // sin secreto no se verifica la firma
    transaction.mockResolvedValue(null);             // el resto del efecto no importa acá
  });

  function mockPayment(status = 'approved') {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status, external_reference: '77' }),
    });
  }

  it('usa el token del proveedor cuando el cobro fue directo', async () => {
    payoutAccounts.findByEnrollment.mockResolvedValue(CONNECTED);
    mockPayment();

    await handleMpWebhook({ type: 'payment', data: { id: '123' } }, { enrollment_id: '77' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/payments/123');
    expect(options.headers.Authorization).toBe('Bearer APP_USR-token-del-proveedor');
  });

  it('cae al token de la plataforma si el proveedor no tiene cuenta', async () => {
    payoutAccounts.findByEnrollment.mockResolvedValue(null);
    mockPayment();

    await handleMpWebhook({ type: 'payment', data: { id: '123' } }, { enrollment_id: '77' });

    expect(fetchMock.mock.calls[0][1].headers.Authorization)
      .toBe('Bearer APP_USR-token-de-la-plataforma');
  });

  it('sirve para los cobros viejos, sin enrollment en la URL', async () => {
    payoutAccounts.findByEnrollment.mockResolvedValue(null);
    mockPayment();

    await handleMpWebhook({ type: 'payment', data: { id: '123' } }, {});

    expect(payoutAccounts.findByEnrollment).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('no hace nada si el aviso no es de un pago', async () => {
    await handleMpWebhook({ type: 'plan', data: { id: '123' } }, {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora un pago que MercadoPago no aprobó', async () => {
    payoutAccounts.findByEnrollment.mockResolvedValue(CONNECTED);
    mockPayment('rejected');

    await handleMpWebhook({ type: 'payment', data: { id: '123' } }, { enrollment_id: '77' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('no explota si MercadoPago no deja leer el pago', async () => {
    payoutAccounts.findByEnrollment.mockResolvedValue(CONNECTED);
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      handleMpWebhook({ type: 'payment', data: { id: '123' } }, { enrollment_id: '77' })
    ).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });
});
