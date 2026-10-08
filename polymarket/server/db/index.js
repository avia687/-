// Database connection + migration runner using the built-in node:sqlite module.
// Exposes a singleton DatabaseSync instance plus a few helpers. Keeping the DB
// access in one module makes it straightforward to swap in PostgreSQL later:
// only this file and repo.js would change.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

export function getDb() {
  if (db) return db;
  const file = config.databaseFile;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  seedSingletons();
  logger.info('database ready', { file });
  return db;
}

function seedSingletons() {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO notification_settings (id, updated_at)
     VALUES (1, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(now);
  db.prepare(
    `INSERT INTO users (id, email, created_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(process.env.OWNER_EMAIL || null, now);
}

// Convenience wrapper: run fn inside a transaction.
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export default getDb;
