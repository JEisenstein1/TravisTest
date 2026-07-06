// Depth-area interpretation. ENC S-57 DEPARE features carry DRVAL1 (shallowest
// depth in the area) and DRVAL2 (deepest), in METERS relative to chart datum.
// Draft-aware shading and routing both classify against the vessel's safety
// depth = draft + margin. See spec §4.2.

import { M_PER_FT } from '../config'
import { pointInIndexed, type IndexedPoly } from './pip'

export type DepthClass = 'unsafe' | 'caution' | 'safe' | 'unknown'

/** Read DRVAL1/DRVAL2 (meters) from ENC Direct properties, tolerant of casing. */
export function depthRange(props: Record<string, unknown>): { d1: number; d2: number } | null {
  const d1 = num(props.drval1 ?? props.DRVAL1)
  const d2 = num(props.drval2 ?? props.DRVAL2)
  if (d1 === null && d2 === null) return null
  return { d1: d1 ?? d2 ?? 0, d2: d2 ?? d1 ?? 0 }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return isFinite(n) ? n : null
  }
  return null
}

/** Classify a depth area against a safety depth (all meters). */
export function classifyDepth(d1: number, d2: number, safetyM: number): DepthClass {
  if (d2 <= safetyM) return 'unsafe' // even the deepest point is too shallow
  if (d1 < safetyM) return 'caution' // area straddles the safety depth
  return 'safe'
}

export function safetyDepthM(draftFt: number, marginFt: number): number {
  return (draftFt + marginFt) * M_PER_FT
}

/**
 * Depth under a position from indexed DEPARE polygons: returns the shallowest
 * DRVAL1 among containing areas (areas can overlap across ENC cells).
 */
export function depthAtPoint(
  lon: number,
  lat: number,
  polys: IndexedPoly[],
): { d1: number; d2: number } | null {
  let best: { d1: number; d2: number } | null = null
  for (const p of polys) {
    if (!pointInIndexed(lon, lat, p)) continue
    const r = depthRange(p.props)
    if (!r) continue
    if (!best || r.d1 < best.d1) best = r
  }
  return best
}
