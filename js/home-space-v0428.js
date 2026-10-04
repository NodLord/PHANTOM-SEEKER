(() => {
  "use strict";

  const deepCanvas = document.getElementById("phantom-deep-field");
  const trafficCanvas = document.getElementById("phantom-traffic-field");
  if (!deepCanvas || !trafficCanvas) return;

  const deepCtx = deepCanvas.getContext("2d", { alpha: true, desynchronized: true });
  const trafficCtx = trafficCanvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!deepCtx || !trafficCtx) return;

  /* Existing draw helpers intentionally share one mutable context.
     The renderer swaps it only at layer boundaries, avoiding a risky rewrite
     of the mature celestial/ship drawing code. */
  let ctx = deepCtx;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const TAU = Math.PI * 2;
  const SEGMENT = 1120;
  const SEGMENT_RADIUS = 7;
  const DEEP_DPR_MAX = 1.10;
  const TRAFFIC_DPR_MAX = 1.25;
  const DEEP_FPS_FULL = 30;
  const DEEP_FPS_MEDIUM = 24;
  const DEEP_FPS_PERF = 20;

  /* V0.4.28 — Nebula Engine over V0.4.27.5 Performance Core + world-anchored ship traffic.
     Lower parallax = farther away. Objects still live in one world coordinate
     system; these bands are composition/depth semantics, not screen layers. */
  const DEPTH_BANDS = Object.freeze({
    FAR:  { min:.018, max:.070 },
    MID:  { min:.080, max:.180 },
    NEAR: { min:.190, max:.355 }
  });

  const segmentCache = new Map();
  const nebulaSprites = [];
  const galaxySprites = [];
  const activeShips = [];
  const fsdWakes = [];

  let width = 1;
  let height = 1;
  let deepDpr = 1;
  let trafficDpr = 1;
  let lastDeepFrame = -Infinity;
  let deepFrameInterval = 1000 / DEEP_FPS_FULL;
  let visibleEntityCenter = null;
  let visibleEntityCache = [];
  let perfWindowStart = performance.now();
  let perfCostSum = 0;
  let perfSamples = 0;
  let targetScroll = window.scrollY || 0;
  let smoothScroll = targetScroll;
  let lastFrame = performance.now();
  let elapsed = 0;
  let raf = 0;
  let visible = !document.hidden;
  let nextShipAt = 2500 + Math.random() * 4200;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / Math.max(.00001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hash32(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return n >>> 0;
  }

  function rngFor(seed) {
    let s = hash32(seed || 1) || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function edgeX(rnd, inner = .29) {
    if (rnd() < .5) return .035 + rnd() * (inner - .035);
    return 1 - inner + rnd() * (inner - .035);
  }


  /* -------------------------------------------------------
     V0.4.28 // NEBULA ENGINE
     Cached 2.5D procedural volumes. Each specimen is built once from a
     deterministic seed as three transparent layers: distant glow/body,
     structured gas/dust, and fine ionisation/stellar detail. Runtime work is
     only a few drawImage calls, preserving the Performance Core budget.
     ------------------------------------------------------- */

  const NEBULA_FAMILIES = Object.freeze([
    "emission", "filament", "bubble", "bipolar",
    "shell", "torn", "dark", "veil"
  ]);

  const NEBULA_PALETTES = Object.freeze([
    { name:"cold-cyan",   core:[78,137,156], rim:[30,74,94],  dust:[7,18,27],  star:[173,214,232], dark:false },
    { name:"midnight",    core:[58,76,126],  rim:[27,41,80],  dust:[7,12,28],  star:[175,197,232], dark:false },
    { name:"violet",      core:[100,78,137], rim:[52,39,85],  dust:[13,10,29], star:[210,190,234], dark:false },
    { name:"blue-grey",   core:[82,105,126], rim:[35,58,78],  dust:[8,16,24],  star:[190,211,224], dark:false },
    { name:"pine",        core:[52,101,83],  rim:[24,57,52],  dust:[7,18,18],  star:[179,213,204], dark:false },
    { name:"black-cloud", core:[25,34,43],   rim:[48,67,80],  dust:[2,6,10],   star:[154,185,205], dark:true  },
    { name:"cyan-violet", core:[67,114,139], rim:[63,54,105], dust:[8,13,29],  star:[190,217,235], dark:false },
    { name:"violet-blue", core:[82,72,133],  rim:[36,55,101], dust:[10,10,31], star:[199,194,233], dark:false },
    { name:"pine-deep",   core:[44,92,73],   rim:[19,50,45],  dust:[5,15,16],  star:[172,207,198], dark:false },
    { name:"navy",        core:[46,66,108],  rim:[20,35,70],  dust:[6,11,25],  star:[170,196,228], dark:false },
    { name:"dark-blue",   core:[24,37,51],   rim:[46,67,86],  dust:[2,6,11],   star:[158,191,211], dark:true  },
    { name:"ice-cyan",    core:[70,128,148], rim:[27,69,87],  dust:[6,16,24],  star:[183,220,235], dark:false }
  ]);

  function makeValueNoise(seed, grid=96) {
    const rnd=rngFor(seed);
    const n=grid+1;
    const values=new Float32Array(n*n);
    for (let i=0;i<values.length;i++) values[i]=rnd();
    const fade=t=>t*t*(3-2*t);
    return (x,y)=>{
      let xi=Math.floor(x), yi=Math.floor(y);
      let tx=x-xi, ty=y-yi;
      xi=((xi%grid)+grid)%grid;
      yi=((yi%grid)+grid)%grid;
      const x1=(xi+1)%grid, y1=(yi+1)%grid;
      const a=values[yi*n+xi], b=values[yi*n+x1];
      const c=values[y1*n+xi], d=values[y1*n+x1];
      const u=fade(tx), v=fade(ty);
      return lerp(lerp(a,b,u),lerp(c,d,u),v);
    };
  }

  function nebulaFbm(noise,x,y,octaves=5) {
    let sum=0, amp=.55, norm=0, freq=1;
    for (let i=0;i<octaves;i++) {
      sum += noise(x*freq,y*freq)*amp;
      norm += amp;
      freq *= 2.03;
      amp *= .51;
    }
    return sum/Math.max(.0001,norm);
  }

  function nebulaRidge(noise,x,y) {
    return 1-Math.abs(nebulaFbm(noise,x,y,4)*2-1);
  }

  function nebulaMorphology(family,x,y,cloud,ridge,detail,phase) {
    const rr=Math.sqrt(x*x+y*y);
    const env=1-smoothstep(.60,1.18,rr);
    let body=0, rim=0, dust=0;

    if (family==="emission") {
      body=env*(.22+.78*cloud)*(.54+.60*ridge);
      rim=env*Math.pow(ridge,2.2)*(.30+.70*detail);
      dust=env*Math.max(0,.54-detail)*.34;
    } else if (family==="filament") {
      const spine=.18*Math.sin(x*4.2+phase)+.08*Math.sin(x*9.1-phase*.6);
      const band=Math.exp(-Math.abs(y-spine)*8.3);
      const split=Math.exp(-Math.abs(y+spine*.65+.22)*10.0);
      body=env*(.16*cloud+.72*band*ridge+.28*split*detail);
      rim=env*Math.max(band,split)*Math.pow(ridge,1.8);
      dust=env*(1-band)*Math.max(0,.48-detail)*.28;
    } else if (family==="bubble") {
      const ring=Math.exp(-Math.abs(rr-.57)*11.5);
      const broken=.32+.88*Math.pow(detail,.85);
      body=ring*broken*env + env*cloud*.12;
      rim=ring*Math.pow(ridge,1.6)*env;
      dust=(1-smoothstep(.08,.45,rr))*env*.58*(.45+.55*cloud);
    } else if (family==="bipolar") {
      const l1=Math.exp(-((x-.38)*(x-.38)/.20 + y*y/.085));
      const l2=Math.exp(-((x+.38)*(x+.38)/.20 + y*y/.085));
      const lobes=Math.max(l1,l2);
      const waist=Math.exp(-(x*x/.05+y*y/.012));
      body=env*lobes*(.38+.72*cloud);
      rim=env*lobes*Math.pow(ridge,2.0);
      dust=env*waist*(.50+.50*detail);
    } else if (family==="shell") {
      const ring1=Math.exp(-Math.abs(rr-.48)*14.0);
      const ring2=Math.exp(-Math.abs(rr-.68)*15.5)*.55;
      const arcs=.50+.50*Math.sin(Math.atan2(y,x)*3+phase+detail*5.5);
      body=env*(ring1+ring2)*(.28+.72*cloud)*(.55+.45*arcs);
      rim=env*(ring1+ring2)*Math.pow(ridge,2.2);
      dust=env*(1-smoothstep(.12,.39,rr))*.28;
    } else if (family==="torn") {
      const tear=smoothstep(.33,.63,detail)*smoothstep(.26,.60,ridge);
      const slash=.5+.5*Math.sin((x*.8+y*1.6)*11+phase);
      body=env*tear*(.34+.66*cloud)*(.62+.38*slash);
      rim=env*Math.pow(ridge,2.5)*tear;
      dust=env*Math.max(0,.52-detail)*.38;
    } else if (family==="dark") {
      const dense=env*(.38+.62*cloud);
      body=env*Math.pow(ridge,2.3)*.32;
      rim=env*Math.pow(ridge,2.8)*.42;
      dust=dense*(.62+.38*detail);
    } else { /* veil */
      const veil=Math.exp(-Math.abs(y-.16*Math.sin(x*5.3+phase))*5.4);
      const veil2=Math.exp(-Math.abs(y+.28+.11*Math.sin(x*7.2-phase))*8.2)*.65;
      body=env*(veil+veil2)*(.34+.70*cloud);
      rim=env*Math.max(veil,veil2)*Math.pow(ridge,1.65);
      dust=env*Math.max(0,.47-detail)*.24;
    }

    return {
      body:clamp(body,0,1),
      rim:clamp(rim,0,1),
      dust:clamp(dust,0,1),
      env:clamp(env,0,1)
    };
  }

  function createNebulaLayerCanvas(size,fieldSize,pixels,detailPainter=null) {
    const low=makeCanvas(fieldSize,fieldSize);
    const lg=low.getContext("2d",{alpha:true});
    const img=lg.createImageData(fieldSize,fieldSize);
    img.data.set(pixels);
    lg.putImageData(img,0,0);

    const full=makeCanvas(size,size);
    const g=full.getContext("2d",{alpha:true});
    g.imageSmoothingEnabled=true;
    g.imageSmoothingQuality="high";
    g.drawImage(low,0,0,size,size);
    if (detailPainter) detailPainter(g,size);
    return full;
  }

  function buildNebulaSprite(seed, variant) {
    const size=560;
    const fieldSize=224;
    const rnd=rngFor(seed);
    const family=NEBULA_FAMILIES[variant%NEBULA_FAMILIES.length];
    const pal=NEBULA_PALETTES[variant%NEBULA_PALETTES.length];
    const noiseA=makeValueNoise(seed+1031,97);
    const noiseB=makeValueNoise(seed+7919,89);
    const noiseC=makeValueNoise(seed+17011,101);
    const phase=rnd()*TAU;
    const angle=(rnd()-.5)*.72;
    const ca=Math.cos(angle), sa=Math.sin(angle);
    const stretchX=.82+rnd()*.30;
    const stretchY=.54+rnd()*.24;
    const warpAmp=.17+rnd()*.13;

    const back=new Uint8ClampedArray(fieldSize*fieldSize*4);
    const body=new Uint8ClampedArray(fieldSize*fieldSize*4);
    const front=new Uint8ClampedArray(fieldSize*fieldSize*4);

    for (let py=0;py<fieldSize;py++) {
      for (let px=0;px<fieldSize;px++) {
        const i=(py*fieldSize+px)*4;
        let x=(px/(fieldSize-1))*2-1;
        let y=(py/(fieldSize-1))*2-1;

        const xr=(x*ca-y*sa)/stretchX;
        const yr=(x*sa+y*ca)/stretchY;
        const wa=nebulaFbm(noiseA,xr*1.45+5.7,yr*1.45-3.2,4)-.5;
        const wb=nebulaFbm(noiseB,xr*1.55-7.1,yr*1.55+4.4,4)-.5;
        const wx=xr+wa*warpAmp;
        const wy=yr+wb*warpAmp;

        const cloud=nebulaFbm(noiseA,wx*2.15+11.4,wy*2.15-8.1,5);
        const detail=nebulaFbm(noiseB,wx*4.55-3.8,wy*4.55+6.2,5);
        const ridge=nebulaRidge(noiseC,wx*3.3+2.7,wy*3.3-5.1);
        const m=nebulaMorphology(family,wx,wy,cloud,ridge,detail,phase);

        /* Low-frequency rear emission gives volume without becoming a full
           viewport colour wash. */
        const backA=clamp((m.body*.33+m.env*.035)*(pal.dark?.52:1),0,.32);
        const backLift=.72+.28*cloud;
        back[i]=clamp(pal.rim[0]*backLift+5,0,255);
        back[i+1]=clamp(pal.rim[1]*backLift+7,0,255);
        back[i+2]=clamp(pal.rim[2]*backLift+10,0,255);
        back[i+3]=Math.round(backA*255);

        /* Main gas body: coloured, textured and partially opaque. */
        const bodyA=clamp(m.body*(pal.dark?.34:.46),0,.48);
        const light=.72+.50*detail;
        body[i]=clamp(pal.core[0]*light,0,255);
        body[i+1]=clamp(pal.core[1]*light,0,255);
        body[i+2]=clamp(pal.core[2]*light,0,255);
        body[i+3]=Math.round(bodyA*255);

        /* Foreground contains ionised rims plus genuinely dark dust lanes.
           Dark families favour absorption; bright families favour emission. */
        const emission=m.rim*(pal.dark?.22:.52);
        const dust=m.dust*(pal.dark?.62:.33);
        const chooseDust=dust>emission*.86;
        if (chooseDust) {
          front[i]=pal.dust[0]; front[i+1]=pal.dust[1]; front[i+2]=pal.dust[2];
          front[i+3]=Math.round(clamp(dust,0,.62)*255);
        } else {
          const hi=.88+.40*ridge;
          front[i]=clamp(pal.star[0]*hi,0,255);
          front[i+1]=clamp(pal.star[1]*hi,0,255);
          front[i+2]=clamp(pal.star[2]*hi,0,255);
          front[i+3]=Math.round(clamp(emission,0,.50)*255);
        }
      }
    }

    const backCanvas=createNebulaLayerCanvas(size,fieldSize,back);
    const bodyCanvas=createNebulaLayerCanvas(size,fieldSize,body);
    const frontCanvas=createNebulaLayerCanvas(size,fieldSize,front,(g,s)=>{
      const detailRnd=rngFor(seed+30011);
      g.save();
      g.globalCompositeOperation="screen";
      g.lineCap="round";

      /* Full-resolution hairline filaments stop the procedural field from
         looking like a blurred colour cloud when scaled up. */
      const filaments=10+Math.floor(detailRnd()*11);
      for (let f=0;f<filaments;f++) {
        const y0=s*(.22+detailRnd()*.56);
        const x0=s*(.08+detailRnd()*.16);
        const x1=s*(.76+detailRnd()*.16);
        const amp=s*(.018+detailRnd()*.060);
        const freq=1.0+detailRnd()*2.1;
        const p=detailRnd()*TAU;
        g.beginPath();
        for (let j=0;j<64;j++) {
          const q=j/63;
          const xx=lerp(x0,x1,q);
          const yy=y0+Math.sin(q*Math.PI*freq+p)*amp*(.55+.45*Math.sin(q*Math.PI));
          if (!j) g.moveTo(xx,yy); else g.lineTo(xx,yy);
        }
        g.strokeStyle=`rgba(${pal.star[0]},${pal.star[1]},${pal.star[2]},${.025+detailRnd()*.055})`;
        g.lineWidth=.45+detailRnd()*1.65;
        g.stroke();
      }

      /* Embedded stellar grains. The distribution is intentionally sparse;
         the particles suggest star formation instead of becoming a cluster. */
      const stars=85+Math.floor(detailRnd()*115);
      for (let i=0;i<stars;i++) {
        const a=detailRnd()*TAU;
        const rr=Math.pow(detailRnd(),.68)*s*.39;
        const px=s*.5+Math.cos(a)*rr*(.82+detailRnd()*.28);
        const py=s*.5+Math.sin(a)*rr*(.48+detailRnd()*.25);
        const sz=.30+Math.pow(detailRnd(),4.2)*1.15;
        const al=.035+Math.pow(detailRnd(),2.1)*.16;
        g.fillStyle=`rgba(${pal.star[0]},${pal.star[1]},${pal.star[2]},${al})`;
        g.beginPath(); g.arc(px,py,sz,0,TAU); g.fill();
      }
      g.restore();
    });

    return {
      family, palette:pal.name,
      layers:[
        { canvas:backCanvas,  alpha:.72, blend:"screen",      parallax:-1.00, scale:.985 },
        { canvas:bodyCanvas,  alpha:1.00, blend:"source-over", parallax: 0.00, scale:1.000 },
        { canvas:frontCanvas, alpha:.86, blend:pal.dark?"source-over":"screen", parallax:1.00, scale:1.018 }
      ]
    };
  }


  function buildGalaxySprite(seed, morph) {
    const size = 760;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha: true });
    const rnd = rngFor(seed);
    g.clearRect(0,0,size,size);
    g.translate(size/2,size/2);

    const armCount = [2,3,4,2,3,4,2,3,4][morph % 9];
    const flatten = .42 + rnd() * .18;
    const twist = 5.3 + rnd() * 2.8;
    const armSpread = .095 + rnd() * .055;
    const barred = morph % 4 === 1 || morph % 7 === 4;
    const reverse = morph % 5 === 3 ? -1 : 1;

    /* Faint stellar envelope only, fading continuously from centre to edge.
       There is deliberately NO solid disk. */
    g.globalCompositeOperation = "screen";
    const halo = g.createRadialGradient(0,0,0,0,0,245);
    halo.addColorStop(0,"rgba(177,197,210,.095)");
    halo.addColorStop(.18,"rgba(125,154,172,.055)");
    halo.addColorStop(.52,"rgba(69,98,117,.018)");
    halo.addColorStop(1,"rgba(28,52,68,0)");
    g.fillStyle = halo;
    g.beginPath(); g.arc(0,0,245,0,TAU); g.fill();

    /* Dense but irregular core made from stars, not a filled ellipse. */
    for (let i=0;i<920;i++) {
      const a=rnd()*TAU;
      const rr=Math.pow(rnd(),2.15)*58;
      const x=Math.cos(a)*rr;
      const y=Math.sin(a)*rr*(.68+rnd()*.22);
      const lum=178+Math.floor(rnd()*68);
      const alpha=.05+Math.pow(rnd(),1.7)*.40;
      const sz=.20+Math.pow(rnd(),4)*1.45;
      g.fillStyle=`rgba(${lum},${Math.min(245,lum+8)},${Math.min(250,lum+15)},${alpha})`;
      g.beginPath(); g.arc(x,y,sz,0,TAU); g.fill();
    }

    if (barred) {
      for (let i=0;i<280;i++) {
        const q=(rnd()-.5)*2;
        const x=q*76+(rnd()-.5)*8;
        const y=(rnd()-.5)*(7+8*(1-Math.abs(q)));
        const lum=150+Math.floor(rnd()*70);
        g.fillStyle=`rgba(${lum},${Math.min(235,lum+9)},${Math.min(245,lum+17)},${.04+rnd()*.20})`;
        g.beginPath(); g.arc(x,y,.25+Math.pow(rnd(),4)*1.1,0,TAU); g.fill();
      }
    }

    /* Bright, recognisable logarithmic spiral arms. */
    for (let arm = 0; arm < armCount; arm++) {
      const base = arm * TAU / armCount + rnd()*.10;
      const points = 1250 + Math.floor(rnd()*560);

      /* Very faint arm glow under the point cloud. */
      g.strokeStyle = `rgba(116,151,174,${.020+rnd()*.014})`;
      g.lineWidth = 4.0 + rnd()*3.0;
      g.beginPath();
      for (let j=0;j<150;j++) {
        const q=j/149;
        const ang=base + reverse*q*twist;
        const rr=22 + Math.pow(q,.92)*247;
        const x=Math.cos(ang)*rr;
        const y=Math.sin(ang)*rr*flatten;
        if (!j) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.stroke();

      for (let i = 0; i < points; i++) {
        const q = Math.pow(rnd(), .76);
        const angle = base + reverse*q*twist + rnd()*armSpread*(1.3-q*.3);
        const radius = 18 + q*(236+rnd()*21) + (rnd()-.5)*(7+q*15);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * flatten + (rnd()-.5)*(3+q*8);
        const fade = Math.pow(1-q, .28);
        const alpha = (.045 + Math.pow(rnd(),2)*.40) * fade;
        const sz = .16 + Math.pow(rnd(),4.2)*1.35;
        const tint = 165 + Math.floor(rnd()*74);
        g.fillStyle = `rgba(${tint},${Math.min(242,tint+11)},${Math.min(250,tint+22)},${alpha})`;
        g.beginPath(); g.arc(x,y,sz,0,TAU); g.fill();
      }

      /* Dense star-forming knots dotted along each arm. */
      for (let k=0;k<26;k++) {
        const q=.14+rnd()*.80;
        const angle=base + reverse*q*twist + (rnd()-.5)*armSpread*.6;
        const radius=24+q*230;
        const x=Math.cos(angle)*radius;
        const y=Math.sin(angle)*radius*flatten;
        const grad=g.createRadialGradient(x,y,0,x,y,4+rnd()*5);
        grad.addColorStop(0,`rgba(183,211,226,${.055+rnd()*.10})`);
        grad.addColorStop(1,"rgba(90,135,162,0)");
        g.fillStyle=grad; g.beginPath(); g.arc(x,y,9,0,TAU); g.fill();
      }
    }

    /* Dark dust lanes thread the inner edge of selected arms. */
    g.globalCompositeOperation = "destination-out";
    for (let arm=0; arm<Math.min(armCount,3); arm++) {
      const base=arm*TAU/armCount+.055;
      g.beginPath();
      for (let j=0;j<120;j++) {
        const q=j/119;
        const a=base + reverse*q*(twist*.96);
        const rr=28+q*203;
        const x=Math.cos(a)*rr;
        const y=Math.sin(a)*rr*flatten;
        if(!j) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.strokeStyle="rgba(0,0,0,.19)";
      g.lineWidth=1.3+arm*.35;
      g.stroke();
    }

    return c;
  }


  function rebuildSprites() {
    nebulaSprites.length = 0;
    galaxySprites.length = 0;
    for (let i=0;i<12;i++) nebulaSprites.push(buildNebulaSprite(34017+i*991,i));
    for (let i=0;i<9;i++) galaxySprites.push(buildGalaxySprite(78013+i*733,i));
  }


  function buildSegment(index) {
    const rnd = rngFor(index * 7919 + 42626);
    const baseY = index * SEGMENT;
    const entities = [];

    const add = (kind, payload) => {
      const entity = { kind, ...payload };
      entities.push(entity);
      return entity;
    };

    const depthIn = band => lerp(band.min, band.max, rnd());

    /* -----------------------------------------------------
       FAR BAND — enormous implied distances.
       Hundreds of tiny stars barely parallax at all. This is
       deliberately much denser than V0.4.25 but very low-energy.
       ----------------------------------------------------- */
    const farStarCount = 300 + Math.floor(rnd()*170);
    for (let i=0;i<farStarCount;i++) {
      add("star", {
        x:rnd(), y:baseY+rnd()*SEGMENT,
        depth:depthIn(DEPTH_BANDS.FAR), layer:"far",
        size:.10+Math.pow(rnd(),4.6)*.72,
        alpha:.025+Math.pow(rnd(),2.15)*.27,
        phase:rnd()*TAU, cool:rnd()
      });
    }

    /* A handful of almost subliminal remote stellar concentrations. */
    if (rnd()>.30) {
      add("cluster", {
        x:edgeX(rnd,.31), y:baseY+rnd()*SEGMENT,
        depth:.038+rnd()*.040, layer:"far",
        radius:24+rnd()*58,
        count:28+Math.floor(rnd()*58), alpha:.075+rnd()*.12,
        seed:Math.floor(rnd()*1e7)
      });
    }

    /* Galaxies now belong primarily to the extreme-distance band.
       They are rarer than nebulae and rotate at individually seeded,
       visible but still astronomical-looking speeds. */
    if (rnd()>.84) {
      const spinSign = rnd()>.5 ? 1 : -1;
      add("galaxy", {
        x:edgeX(rnd,.265), y:baseY+rnd()*SEGMENT,
        depth:.028+rnd()*.037, layer:"far",
        radius:28+rnd()*46,
        angle:(rnd()-.5)*1.25,
        alpha:.13+rnd()*.18,
        phase:rnd()*TAU,
        spin:spinSign*(.0000024+rnd()*.0000033),
        sprite:Math.floor(rnd()*galaxySprites.length)
      });
    }

    /* -----------------------------------------------------
       MID BAND — survey nebulae, clusters and solar systems.
       This remains the main readable celestial layer.
       ----------------------------------------------------- */
    const midStarCount = 115 + Math.floor(rnd()*85);
    for (let i=0;i<midStarCount;i++) {
      add("star", {
        x:rnd(), y:baseY+rnd()*SEGMENT,
        depth:.085+rnd()*.090, layer:"mid",
        size:.16+Math.pow(rnd(),4.0)*1.10,
        alpha:.055+Math.pow(rnd(),1.9)*.43,
        phase:rnd()*TAU, cool:rnd()
      });
    }

    /* V0.4.28 Nebula Engine: positions/counts are intentionally unchanged.
       Only morphology/rendering is overhauled here; balanced placement remains
       reserved for V0.4.29. */
    const nebulaCount = 1 + (rnd()>.36 ? 1 : 0);
    for (let i=0;i<nebulaCount;i++) {
      add("nebula", {
        x:edgeX(rnd,.27),
        y:baseY+rnd()*SEGMENT,
        depth:.088+rnd()*.070, layer:"mid",
        scale:.54+rnd()*.62,
        alpha:.15+rnd()*.20,
        sprite:Math.floor(rnd()*nebulaSprites.length),
        drift:(rnd()-.5)*2.5,
        phase:rnd()*TAU,
        stretchX:.90+rnd()*.48,
        stretchY:.48+rnd()*.38
      });
    }

    if (rnd()>.48) {
      add("cluster", {
        x:edgeX(rnd,.29), y:baseY+rnd()*SEGMENT,
        depth:.095+rnd()*.075, layer:"mid",
        radius:34+rnd()*82,
        count:38+Math.floor(rnd()*78), alpha:.15+rnd()*.26,
        seed:Math.floor(rnd()*1e7)
      });
    }

    if (rnd()>.55) {
      const planetCount = 3+Math.floor(rnd()*5);
      const planets=[];
      for (let i=0;i<planetCount;i++) {
        planets.push({
          rx:11+i*(7+rnd()*5.5),
          ry:5.5+i*(2.8+rnd()*3.6),
          speed:(.00042+rnd()*.00128)*(rnd()>.5?1:-1),
          phase:rnd()*TAU,
          size:.62+rnd()*1.05
        });
      }
      add("system", {
        x:edgeX(rnd,.29), y:baseY+rnd()*SEGMENT,
        depth:.115+rnd()*.060, layer:"mid",
        alpha:.24+rnd()*.20, phase:rnd()*TAU, planets
      });
    }

    /* -----------------------------------------------------
       NEAR BAND — sparse foreground stars only for now.
       Ship traffic will receive its own full 3D overhaul in V0.4.27.
       ----------------------------------------------------- */
    const nearStarCount = 24 + Math.floor(rnd()*28);
    for (let i=0;i<nearStarCount;i++) {
      add("star", {
        x:rnd(), y:baseY+rnd()*SEGMENT,
        depth:.205+rnd()*.125, layer:"near",
        size:.28+Math.pow(rnd(),3.4)*1.48,
        alpha:.11+Math.pow(rnd(),1.7)*.58,
        phase:rnd()*TAU, cool:rnd()
      });
    }

    /* Render in true depth order: far objects first, near objects last. */
    entities.sort((a,b)=>a.depth-b.depth);
    return { entities };
  }

  function getSegment(index) {
    if (!segmentCache.has(index)) segmentCache.set(index, buildSegment(index));
    return segmentCache.get(index);
  }

  function pruneSegments(center) {
    for (const key of segmentCache.keys()) {
      if (Math.abs(key-center)>SEGMENT_RADIUS+3) segmentCache.delete(key);
    }
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);

    /* The deep field is deliberately softer and can render at much lower
       pixel density without visible loss. Traffic stays sharper. */
    const deviceDpr = Math.max(1, window.devicePixelRatio || 1);
    deepDpr = Math.min(DEEP_DPR_MAX, deviceDpr);
    trafficDpr = Math.min(TRAFFIC_DPR_MAX, deviceDpr);

    deepCanvas.width = Math.round(width * deepDpr);
    deepCanvas.height = Math.round(height * deepDpr);
    deepCanvas.style.width = `${width}px`;
    deepCanvas.style.height = `${height}px`;
    deepCtx.setTransform(deepDpr, 0, 0, deepDpr, 0, 0);

    trafficCanvas.width = Math.round(width * trafficDpr);
    trafficCanvas.height = Math.round(height * trafficDpr);
    trafficCanvas.style.width = `${width}px`;
    trafficCanvas.style.height = `${height}px`;
    trafficCtx.setTransform(trafficDpr, 0, 0, trafficDpr, 0, 0);

    lastDeepFrame = -Infinity;
    visibleEntityCenter = null;
    resizeFilmGrain();
  }

  function screenY(worldY, depth, cameraY) {
    return height*.5 + (worldY-cameraY)*depth;
  }

  function screenX(normalizedX, depth, t, drift=0, phase=0) {
    const breathing = reduceMotion?0:Math.sin(t*.000055+phase)*drift;
    const depthOffset = Math.sin(t*.000018+phase*.37)*5*depth;
    return normalizedX*width + breathing + depthOffset;
  }


  function drawBackdrop() {
    const grad = ctx.createRadialGradient(width*.51,height*.28,0,width*.50,height*.44,Math.max(width,height)*.92);
    grad.addColorStop(0,"#08131d");
    grad.addColorStop(.36,"#05101a");
    grad.addColorStop(.72,"#02090f");
    grad.addColorStop(1,"#010407");
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,width,height);

    /* Only faint local cold haze remains. The observer is outside the nebulae. */
    const left=ctx.createRadialGradient(width*.04,height*.72,0,width*.04,height*.72,width*.42);
    left.addColorStop(0,"rgba(19,37,51,.055)");
    left.addColorStop(1,"rgba(8,20,31,0)");
    ctx.fillStyle=left; ctx.fillRect(0,0,width,height);

    const right=ctx.createRadialGradient(width*.96,height*.22,0,width*.96,height*.22,width*.38);
    right.addColorStop(0,"rgba(28,33,52,.045)");
    right.addColorStop(1,"rgba(9,18,29,0)");
    ctx.fillStyle=right; ctx.fillRect(0,0,width,height);
  }


  function drawNebula(n,cameraY,t,alphaMul=1) {
    const baseY=screenY(n.y,n.depth,cameraY);
    const size=Math.min(width,1500)*.35*n.scale*(.80+n.depth*1.05);
    if (baseY<-size*1.35 || baseY>height+size*1.35) return;
    const baseX=screenX(n.x,n.depth,t,n.drift,n.phase);
    const volume=nebulaSprites[n.sprite];
    if (!volume?.layers) return;

    const worldDelta=(n.y-cameraY)*n.depth;
    const sideDelta=baseX-width*.5;
    const baseRotation=Math.sin(n.phase)*.28;

    ctx.save();
    ctx.translate(baseX,baseY);
    ctx.rotate(baseRotation);
    ctx.scale(n.stretchX||1.15,n.stretchY||.66);

    for (let i=0;i<volume.layers.length;i++) {
      const layer=volume.layers[i];
      const p=layer.parallax;
      const scrollShift=worldDelta*p*.042;
      const sideShift=sideDelta*p*.010;
      const autonomous=reduceMotion?0:Math.sin(t*.000065+n.phase+i*1.71)*(1.0+Math.abs(p)*1.35);
      const rot=reduceMotion?0:Math.sin(t*.0000052+n.phase+i*.91)*(.0045+Math.abs(p)*.0045);
      const layerSize=size*layer.scale;

      ctx.save();
      ctx.translate(sideShift+autonomous*p,scrollShift+autonomous);
      ctx.rotate(rot);
      ctx.globalAlpha=n.alpha*alphaMul*layer.alpha;
      ctx.globalCompositeOperation=layer.blend;
      ctx.drawImage(layer.canvas,-layerSize*.5,-layerSize*.5,layerSize,layerSize);
      ctx.restore();
    }
    ctx.restore();
  }


  function drawGalaxy(gal,cameraY,t,alphaMul=1) {
    const y=screenY(gal.y,gal.depth,cameraY);
    const r=gal.radius*(1+width/2600);
    if (y<-r*4 || y>height+r*4) return;
    const x=screenX(gal.x,gal.depth,t,1.6,gal.phase);
    const sprite=galaxySprites[gal.sprite];
    if (!sprite) return;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(gal.angle + (reduceMotion?0:t*(gal.spin ?? .0000031)));
    ctx.globalAlpha=gal.alpha*alphaMul;
    ctx.globalCompositeOperation="screen";
    ctx.scale(1.0,.92);
    ctx.drawImage(sprite,-r*3.15,-r*3.15,r*6.3,r*6.3);
    ctx.restore();
  }

  function buildClusterSprite(cluster) {
    const size = 256;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha:true });
    const rnd = rngFor(cluster.seed);
    g.clearRect(0,0,size,size);
    g.globalCompositeOperation = "screen";
    for (let i=0;i<cluster.count;i++) {
      const a=rnd()*TAU, rr=Math.pow(rnd(),1.55)*(size*.42);
      const px=size*.5+Math.cos(a)*rr;
      const py=size*.5+Math.sin(a)*rr*.58;
      const sz=.35+Math.pow(rnd(),4)*2.05;
      const alpha=(.25+rnd()*.75);
      const cool=168+Math.floor(rnd()*56);
      g.fillStyle=`rgba(${cool},${Math.min(238,cool+12)},${Math.min(246,cool+22)},${alpha})`;
      g.beginPath(); g.arc(px,py,sz,0,TAU); g.fill();
    }
    return c;
  }

  function drawCluster(cluster,cameraY,t) {
    const y=screenY(cluster.y,cluster.depth,cameraY);
    if (y<-cluster.radius*2 || y>height+cluster.radius*2) return;
    const x=screenX(cluster.x,cluster.depth,t,1.1,cluster.seed);
    if (!cluster._sprite) cluster._sprite=buildClusterSprite(cluster);
    const r=cluster.radius*1.15;
    ctx.save();
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=cluster.alpha;
    ctx.drawImage(cluster._sprite,x-r,y-r*.58,r*2,r*1.16);
    ctx.restore();
  }


  function drawSystem(sys,cameraY,t) {
    const y=screenY(sys.y,sys.depth,cameraY);
    if (y<-92 || y>height+92) return;
    const x=screenX(sys.x,sys.depth,t,.65,sys.phase);

    ctx.save();
    ctx.translate(x,y);
    ctx.globalCompositeOperation="screen";

    const pulse = reduceMotion?1:(.84 + Math.sin(t*.0047+sys.phase)*.16);
    const starAlpha=clamp(sys.alpha*2.34*pulse,0,.90);
    const halo=ctx.createRadialGradient(0,0,0,0,0,11);
    halo.addColorStop(0,`rgba(238,244,247,${starAlpha})`);
    halo.addColorStop(.18,`rgba(178,205,219,${starAlpha*.62})`);
    halo.addColorStop(.53,`rgba(111,155,181,${starAlpha*.20})`);
    halo.addColorStop(1,"rgba(72,111,137,0)");
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,11,0,TAU); ctx.fill();

    ctx.strokeStyle=`rgba(218,231,238,${starAlpha*.48})`;
    ctx.lineWidth=.62;
    ctx.beginPath(); ctx.moveTo(-7.5,0); ctx.lineTo(7.5,0); ctx.moveTo(0,-7.5); ctx.lineTo(0,7.5); ctx.stroke();

    for (const p of sys.planets) {
      const a=p.phase + (reduceMotion?0:t*p.speed);
      const px=Math.cos(a)*p.rx, py=Math.sin(a)*p.ry;
      const pa=clamp(sys.alpha*(1.35+.30*Math.cos(a)),.20,.72);
      ctx.fillStyle=`rgba(176,185,191,${pa})`;
      ctx.beginPath(); ctx.arc(px,py,p.size,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawStar(star,cameraY,t) {
    const y=screenY(star.y,star.depth,cameraY);
    if (y<-4 || y>height+4) return;
    const x=star.x*width + Math.sin(t*.000016+star.phase)*star.depth*4;
    const twinkle=reduceMotion?1:(.82+Math.sin(t*.00125+star.phase)*.18);
    const a=star.alpha*twinkle;
    const cool=star.cool>.78;
    const col=cool?[150,190,216]:[197,208,215];
    ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},${a})`;
    ctx.beginPath(); ctx.arc(x,y,star.size,0,TAU); ctx.fill();
    if (star.size>1.28 && a>.42) {
      ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},${a*.15})`;
      ctx.lineWidth=.45;
      ctx.beginPath(); ctx.moveTo(x-4.5,y); ctx.lineTo(x+4.5,y); ctx.moveTo(x,y-4.5); ctx.lineTo(x,y+4.5); ctx.stroke();
    }
  }


  /* Unified celestial registry renderer. Every procedural object in V0.4.26
     enters this path and is painter-sorted by physical parallax depth. */
  function drawEntity(entity,cameraY,t) {
    switch (entity.kind) {
      case "star":    drawStar(entity,cameraY,t); break;
      case "nebula":  drawNebula(entity,cameraY,t); break;
      case "galaxy":  drawGalaxy(entity,cameraY,t); break;
      case "cluster": drawCluster(entity,cameraY,t); break;
      case "system":  drawSystem(entity,cameraY,t); break;
    }
  }

  /* Curated survey landmarks are now genuine world-space objects.
     They drift with camera depth and leave/enter frame through scrolling. */
  function anchoredWorldY(anchorCameraY, ny, depth) {
    return anchorCameraY + (ny-.5) * height / Math.max(.001, depth);
  }

  function drawAnchoredGalaxy(anchorCameraY,nx,ny,radius,angle,spriteIndex,alpha,depth,cameraY,t,spin=null) {
    const worldY=anchoredWorldY(anchorCameraY,ny,depth);
    const y=screenY(worldY,depth,cameraY);
    if (y<-radius*4 || y>height+radius*4) return;
    const x=screenX(nx,depth,t,1.2,spriteIndex*.77);
    const sprite=galaxySprites[spriteIndex%galaxySprites.length];
    if (!sprite) return;
    const seededSpin = spin ?? ((spriteIndex%2?1:-1) * (.00000255 + (spriteIndex%5)*.00000061));
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle + (reduceMotion?0:t*seededSpin));
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.drawImage(sprite,-radius*3.05,-radius*3.05,radius*6.1,radius*6.1);
    ctx.restore();
  }

  function drawAnchoredNebula(anchorCameraY,nx,ny,size,spriteIndex,alpha,depth,cameraY,t,sx=1.15,sy=.66) {
    const worldY=anchoredWorldY(anchorCameraY,ny,depth);
    const baseY=screenY(worldY,depth,cameraY);
    if (baseY<-size*1.4 || baseY>height+size*1.4) return;
    const baseX=screenX(nx,depth,t,1.0,spriteIndex*.41);
    const volume=nebulaSprites[spriteIndex%nebulaSprites.length];
    if (!volume?.layers) return;
    const worldDelta=(worldY-cameraY)*depth;
    const sideDelta=baseX-width*.5;

    ctx.save();
    ctx.translate(baseX,baseY);
    ctx.rotate(-.10);
    ctx.scale(sx,sy);
    for (let i=0;i<volume.layers.length;i++) {
      const layer=volume.layers[i];
      const p=layer.parallax;
      const scrollShift=worldDelta*p*.042;
      const sideShift=sideDelta*p*.010;
      const autonomous=reduceMotion?0:Math.sin(t*.000060+spriteIndex*.53+i*1.23)*(1.0+Math.abs(p)*1.25);
      const rot=reduceMotion?0:Math.sin(t*.0000049+spriteIndex+i*.77)*(.004+Math.abs(p)*.004);
      const layerSize=size*layer.scale;
      ctx.save();
      ctx.translate(sideShift+autonomous*p,scrollShift+autonomous);
      ctx.rotate(rot);
      ctx.globalCompositeOperation=layer.blend;
      ctx.globalAlpha=alpha*layer.alpha;
      ctx.drawImage(layer.canvas,-layerSize*.5,-layerSize*.5,layerSize,layerSize);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCuratedWorldScenes(cameraY,t) {
    const maxScroll=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    const bottomAnchor=maxScroll*.47;

    /* TOP / HERO:
       upper-left detailed spiral, lower-left rotated spiral clear of logo,
       and a compact pine-green nebula toward the upper-right edge. */
    drawAnchoredGalaxy(0,.135,.15,62,-.30,5,.32,.052,cameraY,t);
    drawAnchoredGalaxy(0,.125,.73,68,.42,2,.37,.061,cameraY,t);
    drawAnchoredNebula(0,.91,.20,390,8,.39,.105,cameraY,t,1.18,.64);

    /* BOTTOM / FINAL MANIFESTO:
       small galaxy pushed left, blue-violet nebula pushed right. */
    drawAnchoredGalaxy(bottomAnchor,.085,.42,50,-.50,1,.28,.049,cameraY,t);
    drawAnchoredNebula(bottomAnchor,.915,.35,455,7,.46,.108,cameraY,t,1.22,.68);
  }

  /* -------------------------------------------------------
     V0.4.27.2 // WORLD-SPACE FSD HOTFIX
     - preserves V0.4.27.1 smooth FSD braking
     - ships, trails, charge effects and wakes are now anchored to camera/world depth
     - scrolling moves them with the Deep Survey Field instead of the viewport
     - stronger FSD flash with a soft bloom envelope
     - wake rebuilt as layered diffuse light rather than a hard cartoon silhouette
     ------------------------------------------------------- */

  const SHIP_MODELS = Object.freeze([
    {
      id:"anaconda", label:"ANACONDA", baseScale:1.00,
      engines:[[-27,-2.7],[-27,2.7]], trailTint:[102,166,198]
    },
    {
      id:"krait", label:"KRAIT", baseScale:.92,
      engines:[[-22,-4.5],[-24,0],[-22,4.5]], trailTint:[108,174,207]
    },
    {
      id:"beluga", label:"BELUGA", baseScale:1.08,
      engines:[[-32,-3.2],[-33,0],[-32,3.2]], trailTint:[118,174,201]
    },
    {
      id:"caspian", label:"CASPIAN", baseScale:.88,
      engines:[[-22,-4.0],[-22,4.0]], trailTint:[97,160,195]
    },
    {
      id:"sidewinder", label:"SIDEWINDER", baseScale:.70,
      engines:[[-15,-2.0],[-15,2.0]], trailTint:[112,170,198]
    }
  ]);

  function cubicPoint(p0,p1,p2,p3,t) {
    const u=1-t, tt=t*t, uu=u*u;
    const uuu=uu*u, ttt=tt*t;
    return {
      x:uuu*p0.x + 3*uu*t*p1.x + 3*u*tt*p2.x + ttt*p3.x,
      y:uuu*p0.y + 3*uu*t*p1.y + 3*u*tt*p2.y + ttt*p3.y
    };
  }

  function cubicTangent(p0,p1,p2,p3,t) {
    const u=1-t;
    return {
      x:3*u*u*(p1.x-p0.x) + 6*u*t*(p2.x-p1.x) + 3*t*t*(p3.x-p2.x),
      y:3*u*u*(p1.y-p0.y) + 6*u*t*(p2.y-p1.y) + 3*t*t*(p3.y-p2.y)
    };
  }

  function buildTrajectoryLUT(p0,p1,p2,p3,steps=96) {
    const samples=[];
    let total=0;
    let prev=cubicPoint(p0,p1,p2,p3,0);
    samples.push({t:0,d:0,p:prev});
    for (let i=1;i<=steps;i++) {
      const t=i/steps;
      const p=cubicPoint(p0,p1,p2,p3,t);
      const dx=(p.x-prev.x)*width;
      const dy=(p.y-prev.y)*height;
      total += Math.hypot(dx,dy);
      samples.push({t,d:total,p});
      prev=p;
    }
    return {samples,total};
  }

  function trajectoryAt(ship,progress) {
    const distance=clamp(progress,0,1)*ship.pathLength;
    const samples=ship.pathSamples;
    let lo=0, hi=samples.length-1;
    while (lo<hi) {
      const mid=(lo+hi)>>1;
      if (samples[mid].d<distance) lo=mid+1; else hi=mid;
    }
    const b=samples[Math.max(1,lo)];
    const a=samples[Math.max(0,lo-1)];
    const span=Math.max(.0001,b.d-a.d);
    const mix=clamp((distance-a.d)/span,0,1);
    const t=lerp(a.t,b.t,mix);
    const p=cubicPoint(ship.p0,ship.p1,ship.p2,ship.p3,t);
    const tangent=cubicTangent(ship.p0,ship.p1,ship.p2,ship.p3,t);
    const scale=lerp(ship.s0,ship.s1,progress);
    return {
      x:p.x*width,
      y:p.y*height,
      scale,
      angle:Math.atan2(tangent.y*height,tangent.x*width)+ship.roll,
      tx:tangent.x,
      ty:tangent.y,
      t
    };
  }

  function projectShipPoint(ship,point,cameraY) {
    /*
       Ship trajectories are authored in viewport coordinates for composition,
       then anchored to the Deep Field camera at spawn time. Re-projecting the
       vertical coordinate every frame makes hulls, engine trails and FSD wakes
       behave like world-space objects when the page scrolls.
    */
    return {
      ...point,
      y:point.y + (ship.anchorCameraY-cameraY)*ship.depth
    };
  }

  function jumpFlightProgress(ship,timeQ) {
    const q=clamp(timeQ,0,1);
    if (!ship.willJump) return q;

    /*
       Keep the old cruise velocity for most of the flight, then integrate a
       smooth velocity falloff over the final approach. The integral is used
       instead of a visual easing hack, so position AND velocity remain
       continuous and the ship reaches exactly zero speed at the endpoint.
    */
    const b=ship.brakeStartQ;
    const norm=.5+.5*b;
    if (q<=b) return clamp(q/norm,0,1);

    const u=clamp((q-b)/Math.max(.0001,1-b),0,1);
    const integrated=u-u*u*u+.5*u*u*u*u; // integral of 1-smoothstep(0,1,u)
    return clamp((b+(1-b)*integrated)/norm,0,1);
  }

  function jumpSpeedFactor(ship,timeQ) {
    if (!ship.willJump) return 1;
    const q=clamp(timeQ,0,1);
    if (q<=ship.brakeStartQ) return 1;
    const u=clamp((q-ship.brakeStartQ)/Math.max(.0001,1-ship.brakeStartQ),0,1);
    return 1-smoothstep(0,1,u);
  }

  function stabiliseJumpApproach(tr) {
    /*
       Re-aim the last control point so the final ~10-16% of the path settles
       into a clean approach vector instead of making a last-frame turn.
       Screen-space math keeps the result consistent on ultrawide displays.
    */
    const dx=(tr.p3.x-tr.p1.x)*width;
    const dy=(tr.p3.y-tr.p1.y)*height;
    const mag=Math.hypot(dx,dy) || 1;
    const ux=dx/mag, uy=dy/mag;
    const approachPx=Math.min(width,height)*(.105+Math.random()*.045);
    tr.p2={
      x:tr.p3.x-(ux*approachPx)/Math.max(1,width),
      y:tr.p3.y-(uy*approachPx)/Math.max(1,height)
    };
    return tr;
  }

  function makeShipTrajectory(jumpIntent) {
    const side=Math.random()<.5?-1:1;
    const mode=Math.floor(Math.random()*(jumpIntent?3:4));
    let p0,p1,p2,p3;

    if (jumpIntent) {
      /* End deliberately inside an outer-third survey lane. */
      const endX = side<0 ? .10+Math.random()*.18 : .72+Math.random()*.18;
      const endY = .14+Math.random()*.70;
      if (mode===0) {
        p0={x:side<0?1.08:-.08,y:.16+Math.random()*.68};
        p3={x:endX,y:endY};
        p1={x:lerp(p0.x,p3.x,.34),y:p0.y+(Math.random()-.5)*.20};
        p2={x:lerp(p0.x,p3.x,.73),y:p3.y+(Math.random()-.5)*.16};
      } else if (mode===1) {
        p0={x:.08+Math.random()*.84,y:1.08};
        p3={x:endX,y:.12+Math.random()*.38};
        p1={x:p0.x+(Math.random()-.5)*.18,y:.76};
        p2={x:p3.x+(Math.random()-.5)*.14,y:.37};
      } else {
        p0={x:side<0?-.08:1.08,y:.72+Math.random()*.25};
        p3={x:endX,y:.20+Math.random()*.44};
        p1={x:side<0?.16:.84,y:.61+(Math.random()-.5)*.22};
        p2={x:lerp(p0.x,p3.x,.78),y:p3.y+(Math.random()-.5)*.12};
      }
    } else {
      /* Every non-jump path terminates safely outside the viewport. */
      if (mode===0) {
        p0={x:side<0?-.09:1.09,y:.14+Math.random()*.70};
        p3={x:side<0?1.09:-.09,y:.10+Math.random()*.78};
      } else if (mode===1) {
        p0={x:side<0?-.08:1.08,y:.78+Math.random()*.28};
        p3={x:side<0?1.04:-.04,y:-.08};
      } else if (mode===2) {
        p0={x:.05+Math.random()*.90,y:1.08};
        p3={x:side<0?-.08:1.08,y:.04+Math.random()*.40};
      } else {
        p0={x:side<0?-.08:1.08,y:.08+Math.random()*.30};
        p3={x:side<0?1.08:-.08,y:.70+Math.random()*.30};
      }
      const bow=(Math.random()-.5)*.28;
      p1={x:lerp(p0.x,p3.x,.31),y:lerp(p0.y,p3.y,.31)+bow};
      p2={x:lerp(p0.x,p3.x,.69),y:lerp(p0.y,p3.y,.69)-bow*.72};
    }
    const tr={p0,p1,p2,p3};
    return jumpIntent ? stabiliseJumpApproach(tr) : tr;
  }

  function spawnShip(now,cameraY) {
    const type=Math.floor(Math.random()*SHIP_MODELS.length);
    const model=SHIP_MODELS[type];
    const jumpIntent=Math.random()<.31;
    const closePass=Math.random()<.17;
    const slowPass=!closePass && Math.random()<.18;
    const receding=Math.random()<.28;
    const tr=makeShipTrajectory(jumpIntent);

    /* Physical scene depth used by the same cameraY system as celestial objects.
       Close passes sit in the near band; distant traffic lives farther away. */
    const depth = closePass
      ? (.255+Math.random()*.075)
      : slowPass
        ? (.165+Math.random()*.055)
        : (.105+Math.random()*.075);

    let s0,s1;
    if (closePass) {
      s0=1.05+Math.random()*.46;
      s1=receding ? .36+Math.random()*.22 : .72+Math.random()*.34;
    } else {
      s0=.34+Math.random()*.30;
      s1=receding ? .075+Math.random()*.12 : .18+Math.random()*.25;
    }
    s0*=model.baseScale;
    s1*=model.baseScale;

    const lut=buildTrajectoryLUT(tr.p0,tr.p1,tr.p2,tr.p3,112);
    const pxPerMs = closePass
      ? (.18+Math.random()*.095)
      : slowPass
        ? (.15+Math.random()*.075)
        : (.27+Math.random()*.17);
    const baseDuration=clamp(lut.total/pxPerMs,2300,10500);
    const brakeStartQ=jumpIntent ? (.73+Math.random()*.07) : 1;
    /* Preserve cruise speed while adding physical braking time. */
    const duration=jumpIntent
      ? clamp(baseDuration/(.5+.5*brakeStartQ),2500,12400)
      : baseDuration;

    activeShips.push({
      type, model, start:now, duration, brakeStartQ,
      anchorCameraY:cameraY, depth,
      ...tr,
      pathSamples:lut.samples,
      pathLength:lut.total,
      s0,s1,
      alpha:closePass ? .22+Math.random()*.12 : .13+Math.random()*.12,
      roll:(Math.random()-.5)*.12,
      trail:[], lastTrailAt:0,
      trailTTL:closePass ? 3300+Math.random()*650 : 2400+Math.random()*650,
      willJump:jumpIntent,
      chargeDuration:540+Math.random()*420,
      chargeStarted:0,
      jumpTriggered:false,
      endPoint:null
    });
  }

  function engineWorld(point,ship,engine) {
    const cos=Math.cos(point.angle), sin=Math.sin(point.angle);
    const ox=engine[0]*point.scale;
    const oy=engine[1]*point.scale;
    return {
      x:point.x + cos*ox - sin*oy,
      y:point.y + sin*ox + cos*oy
    };
  }

  function drawEngineGlow(ship,point,boost=1) {
    const tint=ship.model.trailTint;
    ctx.save();
    ctx.globalCompositeOperation="screen";
    for (const eng of ship.model.engines) {
      const p=engineWorld(point,ship,eng);
      const r=Math.max(2.0,4.6*point.scale*boost);
      const gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      gr.addColorStop(0,`rgba(222,241,250,${ship.alpha*.72*boost})`);
      gr.addColorStop(.22,`rgba(${tint[0]},${tint[1]},${tint[2]},${ship.alpha*.48*boost})`);
      gr.addColorStop(1,`rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
      ctx.fillStyle=gr;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawShipShape(type,x,y,scale,angle,alpha,charge=0) {
    const model=SHIP_MODELS[type];
    const s=scale*(width<900?.78:1);
    ctx.save();
    ctx.translate(x,y); ctx.rotate(angle); ctx.scale(s,s);
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.fillStyle="rgba(116,132,142,.80)";
    ctx.strokeStyle="rgba(194,207,214,.82)";
    ctx.lineWidth=.78;

    ctx.beginPath();
    if (model.id==="anaconda") {
      /* Long faceted wedge, pronounced dorsal spine and clipped stern. */
      ctx.moveTo(31,0); ctx.lineTo(19,-3.1); ctx.lineTo(10,-6.6); ctx.lineTo(-5,-8.3);
      ctx.lineTo(-18,-6.2); ctx.lineTo(-29,-3.1); ctx.lineTo(-31,0);
      ctx.lineTo(-29,3.1); ctx.lineTo(-18,6.2); ctx.lineTo(-5,8.3); ctx.lineTo(10,6.6); ctx.lineTo(19,3.1); ctx.closePath();
    } else if (model.id==="krait") {
      /* Broad manta/diamond profile with a deep rear notch. */
      ctx.moveTo(26,0); ctx.lineTo(10,-5.1); ctx.lineTo(2,-10.2); ctx.lineTo(-18,-11.4);
      ctx.lineTo(-28,-5.4); ctx.lineTo(-16,-1.4); ctx.lineTo(-23,0);
      ctx.lineTo(-16,1.4); ctx.lineTo(-28,5.4); ctx.lineTo(-18,11.4); ctx.lineTo(2,10.2); ctx.lineTo(10,5.1); ctx.closePath();
    } else if (model.id==="beluga") {
      /* Long smooth liner body with recognisable sweeping rear fins. */
      ctx.moveTo(34,0);
      ctx.bezierCurveTo(24,-4.8,8,-6.0,-11,-5.8);
      ctx.lineTo(-25,-10.1); ctx.lineTo(-22,-5.0); ctx.lineTo(-34,-2.4);
      ctx.lineTo(-36,0); ctx.lineTo(-34,2.4); ctx.lineTo(-22,5.0); ctx.lineTo(-25,10.1);
      ctx.lineTo(-11,5.8); ctx.bezierCurveTo(8,6.0,24,4.8,34,0); ctx.closePath();
    } else if (model.id==="caspian") {
      /* Compact delta / double-chevron silhouette with split stern. */
      ctx.moveTo(25,0); ctx.lineTo(9,-6.8); ctx.lineTo(-4,-4.1); ctx.lineTo(-20,-9.0);
      ctx.lineTo(-15,-2.1); ctx.lineTo(-25,0); ctx.lineTo(-15,2.1); ctx.lineTo(-20,9.0);
      ctx.lineTo(-4,4.1); ctx.lineTo(9,6.8); ctx.closePath();
    } else {
      /* Sidewinder: short, squat, hexagonal wedge. */
      ctx.moveTo(18,0); ctx.lineTo(8,-7.1); ctx.lineTo(-7,-8.0); ctx.lineTo(-17,-3.8);
      ctx.lineTo(-14,0); ctx.lineTo(-17,3.8); ctx.lineTo(-7,8.0); ctx.lineTo(8,7.1); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();

    const detail=clamp((s-.30)*1.65,0,.90);
    if (detail>.05) {
      ctx.globalAlpha=alpha*detail;
      ctx.strokeStyle="rgba(220,229,233,.48)";
      ctx.lineWidth=.42;
      ctx.beginPath();
      if (model.id==="anaconda") {
        ctx.moveTo(-20,0);ctx.lineTo(23,0);ctx.moveTo(-5,-5.8);ctx.lineTo(8,-2.0);ctx.moveTo(-5,5.8);ctx.lineTo(8,2.0);
      } else if (model.id==="krait") {
        ctx.moveTo(-16,0);ctx.lineTo(20,0);ctx.moveTo(-10,-7.2);ctx.lineTo(6,-3.0);ctx.moveTo(-10,7.2);ctx.lineTo(6,3.0);
      } else if (model.id==="beluga") {
        ctx.moveTo(-27,0);ctx.lineTo(27,0);ctx.moveTo(-7,-3.8);ctx.lineTo(15,-2.0);ctx.moveTo(-7,3.8);ctx.lineTo(15,2.0);
      } else if (model.id==="caspian") {
        ctx.moveTo(-15,0);ctx.lineTo(19,0);ctx.moveTo(-4,-3.0);ctx.lineTo(8,-1.5);ctx.moveTo(-4,3.0);ctx.lineTo(8,1.5);
      } else {
        ctx.moveTo(-10,0);ctx.lineTo(13,0);ctx.moveTo(-5,-4.5);ctx.lineTo(5,-2.2);ctx.moveTo(-5,4.5);ctx.lineTo(5,2.2);
      }
      ctx.stroke();

      ctx.fillStyle=`rgba(117,164,190,${.35+charge*.35})`;
      ctx.beginPath(); ctx.ellipse(7,0,3.0,1.35,0,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  function spawnFsdWake(ship,point,now) {
    fsdWakes.push({
      x:point.x,y:point.y,angle:point.angle,scale:Math.max(.16,point.scale),
      anchorCameraY:ship.anchorCameraY, depth:ship.depth,
      start:now,ttl:4200,seed:Math.floor(Math.random()*1e9),
      tint:ship.model.trailTint,
      wakeAlpha:clamp(ship.alpha*3.65,.36,.72),
      flashAlpha:clamp(ship.alpha*7.4,.84,1.0)
    });
  }

  const FSD_SPRITES = { wake:[], flash:[] };

  function buildFsdWakeSprite(profile) {
    const W=640, H=300, headX=548, cy=H*.5;
    const c=makeCanvas(W,H);
    const g=c.getContext("2d",{alpha:true});
    const scale=[.72,1.0,1.30][profile];
    const len=400*scale, spread=52*scale;
    const x0=headX-len;
    const path=() => {
      g.beginPath();
      g.moveTo(headX+8,cy);
      g.bezierCurveTo(headX-len*.18,cy-spread*.78,headX-len*.61,cy-spread*.52,x0,cy);
      g.bezierCurveTo(headX-len*.61,cy+spread*.52,headX-len*.18,cy+spread*.78,headX+8,cy);
      g.closePath();
    };

    /* Expensive blur work is paid ONCE here, never in the live frame loop. */
    g.globalCompositeOperation="screen";
    g.save();
    g.filter=`blur(${8+profile*3}px)`;
    let grad=g.createLinearGradient(x0,cy,headX+8,cy);
    grad.addColorStop(0,"rgba(58,111,148,0)");
    grad.addColorStop(.30,"rgba(92,159,195,.105)");
    grad.addColorStop(.73,"rgba(145,205,232,.245)");
    grad.addColorStop(1,"rgba(224,247,255,.175)");
    g.fillStyle=grad; path(); g.fill();
    g.restore();

    g.save();
    g.filter=`blur(${3.1+profile*1.2}px)`;
    grad=g.createLinearGradient(x0,cy,headX+5,cy);
    grad.addColorStop(0,"rgba(72,132,168,0)");
    grad.addColorStop(.42,"rgba(119,185,216,.125)");
    grad.addColorStop(.82,"rgba(184,228,246,.285)");
    grad.addColorStop(1,"rgba(242,252,255,.215)");
    g.fillStyle=grad; path(); g.fill();
    g.restore();

    g.save();
    g.filter=`blur(${1.0+profile*.5}px)`;
    const filament=g.createLinearGradient(x0,cy,headX+4,cy);
    filament.addColorStop(0,"rgba(120,180,208,0)");
    filament.addColorStop(.62,"rgba(190,229,245,.185)");
    filament.addColorStop(1,"rgba(251,255,255,.34)");
    g.strokeStyle=filament;
    g.lineWidth=1.2+profile*.55;
    g.beginPath(); g.moveTo(x0+24,cy); g.lineTo(headX+2,cy); g.stroke();
    g.restore();

    /* Cached charged dust gives the wake texture without 42 runtime arcs. */
    const rnd=rngFor(92731+profile*1717);
    g.save(); g.filter="blur(.7px)";
    for (let i=0;i<62;i++) {
      const q=Math.pow(rnd(),.82);
      const px=headX-q*len;
      const py=cy+(rnd()-.5)*spread*(.28+1.15*q);
      const rr=.45+Math.pow(rnd(),3)*2.2;
      g.fillStyle=`rgba(174,219,238,${.016+rnd()*.052})`;
      g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
    }
    g.restore();
    return { canvas:c, headX, cy, width:W, height:H };
  }

  function buildFsdFlashSprite(profile) {
    /* V0.4.27.5: compact 250 ms flash; flash and wake footprints reduced by 25%.
       All blur/gradient work remains cached and is paid only at sprite build. */
    const S=[250,330,430][profile];
    const c=makeCanvas(S,S);
    const g=c.getContext("2d",{alpha:true});
    const m=S*.5;
    g.globalCompositeOperation="screen";

    /* Very wide, soft bloom envelope. */
    g.save();
    g.filter=`blur(${18+profile*5}px)`;
    let r=S*.47;
    let grad=g.createRadialGradient(m,m,0,m,m,r);
    grad.addColorStop(0,"rgba(255,255,255,1)");
    grad.addColorStop(.075,"rgba(242,253,255,.98)");
    grad.addColorStop(.22,"rgba(199,236,252,.82)");
    grad.addColorStop(.50,"rgba(117,191,228,.46)");
    grad.addColorStop(.78,"rgba(72,142,183,.18)");
    grad.addColorStop(1,"rgba(45,103,145,0)");
    g.fillStyle=grad;
    g.beginPath(); g.arc(m,m,r,0,TAU); g.fill();
    g.restore();

    /* Mid bloom gives the FSD flash a dense luminous body. */
    g.save();
    g.filter=`blur(${6.5+profile*2.1}px)`;
    r=S*.255;
    grad=g.createRadialGradient(m,m,0,m,m,r);
    grad.addColorStop(0,"rgba(255,255,255,1)");
    grad.addColorStop(.16,"rgba(250,255,255,1)");
    grad.addColorStop(.45,"rgba(209,242,255,.90)");
    grad.addColorStop(.76,"rgba(120,199,235,.42)");
    grad.addColorStop(1,"rgba(79,153,194,0)");
    g.fillStyle=grad;
    g.beginPath(); g.arc(m,m,r,0,TAU); g.fill();
    g.restore();

    /* Hard white ignition core. */
    r=S*.105;
    grad=g.createRadialGradient(m,m,0,m,m,r);
    grad.addColorStop(0,"rgba(255,255,255,1)");
    grad.addColorStop(.28,"rgba(255,255,255,1)");
    grad.addColorStop(.68,"rgba(228,249,255,.92)");
    grad.addColorStop(1,"rgba(139,210,241,0)");
    g.fillStyle=grad;
    g.beginPath(); g.arc(m,m,r,0,TAU); g.fill();

    /* Thin cross-spike, bright but very short-lived in the live draw. */
    g.save();
    g.filter=`blur(${1.8+profile*.55}px)`;
    g.strokeStyle="rgba(250,255,255,.90)";
    g.lineWidth=1.15+profile*.48;
    g.beginPath();
    g.moveTo(S*.025,m); g.lineTo(S*.975,m);
    g.moveTo(m,S*.16); g.lineTo(m,S*.84);
    g.stroke();
    g.restore();
    return c;
  }

  function rebuildFsdSprites() {
    FSD_SPRITES.wake.length=0;
    FSD_SPRITES.flash.length=0;
    for (let i=0;i<3;i++) {
      FSD_SPRITES.wake.push(buildFsdWakeSprite(i));
      FSD_SPRITES.flash.push(buildFsdFlashSprite(i));
    }
  }

  function drawFsdWakes(now,cameraY) {
    for (let i=fsdWakes.length-1;i>=0;i--) {
      const w=fsdWakes[i];
      if (w.wakeAlpha==null) w.wakeAlpha=clamp((w.alpha??.8)*.72,.36,.72);
      if (w.flashAlpha==null) w.flashAlpha=clamp((w.alpha??.8)*1.18,.84,1);
      const age=now-w.start;
      if (age>=w.ttl) { fsdWakes.splice(i,1); continue; }

      const q=age/w.ttl;
      const fade=Math.pow(1-q,1.46);
      const flash=clamp(1-age/250,0,1);
      const s=w.scale*(width<900?.82:1);
      const wy=w.y + (w.anchorCameraY-cameraY)*w.depth;
      const profile=s>.76?2:(s>.38?1:0);
      const wake=FSD_SPRITES.wake[profile];
      const flashSprite=FSD_SPRITES.flash[profile];
      if (!wake || !flashSprite) continue;

      const wakeScale=(.48+s*.70)*(1+.18*q)*.75;
      const wakeW=wake.width*wakeScale;
      const wakeH=wake.height*wakeScale*(1+.34*q);
      const headOffset=(wake.headX*wakeScale);
      const cyOffset=(wake.cy*wakeScale*(1+.34*q));

      ctx.save();
      ctx.translate(w.x,wy);
      ctx.rotate(w.angle);
      ctx.globalCompositeOperation="screen";
      ctx.globalAlpha=w.wakeAlpha*fade;
      ctx.drawImage(wake.canvas,-headOffset,-cyOffset,wakeW,wakeH);

      if (flash>0) {
        const fs=(.62+s*1.08)*(1+.34*(1-flash))*.75;
        const fw=flashSprite.width*fs;
        const fh=flashSprite.height*fs;
        ctx.globalAlpha=w.flashAlpha*Math.pow(flash,.54);
        ctx.drawImage(flashSprite,-fw*.5,-fh*.5,fw,fh);
      }
      ctx.restore();
    }
  }

  function drawShipTrails(ship,now,cameraY) {
    ship.trail=ship.trail.filter(pt=>now-pt.time<ship.trailTTL);
    if (ship.trail.length<2) return;
    const engines=ship.model.engines;
    const tint=ship.model.trailTint;
    ctx.save(); ctx.globalCompositeOperation="screen";
    for (let j=1;j<ship.trail.length;j++) {
      const rawA=ship.trail[j-1], rawB=ship.trail[j];
      const a=projectShipPoint(ship,rawA,cameraY);
      const b=projectShipPoint(ship,rawB,cameraY);
      const age=now-rawB.time;
      const fade=Math.pow(clamp(1-age/ship.trailTTL,0,1),1.20);
      const tailPos=j/(ship.trail.length-1);
      for (let e=0;e<engines.length;e++) {
        const ea=engineWorld(a,ship,engines[e]);
        const eb=engineWorld(b,ship,engines[e]);
        const lane=.65+.35*(e/(Math.max(1,engines.length-1)));
        ctx.strokeStyle=`rgba(${tint[0]},${tint[1]},${tint[2]},${ship.alpha*.24*fade*tailPos*lane})`;
        ctx.lineWidth=Math.max(.22,b.scale*(1.05+.42*tailPos));
        ctx.beginPath(); ctx.moveTo(ea.x,ea.y);ctx.lineTo(eb.x,eb.y);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawJumpCharge(ship,point,now) {
    const q=clamp((now-ship.chargeStarted)/ship.chargeDuration,0,1);
    const pulse=.58+.42*Math.sin(now*.020);
    drawShipShape(ship.type,point.x,point.y,point.scale,point.angle,ship.alpha*(.92+.08*pulse),q);
    drawEngineGlow(ship,point,1.0+q*2.4);

    ctx.save(); ctx.globalCompositeOperation="screen";
    const r=(8+point.scale*16)*(1+q*.55);
    const grad=ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,r);
    grad.addColorStop(0,`rgba(232,247,255,${ship.alpha*q*.26})`);
    grad.addColorStop(.42,`rgba(128,190,221,${ship.alpha*q*.14})`);
    grad.addColorStop(1,"rgba(85,145,180,0)");
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(point.x,point.y,r,0,TAU);ctx.fill();
    ctx.restore();
  }

  function drawShips(now,cameraY) {
    if (!reduceMotion && now>=nextShipAt) {
      spawnShip(now,cameraY);
      nextShipAt=now + 4300 + Math.random()*8200;
    }

    for (let i=activeShips.length-1;i>=0;i--) {
      const ship=activeShips[i];
      const q=(now-ship.start)/ship.duration;
      let point=null;
      let rawPoint=null;
      let hullVisible=false;

      if (q<1) {
        const travelQ=jumpFlightProgress(ship,Math.max(0,q));
        rawPoint=trajectoryAt(ship,travelQ);
        point=projectShipPoint(ship,rawPoint,cameraY);
        hullVisible=q>=0;
        if (hullVisible && (!ship.lastTrailAt || now-ship.lastTrailAt>30)) {
          /* Store route-space coordinates; project them at draw time so old
             trail samples remain attached to the same 3D scene while scrolling. */
          ship.trail.push({...rawPoint,time:now});
          ship.lastTrailAt=now;
          if (ship.trail.length>150) ship.trail.shift();
        }
      } else if (ship.willJump && !ship.jumpTriggered) {
        if (!ship.endPoint) ship.endPoint=trajectoryAt(ship,1);
        if (!ship.chargeStarted) ship.chargeStarted=ship.start+ship.duration;
        const chargeQ=(now-ship.chargeStarted)/ship.chargeDuration;
        rawPoint=ship.endPoint;
        point=projectShipPoint(ship,rawPoint,cameraY);
        if (chargeQ<1) {
          hullVisible=true;
          drawJumpCharge(ship,point,now);
        } else {
          /* Wake stores the unprojected endpoint plus scene anchor/depth. */
          spawnFsdWake(ship,rawPoint,now);
          ship.jumpTriggered=true;
          hullVisible=false;
        }
      }

      drawShipTrails(ship,now,cameraY);

      if (hullVisible && point && !(ship.willJump && q>=1)) {
        drawShipShape(ship.type,point.x,point.y,point.scale,point.angle,ship.alpha);
        const speedFactor=jumpSpeedFactor(ship,q);
        drawEngineGlow(ship,point,.42+.58*speedFactor);
      }

      const flightDone=q>=1;
      const jumpDone=!ship.willJump || ship.jumpTriggered;
      if (flightDone && jumpDone && ship.trail.length===0) activeShips.splice(i,1);
    }

    drawFsdWakes(now,cameraY);
  }

  /* -------------------------------------------------------
     FILM GRAIN — tiny animated grain replacing scanlines/noise
     ------------------------------------------------------- */
  let grainCanvas=null, grainCtx=null, grainTile=null, grainTileCtx=null, grainTimer=0;


  function initFilmGrain() {
    grainCanvas=document.getElementById("phantom-film-grain");
    if (!grainCanvas) {
      grainCanvas=document.createElement("canvas");
      grainCanvas.id="phantom-film-grain";
      grainCanvas.setAttribute("aria-hidden","true");
      document.body.appendChild(grainCanvas);
    }
    grainCtx=grainCanvas.getContext("2d",{alpha:true,desynchronized:true});
    grainTile=makeCanvas(176,176);
    grainTileCtx=grainTile.getContext("2d",{alpha:true});
    resizeFilmGrain();
    if (!reduceMotion) grainTimer=window.setInterval(updateFilmGrain,66);
    updateFilmGrain();
  }

  function resizeFilmGrain() {
    if (!grainCanvas || !grainCtx) return;
    grainCanvas.width=Math.max(1,Math.round(window.innerWidth));
    grainCanvas.height=Math.max(1,Math.round(window.innerHeight));
    grainCanvas.style.width=`${window.innerWidth}px`;
    grainCanvas.style.height=`${window.innerHeight}px`;
  }


  function updateFilmGrain() {
    if (!grainTileCtx || !grainCtx || !grainCanvas) return;
    const w=grainTile.width,h=grainTile.height;
    const img=grainTileCtx.createImageData(w,h);
    const data=img.data;
    for (let i=0;i<data.length;i+=4) {
      const white=Math.random()>.50;
      const v=white ? 190+Math.floor(Math.random()*66) : Math.floor(Math.random()*58);
      data[i]=data[i+1]=data[i+2]=v;
      data[i+3]=52+Math.floor(Math.random()*74);
    }
    grainTileCtx.putImageData(img,0,0);
    grainCtx.clearRect(0,0,grainCanvas.width,grainCanvas.height);
    const pat=grainCtx.createPattern(grainTile,"repeat");
    if (pat) {
      grainCtx.save();
      grainCtx.translate((Math.random()*31)|0,(Math.random()*31)|0);
      grainCtx.fillStyle=pat;
      grainCtx.fillRect(-40,-40,grainCanvas.width+80,grainCanvas.height+80);
      grainCtx.restore();
    }
  }

  function getVisibleEntities(centerSeg) {
    if (visibleEntityCenter === centerSeg && visibleEntityCache.length) return visibleEntityCache;
    const merged=[];
    for (let i=centerSeg-SEGMENT_RADIUS;i<=centerSeg+SEGMENT_RADIUS;i++) {
      merged.push(...getSegment(i).entities);
    }
    merged.sort((a,b)=>a.depth-b.depth);
    visibleEntityCenter=centerSeg;
    visibleEntityCache=merged;
    pruneSegments(centerSeg);
    return merged;
  }

  function updateAdaptiveBudget(cost,now) {
    perfCostSum += cost;
    perfSamples++;
    if (now-perfWindowStart < 1800) return;
    const avg=perfCostSum/Math.max(1,perfSamples);
    if (avg>22) deepFrameInterval=1000/DEEP_FPS_PERF;
    else if (avg>15.5) deepFrameInterval=1000/DEEP_FPS_MEDIUM;
    else deepFrameInterval=1000/DEEP_FPS_FULL;
    perfWindowStart=now;
    perfCostSum=0;
    perfSamples=0;
  }

  function renderDeepField(now,cameraY,centerSeg) {
    ctx=deepCtx;
    drawBackdrop();
    const visibleEntities=getVisibleEntities(centerSeg);
    for (const entity of visibleEntities) drawEntity(entity,cameraY,now);
    drawCuratedWorldScenes(cameraY,now);

    const vignette=ctx.createRadialGradient(width*.50,height*.47,Math.min(width,height)*.18,width*.50,height*.47,Math.max(width,height)*.76);
    vignette.addColorStop(0,"rgba(0,0,0,0)");
    vignette.addColorStop(.66,"rgba(0,2,5,.025)");
    vignette.addColorStop(1,"rgba(0,2,5,.28)");
    ctx.fillStyle=vignette; ctx.fillRect(0,0,width,height);
  }

  function renderTraffic(now,cameraY) {
    ctx=trafficCtx;
    trafficCtx.clearRect(0,0,width,height);
    drawShips(now,cameraY);
  }

  function render(now) {
    raf=0;
    if (!visible) return;
    const costStart=performance.now();
    const dt=clamp(now-lastFrame,0,48);
    lastFrame=now;
    if (!reduceMotion) elapsed+=dt;

    smoothScroll += (targetScroll-smoothScroll)*(1-Math.pow(.0008,dt/1000));
    const autonomousTravel=reduceMotion?0:elapsed*.0067;
    const cameraY=smoothScroll*.47 + autonomousTravel;
    const centerSeg=Math.floor(cameraY/SEGMENT);

    /* Celestial field: 20-30 FPS adaptive. Slow motion + low parallax make
       this visually indistinguishable from 60 FPS while cutting the expensive
       pixel workload drastically. Ship/FSD traffic still renders every frame. */
    if (now-lastDeepFrame >= deepFrameInterval || lastDeepFrame<0) {
      renderDeepField(now,cameraY,centerSeg);
      lastDeepFrame=now;
    }
    renderTraffic(now,cameraY);

    updateAdaptiveBudget(performance.now()-costStart,now);
    raf=requestAnimationFrame(render);
  }

  function requestRender() { if (!raf&&visible) raf=requestAnimationFrame(render); }

  window.addEventListener("scroll",()=>{targetScroll=window.scrollY||0; requestRender();},{passive:true});
  window.addEventListener("resize",()=>{resize(); requestRender();},{passive:true});
  document.addEventListener("visibilitychange",()=>{
    visible=!document.hidden;
    lastFrame=performance.now();
    lastDeepFrame=-Infinity;
    if (visible) requestRender();
    else if (raf) { cancelAnimationFrame(raf); raf=0; }
  });

  rebuildSprites(); // includes cached three-layer V0.4.28 nebula volumes
  rebuildFsdSprites();
  initFilmGrain();
  resize();
  requestRender();
})();
