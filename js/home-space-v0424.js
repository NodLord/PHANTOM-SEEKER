(() => {
  "use strict";

  const canvas = document.getElementById("phantom-deep-field");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const TAU = Math.PI * 2;
  const SEGMENT = 1120;
  const SEGMENT_RADIUS = 7;
  const MAX_DPR = 1.45;
  const segmentCache = new Map();
  const nebulaSprites = [];
  const galaxySprites = [];
  const activeShips = [];

  let width = 1;
  let height = 1;
  let dpr = 1;
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

  function buildNebulaSprite(seed, variant) {
    const size = 760;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha: true });
    const rnd = rngFor(seed);

    const palettes = [
      { core:[40,65,82], rim:[22,39,55] },
      { core:[52,59,91], rim:[29,35,60] },
      { core:[35,71,70], rim:[20,47,48] },
      { core:[65,56,84], rim:[37,32,58] },
      { core:[38,60,78], rim:[25,40,57] },
      { core:[48,67,81], rim:[28,42,56] },
      { core:[31,76,58], rim:[18,51,41] },
      { core:[56,51,78], rim:[33,31,53] },
      { core:[43,66,88], rim:[25,41,60] },
      { core:[39,58,69], rim:[20,36,47] }
    ];
    const pal = palettes[variant % palettes.length];

    g.clearRect(0, 0, size, size);
    g.globalCompositeOperation = "screen";

    const baseAngle = rnd() * Math.PI;
    const lobeCount = 24 + Math.floor(rnd() * 20);
    for (let i = 0; i < lobeCount; i++) {
      const angle = baseAngle + (rnd() - .5) * 1.8;
      const orbit = 25 + Math.pow(rnd(), .72) * 230;
      const x = size * .5 + Math.cos(angle) * orbit * (.8 + rnd() * .5);
      const y = size * .5 + Math.sin(angle) * orbit * (.42 + rnd() * .35);
      const r = 45 + rnd() * 165;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const lift = 5 + Math.floor(rnd() * 18);
      grad.addColorStop(0, `rgba(${pal.core[0]+lift},${pal.core[1]+lift},${pal.core[2]+lift},${.035+rnd()*.055})`);
      grad.addColorStop(.36, `rgba(${pal.core[0]},${pal.core[1]},${pal.core[2]},${.022+rnd()*.040})`);
      grad.addColorStop(.74, `rgba(${pal.rim[0]},${pal.rim[1]},${pal.rim[2]},${.012+rnd()*.024})`);
      grad.addColorStop(1, `rgba(${pal.rim[0]},${pal.rim[1]},${pal.rim[2]},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * (.24 + rnd() * .52), angle * .55, 0, TAU);
      g.fill();
    }

    /* Filaments: narrow layered strokes give each nebula a distinct skeletal form. */
    g.globalCompositeOperation = "screen";
    g.lineCap = "round";
    const filamentCount = 9 + Math.floor(rnd() * 10);
    for (let f = 0; f < filamentCount; f++) {
      const phase = rnd() * TAU;
      const amp = 45 + rnd() * 95;
      const y0 = size * (.29 + rnd() * .42);
      const x0 = size * (.12 + rnd() * .18);
      const x1 = size * (.72 + rnd() * .18);
      g.beginPath();
      for (let j = 0; j < 34; j++) {
        const q = j / 33;
        const x = lerp(x0, x1, q);
        const y = y0 + Math.sin(q * Math.PI * (1.2 + rnd() * .8) + phase) * amp * (1 - Math.abs(q-.5)*.7);
        if (j === 0) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.strokeStyle = `rgba(${pal.core[0]+22},${pal.core[1]+24},${pal.core[2]+27},${.018+rnd()*.028})`;
      g.lineWidth = 2 + rnd() * 7;
      g.stroke();
    }

    /* Embedded star grains / ionisation knots. */
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * TAU;
      const rr = Math.pow(rnd(), .58) * 330;
      const x = size*.5 + Math.cos(a) * rr;
      const y = size*.5 + Math.sin(a) * rr * (.36 + rnd()*.42);
      const radius = .18 + Math.pow(rnd(), 3) * 1.15;
      const alpha = .012 + Math.pow(rnd(), 2) * .065;
      const cool = 126 + Math.floor(rnd()*65);
      g.fillStyle = `rgba(${cool},${cool+10},${cool+18},${alpha})`;
      g.beginPath(); g.arc(x,y,radius,0,TAU); g.fill();
    }

    return c;
  }

  function buildGalaxySprite(seed, morph) {
    const size = 560;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha: true });
    const rnd = rngFor(seed);
    g.clearRect(0,0,size,size);
    g.translate(size/2,size/2);
    g.globalCompositeOperation = "screen";

    const armCount = morph % 3 === 0 ? 2 : (morph % 3 === 1 ? 3 : 4);
    const flatten = .20 + rnd() * .11;
    const twist = 4.6 + rnd() * 2.2;
    const barred = morph % 4 === 1;

    const core = g.createRadialGradient(0,0,0,0,0,72);
    core.addColorStop(0,"rgba(223,232,238,.74)");
    core.addColorStop(.12,"rgba(172,194,207,.40)");
    core.addColorStop(.48,"rgba(86,117,137,.12)");
    core.addColorStop(1,"rgba(35,57,72,0)");
    g.fillStyle = core;
    g.beginPath(); g.ellipse(0,0,74,22,0,0,TAU); g.fill();

    if (barred) {
      const bar = g.createLinearGradient(-58,0,58,0);
      bar.addColorStop(0,"rgba(85,110,127,0)");
      bar.addColorStop(.5,"rgba(175,195,206,.22)");
      bar.addColorStop(1,"rgba(85,110,127,0)");
      g.fillStyle = bar;
      g.fillRect(-62,-5,124,10);
    }

    /* Arm stars: thousands of points along logarithmic spirals, not a flat disk. */
    for (let arm = 0; arm < armCount; arm++) {
      const base = arm * TAU / armCount + rnd()*.18;
      const points = 420 + Math.floor(rnd()*220);
      for (let i = 0; i < points; i++) {
        const q = Math.pow(rnd(), .74);
        const angle = base + q * twist + rnd() * .22;
        const radius = 14 + q * (178 + rnd()*28) + (rnd()-.5)*16;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * flatten + (rnd()-.5)*7;
        const alpha = .055 + Math.pow(rnd(),2)*.34;
        const sz = .18 + Math.pow(rnd(),4)*1.28;
        const tint = 174 + Math.floor(rnd()*52);
        g.fillStyle = `rgba(${tint},${Math.min(240,tint+10)},${Math.min(247,tint+18)},${alpha})`;
        g.beginPath(); g.arc(x,y,sz,0,TAU); g.fill();
      }
    }

    /* Dark dust lanes cut through the arms. */
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "rgba(0,0,0,.17)";
    for (let arm = 0; arm < Math.min(3, armCount); arm++) {
      g.beginPath();
      for (let i = 0; i < 72; i++) {
        const q = i/71;
        const a = arm*TAU/armCount + q*(twist*.92) + .13;
        const rr = 26 + q*154;
        const x = Math.cos(a)*rr;
        const y = Math.sin(a)*rr*flatten;
        if (!i) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.lineWidth = 2.0 + arm*.4;
      g.stroke();
    }

    return c;
  }

  function rebuildSprites() {
    nebulaSprites.length = 0;
    galaxySprites.length = 0;
    for (let i=0;i<10;i++) nebulaSprites.push(buildNebulaSprite(34017+i*991,i));
    for (let i=0;i<7;i++) galaxySprites.push(buildGalaxySprite(78013+i*733,i));
  }

  function buildSegment(index) {
    const rnd = rngFor(index * 7919 + 42424);
    const baseY = index * SEGMENT;
    const objects = { stars:[], nebulae:[], clusters:[], galaxies:[], systems:[] };

    const starCount = 110 + Math.floor(rnd()*86);
    for (let i=0;i<starCount;i++) {
      objects.stars.push({
        x:rnd(), y:baseY+rnd()*SEGMENT,
        depth:.065+rnd()*.25,
        size:.22+Math.pow(rnd(),3.5)*1.7,
        alpha:.08+Math.pow(rnd(),1.8)*.70,
        phase:rnd()*TAU, cool:rnd()
      });
    }

    const nebulaCount = 1 + (rnd()>.45?1:0);
    for (let i=0;i<nebulaCount;i++) {
      objects.nebulae.push({
        x:edgeX(rnd,.30),
        y:baseY+rnd()*SEGMENT,
        depth:.045+rnd()*.085,
        scale:.74+rnd()*1.32,
        alpha:.20+rnd()*.24,
        sprite:Math.floor(rnd()*nebulaSprites.length),
        drift:(rnd()-.5)*3.2,
        phase:rnd()*TAU,
        stretchX:.95+rnd()*.8,
        stretchY:.42+rnd()*.50
      });
    }

    if (rnd()>.48) {
      objects.clusters.push({
        x:edgeX(rnd,.31), y:baseY+rnd()*SEGMENT,
        depth:.08+rnd()*.13, radius:32+rnd()*78,
        count:30+Math.floor(rnd()*58), alpha:.15+rnd()*.28,
        seed:Math.floor(rnd()*1e7)
      });
    }

    if (rnd()>.76) {
      objects.galaxies.push({
        x:edgeX(rnd,.29), y:baseY+rnd()*SEGMENT,
        depth:.035+rnd()*.055,
        radius:34+rnd()*54,
        angle:rnd()*Math.PI,
        alpha:.12+rnd()*.17,
        phase:rnd()*TAU,
        sprite:Math.floor(rnd()*galaxySprites.length)
      });
    }

    if (rnd()>.64) {
      const planetCount = 3+Math.floor(rnd()*4);
      const planets=[];
      for (let i=0;i<planetCount;i++) {
        planets.push({
          rx:10+i*(7+rnd()*5), ry:(5+i*(2.5+rnd()*3.5)),
          speed:(.00032+rnd()*.00105)*(rnd()>.5?1:-1),
          phase:rnd()*TAU,
          size:.45+rnd()*.9
        });
      }
      objects.systems.push({
        x:edgeX(rnd,.31), y:baseY+rnd()*SEGMENT,
        depth:.10+rnd()*.12, alpha:.12+rnd()*.18,
        phase:rnd()*TAU, planets
      });
    }

    return objects;
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
    dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio||1));
    canvas.width = Math.round(width*dpr);
    canvas.height = Math.round(height*dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
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
    const grad = ctx.createRadialGradient(width*.52,height*.30,0,width*.50,height*.44,Math.max(width,height)*.88);
    grad.addColorStop(0,"#081520");
    grad.addColorStop(.36,"#05111a");
    grad.addColorStop(.74,"#03090e");
    grad.addColorStop(1,"#010408");
    ctx.fillStyle=grad; ctx.fillRect(0,0,width,height);

    const haze = ctx.createLinearGradient(0,0,width,height);
    haze.addColorStop(0,"rgba(29,48,63,.048)");
    haze.addColorStop(.48,"rgba(27,46,60,.014)");
    haze.addColorStop(1,"rgba(14,30,44,.047)");
    ctx.fillStyle=haze; ctx.fillRect(0,0,width,height);
  }

  function drawNebula(n,cameraY,t,alphaMul=1) {
    const y=screenY(n.y,n.depth,cameraY);
    const size=Math.min(width,1550)*.60*n.scale*(.70+n.depth*1.5);
    if (y<-size || y>height+size) return;
    const x=screenX(n.x,n.depth,t,n.drift,n.phase);
    const sprite=nebulaSprites[n.sprite];
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha=n.alpha*alphaMul;
    ctx.globalCompositeOperation="screen";
    ctx.translate(x,y);
    ctx.rotate(Math.sin(n.phase)*.24 + (reduceMotion?0:Math.sin(t*.000004+n.phase)*.015));
    ctx.scale(n.stretchX||1.25,n.stretchY||.72);
    ctx.drawImage(sprite,-size*.5,-size*.5,size,size);
    ctx.restore();
  }

  function drawGalaxy(gal,cameraY,t,alphaMul=1) {
    const y=screenY(gal.y,gal.depth,cameraY);
    const r=gal.radius*(1+width/2500);
    if (y<-r*3 || y>height+r*3) return;
    const x=screenX(gal.x,gal.depth,t,2.0,gal.phase);
    const sprite=galaxySprites[gal.sprite];
    if (!sprite) return;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(gal.angle + (reduceMotion?0:t*.0000013));
    ctx.globalAlpha=gal.alpha*alphaMul;
    ctx.globalCompositeOperation="screen";
    ctx.scale(1.0,.92);
    ctx.drawImage(sprite,-r*2.55,-r*2.55,r*5.1,r*5.1);
    ctx.restore();
  }

  function drawCluster(cluster,cameraY,t) {
    const y=screenY(cluster.y,cluster.depth,cameraY);
    if (y<-cluster.radius*2 || y>height+cluster.radius*2) return;
    const x=screenX(cluster.x,cluster.depth,t,1.1,cluster.seed);
    const rnd=rngFor(cluster.seed);
    ctx.save(); ctx.globalCompositeOperation="screen";
    for (let i=0;i<cluster.count;i++) {
      const a=rnd()*TAU, rr=Math.pow(rnd(),1.55)*cluster.radius;
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr*.58;
      const size=.25+Math.pow(rnd(),4)*1.55;
      const alpha=cluster.alpha*(.25+rnd()*.75);
      const cool=168+Math.floor(rnd()*56);
      ctx.fillStyle=`rgba(${cool},${Math.min(238,cool+12)},${Math.min(246,cool+22)},${alpha})`;
      ctx.beginPath(); ctx.arc(px,py,size,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawSystem(sys,cameraY,t) {
    const y=screenY(sys.y,sys.depth,cameraY);
    if (y<-70 || y>height+70) return;
    const x=screenX(sys.x,sys.depth,t,.7,sys.phase);

    ctx.save(); ctx.translate(x,y); ctx.globalCompositeOperation="screen";
    const pulse = reduceMotion?1:(.82 + Math.sin(t*.0042+sys.phase)*.18);
    const starAlpha=sys.alpha*1.8*pulse;
    const halo=ctx.createRadialGradient(0,0,0,0,0,10);
    halo.addColorStop(0,`rgba(226,235,240,${starAlpha})`);
    halo.addColorStop(.18,`rgba(163,191,207,${starAlpha*.62})`);
    halo.addColorStop(1,"rgba(83,116,137,0)");
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,10,0,TAU); ctx.fill();
    ctx.strokeStyle=`rgba(206,223,232,${starAlpha*.33})`; ctx.lineWidth=.55;
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();

    for (const p of sys.planets) {
      const a=p.phase + (reduceMotion?0:t*p.speed);
      const px=Math.cos(a)*p.rx, py=Math.sin(a)*p.ry;
      ctx.fillStyle=`rgba(160,171,178,${sys.alpha*(.72+.28*Math.cos(a))})`;
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

  /* Curated top/bottom survey moments reflect the user's two screenshots. */
  function drawCuratedScenes(t) {
    const maxScroll=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    const p=clamp(smoothScroll/maxScroll,0,1);
    const topAlpha=1-smoothstep(.08,.24,p);
    const bottomAlpha=smoothstep(.74,.91,p);

    if (topAlpha>.01) {
      /* Detailed upper-left spiral. */
      drawScreenGalaxy(.14,.15,64,-.24,5,topAlpha*.56,t);
      /* Lower-left galaxy, kept clear of the ghost. */
      drawScreenGalaxy(.14,.70,72,.28,2,topAlpha*.68,t);
      /* Pine-green nebula replacing the former upper-right galaxy. */
      drawScreenNebula(.89,.20,470,6,topAlpha*.62,t,1.26,.68);
    }

    if (bottomAlpha>.01) {
      /* Small left galaxy moved farther left. */
      drawScreenGalaxy(.105,.43,52,-.48,1,bottomAlpha*.55,t);
      /* Large blue/violet nebula farther right of the closing ghost. */
      drawScreenNebula(.89,.34,560,7,bottomAlpha*.72,t,1.34,.72);
    }
  }

  function drawScreenGalaxy(nx,ny,radius,angle,spriteIndex,alpha,t) {
    const sprite=galaxySprites[spriteIndex%galaxySprites.length];
    if (!sprite) return;
    ctx.save();
    ctx.translate(nx*width,ny*height);
    ctx.rotate(angle + (reduceMotion?0:t*.0000011));
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.drawImage(sprite,-radius*2.65,-radius*2.65,radius*5.3,radius*5.3);
    ctx.restore();
  }

  function drawScreenNebula(nx,ny,size,spriteIndex,alpha,t,sx=1.2,sy=.72) {
    const sprite=nebulaSprites[spriteIndex%nebulaSprites.length];
    if (!sprite) return;
    ctx.save();
    ctx.translate(nx*width,ny*height);
    ctx.rotate(-.11 + (reduceMotion?0:Math.sin(t*.000004)*.012));
    ctx.scale(sx,sy);
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.drawImage(sprite,-size*.5,-size*.5,size,size);
    ctx.restore();
  }

  /* -------------------------------------------------------
     SHIP TRAFFIC — faster, smaller, 3D trajectories + trails
     ------------------------------------------------------- */
  function spawnShip(now) {
    const type=Math.floor(Math.random()*3);
    const mode=Math.floor(Math.random()*4);
    const side=Math.random()<.5?-1:1;
    let x0,y0,x1,y1,s0,s1;

    if (mode===0) {
      x0=side<0?-0.08:1.08; y0=.18+Math.random()*.64;
      x1=side<0?1.08:-.08; y1=clamp(y0+(Math.random()-.5)*.36,.08,.92);
      s0=.58+Math.random()*.22; s1=.30+Math.random()*.18;
    } else if (mode===1) {
      x0=side<0?-.05:1.05; y0=.80+Math.random()*.15;
      x1=.38+Math.random()*.24; y1=.06+Math.random()*.22;
      s0=.54+Math.random()*.20; s1=.17+Math.random()*.11;
    } else if (mode===2) {
      x0=.12+Math.random()*.76; y0=1.08;
      x1=.34+Math.random()*.32; y1=.24+Math.random()*.18;
      s0=.62+Math.random()*.18; s1=.12+Math.random()*.10;
    } else {
      x0=side<0?-.05:1.05; y0=.18+Math.random()*.58;
      x1=.48+(Math.random()-.5)*.08; y1=.42+(Math.random()-.5)*.12;
      s0=.48+Math.random()*.15; s1=.07+Math.random()*.055;
    }

    activeShips.push({
      type, start:now, duration:3200+Math.random()*3000,
      x0,y0,x1,y1,s0,s1,
      alpha:.12+Math.random()*.11,
      curve:(Math.random()-.5)*.26,
      roll:(Math.random()-.5)*.25
    });
  }

  function shipPoint(ship,q) {
    const e=1-Math.pow(1-q,2.15);
    const bx=lerp(ship.x0,ship.x1,e);
    const by=lerp(ship.y0,ship.y1,e);
    const arch=Math.sin(e*Math.PI)*ship.curve;
    return { x:(bx)*width, y:(by+arch)*height, scale:lerp(ship.s0,ship.s1,e) };
  }

  function drawShipShape(type,x,y,scale,angle,alpha) {
    const s=scale*(width<900?.78:1);
    ctx.save();
    ctx.translate(x,y); ctx.rotate(angle); ctx.scale(s,s);
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.fillStyle="rgba(132,150,160,.72)";
    ctx.strokeStyle="rgba(188,201,208,.72)";
    ctx.lineWidth=.8;

    ctx.beginPath();
    if (type===0) {
      /* ANACONDA-like long faceted hull. */
      ctx.moveTo(25,0); ctx.lineTo(8,-4.6); ctx.lineTo(-3,-6.6); ctx.lineTo(-20,-4.2); ctx.lineTo(-27,0);
      ctx.lineTo(-20,4.2); ctx.lineTo(-3,6.6); ctx.lineTo(8,4.6); ctx.closePath();
    } else if (type===1) {
      /* KRAIT-like diamond / clipped wing profile. */
      ctx.moveTo(23,0); ctx.lineTo(7,-8); ctx.lineTo(-10,-6.8); ctx.lineTo(-24,-2.3); ctx.lineTo(-13,0);
      ctx.lineTo(-24,2.3); ctx.lineTo(-10,6.8); ctx.lineTo(7,8); ctx.closePath();
    } else {
      /* CASPIAN-like compact double-chevron explorer. */
      ctx.moveTo(22,0); ctx.lineTo(6,-6.4); ctx.lineTo(-5,-3.6); ctx.lineTo(-22,-6.3); ctx.lineTo(-14,0);
      ctx.lineTo(-22,6.3); ctx.lineTo(-5,3.6); ctx.lineTo(6,6.4); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();

    /* Hull paneling and small engine lights. */
    ctx.strokeStyle="rgba(207,216,221,.38)"; ctx.lineWidth=.42;
    ctx.beginPath(); ctx.moveTo(-13,0); ctx.lineTo(14,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,-3); ctx.lineTo(7,-1.3); ctx.moveTo(-4,3); ctx.lineTo(7,1.3); ctx.stroke();
    ctx.fillStyle="rgba(123,178,208,.75)";
    ctx.beginPath(); ctx.arc(-19,-2.2,1.0,0,TAU); ctx.arc(-19,2.2,1.0,0,TAU); ctx.fill();
    ctx.restore();
  }

  function drawShips(now) {
    if (!reduceMotion && now>=nextShipAt) {
      spawnShip(now);
      nextShipAt=now + 5000 + Math.random()*10000;
    }

    for (let i=activeShips.length-1;i>=0;i--) {
      const ship=activeShips[i];
      const q=(now-ship.start)/ship.duration;
      if (q>=1) { activeShips.splice(i,1); continue; }
      if (q<0) continue;

      const p=shipPoint(ship,q);
      const p2=shipPoint(ship,Math.min(1,q+.01));
      const angle=Math.atan2(p2.y-p.y,p2.x-p.x)+ship.roll;

      /* Fading engine trail. */
      const trailSteps=16;
      for (let j=trailSteps;j>=1;j--) {
        const tq=Math.max(0,q-j*.011);
        const a=shipPoint(ship,tq);
        const b=shipPoint(ship,Math.max(0,q-(j-1)*.011));
        const fade=(1-j/(trailSteps+1));
        ctx.strokeStyle=`rgba(103,156,184,${ship.alpha*.18*fade*(1-q*.55)})`;
        ctx.lineWidth=Math.max(.35,p.scale*1.25*fade);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }

      drawShipShape(ship.type,p.x,p.y,p.scale,angle,ship.alpha*(1-q*.55));
    }
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
    grainTile=makeCanvas(220,220);
    grainTileCtx=grainTile.getContext("2d",{alpha:true});
    resizeFilmGrain();
    if (!reduceMotion) grainTimer=window.setInterval(updateFilmGrain,92);
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
      const n=Math.random();
      const v=n<.5 ? 18+Math.floor(n*70) : 172+Math.floor((n-.5)*95);
      data[i]=data[i+1]=data[i+2]=v;
      data[i+3]=22+Math.floor(Math.random()*32);
    }
    grainTileCtx.putImageData(img,0,0);
    grainCtx.clearRect(0,0,grainCanvas.width,grainCanvas.height);
    const pat=grainCtx.createPattern(grainTile,"repeat");
    if (pat) {
      grainCtx.save();
      grainCtx.translate((Math.random()*19)|0,(Math.random()*19)|0);
      grainCtx.fillStyle=pat;
      grainCtx.fillRect(-24,-24,grainCanvas.width+48,grainCanvas.height+48);
      grainCtx.restore();
    }
  }

  function render(now) {
    raf=0;
    if (!visible) return;
    const dt=clamp(now-lastFrame,0,48);
    lastFrame=now;
    if (!reduceMotion) elapsed+=dt;

    smoothScroll += (targetScroll-smoothScroll)*(1-Math.pow(.0008,dt/1000));
    const autonomousTravel=reduceMotion?0:elapsed*.0067;
    const cameraY=smoothScroll*.47 + autonomousTravel;
    const centerSeg=Math.floor(cameraY/SEGMENT);

    drawBackdrop();

    const segments=[];
    for (let i=centerSeg-SEGMENT_RADIUS;i<=centerSeg+SEGMENT_RADIUS;i++) segments.push(getSegment(i));
    pruneSegments(centerSeg);

    for (const seg of segments) for (const neb of seg.nebulae) drawNebula(neb,cameraY,now);
    for (const seg of segments) for (const gal of seg.galaxies) drawGalaxy(gal,cameraY,now);
    for (const seg of segments) for (const cluster of seg.clusters) drawCluster(cluster,cameraY,now);
    for (const seg of segments) for (const sys of seg.systems) drawSystem(sys,cameraY,now);
    for (const seg of segments) for (const star of seg.stars) drawStar(star,cameraY,now);

    drawCuratedScenes(now);
    drawShips(now);

    /* Readability vignette, still transparent enough to preserve depth. */
    const vignette=ctx.createRadialGradient(width*.50,height*.47,Math.min(width,height)*.18,width*.50,height*.47,Math.max(width,height)*.76);
    vignette.addColorStop(0,"rgba(0,0,0,0)");
    vignette.addColorStop(.66,"rgba(0,2,5,.025)");
    vignette.addColorStop(1,"rgba(0,2,5,.28)");
    ctx.fillStyle=vignette; ctx.fillRect(0,0,width,height);

    raf=requestAnimationFrame(render);
  }

  function requestRender() { if (!raf&&visible) raf=requestAnimationFrame(render); }

  window.addEventListener("scroll",()=>{targetScroll=window.scrollY||0; requestRender();},{passive:true});
  window.addEventListener("resize",()=>{resize(); requestRender();},{passive:true});
  document.addEventListener("visibilitychange",()=>{
    visible=!document.hidden;
    lastFrame=performance.now();
    if (visible) requestRender();
    else if (raf) { cancelAnimationFrame(raf); raf=0; }
  });

  rebuildSprites();
  initFilmGrain();
  resize();
  requestRender();
})();
