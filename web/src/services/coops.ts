// NOAA CO-OPS (tides & currents) adapter. Free, keyless (spec §8).
// - Station metadata:  mdapi .../stations.json?type=tidepredictions
// - Predictions:       datagetter product=predictions

import { COOPS_DATA, COOPS_MDAPI } from '../config'

export interface TideStation {
  id: string
  name: string
  lat: number
  lon: number
}

export interface TideEvent {
  t: string // local time string from API
  valueFt: number
  type: 'H' | 'L'
}

export interface TideCurvePoint {
  t: string
  valueFt: number
}

let stationsCache: TideStation[] | null = null

export async function fetchTideStations(): Promise<TideStation[]> {
  if (stationsCache) return stationsCache
  const key = 'soundline.tidestations'
  try {
    const cached = localStorage.getItem(key)
    if (cached) {
      const { at, stations } = JSON.parse(cached)
      if (Date.now() - at < 7 * 24 * 3600_000) {
        stationsCache = stations
        return stations
      }
    }
  } catch {
    /* refetch */
  }
  const res = await fetch(`${COOPS_MDAPI}/stations.json?type=tidepredictions&units=english`)
  if (!res.ok) throw new Error(`CO-OPS stations failed (${res.status})`)
  const data = (await res.json()) as {
    stations?: Array<{ id: string; name: string; lat: number; lng: number; state?: string }>
  }
  const stations: TideStation[] = (data.stations ?? []).map((s) => ({
    id: s.id,
    name: s.state ? `${s.name}, ${s.state}` : s.name,
    lat: s.lat,
    lon: s.lng,
  }))
  stationsCache = stations
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), stations }))
  } catch {
    /* ok */
  }
  return stations
}

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 7-day high/low predictions plus an hourly curve for plotting. */
export async function fetchTidePredictions(stationId: string): Promise<{
  events: TideEvent[]
  curve: TideCurvePoint[]
}> {
  const common = new URLSearchParams({
    station: stationId,
    product: 'predictions',
    datum: 'MLLW',
    time_zone: 'lst_ldt',
    units: 'english',
    format: 'json',
    begin_date: yyyymmdd(new Date()),
    range: String(7 * 24),
  })
  const hilo = new URLSearchParams(common)
  hilo.set('interval', 'hilo')
  const hourly = new URLSearchParams(common)
  hourly.set('interval', 'h')

  const [hiloRes, hourlyRes] = await Promise.all([
    fetch(`${COOPS_DATA}?${hilo}`),
    fetch(`${COOPS_DATA}?${hourly}`),
  ])
  if (!hiloRes.ok || !hourlyRes.ok) throw new Error('CO-OPS predictions failed')
  const hiloData = (await hiloRes.json()) as {
    predictions?: Array<{ t: string; v: string; type: 'H' | 'L' }>
    error?: { message?: string }
  }
  const hourlyData = (await hourlyRes.json()) as {
    predictions?: Array<{ t: string; v: string }>
    error?: { message?: string }
  }
  if (hiloData.error) throw new Error(hiloData.error.message ?? 'CO-OPS error')
  return {
    events: (hiloData.predictions ?? []).map((p) => ({
      t: p.t,
      valueFt: Number(p.v),
      type: p.type,
    })),
    curve: (hourlyData.predictions ?? []).map((p) => ({ t: p.t, valueFt: Number(p.v) })),
  }
}
