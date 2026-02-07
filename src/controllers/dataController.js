import sendProblem from '../utils/problemResponse.js';
import { sanitize } from '../utils/sanitize.js';
import { getDb } from '../db/sqlite.js';

const ALLOWED_FIELDS = new Set(['id', 'value', 'date', 'status', 'created_at']);

function parseFields(fields) {
  if (!fields) return ['id', 'value', 'date', 'status', 'created_at'];
  const selected = fields
    .split(',')
    .map(field => field.trim())
    .filter(field => field.length > 0 && ALLOWED_FIELDS.has(field));
  if (!selected.includes('id')) selected.unshift('id');
  return selected.length > 0 ? selected : ['id', 'value', 'date', 'status', 'created_at'];
}

function buildLinks(req, nextCursor) {
  const base = req.baseUrl + req.path;
  const params = new URLSearchParams();
  if (req.query.page_size) params.set('page_size', String(req.query.page_size));
  if (req.query.fields) params.set('fields', String(req.query.fields));
  if (req.query.cursor) params.set('cursor', String(req.query.cursor));
  const self = params.toString() ? `${base}?${params}` : base;
  if (!nextCursor) return { self };
  params.set('cursor', String(nextCursor));
  const next = `${base}?${params}`;
  return { self, next };
}

export const getData = async (req, res) => {
  try {
    const db = await getDb();
    const { page_size, cursor, fields } = req.query || {};
    const limit = page_size || 10;
    const selectFields = parseFields(fields);
    const params = [];
    let sql = `SELECT ${selectFields.join(', ')} FROM data_records`;
    if (cursor) {
      sql += ' WHERE id > ?';
      params.push(cursor);
    }
    sql += ' ORDER BY id ASC LIMIT ?';
    params.push(limit);
    const rows = await db.all(sql, params);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return res.status(200).json({
      data: rows,
      meta: { page_size: limit, next_cursor: nextCursor },
      links: buildLinks(req, nextCursor)
    });
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const createData = async (req, res) => {
  if (!req.is('application/json')) {
    return sendProblem(res, 400, 'Bad Request', 'Request body must be JSON (Content-Type: application/json)');
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return sendProblem(res, 400, 'Bad Request', 'Invalid JSON body');
  }

  try {
    const db = await getDb();
    const safeValue = sanitize(body.value);
    const now = new Date().toISOString();
    const result = await db.run(
      'INSERT INTO data_records (value, date, status, created_at) VALUES (?, ?, ?, ?)',
      [safeValue, body.date, body.status ?? null, now]
    );
    const entry = await db.get('SELECT * FROM data_records WHERE id = ?', [result.lastInsertRowid]);
    return res.status(201).json(entry);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Could not create resource');
  }
};
