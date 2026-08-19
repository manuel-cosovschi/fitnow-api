import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  query:    vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

import { query, queryOne } from '../../src/db.js';
import { creditEnrollment, getBalance } from '../../src/services/providerFinance.service.js';

const ENROLLMENT = { id: 7, price_paid: 10000, provider_id: 3, title: 'Funcional AM' };

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
});

describe('creditEnrollment', () => {
  it('anota el movimiento como deuda de la plataforma por defecto', async () => {
    queryOne.mockResolvedValue(ENROLLMENT);

    const result = await creditEnrollment(7);

    expect(result).toMatchObject({ provider_id: 3, amount: 9000, settlement: 'platform' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('provider_ledger');
    expect(params).toContain('platform');
    expect(params).toContain(9000);   // neto para el proveedor
    expect(params).toContain(1000);   // comisión de la plataforma
  });

  it('marca como directo el cobro que fue a la cuenta del proveedor', async () => {
    queryOne.mockResolvedValue(ENROLLMENT);

    const result = await creditEnrollment(7, { settlement: 'direct', gateway_ref: 'mp-123' });

    expect(result.settlement).toBe('direct');
    const [, params] = query.mock.calls[0];
    expect(params).toContain('direct');
    expect(params).toContain('mp-123');
    // El texto del movimiento distingue los dos casos para el historial.
    expect(params.some((p) => String(p).startsWith('Cobro directo'))).toBe(true);
  });

  it('no anota nada si la inscripción no tiene proveedor o fue gratis', async () => {
    queryOne.mockResolvedValue({ ...ENROLLMENT, provider_id: null });
    expect(await creditEnrollment(7)).toBeNull();

    queryOne.mockResolvedValue({ ...ENROLLMENT, price_paid: 0 });
    expect(await creditEnrollment(7)).toBeNull();

    expect(query).not.toHaveBeenCalled();
  });

  it('un fallo al anotar no rompe la activación de la inscripción', async () => {
    queryOne.mockResolvedValue(ENROLLMENT);
    query.mockRejectedValue(new Error('base caída'));
    // El pago ya se cobró: perder el asiento contable es malo, pero dejar al
    // usuario sin su inscripción es peor.
    await expect(creditEnrollment(7)).resolves.toBeNull();
  });
});

describe('getBalance', () => {
  // queryOne se llama en orden: usuario → deuda de plataforma → cobros directos → retiros
  function mockBalance({ owed, direct, holds }) {
    queryOne
      .mockResolvedValueOnce({ provider_id: 3 })
      .mockResolvedValueOnce(owed)
      .mockResolvedValueOnce(direct)
      .mockResolvedValueOnce(holds);
  }

  it('lo cobrado directo NO suma al saldo retirable', async () => {
    mockBalance({
      owed:   { total: 5000,  commission: 500,  movements: 2 },
      direct: { total: 30000, commission: 3000, movements: 6 },
      holds:  { total: 0 },
    });

    const balance = await getBalance(1);

    // Es el punto de todo esto: si los 30 000 que el proveedor ya cobró en su
    // cuenta contaran como saldo, se le terminaría pagando dos veces.
    expect(balance.available).toBe(5000);
    expect(balance.direct_total).toBe(30000);
    expect(balance.direct_movements).toBe(6);
  });

  it('descuenta los retiros pedidos o ya pagados', async () => {
    mockBalance({
      owed:   { total: 5000, commission: 500, movements: 2 },
      direct: { total: 0,    commission: 0,   movements: 0 },
      holds:  { total: 2000 },
    });

    const balance = await getBalance(1);
    expect(balance.available).toBe(3000);
    expect(balance.withdrawn_or_pending).toBe(2000);
  });

  it('la comisión informada junta los dos circuitos', async () => {
    mockBalance({
      owed:   { total: 5000,  commission: 500,  movements: 2 },
      direct: { total: 30000, commission: 3000, movements: 6 },
      holds:  { total: 0 },
    });

    const balance = await getBalance(1);
    expect(balance.commission_total).toBe(3500);
    expect(balance.movements).toBe(8);
  });

  it('un proveedor que cobra todo directo no tiene nada que retirar', async () => {
    mockBalance({
      owed:   { total: 0,     commission: 0,    movements: 0 },
      direct: { total: 45000, commission: 4500, movements: 9 },
      holds:  { total: 0 },
    });

    const balance = await getBalance(1);
    expect(balance.available).toBe(0);
    expect(balance.direct_total).toBe(45000);
  });
});
