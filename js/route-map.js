import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MAP_SCALE = 1 / 1000; // 1 world unit = 1000 ly
const SAG_A = { x: 25.21875, y: -20.90625, z: 25899.96875 };
const SOL = { x: 0, y: 0, z: 0 };

const shell = document.getElementById("route-map-shell");
const wrap = document.getElementById("route-map-canvas-wrap");
const canvas = document.getElementById("expedition-route-map");
const labelsLayer = document.getElementById("route-label-layer");
const leaderSvg = document.getElementById("route-label-lines");
const loading = document.getElementById("route-map-loading");
const statusEl = document.getElementById("route-map-status");
const countEl = document.getElementById("route-map-count");
const distanceEl = document.getElementById("route-map-distance");
const detailEl = document.getElementById("route-map-detail");
const compassEl = document.getElementById("route-3d-compass");
const compassRoseEl = document.getElementById("route-3d-compass-rose");

if (!shell || !wrap || !canvas) {
  throw new Error("Route map DOM is incomplete.");
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const THREE_COLORS = {
  chapter1: 0xcdd8df,
  crossing: 0xf2a13d,
  chapter2: 0x6fd8fb,
  epilogue: 0xf2f5f7,
};

const CSS_COLORS = {
  chapter1: "#cdd8df",
  crossing: "#f2a13d",
  chapter2: "#6fd8fb",
  epilogue: "#f2f5f7",
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x05080c, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05080c, 0.018);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 300);
camera.up.set(0, 1, 0);

const controls = new OrbitControls(camera, canvas);

// Top-map navigation only:
// - LEFT MOUSE = pan
// - MOUSE WHEEL = zoom
// - rotation completely disabled
// The galactic disk therefore always remains in the canonical TOP X/Z view.
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = true;
controls.enableRotate = false;
controls.enableZoom = true;
controls.zoomSpeed = 0.95;
controls.panSpeed = 0.85;
controls.minDistance = 2;
controls.maxDistance = 130;
controls.screenSpacePanning = true;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

const routeGroup = new THREE.Group();
const galaxyGroup = new THREE.Group();
const referenceGroup = new THREE.Group();
scene.add(galaxyGroup, referenceGroup, routeGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const markers = [];
const labelRecords = [];
let routeData = [];
let routePoints = [];
let routeCenter = new THREE.Vector3();
let routeMaxDim = 30;
let selectedRecord = null;
let pulse = null;
let cumulative = [];
let routeTotalLy = 0;
let raf = 0;

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------
function distLy(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function toWorld(p) {
  return new THREE.Vector3(p.x * MAP_SCALE, p.y * MAP_SCALE, p.z * MAP_SCALE);
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-7);
  const v = Math.max(rand(), 1e-7);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fmt(n, digits = 2) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

// ------------------------------------------------------------
// Coordinate resolving: local cache first, then Spansh, then EDSM.
// Only missing coordinates are queried.
// ------------------------------------------------------------
async function resolveViaSpansh(name) {
  const url = `https://spansh.co.uk/api/systems/field_values/system_names?q=${encodeURIComponent(name)}`;
  const response = await fetch(url, { mode: "cors", cache: "force-cache" });
  if (!response.ok) throw new Error(`Spansh ${response.status}`);
  const data = await response.json();
  const hit = (data.min_max || []).find(x => x.name === name);
  if (!hit) throw new Error(`Spansh exact match missing for ${name}`);
  return { x:Number(hit.x), y:Number(hit.y), z:Number(hit.z), id64:hit.id64, source:"Spansh" };
}

async function resolveViaEdsm(name) {
  const url = `https://www.edsm.net/api-v1/system?systemName=${encodeURIComponent(name)}&showCoordinates=1`;
  const response = await fetch(url, { mode: "cors", cache: "force-cache" });
  if (!response.ok) throw new Error(`EDSM ${response.status}`);
  const data = await response.json();
  if (!data?.coords) throw new Error(`EDSM coordinates missing for ${name}`);
  return {
    x:Number(data.coords.x),
    y:Number(data.coords.y),
    z:Number(data.coords.z),
    source:"EDSM live",
  };
}

async function resolveMissingCoordinates(rows) {
  const cached = JSON.parse(localStorage.getItem("phantomSeekerRouteCoordsV035") || "{}");
  const missing = rows.filter(r => !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z));

  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    statusEl.lastChild.textContent = ` RESOLVING ${row.id} // ${i+1}/${missing.length}`;

    const local = cached[row.system];
    if (local && [local.x,local.y,local.z].every(Number.isFinite)) {
      Object.assign(row, local, { coordinateSource:"Local coordinate cache" });
      continue;
    }

    let resolved = null;
    try {
      resolved = await resolveViaSpansh(row.system);
    } catch (spanshErr) {
      console.warn("Spansh lookup failed:", row.system, spanshErr);
      try {
        resolved = await resolveViaEdsm(row.system);
      } catch (edsmErr) {
        console.warn("EDSM fallback failed:", row.system, edsmErr);
      }
    }

    if (resolved && [resolved.x,resolved.y,resolved.z].every(Number.isFinite)) {
      row.x = resolved.x;
      row.y = resolved.y;
      row.z = resolved.z;
      row.id64 = resolved.id64 || row.id64;
      row.coordinateSource = resolved.source;
      cached[row.system] = { x:row.x, y:row.y, z:row.z, id64:row.id64 || null };
      localStorage.setItem("phantomSeekerRouteCoordsV035", JSON.stringify(cached));
    }
  }

  return rows;
}

