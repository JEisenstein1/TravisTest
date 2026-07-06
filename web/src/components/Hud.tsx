// Bottom HUD: GPS controls, SOG/COG readout, active-leg data, alerts, and the
// persistent NOT FOR NAVIGATION badge (spec §13 non-negotiables).

import { DISCLAIMER_SHORT } from '../config'
import { bearingDeg, distanceNm, fmtBearing, fmtDuration, fmtLatLon, fmtNm } from '../lib/geo'
import { startWatch, stopWatch, stopRecording } from '../nav/geolocation'
import { activeBoat, setState, useApp } from '../state/store'

export default function Hud(): JSX.Element {
  const s = useApp()
  const boat = activeBoat(s)

  // next waypoint = first draft waypoint ahead when navigating
  let navInfo: string | null = null
  if (s.fix && s.draftWaypoints.length > 0) {
    const wp = s.draftWaypoints[s.draftWaypoints.length - 1]
    const d = distanceNm(s.fix.lat, s.fix.lon, wp.lat, wp.lon)
    const brg = bearingDeg(s.fix.lat, s.fix.lon, wp.lat, wp.lon)
    const eta = s.fix.sogKts && s.fix.sogKts > 0.5 ? d / s.fix.sogKts : boat.cruiseKts > 0 ? d / boat.cruiseKts : NaN
    navInfo = `→ ${wp.name ?? 'end'}: ${fmtNm(d)} · ${fmtBearing(brg)} · ETA ${fmtDuration(eta)}`
  }

  return (
    <>
      {s.shallowAlert && <div className="alert-banner">⚠ {s.shallowAlert}</div>}
      <div className="hud">
        <span className="badge-warn" title={DISCLAIMER_SHORT}>
          {DISCLAIMER_SHORT}
        </span>
        {s.fix ? (
          <>
            <span className="hud-item">{fmtLatLon(s.fix.lat, s.fix.lon)}</span>
            <span className="hud-item">
              SOG {s.fix.sogKts === null ? '—' : s.fix.sogKts.toFixed(1)} kt
            </span>
            <span className="hud-item">
              COG {s.fix.cogDeg === null ? '—' : fmtBearing(s.fix.cogDeg)}
            </span>
            {navInfo && <span className="hud-item">{navInfo}</span>}
            <button
              className={`btn${s.follow ? ' active' : ''}`}
              onClick={() => setState({ follow: !s.follow })}
            >
              Follow
            </button>
            <button
              className={`btn${s.recording ? ' active rec' : ''}`}
              onClick={() => {
                if (s.recording) stopRecording()
                else setState({ recording: true })
              }}
            >
              {s.recording ? '■ Stop track' : '● Record track'}
            </button>
            <button className="btn" onClick={stopWatch}>
              GPS off
            </button>
          </>
        ) : (
          <button className="btn" onClick={startWatch}>
            ▶ Start GPS
          </button>
        )}
        {s.depthStatus && <span className="hud-item dim">{s.depthStatus}</span>}
      </div>
    </>
  )
}
