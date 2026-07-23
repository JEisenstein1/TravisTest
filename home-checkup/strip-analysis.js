/* =====================================================================
   strip-analysis.js  —  ColoriTech card -> 10-marker urine reading
   ---------------------------------------------------------------------
   Load order:
     <script src="js-aruco2.min.js"></script>
     <script src="card-calibration.js"></script>
     <script src="strip-analysis.js"></script>

   Everything here is driven by CARD_CALIBRATION, which was measured from
   real photos of the physical card. Key validated design decisions:

   1. CUSTOM 4-CODE DICTIONARY. The card uses DICT_4X4_50. js-aruco2 ships
      a 1000-code 4x4 dictionary but matching against it found only 1 of 4
      markers. Registering a dictionary containing ONLY this card's 4 codes
      makes matching tolerant: 4/4 markers on all 7 test photos.
      (The official opencv.js build has no aruco bindings at all, so it is
      not an option here.)

   2. DETECT SMALL, SAMPLE BIG. js-aruco2's thresholding fails above
      ~1000px. We detect on a downscaled copy, scale the corners back up,
      and sample colour from the FULL-resolution pixels. Measured worst
      corner error 7.4px at 8160px wide (~2 canonical px) — negligible
      against a 35px patch.

   3. POLYNOMIAL COLOUR CORRECTION. On held-out patches, mean dE fell from
      4.5 (raw) to 1.7 (linear 3x4) to 0.7-1.7 (polynomial). Polynomial won
      on every test photo, so it is the default with linear as fallback.
   ===================================================================== */
(function (global) {
'use strict';

const C = () => global.CARD_CALIBRATION;

/* ---------- register the card's dictionary with js-aruco2 ---------- */
let dictReady = false;
function ensureDict(){
  if (dictReady) return true;
  if (!global.AR || !global.AR.DICTIONARIES) return false;
  const cal = C(); if (!cal) return false;
  global.AR.DICTIONARIES[cal.DICT_NAME] = {
    nBits: cal.DICT.nBits, tau: cal.DICT.tau, codeList: cal.DICT.codeList.map(c => c.slice())
  };
  dictReady = true; return true;
}

/* ---------- math ---------- */
function solveLinear(A,b){
  const n=b.length, M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
    [M[c],M[p]]=[M[p],M[c]];
    if(Math.abs(M[c][c])<1e-12) return null;
    for(let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c]/M[c][c];
      for(let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; }
  }
  const x=new Array(n); for(let i=0;i<n;i++) x[i]=M[i][n]/M[i][i]; return x;
}
function homography(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){ const[x,y]=src[i],[u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v); }
  const h=solveLinear(A,b); if(!h) return null;
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
const applyH=(H,x,y)=>{ const d=H[6]*x+H[7]*y+H[8];
  return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d]; };
