import { DISCLAIMER_LONG } from '../config'
import { setState } from '../state/store'

export default function DisclaimerModal(): JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal panel-card">
        <h2>⚠ Not for navigation</h2>
        <p>{DISCLAIMER_LONG}</p>
        <p>
          Chart data: NOAA Office of Coast Survey ENC via NOAA services. Weather: Open-Meteo &
          NOAA. Tides: NOAA CO-OPS. Basemaps © OpenStreetMap contributors, Esri, OpenTopoMap.
        </p>
        <button className="btn primary" onClick={() => setState({ disclaimerAccepted: true })}>
          I understand — this is a planning aid, not a navigation authority
        </button>
      </div>
    </div>
  )
}
