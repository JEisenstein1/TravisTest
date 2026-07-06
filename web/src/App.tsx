import { useEffect } from 'react'
import MapView from './map/MapView'
import TopBar from './components/TopBar'
import SidePanel from './components/SidePanel'
import Hud from './components/Hud'
import DisclaimerModal from './components/DisclaimerModal'
import { useApp } from './state/store'

export default function App(): JSX.Element {
  const s = useApp()

  const hour = new Date().getHours()
  const night =
    s.prefs.nightMode === 'night' || (s.prefs.nightMode === 'auto' && (hour >= 20 || hour < 6))

  useEffect(() => {
    document.documentElement.classList.toggle('night', night)
  }, [night])

  return (
    <div className={`app${night ? ' night' : ''}`}>
      <MapView />
      <TopBar />
      {s.panel && <SidePanel />}
      <Hud />
      {!s.disclaimerAccepted && <DisclaimerModal />}
    </div>
  )
}
