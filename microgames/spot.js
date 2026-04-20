// SPOT! — grid of identical shapes, one is a different color. Click it.

import { THREE, makeStudio } from '../three-setup.js';

export default {
  key: 'spot',
  title: 'SPOT!',
  description: 'Find the shape that looks different. Click it.',
  controls: 'Mouse — click the odd one',
  thumbnail: 'microgames/thumbnails/spot.png',
  baseDuration: 4.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x14183a, groundColor: 0x090b20 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 2, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // Grid size + color closeness scale with difficulty
    const cols = 4 + Math.floor(difficulty * 1.5);
    const rows = 3 + Math.floor(difficulty * 1);
    const spacing = 1.0;
    const baseColor = new THREE.Color().setHSL(rand(), 0.65, 0.5);
    const oddDelta = Math.max(0.04, 0.18 - difficulty * 0.08);
    const oddColor = baseColor.clone().offsetHSL(0, 0, oddDelta);

    const oddIdx = Math.floor(rand() * (cols * rows));
    const shapes = [];
    const geom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    for (let i = 0; i < cols * rows; i++) {
      const isOdd = (i === oddIdx);
      const color = isOdd ? oddColor : baseColor;
      const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35,
      }));
      const cx = (i % cols) - (cols - 1) / 2;
      const rz = Math.floor(i / cols) - (rows - 1) / 2;
      m.position.set(cx * spacing, 2 + rz * spacing * 0.8, 0);
      m.castShadow = true;
      m.userData.isOdd = isOdd;
      scene.add(m);
      shapes.push(m);
    }

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;
      // Gentle wobble
      for (const m of shapes) m.rotation.y += dt * 0.6;

      if (mouse.clicked) {
        mouse.clicked = false;
        ndc.set(mouse.x, mouse.y);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(shapes, false);
        if (hits.length > 0) {
          resolved = true;
          if (hits[0].object.userData.isOdd) {
            hits[0].object.material.emissive.set(0x6fff9b);
            hits[0].object.material.emissiveIntensity = 1.2;
            onWin('spotted');
          } else {
            hits[0].object.material.emissive.set(0xff5c7a);
            onLose('wrong');
          }
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        shapes[oddIdx].material.emissive.set(0xffd15c);
        shapes[oddIdx].material.emissiveIntensity = 1.2;
        onLose('timeout');
      }
    }

    function dispose() {
      shapes.forEach(m => scene.remove(m));
      geom.dispose();
    }

    return { scene, camera, update, dispose };
  }
};
