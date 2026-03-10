import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  updateMeSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../src/schemas/auth.schemas.js';
import {
  createActivitySchema,
  updateActivitySchema,
  addSessionSchema,
} from '../../src/schemas/activity.schemas.js';
import {
  createHazardSchema,
  nearQuerySchema,
} from '../../src/schemas/hazard.schemas.js';
import {
  createProviderSchema,
  setHoursSchema,
  addServiceSchema,
} from '../../src/schemas/provider.schemas.js';
import {
  startSessionSchema,
  pushTelemetrySchema,
  finishSessionSchema,
  submitFeedbackSchema,
} from '../../src/schemas/run.schemas.js';

// ── Auth schemas ──────────────────────────────────────────────────────────────

describe('registerSchema', () => {
  it('accepts valid data', () => {
    const r = registerSchema.safeParse({ name: 'Ana', email: 'ana@test.com', password: 'secret1' });
    expect(r.success).toBe(true);
  });
  it('rejects missing name', () => {
    const r = registerSchema.safeParse({ email: 'a@b.com', password: 'secret1' });
    expect(r.success).toBe(false);
  });
  it('rejects invalid email', () => {
    const r = registerSchema.safeParse({ name: 'Ana', email: 'not-an-email', password: 'secret1' });
    expect(r.success).toBe(false);
  });
  it('rejects password shorter than 6 chars', () => {
    const r = registerSchema.safeParse({ name: 'Ana', email: 'a@b.com', password: '123' });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/6/);
  });
  it('trims whitespace from name and email', () => {
    const r = registerSchema.safeParse({ name: '  Ana  ', email: '  ANA@TEST.COM  ', password: 'secret1' });
    expect(r.success).toBe(true);
    expect(r.data.name).toBe('Ana');
    expect(r.data.email).toBe('ANA@TEST.COM');
  });
});

describe('loginSchema', () => {
  it('accepts valid data', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: 'pass' });
    expect(r.success).toBe(true);
  });
  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepts partial update', () => {
    const r = updateMeSchema.safeParse({ name: 'Juan' });
    expect(r.success).toBe(true);
  });
  it('rejects unknown fields (strict)', () => {
    const r = updateMeSchema.safeParse({ name: 'Juan', unknown_field: 'x' });
    expect(r.success).toBe(false);
  });
  it('accepts null phone', () => {
    const r = updateMeSchema.safeParse({ phone: null });
    expect(r.success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  it('accepts valid data', () => {
    const r = changePasswordSchema.safeParse({ current_password: 'old', new_password: 'newpass' });
    expect(r.success).toBe(true);
  });
  it('rejects new password under 6 chars', () => {
    const r = changePasswordSchema.safeParse({ current_password: 'old', new_password: '123' });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'a@b.com' });
    expect(r.success).toBe(true);
  });
  it('rejects invalid email', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'not-email' });
    expect(r.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid data', () => {
    const r = resetPasswordSchema.safeParse({ token: 'abc123', new_password: 'newpass' });
    expect(r.success).toBe(true);
  });
  it('rejects empty token', () => {
    const r = resetPasswordSchema.safeParse({ token: '', new_password: 'newpass' });
    expect(r.success).toBe(false);
  });
});

// ── Activity schemas ──────────────────────────────────────────────────────────

describe('createActivitySchema', () => {
  it('accepts minimal valid data', () => {
    const r = createActivitySchema.safeParse({ title: 'Yoga matinal' });
    expect(r.success).toBe(true);
  });
  it('rejects negative price', () => {
    const r = createActivitySchema.safeParse({ title: 'Yoga', price: -5 });
    expect(r.success).toBe(false);
  });
  it('rejects invalid difficulty', () => {
    const r = createActivitySchema.safeParse({ title: 'Yoga', difficulty: 'ultra' });
    expect(r.success).toBe(false);
  });
  it('accepts valid difficulty values', () => {
    for (const d of ['beginner', 'intermediate', 'advanced', 'all_levels']) {
      expect(createActivitySchema.safeParse({ title: 'T', difficulty: d }).success).toBe(true);
    }
  });
  it('coerces string price to number', () => {
    const r = createActivitySchema.safeParse({ title: 'Yoga', price: '1500' });
    expect(r.success).toBe(true);
    expect(r.data.price).toBe(1500);
  });
});

