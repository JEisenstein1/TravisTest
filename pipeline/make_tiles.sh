#!/usr/bin/env bash
# Build a PMTiles vector-tile bundle from the ingested GeoJSON: one layer per
# S-57 feature class, zoom ranges roughly mirroring ENC usage bands (§3.1).
set -euo pipefail
cd "$(dirname "$0")"
command -v tippecanoe >/dev/null || { echo "tippecanoe is required"; exit 1; }

mkdir -p out/tiles
args=()

layer_args() { # class, minzoom, maxzoom
  local cls=$1 minz=$2 maxz=$3
  local files=(out/geojson/*_"${cls}".geojson)
  [ -e "${files[0]}" ] || return 0
  for f in "${files[@]}"; do
    args+=(-L "${cls}:${f}")
  done
}

# usage-band-ish zoom ranges
layer_args DEPARE 0 14
layer_args DEPCNT 8 14
layer_args LNDARE 0 14
layer_args COALNE 6 14
layer_args SOUNDG 11 14
layer_args WRECKS 9 14
layer_args UWTROC 9 14
layer_args OBSTRN 9 14
layer_args BOYLAT 10 14
layer_args BOYSPP 10 14
layer_args BCNLAT 10 14
layer_args LIGHTS 10 14
layer_args RESARE 8 14
layer_args ACHARE 9 14

tippecanoe -o out/tiles/lis.pmtiles --force \
  -zg --maximum-zoom=14 --drop-densest-as-needed \
  --coalesce-densest-as-needed --extend-zooms-if-still-dropping \
  "${args[@]}"

echo "Wrote out/tiles/lis.pmtiles"
echo "Serve with any static host + pmtiles JS, or convert: pmtiles convert lis.pmtiles lis.mbtiles"
