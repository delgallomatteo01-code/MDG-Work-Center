// Variante browser di server/db.ts (build Artifact): stessa API minima di node:sqlite sopra sql.js.
import type { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import initSql from '../server/migrations/001_init.sql?raw';

type Param = SqlValue | undefined;

export interface BrowserDB {
  prepare(sql: string): {
    run(...params: Param[]): { changes: number };
    get(...params: Param[]): Record<string, unknown> | undefined;
    all(...params: Param[]): Record<string, unknown>[];
  };
  exec(sql: string): void;
  raw: SqlJsDatabase;
}
export type DB = BrowserDB;

const norm = (params: Param[]) => params.map((p) => (p === undefined ? null : p));

export function wrapDatabase(raw: SqlJsDatabase): BrowserDB {
  return {
    raw,
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      return {
        run(...params) {
          raw.run(sql, norm(params));
          return { changes: raw.getRowsModified() };
        },
        get(...params) {
          const st = raw.prepare(sql);
          try {
            st.bind(norm(params));
            return st.step() ? (st.getAsObject() as Record<string, unknown>) : undefined;
          } finally {
            st.free();
          }
        },
        all(...params) {
          const st = raw.prepare(sql);
          const out: Record<string, unknown>[] = [];
          try {
            st.bind(norm(params));
            while (st.step()) out.push(st.getAsObject() as Record<string, unknown>);
          } finally {
            st.free();
          }
          return out;
        },
      };
    },
  };
}

/** Applica lo schema (idempotente) e la riga impostazioni, come openDatabase lato server. */
export function migrate(db: BrowserDB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)');
  if (!db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get('001_init.sql')) {
    tx(db, () => {
      db.exec(initSql);
      db.prepare('INSERT INTO schema_migrations (name, appliedAt) VALUES (?, ?)').run('001_init.sql', new Date().toISOString());
    });
  }
  if (!db.prepare('SELECT id FROM settings WHERE id = 1').get()) {
    db.prepare('INSERT INTO settings (id, updatedAt) VALUES (1, ?)').run(new Date().toISOString());
  }
}

const depth = new WeakMap<object, number>();

export function tx<T>(db: BrowserDB, fn: () => T): T {
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

export const newId = () => crypto.randomUUID();
