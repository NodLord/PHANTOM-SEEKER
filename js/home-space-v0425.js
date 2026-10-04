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
    const size = 900;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha: true });
    const rnd = rngFor(seed);

    /* Distinct survey-cloud families: cyan, midnight blue, pine green,
       violet, charcoal/dark dust, blue-grey. All remain cold-biased. */
    const palettes = [
      { core:[42,92,112], rim:[19,49,67], dark:false },   // cyan-blue
      { core:[34,48,91],  rim:[17,27,55], dark:false },   // midnight
      { core:[31,73,60],  rim:[13,39,34], dark:false },   // pine
      { core:[70,54,96],  rim:[34,27,58], dark:false },   // violet
      { core:[12,19,25],  rim:[36,55,67], dark:true  },   // dark cloud
      { core:[48,70,92],  rim:[23,39,56], dark:false },
      { core:[38,82,94],  rim:[17,44,56], dark:false },
      { core:[51,48,82],  rim:[25,25,52], dark:false },
      { core:[27,65,57],  rim:[14,37,35], dark:false },
      { core:[30,44,67],  rim:[16,26,46], dark:false },
      { core:[55,73,92],  rim:[28,41,56], dark:false },
      { core:[16,24,31],  rim:[40,55,68], dark:true  }
    ];
    const pal = palettes[variant % palettes.length];

    g.clearRect(0, 0, size, size);
    g.globalCompositeOperation = "source-over";

    const baseAngle = rnd() * Math.PI;
    const lobeCount = 30 + Math.floor(rnd() * 26);

    /* Irregular compact cloud body. No full-screen wash. */
    for (let i = 0; i < lobeCount; i++) {
      const angle = baseAngle + (rnd() - .5) * 2.3;
      const orbit = 22 + Math.pow(rnd(), .72) * 255;
      const x = size * .5 + Math.cos(angle) * orbit * (.72 + rnd() * .62);
      const y = size * .5 + Math.sin(angle) * orbit * (.35 + rnd() * .44);
      const r = 34 + rnd() * 145;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);

      if (pal.dark) {
        grad.addColorStop(0, `rgba(${pal.core[0]},${pal.core[1]},${pal.core[2]},${.11+rnd()*.10})`);
        grad.addColorStop(.43, `rgba(${pal.core[0]},${pal.core[1]},${pal.core[2]},${.065+rnd()*.06})`);
        grad.addColorStop(.80, `rgba(${pal.rim[0]},${pal.rim[1]},${pal.rim[2]},${.018+rnd()*.026})`);
      } else {
        const lift = 4 + Math.floor(rnd() * 16);
        grad.addColorStop(0, `rgba(${pal.core[0]+lift},${pal.core[1]+lift},${pal.core[2]+lift},${.055+rnd()*.070})`);
        grad.addColorStop(.40, `rgba(${pal.core[0]},${pal.core[1]},${pal.core[2]},${.030+rnd()*.046})`);
        grad.addColorStop(.80, `rgba(${pal.rim[0]},${pal.rim[1]},${pal.rim[2]},${.009+rnd()*.020})`);
      }
      grad.addColorStop(1, `rgba(${pal.rim[0]},${pal.rim[1]},${pal.rim[2]},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * (.22 + rnd() * .48), angle * .58, 0, TAU);
      g.fill();
    }

    /* Fine luminous filaments and ionisation rims. */
    g.globalCompositeOperation = "screen";
    g.lineCap = "round";
    const filamentCount = 14 + Math.floor(rnd() * 13);
    for (let f = 0; f < filamentCount; f++) {
      const phase = rnd() * TAU;
      const amp = 28 + rnd() * 82;
      const y0 = size * (.30 + rnd() * .40);
      const x0 = size * (.14 + rnd() * .18);
      const x1 = size * (.68 + rnd() * .18);
      g.beginPath();
      for (let j = 0; j < 44; j++) {
        const q = j / 43;
        const x = lerp(x0, x1, q);
        const y = y0 + Math.sin(q * Math.PI * (1.15 + rnd() * .7) + phase) *
          amp * (1 - Math.abs(q-.5)*.65);
        if (j === 0) g.moveTo(x,y); else g.lineTo(x,y);
      }
      const rr = Math.min(120, pal.rim[0]+30);
      const gg = Math.min(145, pal.rim[1]+40);
      const bb = Math.min(165, pal.rim[2]+52);
      g.strokeStyle = `rgba(${rr},${gg},${bb},${.018+rnd()*.028})`;
      g.lineWidth = .8 + rnd() * 3.2;
      g.stroke();
    }

    /* Star grains inside the cloud, suggesting distant stellar formation. */
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 1950; i++) {
      const a = rnd() * TAU;
      const rr = Math.pow(rnd(), .56) * 340;
      const x = size*.5 + Math.cos(a) * rr;
      const y = size*.5 + Math.sin(a) * rr * (.31 + rnd()*.40);
      const radius = .16 + Math.pow(rnd(), 4) * 1.05;
      const alpha = .010 + Math.pow(rnd(), 2.2) * .060;
      const cool = 134 + Math.floor(rnd()*70);
      g.fillStyle = `rgba(${cool},${Math.min(235,cool+10)},${Math.min(248,cool+22)},${alpha})`;
      g.beginPath(); g.arc(x,y,radius,0,TAU); g.fill();
    }

    return c;
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
    const rnd = rngFor(index * 7919 + 42525);
    const baseY = index * SEGMENT;
    const objects = { stars:[], nebulae:[], clusters:[], galaxies:[], systems:[] };

    /* Denser deep star field. */
    const starCount = 205 + Math.floor(rnd()*120);
    for (let i=0;i<starCount;i++) {
      objects.stars.push({
        x:rnd(), y:baseY+rnd()*SEGMENT,
        depth:.085+rnd()*.31,
        size:.18+Math.pow(rnd(),3.8)*1.65,
        alpha:.075+Math.pow(rnd(),1.72)*.72,
        phase:rnd()*TAU, cool:rnd()
      });
    }

    /* Nebulae dominate the deep field. They are discrete clouds on the sides,
       not a full-screen texture. */
    const nebulaCount = 1 + (rnd()>.36 ? 1 : 0);
    for (let i=0;i<nebulaCount;i++) {
      objects.nebulae.push({
        x:edgeX(rnd,.27),
        y:baseY+rnd()*SEGMENT,
        depth:.075+rnd()*.085,
        scale:.54+rnd()*.62,
        alpha:.15+rnd()*.20,
        sprite:Math.floor(rnd()*nebulaSprites.length),
        drift:(rnd()-.5)*2.5,
        phase:rnd()*TAU,
        stretchX:.90+rnd()*.48,
        stretchY:.48+rnd()*.38
      });
    }

    if (rnd()>.50) {
      objects.clusters.push({
        x:edgeX(rnd,.29), y:baseY+rnd()*SEGMENT,
        depth:.11+rnd()*.14, radius:35+rnd()*86,
        count:38+Math.floor(rnd()*78), alpha:.17+rnd()*.30,
        seed:Math.floor(rnd()*1e7)
      });
    }

    /* Galaxies are intentionally rarer than nebulae. */
    if (rnd()>.83) {
      objects.galaxies.push({
        x:edgeX(rnd,.265), y:baseY+rnd()*SEGMENT,
        depth:.070+rnd()*.065,
        radius:32+rnd()*48,
        angle:(rnd()-.5)*1.25,
        alpha:.15+rnd()*.19,
        phase:rnd()*TAU,
        sprite:Math.floor(rnd()*galaxySprites.length)
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
      objects.systems.push({
        x:edgeX(rnd,.29), y:baseY+rnd()*SEGMENT,
        depth:.12+rnd()*.15, alpha:.24+rnd()*.20,
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
    const y=screenY(n.y,n.depth,cameraY);
    const size=Math.min(width,1500)*.34*n.scale*(.78+n.depth*1.10);
    if (y<-size || y>height+size) return;
    const x=screenX(n.x,n.depth,t,n.drift,n.phase);
    const sprite=nebulaSprites[n.sprite];
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha=n.alpha*alphaMul;
    ctx.globalCompositeOperation="source-over";
    ctx.translate(x,y);
    ctx.rotate(Math.sin(n.phase)*.28 + (reduceMotion?0:Math.sin(t*.000004+n.phase)*.012));
    ctx.scale(n.stretchX||1.15,n.stretchY||.66);
    ctx.drawImage(sprite,-size*.5,-size*.5,size,size);
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
    ctx.rotate(gal.angle + (reduceMotion?0:t*.0000009));
    ctx.globalAlpha=gal.alpha*alphaMul;
    ctx.globalCompositeOperation="screen";
    ctx.scale(1.0,.92);
    ctx.drawImage(sprite,-r*3.15,-r*3.15,r*6.3,r*6.3);
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
    if (y<-92 || y>height+92) return;
    const x=screenX(sys.x,sys.depth,t,.65,sys.phase);

    ctx.save();
    ctx.translate(x,y);
    ctx.globalCompositeOperation="screen";

    const pulse = reduceMotion?1:(.84 + Math.sin(t*.0047+sys.phase)*.16);
    const starAlpha=clamp(sys.alpha*2.45*pulse,0,.92);
    const halo=ctx.createRadialGradient(0,0,0,0,0,14);
    halo.addColorStop(0,`rgba(238,244,247,${starAlpha})`);
    halo.addColorStop(.15,`rgba(178,205,219,${starAlpha*.72})`);
    halo.addColorStop(.48,`rgba(111,155,181,${starAlpha*.28})`);
    halo.addColorStop(1,"rgba(72,111,137,0)");
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,14,0,TAU); ctx.fill();

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

  /* Curated survey landmarks are now genuine world-space objects.
     They drift with camera depth and leave/enter frame through scrolling. */
  function anchoredWorldY(anchorCameraY, ny, depth) {
    return anchorCameraY + (ny-.5) * height / Math.max(.001, depth);
  }

  function drawAnchoredGalaxy(anchorCameraY,nx,ny,radius,angle,spriteIndex,alpha,depth,cameraY,t) {
    const worldY=anchoredWorldY(anchorCameraY,ny,depth);
    const y=screenY(worldY,depth,cameraY);
    if (y<-radius*4 || y>height+radius*4) return;
    const x=screenX(nx,depth,t,1.2,spriteIndex*.77);
    const sprite=galaxySprites[spriteIndex%galaxySprites.length];
    if (!sprite) return;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle + (reduceMotion?0:t*.0000008));
    ctx.globalCompositeOperation="screen";
    ctx.globalAlpha=alpha;
    ctx.drawImage(sprite,-radius*3.05,-radius*3.05,radius*6.1,radius*6.1);
    ctx.restore();
  }

  function drawAnchoredNebula(anchorCameraY,nx,ny,size,spriteIndex,alpha,depth,cameraY,t,sx=1.15,sy=.66) {
    const worldY=anchoredWorldY(anchorCameraY,ny,depth);
    const y=screenY(worldY,depth,cameraY);
    if (y<-size || y>height+size) return;
    const x=screenX(nx,depth,t,1.0,spriteIndex*.41);
    const sprite=nebulaSprites[spriteIndex%nebulaSprites.length];
    if (!sprite) return;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-.10+(reduceMotion?0:Math.sin(t*.0000037+spriteIndex)*.011));
    ctx.scale(sx,sy);
    ctx.globalCompositeOperation="source-over";
    ctx.globalAlpha=alpha;
    ctx.drawImage(sprite,-size*.5,-size*.5,size,size);
    ctx.restore();
  }

  function drawCuratedWorldScenes(cameraY,t) {
    const maxScroll=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    const bottomAnchor=maxScroll*.47;

    /* TOP / HERO:
       upper-left detailed spiral, lower-left rotated spiral clear of logo,
       and a compact pine-green nebula toward the upper-right edge. */
    drawAnchoredGalaxy(0,.135,.15,62,-.30,5,.34,.105,cameraY,t);
    drawAnchoredGalaxy(0,.125,.73,68,.42,2,.42,.118,cameraY,t);
    drawAnchoredNebula(0,.91,.20,390,8,.39,.105,cameraY,t,1.18,.64);

    /* BOTTOM / FINAL MANIFESTO:
       small galaxy pushed left, blue-violet nebula pushed right. */
    drawAnchoredGalaxy(bottomAnchor,.085,.42,50,-.50,1,.32,.112,cameraY,t);
    drawAnchoredNebula(bottomAnchor,.915,.35,455,7,.46,.108,cameraY,t,1.22,.68);
  }

  /* -------------------------------------------------------
     SHIP TRAFFIC — faster, smaller, 3D trajectories + trails
     ------------------------------------------------------- */

  function spawnShip(now) {
    const type=Math.floor(Math.random()*3);
    const mode=Math.floor(Math.random()*4);
    const side=Math.random()<.5?-1:1;
    const closePass=Math.random()<.16;
    const slowPass=!closePass && Math.random()<.22;

    let x0,y0,x1,y1,s0,s1;

    if (mode===0) {
      x0=side<0?-0.08:1.08; y0=.16+Math.random()*.66;
      x1=side<0?1.08:-.08; y1=clamp(y0+(Math.random()-.5)*.38,.06,.94);
    } else if (mode===1) {
      x0=side<0?-.05:1.05; y0=.80+Math.random()*.15;
      x1=.36+Math.random()*.28; y1=.05+Math.random()*.24;
    } else if (mode===2) {
      x0=.10+Math.random()*.80; y0=1.08;
      x1=.32+Math.random()*.36; y1=.20+Math.random()*.22;
    } else {
      x0=side<0?-.05:1.05; y0=.16+Math.random()*.62;
      x1=.48+(Math.random()-.5)*.10; y1=.41+(Math.random()-.5)*.14;
    }

    if (closePass) {
      s0=.98+Math.random()*.48;
      s1=.55+Math.random()*.28;
    } else {
      s0=.42+Math.random()*.24;
      s1=.10+Math.random()*.16;
    }

    const duration = closePass
      ? 6200+Math.random()*3300
      : slowPass
        ? 5600+Math.random()*2600
        : 2500+Math.random()*3000;

    activeShips.push({
      type, start:now, duration,
      x0,y0,x1,y1,s0,s1,
      alpha: closePass ? .19+Math.random()*.12 : .12+Math.random()*.11,
      curve:(Math.random()-.5)*.28,
      roll:(Math.random()-.5)*.28,
      trail:[],
      lastTrailAt:0,
      trailTTL: closePass ? 1900 : 1450
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
      nextShipAt=now + 4700 + Math.random()*9000;
    }

    for (let i=activeShips.length-1;i>=0;i--) {
      const ship=activeShips[i];
      const q=(now-ship.start)/ship.duration;
      const alive=q<1;

      let p=null, angle=0;

      if (alive && q>=0) {
        p=shipPoint(ship,q);
        const p2=shipPoint(ship,Math.min(1,q+.012));
        angle=Math.atan2(p2.y-p.y,p2.x-p.x)+ship.roll;

        if (!ship.lastTrailAt || now-ship.lastTrailAt>34) {
          ship.trail.push({x:p.x,y:p.y,scale:p.scale,time:now});
          ship.lastTrailAt=now;
          if (ship.trail.length>92) ship.trail.shift();
        }
      }

      /* Long persistent trail. It remains after the hull has already left. */
      ship.trail = ship.trail.filter(pt => now-pt.time < ship.trailTTL);
      if (ship.trail.length>1) {
        ctx.save();
        ctx.globalCompositeOperation="screen";
        for (let j=1;j<ship.trail.length;j++) {
          const a=ship.trail[j-1], b=ship.trail[j];
          const age=now-b.time;
          const fade=Math.pow(clamp(1-age/ship.trailTTL,0,1),1.35);
          const tailPos=j/(ship.trail.length-1);
          ctx.strokeStyle=`rgba(93,151,182,${ship.alpha*.34*fade*tailPos})`;
          ctx.lineWidth=Math.max(.28,b.scale*(1.45+.55*tailPos));
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
        ctx.restore();
      }

      if (alive && p) {
        drawShipShape(ship.type,p.x,p.y,p.scale,angle,ship.alpha*(1-q*.48));
      }

      if (!alive && ship.trail.length===0) activeShips.splice(i,1);
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

    drawCuratedWorldScenes(cameraY,now);
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
