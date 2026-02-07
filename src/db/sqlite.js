import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

let dbInstance;

function resolveDbPath() {
  const raw = (process.env.DB_PATH || '').trim();
  if (raw) {
    if (raw === ':memory:' || raw.startsWith('file:')) return raw;
    return path.resolve(raw);
  }
  if (process.env.NODE_ENV === 'test') return ':memory:';
  return path.resolve('data', 'argos.db');
}

function ensureDbPath(dbPath) {
  if (dbPath === ':memory:' || dbPath.startsWith('file:')) return;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function initSchema(db) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS inferences (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      species TEXT,
      batch_id TEXT,
      notes TEXT,
      operator_id TEXT,
      target_count INTEGER,
      target_biomass_kg REAL,
      end_reason TEXT,
      final_count INTEGER,
      final_biomass_kg REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counts (
      id TEXT PRIMARY KEY,
      inference_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      counted_at TEXT NOT NULL,
      fish_count INTEGER NOT NULL,
      biomass_kg REAL NOT NULL,
      avg_weight_g REAL,
      confidence REAL,
      frame_count INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (inference_id) REFERENCES inferences (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_counts_inference ON counts (inference_id);
    CREATE INDEX IF NOT EXISTS idx_counts_machine ON counts (machine_id);
    CREATE INDEX IF NOT EXISTS idx_inferences_machine ON inferences (machine_id);
    CREATE INDEX IF NOT EXISTS idx_inferences_started ON inferences (started_at);

    CREATE TABLE IF NOT EXISTS data_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_data_records_date ON data_records (date);
  `);
}

function wrapDb(db) {
  return {
    exec(sql) {
      return db.exec(sql);
    },
    run(sql, params = []) {
      return db.prepare(sql).run(params);
    },
    get(sql, params = []) {
      return db.prepare(sql).get(params);
    },
    all(sql, params = []) {
      return db.prepare(sql).all(params);
    },
    close() {
      return db.close();
    }
  };
}

export async function getDb() {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    ensureDbPath(dbPath);
    const db = new Database(dbPath);
    initSchema(db);
    dbInstance = wrapDb(db);
  }
  return dbInstance;
}

export function resetDb() {
  if (dbInstance) {
    try { dbInstance.close(); } catch (e) {}
    dbInstance = undefined;
  }
}

export default getDb;