// ------------------------------------------------------------
// Galaxy field, deliberately stylised. Route geometry is not.
// ------------------------------------------------------------
function buildGalaxyField() {
  const rand = seededRandom(3090);
  const count = 9000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const centerX = SAG_A.x * MAP_SCALE;
  const centerY = SAG_A.y * MAP_SCALE;
  const centerZ = SAG_A.z * MAP_SCALE;

  for (let i = 0; i < count; i++) {
    const arm = i % 4;
    const radiusLy = 700 + Math.pow(rand(), .74) * 33000;
    const baseAngle = arm * Math.PI / 2;
    const angle = baseAngle + radiusLy * 0.00019 + gaussian(rand) * 0.18;
    const thickness = 120 + radiusLy * 0.011;

    const x = centerX + Math.cos(angle) * radiusLy * MAP_SCALE + gaussian(rand) * 0.18;
    const z = centerZ + Math.sin(angle) * radiusLy * MAP_SCALE + gaussian(rand) * 0.18;
    const y = centerY + gaussian(rand) * thickness * MAP_SCALE;

    positions[i*3] = x;
    positions[i*3+1] = y;
    positions[i*3+2] = z;

    const core = 1 - Math.min(radiusLy / 33000, 1);
    const b = 0.44 + core * 0.24 + rand() * 0.12;
    colors[i*3] = b * 0.78;
    colors[i*3+1] = b * 0.90;
    colors[i*3+2] = b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: .022,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: .42,
    depthWrite: false,
  });

  galaxyGroup.add(new THREE.Points(geometry, material));

  // Galactic plane
  const grid = new THREE.GridHelper(70, 28, 0x243542, 0x18242d);
  grid.position.set(centerX, 0, centerZ);
  grid.material.opacity = .16;
  grid.material.transparent = true;
  referenceGroup.add(grid);

  // Context markers
  addReferenceMarker("SOL", SOL, 0x8193a0);
  addReferenceMarker("GALACTIC CENTER", SAG_A, 0x9a865f);
}

function addReferenceMarker(name, p, color) {
  const world = toWorld(p);
  const geometry = new THREE.SphereGeometry(.055, 12, 12);
  const material = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.65 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(world);
  referenceGroup.add(mesh);
}

