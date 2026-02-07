import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCount, listCounts } from '../../src/controllers/countController.js';
import { getDb, resetDb } from '../../src/db/sqlite.js';

process.env.NODE_ENV = 'test';
process.env.MACHINE_ID = 'machine-test';

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function makeReq({ body, query } = {}) {
  return { body: body || {}, query: query || {} };
}

describe.sequential('countController', () => {
  beforeEach(async () => {
    resetDb();
    const db = await getDb();
    db.exec('DELETE FROM counts;');
    db.exec('DELETE FROM inferences;');
  });

  afterEach(() => {
    resetDb();
  });

  it('createCount inserts when inference exists', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-1', 'machine-test', 'running', now, now, now]
    );

    const req = makeReq({
      body: {
        inference_id: 'inf-1',
        counted_at: '2026-02-07T10:05:00Z',
        fish_count: 10,
        biomass_kg: 5
      }
    });
    const res = makeRes();
    await createCount(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.inference_id).toBe('inf-1');
  });

  it('createCount returns 404 when inference missing', async () => {
    const req = makeReq({
      body: {
        inference_id: 'missing',
        counted_at: '2026-02-07T10:05:00Z',
        fish_count: 10,
        biomass_kg: 5
      }
    });
    const res = makeRes();
    await createCount(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('createCount returns 409 when inference completed', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['inf-2', 'machine-test', 'completed', now, now, now, now]
    );

    const req = makeReq({
      body: {
        inference_id: 'inf-2',
        counted_at: '2026-02-07T10:05:00Z',
        fish_count: 10,
        biomass_kg: 5
      }
    });
    const res = makeRes();
    await createCount(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('listCounts filters by inference_id, machine_id, from/to, limit', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-3', 'machine-test', 'running', now, now, now]
    );
    db.run(
      'INSERT INTO counts (id, inference_id, machine_id, counted_at, fish_count, biomass_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['c1', 'inf-3', 'machine-test', '2026-02-07T10:00:00Z', 1, 0.5, now]
    );
    db.run(
      'INSERT INTO counts (id, inference_id, machine_id, counted_at, fish_count, biomass_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['c2', 'inf-3', 'machine-test', '2026-02-07T10:10:00Z', 2, 1.0, now]
    );

    const req = makeReq({
      query: {
        inference_id: 'inf-3',
        machine_id: 'machine-test',
        from: '2026-02-07T10:05:00Z',
        to: '2026-02-07T10:15:00Z',
        limit: 1
      }
    });
    const res = makeRes();
    await listCounts(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe('c2');
  });

  it('listCounts returns 500 on db error', async () => {
    const db = await getDb();
    db.close();
    const req = makeReq({ query: {} });
    const res = makeRes();
    await listCounts(req, res);
    expect(res.statusCode).toBe(500);
  });
});
