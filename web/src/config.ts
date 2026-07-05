// External data sources. All free / US-government or open providers, per spec §14.
// Each is consumed through an adapter (services/*) so a provider can be swapped
// without touching UI code.

/** Long Island Sound — the Phase 1 proving ground (spec §12/§14). */
export const HOME = { lon: -73.05, lat: 41.05, zoom: 10 }

export const BASEMAPS = {
  standard: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
    maxzoom: 19,
  },
  satellite: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  },
  terrain: {
    tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors, SRTM',
    maxzoom: 16,
  },
} as const

/**
 * NOAA Chart Display Service — official ENC data rendered in traditional
 * paper-chart symbology, served as WMTS raster tiles (GoogleMapsCompatible).
 * See docs/RESEARCH.md §Chart tiles.
 */
export const NOAA_ENC_TILES =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/MarineChart_Services/NOAACharts/MapServer/WMTS/tile/1.0.0/MarineChart_Services_NOAACharts/default/GoogleMapsCompatible/{z}/{y}/{x}.png'

export const NOAA_ENC_ATTRIBUTION =
  'Charts: NOAA Office of Coast Survey (ENC). Not for navigation.'

/**
 * NOAA ENC Direct to GIS — S-57 feature classes merged into seamless layers,
 * queryable as GeoJSON, one map service per usage band.
 */
export const ENC_DIRECT_BASE = 'https://encdirect.noaa.gov/arcgis/rest/services/encdirect'
export const ENC_DIRECT_BANDS = {
  approach: `${ENC_DIRECT_BASE}/enc_approach/MapServer`,
  harbour: `${ENC_DIRECT_BASE}/enc_harbour/MapServer`,
} as const

/** NOAA CO-OPS tides & currents */
export const COOPS_MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
export const COOPS_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

/** Open-Meteo (free, keyless) — weather + marine forecast adapters */
export const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'
export const OPEN_METEO_MARINE = 'https://marine-api.open-meteo.com/v1/marine'

/** OSM Nominatim geocoding (attribution + fair-use policy applies) */
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export const FT_PER_M = 3.28084
export const M_PER_FT = 0.3048

export const DISCLAIMER_SHORT = 'NOT FOR NAVIGATION'
export const DISCLAIMER_LONG =
  'Soundline is a planning and situational-awareness aid, not a navigation authority. ' +
  'Depth shading and generated routes are computed from chart data that may be ' +
  'incomplete, out of date, or misaligned. Always verify against official, up-to-date ' +
  'charts and keep a proper lookout. The skipper is solely responsible for safe navigation.'
