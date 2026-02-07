import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getData, createData } from '../../src/controllers/dataController.js';
import { getDb, resetDb } from '../../src/db/sqlite.js';

process.env.NODE_ENV = 'test';

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

function makeReq({ body, query, baseUrl, path, isJson = true } = {}) {
  return {
    body,
    query,
    baseUrl: baseUrl || '/v1',
    path: path || '/data-records',
    is() { return isJson ? 'application/json' : false; }
  };
}

describe.sequential('dataController', () => {
  beforeEach(async () => {
    resetDb();
    const db = await getDb();
    db.exec('DELETE FROM data_records;');
  });

  afterEach(() => {
    resetDb();
  });

  it('createData inserts and sanitizes value', async () => {
    const req = makeReq({
      body: { value: '<script>alert(1)</script>', date: '2026-02-06', status: 'PENDING' }
    });
    const res = makeRes();
    await createData(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.value).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('createData returns 400 when not JSON', async () => {
    const req = makeReq({ body: { value: 'x', date: '2026-02-06' }, isJson: false });
    const res = makeRes();
    await createData(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('createData returns 400 on invalid body', async () => {
    const req = makeReq({ body: null });
    const res = makeRes();
    await createData(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('createData returns 500 on db error', async () => {
    const db = await getDb();
    db.close();
    const req = makeReq({ body: { value: 'x', date: '2026-02-06' } });
    const res = makeRes();
    await createData(req, res);
    expect(res.statusCode).toBe(500);
  });

  it('getData paginates and returns links', async () => {
    const db = await getDb();
    db.run('INSERT INTO data_records (value, date, status, created_at) VALUES (?, ?, ?, ?)', ['a', '2026-02-06', 'PENDING', new Date().toISOString()]);
    db.run('INSERT INTO data_records (value, date, status, created_at) VALUES (?, ?, ?, ?)', ['b', '2026-02-06', 'PENDING', new Date().toISOString()]);
    db.run('INSERT INTO data_records (value, date, status, created_at) VALUES (?, ?, ?, ?)', ['c', '2026-02-06', 'PENDING', new Date().toISOString()]);

    const req = makeReq({ query: { page_size: 2 } });
    const res = makeRes();
    await getData(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.next_cursor).toBeTruthy();
    expect(res.body.links.next).toContain('cursor=');

    const req2 = makeReq({ query: { page_size: 2, cursor: res.body.meta.next_cursor } });
    const res2 = makeRes();
    await getData(req2, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.data.length).toBe(1);
  });
});
