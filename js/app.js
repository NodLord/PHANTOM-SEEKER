import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

window.__PHANTOM_GRID_MODULE_STARTED__ = true;

const viewport = document.getElementById("viewport");
const loadError = document.getElementById("loadError");
const datasetStats = document.getElementById("datasetStats");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080b10, 0.00055);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
camera.position.set(470, 380, 520);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.8;
controls.target.set(0, 0, 0);
controls.minDistance = 15;
controls.maxDistance = 1600;

const root = new THREE.Group();
scene.add(root);

const groups = {
  guardian: new THREE.Group(),
  brain: new THREE.Group(),
  shells: new THREE.Group(),
  measure: new THREE.Group(),
};
root.add(groups.guardian, groups.brain, groups.shells, groups.measure);

const markerMeshes = [];
const byName = new Map();
let systems = [];
let guardians = [];
let brains = [];

let brainMarkerScale = 1.0;
const brainVariantsEnabled = new Set([
  "Roseum Brain Tree","Gypseeum Brain Tree","Ostrinum Brain Tree","Viride Brain Tree",
  "Lividum Brain Tree","Aureum Brain Tree","Puniceum Brain Tree","Lindigoticum Brain Tree"
]);
function applyBrainFilters() {
  groups.brain.children.forEach(mesh => {
    const v = String(mesh.userData.variant || "");
    const matchesVariant = [...brainVariantsEnabled].some(name => v.includes(name));
    const withinRange = Number(mesh.userData.distanceFromHen || 0) <= Number(document.getElementById("rangeMax")?.value || 400);
    mesh.visible = matchesVariant && withinRange;
    mesh.scale.setScalar(brainMarkerScale);
  });
}


const COLORS = {
  hen: 0xf4a340,
  guardian: 0x66d9ff,
  brain: 0x77e29b,
  permit: 0xff5d68,
  shell150: 0x536474,
  shell300: 0x394958,
  shell400: 0x293642,
  axisX: 0xb97979,
  axisY: 0x7eb985,
  axisZ: 0x7f92c7,
};

function makeWireSphere(radius, color, opacity=0.18) {
  const geo = new THREE.SphereGeometry(radius, 28, 18);
  const wire = new THREE.WireframeGeometry(geo);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineSegments(wire, mat);
}

const permitFill = new THREE.Mesh(
  new THREE.SphereGeometry(100, 48, 28),
  new THREE.MeshBasicMaterial({ color: COLORS.permit, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false })
);
permitFill.name = "permit-fill";
groups.shells.add(permitFill);

const shell100 = makeWireSphere(100, COLORS.permit, 0.42);
shell100.name = "permit-shell";
groups.shells.add(shell100);

const shell150 = makeWireSphere(150, COLORS.shell150, 0.16);
shell150.name = "shell150";
groups.shells.add(shell150);

const shell300 = makeWireSphere(300, COLORS.shell300, 0.14);
shell300.name = "shell300";
groups.shells.add(shell300);

const shell400 = makeWireSphere(400, COLORS.shell400, 0.11);
shell400.name = "shell400";
shell400.visible = false;
groups.shells.add(shell400);

function addAxisLine(from, to, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 });
  root.add(new THREE.Line(geometry, material));
}
addAxisLine(new THREE.Vector3(-450,0,0), new THREE.Vector3(450,0,0), COLORS.axisX);
addAxisLine(new THREE.Vector3(0,-450,0), new THREE.Vector3(0,450,0), COLORS.axisY);
addAxisLine(new THREE.Vector3(0,0,-450), new THREE.Vector3(0,0,450), COLORS.axisZ);

const gridXZ = new THREE.GridHelper(800, 16, 0x31404f, 0x1c2732);
gridXZ.material.transparent = true;
gridXZ.material.opacity = 0.18;
root.add(gridXZ);

const henMesh = new THREE.Mesh(
  new THREE.SphereGeometry(5.2, 24, 18),
  new THREE.MeshBasicMaterial({ color: COLORS.hen })
);
henMesh.userData = {
  name: "HEN 2-333",
  category: "origin",
  distanceFromHen: 0,
  localX: 0, localY: 0, localZ: 0,
  x: -840.65625, y: -561.15625, z: 13361.8125,
  notes: "IC 4673 / HEN 2-333. Survey origin and center of the approximate permit-locked volume."
};
root.add(henMesh);
markerMeshes.push(henMesh);
byName.set("hen 2-333", henMesh);