// ------------------------------------------------------------
// Route geometry
// ------------------------------------------------------------
function buildRoute(rows) {
  routeData = rows.filter(r => [r.x,r.y,r.z].every(Number.isFinite));

  countEl.textContent = `WAYPOINTS ${routeData.length}/14`;

  // Bounds
  const box = new THREE.Box3();
  routeData.forEach(r => box.expandByPoint(toWorld(r)));
  box.getCenter(routeCenter);
  const size = new THREE.Vector3();
  box.getSize(size);
  routeMaxDim = Math.max(size.x, size.y * 4, size.z, 8);

  routePoints = routeData.map(toWorld);

  // Galactic Y=0 reference through route volume
  const planeGeom = new THREE.PlaneGeometry(routeMaxDim * 1.7, routeMaxDim * 1.7);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x152631,
    transparent:true,
    opacity:.055,
    side:THREE.DoubleSide,
    depthWrite:false,
  });
  const plane = new THREE.Mesh(planeGeom, planeMat);
  plane.rotation.x = -Math.PI/2;
  plane.position.set(routeCenter.x, 0, routeCenter.z);
  referenceGroup.add(plane);

  // Leg lines
  routeTotalLy = 0;
  cumulative = [0];

  for (let i = 0; i < routeData.length - 1; i++) {
    const a = routeData[i];
    const b = routeData[i+1];
    const leg = distLy(a,b);
    routeTotalLy += leg;
    cumulative.push(routeTotalLy);

    const geometry = new THREE.BufferGeometry().setFromPoints([toWorld(a), toWorld(b)]);
    const phase = b.chapter === "crossing"
      ? "crossing"
      : (b.chapter === "chapter2" ? "chapter2" : (b.chapter === "epilogue" ? "epilogue" : "chapter1"));
    const material = new THREE.LineBasicMaterial({
      color: THREE_COLORS[phase],
      transparent:true,
      opacity:.78,
    });
    routeGroup.add(new THREE.Line(geometry, material));
  }

  distanceEl.textContent = `ROUTE ${Math.round(routeTotalLy).toLocaleString("en-US")} LY`;

  // Markers + labels
  routeData.forEach((row, i) => addWaypoint(row, i));

  // Travelling pulse
  const pulseGeom = new THREE.SphereGeometry(.095, 14, 14);
  const pulseMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.92 });
  pulse = new THREE.Mesh(pulseGeom, pulseMat);
  routeGroup.add(pulse);

  fitRoute();
}

