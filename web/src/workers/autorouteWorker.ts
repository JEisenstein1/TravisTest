// Web Worker wrapper around the pure autoroute engine so grid building and
// A* never block the map thread.

import { autoroute, type AutorouteInput } from '../lib/autoroute'

self.onmessage = (e: MessageEvent<AutorouteInput>) => {
  try {
    const result = autoroute(e.data)
    self.postMessage(result)
  } catch (err) {
    self.postMessage({
      ok: false,
      reason: err instanceof Error ? err.message : 'Autoroute failed',
      waypoints: [],
      cellsBlocked: 0,
      cellsTotal: 0,
    })
  }
}
