// Soundline sync API. Deliberately small: email/password auth (scrypt),
// bearer-token sessions, and a single /api/sync endpoint that merges boats +
// routes last-write-wins and returns the canonical set. Also serves the built
// web client from web/dist when present.

import express, { type Request, type Response, type NextFunction } from 'express'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openDb } from './db.ts'
import type { DatabaseSync } from 'node:sqlite'

interface SyncItem {
  id: string
  updatedAt: number
  [k: string]: unknown
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex')
}

function auth(db: DatabaseSync) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }
    const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
      | { user_id: string }
      | undefined
    if (!row) {
      res.status(401).json({ error: 'Session expired — sign in again' })
      return
    }
    ;(req as Request & { userId: string }).userId = row.user_id
    next()
  }
}

export function createServer(dbPath: string): express.Express {
  const db = openDb(dbPath)
  const app = express()
  app.use(express.json({ limit: '4mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'soundline-sync' })
  })

  app.post('/api/auth/register', (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Valid email required' })
      return
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
    if (existing) {
      res.status(409).json({ error: 'Account already exists — sign in instead' })
      return
    }
    const salt = randomBytes(16).toString('hex')
    const id = randomBytes(12).toString('hex')
    db.prepare('INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?,?,?,?,?)').run(
      id,
      email.toLowerCase(),
      hashPassword(password, salt),
      salt,
      Date.now(),
    )
    res.json({ token: createSession(db, id) })
  })

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
    const user = db
      .prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?')
      .get((email ?? '').toLowerCase()) as { id: string; pass_hash: string; salt: string } | undefined
    if (!user || !password) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const candidate = Buffer.from(hashPassword(password, user.salt), 'hex')
    const stored = Buffer.from(user.pass_hash, 'hex')
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    res.json({ token: createSession(db, user.id) })
  })

  app.post('/api/sync', auth(db), (req, res) => {
    const userId = (req as Request & { userId: string }).userId
    const { boats = [], routes = [] } = (req.body ?? {}) as { boats?: SyncItem[]; routes?: SyncItem[] }
    try {
      const merged = {
        boats: mergeKind(db, userId, 'boat', boats),
        routes: mergeKind(db, userId, 'route', routes),
      }
      res.json(merged)
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Sync failed' })
    }
  })

  // Serve the built web client when it exists (production single-process mode)
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
  if (existsSync(webDist)) {
    app.use(express.static(webDist))
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(`${webDist}/index.html`)
    })
  }

  return app
}

function createSession(db: DatabaseSync, userId: string): string {
  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(
    token,
    userId,
    Date.now(),
  )
  return token
}

/** Upsert incoming items newer than stored; return the full canonical set. */
function mergeKind(db: DatabaseSync, userId: string, kind: 'boat' | 'route', incoming: SyncItem[]): unknown[] {
  if (!Array.isArray(incoming)) throw new Error(`${kind}s must be an array`)
  if (incoming.length > 5000) throw new Error('Too many items')
  const get = db.prepare('SELECT updated_at FROM items WHERE id = ? AND user_id = ?')
  const upsert = db.prepare(
    `INSERT INTO items (id, user_id, kind, updated_at, payload) VALUES (?,?,?,?,?)
     ON CONFLICT(id, user_id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`,
  )
  for (const item of incoming) {
    if (!item || typeof item.id !== 'string' || typeof item.updatedAt !== 'number') continue
    const row = get.get(item.id, userId) as { updated_at: number } | undefined
    if (!row || item.updatedAt > row.updated_at) {
      upsert.run(item.id, userId, kind, item.updatedAt, JSON.stringify(item))
    }
  }
  const rows = db
    .prepare('SELECT payload FROM items WHERE user_id = ? AND kind = ?')
    .all(userId, kind) as Array<{ payload: string }>
  return rows.map((r) => JSON.parse(r.payload))
}
