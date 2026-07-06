import { useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { setState, useApp } from '../state/store'
import { searchPlaces, type SearchHit } from '../services/nominatim'
import { getMap } from '../map/MapView'
import type { AppState, } from '../state/store'
import type { BaseLayer } from '../types'

const PANELS: Array<{ id: NonNullable<AppState['panel']>; label: string }> = [
  { id: 'boat', label: 'Boat' },
  { id: 'route', label: 'Routes' },
  { id: 'tides', label: 'Tides' },
  { id: 'weather', label: 'Weather' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'sync', label: 'Sync' },
]

export default function TopBar(): JSX.Element {
  const s = useApp()
  const [layersOpen, setLayersOpen] = useState(false)

  return (
    <div className="topbar">
      <div className="brand" title="Soundline — recreational marine navigation">
        <span className="brand-mark">⚓</span> Soundline
      </div>
      <SearchBox />
      <div className="topbar-right">
        <button className={`btn${layersOpen ? ' active' : ''}`} onClick={() => setLayersOpen(!layersOpen)}>
          Layers
        </button>
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={`btn${s.panel === p.id ? ' active' : ''}`}
            onClick={() => setState({ panel: s.panel === p.id ? null : p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
      {layersOpen && <LayerMenu onClose={() => setLayersOpen(false)} />}
    </div>
  )
}

function LayerMenu({ onClose }: { onClose: () => void }): JSX.Element {
  const s = useApp()
  const p = s.prefs
  const set = (patch: Partial<typeof p>) => setState({ prefs: { ...p, ...patch } })

  return (
    <div className="layer-menu panel-card">
      <div className="panel-head">
        <strong>Map layers</strong>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="field-row">
        {(['standard', 'satellite', 'terrain'] as BaseLayer[]).map((b) => (
          <button
            key={b}
            className={`btn${p.baseLayer === b ? ' active' : ''}`}
            onClick={() => set({ baseLayer: b })}
          >
            {b[0].toUpperCase() + b.slice(1)}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={p.encChart} onChange={(e) => set({ encChart: e.target.checked })} />
        NOAA ENC chart overlay
      </label>
      {p.encChart && (
        <label className="slider">
          Chart opacity
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={p.encOpacity}
            onChange={(e) => set({ encOpacity: Number(e.target.value) })}
          />
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={p.depthShading}
          onChange={(e) => set({ depthShading: e.target.checked })}
        />
        Draft-aware depth shading
      </label>
      <label className="check">
        <input type="checkbox" checked={p.hazards} onChange={(e) => set({ hazards: e.target.checked })} />
        Hazards & navaids
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={p.tideStations}
          onChange={(e) => set({ tideStations: e.target.checked })}
        />
        Tide stations
      </label>
      <div className="field-row">
        {(['day', 'night', 'auto'] as const).map((m) => (
          <button
            key={m}
            className={`btn${p.nightMode === m ? ' active' : ''}`}
            onClick={() => set({ nightMode: m })}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchBox(): JSX.Element {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = (text: string) => {
    setQ(text)
    if (timer.current) clearTimeout(timer.current)
    if (text.trim().length < 3) {
      setHits([])
      return
    }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try {
        const map = getMap()
        const b = map?.getBounds()
        const vb = b
          ? ([b.getWest(), b.getNorth(), b.getEast(), b.getSouth()] as [number, number, number, number])
          : undefined
        setHits(await searchPlaces(text, vb))
      } catch {
        setHits([])
      } finally {
        setBusy(false)
      }
    }, 450)
  }

  const go = (h: SearchHit) => {
    setHits([])
    setQ(h.name.split(',')[0])
    const map = getMap()
    if (!map) return
    map.flyTo({ center: [h.lon, h.lat], zoom: Math.max(map.getZoom(), 13) })
    const src = map.getSource('search-hit') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [h.lon, h.lat] }, properties: {} },
      ],
    })
  }

  return (
    <div className="search">
      <input
        value={q}
        placeholder="Search marinas, harbors, places…"
        onChange={(e) => run(e.target.value)}
      />
      {busy && <span className="search-busy">…</span>}
      {hits.length > 0 && (
        <div className="search-results panel-card">
          {hits.map((h, i) => (
            <button key={i} className="search-hit" onClick={() => go(h)}>
              <span>{h.name}</span>
              <small>{h.kind}</small>
            </button>
          ))}
          <small className="attribution">Search © OpenStreetMap / Nominatim</small>
        </div>
      )}
    </div>
  )
}
