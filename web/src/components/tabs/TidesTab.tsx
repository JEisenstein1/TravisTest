import { useEffect, useMemo, useState } from 'react'
import { fetchTidePredictions, fetchTideStations, type TideEvent, type TideCurvePoint, type TideStation } from '../../services/coops'
import { distanceNm } from '../../lib/geo'
import { getMap } from '../../map/MapView'
import { setState, useApp } from '../../state/store'

export default function TidesTab(): JSX.Element {
  const s = useApp()
  const [stations, setStations] = useState<TideStation[]>([])
  const [events, setEvents] = useState<TideEvent[]>([])
  const [curve, setCurve] = useState<TideCurvePoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTideStations().then(setStations).catch(() => setError('Station list unavailable (offline?)'))
  }, [])

  // nearest stations to map center
  const nearest = useMemo(() => {
    const map = getMap()
    const c = map?.getCenter()
    if (!c) return stations.slice(0, 10)
    return [...stations]
      .map((st) => ({ st, d: distanceNm(c.lat, c.lng, st.lat, st.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map((x) => x.st)
  }, [stations, s.panel])

  const selected = stations.find((st) => st.id === s.selectedStationId) ?? nearest[0]

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setError(null)
    fetchTidePredictions(selected.id)
      .then((r) => {
        setEvents(r.events)
        setCurve(r.curve)
      })
      .catch(() => setError('Predictions unavailable (offline?)'))
      .finally(() => setLoading(false))
  }, [selected?.id])

  return (
    <div>
      <label className="field">
        Station (nearest first)
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setState({ selectedStationId: e.target.value })}
        >
          {nearest.map((st) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
          {selected && !nearest.some((n) => n.id === selected.id) && (
            <option value={selected.id}>{selected.name}</option>
          )}
        </select>
      </label>
      {loading && <p className="hint">Loading 7-day predictions…</p>}
      {error && <p className="hint warn">{error}</p>}
      {curve.length > 0 && <TideCurve curve={curve} />}
      {events.length > 0 && (
        <table className="stats">
          <thead>
            <tr><th>Time</th><th>Tide</th><th>Height</th></tr>
          </thead>
          <tbody>
            {events.map((ev, i) => (
              <tr key={i}>
                <td>{ev.t}</td>
                <td>{ev.type === 'H' ? 'High' : 'Low'}</td>
                <td>{ev.valueFt.toFixed(1)} ft</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Predictions: NOAA CO-OPS, datum MLLW, station local time.</p>
    </div>
  )
}

function TideCurve({ curve }: { curve: TideCurvePoint[] }): JSX.Element {
  const w = 300
  const h = 90
  const vals = curve.map((c) => c.valueFt)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = Math.max(max - min, 0.1)
  const pts = curve
    .map((c, i) => `${((i / (curve.length - 1)) * w).toFixed(1)},${(h - 8 - ((c.valueFt - min) / span) * (h - 16)).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tide-curve" role="img" aria-label="7-day tide curve">
      <polyline points={pts} fill="none" stroke="#3fa7ff" strokeWidth="1.5" />
      <text x="4" y="12" className="tide-label">{max.toFixed(1)} ft</text>
      <text x="4" y={h - 2} className="tide-label">{min.toFixed(1)} ft</text>
    </svg>
  )
}
