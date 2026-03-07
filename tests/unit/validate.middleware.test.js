import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../src/middleware/validate.js';

function makeReqRes(data) {
  const req  = { body: data, query: data };
  const res  = {};
  const next = vi.fn();
  return { req, res, next };
}

const schema = z.object({
  name:  z.string().min(1, 'Name required'),
  age:   z.coerce.number().int().min(0),
});

describe('validateBody', () => {
  const mw = validateBody(schema);

  it('calls next() with no args when data is valid', () => {
    const { req, res, next } = makeReqRes({ name: 'Ana', age: 25 });
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith(); // called with no arguments
    expect(req.body).toEqual({ name: 'Ana', age: 25 });
  });

  it('coerces age from string to number', () => {
    const { req, res, next } = makeReqRes({ name: 'Ana', age: '30' });
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.age).toBe(30);
  });

  it('calls next(error) when validation fails', () => {
    const { req, res, next } = makeReqRes({ name: '', age: 25 });
    mw(req, res, next);
    const [err] = next.mock.calls[0];
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
    expect(err.message).toBe('Name required');
  });

  it('includes field-level details on validation error', () => {
    const { req, res, next } = makeReqRes({ name: '', age: -1 });
    mw(req, res, next);
    const [err] = next.mock.calls[0];
    expect(err.fields).toBeDefined();
  });

  it('calls next(error) for missing required field', () => {
    const { req, res, next } = makeReqRes({ age: 25 });
    mw(req, res, next);
    const [err] = next.mock.calls[0];
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
  });
});

describe('validateQuery', () => {
  const mw = validateQuery(schema);

  it('calls next() with no args when query is valid', () => {
    const { req, res, next } = makeReqRes({ name: 'Ana', age: '25' });
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query.age).toBe(25);
  });

  it('calls next(error) on invalid query', () => {
    const { req, res, next } = makeReqRes({ age: '25' }); // missing name
    mw(req, res, next);
    const [err] = next.mock.calls[0];
    expect(err).toBeDefined();
  });
});
