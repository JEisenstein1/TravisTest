# ENC ingest pipeline (Phase 1 / Phase 3 groundwork)

The running web app streams ENC features live from NOAA services (Chart Display
Service tiles + ENC Direct queries) and needs **no pipeline at all**. This
directory is the self-hosted path the spec (§4.1, §5.3, §12 Phase 1/3) calls
for when you outgrow the public services:

- own vector tiles with custom S-52-style symbology instead of raster WMTS
- offline region bundles (PMTiles) for no-signal navigation
- precomputed routing grids per region

## Requirements

- GDAL ≥ 3.6 (`ogr2ogr` with the S-57 driver) — `apt install gdal-bin`
- [tippecanoe](https://github.com/felt/tippecanoe) ≥ 2.x for MVT/PMTiles
- ~2 GB disk for the Long Island Sound cell set

## Usage

```bash
# 1. Download NOAA ENC cells for Long Island Sound (proving ground)
./fetch_enc.sh              # downloads into work/enc/

# 2. Convert S-57 cells → GeoJSON per feature class (DEPARE, SOUNDG, …)
./ingest_enc.sh             # writes out/geojson/

# 3. Build vector tiles / offline bundle
./make_tiles.sh             # writes out/tiles/lis.pmtiles
```

`S57_CLASSES` in `ingest_enc.sh` lists the feature classes the app consumes;
extend it as the renderer grows. The GeoJSON output uses the same lowercase
S-57 attribute names (`drval1`, `drval2`, `valsou`, …) the web client already
reads from ENC Direct, so tiled data drops into the existing style functions.

## Update cadence

NOAA publishes new editions and incremental updates every weekday evening
(spec §3.1). Run `fetch_enc.sh && ingest_enc.sh && make_tiles.sh` on a weekly
cron (or nightly if you want same-week Notice-to-Mariners corrections) and
version each region bundle so clients can be prompted to refresh.

## Licensing / attribution (non-negotiable, spec §13)

NOAA ENC data is a US Government product, free to use, but redistribution
carries integrity + attribution conditions: keep the cell catalog/README with
redistributed data, display "Chart data: NOAA Office of Coast Survey", and
show the not-for-navigation disclaimer wherever charted data renders. USACE
IENC inland cells (https://ienccloud.us) follow the same S-57 lineage and can
be added to `fetch_enc.sh` for river coverage.

## S-101 transition

Ingest is isolated behind "S-57 cell → normalized GeoJSON with lowercase
attributes". When NOAA ships S-101 cells for a region, add an `ogr2ogr` branch
for the S-101 driver in `ingest_enc.sh`; nothing downstream (tiling, style,
router) changes. See docs/RESEARCH.md.
