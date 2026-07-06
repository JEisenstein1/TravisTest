// Autorouting core (spec §5.2): rasterize ENC depth areas + hazards into a
// navigability grid, run A* with soft penalties near blocked cells, then
// smooth with line-of-sight shortcutting. Pure functions — no DOM, no map —
// so the whole engine is unit-testable and runs inside a Web Worker.
//
// SAFETY: output is a *proposal*. The UI must force an explicit review step
// and show the standing disclaimer before a generated route can be used.

import { depthRange } from './depth'
import { indexPolygons, pointInIndexed, type IndexedPoly } from './pip'

export interface GridSpec {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
  cols: number
  rows: number
}

export interface NavGrid {
  spec: GridSpec
  /** 0 = blocked; otherwise traversal cost multiplier >= 1 (soft penalties) */
  cost: Float32Array
}

export interface AutorouteInput {
  start: { lat: number; lon: number }
  end: { lat: number; lon: number }
  /** vessel draft + margin, meters */
  safetyM: number
  /** GeoJSON features: DEPARE polygons (must include drval1/drval2 props) */
  depthAreas: GeoJsonFeature[]
  /** GeoJSON features: land areas + other hard-block polygons */
  blockedAreas: GeoJsonFeature[]
  /** GeoJSON point features: wrecks, rocks, obstructions */
  hazardPoints: GeoJsonFeature[]
  /** grid resolution across the larger bbox dimension (default 240) */
  resolution?: number
}

export interface AutorouteResult {
  ok: boolean
  reason?: string
  /** [lon, lat] turn points including start & end */
  waypoints: Array<[number, number]>
  cellsBlocked: number
  cellsTotal: number
}

export interface GeoJsonFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown> | null
}

const SQRT2 = Math.SQRT2

export function cellIndex(spec: GridSpec, col: number, row: number): number {
  return row * spec.cols + col
}

export function cellCenter(spec: GridSpec, col: number, row: number): [number, number] {
  const lon = spec.minLon + ((col + 0.5) / spec.cols) * (spec.maxLon - spec.minLon)
  const lat = spec.minLat + ((row + 0.5) / spec.rows) * (spec.maxLat - spec.minLat)
  return [lon, lat]
}

export function pointToCell(spec: GridSpec, lon: number, lat: number): [number, number] {
  const col = Math.min(
    spec.cols - 1,
    Math.max(0, Math.floor(((lon - spec.minLon) / (spec.maxLon - spec.minLon)) * spec.cols)),
  )
  const row = Math.min(
    spec.rows - 1,
    Math.max(0, Math.floor(((lat - spec.minLat) / (spec.maxLat - spec.minLat)) * spec.rows)),
  )
  return [col, row]
}

export function makeGridSpec(input: AutorouteInput, padScale = 0.35): GridSpec {
  let minLon = Math.min(input.start.lon, input.end.lon)
  let maxLon = Math.max(input.start.lon, input.end.lon)
  let minLat = Math.min(input.start.lat, input.end.lat)
  let maxLat = Math.max(input.start.lat, input.end.lat)
  // Pad both axes by the route's overall span so a nearly straight-line
  // course still gets a grid wide enough to detour around large obstacles.
  const span = Math.max(maxLon - minLon, maxLat - minLat, 0.02)
  const pad = span * padScale
  minLon -= pad
  maxLon += pad
  minLat -= pad
  maxLat += pad

  const res = input.resolution ?? 240
  // keep cells roughly square on the ground (lon degrees shrink with cos(lat))
  const midLat = (minLat + maxLat) / 2
  const lonScale = Math.cos((midLat * Math.PI) / 180)
  const wDeg = (maxLon - minLon) * lonScale
  const hDeg = maxLat - minLat
  let cols: number
  let rows: number
  if (wDeg >= hDeg) {
    cols = res
    rows = Math.max(16, Math.round((res * hDeg) / wDeg))
  } else {
    rows = res
    cols = Math.max(16, Math.round((res * wDeg) / hDeg))
  }
  return { minLon, minLat, maxLon, maxLat, cols, rows }
}

