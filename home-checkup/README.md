# Home Checkup

A client-side urine test strip reader. Photograph a strip laid in the Ribbon
ColoriTech colour card; the app detects the card, flattens it, colour-corrects
against 208 printed reference patches, locates the strip, and reads all ten pads.

The reading runs entirely in the browser and your test history stays in the
browser (localStorage) — no health data is sent anywhere. When deployed to
Vercel with the auth layer below, a thin serverless layer handles **Google
sign-in only**; it gates who can open the app and never sees your results.

## Deploy to Vercel with Google sign-in

The app ships a Vercel auth layer (`api/auth/*` functions + `middleware.js`)
that puts the whole app behind Google OAuth, restricted to an email allow list.
This is real gating — the Edge middleware checks a signed session cookie before
serving any asset, so the app can't be opened (or its files read) without
signing in as an allowed account.

**One-time setup (needs your Google and Vercel accounts):**

1. **Create Google OAuth credentials** — [Google Cloud Console](https://console.cloud.google.com/)
   → *APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID*.
   - Configure the *OAuth consent screen* (External; add yourself as a test user).
   - Application type: **Web application**.
   - Authorized redirect URI: `https://YOUR-APP.vercel.app/api/auth/callback`
     (add `http://localhost:3000/api/auth/callback` too if you use `vercel dev`).
   - Copy the **Client ID** and **Client secret**.

2. **Import to Vercel** — [vercel.com/new](https://vercel.com/new), import this
   Git repo. Set **Root Directory** to `home-checkup`. Framework preset:
   **Other**. No build command.

3. **Set environment variables** (Vercel → Settings → Environment Variables),
   see `.env.example`:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from step 1.
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`).
   - `ALLOWED_EMAILS` — comma-separated Google emails allowed in (e.g. your own).
     Sign-in is denied if this is empty.

4. **Deploy.** Visit the app: you'll be sent to Google, and after signing in as
   an allowed account you land in the app. The home screen shows the signed-in
   email with a **Sign out** link.

HTTPS matters: `getUserMedia` (camera) and service workers only run on a secure
origin. Vercel provides that automatically; `localhost` also counts in dev.

CLI alternative: `npm i -g vercel`, then `vercel` / `vercel --prod` from the
`home-checkup/` folder (still set the env vars in the dashboard or via
`vercel env`).

Local preview **without** auth (open, no gating): `npx serve .` from this folder.

## Installing on your phone

Open the deployed URL, then "Add to Home Screen". It installs as a standalone
app, works offline after first load, and keeps history across launches.

## What it does today

Detects the card (ArUco DICT_4X4_50, IDs TL=3 TR=2 BR=0 BL=21), corrects
perspective, fits a polynomial colour transform from the reference patches
(residual ~ΔE 1), locates the strip dynamically, and reads each pad to a
concentration **level** by nearest-colour match against `REFERENCE_CHART`.
For deviation analytes it also reports **negative / borderline / elevated**
relative to the measured distilled-water baseline.

## Concentration mapping (how levels are read without per-strip calibration)

The card's 208 patches are camera-calibration targets (colour primaries, grey
ramps), not a printed pad→concentration chart — that mapping is a property of
the strip chemistry, which for this generic 10-parameter strip is standard and
published. `REFERENCE_CHART` in `card-calibration.js` is therefore built from
the standard chart, converted to CIELAB and **anchored** so each analyte's
negative/lowest level sits exactly on this card's measured distilled-water
baseline, with the standard chart's colour trajectory carried up from there.
That is what lets the app report levels from a photo alone.

Refine any analyte with `calibrate.html` + a known sample; captured points
supersede the standard values.

## Caveats on the standard-chart mapping

- **Ordinal analytes are solid** (glucose, protein, ketone, blood, leukocytes,
  nitrite, bilirubin, urobilinogen): negative is measured, steps are standard.
- **pH and specific gravity are interpolated.** Their anchors are real
  (distilled water = SG 1.000; water ≈ pH 6), but the intermediate steps are
  standard-chart interpolations, not per-step calibrated. Treat them as
  estimates; buffer sachets (pH) and salt solutions (SG) would pin the steps.
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
