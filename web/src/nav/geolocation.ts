// Live position: geolocation watch + light filtering (spec §5.4). The
// reference app was criticized for erratic heading and tracks crossing land,
// so SOG/COG come from smoothed fix-to-fix vectors, jumpy fixes are rejected
// by accuracy gate, and the under-keel check warns when charted depth at the
// boat is below the safety depth.

import { distanceNm } from '../lib/geo'
import { newId } from '../lib/geo'
import { activeBoat, getState, saveTrack, setState } from '../state/store'
import { depthAtPoint, safetyDepthM } from '../lib/depth'
import { indexPolygons, type IndexedPoly } from '../lib/pip'
import type { GeoJsonFeature } from '../lib/autoroute'
import { FT_PER_M } from '../config'

let watchId: number | null = null
let lastGood: { lat: number; lon: number; t: number } | null = null
let sogEma: number | null = null
let cogSmoothed: number | null = null

/** DEPARE polygons near the viewport, shared by MapView's fetcher. */
let depthIndex: IndexedPoly[] = []
export function setDepthFeatures(depthAreas: GeoJsonFeature[]): void {
  depthIndex = indexPolygons(depthAreas)
}

export function startWatch(): void {
  if (watchId !== null || !('geolocation' in navigator)) return
  watchId = navigator.geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 15000,
  })
}

export function stopWatch(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  lastGood = null
  sogEma = null
  cogSmoothed = null
  setState({ fix: null, follow: false, shallowAlert: null })
}

function onError(): void {
  setState({ shallowAlert: null })
}

function onFix(pos: GeolocationPosition): void {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords
  const t = pos.timestamp
  if (accuracy > 100) return // reject junk fixes

  let sogKts: number | null = null
  let cogDeg: number | null = null
  if (lastGood && t > lastGood.t) {
    const dtH = (t - lastGood.t) / 3600_000
    const dNm = distanceNm(lastGood.lat, lastGood.lon, lat, lon)
    const raw = dtH > 0 ? dNm / dtH : 0
    if (raw > 80) return // impossible jump for a recreational boat → discard
    sogEma = sogEma === null ? raw : sogEma * 0.6 + raw * 0.4
    sogKts = sogEma
    if (sogEma > 0.5 && dNm > 0.001) {
      const brg = bearing(lastGood.lat, lastGood.lon, lat, lon)
      cogSmoothed = cogSmoothed === null ? brg : blendAngle(cogSmoothed, brg, 0.35)
      cogDeg = cogSmoothed
    } else {
      cogDeg = cogSmoothed
    }
  }
  lastGood = { lat, lon, t }

  const s = getState()
  const fix = { lat, lon, t, accuracy, sogKts, cogDeg }

  // track recording (append if moved > ~10 m or > 15 s since last point)
  let liveTrack = s.liveTrack
  if (s.recording) {
    if (!liveTrack) {
      liveTrack = {
        id: newId('tk'),
        name: `Track ${new Date().toLocaleDateString()}`,
        points: [],
        startedAt: t,
        updatedAt: t,
      }
    }
    const last = liveTrack.points[liveTrack.points.length - 1]
    if (!last || distanceNm(last.lat, last.lon, lat, lon) > 0.0054 || t - last.t > 15000) {
      liveTrack = {
        ...liveTrack,
        points: [...liveTrack.points, { lat, lon, t, sog: sogKts ?? undefined }],
        updatedAt: t,
      }
    }
  }

  // charted-depth alert under the boat
  let shallowAlert: string | null = null
  const boat = activeBoat(s)
  const safety = safetyDepthM(boat.draftFt, boat.safetyMarginFt)
  const d = depthAtPoint(lon, lat, depthIndex)
  if (d && d.d1 < safety) {
    shallowAlert = `Shallow water: charted depth here starts at ${(d.d1 * FT_PER_M).toFixed(1)} ft — safety depth is ${(safety * FT_PER_M).toFixed(1)} ft`
  }

  setState({ fix, liveTrack, shallowAlert })
}

export function stopRecording(): void {
  const s = getState()
  if (s.liveTrack && s.liveTrack.points.length >= 2) {
    saveTrack({ ...s.liveTrack, endedAt: Date.now() })
  }
  setState({ recording: false, liveTrack: null })
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const dλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function blendAngle(a: number, b: number, w: number): number {
  let diff = ((b - a + 540) % 360) - 180
  return (a + diff * w + 360) % 360
}
