// GPX 1.1 import/export (spec §9). Round-trips routes (<rte>), tracks (<trk>)
// and standalone waypoints (<wpt>) with chartplotters and other apps.

import type { Route, Track, Waypoint } from '../types'
import { newId } from './geo'

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const GPX_OPEN =
  '<gpx version="1.1" creator="Soundline" xmlns="http://www.topografix.com/GPX/1/1">'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function routeToGpx(route: Route): string {
  const pts = route.waypoints
    .map(
      (wp, i) =>
        `    <rtept lat="${wp.lat.toFixed(6)}" lon="${wp.lon.toFixed(6)}">\n` +
        `      <name>${esc(wp.name ?? `WP${i + 1}`)}</name>\n` +
        `    </rtept>`,
    )
    .join('\n')
  return `${XML_HEADER}\n${GPX_OPEN}\n  <rte>\n    <name>${esc(route.name)}</name>\n${pts}\n  </rte>\n</gpx>\n`
}

export function trackToGpx(track: Track): string {
  const pts = track.points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
        `<time>${new Date(p.t).toISOString()}</time></trkpt>`,
    )
    .join('\n')
  return `${XML_HEADER}\n${GPX_OPEN}\n  <trk>\n    <name>${esc(track.name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`
}

export interface GpxImport {
  routes: Route[]
  tracks: Track[]
  waypoints: Waypoint[]
}

/** Parse a GPX document (browser DOMParser). Tolerant of missing names. */
export function parseGpx(xml: string, now: number = Date.now()): GpxImport {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Not a valid GPX/XML file')

  const text = (el: Element | null | undefined, sel: string): string | undefined =>
    el?.querySelector(sel)?.textContent?.trim() || undefined

  const readPt = (el: Element): Waypoint | null => {
    const lat = Number(el.getAttribute('lat'))
    const lon = Number(el.getAttribute('lon'))
    if (!isFinite(lat) || !isFinite(lon)) return null
    return { id: newId('wp'), lat, lon, name: text(el, 'name') }
  }

  const routes: Route[] = []
  doc.querySelectorAll('rte').forEach((rte, ri) => {
    const wps: Waypoint[] = []
    rte.querySelectorAll('rtept').forEach((pt) => {
      const wp = readPt(pt)
      if (wp) wps.push(wp)
    })
    if (wps.length >= 2) {
      routes.push({
        id: newId('rt'),
        name: text(rte, 'name') ?? `Imported route ${ri + 1}`,
        kind: 'manual',
        waypoints: wps,
        reviewed: true,
        createdAt: now,
        updatedAt: now,
      })
    }
  })

  const tracks: Track[] = []
  doc.querySelectorAll('trk').forEach((trk, ti) => {
    const points: Track['points'] = []
    trk.querySelectorAll('trkpt').forEach((pt) => {
      const lat = Number(pt.getAttribute('lat'))
      const lon = Number(pt.getAttribute('lon'))
      if (!isFinite(lat) || !isFinite(lon)) return
      const t = Date.parse(pt.querySelector('time')?.textContent ?? '') || now
      points.push({ lat, lon, t })
    })
    if (points.length >= 2) {
      tracks.push({
        id: newId('tk'),
        name: text(trk, 'name') ?? `Imported track ${ti + 1}`,
        points,
        startedAt: points[0].t,
        endedAt: points[points.length - 1].t,
        updatedAt: now,
      })
    }
  })

  const waypoints: Waypoint[] = []
  doc.querySelectorAll(':scope > wpt, gpx > wpt').forEach((pt) => {
    const wp = readPt(pt)
    if (wp) waypoints.push(wp)
  })

  return { routes, tracks, waypoints }
}

export function downloadFile(name: string, content: string, mime = 'application/gpx+xml'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
