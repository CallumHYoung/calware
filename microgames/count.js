// COUNT! — some floating objects appear. Tap the digit that matches
// how many there are. First click commits your answer (no submit).

import { THREE, makeStudio } from '../three-setup.js';
import { makeNumpad, makeWideLabel, setLabelText } from './_numpad.js';

export default {
  key: 'count',
  title: 'COUNT!',
  description: 'How many objects? Tap the matching digit.',
  controls: 'Click the digit that matches',
  thumbnail: 'microgames/thumbnails/count.png',
  baseDuration: 5.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x111a2e, groundColor: 0x0a101e });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 1.5, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // 3-9 objects. Difficulty skews toward larger counts.
    const count = 3 + Math.floor(rand() * (5 + difficulty * 2));
    const correct = Math.min(9, count);

    const prompt = makeWideLabel('HOW MANY?', {
      width: 3.6, height: 0.9,
      color: '#ffd15c',
      font: 'bold 120px ui-sans-serif, system-ui, sans-serif',
    });
    prompt.position.set(0, 4.2, 0);
    scene.add(prompt);

    // Scatter spheres in a zone above the pad
    const ballGeo = new THREE.IcosahedronGeometry(0.35, 0);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0x4ff0ff, emissive: 0x4ff0ff, emissiveIntensity: 0.55 });
    const balls = [];
    for (let i = 0; i < correct; i++) {
      const m = new THREE.Mesh(ballGeo, ballMat);
      // Spread across a band so they're clearly separable
      const angle = (i / correct) * Math.PI * 2 + rand() * 0.4;
      const radius = 1.5 + rand() * 0.8;
      m.position.set(
        Math.cos(angle) * radius,
        2.7 + (rand() - 0.5) * 0.9,
        Math.sin(angle) * 0.8,
      );
      m.castShadow = true;
      m.userData.phase = rand() * Math.PI * 2;
      scene.add(m);
      balls.push(m);
    }

    const pad = makeNumpad(scene, {
      origin: new THREE.Vector3(0, 1, 0),
      includeSubmit: false,     // one click = answer
      includeZero: false,
      onDigit: (d) => {
        if (resolved) return;
        const n = parseInt(d, 10);
        if (n === correct) {
          resolved = true;
          setLabelText(prompt, `${correct} ✓`);
          onWin('correct');
        } else {
          resolved = true;
          setLabelText(prompt, `${n} — it was ${correct}`);
          onLose('wrong');
        }
      },
    });
    pad.group.rotation.x = -0.25;
    pad.group.position.set(0, 1.15, 0.5);

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Gentle floating motion so the scene feels alive
      for (const b of balls) {
        b.position.y += Math.sin(elapsed * 2 + b.userData.phase) * dt * 0.3;
        b.rotation.y += dt * 1.2;
      }

      if (mouse.clicked) {
        mouse.clicked = false;
        pad.tryClick(camera, mouse);
      }

      if (elapsed >= duration) {
        resolved = true;
        setLabelText(prompt, `time! answer: ${correct}`);
        onLose('timeout');
      }
    }

    function dispose() {
      pad.dispose();
      balls.forEach(b => scene.remove(b));
      scene.remove(prompt);
      ballGeo.dispose();
      ballMat.dispose();
      if (prompt.material?.map) prompt.material.map.dispose();
      prompt.material?.dispose?.();
      prompt.geometry?.dispose?.();
    }

    return { scene, camera, update, dispose };
  }
};
