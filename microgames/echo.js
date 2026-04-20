// ECHO! — watch a sequence of arrows flash, then replay it in order.

import { THREE, makeStudio } from '../three-setup.js';

const DIRS = [
  { key: 'arrowup',    label: '↑', x:  0, y:  1 },
  { key: 'arrowright', label: '→', x:  1, y:  0 },
  { key: 'arrowdown',  label: '↓', x:  0, y: -1 },
  { key: 'arrowleft',  label: '←', x: -1, y:  0 },
];

export default {
  key: 'echo',
  title: 'ECHO!',
  description: 'Watch the arrow sequence, then repeat it in order.',
  controls: 'Arrow keys — press in the same order',
  thumbnail: 'microgames/thumbnails/echo.png',
  baseDuration: 10.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x221240, groundColor: 0x0d0720 });

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 2, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // Sequence length scales with difficulty
    const len = 3 + Math.floor(difficulty * 2);
    const sequence = [];
    for (let i = 0; i < len; i++) sequence.push(DIRS[Math.floor(rand() * DIRS.length)]);

    // Four direction plates arranged in a + shape
    const plates = {};
    for (const d of DIRS) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x2a1250, emissive: 0x2a1250, emissiveIntensity: 0.4 })
      );
      plate.position.set(d.x * 1.3, 2 + d.y * 1.3, 0);
      scene.add(plate);
      // Arrow label
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx2 = canvas.getContext('2d');
      ctx2.fillStyle = '#fff';
      ctx2.font = 'bold 100px ui-sans-serif, system-ui, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(d.label, 64, 72);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      lbl.position.copy(plate.position);
      lbl.position.z += 0.11;
      scene.add(lbl);
      plates[d.key] = { plate, lbl, baseColor: 0x2a1250, flashColor: 0xffd15c };
    }

    function flashPlate(dirKey, color = 0xffd15c) {
      const p = plates[dirKey];
      if (!p) return;
      p.plate.material.color.set(color);
      p.plate.material.emissive.set(color);
      p.plate.material.emissiveIntensity = 1.1;
      setTimeout(() => {
        p.plate.material.color.setHex(p.baseColor);
        p.plate.material.emissive.setHex(p.baseColor);
        p.plate.material.emissiveIntensity = 0.4;
      }, 220);
    }

    // Playback
    let phase = 'playback';  // 'playback' | 'input' | 'done'
    let playbackIdx = 0;
    let playbackTimer = 0;
    const PLAYBACK_STEP = 0.55;
    let inputIdx = 0;

    const prev = {};
    for (const d of DIRS) prev[d.key] = !!keys[d.key];

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      if (phase === 'playback') {
        playbackTimer += dt;
        if (playbackTimer >= PLAYBACK_STEP) {
          playbackTimer = 0;
          if (playbackIdx < sequence.length) {
            flashPlate(sequence[playbackIdx].key);
            playbackIdx++;
          } else {
            // Small pause, then switch to input
            phase = 'input';
            for (const p of Object.values(plates)) {
              p.plate.material.emissive.set(0x4ff0ff);
              p.plate.material.emissiveIntensity = 0.25;
            }
          }
        }
        return;
      }

      if (phase === 'input') {
        for (const d of DIRS) {
          const now = !!keys[d.key];
          if (now && !prev[d.key]) {
            // keypress
            const expected = sequence[inputIdx];
            if (d.key === expected.key) {
              flashPlate(d.key, 0x6fff9b);
              inputIdx++;
              if (inputIdx >= sequence.length) {
                resolved = true;
                onWin('echoed');
                return;
              }
            } else {
              flashPlate(d.key, 0xff5c7a);
              resolved = true;
              onLose('wrong');
              return;
            }
          }
          prev[d.key] = now;
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }
    }

    function dispose() {
      for (const p of Object.values(plates)) {
        scene.remove(p.plate);
        scene.remove(p.lbl);
        p.plate.geometry.dispose();
        p.plate.material.dispose();
        if (p.lbl.material.map) p.lbl.material.map.dispose();
        p.lbl.material.dispose();
      }
    }

    return { scene, camera, update, dispose };
  }
};
