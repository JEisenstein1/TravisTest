// Minimal external store (useSyncExternalStore) with localStorage persistence.
// Offline-first: local state is canonical on-device; the optional sync server
// reconciles boats/routes across devices with last-write-wins (spec §10 sync).

import { useSyncExternalStore } from 'react'
import type { Boat, GeoFix, Prefs, Route, Track, Waypoint } from '../types'
import { newId } from '../lib/geo'

export interface AutoroutePreview {
  waypoints: Array<[number, number]>
  reason?: string
  status: 'idle' | 'picking-start' | 'picking-end' | 'computing' | 'review' | 'error'
  start?: [number, number]
  end?: [number, number]
}

export interface AppState {
  boats: Boat[]
  activeBoatId: string
  routes: Route[]
  /** Waypoints of the route currently being edited on the map */
  draftWaypoints: Waypoint[]
  editingRouteId: string | null
  routingMode: boolean
  autoroute: AutoroutePreview
  tracks: Track[]
  recording: boolean
  liveTrack: Track | null
  fix: GeoFix | null
  follow: boolean
  navigating: boolean
  shallowAlert: string | null
  prefs: Prefs
  panel: 'boat' | 'route' | 'tides' | 'weather' | 'tracks' | 'sync' | null
  disclaimerAccepted: boolean
  authToken: string | null
  authEmail: string | null
  depthStatus: string
  selectedStationId: string | null
}

function defaultBoat(): Boat {
  return {
    id: newId('boat'),
    name: 'My Boat',
    draftFt: 3.5,
    safetyMarginFt: 2,
    cruiseKts: 18,
    fuelGph: 12,
    updatedAt: Date.now(),
  }
}

const PERSIST_KEY = 'soundline.v1'
const PERSISTED = [
  'boats',
  'activeBoatId',
  'routes',
  'tracks',
  'prefs',
  'disclaimerAccepted',
  'authToken',
  'authEmail',
] as const

function initialState(): AppState {
  const boat = defaultBoat()
  const base: AppState = {
    boats: [boat],
    activeBoatId: boat.id,
    routes: [],
    draftWaypoints: [],
    editingRouteId: null,
    routingMode: false,
    autoroute: { waypoints: [], status: 'idle' },
    tracks: [],
    recording: false,
    liveTrack: null,
    fix: null,
    follow: false,
    navigating: false,
    shallowAlert: null,
    prefs: {
      baseLayer: 'standard',
      encChart: true,
      encOpacity: 0.85,
      depthShading: true,
      hazards: true,
      tideStations: true,
      nightMode: 'day',
      units: 'ft',
    },
    panel: null,
    disclaimerAccepted: false,
    authToken: null,
    authEmail: null,
    depthStatus: '',
    selectedStationId: null,
  }
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>
      for (const k of PERSISTED) {
        if (saved[k] !== undefined) (base as unknown as Record<string, unknown>)[k] = saved[k]
      }
      base.prefs = { ...base.prefs, ...(saved.prefs ?? {}) }
      if (!base.boats.some((b) => !b.deleted)) {
        const b = defaultBoat()
        base.boats = [...base.boats, b]
        base.activeBoatId = b.id
      }
      if (!base.boats.some((b) => b.id === base.activeBoatId && !b.deleted)) {
        base.activeBoatId = base.boats.find((b) => !b.deleted)!.id
      }
    }
  } catch {
    // corrupted storage → fresh start
  }
  return base
}

type Listener = () => void

let state: AppState = initialState()
const listeners = new Set<Listener>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const out: Record<string, unknown> = {}
    for (const k of PERSISTED) out[k] = state[k]
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(out))
    } catch {
      // storage full/unavailable — keep running in-memory
    }
  }, 250)
}

export function getState(): AppState {
  return state
}

export function setState(partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const patch = typeof partial === 'function' ? partial(state) : partial
  state = { ...state, ...patch }
  persist()
  listeners.forEach((l) => l())
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whole-state hook; components destructure what they need. */
export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/** Boats/routes minus tombstones — what the UI should show. Deleted items
 * stay in the arrays as `deleted: true` markers so sync propagates deletion
 * (LWW on updatedAt) instead of resurrecting them from the server. */
export function visibleBoats(s: AppState = state): Boat[] {
  return s.boats.filter((b) => !b.deleted)
}

export function visibleRoutes(s: AppState = state): Route[] {
  return s.routes.filter((r) => !r.deleted)
}

export function activeBoat(s: AppState = state): Boat {
  return (
    s.boats.find((b) => b.id === s.activeBoatId && !b.deleted) ??
    visibleBoats(s)[0] ??
    s.boats[0]
  )
}

// ---- mutations used across components ----

export function updateBoat(id: string, patch: Partial<Boat>): void {
  setState((s) => ({
    boats: s.boats.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)),
  }))
}

export function addBoat(): void {
  const b = defaultBoat()
  b.name = `Boat ${visibleBoats(state).length + 1}`
  setState((s) => ({ boats: [...s.boats, b], activeBoatId: b.id }))
}

export function deleteBoat(id: string): void {
  setState((s) => {
    const now = Date.now()
    let boats = s.boats.map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: now } : b))
    let visible = boats.filter((b) => !b.deleted)
    if (visible.length === 0) {
      const fresh = defaultBoat()
      boats = [...boats, fresh]
      visible = [fresh]
    }
    return {
      boats,
      activeBoatId: visible.some((b) => b.id === s.activeBoatId) ? s.activeBoatId : visible[0].id,
    }
  })
}

export function saveRoute(route: Route): void {
  setState((s) => {
    const exists = s.routes.some((r) => r.id === route.id)
    return {
      routes: exists
        ? s.routes.map((r) => (r.id === route.id ? { ...route, updatedAt: Date.now() } : r))
        : [...s.routes, route],
    }
  })
}

export function deleteRoute(id: string): void {
  setState((s) => ({
    routes: s.routes.map((r) =>
      r.id === id ? { ...r, deleted: true, updatedAt: Date.now() } : r,
    ),
    editingRouteId: s.editingRouteId === id ? null : s.editingRouteId,
  }))
}

export function saveTrack(track: Track): void {
  setState((s) => {
    const exists = s.tracks.some((t) => t.id === track.id)
    return {
      tracks: exists ? s.tracks.map((t) => (t.id === track.id ? track : t)) : [...s.tracks, track],
    }
  })
}

export function deleteTrack(id: string): void {
  setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }))
}
