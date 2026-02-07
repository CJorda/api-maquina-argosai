import { describe, it, expect } from 'vitest';
import request from 'supertest';

// ensure tests don't attempt to start the real server
process.env.NODE_ENV = 'test';
process.env.API_KEY = process.env.API_KEY || 'test-api-key';
import app from '../../src/app.js';

describe('integration /health and /v1', () => {
  it('GET /health returns 200 and minimal headers', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('POST /v1/data-records creates resource', async () => {
    const payload = { value: 'itest', date: '2026-02-06' };
    const res = await request(app)
      .post('/v1/data-records')
      .set('Content-Type', 'application/json')
      .set('x-api-key', process.env.API_KEY)
      .send(payload);
    expect([200,201]).toContain(res.status);
    expect(res.body).toHaveProperty('id');
    expect(res.body.value).toBe('itest');
  });

  it('POST /v1/data-records without API key is 401', async () => {
    const payload = { value: 'noauth', date: '2026-02-06' };
    const res = await request(app)
      .post('/v1/data-records')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('POST /v1/data-records with invalid body is 400', async () => {
    const payload = { value: '', date: 'bad-date' };
    const res = await request(app)
      .post('/v1/data-records')
      .set('Content-Type', 'application/json')
      .set('x-api-key', process.env.API_KEY)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('detail');
  });
});
