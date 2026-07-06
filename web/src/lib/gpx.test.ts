import { describe, expect, it } from 'vitest'
import { routeToGpx, trackToGpx } from './gpx'
import type { Route, Track } from '../types'

const route: Route = {
  id: 'r1',
  name: 'Test <Route> & Co',
  kind: 'manual',
  reviewed: true,
  createdAt: 0,
  updatedAt: 0,
  waypoints: [
    { id: 'a', lat: 41.123456789, lon: -73.000001, name: 'Start' },
    { id: 'b', lat: 41.2, lon: -72.9 },
  ],
}

describe('routeToGpx', () => {
  const xml = routeToGpx(route)
  it('is GPX 1.1 with rte/rtept structure', () => {
    expect(xml).toContain('<gpx version="1.1"')
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
    expect(xml.match(/<rtept /g)).toHaveLength(2)
    expect(xml).toContain('lat="41.123457"')
    expect(xml).toContain('lon="-73.000001"')
  })
  it('escapes XML entities in names', () => {
    expect(xml).toContain('Test &lt;Route&gt; &amp; Co')
    expect(xml).not.toContain('<Route>')
  })
  it('falls back to numbered waypoint names', () => {
    expect(xml).toContain('<name>WP2</name>')
  })
})

describe('trackToGpx', () => {
  const track: Track = {
    id: 't1',
    name: 'Morning run',
    points: [
      { lat: 41.0, lon: -73.0, t: Date.UTC(2026, 6, 1, 12, 0, 0) },
      { lat: 41.01, lon: -73.0, t: Date.UTC(2026, 6, 1, 12, 5, 0) },
    ],
    startedAt: 0,
    updatedAt: 0,
  }
  it('writes trkpt with ISO times', () => {
    const xml = trackToGpx(track)
    expect(xml.match(/<trkpt /g)).toHaveLength(2)
    expect(xml).toContain('<time>2026-07-01T12:00:00.000Z</time>')
  })
})