/**
 * Build the navigability grid. A cell is passable only if a depth area covers
 * it AND its DRVAL1 clears the safety depth. Unknown water is treated as
 * blocked (conservative). Cells near blocked cells get a soft cost penalty so
 * routes prefer comfortable water over hugging the safety contour.
 */
export function buildGrid(input: AutorouteInput, padScale = 0.35): NavGrid {
  const spec = makeGridSpec(input, padScale)
  const n = spec.cols * spec.rows
  const cost = new Float32Array(n) // 0 = blocked

  const depthPolys = indexPolygons(input.depthAreas)
  const blockPolys = indexPolygons(input.blockedAreas)

  // Bucket polygons by grid column range to avoid O(cells × polys)
  const depthBuckets = bucketByColumn(spec, depthPolys)
  const blockBuckets = bucketByColumn(spec, blockPolys)

  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const [lon, lat] = cellCenter(spec, col, row)
      const i = cellIndex(spec, col, row)
      let blocked = false
      for (const p of blockBuckets[col]) {
        if (pointInIndexed(lon, lat, p)) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      // shallowest depth area covering this cell governs
      let d1: number | null = null
      for (const p of depthBuckets[col]) {
        if (!pointInIndexed(lon, lat, p)) continue
        const r = depthRange(p.props)
        if (!r) continue
        if (d1 === null || r.d1 < d1) d1 = r.d1
      }
      if (d1 === null) continue // unknown → blocked (conservative)
      if (d1 < input.safetyM) continue // too shallow

      // shallow-but-passable water costs more than deep water
      const clearance = d1 - input.safetyM
      cost[i] = clearance < 2 ? 1.6 : clearance < 5 ? 1.2 : 1
    }
  }

  // Hazard points (wrecks, rocks, obstructions): block the cell + neighbors.
  // A hazard with a charted sounding/swept depth (VALSOU) that clears the
  // safety depth is overflown by chart semantics — don't block on it.
  for (const f of input.hazardPoints) {
    const g = f.geometry
    if (!g || g.type !== 'Point') continue
    const valsou = numProp(f.properties ?? {}, 'valsou')
    if (valsou !== null && valsou >= input.safetyM + 0.5) continue
    const [lon, lat] = g.coordinates as [number, number]
    if (lon < spec.minLon || lon > spec.maxLon || lat < spec.minLat || lat > spec.maxLat) continue
    const [c, r] = pointToCell(spec, lon, lat)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < spec.rows && cc >= 0 && cc < spec.cols) {
          cost[cellIndex(spec, cc, rr)] = 0
        }
      }
    }
  }

  applyProximityPenalty(spec, cost)
  return { spec, cost }
}

function numProp(props: Record<string, unknown>, key: string): number | null {
  const v = props[key] ?? props[key.toUpperCase()]
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return isFinite(n) ? n : null
  }
  return null
}

function bucketByColumn(spec: GridSpec, polys: IndexedPoly[]): IndexedPoly[][] {
  const buckets: IndexedPoly[][] = Array.from({ length: spec.cols }, () => [])
  const lonPerCol = (spec.maxLon - spec.minLon) / spec.cols
  for (const p of polys) {
    const c0 = Math.max(0, Math.floor((p.bbox[0] - spec.minLon) / lonPerCol))
    const c1 = Math.min(spec.cols - 1, Math.floor((p.bbox[2] - spec.minLon) / lonPerCol))
    for (let c = c0; c <= c1; c++) buckets[c].push(p)
  }
  return buckets
}

