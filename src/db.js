// Acceso a SQLite (node:sqlite) y ejecución de scripts SQL.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql');

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return db;
}

/** Ejecuta sql/001_schema.sql y, opcionalmente, los datos de prueba. */
export function initDb(db, { seed = true } = {}) {
  db.exec(fs.readFileSync(path.join(SQL_DIR, '001_schema.sql'), 'utf8'));
  if (seed) db.exec(fs.readFileSync(path.join(SQL_DIR, '002_seed_records.sql'), 'utf8'));
}

export const nowIso = () => new Date().toISOString();
