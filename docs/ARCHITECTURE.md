# Architecture

Soundline follows the spec's module split (§1): one app shell, loosely
coupled modules for **charting**, **routing**, **discovery/POI**, and
(later) **social**. This build ships charting + routing + environmental data
deep, per §12's phasing discipline.

```
┌────────────────────────── web/ (React + MapLibre GL) ──────────────────────────┐
│                                                                                │
│  state/store.ts  ← single external store, localStorage-persisted, offline-first│
│        ▲                                                                       │
│  components/* (panels, HUD, disclaimer)      map/MapView.tsx (reconciler)      │
│                                                   │                            │
│  lib/geo,depth,pip,gpx,autoroute  ◄── pure, unit-tested logic                  │
│                                                   │                            │
│  workers/autorouteWorker.ts  ◄── grid build + A* off the UI thread             │
│                                                                                │
│  services/ (adapter seam — every provider is swappable)                        │
│   ├─ encdirect.ts   NOAA ENC Direct (depth areas, hazards, navaids, GeoJSON)   │
│   ├─ coops.ts       NOAA CO-OPS (tide stations + 7-day predictions)            │
│   ├─ weather.ts     Open-Meteo forecast + marine (7-day, current)              │
│   ├─ nominatim.ts   OSM geocoding                                              │
│   └─ syncApi.ts     optional Soundline sync server                             │
└────────────────────────────────────────────────────────────────────────────────┘
          │ /api (only when signed in — app is fully functional without it)
┌─────────▼──────────── server/ (Express + node:sqlite) ─────────┐
│  auth (scrypt + bearer sessions) · /api/sync LWW merge         │
│  serves web/dist statically in production                      │
└────────────────────────────────────────────────────────────────┘

pipeline/  fetch_enc.sh → ingest_enc.sh (GDAL S-57→GeoJSON) → make_tiles.sh (PMTiles)
           self-hosted chart path: custom vector tiles + offline bundles (§4.1/§4.3)
```

## Key decisions

**Live NOAA services first, own pipeline second.** The spec's §4.1 pipeline
(S-57 → PostGIS → MVT) is the right end-state, but NOAA already serves both
rendered charts (Chart Display Service WMTS) and queryable vector features
(ENC Direct). Building on those got a *correct, chart-driven* navigation core
working immediately; `pipeline/` contains the self-hosting scripts for when
tile volume, custom symbology, or offline bundles demand it. The client
consumes both through the same "GeoJSON with lowercase S-57 attributes"
contract, so swapping sources doesn't touch rendering or routing.

**Depth shading is a style function, not data processing** (§4.2). DEPARE
polygons carry `drval1`/`drval2`; the MapLibre fill color is an expression of
those against the boat's safety depth. Changing draft re-colors instantly
with zero refetch.

**Autorouting = conservative grid + A*** (§5.2). Cells are passable only when
a charted depth area proves enough water; *uncharted = blocked*. Hard blocks:
land, depth < safety, wreck/rock/obstruction points (with a 1-cell buffer).
Soft costs push routes away from the safety contour and blocked cells. The
grid pads by the route span and widens up to 3× when no path is found. Output
always lands in a review gate — the accept button is disabled until the
skipper confirms they checked the route against the chart (§5.2's
non-negotiable).

**Offline-first state, optional sync** (§10). All user data (boats, routes,
tracks, prefs) lives in localStorage and works with zero connectivity; the
server holds the canonical copy only for signed-in users, merged
last-write-wins on `updatedAt` — adequate per spec since routes are
user-owned and rarely concurrently edited.

**Everything external is an adapter** (§8, §14 №4). Weather, tides, geocoding,
chart tiles and ENC features are each one file under `services/` with a typed
interface; a paid provider swap is a one-file change.

## Data model

`web/src/types.ts` mirrors the spec's §11 starter entities: `Boat` (multi-boat,
draft/margin/cruise/fuel), `Route` (waypoints, kind manual|auto, reviewed
flag), `Track`, `Prefs`. Server stores boats/routes as opaque JSON payloads
keyed `(id, user_id)` with `updated_at` — schema-light on purpose while the
model is still moving. `POI`/`Navaid` render straight from ENC Direct
properties. Social entities (§7) are Phase 5 and intentionally absent.

## Safety posture (§13)

- First-launch blocking disclaimer; persistent NOT FOR NAVIGATION badge in
  the HUD; disclaimer repeated in every autoroute review and feature popup.
- Autoroute accept is gated behind an explicit review checkbox.
- Depth data is labeled MLLW-referenced; tide caveat shown in Boat panel.
- Location filtering (accuracy gate, jump rejection, EMA on SOG, circular
  blending on COG) addresses the reference app's Android track-quality
  complaints (§5.4).

## What maps to which spec phase

| Spec phase | Status in this build |
|---|---|
| 0 Foundations | ✅ auth (optional), boat model, MapLibre shell, base layers, GPS follow-me, settings |
| 1 Charting core | ✅ NOAA ENC overlay, draft-aware depth shading, hazards/navaids, tide-station pins, search — proving ground defaults to Long Island Sound |
| 2 Routing | ✅ manual routing (stats, edit, save), A* autorouting + review gate, shallow-water alert, track recording |
| 3 Offline | ◐ user data + last ENC fetch cached; pipeline scripts for PMTiles bundles; no in-app region download manager yet |
| 4 Environmental | ✅ current weather + 7-day forecast + waves; CO-OPS 7-day tides |
| 5 Social | ⬜ not started (deliberately, §12) |
| 6 Hardware | ◐ GPX import/export shipped early (it was cheap and high-value); NMEA/AIS/anchor alarm not started |
