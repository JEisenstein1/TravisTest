// Tombstone semantics: deletes must survive sync (LWW) instead of being
// resurrected by the server echoing stored items back. The store keeps
// deleted boats/routes in the arrays as `deleted: true` markers and the UI
// reads through visibleBoats/visibleRoutes.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  activeBoat,
  addBoat,
  deleteBoat,
  deleteRoute,
  getState,
  saveRoute,
  setState,
  visibleBoats,
  visibleRoutes,
} from './store'
import type { Route } from '../types'

function route(id: string): Route {
  return {
    id,
    name: id,
    kind: 'manual',
    reviewed: true,
    waypoints: [
      { id: `${id}a`, lat: 41, lon: -73 },
      { id: `${id}b`, lat: 41.1, lon: -73 },
    ],
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('delete tombstones', () => {
  beforeEach(() => {
    // reset to a known state (module store is a singleton)
    setState({ routes: [], editingRouteId: null })
  })

  it('deleteBoat keeps a tombstone and bumps updatedAt', () => {
    addBoat()
    const victim = activeBoat()
    const before = victim.updatedAt
    deleteBoat(victim.id)
    const s = getState()
    const tomb = s.boats.find((b) => b.id === victim.id)
    expect(tomb?.deleted).toBe(true)
    expect(tomb!.updatedAt).toBeGreaterThanOrEqual(before)
    expect(visibleBoats(s).some((b) => b.id === victim.id)).toBe(false)
    expect(activeBoat(s).deleted).toBeUndefined()
  })

  it('deleting the last visible boat spawns a fresh default', () => {
    for (const b of visibleBoats()) deleteBoat(b.id)
    const s = getState()
    expect(visibleBoats(s).length).toBe(1)
    expect(activeBoat(s).deleted).toBeUndefined()
  })

  it('deleteRoute keeps a tombstone hidden from the UI', () => {
    saveRoute(route('r1'))
    saveRoute(route('r2'))
    deleteRoute('r1')
    const s = getState()
    expect(s.routes).toHaveLength(2) // tombstone retained for sync
    expect(visibleRoutes(s).map((r) => r.id)).toEqual(['r2'])
    expect(s.routes.find((r) => r.id === 'r1')?.deleted).toBe(true)
  })
})
