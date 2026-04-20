// Shared Three.js bootstrap. Creates one renderer attached to #stage and
// lets lobby / microgames swap in their own scene + camera at will.
//
// We keep a single renderer across lobby and match lifetimes because
// creating WebGL contexts is expensive and browsers limit them.

import * as THREE from 'three';

let renderer = null;
let activeScene = null;
let activeCamera = null;
let running = false;
let onResize = null;

const updaters = new Set();

export function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const stage = document.getElementById('stage');
  stage.appendChild(renderer.domElement);
  fitRenderer();
  window.addEventListener('resize', fitRenderer);
  return renderer;
}

function fitRenderer() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (activeCamera && activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = w / h;
    activeCamera.updateProjectionMatrix();
  }
  if (onResize) onResize(w, h);
}

export function setActive(scene, camera, resizeCb = null) {
  activeScene = scene;
  activeCamera = camera;
  onResize = resizeCb;
  fitRenderer();
}

export function registerUpdater(fn) {
  updaters.add(fn);
  return () => updaters.delete(fn);
}

export function startLoop() {
  if (running) return;
  running = true;
  let last = performance.now();
  const tick = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const fn of updaters) {
      try { fn(dt, now / 1000); } catch (e) { console.error('[updater]', e); }
    }
    if (renderer && activeScene && activeCamera) {
      renderer.render(activeScene, activeCamera);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function stopLoop() { running = false; }

// Utility: build a basic sky/ground/light rig reusable across scenes.
export function makeStudio(scene, { groundColor = 0x1a0d2e, skyColor = 0x2a1250 } = {}) {
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 30, 90);

  const hemi = new THREE.HemisphereLight(0xffffff, groundColor, 0.55);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(8, 18, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 60;
  dir.shadow.camera.left = -20;
  dir.shadow.camera.right = 20;
  dir.shadow.camera.top = 20;
  dir.shadow.camera.bottom = -20;
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return { hemi, dir, ground };
}

export { THREE };
