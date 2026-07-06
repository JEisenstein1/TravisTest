// MapLibre style factory. All base layers + overlays are declared once and
// toggled by visibility, so switching views never tears down the map.

import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAPS, NOAA_ENC_ATTRIBUTION, NOAA_ENC_TILES } from '../config'

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'base-standard': {
        type: 'raster',
        tiles: [...BASEMAPS.standard.tiles],
        tileSize: 256,
        attribution: BASEMAPS.standard.attribution,
        maxzoom: BASEMAPS.standard.maxzoom,
      },
      'base-satellite': {
        type: 'raster',
        tiles: [...BASEMAPS.satellite.tiles],
        tileSize: 256,
        attribution: BASEMAPS.satellite.attribution,
        maxzoom: BASEMAPS.satellite.maxzoom,
      },
      'base-terrain': {
        type: 'raster',
        tiles: [...BASEMAPS.terrain.tiles],
        tileSize: 256,
        attribution: BASEMAPS.terrain.attribution,
        maxzoom: BASEMAPS.terrain.maxzoom,
      },
      'noaa-enc': {
        type: 'raster',
        tiles: [NOAA_ENC_TILES],
        tileSize: 256,
        attribution: NOAA_ENC_ATTRIBUTION,
        maxzoom: 16,
      },
      'depth-areas': { type: 'geojson', data: EMPTY_FC },
      hazards: { type: 'geojson', data: EMPTY_FC },
      navaids: { type: 'geojson', data: EMPTY_FC },
      'tide-stations': { type: 'geojson', data: EMPTY_FC },
      'route-line': { type: 'geojson', data: EMPTY_FC },
      'route-points': { type: 'geojson', data: EMPTY_FC },
      'autoroute-preview': { type: 'geojson', data: EMPTY_FC },
      'track-live': { type: 'geojson', data: EMPTY_FC },
      'tracks-saved': { type: 'geojson', data: EMPTY_FC },
      'search-hit': { type: 'geojson', data: EMPTY_FC },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b1d2a' } },
      { id: 'base-standard', type: 'raster', source: 'base-standard', layout: { visibility: 'visible' } },
      { id: 'base-satellite', type: 'raster', source: 'base-satellite', layout: { visibility: 'none' } },
      { id: 'base-terrain', type: 'raster', source: 'base-terrain', layout: { visibility: 'none' } },
      {
        id: 'noaa-enc',
        type: 'raster',
        source: 'noaa-enc',
        layout: { visibility: 'visible' },
        paint: { 'raster-opacity': 0.85 },
      },
      // Draft-aware shading; fill-color is data-driven and re-set when the
      // active boat's safety depth changes (see MapView.applyDepthPaint).
      {
        id: 'depth-fill',
        type: 'fill',
        source: 'depth-areas',
        paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.55 },
      },
      {
        id: 'depth-outline',
        type: 'line',
        source: 'depth-areas',
        paint: { 'line-color': 'rgba(255,255,255,0.15)', 'line-width': 0.5 },
      },
      {
        id: 'tracks-saved',
        type: 'line',
        source: 'tracks-saved',
        paint: { 'line-color': '#8e6bd8', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'track-live',
        type: 'line',
        source: 'track-live',
        paint: { 'line-color': '#c05dd8', 'line-width': 3 },
      },
      {
        id: 'autoroute-preview',
        type: 'line',
        source: 'autoroute-preview',
        paint: { 'line-color': '#ffb020', 'line-width': 4, 'line-dasharray': [1.5, 1.2] },
      },
      {
        id: 'route-casing',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 6 },
      },
      {
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': '#27c2a0', 'line-width': 3 },
      },
      {
        id: 'route-points',
        type: 'circle',
        source: 'route-points',
        paint: {
          'circle-radius': 7,
          'circle-color': '#27c2a0',
          'circle-stroke-color': '#04211c',
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'route-point-labels',
        type: 'symbol',
        source: 'route-points',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.4],
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#e8fff8', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.2 },
      },
      {
        id: 'hazards',
        type: 'circle',
        source: 'hazards',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ff5d5d',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#3d0000',
          'circle-stroke-width': 1.5,
        },
      },
      {
        id: 'navaids',
        type: 'circle',
        source: 'navaids',
        minzoom: 11,
        paint: {
          'circle-radius': 4,
          'circle-color': '#ffd23f',
          'circle-stroke-color': '#4d3b00',
          'circle-stroke-width': 1,
        },
      },
      {
        id: 'tide-stations',
        type: 'circle',
        source: 'tide-stations',
        paint: {
          'circle-radius': 6,
          'circle-color': '#3fa7ff',
          'circle-stroke-color': '#0a2b4d',
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'search-hit',
        type: 'circle',
        source: 'search-hit',
        paint: {
          'circle-radius': 8,
          'circle-color': 'rgba(255,255,255,0.25)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      },
    ],
  }
}

/** MapLibre expression coloring DEPARE polygons against a safety depth (m). */
export function depthFillColor(safetyM: number): unknown {
  // IMPORTANT: to-number must wrap the coalesce, not sit inside it —
  // to-number(null) is 0 in MapLibre, so an inner to-number would turn a
  // missing/null attribute into "0 m deep" and shade everything unsafe.
  const d1 = ['to-number', ['coalesce', ['get', 'drval1'], ['get', 'DRVAL1'], -1]]
  const d2 = ['to-number', ['coalesce', ['get', 'drval2'], ['get', 'DRVAL2'], -1]]
  return [
    'case',
    // no depth attributes → unknown, faint gray
    ['all', ['<', d1, 0], ['<', d2, 0]], 'rgba(120,120,120,0.15)',
    // whole area shallower than safety depth → unsafe
    ['<=', d2, safetyM], 'rgba(217,66,66,0.62)',
    // area straddles safety depth → caution
    ['<', d1, safetyM], 'rgba(240,173,78,0.5)',
    // comfortably deep but worth seeing → light wash fading with depth
    ['<', d1, safetyM + 3], 'rgba(80,170,220,0.25)',
    'rgba(40,110,190,0.10)',
  ]
}
