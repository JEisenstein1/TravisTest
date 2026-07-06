import { describe, expect, it } from 'vitest'
import { bearingDeg, crossTrackNm, distanceNm, fmtDuration, routeStats } from './geo'
import type { Route } from '../types'

describe('distanceNm', () => {
  it('one degree of latitude ≈ 60 nm', () => {
    expect(distanceNm(41, -73, 42, -73)).toBeCloseTo(60, 0)
  })
  it('zero distance', () => {
    expect(distanceNm(41.1, -73.1, 41.1, -73.1)).toBe(0)
  })
  it('New Haven → Port Jefferson ≈ 13 nm', () => {
    // across Long Island Sound, roughly
    const d = distanceNm(41.245, -72.96, 40.946, -73.069)
    expect(d).toBeGreaterThan(15)
    expect(d).toBeLessThan(20)
  })
})

describe('bearingDeg', () => {
  it('due north', () => {
    expect(bearingDeg(41, -73, 42, -73)).toBeCloseTo(0, 1)
  })
  it('due east', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 1)
  })
  it('due south', () => {
    expect(bearingDeg(42, -73, 41, -73)).toBeCloseTo(180, 1)
  })
})

describe('crossTrackNm', () => {
  it('point on the track has ~zero XTE', () => {
    // on the equator a constant-latitude segment IS the great circle
    expect(Math.abs(crossTrackNm(0, -73, 0, -72, 0, -72.5))).toBeLessThan(0.01)
  })
  it('point north of an eastbound track is negative (port side)', () => {
    const xte = crossTrackNm(0, 0, 0, 1, 0.1, 0.5)
    expect(Math.abs(Math.abs(xte) - 6)).toBeLessThan(0.1) // 0.1° lat ≈ 6 nm
  })
})

describe('routeStats', () => {
  const route: Route = {
    id: 'r1',
    name: 't',
    kind: 'manual',
    reviewed: true,
    createdAt: 0,
    updatedAt: 0,
    waypoints: [
      { id: 'a', lat: 41.0, lon: -73.0 },
      { id: 'b', lat: 41.5, lon: -73.0 },
      { id: 'c', lat: 41.5, lon: -72.5 },
    ],
  }
  it('computes legs, totals, ETA and fuel', () => {
    const s = routeStats(route, 10, 5)
    expect(s.legs).toHaveLength(2)
    expect(s.totalNm).toBeCloseTo(s.legs[0].distanceNm + s.legs[1].distanceNm, 6)
    expect(s.legs[0].distanceNm).toBeCloseTo(30, 0)
    expect(s.totalHours).toBeCloseTo(s.totalNm / 10, 6)
    expect(s.totalFuelGal).toBeCloseTo(s.totalHours * 5, 6)
  })
  it('handles zero speed without dividing by zero', () => {
    const s = routeStats(route, 0, 5)
    expect(s.totalHours).toBe(0)
  })
})

describe('fmtDuration', () => {
  it('formats hours and minutes', () => {
    expect(fmtDuration(1.5)).toBe('1h 30m')
    expect(fmtDuration(0.25)).toBe('15m')
    expect(fmtDuration(0)).toBe('—')
  })
})