const henHalo = new THREE.Mesh(
  new THREE.SphereGeometry(9, 18, 12),
  new THREE.MeshBasicMaterial({ color: COLORS.hen, transparent: true, opacity: 0.1, depthWrite: false })
);
root.add(henHalo);

function systemData(name) {
  return systems.find(s => s.name === name);
}

function addGuardian(site) {
  const s = systemData(site.system);
  if (!s) return;
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(3.1, 0),
    new THREE.MeshBasicMaterial({ color: COLORS.guardian })
  );
  mesh.position.set(s.localX, s.localY, s.localZ);
  mesh.userData = {
    ...s,
    category: "guardian",
    siteType: site.siteType,
    catalogStatus: site.catalogStatus,
    bodies: site.bodies,
    siteCount: site.siteCount,
    notes: site.notes,
    source: site.source
  };
  groups.guardian.add(mesh);
  markerMeshes.push(mesh);
  byName.set(s.name.toLowerCase(), mesh);
}

function addBrain(site) {
  const s = systemData(site.system);
  if (!s) return;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.brain })
  );
  mesh.position.set(s.localX, s.localY, s.localZ);
  mesh.userData = {
    ...s,
    category: "brain_tree",
    poiName: site.poiName,
    bodies: site.bodies,
    variant: site.variant,
    notes: site.notes,
    source: site.source,
    confidence: site.confidence
  };
  groups.brain.add(mesh);
  markerMeshes.push(mesh);
  byName.set(s.name.toLowerCase(), mesh);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function fmt(n, digits=2) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(digits) : "—";
}
function categoryLabel(d) {
  if (d.category === "origin") return "Survey origin";
  if (d.category === "guardian") return d.siteType || "Guardian system";
  if (d.category === "brain_tree") return "Brain Tree system";
  return d.category || "Unknown";
}
function showDetails(d) {
  document.getElementById("detailName").textContent = d.name || "Unknown";
  const rows = [
    ["TYPE", categoryLabel(d)],
    ["DISTANCE HEN", `${fmt(d.distanceFromHen, 2)} ly`],
    ["LOCAL XYZ", `${fmt(d.localX)} / ${fmt(d.localY)} / ${fmt(d.localZ)}`],
    ["GALACTIC XYZ", `${fmt(d.x, 5)} / ${fmt(d.y, 5)} / ${fmt(d.z, 5)}`],
  ];
  if (d.poiName) rows.push(["POI", d.poiName]);
  if (d.variant) rows.push(["VARIANT", d.variant]);
  if (d.siteCount) rows.push(["SITE RECORDS", d.siteCount]);
  if (d.bodies?.length) rows.push(["BODIES", d.bodies.join(", ")]);
  if (d.catalogStatus) rows.push(["STATUS", d.catalogStatus]);
  if (d.confidence) rows.push(["CONFIDENCE", d.confidence]);
  document.getElementById("detailList").innerHTML = rows.map(([k,v]) =>
    `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  let notes = d.notes || "";
  if (d.source) notes += `${notes ? "<br><br>" : ""}<a href="${esc(d.source)}" target="_blank" rel="noopener">Open source record ↗</a>`;
  document.getElementById("detailNotes").innerHTML = notes || "No additional notes.";
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let measureMode = false;
let measureA = null;
let measureB = null;

function markerVisible(mesh) {
  let p = mesh.parent;
  while (p && p !== scene) {
    if (p.visible === false) return false;
    p = p.parent;
  }
  return mesh.visible !== false;
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markerMeshes.filter(markerVisible), false);
  if (!hits.length) return;
  const obj = hits[0].object;
  showDetails(obj.userData);
  if (measureMode) selectMeasure(obj);
});

function clearMeasure() {
  measureA = measureB = null;
  while (groups.measure.children.length) {
    const obj = groups.measure.children.pop();
    obj.geometry?.dispose?.();
    obj.material?.dispose?.();
  }
  document.getElementById("measureStatus").textContent = measureMode
    ? "Select marker A."
    : "Select two markers to measure their true 3D separation.";
}

function selectMeasure(obj) {
  if (!measureA) {
    measureA = obj;
    document.getElementById("measureStatus").textContent = `A: ${obj.userData.name}. Select marker B.`;
    return;
  }
  measureB = obj;
  if (measureB === measureA) {
    document.getElementById("measureStatus").textContent = "Choose a different second marker.";
    measureB = null;
    return;
  }
  const a = measureA.position.clone();
  const b = measureB.position.clone();
  const dist = a.distanceTo(b);
  const geom = new THREE.BufferGeometry().setFromPoints([a,b]);
  const mat = new THREE.LineBasicMaterial({ color: 0xf4a340, transparent: true, opacity: 0.95 });
  groups.measure.add(new THREE.Line(geom, mat));
  document.getElementById("measureStatus").textContent =
    `${measureA.userData.name} ↔ ${measureB.userData.name}: ${dist.toFixed(2)} ly`;
  measureMode = false;
  document.getElementById("measureBtn").classList.remove("active");
}

document.getElementById("measureBtn").addEventListener("click", () => {
  measureMode = !measureMode;
  document.getElementById("measureBtn").classList.toggle("active", measureMode);
  clearMeasure();
  if (measureMode) document.getElementById("measureStatus").textContent = "Select marker A.";
});
document.getElementById("clearMeasureBtn").addEventListener("click", clearMeasure);

function setView(name) {
  const dist = 690;
  if (name === "top") camera.position.set(0, dist, 0.001);
  else if (name === "side") camera.position.set(dist, 0.001, 0);
  else if (name === "front") camera.position.set(0.001, 0, dist);
  else camera.position.set(470, 380, 520);
  controls.target.set(0,0,0);
  controls.update();
}
document.querySelectorAll("[data-view]").forEach(btn =>
  btn.addEventListener("click", () => setView(btn.dataset.view)));

document.getElementById("layerPermit").addEventListener("change", e => {
  permitFill.visible = e.target.checked;
  shell100.visible = e.target.checked;
});
document.getElementById("layer150").addEventListener("change", e => shell150.visible = e.target.checked);
document.getElementById("layer300").addEventListener("change", e => shell300.visible = e.target.checked);
document.getElementById("layer400").addEventListener("change", e => shell400.visible = e.target.checked);
document.getElementById("layerGuardian").addEventListener("change", e => groups.guardian.visible = e.target.checked);
document.getElementById("layerBrain").addEventListener("change", e => groups.brain.visible = e.target.checked);

const rangeMax = document.getElementById("rangeMax");
rangeMax.addEventListener("input", () => {
  const max = Number(rangeMax.value);
  document.getElementById("rangeValue").textContent = `${max} ly`;
  markerMeshes.forEach(mesh => {
    if (mesh === henMesh) return;
    mesh.visible = Number(mesh.userData.distanceFromHen) <= max;
  });
  applyBrainFilters();
});


document.querySelectorAll("[data-brain-variant]").forEach(cb => {
  cb.addEventListener("change", () => {
    const name = cb.dataset.brainVariant;
    if (cb.checked) brainVariantsEnabled.add(name);
    else brainVariantsEnabled.delete(name);
    applyBrainFilters();
  });
});
const brainSize = document.getElementById("brainSize");
if (brainSize) {
  brainSize.addEventListener("input", () => {
    brainMarkerScale = Number(brainSize.value);
    document.getElementById("brainSizeValue").textContent = `${brainMarkerScale.toFixed(2)}x`;
    applyBrainFilters();
  });
}

function findSystem() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("searchStatus");
  if (!q) { status.textContent = "Enter a system name."; return; }
  const exact = byName.get(q);
  const obj = exact || [...byName.entries()].find(([name]) => name.includes(q))?.[1];
  if (!obj) { status.textContent = "No marker found in the current bootstrap dataset."; return; }
  const target = obj.position.clone();
  controls.target.copy(target);
  const offset = camera.position.clone().sub(controls.target);
  if (offset.length() < 40) offset.set(45,35,55);
  camera.position.copy(target.clone().add(offset.normalize().multiplyScalar(90)));
  controls.update();
  showDetails(obj.userData);
  status.textContent = `Centered: ${obj.userData.name}`;
}
document.getElementById("searchBtn").addEventListener("click", findSystem);
document.getElementById("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") findSystem();
});

function resize() {
  const rect = viewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();


// ---------------------------------------------------------------------------
// PHANTOM GRID PUBLIC DATA BRIDGE V0.3.2
// Loads the same public Canonn Google Storage exports used by the expedition
// sync workflow. If the remote feed is unavailable, the tiny bundled bootstrap
// dataset is used instead so the map never becomes an empty black coffin.
// ---------------------------------------------------------------------------

const HEN_PUBLIC = {
  name: "HEN 2-333",
  x: -840.65625,
  y: -561.15625,
  z: 13361.8125,
};

const CANONN_PUBLIC = {
  ruins: "https://storage.googleapis.com/canonn-downloads/guardian_ruins.json",
  structures: "https://storage.googleapis.com/canonn-downloads/guardian_structures.json",
  brain: [
    ["2100201", "Roseum Brain Tree"],
    ["2100202", "Gypseeum Brain Tree"],
    ["2100203", "Ostrinum Brain Tree"],
    ["2100204", "Viride Brain Tree"],
    ["2100205", "Lividum Brain Tree"],
    ["2100206", "Aureum Brain Tree"],
    ["2100207", "Puniceum Brain Tree"],
    ["2100208", "Lindigoticum Brain Tree"],
  ],
};

const CANONN_MAP_URL = "https://map.canonn.tech/";
const PUBLIC_RADIUS_LY = 400;

function publicFnum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replaceAll(",", "").trim());
  return Number.isFinite(n) ? n : null;
}

function publicGetAny(obj, ...names) {
  if (!obj || typeof obj !== "object") return null;
  const normalized = new Map(
    Object.entries(obj).map(([k,v]) => [
      String(k).toLowerCase().replaceAll("_","").replaceAll(" ",""),
      v
    ])
  );
  for (const name of names) {
    const key = String(name).toLowerCase().replaceAll("_","").replaceAll(" ","");
    if (normalized.has(key)) return normalized.get(key);
  }
  return null;
}

function publicLocalCoords(x, y, z) {
  const dx = x - HEN_PUBLIC.x;
  const dy = y - HEN_PUBLIC.y;
  const dz = z - HEN_PUBLIC.z;
  const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
  return { dx, dy, dz, d };
}

function parseCsvRow(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

async function fetchTextStrict(url) {
  const r = await fetch(url, { cache: "no-store", mode: "cors" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function fetchJsonStrict(url) {
  const r = await fetch(url, { cache: "no-store", mode: "cors" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function aggregateGuardianPublic(rawGroups) {
  const grouped = new Map();

  for (const { kind, rows } of rawGroups) {
    for (const raw of rows) {
      const name = publicGetAny(raw, "System Name", "systemName", "system");
      const x = publicFnum(publicGetAny(raw, "x"));
      const y = publicFnum(publicGetAny(raw, "y"));
      const z = publicFnum(publicGetAny(raw, "z"));
      if (!name || x === null || y === null || z === null) continue;

      const { dx, dy, dz, d } = publicLocalCoords(x,y,z);
      if (d > PUBLIC_RADIUS_LY) continue;

      const rec = {
        system: String(name).trim(),
        x, y, z,
        localX: dx, localY: dy, localZ: dz,
        distanceFromHen: d,
        kind,
        body: publicGetAny(raw, "Body Name", "bodyName", "body") || null,
        siteType: publicGetAny(raw, "Site Type", "siteType", "type") || "Unknown",
        latitude: publicFnum(publicGetAny(raw, "latitude", "lat")),
        longitude: publicFnum(publicGetAny(raw, "longitude", "lon", "lng")),
        sourceId: publicGetAny(raw, "Site ID", "SiteId", "siteID", "id") || null,
      };

      if (!grouped.has(rec.system)) grouped.set(rec.system, []);
      grouped.get(rec.system).push(rec);
    }
  }

  const systemRows = [];
  const layerRows = [];

  for (const [name, occs] of grouped.entries()) {
    const first = occs[0];
    const kinds = new Set(occs.map(x => x.kind));
    const label = kinds.size > 1
      ? "Guardian Ruins + Structures"
      : (kinds.has("structures") ? "Guardian Structures" : "Guardian Ruins");

    const bodies = [...new Set(occs.map(x => x.body).filter(Boolean))].sort();
    const types = [...new Set(occs.map(x => x.siteType).filter(Boolean))].sort();

    systemRows.push({
      name,
      x:first.x, y:first.y, z:first.z,
      localX:first.localX, localY:first.localY, localZ:first.localZ,
      distanceFromHen:first.distanceFromHen,
      region:"Norma Expanse",
      category:"guardian",
      catalogStatus:"Canonn public export",
    });

    layerRows.push({
      system:name,
      siteType:label,
      siteCount:occs.length,
      bodies,
      types,
      occurrences:occs.map(x => ({
        kind:x.kind, body:x.body, type:x.siteType,
        latitude:x.latitude, longitude:x.longitude, sourceId:x.sourceId
      })),
      catalogStatus:"Canonn public export",
      source:CANONN_MAP_URL,
      notes:`${occs.length} Guardian site record(s) aggregated in this system.`,
    });
  }

  systemRows.sort((a,b) => a.distanceFromHen - b.distanceFromHen);
  layerRows.sort((a,b) => {
    const da = systemRows.find(s => s.name === a.system)?.distanceFromHen ?? 0;
    const db = systemRows.find(s => s.name === b.system)?.distanceFromHen ?? 0;
    return da-db;
  });

  return { systemRows, layerRows };
}

function aggregateBrainPublic(sourceTexts) {
  const grouped = new Map();

  for (const { id, variant, text } of sourceTexts) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const row = parseCsvRow(line);
      if (row.length < 4) continue;

      const name = String(row[0] || "").trim();
      const x = publicFnum(row[1]);
      const y = publicFnum(row[2]);
      const z = publicFnum(row[3]);
      if (!name || x === null || y === null || z === null) continue;

      const { dx, dy, dz, d } = publicLocalCoords(x,y,z);
      if (d > PUBLIC_RADIUS_LY) continue;

      const entryId = String(row[4] || id).trim() || id;
      const bodyId = String(row[5] || "").trim() || null;
      const rec = {
        system:name, x,y,z,
        localX:dx, localY:dy, localZ:dz,
        distanceFromHen:d,
        variant, entryId, bodyId, sourceFile:`${id}.csv`,
      };

      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(rec);
    }
  }

  const systemRows = [];
  const layerRows = [];

  for (const [name, rawOccs] of grouped.entries()) {
    const seen = new Set();
    const occs = [];
    for (const x of rawOccs) {
      const key = `${x.variant}|${x.entryId}|${x.bodyId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      occs.push(x);
    }

    const first = occs[0];
    const variants = [...new Set(occs.map(x => x.variant))].sort();
    const bodyIds = [...new Set(occs.map(x => x.bodyId).filter(Boolean))].sort();

    systemRows.push({
      name,
      x:first.x, y:first.y, z:first.z,
      localX:first.localX, localY:first.localY, localZ:first.localZ,
      distanceFromHen:first.distanceFromHen,
      region:"Norma Expanse",
      category:"brain_tree",
      catalogStatus:"Canonn public Codex export",
    });

    layerRows.push({
      system:name,
      siteCount:occs.length,
      bodyIds,
      variant:variants.join(", "),
      occurrences:occs.map(x => ({
        variant:x.variant, entryId:x.entryId, bodyId:x.bodyId, sourceFile:x.sourceFile
      })),
      distanceFromHen:first.distanceFromHen,
      confidence:"Canonn public export",
      source:CANONN_MAP_URL,
      notes:`${occs.length} Brain Tree Codex record(s) aggregated in this system.`,
    });
  }

  systemRows.sort((a,b) => a.distanceFromHen - b.distanceFromHen);
  layerRows.sort((a,b) => a.distanceFromHen - b.distanceFromHen);
  return { systemRows, layerRows };
}

