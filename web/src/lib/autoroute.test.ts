import { describe, expect, it } from 'vitest'
import { autoroute, type AutorouteInput, type GeoJsonFeature } from './autoroute'
import { indexPolygons, pointInIndexed } from './pip'

function poly(coords: number[][], props: Record<string, unknown>): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: props,
  }
}

function rect(x0: number, y0: number, x1: number, y1: number, props: Record<string, unknown>): GeoJsonFeature {
  return poly(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
    props,
  )
}

// A 1°×1° "sound" of deep water with a peninsula of land jutting from the
// south between start and end — the route must go around it.
const DEEP = { drval1: 10, drval2: 30 }
const water = rect(-73.5, 40.5, -72.5, 41.5, DEEP)
const peninsula = rect(-73.05, 40.5, -72.95, 41.2, {})

const base: AutorouteInput = {
  start: { lon: -73.3, lat: 40.8 },
  end: { lon: -72.7, lat: 40.8 },
  safetyM: 2,
  depthAreas: [water],
  blockedAreas: [peninsula],
  hazardPoints: [],
  resolution: 120,
}

describe('autoroute', () => {
  it('finds a route around land', () => {
    const r = autoroute(base)
    expect(r.ok).toBe(true)
    expect(r.waypoints.length).toBeGreaterThanOrEqual(3) // must dog-leg around the peninsula
    // endpoints pinned exactly
    expect(r.waypoints[0]).toEqual([-73.3, 40.8])
    expect(r.waypoints[r.waypoints.length - 1]).toEqual([-72.7, 40.8])
    // no waypoint may fall on the peninsula
    const land = indexPolygons([peninsula])
    for (const [lon, lat] of r.waypoints) {
      expect(pointInIndexed(lon, lat, land[0])).toBe(false)
    }
    // it must route around the north tip of the peninsula (lat > 41.2)
    const maxLat = Math.max(...r.waypoints.map((w) => w[1]))
    expect(maxLat).toBeGreaterThan(41.15)
  })

  it('goes straight when nothing blocks', () => {
    const r = autoroute({ ...base, blockedAreas: [] })
    expect(r.ok).toBe(true)
    expect(r.waypoints.length).toBe(2) // start + end, smoothed to a straight line
  })

  it('fails cleanly when the destination is too shallow for the draft', () => {
    const shallowEnd = rect(-72.8, 40.7, -72.5, 40.9, { drval1: 0.5, drval2: 1.0 })
    const deepWest = rect(-73.5, 40.5, -72.8, 41.5, DEEP)
    const r = autoroute({ ...base, depthAreas: [deepWest, shallowEnd], blockedAreas: [] })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not|no /i)
  })

  it('avoids water shallower than the safety depth', () => {
    // shallow bar across the middle, with a deep gap in the north
    const westDeep = rect(-73.5, 40.5, -73.05, 41.5, DEEP)
    const eastDeep = rect(-72.95, 40.5, -72.5, 41.5, DEEP)
    const barShallow = rect(-73.05, 40.5, -72.95, 41.3, { drval1: 0.5, drval2: 1.5 })
    const gapDeep = rect(-73.05, 41.3, -72.95, 41.5, DEEP)
    const r = autoroute({
      ...base,
      depthAreas: [westDeep, eastDeep, barShallow, gapDeep],
      blockedAreas: [],
    })
    expect(r.ok).toBe(true)
    const maxLat = Math.max(...r.waypoints.map((w) => w[1]))
    expect(maxLat).toBeGreaterThan(41.25) // detoured through the deep gap
  })

  it('treats uncharted water as blocked', () => {
    const r = autoroute({ ...base, depthAreas: [], blockedAreas: [] })
    expect(r.ok).toBe(false)
  })

  it('works with uppercase S-57 attribute names (raw ENC Direct casing)', () => {
    const upper = rect(-73.5, 40.5, -72.5, 41.5, { DRVAL1: 10, DRVAL2: 30 })
    const r = autoroute({ ...base, depthAreas: [upper], blockedAreas: [] })
    expect(r.ok).toBe(true)
    expect(r.waypoints.length).toBe(2)
  })

  it('does not block on hazards whose charted depth clears the keel', () => {
    const hazardOnTrack = (props: Record<string, unknown>): GeoJsonFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.0, 40.8] },
      properties: props,
    })
    // deep wreck (VALSOU 20 m) directly on the straight line → ignored
    const over = autoroute({
      ...base,
      blockedAreas: [],
      hazardPoints: [hazardOnTrack({ valsou: 20 })],
    })
    expect(over.ok).toBe(true)
    expect(over.waypoints.length).toBe(2)
    // same hazard with no charted depth → blocked, route must bend
    const around = autoroute({
      ...base,
      blockedAreas: [],
      hazardPoints: [hazardOnTrack({})],
    })
    expect(around.ok).toBe(true)
    expect(around.waypoints.length).toBeGreaterThan(2)
  })
})
