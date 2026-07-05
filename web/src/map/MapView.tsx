// The map shell: MapLibre GL + NOAA chart overlay + ENC Direct vector
// overlays + route editing + live position. All app state flows through
// state/store.ts; this component reconciles it onto the map.

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DISCLAIMER_SHORT, HOME } from '../config'
import { buildStyle, depthFillColor } from './mapStyle'
import {
  activeBoat,
  getState,
  setState,
  subscribe,
  type AppState,
} from '../state/store'
import { fetchEncFeatures, type Bbox, type FeatureSetKinds } from '../services/encdirect'
import { fetchTideStations, type TideStation } from '../services/coops'
import { safetyDepthM } from '../lib/depth'
import { makeWaypoint } from '../lib/geo'
import { setDepthFeatures } from '../nav/geolocation'
import type { AutorouteInput, AutorouteResult } from '../lib/autoroute'

let mapSingleton: maplibregl.Map | null = null
export function getMap(): maplibregl.Map | null {
  return mapSingleton
}

// Cache of the last fetched ENC vector features (viewport-driven); reused by
// the autoroute worker and the under-keel alert.
const encCache: { bbox: Bbox | null; harbour: boolean; features: FeatureSetKinds | null } = {
  bbox: null,
  harbour: false,
  features: null,
}

function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  )
}

function expandBbox(b: Bbox, f: number): Bbox {
  const w = (b[2] - b[0]) * f
  const h = (b[3] - b[1]) * f
  return [b[0] - w, b[1] - h, b[2] + w, b[3] + h]
}

async function ensureEncFeatures(bbox: Bbox, harbour: boolean): Promise<FeatureSetKinds> {
  if (
    encCache.features &&
    encCache.bbox &&
    bboxContains(encCache.bbox, bbox) &&
    (encCache.harbour || !harbour)
  ) {
    return encCache.features
  }
  const fetchBox = expandBbox(bbox, 0.2)
  const features = await fetchEncFeatures(fetchBox, harbour)
  encCache.bbox = fetchBox
  encCache.harbour = harbour
  encCache.features = features
  setDepthFeatures(features.depthAreas)
  return features
}

function fc(features: unknown[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: features as GeoJSON.Feature[] }
}

function setSrc(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection): void {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data)
}