const s2l=c=>{c=Math.min(255,Math.max(0,c))/255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const l2s=c=>255*(c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055);
function rgb2lab(rgb){
  const r=s2l(rgb[0]),g=s2l(rgb[1]),b=s2l(rgb[2]);
  let X=(r*.4124+g*.3576+b*.1805)/0.95047, Y=r*.2126+g*.7152+b*.0722, Z=(r*.0193+g*.1192+b*.9505)/1.08883;
  const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;
  const fx=f(X),fy=f(Y),fz=f(Z);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}
const deltaE=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

/* ---------- colour correction ---------- */
const featLin  = v => [v[0],v[1],v[2],1];
const featPoly = v => [v[0],v[1],v[2],v[0]*v[0],v[1]*v[1],v[2]*v[2],v[0]*v[1],v[1]*v[2],v[0]*v[2],1];
function fitCC(obs,tgt,poly){
  const F=poly?featPoly:featLin, n=F([0,0,0]).length;
  if(obs.length<n+2) return null;
  const O=obs.map(p=>F(p.map(s2l))), T=tgt.map(p=>p.map(s2l));
  const AtA=Array.from({length:n},()=>Array(n).fill(0));
  for(const row of O) for(let i=0;i<n;i++) for(let j=0;j<n;j++) AtA[i][j]+=row[i]*row[j];
  for(let i=0;i<n;i++) AtA[i][i]+=1e-6;                 // ridge, keeps it stable
  const M=[];
  for(let ch=0;ch<3;ch++){
    const Atb=new Array(n).fill(0);
    O.forEach((row,k)=>{ for(let i=0;i<n;i++) Atb[i]+=row[i]*T[k][ch]; });
    const x=solveLinear(AtA.map(r=>[...r]),Atb); if(!x) return null;
    M.push(x);
  }
  return {M,poly};
}
function applyCC(cc,rgb){
  if(!cc) return rgb.slice();
  const v=(cc.poly?featPoly:featLin)(rgb.map(s2l));
  return [0,1,2].map(ch=>{
    let s=0; for(let i=0;i<v.length;i++) s+=cc.M[ch][i]*v[i];
    return Math.min(255,Math.max(0,l2s(Math.max(0,s))));
  });
}
function ccError(cc,obs,tgt){
  let e=0; for(let i=0;i<obs.length;i++) e+=deltaE(rgb2lab(applyCC(cc,obs[i])),rgb2lab(tgt[i]));
  return e/obs.length;
}

/* ---------- detection ---------- */
function detect(imageData){
  if(!global.AR||!global.AR.Detector) return {ok:false,reason:'aruco-lib-missing'};
  if(!ensureDict()) return {ok:false,reason:'calibration-missing'};
  const cal=C(), W=imageData.width, H=imageData.height;
  const s=Math.min(1, cal.DETECT_WIDTH/Math.max(W,H));

  let src=imageData;
  if(s<1){
    const cv=document.createElement('canvas'); cv.width=Math.round(W*s); cv.height=Math.round(H*s);
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
    tmp.getContext('2d',{willReadFrequently:true}).putImageData(imageData,0,0);
    ctx.drawImage(tmp,0,0,cv.width,cv.height);
    src=ctx.getImageData(0,0,cv.width,cv.height);
  }
  let markers;
  try{
    const d=new global.AR.Detector({dictionaryName:cal.DICT_NAME, maxHammingDistance:cal.DICT.tau});
    markers=d.detect(src)||[];
  }catch(e){ return {ok:false,reason:'detect-threw',detail:String(e)}; }

  // dedupe: js-aruco2 can report a marker more than once -> average centroids
  const acc={};
  for(const m of markers){
    const id=cal.DICT_ID_MAP[m.id]; if(id===undefined) continue;
    const cx=m.corners.reduce((a,c)=>a+c.x,0)/4/s;
    const cy=m.corners.reduce((a,c)=>a+c.y,0)/4/s;
    (acc[id]=acc[id]||[]).push([cx,cy]);
  }
  const cen={};
  for(const id in acc){
    const L=acc[id];
    cen[id]=[L.reduce((a,p)=>a+p[0],0)/L.length, L.reduce((a,p)=>a+p[1],0)/L.length];
  }
  const need=cal.MARKER_IDS, missing=['TL','TR','BR','BL'].filter(k=>!(need[k] in cen));
  if(missing.length) return {ok:false,reason:'markers-not-found',missing,found:Object.keys(cen).map(Number)};
  return {ok:true,centres:cen};
}

/* ---------- sampling ---------- */
function sampleRect(id,H,cx,cy,half,grid){
  const {data,width,height}=id, out=[], step=(2*half)/(grid-1);
  for(let i=0;i<grid;i++) for(let j=0;j<grid;j++){
    const [sx,sy]=applyH(H,cx-half+i*step,cy-half+j*step);
    const px=Math.round(sx),py=Math.round(sy);
    if(px<0||py<0||px>=width||py>=height) continue;
    const o=(py*width+px)*4; out.push([data[o],data[o+1],data[o+2]]);
  }
  if(out.length<4) return null;
  out.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
  const keep=out.slice(0,Math.max(1,Math.floor(out.length*0.75)));   // drop glare
  const m=[0,0,0]; keep.forEach(s=>{m[0]+=s[0];m[1]+=s[1];m[2]+=s[2];});
  const mean=[m[0]/keep.length,m[1]/keep.length,m[2]/keep.length];
  let v=0; keep.forEach(s=>{v+=(s[0]-mean[0])**2+(s[1]-mean[1])**2+(s[2]-mean[2])**2;});
  mean.sd=Math.sqrt(v/keep.length/3);                                // within-sample stddev
  return mean;
}

/* ---------- dynamic strip localisation ----------
   The strip shifts between placements (measured: 21px in x, 38px in y),
   so pad positions must be found per photo, not hardcoded. We sample a
   coarse canonical grid through the homography, locate the strip as the
   brightest 49px-wide column band, then anchor pads to its tip. */
function locateStrip(id,H){
  const S=C().STRIP; if(!S) return null;
  const [cx0,cx1]=S.CHANNEL_X, [cy0,cy1]=S.CHANNEL_Y, STEP=3;
  const nx=Math.floor((cx1-cx0)/STEP), ny=Math.floor((cy1-cy0)/STEP);
  const lum=new Float32Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){
    const [sx,sy]=applyH(H, cx0+i*STEP, cy0+j*STEP);
    const px=Math.round(sx),py=Math.round(sy);
    let v=0;
    if(px>=0&&py>=0&&px<id.width&&py<id.height){
      const o=(py*id.width+px)*4; v=(id.data[o]+id.data[o+1]+id.data[o+2])/3;
    }
    lum[j*nx+i]=v;
  }
  const W=Math.max(3,Math.round(S.WIDTH/STEP));
  const median=a=>{const b=Array.from(a).sort((x,y)=>x-y);return b[b.length>>1];};
  let bestX=0,bestScore=-1;
  for(let i=0;i+W<nx;i++){
    const col=[];
    for(let j=0;j<ny;j++) for(let k=0;k<W;k++) col.push(lum[j*nx+i+k]);
    const m=median(col);
    if(m>bestScore){bestScore=m;bestX=i;}
  }
  const stripCx = cx0 + (bestX + W/2)*STEP;
  // tip = start of the longest contiguous run of bright rows within the band
  const rowBright=[];
  for(let j=0;j<ny;j++){
    const row=[]; for(let k=0;k<W;k++) row.push(lum[j*nx+bestX+k]);
    rowBright.push(median(row)>S.LUM_MIN);
  }
  let bs=-1,bl=0,cs=-1,cl=0;
  for(let j=0;j<=ny;j++){
    if(j<ny&&rowBright[j]){ if(cs<0)cs=j; cl++; }
    else { if(cl>bl){bl=cl;bs=cs;} cs=-1; cl=0; }
  }
  if(bs<0||bl<10) return null;
  const tipY = cy0 + bs*STEP;
  return {cx:stripCx, tipY, lengthPx:bl*STEP,
          padY:i=>tipY+S.TIP_TO_PAD0+S.PITCH*i};
}
function classify(key,lab){
  const chart=C().REFERENCE_CHART[key];
  if(!chart||!chart.length) return {index:null,confidence:0};
  let best=chart[0],bd=Infinity,sd=Infinity;
  for(const lv of chart){ const d=deltaE(lab,lv.lab);
    if(d<bd){ sd=bd; bd=d; best=lv; } else if(d<sd) sd=d; }
  const conf = sd===Infinity?0.5:Math.max(0,Math.min(1,(sd-bd)/(sd+1e-6)));
  return {index:best.i, confidence:+conf.toFixed(2), deltaE:+bd.toFixed(1)};
}

