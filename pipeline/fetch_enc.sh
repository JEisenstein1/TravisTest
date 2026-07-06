#!/usr/bin/env bash
# Download NOAA ENC cells for the Long Island Sound proving ground.
# NOAA offers per-state ENC zips (and per-cell zips) from charts.noaa.gov;
# see https://www.charts.noaa.gov/ENCs/ENCs.shtml for the current catalog.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p work/enc

# LIS is covered by Connecticut + New York (+ Rhode Island for the eastern
# approaches / Fishers Island Sound).
STATES=(CT NY RI)

for st in "${STATES[@]}"; do
  url="https://charts.noaa.gov/ENCs/${st}_ENCs.zip"
  echo "→ $url"
  curl -fL --retry 3 -o "work/enc/${st}_ENCs.zip" "$url"
  unzip -oq "work/enc/${st}_ENCs.zip" -d work/enc/
done

# The zips contain ENC_ROOT/<CELL>/<CELL>.000 (+ update files .001, .002 …).
# KEEP the CATALOG and README files alongside redistributed data — that is a
# condition of redistributing NOAA ENC data (see pipeline/README.md).
echo "Cells downloaded:"
find work/enc -name '*.000' | sed 's/.*\///' | sort
