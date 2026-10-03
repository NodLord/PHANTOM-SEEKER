import * as THREE from "three";

if (!window.__PHANTOM_GRID_AXIS_SPRITES_V045__) {
  window.__PHANTOM_GRID_AXIS_SPRITES_V045__ = true;

  const originalRender = THREE.WebGLRenderer.prototype.render;

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function makeAxisSprite(title, sign, accent) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 220;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Panel
    roundedRect(ctx, 18, 18, 732, 184, 18);
    ctx.fillStyle = "rgba(5, 9, 13, 0.90)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(88, 110, 128, 0.82)";
    ctx.stroke();

    // Accent rule
    ctx.fillStyle = accent;
    ctx.fillRect(42, 42, 10, 136);

    // Main label
    ctx.fillStyle = "#eef3f6";
    ctx.font = "900 58px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 82, 91);

    // Axis sign
    ctx.fillStyle = accent;
    ctx.font = "800 34px Segoe UI, Arial, sans-serif";
    ctx.fillText(sign, 82, 151);

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
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(118, 33.8, 1);
    sprite.renderOrder = 9999;
    sprite.userData.phantomAxisLabel = true;
    return sprite;
  }

  function installAxisLabels(scene) {
    if (!scene || scene.userData.__phantomAxisLabelsV045) return;

    scene.userData.__phantomAxisLabelsV045 = true;

    const group = new THREE.Group();
    group.name = "PHANTOM_GRID_AXIS_LABELS_V045";
    group.renderOrder = 9999;

    // The visible axes in app.js run from -450 to +450.
    // Put labels just beyond those exact endpoints.
    const R = 478;

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

    scene.add(group);
  }

  THREE.WebGLRenderer.prototype.render = function(scene, camera) {
    installAxisLabels(scene);
    return originalRender.call(this, scene, camera);
  };
}