/* Screening: how far has this pad moved from its negative baseline?
   Used when no REFERENCE_CHART exists. Reports a band, never a fake number. */
function screen(key,lab){
  const S=C().SCREENING; if(!S) return null; if(!((S.BASELINE_WET&&S.BASELINE_WET[key])||(S.BASELINE_DRY_SUPERSEDED&&S.BASELINE_DRY_SUPERSEDED[key]))) return null;
  const base=(S.BASELINE_WET&&S.BASELINE_WET[key])||S.BASELINE_DRY_SUPERSEDED[key];
  if(base.mode!=='deviation') return {mode:'range', band:'needs-calibration',
    note:'spans a real range — needs true calibration points before it can be scored'};
  const d=deltaE(lab,base.lab);
  const band = d<S.BANDS.negative ? 'negative'
             : d<S.BANDS.borderline ? 'borderline' : 'elevated';
  return {mode:'deviation', deltaFromNegative:+d.toFixed(1), band};
}

/* ---------- main ---------- */
function analyze(imageData){
  const cal=C(); if(!cal) return {ok:false,reason:'calibration-missing'};
  const det=detect(imageData);
  if(!det.ok) return det;

  const ids=cal.MARKER_IDS, mc=cal.MARKER_CANON;
  const srcPts=['TL','TR','BR','BL'].map(k=>det.centres[ids[k]]);
  const dstPts=['TL','TR','BR','BL'].map(k=>mc[k]);
  const Hc2s=homography(dstPts,srcPts);            // canonical -> source
  if(!Hc2s) return {ok:false,reason:'homography-failed'};

  const warnings=[];
  const obs=[],tgt=[];
  for(const p of cal.REFERENCE_PATCHES){
    const s=sampleRect(imageData,Hc2s,p[0],p[1],cal.PATCH_HALF,5);
    if(s){ obs.push(s); tgt.push([p[2],p[3],p[4]]); }
  }
  let cc=null, ccResidual=null;
  if(obs.length>=20){
    const poly=fitCC(obs,tgt,true), lin=fitCC(obs,tgt,false);
    const cand=[poly,lin].filter(Boolean);
    if(cand.length){ cc=cand.reduce((a,b)=>ccError(a,obs,tgt)<=ccError(b,obs,tgt)?a:b);
      ccResidual=+ccError(cc,obs,tgt).toFixed(2);
      warnings.push('cc='+(cc.poly?'poly':'linear')+' residualDE='+ccResidual); }
  }
  if(!cc) warnings.push('colour-correction-unavailable: colours uncorrected');

  // quality gate — thresholds derived from real-photo pad variance. maxPadSD
  // recalibrated 2026-07-23: 6 in-focus distilled-water photos read correctly
  // yet showed per-pad sd up to ~18 (real reagent-pad texture, not a defect),
  // so 12 flagged every good photo. 22 keeps genuinely bad frames flagged.
  const QUALITY={ maxResidualDE:6, maxPadSD:22 };
  const quality={ retake:false, reasons:[] };
  if(ccResidual!==null && ccResidual>QUALITY.maxResidualDE){
    quality.retake=true; quality.reasons.push('colour correction poor (residual '+ccResidual+') — check lighting/focus'); }

  const loc=locateStrip(imageData,Hc2s);
  if(loc){ warnings.push('strip located: cx='+loc.cx.toFixed(0)+' tip='+loc.tipY.toFixed(0)); }
  else { warnings.push('strip not located — falling back to fixed pad coordinates'); quality.retake=true;
         quality.reasons.push('could not locate strip in channel'); }

  const reading={},screening={},detail={};
  for(let idx=0; idx<cal.PAD_SLOTS.length; idx++){
    const slot=cal.PAD_SLOTS[idx];
    const px = loc? loc.cx      : slot.cx;
    const py = loc? loc.padY(idx): slot.cy;
    const raw=sampleRect(imageData,Hc2s,px,py,cal.PAD_HALF,7);
    if(!raw){ detail[slot.key]={error:'pad-off-image'}; quality.retake=true; quality.reasons.push(slot.key+' off image'); continue; }
    const corr=applyCC(cc,raw), lab=rgb2lab(corr), cls=classify(slot.key,lab);
    const scr=screen(slot.key,lab);
    const noisy = raw.sd>QUALITY.maxPadSD;
    if(noisy){ quality.retake=true; quality.reasons.push(slot.key+' pad noisy (sd '+raw.sd.toFixed(1)+') — bubble/finger/torn?'); }
    detail[slot.key]={raw:raw.map(Math.round),corrected:corr.map(Math.round),
                      at:[Math.round(px),Math.round(py)],
                      sd:+raw.sd.toFixed(1),noisy,lab:lab.map(v=>+v.toFixed(1)),screening:scr,...cls};
    if(cls.index!==null) reading[slot.key]=cls.index;
    if(scr) screening[slot.key]=scr;
  }
  const scored=Object.keys(reading).length;
  const flagged=Object.keys(screening).filter(k=>screening[k].band==='elevated'||screening[k].band==='borderline');
  return {ok:true,reading,screening,flagged,detail,warnings,quality,ccResidual,
          strip: loc? {cx:+loc.cx.toFixed(1), tipY:+loc.tipY.toFixed(1), length:loc.lengthPx}:null,
          patchesUsed:obs.length,
          mode: scored===cal.PAD_SLOTS.length ? 'quantitative' : 'screening',
          calibrated:!!cc && scored===cal.PAD_SLOTS.length, scored};
}

