// Marine weather adapter — Open-Meteo forecast + marine APIs (free, keyless).
// Kept behind this interface so a commercial provider can replace it without
// UI changes (spec §8).

import { FT_PER_M, OPEN_METEO_FORECAST, OPEN_METEO_MARINE } from '../config'

export interface CurrentWx {
  tempF: number
  windKts: number
  windDirDeg: number
  gustKts: number
  code: number
}

export interface DailyWx {
  date: string
  code: number
  tempMaxF: number
  tempMinF: number
  windMaxKts: number
  gustMaxKts: number
  precipProbPct: number | null
  waveMaxFt: number | null
}

export interface WxReport {
  current: CurrentWx | null
  daily: DailyWx[]
  marineAvailable: boolean
}

export const WMO_DESC: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
}

export async function fetchWeather(lat: number, lon: number): Promise<WxReport> {
  const wxParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max',
    wind_speed_unit: 'kn',
    temperature_unit: 'fahrenheit',
    forecast_days: '7',
    timezone: 'auto',
  })
  const marineParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily: 'wave_height_max',
    forecast_days: '7',
    timezone: 'auto',
  })

  const [wxRes, marineRes] = await Promise.allSettled([
    fetch(`${OPEN_METEO_FORECAST}?${wxParams}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    fetch(`${OPEN_METEO_MARINE}?${marineParams}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ])

  if (wxRes.status !== 'fulfilled') throw new Error('Weather fetch failed')
  const wx = wxRes.value as {
    current?: {
      temperature_2m: number
      wind_speed_10m: number
      wind_direction_10m: number
      wind_gusts_10m: number
      weather_code: number
    }
    daily?: {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      wind_speed_10m_max: number[]
      wind_gusts_10m_max: number[]
      precipitation_probability_max: Array<number | null>
    }
  }

  let waveByDate = new Map<string, number>()
  const marineAvailable = marineRes.status === 'fulfilled'
  if (marineAvailable) {
    const m = marineRes.value as { daily?: { time: string[]; wave_height_max: Array<number | null> } }
    if (m.daily) {
      waveByDate = new Map(
        m.daily.time.map((t, i) => {
          const wave = m.daily!.wave_height_max[i]
          return [t, wave === null ? NaN : wave * FT_PER_M] as [string, number]
        }),
      )
    }
  }

  const daily: DailyWx[] = (wx.daily?.time ?? []).map((date, i) => {
    const wave = waveByDate.get(date)
    return {
      date,
      code: wx.daily!.weather_code[i],
      tempMaxF: wx.daily!.temperature_2m_max[i],
      tempMinF: wx.daily!.temperature_2m_min[i],
      windMaxKts: wx.daily!.wind_speed_10m_max[i],
      gustMaxKts: wx.daily!.wind_gusts_10m_max[i],
      precipProbPct: wx.daily!.precipitation_probability_max[i],
      waveMaxFt: wave === undefined || Number.isNaN(wave) ? null : wave,
    }
  })

  return {
    current: wx.current
      ? {
          tempF: wx.current.temperature_2m,
          windKts: wx.current.wind_speed_10m,
          windDirDeg: wx.current.wind_direction_10m,
          gustKts: wx.current.wind_gusts_10m,
          code: wx.current.weather_code,
        }
      : null,
    daily,
    marineAvailable,
  }
}
