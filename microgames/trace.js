// TRACE! — a glowing dot moves around the scene. Keep your mouse cursor
// near it. Drift too far for too long and you lose.

import { THREE, makeStudio } from '../three-setup.js';

export default {
  key: 'trace',
  title: 'TRACE!',
  description: 'Keep your cursor on the moving dot.',
  controls: 'Mouse — follow the dot',
  thumbnail: 'microgames/thumbnails/trace.png',
  baseDuration: 6.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0a1a30, groundColor: 0x061224 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 5, 9);
    camera.lookAt(0, 1.8, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // Moving target dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 1 })
    );
    dot.position.set(0, 2, 0);
    dot.castShadow = true;
    scene.add(dot);

    // Player cursor indicator — a ring that follows the mouse projection
    const cursorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 24),
      new THREE.MeshBasicMaterial({ color: 0x4ff0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false })
    );
    cursorRing.renderOrder = 999;
    cursorRing.rotation.x = -Math.PI / 2;
    scene.add(cursorRing);

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0);  // z=0 plane
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitPos = new THREE.Vector3();

    // Dot moves via a smooth figure-8 / random curve
    const speed = 1.2 + difficulty * 0.8;
    const ampX = 3;
    const ampY = 1.5;

    const PROXIMITY = 1.0;  // "close enough"
    const LOSE_TIME = 0.6;  // continuous time off-target = lose

    let elapsed = 0;
    let resolved = false;
    let offTime = 0;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Dot follows a Lissajous path
      dot.position.x = Math.sin(elapsed * speed) * ampX;
      dot.position.y = 2 + Math.sin(elapsed * speed * 1.4 + 0.5) * ampY;
      dot.rotation.y += dt * 3;

      // Project mouse onto z=0 plane
      ndc.set(mouse.x, mouse.y);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hitPos)) {
        cursorRing.position.set(hitPos.x, hitPos.y, 0.02);
      }

      // Measure distance from cursor to dot
      const d = cursorRing.position.distanceTo(dot.position);
      if (d <= PROXIMITY) {
        offTime = 0;
        cursorRing.material.color.setHex(0x6fff9b);
      } else {
        offTime += dt;
        cursorRing.material.color.setHex(0xff5c7a);
        if (offTime >= LOSE_TIME) {
          resolved = true;
          onLose('strayed');
          return;
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onWin('tracked');
      }
    }

    function dispose() {
      scene.remove(dot, cursorRing);
      dot.geometry.dispose();
      dot.material.dispose();
      cursorRing.geometry.dispose();
      cursorRing.material.dispose();
    }

    return { scene, camera, update, dispose };
  }
};
