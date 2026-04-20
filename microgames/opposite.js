// OPPOSITE! — an arrow is shown. Press the OPPOSITE direction.
// Shown ↑ → press DOWN. Shown → → press LEFT. Etc.
// Pressing the shown direction = lose. Wrong axis = lose. Correct = win.

import { THREE, makeStudio } from '../three-setup.js';
import { makeWideLabel } from './_numpad.js';

// Map every input key to its direction so WASD + arrows both work.
const KEY_TO_DIR = {
  'w': 'up',    'arrowup': 'up',
  's': 'down',  'arrowdown': 'down',
  'a': 'left',  'arrowleft': 'left',
  'd': 'right', 'arrowright': 'right',
};
const OPPOSITES = { up: 'down', down: 'up', left: 'right', right: 'left' };

const SHOWN = [
  { dir: 'up',    label: '↑' },
  { dir: 'down',  label: '↓' },
  { dir: 'left',  label: '←' },
  { dir: 'right', label: '→' },
];

export default {
  key: 'opposite',
  title: 'OPPOSITE!',
  description: 'Press the OPPOSITE direction of the arrow shown.',
  controls: 'Arrow keys / WASD — the one pointing the other way',
  thumbnail: 'microgames/thumbnails/opposite.png',
  baseDuration: 3.5,

  mount(ctx) {
    const { seed, duration, onWin, onLose, keys } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a052a, groundColor: 0x0c0418 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 2, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const shown = SHOWN[Math.floor(rand() * SHOWN.length)];
    const correctDir = OPPOSITES[shown.dir];

    const prompt = makeWideLabel('PRESS THE OPPOSITE!', {
      width: 4.2, height: 0.7,
      color: '#ffd15c',
      font: 'bold 110px ui-sans-serif, system-ui, sans-serif',
    });
    prompt.position.set(0, 3.7, 0);
    scene.add(prompt);

    const arrow = makeWideLabel(shown.label, {
      width: 2.2, height: 2.2,
      color: '#4ff0ff',
      font: 'bold 300px ui-sans-serif, system-ui, sans-serif',
    });
    arrow.position.set(0, 1.9, 0);
    scene.add(arrow);

    const prev = {};
    for (const k of Object.keys(KEY_TO_DIR)) prev[k] = !!keys[k];

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Subtle pulse so the arrow feels urgent
      const pulse = 1 + Math.sin(elapsed * 5) * 0.04;
      arrow.scale.set(pulse, pulse, 1);

      for (const k of Object.keys(KEY_TO_DIR)) {
        const now = !!keys[k];
        if (now && !prev[k]) {
          const pressedDir = KEY_TO_DIR[k];
          if (pressedDir === correctDir) {
            resolved = true;
            onWin('opposite');
            return;
          } else if (pressedDir === shown.dir) {
            resolved = true;
            onLose('matched');
            return;
          } else {
            resolved = true;
            onLose('wrong axis');
            return;
          }
        }
        prev[k] = now;
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }
    }

    function dispose() {
      scene.remove(prompt, arrow);
      [prompt, arrow].forEach(m => {
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
        m.geometry.dispose();
      });
    }

    return { scene, camera, update, dispose };
  }
};
