import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export type DB = DatabaseSync;

const here = path.dirname(fileURLToPath(import.meta.url));

function migrationsDir(): string {
  // In sviluppo: server/migrations; nel bundle: dist-server/../server/migrations
  const candidates = [path.join(here, 'migrations'), path.join(here, '..', 'server', 'migrations')];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Cartella migrazioni non trovata');
  return found;
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const dir = migrationsDir();
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    tx(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, appliedAt) VALUES (?, ?)').run(name, new Date().toISOString());
    });
  }
  const has = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!has) db.prepare('INSERT INTO settings (id, updatedAt) VALUES (1, ?)').run(new Date().toISOString());
}

const depth = new WeakMap<DB, number>();

/** Transazione rientrante: le chiamate annidate partecipano alla transazione esterna. */
export function tx<T>(db: DB, fn: () => T): T {
  const level = depth.get(db) ?? 0;
  if (level > 0) {
    depth.set(db, level + 1);
    try {
      return fn();
    } finally {
      depth.set(db, level);
    }
  }
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth.set(db, 0);
  }
}

export const newId = () => randomUUID();
