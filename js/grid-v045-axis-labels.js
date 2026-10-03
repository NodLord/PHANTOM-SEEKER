import * as THREE from "three";

if (!window.__PHANTOM_GRID_AXIS_LABELS_V047__) {
  window.__PHANTOM_GRID_AXIS_LABELS_V047__ = true;

  const originalAdd = THREE.Object3D.prototype.add;

  function makeTextSprite(text, color = "#d6dde3", options = {}) {
    const {
      width = 512,
      height = 128,
      fontSize = 46,
      scaleX = 56,
      scaleY = 14,
      shadowBlur = 8,
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${fontSize}px Segoe UI, Arial, sans-serif`;

    // Very light tactical shadow only. No plate, no frame, no axis code.
    ctx.shadowColor = "rgba(0,0,0,0.92)";
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
      alphaTest: 0.02,

      // IMPORTANT: these labels are now genuinely part of the 3D scene.
      // Depth testing stays ON so nearer shells, markers and geometry can
      // naturally pass in front of the text.
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scaleX, scaleY, 1);
    sprite.renderOrder = 0;
    sprite.userData.phantomNavigationLabel = true;
    return sprite;
  }

  function installNavigationLabels(scene) {
    if (!scene?.isScene || scene.userData.__phantomNavigationLabelsV047) return;

    scene.userData.__phantomNavigationLabelsV047 = true;

    const group = new THREE.Group();
    group.name = "PHANTOM_GRID_NAV_LABELS_V047";

    // app.js draws the local axes from -450 to +450.
    // Put the text slightly beyond each endpoint.
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
      });
      sprite.position.set(...def.pos);
      group.add(sprite);
    }

    // WP9 // Graea Hypue QL-V b19-15
    // HEN-local coordinates:
    // (-819.125, -623.34375, 13440.4375)
    // minus HEN 2-333 (-840.65625, -561.15625, 13361.8125)
    // = (+21.53125, -62.1875, +78.625)
    //
    // Give the text a tiny Y lift so it doesn't sit directly inside the
    // Guardian octahedron while remaining visibly anchored to the system.
    const wp9 = makeTextSprite("WP9", "#66d9ff", {
      fontSize: 50,
      scaleX: 34,
      scaleY: 13,
      shadowBlur: 10,
    });
    wp9.position.set(21.53125, -54.1875, 78.625);
    wp9.userData.phantomWaypoint = "WP9";
    wp9.userData.system = "Graea Hypue QL-V b19-15";
    group.add(wp9);

    originalAdd.call(scene, group);
    console.info("[PHANTOM GRID] Minimal navigation labels V0.4.7 installed:", group.children.length);
  }

  // app.js calls scene.add(root) immediately after creating the root group.
  // Hook that guaranteed event, inject the labels into the real Scene, then
  // restore Three.js immediately.
  THREE.Object3D.prototype.add = function(...objects) {
    const result = originalAdd.apply(this, objects);

    if (this?.isScene) {
      installNavigationLabels(this);
      THREE.Object3D.prototype.add = originalAdd;
    }

    return result;
  };
}
