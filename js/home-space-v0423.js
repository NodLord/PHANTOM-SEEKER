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
  const MAX_DPR = 1.6;
  const segmentCache = new Map();
  const nebulaSprites = [];

  let width = 1;
  let height = 1;
  let dpr = 1;
  let targetScroll = window.scrollY || 0;
  let smoothScroll = targetScroll;
  let lastFrame = performance.now();
  let elapsed = 0;
  let raf = 0;
  let visible = !document.hidden;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
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

  function buildNebulaSprite(seed, variant) {
    const size = 520;
    const c = makeCanvas(size, size);
    const g = c.getContext("2d", { alpha: true });
    const rnd = rngFor(seed);

    g.clearRect(0, 0, size, size);
    g.globalCompositeOperation = "screen";

    const palettes = [
      [31, 52, 67],
      [39, 57, 69],
      [24, 45, 61],
      [47, 58, 67],
      [28, 54, 70],
      [53, 61, 68]
    ];
    const base = palettes[variant % palettes.length];

    const lobes = 16 + Math.floor(rnd() * 11);
    for (let i = 0; i < lobes; i++) {
      const angle = rnd() * TAU;
      const orbit = 20 + Math.pow(rnd(), .7) * 138;
      const x = size * .5 + Math.cos(angle) * orbit;
      const y = size * .5 + Math.sin(angle) * orbit * (.45 + rnd() * .55);
      const r = 48 + rnd() * 130;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const lift = Math.floor(rnd() * 14);
      grad.addColorStop(0, `rgba(${base[0] + lift},${base[1] + lift},${base[2] + lift},${.035 + rnd() * .055})`);
      grad.addColorStop(.38, `rgba(${base[0]},${base[1]},${base[2]},${.022 + rnd() * .040})`);
      grad.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * (.32 + rnd() * .55), angle * .42, 0, TAU);
      g.fill();
    }

    // Fine survey-like particulate structure inside the cloud, still very distant.
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 560; i++) {
      const a = rnd() * TAU;
      const rr = Math.pow(rnd(), .62) * 218;
      const x = size * .5 + Math.cos(a) * rr;
      const y = size * .5 + Math.sin(a) * rr * (.45 + rnd() * .45);
      const alpha = .015 + rnd() * .075;
      const radius = .25 + rnd() * 1.3;
      g.fillStyle = `rgba(${112 + Math.floor(rnd() * 44)},${133 + Math.floor(rnd() * 42)},${148 + Math.floor(rnd() * 37)},${alpha})`;
      g.beginPath();
      g.arc(x, y, radius, 0, TAU);
      g.fill();
    }

    return c;
  }

  function rebuildSprites() {
    nebulaSprites.length = 0;
    for (let i = 0; i < 8; i++) nebulaSprites.push(buildNebulaSprite(23017 + i * 977, i));
  }

  function buildSegment(index) {
    const rnd = rngFor(index * 7919 + 42023);
    const baseY = index * SEGMENT;
    const objects = {
      stars: [],
      nebulae: [],
      clusters: [],
      galaxies: [],
      systems: [],
      ships: []
    };

    const starCount = 68 + Math.floor(rnd() * 48);
    for (let i = 0; i < starCount; i++) {
      objects.stars.push({
        x: rnd(),
        y: baseY + rnd() * SEGMENT,
        depth: .075 + rnd() * .22,
        size: .28 + Math.pow(rnd(), 3.4) * 1.65,
        alpha: .10 + Math.pow(rnd(), 1.8) * .67,
        phase: rnd() * TAU,
        cool: rnd()
      });
    }

    const nebulaCount = 1 + (rnd() > .48 ? 1 : 0) + (rnd() > .88 ? 1 : 0);
    for (let i = 0; i < nebulaCount; i++) {
      objects.nebulae.push({
        x: -.12 + rnd() * 1.24,
        y: baseY + rnd() * SEGMENT,
        depth: .055 + rnd() * .105,
        scale: .65 + rnd() * 1.22,
        alpha: .30 + rnd() * .28,
        sprite: Math.floor(rnd() * nebulaSprites.length),
        drift: (rnd() - .5) * 4.5,
        phase: rnd() * TAU
      });
    }

    if (rnd() > .34) {
      objects.clusters.push({
        x: .08 + rnd() * .84,
        y: baseY + rnd() * SEGMENT,
        depth: .095 + rnd() * .12,
        radius: 35 + rnd() * 80,
        count: 16 + Math.floor(rnd() * 34),
        alpha: .16 + rnd() * .28,
        seed: Math.floor(rnd() * 1e7)
      });
    }

    if (rnd() > .72) {
      objects.galaxies.push({
        x: .08 + rnd() * .84,
        y: baseY + rnd() * SEGMENT,
        depth: .045 + rnd() * .07,
        radius: 18 + rnd() * 48,
        angle: rnd() * Math.PI,
        alpha: .10 + rnd() * .16,
        phase: rnd() * TAU
      });
    }

    if (rnd() > .68) {
      objects.systems.push({
        x: .08 + rnd() * .84,
        y: baseY + rnd() * SEGMENT,
        depth: .12 + rnd() * .12,
        radius: 24 + rnd() * 58,
        rings: 2 + Math.floor(rnd() * 4),
        alpha: .055 + rnd() * .07,
        angle: rnd() * Math.PI,
        phase: rnd() * TAU
      });
    }

    if (rnd() > .78) {
      objects.ships.push({
        type: Math.floor(rnd() * 3),
        y: baseY + rnd() * SEGMENT,
        depth: .18 + rnd() * .11,
        scale: .45 + rnd() * .75,
        alpha: .022 + rnd() * .045,
        speed: 3.8 + rnd() * 7.0,
        direction: rnd() > .5 ? 1 : -1,
        phase: rnd() * 8000
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
      if (Math.abs(key - center) > SEGMENT_RADIUS + 3) segmentCache.delete(key);
    }
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function screenY(worldY, depth, cameraY) {
    return height * .5 + (worldY - cameraY) * depth;
  }

  function screenX(normalizedX, depth, t, drift = 0, phase = 0) {
    const breathing = reduceMotion ? 0 : Math.sin(t * .000055 + phase) * drift;
    const depthOffset = Math.sin(t * .000018 + phase * .37) * 5 * depth;
    return normalizedX * width + breathing + depthOffset;
  }

  function drawBackdrop() {
    const grad = ctx.createRadialGradient(width * .54, height * .34, 0, width * .52, height * .42, Math.max(width, height) * .82);
    grad.addColorStop(0, "#08131d");
    grad.addColorStop(.38, "#061019");
    grad.addColorStop(.73, "#04090e");
    grad.addColorStop(1, "#020509");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Broad cold haze, deliberately non-photographic and very dim.
    const haze = ctx.createLinearGradient(0, 0, width, height);
    haze.addColorStop(0, "rgba(29,45,57,.055)");
    haze.addColorStop(.45, "rgba(27,45,58,.018)");
    haze.addColorStop(1, "rgba(17,30,42,.048)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
  }

  function drawNebula(n, cameraY, t) {
    const y = screenY(n.y, n.depth, cameraY);
    const size = Math.min(width, 1500) * .56 * n.scale * (.72 + n.depth * 1.4);
    if (y < -size || y > height + size) return;
    const x = screenX(n.x, n.depth, t, n.drift, n.phase);
    const sprite = nebulaSprites[n.sprite];
    if (!sprite) return;

    ctx.save();
    ctx.globalAlpha = n.alpha;
    ctx.globalCompositeOperation = "screen";
    ctx.translate(x, y);
    ctx.rotate(Math.sin(n.phase) * .22 + Math.sin(t * .000006 + n.phase) * .018);
    ctx.scale(1.42, .74);
    ctx.drawImage(sprite, -size * .5, -size * .5, size, size);
    ctx.restore();
  }

  function drawGalaxy(gal, cameraY, t) {
    const y = screenY(gal.y, gal.depth, cameraY);
    if (y < -90 || y > height + 90) return;
    const x = screenX(gal.x, gal.depth, t, 2.5, gal.phase);
    const r = gal.radius * (1 + width / 2600);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(gal.angle + (reduceMotion ? 0 : t * .000002));
    ctx.globalCompositeOperation = "screen";

    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    core.addColorStop(0, `rgba(208,221,229,${gal.alpha * 1.4})`);
    core.addColorStop(.13, `rgba(118,147,165,${gal.alpha})`);
    core.addColorStop(.5, `rgba(66,91,108,${gal.alpha * .34})`);
    core.addColorStop(1, "rgba(38,57,70,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * .22, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `rgba(124,151,168,${gal.alpha * .35})`;
    ctx.lineWidth = .65;
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let i = 0; i < 52; i++) {
        const q = i / 51;
        const a = q * Math.PI * 2.4 + arm * Math.PI;
        const rr = 5 + q * r * .9;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr * .20;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCluster(cluster, cameraY, t) {
    const y = screenY(cluster.y, cluster.depth, cameraY);
    if (y < -cluster.radius * 2 || y > height + cluster.radius * 2) return;
    const x = screenX(cluster.x, cluster.depth, t, 1.4, cluster.seed);
    const rnd = rngFor(cluster.seed);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < cluster.count; i++) {
      const a = rnd() * TAU;
      const rr = Math.pow(rnd(), 1.65) * cluster.radius;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * .55;
      const size = .35 + Math.pow(rnd(), 4) * 1.55;
      const alpha = cluster.alpha * (.28 + rnd() * .72);
      ctx.fillStyle = `rgba(${164 + Math.floor(rnd() * 52)},${184 + Math.floor(rnd() * 40)},${199 + Math.floor(rnd() * 38)},${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSystem(sys, cameraY, t) {
    const y = screenY(sys.y, sys.depth, cameraY);
    const r = sys.radius;
    if (y < -r * 2 || y > height + r * 2) return;
    const x = screenX(sys.x, sys.depth, t, 1.0, sys.phase);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sys.angle);
    ctx.globalAlpha = sys.alpha;
    ctx.strokeStyle = "rgba(145,167,181,.78)";
    ctx.lineWidth = .7;

    for (let i = 1; i <= sys.rings; i++) {
      const rr = r * (i / sys.rings);
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * .34, 0, 0, TAU);
      ctx.stroke();

      const phase = sys.phase + i * 1.77 + (reduceMotion ? 0 : t * .000012 / i);
      const px = Math.cos(phase) * rr;
      const py = Math.sin(phase) * rr * .34;
      ctx.fillStyle = "rgba(181,196,205,.76)";
      ctx.beginPath();
      ctx.arc(px, py, .65 + i * .12, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(211,221,227,.94)";
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.fill();

    // Tiny survey ticks rather than a full HUD grid.
    ctx.strokeStyle = "rgba(127,151,166,.38)";
    ctx.beginPath();
    ctx.moveTo(-r * 1.35, 0); ctx.lineTo(-r * 1.15, 0);
    ctx.moveTo(r * 1.15, 0); ctx.lineTo(r * 1.35, 0);
    ctx.moveTo(0, -r * .57); ctx.lineTo(0, -r * .45);
    ctx.stroke();
    ctx.restore();
  }

  function drawShip(ship, cameraY, t) {
    const y = screenY(ship.y, ship.depth, cameraY);
    if (y < -80 || y > height + 80) return;

    const travel = ((t * .001 * ship.speed + ship.phase) % (width + 520));
    const x = ship.direction > 0 ? -260 + travel : width + 260 - travel;
    const s = ship.scale * (width < 900 ? .72 : 1);

    ctx.save();
    ctx.translate(x, y);
    if (ship.direction < 0) ctx.scale(-1, 1);
    ctx.scale(s, s);
    ctx.globalAlpha = ship.alpha;
    ctx.fillStyle = "rgba(133,151,161,.90)";
    ctx.strokeStyle = "rgba(176,191,199,.58)";
    ctx.lineWidth = .8;

    ctx.beginPath();
    if (ship.type === 0) {
      // ANACONDA: long angular spear / wedge silhouette.
      ctx.moveTo(54, 0); ctx.lineTo(8, -10); ctx.lineTo(-38, -7); ctx.lineTo(-60, 0);
      ctx.lineTo(-38, 7); ctx.lineTo(8, 10); ctx.closePath();
    } else if (ship.type === 1) {
      // KRAIT: broad central diamond with clipped wings.
      ctx.moveTo(44, 0); ctx.lineTo(10, -15); ctx.lineTo(-28, -12); ctx.lineTo(-50, -3);
      ctx.lineTo(-31, 0); ctx.lineTo(-50, 3); ctx.lineTo(-28, 12); ctx.lineTo(10, 15); ctx.closePath();
    } else {
      // CASPIAN: compact double-chevron survey silhouette.
      ctx.moveTo(45, 0); ctx.lineTo(8, -12); ctx.lineTo(-12, -6); ctx.lineTo(-42, -11);
      ctx.lineTo(-27, 0); ctx.lineTo(-42, 11); ctx.lineTo(-12, 6); ctx.lineTo(8, 12); ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(121,151,169,.34)";
    ctx.beginPath();
    ctx.moveTo(-60, 0); ctx.lineTo(-150, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawStar(star, cameraY, t) {
    const y = screenY(star.y, star.depth, cameraY);
    if (y < -4 || y > height + 4) return;
    const x = star.x * width + Math.sin(t * .000016 + star.phase) * star.depth * 5;
    const twinkle = reduceMotion ? 1 : (.84 + Math.sin(t * .0013 + star.phase) * .16);
    const a = star.alpha * twinkle;
    const cool = star.cool > .82;
    const col = cool ? [160, 196, 219] : [197, 208, 214];

    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, star.size, 0, TAU);
    ctx.fill();

    if (star.size > 1.3 && a > .45) {
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a * .16})`;
      ctx.lineWidth = .5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      ctx.stroke();
    }
  }

  function render(now) {
    raf = 0;
    if (!visible) return;

    const dt = clamp(now - lastFrame, 0, 48);
    lastFrame = now;
    if (!reduceMotion) elapsed += dt;

    // Smooth camera: scroll moves through a huge world, autonomous drift never stops.
    smoothScroll += (targetScroll - smoothScroll) * (1 - Math.pow(.0008, dt / 1000));
    const autonomousTravel = reduceMotion ? 0 : elapsed * .0068;
    const cameraY = smoothScroll * .47 + autonomousTravel;
    const centerSeg = Math.floor(cameraY / SEGMENT);

    drawBackdrop();

    const segments = [];
    for (let i = centerSeg - SEGMENT_RADIUS; i <= centerSeg + SEGMENT_RADIUS; i++) {
      segments.push(getSegment(i));
    }
    pruneSegments(centerSeg);

    // Far-to-near painter order.
    for (const seg of segments) for (const neb of seg.nebulae) drawNebula(neb, cameraY, now);
    for (const seg of segments) for (const gal of seg.galaxies) drawGalaxy(gal, cameraY, now);
    for (const seg of segments) for (const cluster of seg.clusters) drawCluster(cluster, cameraY, now);
    for (const seg of segments) for (const sys of seg.systems) drawSystem(sys, cameraY, now);
    for (const seg of segments) for (const star of seg.stars) drawStar(star, cameraY, now);
    for (const seg of segments) for (const ship of seg.ships) drawShip(ship, cameraY, now);

    // Gentle edge darkening for readability, not a visible panel.
    const vignette = ctx.createRadialGradient(width * .5, height * .48, Math.min(width, height) * .2, width * .5, height * .48, Math.max(width, height) * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(.68, "rgba(0,2,5,.04)");
    vignette.addColorStop(1, "rgba(0,2,5,.33)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    raf = requestAnimationFrame(render);
  }

  function requestRender() {
    if (!raf && visible) raf = requestAnimationFrame(render);
  }

  window.addEventListener("scroll", () => {
    targetScroll = window.scrollY || 0;
    requestRender();
  }, { passive: true });

  window.addEventListener("resize", () => {
    resize();
    requestRender();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    lastFrame = performance.now();
    if (visible) requestRender();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  rebuildSprites();
  resize();
  requestRender();
})();
