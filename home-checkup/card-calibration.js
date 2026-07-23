/* =====================================================================
   card-calibration.js  —  MEASURED from 7 photos of the physical
   Ribbon ColoriTech card (2026-07-23). Not placeholders.

   Derived values and how they were obtained:
     • dictionary  : OpenCV DICT_4X4_50, confirmed by exhaustive test of
                     all 27 predefined families. Supplied here as a 4-code
                     custom js-aruco2 dictionary (only this card's markers),
                     which is far more reliable than matching against 1000.
     • marker IDs  : TL=3  TR=2  BR=0  BL=21   (flip-proof orientation)
     • aspect      : marker-centre rectangle measured 1 : 2.2825
                     (sd 0.0144 across 7 photos)
     • patches     : 208 reference patches, 4 cols x 26 rows per side,
                     35.7px pitch. Colours = mean of 4 bare-card photos,
                     white-balanced on the card's own 20 neutral patches.
                     Cross-photo reproducibility sd ~1.5%.
     • pads        : 10 pads, pitch 74.36px, linear fit residual < 2.2px.
   ===================================================================== */
(function(g){
'use strict';
g.CARD_CALIBRATION = {
  DICT_NAME: 'RIBBON_CARD',
  DICT: { nBits:16, tau:2, codeList: [[181, 50], [51, 45], [153, 70], [176, 43]] },
  DICT_ID_MAP: [0,2,3,21],           // custom index -> real ArUco id
  MARKER_IDS: { TL:3, TR:2, BR:0, BL:21 },

  CANON: { w:700, h:1341 },
  MARKER_CANON: { TL:[100,100], TR:[600,100], BR:[600,1241], BL:[100,1241] },

  DETECT_WIDTH: 1000,   // js-aruco2 is unreliable above ~1000px; detect small, sample full-res


  /* -------------------------------------------------------------------
     STRIP LOCALISATION — the strip is NOT mechanically fixed in the
     channel. Measured across 6 photos it moved 21px in x and 38px in y
     between placements. Fixed pad coordinates therefore sample partly off
     the strip onto the black card, silently corrupting readings.

     Pads are instead anchored to the strip TIP, which is unambiguous
     (the pad grid itself is periodic, so phase-matching aliases).
     Tip->pad0 = 34, pitch 74.36, both physical constants of the strip.
     Validated: tip-anchoring reproduces the hand-measured dry position
     (230) to within 2px on every photo, dry and wet.
     ------------------------------------------------------------------- */
  STRIP: {
    CHANNEL_X: [209, 492], CHANNEL_Y: [40, 1300],
    WIDTH: 49, TIP_TO_PAD0: 34, PITCH: 74.36, LUM_MIN: 55,
  },


  /* -------------------------------------------------------------------
     TIME STABILITY — same strip read at 90s and again at 4.5 min
     (distilled water, 3 photos each):

       9 of 10 pads stable, dE 0.7-2.9 over three extra minutes.
       Specific gravity drifted dE 10.1, almost entirely in b* (+9.9),
       i.e. toward yellow = toward the HIGH-SG end. A late read therefore
       OVER-reports specific gravity and would look like dehydration.

     Consequences:
       - the 60s photo window is comfortable for 9 analytes
       - specific gravity is the timing-critical one; read it on time
       - leukocytes does NOT drift pink (a* 1.5 -> 2.4), which confirms
         run 1's mauve pad was contamination, not a timing artefact
     ------------------------------------------------------------------- */
  TIME_STABILITY: {
    TESTED_AT_S: [90, 270],
    STABLE_DE: 2.9,                 // worst of the 9 stable analytes
    DRIFTING: { sg: { deltaE: 10.1, direction: 'b*+9.9 -> reads high' } },
  },

  PATCH_HALF: 11,
  PAD_HALF: 16,

  // [cx, cy, r, g, b]  — canonical position + white-balanced anchor colour
  REFERENCE_PATCHES: [
    [47.9,224.8,30,76,51],
    [83.6,224.8,194,22,97],
    [119.2,224.8,229,210,49],
    [155.0,224.8,2,126,196],
    [47.9,260.6,31,34,39],
    [83.6,260.6,46,47,53],
    [119.2,260.6,62,62,70],
    [155.0,260.6,82,81,89],
    [47.9,296.2,103,105,113],
    [83.6,296.2,126,128,135],
    [119.2,296.2,145,149,154],
    [155.0,296.2,167,171,173],
    [47.9,332.0,183,186,188],
    [83.6,332.0,204,205,205],
    [119.2,332.0,223,224,223],
    [155.0,332.0,84,65,54],
    [47.9,367.6,110,84,65],
    [83.6,367.6,136,115,77],
    [119.2,367.6,139,130,81],
    [155.0,367.6,138,167,107],
    [47.9,403.4,147,182,142],
    [83.6,403.4,138,192,205],
    [119.2,403.4,114,70,44],
    [155.0,403.4,93,49,37],
    [47.9,439.1,117,35,34],
    [83.6,439.1,155,98,48],
    [119.2,439.1,144,73,43],
    [155.0,439.1,151,77,43],
    [47.9,474.8,180,56,38],
    [83.6,474.8,197,128,53],
    [119.2,474.8,211,133,73],
    [155.0,474.8,181,132,110],
    [47.9,510.5,207,184,123],
    [83.6,510.5,217,199,148],
    [119.2,510.5,221,218,185],
    [155.0,510.5,56,31,43],
    [47.9,546.2,94,35,51],
    [83.6,546.2,120,58,73],
    [119.2,546.2,135,77,84],
    [155.0,546.2,162,114,113],
    [47.9,581.9,204,188,174],
    [83.6,581.9,198,180,163],
    [119.2,581.9,192,169,95],
    [155.0,581.9,162,148,88],
    [47.9,617.5,134,122,62],
    [83.6,617.5,126,127,75],
    [119.2,617.5,91,104,80],
    [155.0,617.5,82,112,105],
    [47.9,653.2,43,60,74],
    [83.6,653.2,49,66,54],
    [119.2,653.2,87,102,54],
    [155.0,653.2,106,109,55],
    [47.9,689.0,156,137,60],
    [83.6,689.0,172,149,59],
    [119.2,689.0,223,164,58],
    [155.0,689.0,59,97,109],
    [47.9,724.7,102,134,115],
    [83.6,724.7,126,136,78],
    [119.2,724.7,181,176,112],
    [155.0,724.7,193,164,87],
    [47.9,760.4,197,150,90],
    [83.6,760.4,194,135,86],
    [119.2,760.4,119,137,156],
    [155.0,760.4,102,122,89],
    [47.9,796.1,122,151,157],
    [83.6,796.1,129,160,149],
    [119.2,796.1,141,171,146],
    [155.0,796.1,158,180,144],
    [47.9,831.8,181,195,159],
    [83.6,831.8,209,211,168],
    [119.2,831.8,220,221,155],
    [155.0,831.8,158,89,130],
    [47.9,867.5,164,107,127],
    [83.6,867.5,159,95,104],
    [119.2,867.5,172,115,115],
    [155.0,867.5,185,124,109],
    [47.9,903.2,198,131,108],
    [83.6,903.2,198,144,112],
    [119.2,903.2,194,149,103],
    [155.0,903.2,213,171,125],
    [47.9,938.9,195,153,83],
    [83.6,938.9,183,82,121],
    [119.2,938.9,204,166,183],
    [155.0,938.9,202,183,193],
    [47.9,974.6,208,202,206],
    [83.6,974.6,205,206,199],
    [119.2,974.6,65,39,64],
    [155.0,974.6,120,84,116],
    [47.9,1010.3,159,132,158],
    [83.6,1010.3,192,185,194],
    [119.2,1010.3,202,202,206],
    [155.0,1010.3,199,203,199],
    [47.9,1046.0,200,202,157],
    [83.6,1046.0,181,159,182],
    [119.2,1046.0,104,124,92],
    [155.0,1046.0,110,129,149],
    [47.9,1081.7,171,166,82],
    [83.6,1081.7,173,180,155],
    [119.2,1081.7,167,165,161],
    [155.0,1081.7,192,198,184],
    [47.9,1117.3,24,65,42],
    [83.6,1117.3,174,16,85],
    [119.2,1117.3,220,202,49],
    [155.0,1117.3,1,109,175],
    [545.9,224.8,1,117,188],
    [581.5,224.8,231,211,51],
    [617.2,224.8,188,18,89],
    [653.0,224.8,28,71,45],
    [545.9,260.6,204,208,193],
    [581.5,260.6,179,176,172],
    [617.2,260.6,186,191,165],
    [653.0,260.6,186,177,87],
    [545.9,296.2,118,136,159],
    [581.5,296.2,113,134,100],
    [617.2,296.2,192,168,192],
    [653.0,296.2,211,210,165],
    [545.9,332.0,209,211,206],
    [581.5,332.0,213,210,215],
    [617.2,332.0,202,193,203],
    [653.0,332.0,171,141,168],
    [545.9,367.6,129,89,124],
    [581.5,367.6,70,40,67],
    [617.2,367.6,213,213,206],
    [653.0,367.6,217,209,213],
    [545.9,403.4,210,190,200],
    [581.5,403.4,213,172,190],
    [617.2,403.4,193,85,127],
    [653.0,403.4,205,159,85],
    [545.9,439.1,221,177,129],
    [581.5,439.1,203,155,107],
    [617.2,439.1,206,148,116],
    [653.0,439.1,207,136,113],
    [545.9,474.8,193,128,113],
    [581.5,474.8,181,120,120],
    [617.2,474.8,168,98,107],
    [653.0,474.8,173,112,133],
    [545.9,510.5,166,94,137],
    [581.5,510.5,225,226,158],
    [617.2,510.5,214,217,173],
    [653.0,510.5,187,200,163],
    [545.9,546.2,162,185,148],
    [581.5,546.2,146,176,150],
    [617.2,546.2,133,165,153],
    [653.0,546.2,127,157,162],
    [545.9,581.9,104,124,91],
    [581.5,581.9,121,140,159],
    [617.2,581.9,197,137,87],
    [653.0,581.9,201,152,92],
    [545.9,617.5,197,166,89],
    [581.5,617.5,185,179,115],
    [617.2,617.5,128,138,80],
    [653.0,617.5,103,135,115],
    [545.9,653.2,58,97,111],
    [581.5,653.2,225,165,59],
    [617.2,653.2,175,150,60],
    [653.0,653.2,159,138,60],
    [545.9,689.0,106,109,57],
    [581.5,689.0,86,100,55],
    [617.2,689.0,48,65,53],
    [653.0,689.0,43,60,73],
    [545.9,724.7,82,111,105],
    [581.5,724.7,91,103,80],
    [617.2,724.7,125,124,75],
    [653.0,724.7,134,119,61],
    [545.9,760.4,162,146,88],
    [581.5,760.4,191,166,95],
    [617.2,760.4,199,178,163],
    [653.0,760.4,205,186,175],
    [545.9,796.1,161,112,114],
    [581.5,796.1,132,72,82],
    [617.2,796.1,117,55,72],
    [653.0,796.1,92,32,49],
    [545.9,831.8,53,29,42],
    [581.5,831.8,218,216,186],
    [617.2,831.8,215,197,148],
    [653.0,831.8,206,183,123],
    [545.9,867.5,176,128,108],
    [581.5,867.5,206,129,71],
    [617.2,867.5,193,123,51],
    [653.0,867.5,177,53,36],
    [545.9,903.2,145,74,41],
    [581.5,903.2,137,68,39],
    [617.2,903.2,148,92,45],
    [653.0,903.2,112,32,32],
    [545.9,938.9,87,46,35],
    [581.5,938.9,106,65,40],
    [617.2,938.9,133,188,205],
    [653.0,938.9,141,179,139],
    [545.9,974.6,131,162,104],
    [581.5,974.6,132,123,77],
    [617.2,974.6,129,108,73],
    [653.0,974.6,104,79,61],
    [545.9,1010.3,78,60,50],
    [581.5,1010.3,217,219,221],
    [617.2,1010.3,196,200,203],
    [653.0,1010.3,177,181,185],
    [545.9,1046.0,158,164,168],
    [581.5,1046.0,136,141,147],
    [617.2,1046.0,117,120,129],
    [653.0,1046.0,94,97,106],
    [545.9,1081.7,74,74,84],
    [581.5,1081.7,55,55,65],
    [617.2,1081.7,40,40,48],
    [653.0,1081.7,25,27,33],
    [545.9,1117.3,1,116,186],
    [581.5,1117.3,220,204,49],
    [617.2,1117.3,183,18,90],
    [653.0,1117.3,25,67,44]
  ],

  // physical order along the strip, tip -> handle.
  // Order inferred from observed dry-pad colours matching the standard
  // 10-parameter layout (cream leukocytes at tip -> blue glucose at handle).
  // VERIFY against the strip bottle before trusting results.
  PAD_SLOTS: [
    {key:'leukocytes', cx:353.0, cy:230.0, dry:[218,216,206]},
    {key:'nitrite', cx:353.0, cy:304.3, dry:[218,219,213]},
    {key:'urobilinogen', cx:353.0, cy:378.7, dry:[225,219,180]},
    {key:'protein', cx:353.0, cy:453.1, dry:[206,210,196]},
    {key:'ph', cx:353.0, cy:527.4, dry:[226,187,113]},
    {key:'blood', cx:353.0, cy:601.8, dry:[227,181,65]},
    {key:'sg', cx:353.0, cy:676.1, dry:[187,181,108]},
    {key:'ketone', cx:353.0, cy:750.5, dry:[206,193,177]},
    {key:'bilirubin', cx:353.0, cy:824.9, dry:[213,212,195]},
    {key:'glucose', cx:353.0, cy:899.2, dry:[132,197,206]}
  ],


  /* -------------------------------------------------------------------
     SCREENING BASELINE — measured from an UNUSED (dry) strip, 3 photos,
     colour-corrected, cross-photo spread dE 0.3-1.1.

     Ribbon ships no printed colour chart (their app does the scoring), so
     absolute concentrations are not yet knowable. What IS knowable is how
     far each pad has moved from its negative baseline — which is the
     question that actually matters for home screening: "has anything
     changed?" Analytes marked 'deviation' are normally negative/lowest,
     so distance from baseline is meaningful. pH and specific gravity span
     a real range and are marked 'range': they need true calibration
     points before they can be scored.

     CAVEAT: a dry strip is close to, but not identical to, a strip dipped
     in a negative sample. Dipping one in distilled water and re-running
     this gives the true wet negative — and pins specific gravity at 1.000.
     ------------------------------------------------------------------- */
  SCREENING: {
    // dE from baseline -> band. Measurement noise is ~1 dE.
    BANDS: { negative: 4, borderline: 10 },
    /* WET baseline — strip dipped in distilled water, 90s, 3 photos,
       colour-corrected, cross-photo spread dE 0.5-2.2. This supersedes the
       dry baseline: dry and wet differ by dE 4-58, so dry was never a valid
       negative reference.
         sg   'anchor'  -> distilled water is genuinely SG 1.000
         ph   'range'   -> water pH is CO2-driven, not a usable anchor
         leukocytes 'suspect' -> read mauve in pure water, which should be
                     negative/cream. Possible contamination or degraded
                     strip. Excluded from scoring until re-run. */
    /* CLEAN WET BASELINE — run 2, distilled water in a scrupulously clean
       container, 90s, 3 photos. Cross-photo spread dE 0.5-2.0.

       Supersedes run 1, which was contaminated: its leukocyte pad read
       mauve (a*=15.4) where a negative pad must be near-neutral. Run 2
       gives a*=1.5 — properly negative — confirming contamination rather
       than a degraded strip. Six analytes reproduced across the two runs
       to dE 0.9-4.0 (independent strips), which is the real precision
       figure for this setup. The three that differed (protein 8.2,
       sg 10.9, glucose 7.0) are exactly those a contaminated sample would
       disturb: dissolved ions raise SG, protein residue hits the protein
       pad. Run 2 is the trustworthy reference. */
    BASELINE_WET: {
      leukocytes:   {mode:'deviation', lab:[78.4,1.5,6.9]},
      nitrite:      {mode:'deviation', lab:[85.0,-0.7,7.1]},
      urobilinogen: {mode:'deviation', lab:[75.6,7.5,44.0]},
      protein:      {mode:'deviation', lab:[81.6,-8.8,32.4]},
      ph:           {mode:'range', lab:[64.5,20.5,51.3]},    // water pH is CO2-driven; needs buffers
      blood:        {mode:'deviation', lab:[71.0,11.9,65.7]},
      sg:           {mode:'anchor', lab:[37.3,-12.2,6.9]},   // distilled water = SG 1.000 (true endpoint)
      ketone:       {mode:'deviation', lab:[72.9,2.4,13.8]},
      bilirubin:    {mode:'deviation', lab:[82.7,-3.0,14.0]},
      glucose:      {mode:'deviation', lab:[71.6,-18.5,-9.7]},
    },
    BASELINE_DRY_SUPERSEDED: {
    leukocytes:   {mode:'deviation', lab:[87.4,-1.1,9.0]},
    nitrite:      {mode:'deviation', lab:[88.3,-1.4,6.2]},
    urobilinogen: {mode:'deviation', lab:[88.2,-3.6,24.8]},
    protein:      {mode:'deviation', lab:[84.5,-3.7,10.2]},
    ph:           {mode:'range', lab:[79.4,6.9,47.6]},
    blood:        {mode:'deviation', lab:[77.7,7.2,67.1]},
    sg:           {mode:'range', lab:[73.4,-7.5,41.5]},
    ketone:       {mode:'deviation', lab:[79.7,2.5,13.1]},
    bilirubin:    {mode:'deviation', lab:[85.6,-2.6,12.5]},
    glucose:      {mode:'deviation', lab:[76.5,-19.9,-8.2]},
    },
  },

  // level index -> CIELAB. Only needed for absolute concentrations.
  REFERENCE_CHART: {},
};
})(typeof window!=='undefined'?window:globalThis);
