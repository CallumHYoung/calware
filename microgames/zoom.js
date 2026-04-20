// ZOOM! — extreme close-up of a shape. Click the matching label below.

import { THREE, makeStudio } from '../three-setup.js';
import { makeWideLabel } from './_numpad.js';

const SHAPES = [
  { key: 'cube',     name: 'CUBE',     make: () => new THREE.BoxGeometry(1, 1, 1) },
  { key: 'sphere',   name: 'SPHERE',   make: () => new THREE.SphereGeometry(0.6, 24, 16) },
  { key: 'cone',     name: 'CONE',     make: () => new THREE.ConeGeometry(0.6, 1.1, 20) },
  { key: 'torus',    name: 'TORUS',    make: () => new THREE.TorusGeometry(0.5, 0.2, 14, 32) },
  { key: 'cylinder', name: 'CYLINDER', make: () => new THREE.CylinderGeometry(0.5, 0.5, 1.1, 20) },
  { key: 'pyramid',  name: 'PYRAMID',  make: () => new THREE.ConeGeometry(0.7, 1.0, 4) },
];

export default {
  key: 'zoom',
  title: 'ZOOM!',
  description: 'What shape are you staring at? Pick the right label.',
  controls: 'Mouse — click the correct answer',
  thumbnail: 'microgames/thumbnails/zoom.png',
  baseDuration: 4.5,

  mount(ctx) {
    const { seed, onWin, onLose, duration, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a1030, groundColor: 0x0c0820 });

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2.5, 6);
    camera.lookAt(0, 2, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const correct = SHAPES[Math.floor(rand() * SHAPES.length)];

    // Mystery shape — very close to camera
    const mystery = new THREE.Mesh(
      correct.make(),
      new THREE.MeshStandardMaterial({ color: 0xc64bff, emissive: 0xc64bff, emissiveIntensity: 0.25 })
    );
    mystery.position.set(0, 3.4, 4.3);  // very near the camera
    mystery.castShadow = true;
    scene.add(mystery);

    // Four option cards below
    const optionPool = SHAPES.slice();
    // Shuffle deterministically
    for (let i = optionPool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [optionPool[i], optionPool[j]] = [optionPool[j], optionPool[i]];
    }
    // Ensure correct is in the first 4
    const options = optionPool.slice(0, 4);
    if (!options.find(o => o.key === correct.key)) {
      options[Math.floor(rand() * 4)] = correct;
    }

    const cards = [];
    options.forEach((opt, i) => {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 0.55, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x2a1250, emissive: 0x2a1250, emissiveIntensity: 0.5 })
      );
      g.add(pad);
      const label = makeWideLabel(opt.name, {
        width: 1.35, height: 0.45,
        color: '#fff',
        font: 'bold 80px ui-sans-serif, system-ui, sans-serif',
      });
      label.position.z = 0.1;
      g.add(label);
      g.position.set((i - 1.5) * 1.6, 0.75, 0);
      g.userData.key = opt.key;
      scene.add(g);
      cards.push(g);
    });

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      mystery.rotation.y += dt * 0.7;
      mystery.rotation.x += dt * 0.3;

      if (mouse.clicked) {
        mouse.clicked = false;
        ndc.set(mouse.x, mouse.y);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(cards, true);
        if (hits.length > 0) {
          let top = hits[0].object;
          while (top.parent && top.parent !== scene) top = top.parent;
          resolved = true;
          const pad = top.children[0];
          if (top.userData.key === correct.key) {
            pad.material.color.set(0x6fff9b);
            pad.material.emissive.set(0x6fff9b);
            onWin('correct');
          } else {
            pad.material.color.set(0xff5c7a);
            pad.material.emissive.set(0xff5c7a);
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
      scene.remove(mystery);
      cards.forEach(g => scene.remove(g));
      mystery.geometry.dispose();
    }

    return { scene, camera, update, dispose };
  }
};
