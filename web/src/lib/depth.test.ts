import { describe, expect, it } from 'vitest'
import { classifyDepth, depthAtPoint, depthRange, safetyDepthM } from './depth'
import { indexPolygons } from './pip'

describe('depthRange', () => {
  it('reads lowercase ENC Direct properties', () => {
    expect(depthRange({ drval1: 1.8, drval2: 5.4 })).toEqual({ d1: 1.8, d2: 5.4 })
  })
  it('reads uppercase S-57 properties and numeric strings', () => {
    expect(depthRange({ DRVAL1: '0', DRVAL2: '1.8' })).toEqual({ d1: 0, d2: 1.8 })
  })
  it('returns null when absent', () => {
    expect(depthRange({ foo: 1 })).toBeNull()
  })
  it('returns null for explicit null values (ArcGIS emits all fields)', () => {
    expect(depthRange({ drval1: null, drval2: null })).toBeNull()
  })
})

describe('classifyDepth', () => {
  const safety = safetyDepthM(3.5, 2) // 5.5 ft ≈ 1.68 m
  it('unsafe when whole area is shallower than safety depth', () => {
    expect(classifyDepth(0, 1.5, safety)).toBe('unsafe')
  })
  it('caution when the area straddles the safety depth', () => {
    expect(classifyDepth(0.5, 5, safety)).toBe('caution')
  })
  it('safe when even the shallow bound clears it', () => {
    expect(classifyDepth(5, 10, safety)).toBe('safe')
  })
})

describe('depthAtPoint', () => {
  const square = (lonMin: number, latMin: number, size: number, props: Record<string, unknown>) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lonMin, latMin],
          [lonMin + size, latMin],
          [lonMin + size, latMin + size],
          [lonMin, latMin + size],
          [lonMin, latMin],
        ],
      ],
    },
    properties: props,
  })
  it('returns the shallowest containing area', () => {
    const idx = indexPolygons([
      square(-73, 41, 1, { drval1: 5, drval2: 10 }),
      square(-72.6, 41.4, 0.1, { drval1: 1, drval2: 3 }),
    ])
    expect(depthAtPoint(-72.55, 41.45, idx)).toEqual({ d1: 1, d2: 3 })
    expect(depthAtPoint(-72.9, 41.1, idx)).toEqual({ d1: 5, d2: 10 })
    expect(depthAtPoint(-71, 40, idx)).toBeNull()
  })
})
