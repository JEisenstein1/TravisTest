// Shared domain types (mirrors docs/ARCHITECTURE.md §Data model and server/src/db.ts)

export interface Boat {
  id: string
  name: string
  /** Vessel draft in feet */
  draftFt: number
  /** Extra safety margin under the keel, feet */
  safetyMarginFt: number
  /** Cruising speed, knots */
  cruiseKts: number
  /** Fuel burn at cruise, gallons per hour */
  fuelGph: number
  /** Optional air draft (bridge clearance), feet */
  heightFt?: number
  updatedAt: number
}

export interface Waypoint {
  id: string
  lat: number
  lon: number
  name?: string
}

export type RouteKind = 'manual' | 'auto'

export interface Route {
  id: string
  name: string
  kind: RouteKind
  waypoints: Waypoint[]
  /** Set true once the skipper has explicitly reviewed an autoroute */
  reviewed: boolean
  createdAt: number
  updatedAt: number
}

export interface TrackPoint {
  lat: number
  lon: number
  /** epoch ms */
  t: number
  /** speed over ground, knots (filtered) */
  sog?: number
}

export interface Track {
  id: string
  name: string
  points: TrackPoint[]
  startedAt: number
  endedAt?: number
  updatedAt: number
}

export interface LegStats {
  distanceNm: number
  bearingDeg: number
  timeHours: number
  fuelGal: number
}

export interface RouteStats {
  legs: LegStats[]
  totalNm: number
  totalHours: number
  totalFuelGal: number
}

export type BaseLayer = 'standard' | 'satellite' | 'terrain'

export interface Prefs {
  baseLayer: BaseLayer
  /** NOAA ENC chart overlay on/off + opacity */
  encChart: boolean
  encOpacity: number
  /** draft-aware depth shading from ENC Direct vector features */
  depthShading: boolean
  hazards: boolean
  tideStations: boolean
  nightMode: 'day' | 'night' | 'auto'
  /** depth unit for display; ENC source data is meters */
  units: 'ft' | 'm'
}

export interface GeoFix {
  lat: number
  lon: number
  t: number
  accuracy: number
  sogKts: number | null
  cogDeg: number | null
}
