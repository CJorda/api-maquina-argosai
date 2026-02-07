import { describe, it, expect } from 'vitest';
import validate from '../../src/middlewares/validate.js';
import { createDataSchema } from '../../src/schemas/dataSchemas.js';

function makeReq(body) { return { body }; }
function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('validate middleware', () => {
  it('passes valid data through and coerces types', () => {
    const mw = validate(createDataSchema, 'body');
    const req = makeReq({ value: 'v', date: '2026-02-06' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.body.value).toBe('v');
  });

  it('returns 400 on invalid data', () => {
    const mw = validate(createDataSchema, 'body');
    const req = makeReq({ value: '', date: 'not-a-date' });
    const res = makeRes();
    mw(req, res, () => null);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('detail');
  });
});
