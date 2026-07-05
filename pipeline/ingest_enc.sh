#!/usr/bin/env bash
# Convert S-57 ENC cells → per-feature-class GeoJSON with lowercase attribute
# names, matching what the web client already consumes from ENC Direct.
# Requires GDAL's S-57 driver (ogr2ogr). GDAL applies .001/.002… update files
# to the .000 base cell automatically when they sit in the same directory.
set -euo pipefail
cd "$(dirname "$0")"
command -v ogr2ogr >/dev/null || { echo "ogr2ogr (GDAL) is required"; exit 1; }

mkdir -p out/geojson

# Feature classes the app consumes (spec §4.2, §5.2, §6):
#   DEPARE depth areas        DEPCNT depth contours     SOUNDG soundings
#   LNDARE land               COALNE coastline
#   WRECKS/UWTROC/OBSTRN hazards
#   BOYLAT/BOYSPP/BCNLAT/LIGHTS navaids   RESARE restricted areas
S57_CLASSES=(DEPARE DEPCNT SOUNDG LNDARE COALNE WRECKS UWTROC OBSTRN \
             BOYLAT BOYSPP BCNLAT LIGHTS RESARE ACHARE)

# Expose soundings as 3D points and split multi-geometries for tiling.
export OGR_S57_OPTIONS="SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=ON"

for cell in $(find work/enc -name '*.000'); do
  name=$(basename "$cell" .000)
  for cls in "${S57_CLASSES[@]}"; do
    out="out/geojson/${name}_${cls}.geojson"
    # Not every cell has every class; ogr2ogr fails per-layer, so tolerate it.
    if ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco RFC7946=YES \
        "$out" "$cell" "$cls" 2>/dev/null; then
      # lowercase property keys to match ENC Direct output (drval1, valsou, …)
      python3 - "$out" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    fc = json.load(f)
for feat in fc.get("features", []):
    feat["properties"] = {k.lower(): v for k, v in (feat.get("properties") or {}).items()}
with open(path, "w") as f:
    json.dump(fc, f, separators=(",", ":"))
PY
    else
      rm -f "$out"
    fi
  done
  echo "✓ $name"
done
echo "GeoJSON written to out/geojson/"
