import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startInference,
  endInference,
  getInference,
  listInferences,
  getInferenceResults,
  getLatestInferenceSummary
} from '../../src/controllers/inferenceController.js';
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

function makeReq({ body, query, params } = {}) {
  return { body: body || {}, query: query || {}, params: params || {} };
}

describe.sequential('inferenceController', () => {
  beforeEach(async () => {
    resetDb();
    const db = await getDb();
    db.exec('DELETE FROM counts;');
    db.exec('DELETE FROM inferences;');
  });

  afterEach(() => {
    resetDb();
  });

  it('startInference creates a running inference', async () => {
    const req = makeReq({ body: { started_at: '2026-02-07T10:00:00Z' } });
    const res = makeRes();
    await startInference(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('running');
    expect(res.body.machine_id).toBe('machine-test');
  });

  it('endInference completes an inference', async () => {
    const reqStart = makeReq({ body: { started_at: '2026-02-07T10:00:00Z' } });
    const resStart = makeRes();
    await startInference(reqStart, resStart);

    const req = makeReq({
      body: {
        inference_id: resStart.body.id,
        ended_at: '2026-02-07T10:10:00Z',
        reason: 'done',
        final_count: 10,
        final_biomass_kg: 5.5
      }
    });
    const res = makeRes();
    await endInference(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('endInference returns 404 for missing inference', async () => {
    const req = makeReq({ body: { inference_id: 'missing', ended_at: '2026-02-07T10:10:00Z' } });
    const res = makeRes();
    await endInference(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('endInference returns 409 when already completed', async () => {
    const reqStart = makeReq({ body: { started_at: '2026-02-07T10:00:00Z' } });
    const resStart = makeRes();
    await startInference(reqStart, resStart);

    const reqEnd = makeReq({ body: { inference_id: resStart.body.id, ended_at: '2026-02-07T10:05:00Z' } });
    await endInference(reqEnd, makeRes());

    const res = makeRes();
    await endInference(reqEnd, res);
    expect(res.statusCode).toBe(409);
  });

  it('getInference returns 404 when missing', async () => {
    const req = makeReq({ params: { id: 'missing' } });
    const res = makeRes();
    await getInference(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('listInferences filters by machine and status', async () => {
    const db = await getDb();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-1', 'machine-test', 'running', '2026-02-07T10:00:00Z', new Date().toISOString(), new Date().toISOString()]
    );
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-2', 'other', 'completed', '2026-02-07T11:00:00Z', new Date().toISOString(), new Date().toISOString()]
    );

    const req = makeReq({ query: { machine_id: 'machine-test', status: 'running', limit: 5 } });
    const res = makeRes();
    await listInferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe('inf-1');
  });

  it('getInferenceResults returns summary with no counts', async () => {
    const reqStart = makeReq({ body: { started_at: '2026-02-07T10:00:00Z' } });
    const resStart = makeRes();
    await startInference(reqStart, resStart);

    const req = makeReq({ params: { id: resStart.body.id } });
    const res = makeRes();
    await getInferenceResults(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.summary.total_count).toBe(0);
    expect(res.body.summary.last_counted_at).toBe(null);
  });

  it('getInferenceResults returns totals with counts', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-3', 'machine-test', 'running', now, now, now]
    );
    db.run(
      'INSERT INTO counts (id, inference_id, machine_id, counted_at, fish_count, biomass_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['c1', 'inf-3', 'machine-test', '2026-02-07T10:05:00Z', 5, 2.5, now]
    );
    db.run(
      'INSERT INTO counts (id, inference_id, machine_id, counted_at, fish_count, biomass_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['c2', 'inf-3', 'machine-test', '2026-02-07T10:06:00Z', 3, 1.5, now]
    );

    const req = makeReq({ params: { id: 'inf-3' } });
    const res = makeRes();
    await getInferenceResults(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.summary.total_count).toBe(8);
    expect(res.body.summary.total_biomass_kg).toBe(4);
  });

  it('getLatestInferenceSummary returns 404 when none', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    await getLatestInferenceSummary(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('getLatestInferenceSummary returns latest with totals', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-4', 'machine-test', 'running', '2026-02-07T10:00:00Z', now, now]
    );
    db.run(
      'INSERT INTO inferences (id, machine_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['inf-5', 'machine-test', 'running', '2026-02-07T11:00:00Z', now, now]
    );
    db.run(
      'INSERT INTO counts (id, inference_id, machine_id, counted_at, fish_count, biomass_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['c3', 'inf-5', 'machine-test', '2026-02-07T11:05:00Z', 6, 3, now]
    );

    const req = makeReq({ query: { machine_id: 'machine-test' } });
    const res = makeRes();
    await getLatestInferenceSummary(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.inference_id).toBe('inf-5');
    expect(res.body.total_fish_count).toBe(6);
  });

  it('getInference returns 500 on db error', async () => {
    const db = await getDb();
    db.close();
    const req = makeReq({ params: { id: 'inf-1' } });
    const res = makeRes();
    await getInference(req, res);
    expect(res.statusCode).toBe(500);
  });
});
