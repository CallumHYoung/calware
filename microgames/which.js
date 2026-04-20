// WHICH! — a floating arrow points down at one object in a row.
// Click the object the arrow is pointing at.

import { THREE, makeStudio } from '../three-setup.js';

export default {
  key: 'which',
  title: 'WHICH!',
  description: 'The arrow is pointing at one of these. Click that one.',
  controls: 'Mouse — click the targeted object',
  thumbnail: 'microgames/thumbnails/which.png',
  baseDuration: 3.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a112c, groundColor: 0x0d0820 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3.5, 7);
    camera.lookAt(0, 1.5, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const count = 5 + Math.floor(difficulty * 3);
    const spacing = 1.1;
    const targetIdx = Math.floor(rand() * count);

    const objects = [];
    const colors = [0xff4fd8, 0x4ff0ff, 0xffd15c, 0x6fff9b, 0xc64bff, 0xff9b6f];

    for (let i = 0; i < count; i++) {
      const c = colors[i % colors.length];
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 })
      );
      m.position.set((i - (count - 1) / 2) * spacing, 1.5, 0);
      m.castShadow = true;
      m.userData.idx = i;
      scene.add(m);
      objects.push(m);
    }

    // Arrow pointing down at the target
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.9 })
    );
    shaft.position.y = 0.4;
    arrow.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.4, 14),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 1 })
    );
    tip.rotation.x = Math.PI;
    tip.position.y = -0.15;
    arrow.add(tip);
    arrow.position.set(objects[targetIdx].position.x, 2.4, 0);
    scene.add(arrow);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Arrow bobs up and down
      arrow.position.y = 2.4 + Math.sin(elapsed * 5) * 0.15;

      if (mouse.clicked) {
        mouse.clicked = false;
        ndc.set(mouse.x, mouse.y);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(objects, false);
        if (hits.length > 0) {
          resolved = true;
          const idx = hits[0].object.userData.idx;
          if (idx === targetIdx) {
            hits[0].object.material.emissive.set(0x6fff9b);
            hits[0].object.material.emissiveIntensity = 1.1;
            onWin('correct');
          } else {
            hits[0].object.material.emissive.set(0xff5c7a);
            onLose('wrong');
          }
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }
    }

    function dispose() {
      objects.forEach(m => scene.remove(m));
      scene.remove(arrow);
    }

    return { scene, camera, update, dispose };
  }
};