describe('addSessionSchema', () => {
  it('accepts valid datetime strings', () => {
    const r = addSessionSchema.safeParse({
      start_at: '2026-06-01T09:00:00Z',
      end_at:   '2026-06-01T10:00:00Z',
    });
    expect(r.success).toBe(true);
  });
  it('rejects missing start_at', () => {
    const r = addSessionSchema.safeParse({ end_at: '2026-06-01T10:00:00Z' });
    expect(r.success).toBe(false);
  });
});

// ── Hazard schemas ────────────────────────────────────────────────────────────

describe('createHazardSchema', () => {
  it('accepts valid coordinates', () => {
    const r = createHazardSchema.safeParse({ lat: -34.6, lng: -58.4, type: 'dog' });
    expect(r.success).toBe(true);
  });
  it('rejects lat out of range', () => {
    const r = createHazardSchema.safeParse({ lat: 95, lng: 0, type: 'dog' });
    expect(r.success).toBe(false);
  });
  it('rejects lng out of range', () => {
    const r = createHazardSchema.safeParse({ lat: 0, lng: 200, type: 'dog' });
    expect(r.success).toBe(false);
  });
  it('rejects severity out of range', () => {
    const r = createHazardSchema.safeParse({ lat: 0, lng: 0, type: 'x', severity: 5 });
    expect(r.success).toBe(false);
  });
});

describe('nearQuerySchema', () => {
  it('accepts valid query', () => {
    const r = nearQuerySchema.safeParse({ lat: '-34.6', lng: '-58.4', radius_m: '500' });
    expect(r.success).toBe(true);
    expect(r.data.lat).toBe(-34.6);
  });
  it('rejects missing lat', () => {
    const r = nearQuerySchema.safeParse({ lng: '-58.4' });
    expect(r.success).toBe(false);
  });
});

// ── Provider schemas ──────────────────────────────────────────────────────────

describe('createProviderSchema', () => {
  it('accepts minimal data', () => {
    const r = createProviderSchema.safeParse({ name: 'CrossFit BsAs' });
    expect(r.success).toBe(true);
  });
  it('rejects invalid email', () => {
    const r = createProviderSchema.safeParse({ name: 'Gym', email: 'not-email' });
    expect(r.success).toBe(false);
  });
  it('rejects invalid website URL', () => {
    const r = createProviderSchema.safeParse({ name: 'Gym', website: 'not-a-url' });
    expect(r.success).toBe(false);
  });
});

describe('setHoursSchema', () => {
  it('accepts valid hours array', () => {
    const r = setHoursSchema.safeParse([
      { weekday: 1, open_time: '08:00', close_time: '20:00' },
    ]);
    expect(r.success).toBe(true);
  });
  it('rejects invalid time format', () => {
    const r = setHoursSchema.safeParse([
      { weekday: 1, open_time: '8am', close_time: '20:00' },
    ]);
    expect(r.success).toBe(false);
  });
  it('rejects weekday out of range', () => {
    const r = setHoursSchema.safeParse([
      { weekday: 8, open_time: '08:00', close_time: '20:00' },
    ]);
    expect(r.success).toBe(false);
  });
});

// ── Run schemas ───────────────────────────────────────────────────────────────

describe('pushTelemetrySchema', () => {
  const validPoint = {
    lat: -34.6,
    lng: -58.4,
    recorded_at: '2026-06-01T09:00:00Z',
  };
  it('accepts valid telemetry batch', () => {
    const r = pushTelemetrySchema.safeParse({ points: [validPoint] });
    expect(r.success).toBe(true);
  });
  it('rejects empty points array', () => {
    const r = pushTelemetrySchema.safeParse({ points: [] });
    expect(r.success).toBe(false);
  });
  it('rejects lat out of range in a point', () => {
    const r = pushTelemetrySchema.safeParse({ points: [{ ...validPoint, lat: 95 }] });
    expect(r.success).toBe(false);
  });
  it('rejects heart_rate above 300', () => {
    const r = pushTelemetrySchema.safeParse({ points: [{ ...validPoint, heart_rate: 350 }] });
    expect(r.success).toBe(false);
  });
});

describe('submitFeedbackSchema', () => {
  it('accepts rating 1-5', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(submitFeedbackSchema.safeParse({ rating }).success).toBe(true);
    }
  });
  it('rejects rating 0', () => {
    expect(submitFeedbackSchema.safeParse({ rating: 0 }).success).toBe(false);
  });
  it('rejects rating 6', () => {
    expect(submitFeedbackSchema.safeParse({ rating: 6 }).success).toBe(false);
  });
});
