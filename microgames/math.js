// MATH! — solve an addition equation by typing the answer on a 3D
// numpad. No backspace: commit to your digits, then press ✓. If you
// fat-finger, you lose.

import { THREE, makeStudio } from '../three-setup.js';
import { makeNumpad, makeWideLabel, setLabelText } from './_numpad.js';

export default {
  key: 'math',
  title: 'MATH!',
  description: 'Add the numbers. Tap your answer on the keypad, then ✓.',
  controls: 'Click digits • click ✓ to submit • no backspace!',
  thumbnail: 'microgames/thumbnails/math.png',
  baseDuration: 8.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0f1b3a, groundColor: 0x0a1028 });

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2.2, 6.5);
    camera.lookAt(0, 1.2, 0);

    // RNG derived from the round seed so every peer sees the same problem.
    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // Difficulty: low ⇒ single-digit + single-digit, high ⇒ up to ~50 + 50
    const maxOperand = 9 + Math.floor(difficulty * 40);
    const a = 1 + Math.floor(rand() * maxOperand);
    const b = 1 + Math.floor(rand() * maxOperand);
    const correct = a + b;

    // Equation display at top of scene
    const eqLabel = makeWideLabel(`${a} + ${b} = ?`, {
      width: 4.2, height: 1.1,
      color: '#ffd15c',
      font: 'bold 140px ui-sans-serif, system-ui, sans-serif',
    });
    eqLabel.position.set(0, 3.6, 0);
    scene.add(eqLabel);

    // Current answer display just below the equation
    const answerLabel = makeWideLabel('_', {
      width: 3.2, height: 0.9,
      color: '#4ff0ff',
      font: 'bold 110px ui-sans-serif, system-ui, sans-serif',
    });
    answerLabel.position.set(0, 2.3, 0);
    scene.add(answerLabel);

    const pad = makeNumpad(scene, {
      origin: new THREE.Vector3(0, 1, 0),
      includeSubmit: true,
      onDigit: (d) => {
        if (resolved) return;
        if (typed.length >= 4) return;   // sanity cap
        typed += d;
        setLabelText(answerLabel, typed);
      },
      onSubmit: () => {
        if (resolved) return;
        if (typed.length === 0) return;
        const n = parseInt(typed, 10);
        if (n === correct) {
          resolved = true;
          setLabelText(answerLabel, `${typed} ✓`);
          answerLabel.material.map.needsUpdate = true;
          onWin('correct');
        } else {
          resolved = true;
          setLabelText(answerLabel, `${typed} ≠ ${correct}`);
          answerLabel.material.map.needsUpdate = true;
          onLose('wrong');
        }
      },
    });
    // Tilt numpad slightly so it faces the camera nicely.
    pad.group.rotation.x = -0.25;
    pad.group.position.set(0, 1.15, 0.5);

    let typed = '';
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) {
        // allow final display to render for a moment before dispose
        return;
      }
      elapsed += dt;

      if (mouse.clicked) {
        mouse.clicked = false;
        pad.tryClick(camera, mouse);
      }

      if (elapsed >= duration) {
        resolved = true;
        setLabelText(answerLabel, `time! answer: ${correct}`);
        onLose('timeout');
      }
    }

    function dispose() {
      pad.dispose();
      scene.remove(eqLabel, answerLabel);
      [eqLabel, answerLabel].forEach(m => {
        if (m.material?.map) m.material.map.dispose();
        m.material?.dispose?.();
        m.geometry?.dispose?.();
      });
    }

    return { scene, camera, update, dispose };
  }
};
