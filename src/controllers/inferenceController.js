import crypto from 'crypto';
import sendProblem from '../utils/problemResponse.js';
import { getDb } from '../db/sqlite.js';

function getMachineId() {
  return process.env.MACHINE_ID || 'unknown';
}

export const startInference = async (req, res) => {
  try {
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const machine_id = getMachineId();
    await db.run(
      `INSERT INTO inferences (
        id, machine_id, status, started_at, species, batch_id, notes, operator_id,
        target_count, target_biomass_kg, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        id,
        machine_id,
        'running',
        req.body.started_at,
        req.body.species ?? null,
        req.body.batch_id ?? null,
        req.body.notes ?? null,
        req.body.operator_id ?? null,
        req.body.target_count ?? null,
        req.body.target_biomass_kg ?? null,
        now,
        now
      ]
    );
    const inference = await db.get('SELECT * FROM inferences WHERE id = ?', [id]);
    return res.status(201).json(inference);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const endInference = async (req, res) => {
  try {
    const db = await getDb();
    const { inference_id } = req.body;
    const inference = await db.get('SELECT * FROM inferences WHERE id = ?', [inference_id]);
    if (!inference) {
      return sendProblem(res, 404, 'Not Found', 'Inference not found');
    }
    if (inference.status === 'completed') {
      return sendProblem(res, 409, 'Conflict', 'Inference already ended');
    }
    const now = new Date().toISOString();
    await db.run(
      `UPDATE inferences
       SET status = ?, ended_at = ?, end_reason = ?, final_count = ?,
           final_biomass_kg = ?, updated_at = ?
       WHERE id = ?`
      , [
        'completed',
        req.body.ended_at,
        req.body.reason ?? null,
        req.body.final_count ?? null,
        req.body.final_biomass_kg ?? null,
        now,
        inference_id
      ]
    );
    const updated = await db.get('SELECT * FROM inferences WHERE id = ?', [inference_id]);
    return res.status(200).json(updated);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const getInference = async (req, res) => {
  try {
    const db = await getDb();
    const inference = await db.get('SELECT * FROM inferences WHERE id = ?', [req.params.id]);
    if (!inference) {
      return sendProblem(res, 404, 'Not Found', 'Inference not found');
    }
    return res.status(200).json(inference);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const listInferences = async (req, res) => {
  try {
    const db = await getDb();
    const { machine_id, status, limit } = req.query || {};
    const conditions = [];
    const params = [];
    if (machine_id) {
      conditions.push('machine_id = ?');
      params.push(machine_id);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    let sql = 'SELECT * FROM inferences';
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY started_at DESC';
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

export const getInferenceResults = async (req, res) => {
  try {
    const db = await getDb();
    const inference = await db.get('SELECT * FROM inferences WHERE id = ?', [req.params.id]);
    if (!inference) {
      return sendProblem(res, 404, 'Not Found', 'Inference not found');
    }
    const items = await db.all(
      'SELECT * FROM counts WHERE inference_id = ? ORDER BY counted_at ASC',
      [inference.id]
    );
    const totals = await db.get(
      `SELECT
         COALESCE(SUM(fish_count), 0) AS total_count,
         COALESCE(SUM(biomass_kg), 0) AS total_biomass_kg
       FROM counts
       WHERE inference_id = ?`,
      [inference.id]
    );
    const last = await db.get(
      `SELECT counted_at, fish_count AS last_fish_count, biomass_kg AS last_biomass_kg
       FROM counts
       WHERE inference_id = ?
       ORDER BY counted_at DESC
       LIMIT 1`,
      [inference.id]
    );
    const summary = {
      total_count: totals?.total_count ?? 0,
      total_biomass_kg: totals?.total_biomass_kg ?? 0,
      last_counted_at: last?.counted_at ?? null,
      last_fish_count: last?.last_fish_count ?? null,
      last_biomass_kg: last?.last_biomass_kg ?? null
    };
    return res.status(200).json({ inference, summary, data: items });
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};

export const getLatestInferenceSummary = async (req, res) => {
  try {
    const db = await getDb();
    const { machine_id } = req.query || {};
    const params = [];
    let sql = 'SELECT * FROM inferences';
    if (machine_id) {
      sql += ' WHERE machine_id = ?';
      params.push(machine_id);
    }
    sql += ' ORDER BY started_at DESC LIMIT 1';
    const latest = await db.get(sql, params);
    if (!latest) {
      return sendProblem(res, 404, 'Not Found', 'No inference found');
    }
    const totals = await db.get(
      `SELECT
         COALESCE(SUM(fish_count), 0) AS total_count,
         COALESCE(SUM(biomass_kg), 0) AS total_biomass_kg
       FROM counts
       WHERE inference_id = ?`,
      [latest.id]
    );
    const avg_weight_g = totals.total_count > 0
      ? (totals.total_biomass_kg * 1000) / totals.total_count
      : null;
    return res.status(200).json({
      inference_id: latest.id,
      machine_id: latest.machine_id,
      started_at: latest.started_at,
      ended_at: latest.ended_at || null,
      total_biomass_kg: totals.total_biomass_kg,
      total_fish_count: totals.total_count,
      avg_weight_g
    });
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Database error');
  }
};
