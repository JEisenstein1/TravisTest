import { setState, useApp } from '../state/store'
import BoatTab from './tabs/BoatTab'
import RouteTab from './tabs/RouteTab'
import TidesTab from './tabs/TidesTab'
import WeatherTab from './tabs/WeatherTab'
import TracksTab from './tabs/TracksTab'
import SyncTab from './tabs/SyncTab'

const TITLES: Record<string, string> = {
  boat: 'Boat settings',
  route: 'Routes',
  tides: 'Tides',
  weather: 'Marine weather',
  tracks: 'Tracks',
  sync: 'Account & sync',
}

export default function SidePanel(): JSX.Element | null {
  const s = useApp()
  if (!s.panel) return null
  return (
    <div className="side-panel panel-card">
      <div className="panel-head">
        <strong>{TITLES[s.panel]}</strong>
        <button className="btn-icon" onClick={() => setState({ panel: null })}>✕</button>
      </div>
      <div className="panel-body">
        {s.panel === 'boat' && <BoatTab />}
        {s.panel === 'route' && <RouteTab />}
        {s.panel === 'tides' && <TidesTab />}
        {s.panel === 'weather' && <WeatherTab />}
        {s.panel === 'tracks' && <TracksTab />}
        {s.panel === 'sync' && <SyncTab />}
      </div>
    </div>
  )
}
