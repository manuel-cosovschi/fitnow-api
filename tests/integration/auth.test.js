import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock the database before any app code is loaded ──────────────────────────
vi.mock('../../src/db.js', () => {
  const queryFn = vi.fn();
  return {
    default:     { query: queryFn, end: vi.fn() },
    pool:        { query: queryFn, end: vi.fn() },
    query:       queryFn,
    queryOne:    vi.fn(),
    transaction: vi.fn(async (fn) => fn({ query: queryFn })),
  };
});

vi.mock('../../src/utils/mailer.js', () => ({
  sendPasswordReset: vi.fn(),
}));

// Set env before app loads
process.env.JWT_SECRET    = 'integration_test_secret_32chars!!';
process.env.DB_HOST       = 'localhost';
process.env.DB_USER       = 'test';
process.env.DB_NAME       = 'test';
process.env.NODE_ENV      = 'test';

import * as db       from '../../src/db.js';
import * as mailer   from '../../src/utils/mailer.js';
import app           from '../../src/app.js';

beforeEach(() => vi.clearAllMocks());

// ── POST /api/auth/register ───────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Ana', email: 'not-email', password: 'secret1',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Ana', email: 'ana@test.com', password: '123',
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 with token when registration succeeds', async () => {
    // Mock: no existing user, then return created user
    db.queryOne
      .mockResolvedValueOnce(null)       // findByEmail → no duplicate
      .mockResolvedValueOnce({           // findById after create (returns created user)
        id: 1, name: 'Ana Test', email: 'ana@test.com', role: 'user',
      });
    db.query.mockResolvedValue({ insertId: 1 });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Ana Test', email: 'ana@test.com', password: 'secret123',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 when user is not found', async () => {
    db.queryOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/login').send({
      email: 'no@user.com', password: 'pass',
    });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 200 even when email is not registered (anti-enumeration)', async () => {
    db.queryOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@test.com' });
    expect(res.status).toBe(200);
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  it('returns 400 when token is missing', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ new_password: 'newpass' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is invalid/not found', async () => {
    db.queryOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'bad-token', new_password: 'newpass123',
    });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/health ───────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── GET /api/auth/me (protected) ──────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });
});