/** Cells within 1–2 cells of a blocked cell get progressively higher cost. */
function applyProximityPenalty(spec: GridSpec, cost: Float32Array): void {
  const { cols, rows } = spec
  const near = new Uint8Array(cost.length) // rings of distance-to-blocked
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (cost[i] !== 0) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
          const j = rr * cols + cc
          const ring = Math.max(Math.abs(dr), Math.abs(dc))
          if (ring === 0) continue
          const level = ring === 1 ? 2 : 1
          if (near[j] < level) near[j] = level
        }
      }
    }
  }
  for (let i = 0; i < cost.length; i++) {
    if (cost[i] === 0) continue
    if (near[i] === 2) cost[i] *= 2.5
    else if (near[i] === 1) cost[i] *= 1.5
  }
}

/** A* over the grid, 8-connected. Returns cell indices from start to end. */
export function astar(grid: NavGrid, start: [number, number], end: [number, number]): number[] | null {
  const { spec, cost } = grid
  const { cols, rows } = spec
  const n = cols * rows
  const startI = cellIndex(spec, start[0], start[1])
  const endI = cellIndex(spec, end[0], end[1])
  if (cost[startI] === 0 || cost[endI] === 0) return null

  const g = new Float64Array(n).fill(Infinity)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  g[startI] = 0

  // binary heap of [f, index]
  const heap: number[] = []
  const heapF: number[] = []
  const push = (i: number, f: number) => {
    heap.push(i)
    heapF.push(f)
    let k = heap.length - 1
    while (k > 0) {
      const pIdx = (k - 1) >> 1
      if (heapF[pIdx] <= heapF[k]) break
      swap(k, pIdx)
      k = pIdx
    }
  }
  const swap = (a: number, b: number) => {
    ;[heap[a], heap[b]] = [heap[b], heap[a]]
    ;[heapF[a], heapF[b]] = [heapF[b], heapF[a]]
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap.pop()!
    const lastF = heapF.pop()!
    if (heap.length > 0) {
      heap[0] = last
      heapF[0] = lastF
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < heap.length && heapF[l] < heapF[m]) m = l
        if (r < heap.length && heapF[r] < heapF[m]) m = r
        if (m === k) break
        swap(k, m)
        k = m
      }
    }
    return top
  }

  const ec = end[0]
  const er = end[1]
  const h = (i: number) => {
    const c = i % cols
    const r = (i / cols) | 0
    const dc = Math.abs(c - ec)
    const dr = Math.abs(r - er)
    // octile distance
    return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr)
  }

  push(startI, h(startI))
  while (heap.length > 0) {
    const cur = pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === endI) {
      const path: number[] = []
      for (let i = endI; i !== -1; i = parent[i]) path.push(i)
      path.reverse()
      return path
    }
    const c = cur % cols
    const r = (cur / cols) | 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
        const j = rr * cols + cc
        if (closed[j] || cost[j] === 0) continue
        // prevent cutting a blocked corner diagonally
        if (dr !== 0 && dc !== 0) {
          if (cost[r * cols + cc] === 0 || cost[rr * cols + c] === 0) continue
        }
        const step = (dr !== 0 && dc !== 0 ? SQRT2 : 1) * ((cost[cur] + cost[j]) / 2)
        const ng = g[cur] + step
        if (ng < g[j]) {
          g[j] = ng
          parent[j] = cur
          push(j, ng + h(j))
        }
      }
    }
  }
  return null
}

/** Bresenham line-of-sight: true if every cell on the segment is passable. */
export function lineOfSight(grid: NavGrid, a: number, b: number): boolean {
  const cols = grid.spec.cols
  let c0 = a % cols
  let r0 = (a / cols) | 0
  const c1 = b % cols
  const r1 = (b / cols) | 0
  const dc = Math.abs(c1 - c0)
  const dr = Math.abs(r1 - r0)
  const sc = c0 < c1 ? 1 : -1
  const sr = r0 < r1 ? 1 : -1
  let err = dc - dr
  for (;;) {
    if (grid.cost[r0 * cols + c0] === 0) return false
    if (c0 === c1 && r0 === r1) return true
    const e2 = 2 * err
    if (e2 > -dr) {
      err -= dr
      c0 += sc
    }
    if (e2 < dc) {
      err += dc
      r0 += sr
    }
  }
}

