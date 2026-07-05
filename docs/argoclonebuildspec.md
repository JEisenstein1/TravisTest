# Build Spec — Recreational Marine Navigation App ("Argo-class")

**Purpose:** A ground-up build spec for a mobile-first recreational boating navigation app modeled on Argo Navigation. Written to be handed directly to a coding model (Fable 5) as the source of truth for architecture and feature scope. Reverse-engineered from Argo's public product surface (App Store / Google Play listings, argonav.io, Wikipedia, press) plus the underlying marine-data standards Argo and its competitors rely on.

**Status:** v1 spec. Assumptions are flagged inline as `[ASSUMPTION]`. Nothing here is copied from Argo's proprietary code; the routing, tiling, and sync designs below are standard-practice implementations of public marine-data standards.

---

## 1. What the reference app is

Argo is a recreational boating navigation and social app for iOS, Android, and web. Founded 2018 by Jeff Foulk, it positions itself as the "Waze for boaters" — precision NOAA charts plus real-time crowdsourced local knowledge plus a social layer. It covers North America, is free at the base tier with a premium upgrade (including a lifetime option), and syncs boat settings and saved routes across mobile and web.

The product has four functional pillars. Build them as four loosely coupled modules behind one app shell:

1. **Charting** — render nautical charts online and offline, with draft-aware depth shading.
2. **Routing** — manual waypoint routing and automatic hazard-aware autorouting.
3. **Discovery & POI** — search marinas, anchorages, ramps, fuel, restaurants, navaids; reviews and photos.
4. **Social & crowdsourcing** — friends, groups, real-time position sharing, messaging, hazard/report pins, Captain's Log.

The scope target for you (Fable 5) is pillars 1–3 as a working navigation core first, then 4. Do not try to build all four in one pass. See §12 phasing.

---

## 2. Core feature inventory (from the reference product)

> **Tiering decision:** This build ships **everything free** — no premium tier, no paywall, no subscription. The reference app gates the second list below behind premium; here it's all free. The two-list split is kept only to show what the reference product treats as advanced, and to signal relative build complexity. Ignore the "premium" framing as a monetization concept; treat it purely as "core" vs "advanced" feature sets.

### Core features
- Unlimited NOAA / USACE charts across North America.
- Manual routing to water destinations (tap-to-place waypoints).
- Multiple map views: Standard, Satellite, Terrain, NOAA ENC — with auto / day / night modes.
- Depth and contour display.
- Interactive POI map: marinas, anchorages, boat ramps, restaurants, fuel.
- Navigation-aid search: mile markers, buoys, beacons, current/tide stations, docks, moorings.
- Local reviews and photos on POIs.
- Captain's Log: plan, save, and log trips.
- Current weather conditions.
- Crowdsourced hazard reports and on-water report pins.
- Social: friends, groups, real-time location sharing (with privacy controls), "Ahoy" quick-greet, message requests to non-friends, direct messaging, social feed.
- GPX import/export (present on tablet/web; treat as core).
- SOS / emergency contact list.

### Advanced features (free in this build; premium in the reference app)
- **Autorouting** — automatic route generation around hazards and shallows, tailored to vessel draft.
- **Offline charts** — download regions for no-signal navigation.
- **7-day forecasts** — weather, wind, tides, currents.
- **Custom depth shading / contours** — user-set safety depth drives chart coloring.
- **Captain's Log Reports** — shareable PDF export.
- **On-map display of routes/tracks.**
- **Multi-vessel support** — per-boat routes, logs, and draft profiles.
- **Advanced GPX import/export** for chartplotter sync.
- Roadmap items observed: **NMEA integration, AIS traffic, anchor alarm.** Higher build complexity — sequence them last (§12 Phase 6), but they ship free like everything else.

### Platform
- iOS, Android, responsive web. Boat settings + saved routes sync across all three. Design the data model cloud-first so web and mobile are thin clients over the same sync layer (§9).

---

## 3. Chart data — sources and formats

This is the foundation. Get it right first.

