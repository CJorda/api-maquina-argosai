import { describe, it, expect } from 'vitest';
import apiKeyAuth from '../../src/middlewares/apiKeyAuth.js';

describe('apiKeyAuth middleware', () => {
  const NEXT = () => ({ ok: true });

  it('calls next() when API key matches', () => {
    process.env.API_KEY = 'mytestkey';
    const req = { header: (h) => (h === 'x-api-key' ? 'mytestkey' : undefined) };
    const res = { status: () => ({ json: () => null }) };
    let called = false;
    apiKeyAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('returns 401 when API key missing or invalid', () => {
    process.env.API_KEY = 'mytestkey';
    const req = { header: () => undefined };
    const out = { statusCode: null, body: null };
    const res = {
      status(code) { out.statusCode = code; return this; },
      json(payload) { out.body = payload; return out; }
    };
    apiKeyAuth(req, res, () => null);
    expect(out.statusCode).toBe(401);
    expect(out.body).toHaveProperty('detail');
  });
});
