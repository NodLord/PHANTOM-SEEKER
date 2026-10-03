import * as THREE from "three";

if (!window.__PHANTOM_GRID_AXIS_LABELS_V048__) {
  window.__PHANTOM_GRID_AXIS_LABELS_V048__ = true;

  const originalAdd = THREE.Object3D.prototype.add;

  function makeTextSprite(text, color = "#d6dde3", options = {}) {
    const {
      width = 512,
      height = 128,
      fontSize = 46,
      scaleX = 56,
      scaleY = 14,
      shadowBlur = 8,
      glow = false,
      forceTop = false,
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${fontSize}px Segoe UI, Arial, sans-serif`;

    if (glow) {
      // Wide cyan halo baked into the transparent texture.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.shadowColor = color;
      ctx.shadowBlur = 58;
      ctx.fillStyle = color;
      ctx.fillText(text, width / 2, height / 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.86;
      ctx.shadowColor = color;
      ctx.shadowBlur = 36;
      ctx.fillStyle = color;
      ctx.fillText(text, width / 2, height / 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.68;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.fillText(text, width / 2, height / 2);
      ctx.restore();
    }

    // Main glyph with subtle black readability shadow.
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.015,
      depthTest: !forceTop,
      depthWrite: false,
      toneMapped: false,
      fog: !forceTop,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scaleX, scaleY, 1);
    // Normal compass labels draw after the glow pass, but because their
    // depthTest remains enabled they can still be naturally occluded by
    // nearer 3D geometry. WP9 keeps absolute priority.
    sprite.renderOrder = forceTop ? 1000000 : 300;
    sprite.frustumCulled = false;
    return sprite;
  }

  function installNavigationLabels(scene) {
    if (!scene?.isScene || scene.userData.__phantomNavigationLabelsV048) return;

    scene.userData.__phantomNavigationLabelsV048 = true;

    const group = new THREE.Group();
    group.name = "PHANTOM_GRID_NAV_LABELS_V048";

    const R = 466;
    const directions = [
      { text: "NORTH", pos: [0, 0,  R] },
      { text: "SOUTH", pos: [0, 0, -R] },
      { text: "EAST",  pos: [ R, 0, 0] },
      { text: "WEST",  pos: [-R, 0, 0] },
      { text: "UP",    pos: [0,  R, 0] },
      { text: "DOWN",  pos: [0, -R, 0] },
    ];

    for (const def of directions) {
      const sprite = makeTextSprite(def.text, "#c8d0d6", {
        fontSize: 44,
        scaleX: def.text.length > 4 ? 56 : 42,
        scaleY: 14,
        shadowBlur: 9,
        forceTop: false,
      });
      sprite.position.set(...def.pos);
      group.add(sprite);
    }

    // WP9 // Graea Hypue QL-V b19-15
    // HEN-local XYZ = (+21.53125, -62.1875, +78.625)
    // Artificial display priority requested: WP9 always remains readable.
    const wp9 = makeTextSprite("WP9", "#66d9ff", {
      width: 768,
      height: 256,
      fontSize: 104,
      scaleX: 82,
      scaleY: 28,
      shadowBlur: 10,
      glow: true,
      forceTop: true,
    });

    // Tiny lift from the exact site marker, without moving the label away
    // from the system visually.
    wp9.position.set(21.53125, -52.1875, 78.625);
    wp9.userData.phantomWaypoint = "WP9";
    wp9.userData.system = "Graea Hypue QL-V b19-15";
    group.add(wp9);

    originalAdd.call(scene, group);
    console.info("[PHANTOM GRID] Navigation labels V0.4.8 installed:", group.children.length);
  }

  THREE.Object3D.prototype.add = function(...objects) {
    const result = originalAdd.apply(this, objects);

    if (this?.isScene) {
      installNavigationLabels(this);
      THREE.Object3D.prototype.add = originalAdd;
    }

    return result;
  };
}
