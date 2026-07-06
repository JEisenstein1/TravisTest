// End-to-end API test over a real HTTP listener + in-memory SQLite.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { createServer } from '../src/app.ts'

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const app = createServer(':memory:')
  const server: Server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const addr = server.address()
  if (typeof addr !== 'object' || !addr) throw new Error('no address')
  try {
    await fn(`http://127.0.0.1:${addr.port}`)
  } finally {
    server.close()
  }
}

async function json(base: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

test('health endpoint', async () => {
  await withServer(async (base) => {
    const r = await json(base, '/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
  })
})

test('register → login → sync round trip with LWW merge', async () => {
  await withServer(async (base) => {
    const reg = await json(base, '/api/auth/register', {
      email: 'skipper@example.com',
      password: 'anchorsaweigh',
    })
    assert.equal(reg.status, 200)
    const token1 = reg.body.token as string
    assert.ok(token1)

    // duplicate registration rejected
    const dup = await json(base, '/api/auth/register', {
      email: 'skipper@example.com',
      password: 'anchorsaweigh',
    })
    assert.equal(dup.status, 409)

    // push a boat + route from "device 1"
    const boat = { id: 'b1', name: 'Osprey', draftFt: 3, updatedAt: 1000 }
    const route = { id: 'r1', name: 'To Port Jeff', waypoints: [], updatedAt: 1000 }
    const push1 = await json(base, '/api/sync', { boats: [boat], routes: [route] }, token1)
    assert.equal(push1.status, 200)
    assert.equal((push1.body.boats as unknown[]).length, 1)

    // "device 2" logs in and pulls, then pushes a NEWER boat name
    const login = await json(base, '/api/auth/login', {
      email: 'skipper@example.com',
      password: 'anchorsaweigh',
    })
    assert.equal(login.status, 200)
    const token2 = login.body.token as string
    const pull = await json(base, '/api/sync', { boats: [], routes: [] }, token2)
    assert.equal((pull.body.boats as Array<{ name: string }>)[0].name, 'Osprey')

    const newer = { ...boat, name: 'Osprey II', updatedAt: 2000 }
    await json(base, '/api/sync', { boats: [newer], routes: [] }, token2)

    // an OLDER write must NOT clobber the newer one
    const stale = { ...boat, name: 'Osprey Stale', updatedAt: 500 }
    const final = await json(base, '/api/sync', { boats: [stale], routes: [] }, token1)
    const boats = final.body.boats as Array<{ name: string }>
    assert.equal(boats.length, 1)
    assert.equal(boats[0].name, 'Osprey II')
  })
})

test('auth required and validated', async () => {
  await withServer(async (base) => {
    const noAuth = await json(base, '/api/sync', { boats: [] })
    assert.equal(noAuth.status, 401)
    const badLogin = await json(base, '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever123',
    })
    assert.equal(badLogin.status, 401)
    const badReg = await json(base, '/api/auth/register', { email: 'x', password: 'short' })
    assert.equal(badReg.status, 400)
  })
})
