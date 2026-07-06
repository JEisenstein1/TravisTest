import { downloadFile, trackToGpx } from '../../lib/gpx'
import { distanceNm, fmtDuration, fmtNm } from '../../lib/geo'
import { stopRecording } from '../../nav/geolocation'
import { deleteTrack, setState, useApp } from '../../state/store'
import type { Track } from '../../types'

function trackLengthNm(t: Track): number {
  let d = 0
  for (let i = 1; i < t.points.length; i++) {
    d += distanceNm(t.points[i - 1].lat, t.points[i - 1].lon, t.points[i].lat, t.points[i].lon)
  }
  return d
}

export default function TracksTab(): JSX.Element {
  const s = useApp()

  return (
    <div>
      <div className="field-row">
        <button
          className={`btn${s.recording ? ' active rec' : ''}`}
          onClick={() => (s.recording ? stopRecording() : setState({ recording: true }))}
        >
          {s.recording ? '■ Stop recording' : '● Record track'}
        </button>
        {s.recording && !s.fix && <span className="hint warn">Waiting for GPS… start GPS from the bottom bar.</span>}
      </div>
      {s.liveTrack && (
        <p className="hint">
          Recording: {s.liveTrack.points.length} points · {fmtNm(trackLengthNm(s.liveTrack))}
        </p>
      )}
      <h3>Saved tracks ({s.tracks.length})</h3>
      {s.tracks.map((t) => {
        const hours = t.endedAt ? (t.endedAt - t.startedAt) / 3600_000 : 0
        return (
          <div key={t.id} className="list-row">
            <span>
              {t.name}
              <small>
                {' '}
                {fmtNm(trackLengthNm(t))} · {fmtDuration(hours)} · {t.points.length} pts
              </small>
            </span>
            <button className="btn-icon" title="Export GPX" onClick={() => downloadFile(`${t.name}.gpx`, trackToGpx(t))}>
              ⇩
            </button>
            <button className="btn-icon danger" title="Delete" onClick={() => deleteTrack(t.id)}>
              ✕
            </button>
          </div>
        )
      })}
      {s.tracks.length === 0 && <p className="hint">No tracks yet. Start GPS, then record.</p>}
    </div>
  )
}