async function loadCanonnPublicLive() {
  const [ruins, structures, ...brainTexts] = await Promise.all([
    fetchJsonStrict(CANONN_PUBLIC.ruins),
    fetchJsonStrict(CANONN_PUBLIC.structures),
    ...CANONN_PUBLIC.brain.map(([id, variant]) =>
      fetchTextStrict(`https://storage.googleapis.com/canonn-downloads/dumpr/Biology/${id}.csv`)
        .then(text => ({ id, variant, text }))
    ),
  ]);

  if (!Array.isArray(ruins) || !Array.isArray(structures)) {
    throw new Error("Unexpected Guardian export format");
  }

  const g = aggregateGuardianPublic([
    {kind:"ruins", rows:ruins},
    {kind:"structures", rows:structures},
  ]);
  const b = aggregateBrainPublic(brainTexts);

  if (!g.layerRows.length || !b.layerRows.length) {
    throw new Error("Canonn live feed returned an empty survey layer");
  }

  const origin = {
    name:HEN_PUBLIC.name,
    x:HEN_PUBLIC.x, y:HEN_PUBLIC.y, z:HEN_PUBLIC.z,
    localX:0, localY:0, localZ:0,
    distanceFromHen:0,
    region:"Norma Expanse",
    category:"origin",
  };

  const union = new Map([[origin.name, origin]]);
  for (const s of [...g.systemRows, ...b.systemRows]) {
    if (!union.has(s.name)) {
      union.set(s.name, s);
    } else {
      const existing = union.get(s.name);
      const cats = new Set(existing.categories || []);
      if (existing.category) cats.add(existing.category);
      cats.add(s.category);
      existing.categories = [...cats].sort();
    }
  }

  return {
    systems:[...union.values()].sort((a,b) => Number(a.distanceFromHen||0)-Number(b.distanceFromHen||0)),
    guardians:g.layerRows,
    brains:b.layerRows,
    sourceLabel:"Canonn live public feed",
  };
}

