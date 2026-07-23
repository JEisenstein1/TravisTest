# Home Checkup

A client-side urine test strip reader. Photograph a strip laid in the Ribbon
ColoriTech colour card; the app detects the card, flattens it, colour-corrects
against 208 printed reference patches, locates the strip, and reads all ten pads.

Everything runs in the browser. No backend, no server, no data leaves the device.

## Deploy to Vercel

Static site, no build step.

```bash
npm i -g vercel      # once
cd this-folder
vercel               # preview
vercel --prod        # production
```

Or drag the folder onto vercel.com/new, or push to a Git repo and import it.
Framework preset: **Other**. Build command: none. Output directory: `./`.

HTTPS matters: `getUserMedia` and service workers only run on a secure origin.
Vercel gives you that automatically. `localhost` also counts during development.

Local preview:

```bash
npx serve .          # then open the printed URL on your phone, same wifi
```

## Installing on your phone

Open the deployed URL, then "Add to Home Screen". It installs as a standalone
app, works offline after first load, and keeps history across launches.

## What it does today

Detects the card (ArUco DICT_4X4_50, IDs TL=3 TR=2 BR=0 BL=21), corrects
perspective, fits a polynomial colour transform from the reference patches
(residual ~ΔE 1), locates the strip dynamically, and reports each pad as
**negative / borderline / elevated** relative to a measured distilled-water
baseline.

It reports bands, not concentrations. See "Not done yet" below.

## Not done yet

- **No concentration values.** Ribbon ships no printed colour chart, so there is
  no mapping from pad colour to mg/dL. `REFERENCE_CHART` in
  `card-calibration.js` is empty. Fill it using `calibrate.html` with strips of
  known level. Cheapest route: sugar water (glucose), vinegar and baking soda
  (pH), salt water (specific gravity) — each also confirms pad ordering.
- **pH and specific gravity are not scored.** They span real ranges rather than
  sitting at a negative baseline. Specific gravity has one true anchor
  (distilled water = 1.000); pH needs buffer sachets.
- **Pad order is inferred**, not confirmed against a manufacturer insert. The
  colours are consistent with the standard 10-parameter layout and the
  distilled-water responses corroborate specific gravity, glucose and pH.

## Measured characteristics

| property | value | how |
|---|---|---|
| card aspect (marker rect) | 1 : 2.2825, sd 0.0144 | 7 photos |
| reference patches | 208 (4x26 per side, 35.7px pitch) | grid detection |
| colour correction residual | ΔE 0.7–1.7 | held-out patches |
| pad pitch | 74.36px canonical, fit residual <2.2px | 10-pad linear fit |
| strip position variation | 30px in x, 38px in y | 9 photos |
| repeatability, same strip | ΔE 0.3–1.1 | 3 photos |
| repeatability, different strips | ΔE 0.9–4.0 | 2 independent runs |
| orientation invariance | ΔE 0.12 under 180° rotation | rotated re-run |
| time stability, 90s → 4.5min | ΔE 0.7–2.9 for 9 of 10 pads | same strip |
| specific gravity drift | ΔE 10.1, b\*+9.9 (reads high late) | same strip |

## Protocol that these numbers assume

Room temperature sample (let a warm one stand until it no longer feels warm),
1–2s dip, tap the edge, **read at 90 seconds**. Specific gravity is the
timing-critical pad — a late read over-reports it as dehydration. Frame the
whole card with space around all four markers, in even indirect light, no flash.

## Files

```
index.html             the app
calibrate.html         chart builder (fills REFERENCE_CHART)
card-calibration.js    all measured constants for this physical card
strip-analysis.js      detection, homography, colour correction, classification
vendor/js-aruco2.js    marker detection (42KB; MIT)
sw.js                  offline cache — bump CACHE when assets change
```

## This is not a medical device

Unvalidated readings from a consumer strip and a phone camera, useful for
watching your own trends. Persistent or unexpected results warrant a real lab
test, not a threshold tweak.
