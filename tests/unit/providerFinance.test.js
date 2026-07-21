import { describe, it, expect, vi } from 'vitest';

// Sin base de datos: probamos la matemática pura de la comisión.
vi.mock('../../src/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));

import { splitAmount, commissionPct } from '../../src/services/providerFinance.service.js';

describe('comisión de la plataforma', () => {
  it('divide el cobro en comisión y neto con la comisión por defecto (10 %)', () => {
    const { gross, commission, net } = splitAmount(12000);
    expect(gross).toBe(12000);
    expect(commission).toBe(1200);
    expect(net).toBe(10800);
  });

  it('redondea a dos decimales sin perder plata', () => {
    const { gross, commission, net } = splitAmount(999.99);
    expect(Math.round((commission + net) * 100) / 100).toBe(gross);
  });

  it('una comisión inválida por entorno cae al 10 %', () => {
    const prev = process.env.PLATFORM_COMMISSION_PCT;
    process.env.PLATFORM_COMMISSION_PCT = 'nada';
    expect(commissionPct()).toBe(10);
    process.env.PLATFORM_COMMISSION_PCT = '15';
    expect(commissionPct()).toBe(15);
    if (prev === undefined) delete process.env.PLATFORM_COMMISSION_PCT;
    else process.env.PLATFORM_COMMISSION_PCT = prev;
  });
});