/** ENC attribute values are external data — escape before building popup HTML. */
function escHtml(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function MapView(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: buildStyle(),
      center: [HOME.lon, HOME.lat],
      zoom: HOME.zoom,
      attributionControl: { compact: true },
    })
    mapSingleton = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-right')

    const wpMarkers = new Map<string, maplibregl.Marker>()
    let boatMarker: maplibregl.Marker | null = null
    let allStations: TideStation[] = []
    let encInFlight = false
    let encRefreshQueued = false
    let disposed = false

    const worker = new Worker(new URL('../workers/autorouteWorker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<AutorouteResult>) => {
      const r = e.data
      setState((s) => ({
        autoroute: r.ok
          ? { ...s.autoroute, status: 'review', waypoints: r.waypoints }
          : { ...s.autoroute, status: 'error', reason: r.reason, waypoints: [] },
      }))
    }

    // ---------- viewport-driven ENC + tide station refresh ----------

    const refreshOverlays = async () => {
      if (disposed) return
      const s = getState()
      const zoom = map.getZoom()
      const b = map.getBounds()
      const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]

      if (s.prefs.tideStations) {
        try {
          if (allStations.length === 0) allStations = await fetchTideStations()
          const visible = allStations
            .filter((st) => st.lon >= bbox[0] && st.lon <= bbox[2] && st.lat >= bbox[1] && st.lat <= bbox[3])
            .slice(0, 80)
          setSrc(
            map,
            'tide-stations',
            fc(
              visible.map((st) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [st.lon, st.lat] },
                properties: { id: st.id, name: st.name },
              })),
            ),
          )
        } catch {
          /* offline — keep whatever is displayed */
        }
      }

      const wantEnc = s.prefs.depthShading || s.prefs.hazards
      if (wantEnc && zoom >= 10) {
        if (encInFlight) {
          // a fetch for an older viewport is running — run again when it ends
          encRefreshQueued = true
          return
        }
        encInFlight = true
        setState({ depthStatus: 'Loading ENC depth data…' })
        try {
          const features = await ensureEncFeatures(bbox, zoom >= 13)
          if (disposed) return
          setSrc(map, 'depth-areas', fc(features.depthAreas))
          setSrc(map, 'hazards', fc(features.hazardPoints))
          setSrc(map, 'navaids', fc(features.navaids))
          setState({
            depthStatus: `${features.depthAreas.length} depth areas · ${features.hazardPoints.length} hazards`,
          })
        } catch (err) {
          setState({
            depthStatus: `ENC data unavailable (${err instanceof Error ? err.message : 'offline?'})`,
          })
        } finally {
          encInFlight = false
          if (encRefreshQueued && !disposed) {
            // the map moved while we were fetching — refresh for the current
            // viewport (cheap when the last fetch already covers it)
            encRefreshQueued = false
            void refreshOverlays()
          }
        }
      } else if (wantEnc) {
        setState({ depthStatus: 'Zoom in for depth shading' })
      }
    }

    map.on('load', () => {
      applyPrefs(getState())
      applyDepthPaint(getState())
      void refreshOverlays()
    })
    map.on('moveend', () => void refreshOverlays())

    // ---------- pointer interactions ----------

    map.on('click', (e) => {
      const s = getState()
      const { lng, lat } = e.lngLat
      if (s.autoroute.status === 'picking-start') {
        setState({ autoroute: { ...s.autoroute, start: [lng, lat], status: 'picking-end' } })
        return
      }
      if (s.autoroute.status === 'picking-end') {
        setState({
          autoroute: { ...s.autoroute, end: [lng, lat], status: 'computing', waypoints: [] },
        })
        return
      }
      if (s.routingMode) {
        setState({ draftWaypoints: [...s.draftWaypoints, makeWaypoint(lat, lng)] })
        return
      }
      // feature popups
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ['tide-stations', 'hazards', 'navaids'].filter((l) => map.getLayer(l)),
      })
      const hit = hits[0]
      if (!hit) return
      if (hit.layer.id === 'tide-stations') {
        setState({ selectedStationId: String(hit.properties?.id), panel: 'tides' })
        return
      }
      const props = hit.properties ?? {}
      const rows = Object.entries(props)
        .filter(([k, v]) => v !== null && v !== '' && !/^(objl|shape|fid|objectid)/i.test(k))
        .slice(0, 8)
        .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`)
        .join('')
      new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="popup"><strong>${hit.layer.id === 'hazards' ? '⚠ Charted hazard' : 'Aid to navigation'}</strong>` +
            `<table>${rows}</table><em>${DISCLAIMER_SHORT}</em></div>`,
        )
        .addTo(map)
    })

    // ---------- store → map reconciliation ----------

    let prev = getState()

    function applyPrefs(s: AppState): void {
      if (!map.isStyleLoaded()) return
      const vis = (id: string, on: boolean) =>
        map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      vis('base-standard', s.prefs.baseLayer === 'standard')
      vis('base-satellite', s.prefs.baseLayer === 'satellite')
      vis('base-terrain', s.prefs.baseLayer === 'terrain')
      vis('noaa-enc', s.prefs.encChart)
      map.setPaintProperty('noaa-enc', 'raster-opacity', s.prefs.encOpacity)
      vis('depth-fill', s.prefs.depthShading)
      vis('depth-outline', s.prefs.depthShading)
      vis('hazards', s.prefs.hazards)
      vis('navaids', s.prefs.hazards)
      vis('tide-stations', s.prefs.tideStations)
    }

    function applyDepthPaint(s: AppState): void {
      if (!map.isStyleLoaded()) return
      const boat = activeBoat(s)
      const safety = safetyDepthM(boat.draftFt, boat.safetyMarginFt)
      map.setPaintProperty('depth-fill', 'fill-color', depthFillColor(safety) as never)
    }

    function syncWaypoints(s: AppState): void {
      const wps = s.draftWaypoints
      const seen = new Set<string>()
      wps.forEach((wp, i) => {
        seen.add(wp.id)
        let m = wpMarkers.get(wp.id)
        if (!m) {
          const el = document.createElement('div')
          el.className = 'wp-marker'
          m = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([wp.lon, wp.lat])
            .addTo(map)
          m.on('dragend', () => {
            const ll = m!.getLngLat()
            setState((st) => ({
              draftWaypoints: st.draftWaypoints.map((w) =>
                w.id === wp.id ? { ...w, lat: ll.lat, lon: ll.lng } : w,
              ),
            }))
          })
          const marker = m
          el.addEventListener('contextmenu', (ev) => {
            ev.preventDefault()
            marker.remove()
            wpMarkers.delete(wp.id)
            setState((st) => ({ draftWaypoints: st.draftWaypoints.filter((w) => w.id !== wp.id) }))
          })
          wpMarkers.set(wp.id, m)
        } else {
          m.setLngLat([wp.lon, wp.lat])
        }
        const el = m.getElement()
        el.textContent = String(i + 1)
      })
      for (const [id, m] of wpMarkers) {
        if (!seen.has(id)) {
          m.remove()
          wpMarkers.delete(id)
        }
      }
      setSrc(
        map,
        'route-line',
        wps.length >= 2
          ? fc([
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: wps.map((w) => [w.lon, w.lat]) },
                properties: {},
              },
            ])
          : fc([]),
      )
    }

    function syncAutoroutePreview(s: AppState): void {
      const a = s.autoroute
      setSrc(
        map,
        'autoroute-preview',
        a.waypoints.length >= 2
          ? fc([
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: a.waypoints },
                properties: {},
              },
            ])
          : fc([]),
      )
    }

    function syncTracks(s: AppState): void {
      setSrc(
        map,
        'track-live',
        s.liveTrack && s.liveTrack.points.length >= 2
          ? fc([
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: s.liveTrack.points.map((p) => [p.lon, p.lat]),
                },
                properties: {},
              },
            ])
          : fc([]),
      )
      setSrc(
        map,
        'tracks-saved',
        fc(
          s.tracks
            .filter((t) => t.points.length >= 2)
            .map((t) => ({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: t.points.map((p) => [p.lon, p.lat]) },
              properties: { name: t.name },
            })),
        ),
      )
    }

    function syncFix(s: AppState): void {
      if (s.fix) {
        if (!boatMarker) {
          const el = document.createElement('div')
          el.className = 'boat-marker'
          el.innerHTML =
            '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 1 L19 21 L12 16 L5 21 Z" fill="#2bd9c7" stroke="#03312b" stroke-width="1.5"/></svg>'
          boatMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
            .setLngLat([s.fix.lon, s.fix.lat])
            .addTo(map)
        }
        boatMarker.setLngLat([s.fix.lon, s.fix.lat])
        boatMarker.setRotation(s.fix.cogDeg ?? 0)
        if (s.follow) {
          map.easeTo({ center: [s.fix.lon, s.fix.lat], duration: 800 })
        }
      } else if (boatMarker) {
        boatMarker.remove()
        boatMarker = null
      }
    }

    function maybeCompute(s: AppState): void {
      const a = s.autoroute
      if (a.status !== 'computing' || !a.start || !a.end) return
      const boat = activeBoat(s)
      const bbox: Bbox = [
        Math.min(a.start[0], a.end[0]),
        Math.min(a.start[1], a.end[1]),
        Math.max(a.start[0], a.end[0]),
        Math.max(a.start[1], a.end[1]),
      ]
      const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1])
      void ensureEncFeatures(expandBbox(bbox, 0.5), span < 0.25)
        .then((features) => {
          const input: AutorouteInput = {
            start: { lon: a.start![0], lat: a.start![1] },
            end: { lon: a.end![0], lat: a.end![1] },
            safetyM: safetyDepthM(boat.draftFt, boat.safetyMarginFt),
            depthAreas: features.depthAreas,
            blockedAreas: features.landAreas,
            hazardPoints: features.hazardPoints,
          }
          worker.postMessage(input)
        })
        .catch((err) => {
          setState((st) => ({
            autoroute: {
              ...st.autoroute,
              status: 'error',
              reason: `Could not load chart data: ${err instanceof Error ? err.message : err}`,
            },
          }))
        })
    }

    const unsub = subscribe(() => {
      const s = getState()
      if (s.prefs !== prev.prefs || s.activeBoatId !== prev.activeBoatId) applyPrefs(s)
      if (
        s.boats !== prev.boats ||
        s.activeBoatId !== prev.activeBoatId ||
        s.prefs !== prev.prefs
      ) {
        applyDepthPaint(s)
      }
      if (s.draftWaypoints !== prev.draftWaypoints) syncWaypoints(s)
      if (s.autoroute !== prev.autoroute) {
        syncAutoroutePreview(s)
        if (s.autoroute.status === 'computing' && prev.autoroute.status !== 'computing') {
          maybeCompute(s)
        }
      }
      if (s.liveTrack !== prev.liveTrack || s.tracks !== prev.tracks) syncTracks(s)
      if (s.fix !== prev.fix || s.follow !== prev.follow) syncFix(s)
      const cursorOn =
        s.routingMode || s.autoroute.status === 'picking-start' || s.autoroute.status === 'picking-end'
      map.getCanvas().style.cursor = cursorOn ? 'crosshair' : ''
      prev = s
    })

    return () => {
      disposed = true
      unsub()
      worker.terminate()
      map.remove()
      mapSingleton = null
    }
  }, [])

  return <div ref={containerRef} className="map-container" />
}
