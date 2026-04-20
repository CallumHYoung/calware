// MASH! — spam the spacebar as fast as you can. Each press charges a
// gauge; fill it before time runs out to win.

import { THREE, makeStudio } from '../three-setup.js';

export default {
  key: 'mash',
  title: 'MASH!',
  description: 'MASH the spacebar! Fill the gauge before time runs out.',
  controls: 'SPACE — mash!',
  thumbnail: 'microgames/thumbnails/mash.png',
  baseDuration: 4.5,

  mount(ctx) {
    const { difficulty, duration, onWin, onLose, keys, playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x2e0a1c, groundColor: 0x180510 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 2, 0);

    // Target: 12-18 presses depending on difficulty, in ~4.5s
    const target = 12 + Math.floor(difficulty * 6);

    // Gauge background
    const GAUGE_HEIGHT = 4;
    const gaugeBg = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, GAUGE_HEIGHT, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x200820, emissive: 0x200820, emissiveIntensity: 0.2 })
    );
    gaugeBg.position.set(0, GAUGE_HEIGHT / 2, 0);
    scene.add(gaugeBg);

    // Fill bar — scales vertically with press count
    const fillColor = new THREE.Color(playerColor || 0xff4fd8);
    const gaugeFill = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1, 0.4),
      new THREE.MeshStandardMaterial({ color: fillColor, emissive: fillColor, emissiveIntensity: 0.55 })
    );
    gaugeFill.position.set(0, 0.001, 0);
    gaugeFill.scale.y = 0.001;
    scene.add(gaugeFill);

    // Finish line indicator
    const finishLine = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.06, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x6fff9b, emissive: 0x6fff9b, emissiveIntensity: 0.8 })
    );
    finishLine.position.set(0, GAUGE_HEIGHT, 0);
    scene.add(finishLine);

    // Little character at the base that bounces on each press
    const masher = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.5 })
    );
    masher.position.set(-1.6, 0.35, 0);
    masher.castShadow = true;
    scene.add(masher);

    let spaceHeld = !!keys[' '];   // ignore an already-held space at mount
    let pressCount = 0;
    let elapsed = 0;
    let resolved = false;
    let bounce = 0;

    function update(dt) {
      if (resolved) {
        // Freeze at final state, keep lerping fill to current position
        const frac = pressCount / target;
        gaugeFill.scale.y = Math.max(0.001, frac * GAUGE_HEIGHT);
        gaugeFill.position.y = gaugeFill.scale.y / 2;
        return;
      }
      elapsed += dt;

      // Edge-detect space presses
      const spaceNow = !!keys[' '];
      if (spaceNow && !spaceHeld) {
        pressCount++;
        bounce = 1;
      }
      spaceHeld = spaceNow;

      // Masher bounce animation
      bounce = Math.max(0, bounce - dt * 4);
      masher.position.y = 0.35 + bounce * 0.6;

      // Gauge fill lerp
      const frac = Math.min(1, pressCount / target);
      const desired = Math.max(0.001, frac * GAUGE_HEIGHT);
      const k = Math.min(1, dt * 18);
      gaugeFill.scale.y += (desired - gaugeFill.scale.y) * k;
      gaugeFill.position.y = gaugeFill.scale.y / 2;

      if (pressCount >= target) {
        resolved = true;
        finishLine.material.emissiveIntensity = 1.5;
        onWin('maxed');
        return;
      }
      if (elapsed >= duration) {
        resolved = true;
        onLose('not enough');
      }
    }

    function dispose() {
      scene.remove(gaugeBg, gaugeFill, finishLine, masher);
      [gaugeBg, gaugeFill, finishLine, masher].forEach(m => {
        m.geometry?.dispose?.();
        m.material?.dispose?.();
      });
    }

    return { scene, camera, update, dispose };
  }
};
