import * as THREE from "three";

const viewportWrap = document.querySelector(".viewport-wrap");
if (!viewportWrap) throw new Error("Phantom Grid viewport not found.");

const overlay = document.createElement("div");
overlay.className = "grid-axis-overlay";
overlay.setAttribute("aria-hidden", "true");
viewportWrap.appendChild(overlay);

const defs = [
  { key:"north", text:"NORTH", sign:"+Z", color:"z", point:new THREE.Vector3(0,0,450) },
  { key:"south", text:"SOUTH", sign:"−Z", color:"z", point:new THREE.Vector3(0,0,-450) },
  { key:"east",  text:"EAST",  sign:"+X", color:"x", point:new THREE.Vector3(450,0,0) },
  { key:"west",  text:"WEST",  sign:"−X", color:"x", point:new THREE.Vector3(-450,0,0) },
  { key:"up",    text:"UP",    sign:"+Y", color:"y", point:new THREE.Vector3(0,450,0) },
  { key:"down",  text:"DOWN",  sign:"−Y", color:"y", point:new THREE.Vector3(0,-450,0) },
];

const nodes = defs.map(def => {
  const el = document.createElement("div");
  el.className = `grid-axis-label axis-${def.color}`;
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

    // Keep the label visible close to the axis endpoint even when the endpoint
    // falls just outside the viewport due to zoom.
    const x = clamp(rawX, 42, wrapRect.width - 42);
    const y = clamp(rawY, 34, wrapRect.height - 34);

    node.el.style.left = `${x}px`;
    node.el.style.top = `${y}px`;

    const visible = projected.z >= -1.3 && projected.z <= 1.3;
    node.el.style.opacity = visible ? "1" : ".38";
  }

  requestAnimationFrame(updateAxisLabels);
}

updateAxisLabels();
