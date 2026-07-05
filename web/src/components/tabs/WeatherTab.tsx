import { useEffect, useState } from 'react'
import { fetchWeather, WMO_DESC, type WxReport } from '../../services/weather'
import { fmtBearing } from '../../lib/geo'
import { getMap } from '../../map/MapView'

export default function WeatherTab(): JSX.Element {
  const [wx, setWx] = useState<WxReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [where, setWhere] = useState('map center')

  const refresh = () => {
    const map = getMap()
    const c = map?.getCenter()
    if (!c) return
    setError(null)
    setWx(null)
    setWhere(`${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`)
    fetchWeather(c.lat, c.lng)
      .then(setWx)
      .catch(() => setError('Weather unavailable (offline?)'))
  }

  useEffect(refresh, [])

  return (
    <div>
      <div className="field-row">
        <span className="hint">At {where}</span>
        <button className="btn" onClick={refresh}>↻ Refresh</button>
      </div>
      {error && <p className="hint warn">{error}</p>}
      {!wx && !error && <p className="hint">Loading forecast…</p>}
      {wx?.current && (
        <div className="wx-now">
          <strong>{WMO_DESC[wx.current.code] ?? '—'}</strong> · {Math.round(wx.current.tempF)}°F ·
          wind {Math.round(wx.current.windKts)} kt {fmtBearing(wx.current.windDirDeg)} (gust{' '}
          {Math.round(wx.current.gustKts)} kt)
        </div>
      )}
      {wx && (
        <table className="stats">
          <thead>
            <tr><th>Day</th><th>Sky</th><th>°F</th><th>Wind kt</th><th>Waves ft</th></tr>
          </thead>
          <tbody>
            {wx.daily.map((d) => (
              <tr key={d.date}>
                <td>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</td>
                <td>{WMO_DESC[d.code] ?? '—'}</td>
                <td>{Math.round(d.tempMinF)}–{Math.round(d.tempMaxF)}</td>
                <td>
                  {Math.round(d.windMaxKts)}
                  <small> g{Math.round(d.gustMaxKts)}</small>
                </td>
                <td>{d.waveMaxFt === null ? '—' : d.waveMaxFt.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {wx && !wx.marineAvailable && (
        <p className="hint">No marine (wave) data for this point — pan over open water and refresh.</p>
      )}
      <p className="hint">Forecast: Open-Meteo (weather + marine). Cached data may be stale offline.</p>
    </div>
  )
}