function analyzeElement(el){
  const w=el.naturalWidth||el.width, h=el.naturalHeight||el.height;
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(el,0,0,w,h);
  return analyze(ctx.getImageData(0,0,w,h));
}
/* Multi-shot: majority vote per analyte, mean confidence. */
function analyzeMany(list){
  const runs=list.map(analyzeElement).filter(r=>r.ok);
  if(!runs.length) return {ok:false,reason:'no-successful-frames'};
  if(runs.length===1) return runs[0];
  const reading={},screening={},detail={};
  for(const slot of C().PAD_SLOTS){
    const votes={};
    runs.forEach(r=>{ const i=r.reading[slot.key]; if(i!==undefined) votes[i]=(votes[i]||0)+1; });
    const best=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0];
    if(best!==undefined){ reading[slot.key]=+best;
      detail[slot.key]={votes,frames:runs.length}; }
  }
  return {ok:true,reading,detail,frames:runs.length,
          calibrated:runs.every(r=>r.calibrated), scored:Object.keys(reading).length,
          warnings:['multi-frame vote over '+runs.length+' frames']};
}

global.StripAnalysis={analyze,analyzeElement,analyzeMany,
  _internals:{homography,applyH,rgb2lab,deltaE,fitCC,applyCC}};
})(typeof window!=='undefined'?window:globalThis);
