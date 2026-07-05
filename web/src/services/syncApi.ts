// Client for the optional Soundline sync server (server/). The app is fully
// functional offline; when signed in, boats & routes reconcile across devices
// with last-write-wins on updatedAt (spec §10 sync layer).

import type { Boat, Route } from '../types'
import { getState, setState } from '../state/store'

const BASE = '/api'

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getState().authToken
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function register(email: string, password: string): Promise<void> {
  const { token } = await api<{ token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setState({ authToken: token, authEmail: email })
}

export async function login(email: string, password: string): Promise<void> {
  const { token } = await api<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setState({ authToken: token, authEmail: email })
}

export function logout(): void {
  setState({ authToken: null, authEmail: null })
}

interface SyncPayload {
  boats: Boat[]
  routes: Route[]
}

/** Push local, pull remote, merge LWW by updatedAt. */
export async function syncNow(): Promise<{ boats: number; routes: number }> {
  const s = getState()
  const remote = await api<SyncPayload>('/sync', {
    method: 'POST',
    body: JSON.stringify({ boats: s.boats, routes: s.routes } satisfies SyncPayload),
  })
  const boats = mergeLww(s.boats, remote.boats)
  const routes = mergeLww(s.routes, remote.routes)
  // deleted items travel as tombstones ({deleted: true}); keep the active
  // boat pointing at something visible
  const visible = boats.filter((b) => !b.deleted)
  setState({
    boats,
    routes,
    activeBoatId: visible.some((b) => b.id === s.activeBoatId)
      ? s.activeBoatId
      : (visible[0] ?? boats[0])?.id,
  })
  return { boats: visible.length, routes: routes.filter((r) => !r.deleted).length }
}

function mergeLww<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const cur = byId.get(item.id)
    if (!cur || item.updatedAt > cur.updatedAt) byId.set(item.id, item)
  }
  return [...byId.values()]
}
