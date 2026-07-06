// Adapter for NOAA ENC Direct to GIS (https://encdirect.noaa.gov).
// S-57 feature classes are exposed as ArcGIS MapServer layers per usage band.
// Layer IDs differ between bands and can change when NOAA republishes, so we
// discover them at runtime from /layers?f=json and match by name + geometry,
// caching the discovery for a day.

import { ENC_DIRECT_BANDS } from '../config'
import type { GeoJsonFeature } from '../lib/autoroute'

export type Band = keyof typeof ENC_DIRECT_BANDS

export interface FeatureSetKinds {
  depthAreas: GeoJsonFeature[]
  landAreas: GeoJsonFeature[]
  hazardPoints: GeoJsonFeature[]
  navaids: GeoJsonFeature[]
}

interface LayerInfo {
  id: number
  name: string
  geometryType?: string
}

// What we look for in each band's layer list. ENC Direct names look like
// "Approach.Depth_Area_area", "Harbour.Wrecks_point", etc.
const LAYER_MATCHERS: Record<keyof FeatureSetKinds, { re: RegExp; geom: string }[]> = {
  depthAreas: [{ re: /depth[_ ]?area/i, geom: 'esriGeometryPolygon' }],
  landAreas: [
    { re: /land[_ ]?area/i, geom: 'esriGeometryPolygon' },
    { re: /marine[_ ]?farm/i, geom: 'esriGeometryPolygon' },
  ],
  hazardPoints: [
    { re: /wrecks?/i, geom: 'esriGeometryPoint' },
    { re: /underwater.*rock|rocks?[_ ]?awash|underwater[_ ]?hazard/i, geom: 'esriGeometryPoint' },
    { re: /obstruction/i, geom: 'esriGeometryPoint' },
  ],
  navaids: [
    { re: /buoy/i, geom: 'esriGeometryPoint' },
    { re: /beacon/i, geom: 'esriGeometryPoint' },
    { re: /^(?!.*sector).*light/i, geom: 'esriGeometryPoint' },
  ],
}

async function discoverLayers(band: Band): Promise<Record<keyof FeatureSetKinds, number[]>> {
  const cacheKey = `soundline.enclayers.${band}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { at, ids } = JSON.parse(cached)
      if (Date.now() - at < 24 * 3600_000) return ids
    }
  } catch {
    /* re-discover */
  }
  const res = await fetch(`${ENC_DIRECT_BANDS[band]}/layers?f=json`)
  if (!res.ok) throw new Error(`ENC Direct layer discovery failed (${res.status})`)
  const data = (await res.json()) as { layers?: LayerInfo[] }
  const layers = data.layers ?? []
  const ids = {} as Record<keyof FeatureSetKinds, number[]>
  for (const kind of Object.keys(LAYER_MATCHERS) as Array<keyof FeatureSetKinds>) {
    ids[kind] = []
    for (const m of LAYER_MATCHERS[kind]) {
      for (const l of layers) {
        if (m.re.test(l.name) && (!l.geometryType || l.geometryType === m.geom)) {
          if (!ids[kind].includes(l.id)) ids[kind].push(l.id)
        }
      }
    }
  }
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), ids }))
  } catch {
    /* ok */
  }
  return ids
}

export type Bbox = [number, number, number, number] // minLon, minLat, maxLon, maxLat

async function queryLayer(band: Band, layerId: number, bbox: Bbox): Promise<GeoJsonFeature[]> {
  const features: GeoJsonFeature[] = []
  const pageSize = 1000
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: bbox.join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'true',
      resultOffset: String(page * pageSize),
      resultRecordCount: String(pageSize),
      f: 'geojson',
    })
    const res = await fetch(`${ENC_DIRECT_BANDS[band]}/${layerId}/query?${params}`)
    if (!res.ok) throw new Error(`ENC Direct query failed (${res.status})`)
    const data = (await res.json()) as {
      features?: GeoJsonFeature[]
      exceededTransferLimit?: boolean
      properties?: { exceededTransferLimit?: boolean }
      error?: { message?: string }
    }
    if (data.error) throw new Error(data.error.message ?? 'ENC Direct query error')
    const batch = data.features ?? []
    features.push(...batch)
    const more = data.exceededTransferLimit ?? data.properties?.exceededTransferLimit ?? false
    if (!more || batch.length === 0) break
  }
  return features
}

async function queryKind(band: Band, kind: keyof FeatureSetKinds, bbox: Bbox): Promise<GeoJsonFeature[]> {
  const ids = await discoverLayers(band)
  const results = await Promise.allSettled(ids[kind].map((id) => queryLayer(band, id, bbox)))
  const out: GeoJsonFeature[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value)
  }
  return out
}

/**
 * Fetch everything the map + router needs for a viewport. Harbour band only
 * makes sense zoomed in; approach band covers the rest of a sound-scale view.
 */
export async function fetchEncFeatures(bbox: Bbox, includeHarbour: boolean): Promise<FeatureSetKinds> {
  const bands: Band[] = includeHarbour ? ['approach', 'harbour'] : ['approach']
  const kinds: Array<keyof FeatureSetKinds> = ['depthAreas', 'landAreas', 'hazardPoints', 'navaids']
  const all = await Promise.all(
    bands.flatMap((band) => kinds.map(async (kind) => ({ kind, features: await queryKind(band, kind, bbox) }))),
  )
  const out: FeatureSetKinds = { depthAreas: [], landAreas: [], hazardPoints: [], navaids: [] }
  for (const { kind, features } of all) out[kind].push(...features)
  return out
}
