import * as THREE from "three";

if (!window.__PHANTOM_GRID_AXIS_LABELS_V046__) {
  window.__PHANTOM_GRID_AXIS_LABELS_V046__ = true;

  const originalAdd = THREE.Object3D.prototype.add;

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function makeAxisSprite(title, sign, accent) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 180;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark tactical plate
    roundedRect(ctx, 10, 10, 620, 160, 14);
    ctx.fillStyle = "rgba(5, 9, 13, 0.94)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(91, 113, 130, 0.88)";
    ctx.stroke();

    // Axis accent
    ctx.fillStyle = accent;
    ctx.fillRect(28, 30, 8, 120);

    // Direction name
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eef3f6";
    ctx.font = "900 48px Segoe UI, Arial, sans-serif";
    ctx.fillText(title, 58, 70);

    // Axis sign
    ctx.fillStyle = accent;
    ctx.font = "800 28px Segoe UI, Arial, sans-serif";
    ctx.fillText(sign, 58, 126);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(92, 26, 1);
    sprite.renderOrder = 100000;
    sprite.frustumCulled = false;
    sprite.userData.phantomAxisLabel = true;
    return sprite;
  }

  function installAxisLabels(scene) {
    if (!scene?.isScene || scene.userData.__phantomAxisLabelsV046) return;

    // Mark before scene.add() below so our own addition cannot recurse.
    scene.userData.__phantomAxisLabelsV046 = true;

    const group = new THREE.Group();
    group.name = "PHANTOM_GRID_AXIS_LABELS_V046";
    group.renderOrder = 100000;

    // app.js draws the three local axes from -450 to +450.
    // Labels sit directly on those endpoints.
    const R = 450;

    const defs = [
      { title: "NORTH", sign: "+Z", color: "#91a9ec", pos: [0, 0,  R] },
      { title: "SOUTH", sign: "−Z", color: "#91a9ec", pos: [0, 0, -R] },
      { title: "EAST",  sign: "+X", color: "#e08b8b", pos: [ R, 0, 0] },
      { title: "WEST",  sign: "−X", color: "#e08b8b", pos: [-R, 0, 0] },
      { title: "UP",    sign: "+Y", color: "#8fda9a", pos: [0,  R, 0] },
      { title: "DOWN",  sign: "−Y", color: "#8fda9a", pos: [0, -R, 0] },
    ];

    for (const def of defs) {
      const sprite = makeAxisSprite(def.title, def.sign, def.color);
      sprite.position.set(...def.pos);
      group.add(sprite);
    }

    originalAdd.call(scene, group);
    console.info("[PHANTOM GRID] Axis labels V0.4.6 installed:", group.children.length);
  }

  // app.js definitely calls scene.add(root). Hooking Object3D.add therefore
  // gives us the actual Scene object before the first animation frame.
  THREE.Object3D.prototype.add = function(...objects) {
    const result = originalAdd.apply(this, objects);

    if (this?.isScene) {
      installAxisLabels(this);

      // Once we have the real Scene, restore Three.js immediately.
      THREE.Object3D.prototype.add = originalAdd;
    }

    return result;
  };
}
