import { useRef, useState } from 'react'
import { DISCLAIMER_LONG } from '../../config'
import { fmtBearing, fmtDuration, fmtNm, newId, routeStats } from '../../lib/geo'
import { downloadFile, parseGpx, routeToGpx } from '../../lib/gpx'
import {
  activeBoat,
  deleteRoute,
  saveRoute,
  saveTrack,
  setState,
  useApp,
} from '../../state/store'
import type { Route } from '../../types'
import { getMap } from '../../map/MapView'

export default function RouteTab(): JSX.Element {
  const s = useApp()
  const boat = activeBoat(s)
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const draftRoute: Route = {
    id: s.editingRouteId ?? 'draft',
    name: name || 'New route',
    kind: 'manual',
    waypoints: s.draftWaypoints,
    reviewed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const stats = routeStats(draftRoute, boat.cruiseKts, boat.fuelGph)

  const save = () => {
    if (s.draftWaypoints.length < 2) return
    const existing = s.routes.find((r) => r.id === s.editingRouteId)
    const route: Route = existing
      ? { ...existing, waypoints: s.draftWaypoints, updatedAt: Date.now() }
      : {
          id: newId('rt'),
          name: name.trim() || `Route ${s.routes.length + 1}`,
          kind: 'manual',
          waypoints: s.draftWaypoints,
          reviewed: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
    saveRoute(route)
    setState({ editingRouteId: route.id })
    setName('')
  }

  const load = (r: Route) => {
    setState({
      draftWaypoints: r.waypoints.map((w) => ({ ...w })),
      editingRouteId: r.id,
      routingMode: false,
    })
    const map = getMap()
    if (map && r.waypoints.length >= 2) {
      const lons = r.waypoints.map((w) => w.lon)
      const lats = r.waypoints.map((w) => w.lat)
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 80, maxZoom: 14 },
      )
    }
  }

  const importGpx = async (file: File) => {
    try {
      const parsed = parseGpx(await file.text())
      parsed.routes.forEach(saveRoute)
      let imported = parsed.routes.length
      // waypoint-only files become a route if there are 2+ points
      if (parsed.routes.length === 0 && parsed.waypoints.length >= 2) {
        saveRoute({
          id: newId('rt'),
          name: file.name.replace(/\.gpx$/i, ''),
          kind: 'manual',
          waypoints: parsed.waypoints,
          reviewed: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        imported = 1
      }
      // tracks land in the Tracks tab
      parsed.tracks.forEach(saveTrack)
      alert(`Imported ${imported} route(s), ${parsed.tracks.length} track(s).`)
    } catch (err) {
      alert(`GPX import failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <div>
      <section>
        <h3>Plan a route</h3>
        <div className="field-row">
          <button
            className={`btn${s.routingMode ? ' active' : ''}`}
            onClick={() => setState({ routingMode: !s.routingMode, autoroute: { waypoints: [], status: 'idle' } })}
          >
            {s.routingMode ? '✓ Tap map to add waypoints' : '✎ Manual route'}
          </button>
          <AutorouteButton />
        </div>
        <p className="hint">
          Manual: tap the map to drop waypoints; drag to adjust, right-click a waypoint to delete.
          Autoroute: pick start and end; the route avoids charted water shallower than your safety
          depth and charted hazards, then <strong>requires your review</strong>.
        </p>
        <AutorouteStatus />
        {s.draftWaypoints.length >= 2 && (
          <>
            <table className="stats">
              <thead>
                <tr><th>Leg</th><th>Dist</th><th>Brg</th><th>Time</th><th>Fuel</th></tr>
              </thead>
              <tbody>
                {stats.legs.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}→{i + 2}</td>
                    <td>{fmtNm(l.distanceNm)}</td>
                    <td>{fmtBearing(l.bearingDeg)}</td>
                    <td>{fmtDuration(l.timeHours)}</td>
                    <td>{l.fuelGal.toFixed(1)} gal</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{fmtNm(stats.totalNm)}</td>
                  <td />
                  <td>{fmtDuration(stats.totalHours)}</td>
                  <td>{stats.totalFuelGal.toFixed(1)} gal</td>
                </tr>
              </tfoot>
            </table>
            <div className="field-row">
              <input
                placeholder="Route name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn primary" onClick={save}>Save</button>
            </div>
            <div className="field-row">
              <button
                className="btn"
                onClick={() => setState({ draftWaypoints: [...s.draftWaypoints].reverse() })}
              >
                Reverse
              </button>
              <button
                className="btn"
                onClick={() => downloadFile(`${draftRoute.name}.gpx`, routeToGpx(draftRoute))}
              >
                Export GPX
              </button>
              <button
                className="btn danger"
                onClick={() => setState({ draftWaypoints: [], editingRouteId: null })}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h3>Saved routes ({s.routes.length})</h3>
        {s.routes.map((r) => (
          <div key={r.id} className="list-row">
            <button className="link" onClick={() => load(r)}>
              {r.name} {r.kind === 'auto' && <em>(auto)</em>}
            </button>
            <small>{r.waypoints.length} wpts</small>
            <button className="btn-icon" title="Export GPX" onClick={() => downloadFile(`${r.name}.gpx`, routeToGpx(r))}>
              ⇩
            </button>
            <button className="btn-icon danger" title="Delete" onClick={() => deleteRoute(r.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="field-row">
          <button className="btn" onClick={() => fileRef.current?.click()}>Import GPX…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importGpx(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>
    </div>
  )
}

function AutorouteButton(): JSX.Element {
  const s = useApp()
  const busy = s.autoroute.status === 'computing'
  return (
    <button
      className={`btn${s.autoroute.status !== 'idle' ? ' active' : ''}`}
      disabled={busy}
      onClick={() =>
        setState({
          routingMode: false,
          autoroute: { waypoints: [], status: 'picking-start' },
        })
      }
    >
      {busy ? '… computing' : '⚡ Autoroute'}
    </button>
  )
}

function AutorouteStatus(): JSX.Element | null {
  const s = useApp()
  const a = s.autoroute
  const [confirmed, setConfirmed] = useState(false)

  if (a.status === 'idle') return null
  if (a.status === 'picking-start') return <p className="hint accent">Tap the map at your STARTING point.</p>
  if (a.status === 'picking-end') return <p className="hint accent">Tap the map at your DESTINATION.</p>
  if (a.status === 'computing') return <p className="hint accent">Building navigability grid from ENC depth areas…</p>
  if (a.status === 'error') {
    return (
      <div className="warn-box">
        <p>{a.reason ?? 'Autoroute failed.'}</p>
        <button className="btn" onClick={() => setState({ autoroute: { waypoints: [], status: 'idle' } })}>
          Dismiss
        </button>
      </div>
    )
  }
  // review
  return (
    <div className="warn-box">
      <strong>Review required</strong>
      <p className="hint">{DISCLAIMER_LONG}</p>
      <label className="check">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I have reviewed this route against the chart for shoals, rocks, wrecks and obstructions.
      </label>
      <div className="field-row">
        <button
          className="btn primary"
          disabled={!confirmed}
          onClick={() => {
            setState((st) => ({
              draftWaypoints: st.autoroute.waypoints.map(([lon, lat], i) => ({
                id: newId('wp'),
                lat,
                lon,
                name: i === 0 ? 'Start' : i === st.autoroute.waypoints.length - 1 ? 'End' : undefined,
              })),
              autoroute: { waypoints: [], status: 'idle' },
              editingRouteId: null,
            }))
            setConfirmed(false)
          }}
        >
          Accept as editable route
        </button>
        <button
          className="btn danger"
          onClick={() => {
            setState({ autoroute: { waypoints: [], status: 'idle' } })
            setConfirmed(false)
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
