import * as THREE from "three";

if (!window.__PHANTOM_GRID_RENDER_CAPTURE_V043__) {
  window.__PHANTOM_GRID_RENDER_CAPTURE_V043__ = true;

  const originalRender = THREE.WebGLRenderer.prototype.render;

  THREE.WebGLRenderer.prototype.render = function(scene, camera) {
    window.__PHANTOM_GRID_SCENE__ = scene;
    window.__PHANTOM_GRID_CAMERA__ = camera;
    window.__PHANTOM_GRID_CANVAS__ = this.domElement;
    return originalRender.call(this, scene, camera);
  };
}
