// Great-circle math + formatting. Pure functions, unit-tested in geo.test.ts.

import type { LegStats, Route, RouteStats, Waypoint } from '../types'

const R_NM = 3440.065 // earth radius in nautical miles
const DEG = Math.PI / 180

export function toRad(d: number): number {
  return d * DEG
}

export function toDeg(r: number): number {
  return r / DEG
}

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial great-circle bearing, degrees true, 0..360. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Cross-track distance (nm) from point P to the great-circle leg A→B. */
export function crossTrackNm(
  latA: number, lonA: number,
  latB: number, lonB: number,
  latP: number, lonP: number,
): number {
  const d13 = distanceNm(latA, lonA, latP, lonP) / R_NM
  const θ13 = toRad(bearingDeg(latA, lonA, latP, lonP))
  const θ12 = toRad(bearingDeg(latA, lonA, latB, lonB))
  return Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * R_NM
}

export function routeStats(route: Route, cruiseKts: number, fuelGph: number): RouteStats {
  const legs: LegStats[] = []
  let totalNm = 0
  const wps = route.waypoints
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1]
    const b = wps[i]
    const d = distanceNm(a.lat, a.lon, b.lat, b.lon)
    const hours = cruiseKts > 0 ? d / cruiseKts : 0
    legs.push({
      distanceNm: d,
      bearingDeg: bearingDeg(a.lat, a.lon, b.lat, b.lon),
      timeHours: hours,
      fuelGal: hours * fuelGph,
    })
    totalNm += d
  }
  const totalHours = legs.reduce((s, l) => s + l.timeHours, 0)
  return {
    legs,
    totalNm,
    totalHours,
    totalFuelGal: legs.reduce((s, l) => s + l.fuelGal, 0),
  }
}

export function fmtNm(nm: number): string {
  return nm >= 10 ? `${nm.toFixed(1)} nm` : `${nm.toFixed(2)} nm`
}

export function fmtBearing(deg: number): string {
  return `${Math.round(deg).toString().padStart(3, '0')}°`
}

export function fmtDuration(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '—'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export function fmtLatLon(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => {
    const hemi = v >= 0 ? pos : neg
    const abs = Math.abs(v)
    const d = Math.floor(abs)
    const min = (abs - d) * 60
    return `${d}°${min.toFixed(3)}′${hemi}`
  }
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`
}

let idCounter = 0
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(
    performance.now() * 1000 % 46656,
  ).toString(36)}`
}

export function makeWaypoint(lat: number, lon: number, name?: string): Waypoint {
  return { id: newId('wp'), lat, lon, name }
}