function addWaypoint(row, index) {
  const color = THREE_COLORS[row.chapter] ?? 0xffffff;
  const geom = new THREE.SphereGeometry(.105, 18, 18);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(toWorld(row));
  mesh.userData = { row, index, baseColor:color };
  routeGroup.add(mesh);
  markers.push(mesh);

  const ringGeom = new THREE.RingGeometry(.15, .19, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color, side:THREE.DoubleSide, transparent:true, opacity:.32, depthWrite:false
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.copy(mesh.position);
  ring.lookAt(camera.position);
  ring.userData.followCamera = true;
  routeGroup.add(ring);
  mesh.userData.ring = ring;

  const label = document.createElement("button");
  label.type = "button";
  label.className = `route-waypoint-label ${row.chapter}`;
  label.innerHTML = `<span class="wp-code">${escapeHtml(row.id)}</span><span>${escapeHtml(row.nickname)}</span>`;
  label.title = row.system;
  label.addEventListener("click", (ev) => {
    ev.stopPropagation();
    selectWaypoint(mesh);
  });
  labelsLayer.appendChild(label);

  const line = document.createElementNS("http://www.w3.org/2000/svg","line");
  leaderSvg.appendChild(line);

  labelRecords.push({
    row,
    mesh,
    label,
    line,
    offset: Array.isArray(row.labelOffset) ? row.labelOffset : [16,-16],
  });
}

function selectWaypoint(mesh) {
  if (!mesh) return;

  markers.forEach(m => {
    m.scale.setScalar(1);
    m.material.color.setHex(m.userData.baseColor);
    if (m.userData.ring) m.userData.ring.material.opacity = .32;
  });
  labelRecords.forEach(x => x.label.classList.remove("selected"));

  mesh.scale.setScalar(1.55);
  mesh.material.color.setHex(0xffffff);
  if (mesh.userData.ring) mesh.userData.ring.material.opacity = .78;

  const row = mesh.userData.row;
  selectedRecord = row;

  const rec = labelRecords.find(x => x.row === row);
  if (rec) rec.label.classList.add("selected");

  const idx = mesh.userData.index;
  const previous = idx > 0 ? routeData[idx-1] : null;
  const leg = previous ? distLy(previous,row) : 0;

  detailEl.innerHTML = `
    <div class="detail-kicker">TACTICAL ROUTE DATA // ${escapeHtml(row.id)}</div>
    <h3>${escapeHtml(row.nickname)}</h3>
    <h4>${escapeHtml(row.system)}</h4>
    <dl>
      <div><dt>GALACTIC X</dt><dd>${fmt(row.x,5)}</dd></div>
      <div><dt>GALACTIC Y</dt><dd>${fmt(row.y,5)}</dd></div>
      <div><dt>GALACTIC Z</dt><dd>${fmt(row.z,5)}</dd></div>
      <div><dt>LEG DISTANCE</dt><dd>${previous ? `${fmt(leg,1)} ly` : "Expedition origin"}</dd></div>
      <div><dt>COORD SOURCE</dt><dd>${escapeHtml(row.coordinateSource || "Public catalogue")}</dd></div>
    </dl>
    <a class="route-map-briefing" href="#${escapeHtml(row.anchor)}">OPEN WAYPOINT BRIEFING</a>
  `;

  // Keep the map STRICTLY in TOP X/Z orientation when selecting a waypoint.
  // Move camera and target by the same delta instead of only moving the target.
  // This behaves like a 2D pan and cannot tilt the galactic disk.
  const previousTarget = controls.target.clone();
  const nextTarget = mesh.position.clone();
  const delta = nextTarget.clone().sub(previousTarget);

  camera.position.add(delta);
  controls.target.copy(nextTarget);

  // Re-lock canonical top orientation.
  camera.position.x = controls.target.x;
  camera.position.z = controls.target.z;
  camera.up.set(0,0,1);
  camera.lookAt(controls.target);
  controls.update();
}

function fitRoute() {
  const distance = routeMaxDim * 1.06 + 8;
  controls.target.copy(routeCenter);

  // Canonical top X/Z projection only.
  // +Z points toward the top of the screen.
  camera.up.set(0,0,1);
  camera.position.set(routeCenter.x, routeCenter.y - distance, routeCenter.z);
  camera.lookAt(controls.target);
  controls.update();
}

// ------------------------------------------------------------
// Screen-space labels and leader lines
// ------------------------------------------------------------
function updateLabels() {
  const rect = wrap.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const projected = new THREE.Vector3();

  for (const rec of labelRecords) {
    projected.copy(rec.mesh.position).project(camera);

    const behind = projected.z < -1 || projected.z > 1;
    if (behind) {
      rec.label.style.display = "none";
      rec.line.style.display = "none";
      continue;
    }

    rec.label.style.display = "";
    rec.line.style.display = "";

    const markerX = (projected.x * .5 + .5) * w;
    const markerY = (-projected.y * .5 + .5) * h;

    const lx = markerX + rec.offset[0];
    const ly = markerY + rec.offset[1];

    rec.label.style.left = `${lx}px`;
    rec.label.style.top = `${ly}px`;

    rec.line.setAttribute("x1", markerX.toFixed(1));
    rec.line.setAttribute("y1", markerY.toFixed(1));
    rec.line.setAttribute("x2", lx.toFixed(1));
    rec.line.setAttribute("y2", ly.toFixed(1));

    const ring = rec.mesh.userData.ring;
    if (ring) ring.lookAt(camera.position);
  }
}


// ------------------------------------------------------------
// Dynamic 3D orientation compass
// ------------------------------------------------------------
function updateCompass() {
  if (!compassEl || !compassRoseEl) return;

  // Camera basis in world space.
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward).normalize();

  const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).normalize();

  // World directions used by Elite's galactic map convention:
  // N/S = +Z/-Z, E/W = +X/-X, UP/DOWN = +Y/-Y.
  const dirs = {
    n: new THREE.Vector3(0,0,1),
    s: new THREE.Vector3(0,0,-1),
    e: new THREE.Vector3(1,0,0),
    w: new THREE.Vector3(-1,0,0),
  };

  for (const [key, dir] of Object.entries(dirs)) {
    const node = compassEl.querySelector(`[data-compass-dir="${key}"]`);
    if (!node) continue;

    // Project world direction into camera screen-space.
    const sx = dir.dot(right);
    const sy = dir.dot(up);
    const depth = dir.dot(forward);

    const radius = 30;
    node.style.transform = `translate(${sx * radius}px, ${-sy * radius}px) translate(-50%, -50%)`;
    node.style.opacity = String(0.38 + 0.62 * ((depth + 1) * 0.5));
    node.style.zIndex = depth > 0 ? "3" : "1";
  }
  compassRoseEl.style.transform = "none";
}

