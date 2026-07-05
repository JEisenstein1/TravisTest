# ⚓ Soundline

A free, open recreational **marine navigation web app** built from the
"Argo-class" build spec: official NOAA ENC charting, draft-aware depth
shading, manual + automatic routing, live GPS navigation, tides and marine
weather — proving ground: **Long Island Sound**.

> **NOT FOR NAVIGATION.** Soundline is a planning and situational-awareness
> aid. Always verify against official, up-to-date charts and keep a proper
> lookout. See the in-app disclaimer.

## What works today

- **Charting** — NOAA Chart Display Service overlay (official ENC, paper-chart
  symbology) over Standard / Satellite / Terrain basemaps; day + red-shifted
  night mode; nautical-mile scale bar.
- **Draft-aware depth shading** — set your boat's draft + safety margin and
  ENC depth areas recolor live: red = too shallow, amber = marginal, blue =
  safe. Data streams from NOAA ENC Direct as you pan (zoom in to ~10+).
- **Hazards & navaids** — charted wrecks, rocks, obstructions, buoys, beacons
  and lights, click for attributes.
- **Manual routing** — tap to drop waypoints, drag to edit, per-leg
  distance / bearing / time / fuel from your boat profile; save, reverse,
  import/export **GPX 1.1**.
- **Autorouting** — A* over a navigability grid built from ENC depth areas,
  land and hazards for your safety depth, with soft penalties that keep
  routes in comfortable water — always behind an explicit review gate.
- **Live navigation** — GPS follow-me with filtered SOG/COG, waypoint
  distance/bearing/ETA, shallow-water alert under the boat, track recording.
- **Tides** — NOAA CO-OPS station pins, 7-day high/low table + curve.
- **Weather** — current conditions + 7-day wind/gust/wave forecast
  (Open-Meteo, adapter-swappable).
- **Multi-boat profiles** and optional **cross-device sync** (tiny Node +
  SQLite server, last-write-wins; the app is 100% functional without it).

All features are free — no tiers, no paywall (spec decision №5).

## Quickstart

```bash
npm install
npm run dev          # web app on http://localhost:5173
```

That's it — the app runs against live NOAA/Open-Meteo services with no keys.
Requires **Node ≥ 22.13** (the server uses `node:sqlite` and type stripping,
which older 22.x releases gate behind flags).
Optional sync server (accounts + cross-device boats/routes):

```bash
npm run dev:server   # API on http://localhost:8787 (vite proxies /api to it)
```

Production: `npm run build && npm start` — the server serves the built app
and the sync API from one process.

Tests & checks:

```bash
npm test             # vitest (geo/depth/autoroute/gpx) + node:test (API)
npm run typecheck
```

## Repository layout

| Path | What |
|---|---|
| `web/` | React + TypeScript + MapLibre GL client (the app) |
| `server/` | Express + node:sqlite sync server (optional) |
| `pipeline/` | GDAL S-57 → GeoJSON → PMTiles scripts for self-hosted charts & offline bundles |
| `docs/RESEARCH.md` | Data-source research: every NOAA/Open-Meteo endpoint used and why |
| `docs/ARCHITECTURE.md` | Module map, key decisions, spec-phase status |

## Data sources & attribution

Chart data: **NOAA Office of Coast Survey** (ENC via Chart Display Service and
ENC Direct to GIS). Tides: **NOAA CO-OPS**. Weather: **Open-Meteo**. Basemaps:
© OpenStreetMap contributors, Esri World Imagery, OpenTopoMap. Search: OSM
Nominatim. NOAA data is a US Government product; redistribution conditions
are honored in `pipeline/README.md`.

## Roadmap (spec §12)

Next up, in order: in-app offline region bundles (Phase 3 UI over the
pipeline), POI reviews/photos (Phase 1 discovery extension needs a backend),
Captain's Log with PDF export, then the social pillar (Phase 5) and
NMEA/AIS/anchor alarm (Phase 6). See `docs/ARCHITECTURE.md` for the full
status table.