### 3.1 Primary source: NOAA ENC (Electronic Navigational Charts)
- Vector datasets in **IHO S-57** format (transitioning to **S-101** under the S-100 model; S-101 ENCs are being produced now and are expected to replace S-57 by the ~2030s). Build your ingest to target S-57 today with an abstraction layer so S-101 can be swapped in per-cell without touching the render pipeline.
- Each ENC is a **cell**: a geo-referenced database of charted features (depths, contours, shoreline, aids to navigation, obstructions, restricted areas) stored as lat/long coordinate pairs with rich per-feature attributes (color, shape, height/depth, purpose, position quality).
- Organized into **six usage bands** (overview → berthing) by scale. Reschemed NOAA cells use a gridded layout where **16 cells of one band nest inside one cell of the next-smaller band**, with cell width narrowing toward higher latitudes. Your tiling scheme should mirror this banding for level-of-detail selection.
- NOAA updates cells every weekday evening (new editions or incremental "ER" update files). You need a scheduled ingest job that pulls updates and re-tiles affected cells.
- Coverage: ~95,000 mi of shoreline, 3.6M sq nmi of US waters. Downloadable per-cell from the NOAA Chart Locator or by region from the ENC download page.
- **Note:** NOAA has ended traditional paper chart production; ENC is now the authoritative product. Do not build against RNC/raster NOAA charts as a primary source.

### 3.2 Inland: USACE IENC
- US Army Corps of Engineers produces **Inland ENCs (IENC)** for US rivers, same S-57 vector lineage. Ingest alongside NOAA cells for river/inland-waterway coverage (ICW, Mississippi system, etc.).

### 3.3 Basemap / imagery layers
- Standard, Satellite, Terrain views imply a general-purpose basemap provider underneath the nautical overlay. `[ASSUMPTION]` Use a vector/raster basemap SDK (MapLibre GL recommended — open, offline-capable, no per-tile licensing trap) with satellite/terrain raster tiles from a commercial provider. Keep the nautical ENC layer as a separate overlay you control.

### 3.4 Crowdsourced bathymetry (roadmap / differentiator)
- Argo's origin is crowdsourced bathymetry: depth data collected from many vessels via NMEA-compatible chartplotters, aggregated to improve situational awareness. Treat this as a **later-phase** data pipeline: collect NMEA depth+position tracks from consenting users, aggregate server-side, and surface as a supplemental depth layer distinct from official ENC data. Keep it clearly labeled as unofficial. Do not let it drive routing in v1.

### 3.5 Rendering standard
- ENC vector data is not human-readable raw — it must be rendered by a chart engine. Two portrayal styles exist: **ECDIS/S-52 symbology** (the official electronic look) and **"paper-chart" style** (traditional symbols/colors, like NOAA Custom Chart). Offer the paper-chart style as the default recreational view and S-52 as an option. You will implement an S-52-aware symbolizer or use an existing ENC rendering library (see §8).

---

## 4. Charting module — rendering & offline

### 4.1 Tile pipeline
- Ingest S-57 cells → parse features → build a normalized feature store (PostGIS server-side).
- Generate vector tiles (MVT) per usage band for online streaming, and per-region packaged tile bundles (MBTiles or PMTiles) for offline download.
- Client renders with MapLibre GL + a custom nautical style spec that maps ENC feature classes to S-52-style symbology.

### 4.2 Depth shading (draft-aware) — core UX
- User sets vessel **draft** (and optionally a safety margin) once per boat.
- Chart auto color-codes safe vs. shallow water against that draft, using ENC depth areas (`DEPARE`), soundings (`SOUNDG`), and contours (`DEPCNT`).
- Custom depth shading: let the user set the safety-contour depth explicitly, chart-plotter style. Recolor client-side without re-fetching tiles — depth values live in the vector tiles; shading is a style function of `depth >= safetyDepth`.

