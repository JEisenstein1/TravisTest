# Research notes — data sources & standards

Findings that drove the implementation, verified July 2026 against the spec
(`argoclonebuildspec.md`). Everything below is free to use, per the spec's
locked decision №4/№5 (all-free providers, no paywall).

## Chart tiles (the ENC overlay you see on the map)

NOAA's **Chart Display Service** renders official ENC data in traditional
paper-chart symbology — exactly the "recreational default" portrayal the spec
(§3.5) asks for — and serves it as WMTS raster tiles in the
`GoogleMapsCompatible` tile matrix, which drops straight into MapLibre as an
XYZ raster source:

```
https://gis.charttools.noaa.gov/arcgis/rest/services/MarineChart_Services/NOAACharts/MapServer/WMTS/tile/1.0.0/MarineChart_Services_NOAACharts/default/GoogleMapsCompatible/{z}/{y}/{x}.png
```

Related services, kept as documented alternates in case one is retired:

- **ENC Online (Maritime Chart Service)** — S-52/ECDIS-style portrayal, WMS +
  Esri REST: `https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/exts/MaritimeChartService`
- **NOAA Chart Display Service MBTiles** for offline: `https://distribution.charts.noaa.gov/ncds/index.html`
- The legacy RNC tile service (`tileservice.charts.noaa.gov`) is shut down —
  NOAA ended raster/paper chart production (spec §3.1 note confirmed).

## Vector ENC features (depth shading, hazards, autorouting)

**ENC Direct to GIS** (`https://encdirect.noaa.gov/arcgis/rest/services/encdirect/…`)
exposes S-57 object classes merged into seamless layers, one ArcGIS MapServer
per usage band (`enc_overview`, `enc_general`, `enc_coastal`, `enc_approach`,
`enc_harbour`, `enc_berthing`), each queryable with `f=geojson`, envelope
filters, and pagination (MaxRecordCount 1000).

Implementation notes:

- **Layer IDs are not stable** across NOAA republications and differ per band,
  so `web/src/services/encdirect.ts` discovers them at runtime from
  `MapServer/layers?f=json`, matching names like `Approach.Depth_Area_area` /
  `Harbour.Wrecks_point` by regex + geometry type, cached for 24 h.
- Attributes come through with lowercase S-57 names (`drval1`, `drval2`,
  `valsou`, `watlev`); the depth model tolerates both cases.
- The app queries the **approach** band from zoom 10 and adds **harbour**
  from zoom 13, mirroring the usage-band → level-of-detail mapping in §3.1.

## Depth semantics (S-57)

`DEPARE` (depth area) polygons carry `DRVAL1` (shallowest) / `DRVAL2`
(deepest) in **meters below chart datum (MLLW for US charts)**. Shading
classifies against safety depth = draft + margin: `DRVAL2 ≤ safety` unsafe
(red), `DRVAL1 < safety < DRVAL2` caution (amber), else safe. Tide can add or
remove real-world depth — the Boat panel says so explicitly.

## Tides & currents

NOAA CO-OPS, keyless:

- Station metadata: `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english`
- Predictions: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&datum=MLLW&interval=hilo|h&begin_date=YYYYMMDD&range=168…`

Long Island Sound has dense station coverage (Bridgeport, New Haven, New
London, Kings Point, Montauk…), which is why the spec picked it as the
proving ground (§14 №1).

## Weather

- **Open-Meteo Forecast API** — current conditions + 7-day daily, native
  knots/(°F) units support, keyless.
- **Open-Meteo Marine API** — wave height forecast (meters, converted to ft);
  returns errors for points over land, which the adapter treats as
  "marine data unavailable here" rather than a failure.
- NOAA/NWS marine zone forecasts remain a documented swap-in (the adapter
  interface in `services/weather.ts` is the seam).

## Geocoding / POI search

OSM **Nominatim** (`nominatim.openstreetmap.org`), viewport-biased, debounced
to respect the fair-use policy, attribution shown in the results dropdown.
For a production launch move to a self-hosted Nominatim or a commercial
geocoder — the public instance's usage policy is not suitable for app-scale
traffic. Navaids (buoys/beacons/lights) come from ENC Direct, not OSM.

## Offline & self-hosted path (pipeline/)

Per-cell/per-state ENC downloads: `https://charts.noaa.gov/ENCs/…` (zips of
`ENC_ROOT/<CELL>/<CELL>.000` + ER update files). GDAL's S-57 driver reads
them directly (`OGR_S57_OPTIONS` controls sounding splitting etc.), and
tippecanoe builds PMTiles for offline bundles. USACE IENC inland cells:
`https://ienccloud.us`. NOAA updates cells weekday evenings → weekly cron.

## S-57 → S-101 transition (spec §3.1, §13)

All chart-feature access is behind two seams: (a) `services/encdirect.ts`
(hosted) and (b) `pipeline/ingest_enc.sh` (self-hosted), both emitting
"GeoJSON with lowercase S-57 attribute names". When NOAA ships S-101 cells,
either seam converts S-101 → the same normalized form; the renderer, depth
model, and router don't change.

## Rendering-library review (spec §10)

- **GDAL S-57 driver** — ingest workhorse, MIT-licensed, used in pipeline/.
- **OpenCPN** — best open S-52 symbolizer to *study*; GPL, so no code was
  copied (spec §13 GPL note honored — this repo is MIT-clean).
- **MapLibre GL JS** — BSD, renders both the NOAA raster overlay and our
  GeoJSON/vector layers; the same style spec would drive MapLibre GL Native
  on mobile (spec §10 client recommendation).

## Sources

- NOAA Office of Coast Survey — GIS data & services: https://nauticalcharts.noaa.gov/data/gis-data-and-services.html
- NOAA Chart Display Service announcement: https://nauticalcharts.noaa.gov/updates/coast-survey-launches-noaa-chart-display-service/
- NOAA chart viewers announcement: https://nauticalcharts.noaa.gov/updates/noaa-releases-new-navigational-chart-viewers/
- ENC Direct to GIS help: https://nauticalcharts.noaa.gov/learn/encdirect/
- ENC Direct services root: https://encdirect.noaa.gov/arcgis/rest/services
- NOAA ENC product page: https://www.nauticalcharts.noaa.gov/charts/noaa-enc.html
- NCDS MBTiles downloads: https://distribution.charts.noaa.gov/ncds/index.html
- CO-OPS API docs: https://api.tidesandcurrents.noaa.gov/api/prod/
- Open-Meteo docs: https://open-meteo.com/en/docs and /en/docs/marine-weather-api
- NOAA Chart Tile Service (ArcGIS Hub): https://hub.arcgis.com/maps/noaa::noaa-chart-tile-service/about