/** Greedy shortcutting: keep only waypoints needed to preserve line-of-sight. */
export function smoothPath(grid: NavGrid, path: number[]): number[] {
  if (path.length <= 2) return path
  const out: number[] = [path[0]]
  let anchor = 0
  while (anchor < path.length - 1) {
    let far = anchor + 1
    for (let j = path.length - 1; j > anchor + 1; j--) {
      if (lineOfSight(grid, path[anchor], path[j])) {
        far = j
        break
      }
    }
    out.push(path[far])
    anchor = far
  }
  return out
}

export function autoroute(input: AutorouteInput): AutorouteResult {
  // Widen the search grid and retry when no path exists — a big detour may
  // need far more sea room than the start/end bbox suggests.
  let last: AutorouteResult = { ok: false, reason: 'No route', waypoints: [], cellsBlocked: 0, cellsTotal: 0 }
  for (const padScale of [0.35, 0.8, 1.4]) {
    last = attempt(input, padScale)
    if (last.ok || last.reason?.startsWith(UNREACHABLE_ENDPOINT)) return last
  }
  return last
}

const UNREACHABLE_ENDPOINT =
  'Start or destination is not in passable charted water for this draft.'

function attempt(input: AutorouteInput, padScale: number): AutorouteResult {
  const grid = buildGrid(input, padScale)
  const { spec, cost } = grid
  let blocked = 0
  for (let i = 0; i < cost.length; i++) if (cost[i] === 0) blocked++
  const base = { cellsBlocked: blocked, cellsTotal: cost.length }

  const startSnap = nearestPassable(grid, pointToCell(spec, input.start.lon, input.start.lat))
  const endSnap = nearestPassable(grid, pointToCell(spec, input.end.lon, input.end.lat))
  if (!startSnap || !endSnap) {
    const which = !startSnap && !endSnap ? 'Start and destination are' : !startSnap ? 'Start is' : 'Destination is'
    return {
      ok: false,
      reason: `${UNREACHABLE_ENDPOINT} (${which} too far from water that clears your safety depth — tap a point shown as safe/caution in the depth shading, or reduce the draft.)`,
      waypoints: [],
      ...base,
    }
  }
  const path = astar(grid, startSnap.cell, endSnap.cell)
  if (!path) {
    return {
      ok: false,
      reason: 'No passable route found at this draft/safety depth within the search area.',
      waypoints: [],
      ...base,
    }
  }
  const smoothed = smoothPath(grid, path)
  const waypoints = smoothed.map((i) => cellCenter(spec, i % spec.cols, (i / spec.cols) | 0))
  // Pin the exact tapped point only when it is (near) passable water; if the
  // endpoint had to snap more than a couple of cells, the route must end at
  // the snapped safe-water point — never silently cross the shallows between.
  if (startSnap.dist <= 2) waypoints[0] = [input.start.lon, input.start.lat]
  if (endSnap.dist <= 2) waypoints[waypoints.length - 1] = [input.end.lon, input.end.lat]
  return { ok: true, waypoints, ...base }
}

/** Find the nearest passable cell nearby (a start often sits on a dock or in
 * a slip that's blocked at grid resolution). Radius stays small on purpose:
 * a big snap would let the route pretend shallow water isn't there. */
function nearestPassable(
  grid: NavGrid,
  cell: [number, number],
): { cell: [number, number]; dist: number } | null {
  const { spec, cost } = grid
  const [c, r] = cell
  if (cost[cellIndex(spec, c, r)] !== 0) return { cell: [c, r], dist: 0 }
  for (let radius = 1; radius <= 6; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= spec.rows || cc < 0 || cc >= spec.cols) continue
        if (cost[cellIndex(spec, cc, rr)] !== 0) return { cell: [cc, rr], dist: radius }
      }
    }
  }
  return null
}