// ------------------------------------------------------------
// Pointer picking
// ------------------------------------------------------------
function pointerToNdc(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

canvas.addEventListener("pointermove", (event) => {
  pointerToNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(markers, false)[0];
  canvas.style.cursor = hit ? "pointer" : "grab";
});

canvas.addEventListener("pointerdown", () => {
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointerup", (event) => {
  canvas.style.cursor = "grab";
  pointerToNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(markers, false)[0];
  if (hit) selectWaypoint(hit.object);
});

// ------------------------------------------------------------
// Camera toolbar
// ------------------------------------------------------------
document.querySelectorAll("[data-route-view]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-route-view]").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    fitRoute();
  });
});

// ------------------------------------------------------------
// Permanent TOP X/Z orientation lock
// ------------------------------------------------------------
function enforceTopView() {
  // Preserve current zoom distance along the Y axis.
  const dy = camera.position.y - controls.target.y;
  const sign = dy === 0 ? -1 : Math.sign(dy);
  const distance = Math.max(Math.abs(dy), controls.minDistance || 2);

  // Camera and target must share X/Z in a true top-down projection.
  camera.position.x = controls.target.x;
  camera.position.z = controls.target.z;
  camera.position.y = controls.target.y + sign * distance;

  camera.up.set(0,0,1);
  camera.lookAt(controls.target);
}

// ------------------------------------------------------------
// Resize + render
// ------------------------------------------------------------
function resize() {
  const rect = wrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  leaderSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(wrap);

function updatePulse(time) {
  if (!pulse || routeData.length < 2) return;
  if (prefersReducedMotion) {
    pulse.visible = false;
    return;
  }

  pulse.visible = true;
  const cycleMs = 28000;
  const traveled = ((time % cycleMs) / cycleMs) * routeTotalLy;

  let legIndex = 0;
  while (legIndex < cumulative.length - 1 && cumulative[legIndex+1] < traveled) legIndex++;

  const startD = cumulative[legIndex];
  const endD = cumulative[Math.min(legIndex+1, cumulative.length-1)];
  const t = endD > startD ? (traveled - startD) / (endD - startD) : 0;

  const a = routePoints[legIndex];
  const b = routePoints[Math.min(legIndex+1, routePoints.length-1)];
  pulse.position.lerpVectors(a,b,THREE.MathUtils.clamp(t,0,1));
}

function render(time = 0) {
  raf = requestAnimationFrame(render);
  controls.update();
  enforceTopView();
  updatePulse(time);
  updateLabels();
  updateCompass();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
async function init() {
  try {
    buildGalaxyField();

    const response = await fetch("data/expedition_route.json", { cache:"no-store" });
    if (!response.ok) throw new Error(`Route data HTTP ${response.status}`);
    let rows = await response.json();

    rows = await resolveMissingCoordinates(rows);

    const unresolved = rows.filter(r => ![r.x,r.y,r.z].every(Number.isFinite));
    if (unresolved.length) {
      statusEl.classList.add("warning");
      statusEl.lastChild.textContent = ` ${14-unresolved.length}/14 COORDINATES RESOLVED`;
      loading.innerHTML = `
        <strong>ROUTE DATA INCOMPLETE</strong>
        <span>Could not resolve: ${unresolved.map(x => escapeHtml(x.system)).join(", ")}.<br>
        Check the public Spansh / EDSM connection and reload.</span>`;
      loading.classList.remove("hidden");
    } else {
      statusEl.classList.add("ready");
      statusEl.lastChild.textContent = " 14/14 COORDINATES RESOLVED";
      loading.classList.add("hidden");
    }

    buildRoute(rows);
    resize();
    render();

    // Give the first waypoint a useful default selection.
    document.querySelector('[data-route-view="top"]')?.classList.add("active");

    if (markers.length) selectWaypoint(markers[0]);

  } catch (error) {
    console.error("Phantom Seeker route map failed:", error);
    statusEl.classList.add("warning");
    statusEl.lastChild.textContent = " ROUTE MAP ERROR";
    loading.innerHTML = `<strong>NAVIGATION DATA FAILURE</strong><span>${escapeHtml(error.message || String(error))}</span>`;
  }
}

init();

window.addEventListener("pagehide", () => {
  if (raf) cancelAnimationFrame(raf);
  resizeObserver.disconnect();
  controls.dispose();
  renderer.dispose();
}, { once:true });
