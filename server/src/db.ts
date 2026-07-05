// SQLite persistence via node:sqlite (built-in, no native build step).
// Canonical cloud-side copy of user data; clients are offline-first caches
// reconciled with last-write-wins (spec §10 sync layer).

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface UserRow {
  id: string
  email: string
  pass_hash: string
  salt: string
}

export interface ItemRow {
  id: string
  user_id: string
  kind: 'boat' | 'route'
  updated_at: number
  payload: string
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK (kind IN ('boat','route')),
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, kind);
  `)
  return db
}
