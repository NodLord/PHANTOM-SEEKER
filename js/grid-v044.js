import * as THREE from "three";

const viewportWrap = document.querySelector(".viewport-wrap");
if (!viewportWrap) throw new Error("Phantom Grid viewport not found.");

const oldOverlay = viewportWrap.querySelector(".grid-axis-overlay");
oldOverlay?.remove();

const overlay = document.createElement("div");
overlay.className = "grid-axis-overlay";
overlay.setAttribute("aria-hidden", "true");
viewportWrap.appendChild(overlay);

// Exact endpoints of the axis lines drawn in app.js.
const AXIS_R = 450;

const defs = [
  { text:"NORTH", sign:"+Z", cls:"z", point:new THREE.Vector3(0,0, AXIS_R) },
  { text:"SOUTH", sign:"−Z", cls:"z", point:new THREE.Vector3(0,0,-AXIS_R) },
  { text:"EAST",  sign:"+X", cls:"x", point:new THREE.Vector3( AXIS_R,0,0) },
  { text:"WEST",  sign:"−X", cls:"x", point:new THREE.Vector3(-AXIS_R,0,0) },
  { text:"UP",    sign:"+Y", cls:"y", point:new THREE.Vector3(0, AXIS_R,0) },
  { text:"DOWN",  sign:"−Y", cls:"y", point:new THREE.Vector3(0,-AXIS_R,0) },
];

const nodes = defs.map(def => {
  const el = document.createElement("div");
  el.className = `grid-axis-label axis-${def.cls}`;
  el.innerHTML = `<strong>${def.text}</strong><span>${def.sign}</span>`;
  overlay.appendChild(el);
  return { ...def, el };
});

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function updateAxisLabels() {
  const camera = window.__PHANTOM_GRID_CAMERA__;
  const canvas = window.__PHANTOM_GRID_CANVAS__;

  if (!camera || !canvas || !canvas.isConnected) {
    requestAnimationFrame(updateAxisLabels);
    return;
  }

  const wrapRect = viewportWrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();

  for (const node of nodes) {
    projected.copy(node.point).project(camera);

    const rawX = (projected.x * .5 + .5) * canvasRect.width + (canvasRect.left - wrapRect.left);
    const rawY = (-projected.y * .5 + .5) * canvasRect.height + (canvasRect.top - wrapRect.top);

    // Axis ends can leave the viewport when zooming. Keep the label pinned
    // to the corresponding screen edge so orientation never disappears.
    const marginX = 58;
    const marginY = 40;
    const x = clamp(rawX, marginX, wrapRect.width - marginX);
    const y = clamp(rawY, marginY, wrapRect.height - marginY);

    node.el.style.left = `${x}px`;
    node.el.style.top = `${y}px`;

    // Endpoints behind the camera are still useful orientation cues, but dimmed.
    const inFront = projected.z >= -1 && projected.z <= 1;
    node.el.classList.toggle("behind-axis", !inFront);
  }

  requestAnimationFrame(updateAxisLabels);
}

updateAxisLabels();
