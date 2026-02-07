import crypto from 'crypto';
import sendProblem from '../utils/problemResponse.js';
import { getDb } from '../db/sqlite.js';

function getMachineId() {
  return process.env.MACHINE_ID || 'unknown';
}

export const createCount = async (req, res) => {
  try {
    const db = await getDb();
    const inference = await db.get('SELECT * FROM inferences WHERE id = ?', [req.body.inference_id]);
    if (!inference) {
      return sendProblem(res, 404, 'Not Found', 'Inference not found');
    }
    if (inference.status === 'completed') {
      return sendProblem(res, 409, 'Conflict', 'Inference already ended');
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO counts (
        id, inference_id, machine_id, counted_at, fish_count, biomass_kg,
        avg_weight_g, confidence, frame_count, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        id,
        req.body.inference_id,
        getMachineId(),
        req.body.counted_at,
        req.body.fish_count,
        req.body.biomass_kg,
        req.body.avg_weight_g ?? null,
        req.body.confidence ?? null,
        req.body.frame_count ?? null,
        req.body.notes ?? null,
        now
      ]
    );
    const record = await db.get('SELECT * FROM counts WHERE id = ?', [id]);
    return res.status(201).json(record);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const listCounts = async (req, res) => {
  try {
    const db = await getDb();
    const { inference_id, machine_id, from, to, limit } = req.query || {};
    const conditions = [];
    const params = [];
    if (inference_id) {
      conditions.push('inference_id = ?');
      params.push(inference_id);
    }
    if (machine_id) {
      conditions.push('machine_id = ?');
      params.push(machine_id);
    }
    if (from) {
      conditions.push('counted_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('counted_at <= ?');
      params.push(to);
    }
    let sql = 'SELECT * FROM counts';
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY counted_at DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(Number(limit));
    }
    const items = await db.all(sql, params);
    return res.status(200).json({ data: items });
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};