async function loadBundledFallback() {
  const [s,g,b] = await Promise.all([
    fetch("data/systems.json").then(r => { if (!r.ok) throw new Error("fallback systems"); return r.json(); }),
    fetch("data/guardian_sites.json").then(r => { if (!r.ok) throw new Error("fallback guardians"); return r.json(); }),
    fetch("data/brain_trees.json").then(r => { if (!r.ok) throw new Error("fallback brains"); return r.json(); }),
  ]);
  return { systems:s, guardians:g, brains:b, sourceLabel:"bundled emergency bootstrap" };
}

async function loadData() {
  try {
    let dataset;
    try {
      datasetStats.textContent = "CONTACTING CANONN PUBLIC DATA…";
      dataset = await loadCanonnPublicLive();
    } catch (liveErr) {
      console.warn("Canonn live feed unavailable, using bundled bootstrap.", liveErr);
      dataset = await loadBundledFallback();
    }

    systems = dataset.systems;
    guardians = dataset.guardians;
    brains = dataset.brains;

    guardians.forEach(addGuardian);
    brains.forEach(addBrain);
    applyBrainFilters();

    const btRecords = brains.reduce((n,x) => n + Number(x.siteCount || 1), 0);
    const gRecords = guardians.reduce((n,x) => n + Number(x.siteCount || 1), 0);

    datasetStats.textContent =
      `${guardians.length} Guardian systems / ${gRecords} records · ` +
      `${brains.length} Brain Tree systems / ${btRecords} records · ` +
      `${dataset.sourceLabel} · permit radius ~100 ly`;

    if (dataset.sourceLabel.includes("bootstrap")) {
      const warning = document.querySelector(".warning");
      if (warning) {
        warning.innerHTML =
          "<strong>DATA FALLBACK ACTIVE</strong>" +
          "The Canonn public feed could not be loaded. Phantom Grid is displaying the small bundled bootstrap dataset until the upstream link is available again.";
      }
    }
  } catch (err) {
    console.error(err);
    loadError.hidden = false;
    datasetStats.textContent = "DATA LOAD FAILED";
  }
}
await loadData();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
