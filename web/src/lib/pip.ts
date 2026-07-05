// Point-in-polygon (even-odd ray cast) over GeoJSON Polygon / MultiPolygon.
// Used for depth lookups under the boat and for autoroute grid rasterization.

export type Ring = number[][] // [lon, lat][]
export type PolyCoords = Ring[] // outer ring + holes

export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Point in polygon-with-holes. */
export function pointInPolygon(lon: number, lat: number, poly: PolyCoords): boolean {
  if (poly.length === 0 || !pointInRing(lon, lat, poly[0])) return false
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(lon, lat, poly[h])) return false
  }
  return true
}

export interface IndexedPoly {
  polys: PolyCoords[]
  bbox: [number, number, number, number] // minLon, minLat, maxLon, maxLat
  props: Record<string, unknown>
}

export function ringBbox(rings: PolyCoords[]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const poly of rings) {
    for (const [x, y] of poly[0] ?? []) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

/** Flatten GeoJSON features (Polygon/MultiPolygon) into bbox-indexed entries. */
export function indexPolygons(
  features: Array<{ geometry: { type: string; coordinates: unknown } | null; properties: unknown }>,
): IndexedPoly[] {
  const out: IndexedPoly[] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    let polys: PolyCoords[] = []
    if (g.type === 'Polygon') polys = [g.coordinates as PolyCoords]
    else if (g.type === 'MultiPolygon') polys = g.coordinates as PolyCoords[]
    else continue
    out.push({
      polys,
      bbox: ringBbox(polys),
      props: (f.properties ?? {}) as Record<string, unknown>,
    })
  }
  return out
}

export function pointInIndexed(lon: number, lat: number, entry: IndexedPoly): boolean {
  const [minX, minY, maxX, maxY] = entry.bbox
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false
  for (const poly of entry.polys) {
    if (pointInPolygon(lon, lat, poly)) return true
  }
  return false
}