### 4.3 Offline
- User selects a region (draw a box or pick a named area) → app downloads the packaged tile bundle + the POI/navaid dataset + the routing graph (§5.3) for that region.
- **All navigation features must work fully offline** once downloaded: chart display, depth shading, waypoints, manual routing, autorouting, track recording, anchor alarm. Only live data (weather, other boaters' positions, new crowd reports) requires signal.
- Offline store: SQLite + MBTiles/PMTiles on device. Version each region bundle so you can prompt for updates when NOAA re-issues cells.
- Charts + routes sync across devices; treat the offline bundle as a cache layer over the sync'd canonical data.

### 4.4 Map view modes
- Standard / Satellite / Terrain / NOAA-ENC layers, toggleable.
- Auto / Day / Night color modes (night = red-shifted low-luminance palette for wheelhouse use).
- Compass button with map-orientation control (north-up / course-up / heading-up).
- Marker sizing that scales with the OS accessibility font setting.
- On-map search results limited to current zoom level to avoid clutter.

---

## 5. Routing module

### 5.1 Manual routing (free)
- Tap to drop start, waypoints, end. Draw a polyline route over the chart.
- Show per-leg and total: distance, bearing, ETA (from vessel cruising speed), and estimated fuel usage (from fuel-consumption setting + distance).
- Edit: drag waypoints, insert/delete, reverse route. Save to favorites. Display saved routes/tracks on the map.

### 5.2 Autorouting — how it works
Autorouting generates a safe, efficient route from A to B automatically, tailored to the vessel. Mechanics (standard practice across Navionics, C-MAP, Wavve, Argo):

- **Inputs:** start, destination, vessel **draft**, safety depth/margin, cruising speed, fuel consumption. `[ASSUMPTION]` optionally vessel height for fixed-bridge/overhead-clearance avoidance.
- **Cost surface:** build a navigable graph over water only. Rasterize the ENC into a navigability grid (or use a navmesh over water polygons): cells shallower than `draft + margin` are impassable; obstructions, wrecks (`WRECKS`), rocks (`UWTROC`), restricted areas (`RESARE`), and land are hard blocks. Remaining water cells get a traversal cost.
- **Search:** run a pathfinder — A\* over the grid/graph (weighted by distance, with penalties near shallow contours and hazards) is the pragmatic v1 choice. Add soft-cost penalties that push the path away from shallow water and hazards proportionally to proximity, so routes prefer comfortable deep water rather than hugging the safety contour. (Research-grade approaches like grounding-aware RRT\* exist and can inform a later depth-penalty cost function; A\* is enough to ship.)
- **Output:** a route polyline plus waypoints at turn points. Always show it for user review.
- **Mandatory safety disclaimer:** autorouting must never be presented as authoritative. Every generated route requires an explicit user-review step and a persistent warning that the skipper must verify the route against the chart for shoals, wrecks, rocks, and obstructions. This is non-negotiable and appears in the reference product and every competitor.

### 5.3 Offline routing
- Precompute and package the navigability graph per downloadable region so autorouting runs on-device with no signal. Keep graph resolution tied to usage band (finer near harbors, coarser offshore) to control bundle size.

### 5.4 Live navigation mode
- Follow-me: GPS position, heading, speed over ground, course over ground.
- Off-course and shallow-water alerts (ENC-driven) while underway.
- ETA / distance-to-go / cross-track error to active route.
- Track recording (breadcrumb) at a configurable interval; note the reference app had accuracy complaints on Android with erratic heading and tracks cutting across land — invest in good location filtering (Kalman/complementary filter on GPS + device compass) and snap-to-water guards on the drawn track.

---

## 6. Discovery, POI & navaids

- Searchable POI database: marinas, anchorages, boat ramps, fuel docks, restaurants, docks, moorings.
- Navaid search: mile markers, buoys, beacons, lights, current stations, tide stations — sourced from ENC aid-to-navigation features (`BOYxxx`, `BCNxxx`, `LIGHTS`) plus NOAA CO-OPS station metadata for tides/currents.
- POI detail: for marinas/harbors show VHF channel, berth count, max draft/length, amenities, fuel availability, plus user photos and reviews (C-MAP and Argo both do this — match it).
- Reviews & photos: user-generated, moderated. Ratings roll up per POI.
- Search UX: text search + map-bounded results; limit rendered results to current zoom.

---

## 7. Social, crowdsourcing & logging

Build this pillar last (Phase 3).

- **Friends:** search by name, affiliation, group (marina/boat club), or suggestions. Add/accept flow.
- **Real-time location:** opt-in sharing of position, heading, ETA, with granular privacy settings. See friends on the water.
- **Groups/clubs:** dedicated space for a club or group to share plans and activity.
- **Messaging:** "Ahoy" one-tap greeting to any boater; message requests to non-friends; full DM for friends; tap a profile/hat icon on the map to greet or message.
- **Social feed:** share voyages, photos, updates.
- **Plans & experiences:** share routes and places with crew/family/club.
- **On-water reports / hazard pins:** crowdsourced hazard, shoal, and local-advice pins; reviews of marinas/anchorages. Real-time to other users nearby. This is the "Waze" mechanic — reports decay/expire and can be confirmed or downvoted by others. `[ASSUMPTION]` add confirm/expire logic; the reference product doesn't publish its exact model.
- **Captain's Log:** plan and save trip details; log completed trips (route, track, stats, photos, notes). Export a shareable PDF report.
- **SOS / emergency list:** notify a preset contact list that you need help, with position. This is a safety feature — make the flow fast and hard to trigger accidentally, and be explicit in-app that it is **not** a replacement for VHF Ch.16 / DSC / calling the Coast Guard.

---

## 8. Environmental data

- **Weather / wind / waves:** current conditions and 7-day forecast, layered on the chart — both free. Source from free providers: **NOAA/NWS marine zone forecasts** (free, US coverage — good for the Northeast proving ground) plus **Open-Meteo Marine API** (free, no key, wind/wave GRIB-derived data) for the layered forecast. Keep the weather source behind an adapter interface so a richer commercial provider (StormGlass, Windy) can be dropped in later without touching the UI.
- **Tides & currents:** 7-day predictions from **NOAA CO-OPS** station data (free); show nearest station, plus tide/current station pins on the chart. Long Island Sound has dense CO-OPS coverage — good fit for the proving ground.
- All environmental layers are live-data — require signal, and cache last-known for offline display with a clear staleness timestamp.

---

## 9. Hardware & external integrations

- **GPX import/export:** first-class. Import routes/tracks/waypoints from a friend or a chartplotter; export the same. This is how users round-trip with their MFD (Garmin/Simrad/Raymarine). Support the standard GPX 1.1 schema.
- **NMEA integration (later phase):** connect to onboard instruments over **NMEA 0183 / NMEA 2000** (typically via a WiFi gateway broadcasting NMEA-over-TCP/UDP). Ingest real-time depth, speed, heading.
- **AIS traffic (later phase) — both sources:** display nearby vessels from AIS via **(a)** the onboard NMEA gateway feed (the vessel's own AIS receiver, works offline, gives close-range targets) **and (b)** a networked AIS data source over the internet (e.g. AISHub / aisstream.io for a wider live picture when in signal). Merge and dedupe targets by MMSI, preferring the onboard feed for targets it sees. Render AIS targets with CPA/TCPA where feasible. Onboard-only is the safety-critical path; the networked feed is supplemental situational awareness.
- **Anchor alarm (later phase):** set anchor point + swing radius; alarm on drag beyond radius. Works offline.

---

## 10. Recommended technical architecture

`[ASSUMPTION]` — this is a proposed stack, not the reference app's actual stack.

**Client (mobile):** React Native + Expo, or Flutter. Given the map performance demands and the erratic-location complaints against the reference Android build, budget for native modules around location and map rendering regardless of framework. Map engine: **MapLibre GL Native** (vector tiles, offline, custom nautical style).

**Client (web):** React + MapLibre GL JS, sharing the same nautical style spec and the same sync API.

**Backend:**
- API: Node/TypeScript (NestJS) or Go. GraphQL or REST + WebSocket for real-time (positions, messages, live reports).
- Spatial store: **PostgreSQL + PostGIS** for ENC features, POIs, navaids, routes, reports.
- Tile services: vector tiles served from PostGIS (e.g. via a tile server) online; PMTiles/MBTiles bundles generated for offline.
- Real-time: WebSocket/pub-sub (Redis or a managed realtime service) for position sharing, messaging, live crowd reports.
- Object storage for user photos and Captain's Log PDFs.
- Auth: email/social login, per-boat and per-user profiles.

**Data pipelines (scheduled jobs):**
1. NOAA ENC + USACE IENC ingest → parse S-57 → PostGIS → re-tile changed cells (weekly cadence, follow NOAA's weekday-evening updates).
2. NOAA CO-OPS tide/current station sync.
3. Marine weather/forecast fetch.
4. (Later) crowdsourced bathymetry aggregation.

**S-57 parsing / ENC rendering libraries to evaluate:** GDAL's S-57 driver (`ogr2ogr` can read S-57 to GeoJSON/PostGIS — this is your ingest workhorse); OpenCPN's rendering approach and its S-52 symbology as a reference implementation (GPL — study, don't copy into a proprietary build); `s57` / `gdal` bindings for the pipeline. Confirm license compatibility before pulling any GPL code into the product.

**Sync layer:** boat settings, routes, favorites, logs sync across mobile + web. Design canonical data cloud-side; clients hold an offline cache and reconcile on reconnect. Last-write-wins with per-record timestamps is adequate for v1; routes are user-owned and rarely concurrently edited.

---

## 11. Data model (starter entities)

- **User** — profile, privacy settings, friends[], groups[], emergency contacts[].
- **Boat** — name, draft, safety margin, cruising speed, fuel consumption, height (optional). Multi-boat per user.
- **Route** — ordered waypoints[], type (manual/auto), computed stats (distance, ETA, fuel), owner, shared-with[].
- **Track** — recorded breadcrumb polyline + timestamps + trip stats.
- **CaptainsLogEntry** — trip plan/record: route ref, track ref, photos[], notes, stats; exportable PDF.
- **POI** — type, geometry, attributes (VHF, berths, draft/length, amenities), reviews[], photos[].
- **Navaid** — type, geometry, ENC-sourced attributes.
- **Report/HazardPin** — type, geometry, author, created/expires, confirmations, downvotes, note.
- **ChartRegion** — downloadable bundle: bounds, band coverage, version, size, includes-routing-graph flag.
- **Message / AhoyEvent / FeedPost** — social primitives.

---

## 12. Build phasing (hand this order to the coding model)

**Phase 0 — Foundations.** Auth, user/boat model, MapLibre shell, basemap layers, GPS follow-me, settings.

**Phase 1 — Charting core (proving ground: Long Island Sound).** ENC ingest pipeline (GDAL S-57 → PostGIS → vector tiles) for the Long Island Sound cells; render nautical overlay with paper-chart symbology; draft-aware depth shading; POI + navaid display and search. **This is the highest-risk, highest-value module — prove it on Long Island Sound before scaling to the rest of the Northeast.** LIS is a strong proving ground: dense navaids and NOAA CO-OPS stations, varied depth from deep central channel to shoal-heavy edges (Housatonic mouth, the Norwalk Islands, Fishers Island Sound), and it's ground-truthable on the water. Once LIS renders and shades correctly against reality, expand cell coverage to the full Northeast (roughly Maine through the Chesapeake approaches) using the identical pipeline.

**Phase 2 — Routing.** Manual routing with distance/ETA/fuel; then autorouting (navigability graph + A\* with depth/hazard penalties) with mandatory review step and safety disclaimer; live nav alerts; track recording.

**Phase 3 — Offline.** Region download bundles (tiles + POI + routing graph); full offline nav; region versioning/update prompts.

**Phase 4 — Environmental.** Weather/wind/waves current + 7-day; NOAA CO-OPS tides/currents.

**Phase 5 — Social & crowdsourcing.** Friends, groups, real-time position, messaging/Ahoy, feed, hazard/report pins, Captain's Log + PDF export, SOS.

**Phase 6 — Hardware.** GPX round-trip (pull earlier if MFD users are a priority), then NMEA 0183/2000 gateway ingest, AIS, anchor alarm.

Charts (P1) and routing (P2) are the product. Ship those as a credible navigation app before touching social.

---

## 13. Non-negotiables & risk notes

- **Safety disclaimers everywhere routing and depth appear.** Autoroutes and depth shading are decision aids, not authorities; the skipper verifies against official charts. This is both legally important and matches the reference product.
- **Location quality.** The reference Android build was criticized for inaccurate heading and tracks crossing land. Filter GPS aggressively, fuse with compass, and guard rendered tracks against land polygons.
- **ENC licensing/attribution.** NOAA ENC data is an official US Gov product and free to use, but redistribution carries attribution and integrity conditions (include catalog/README, display the disclaimer, cite the source). Honor them in the ingest/redistribution path.
- **GPL contamination.** OpenCPN and much of the open ENC-rendering ecosystem is GPL. Study for reference; keep GPL code out of a proprietary binary unless you accept the license terms.
- **S-57 → S-101 transition.** Abstract the chart-feature layer so S-101 cells can be ingested per-region without a render rewrite.
- **Scope discipline.** Four pillars is a lot. The failure mode is building a shallow version of all four. Build a deep version of charting + routing first.

---

## 14. Resolved decisions (locked before Phase 1)

1. **Proving-ground region — Long Island Sound.** Build and validate Phase 1 (charting core) against LIS specifically. It's home water for the product owner, so charts and routing can be ground-truthed on the water. See §12 Phase 1 for why LIS is a good technical stress test.
2. **v1 geographic scope — Northeast US.** LIS proves the pipeline; the Northeast (roughly Maine → Chesapeake approaches) is the v1 coverage target, expanded from LIS using the identical ingest pipeline. Not full North America at launch.
3. **Charts — free.** NOAA ENC + USACE IENC are official US Government products, free to use (with attribution/integrity conditions per §13). No paid chart data.
4. **Providers — free to start.** MapLibre (open) for the map engine; NOAA/NWS + Open-Meteo Marine (free) for weather/wind/waves; NOAA CO-OPS (free) for tides/currents. Basemap satellite/terrain: start with free/low-cost sources — **Esri World Imagery** (free tier, attribution required) or **USGS/NOAA imagery** for satellite, and open OSM-derived tiles for standard/terrain. All behind adapter interfaces so a paid provider can swap in later.
5. **Monetization — everything free.** No premium tier, no subscription, no lifetime purchase. All features (autorouting, offline charts, forecasts, custom depth shading, multi-vessel, Captain's Log PDF, NMEA/AIS/anchor alarm) ship free. The §2 "core vs advanced" split now signals build complexity only, not pricing. If a cost driver emerges later (e.g. commercial weather GRIBs, networked AIS volume, map-tile egress), revisit — but design assumes free.
6. **AIS — both sources.** Onboard NMEA-gateway AIS (safety-critical, offline, close range) merged with a networked internet AIS feed (supplemental, wider picture, in-signal only), deduped by MMSI. See §9.
7. **Crowd-report trust model — confirm / expire / downvote (the proposed model).** Hazard and report pins are authored by users, confirmable and downvotable by others, and decay/expire over time. Tune the exact decay windows and confirmation thresholds during Phase 5; the confirm/expire/downvote mechanic is locked.

---

*Sources: Argo App Store & Google Play listings, argonav.io, Argo Navigation (Wikipedia), Power & Motoryacht review; NOAA Office of Coast Survey / nauticalcharts.noaa.gov (ENC, S-57/S-101, rescheming, ECS FAQ); IHO/Wikipedia on ENC standards; Navionics, C-MAP, and Wavve autorouting documentation; marine path-planning literature (grounding-aware RRT\*). All architecture, tiling, routing-graph, and sync designs are standard-practice implementations of these public standards, not reproductions of Argo's proprietary code.*
