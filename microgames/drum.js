// DRUM! — hit SPACE on each beat. Beats at a steady tempo; miss one
// and you lose.

import { THREE, makeStudio } from '../three-setup.js';

export default {
  key: 'drum',
  title: 'DRUM!',
  description: 'Hit SPACE on every beat as the ring pulses.',
  controls: 'SPACE — on each beat',
  thumbnail: 'microgames/thumbnails/drum.png',
  baseDuration: 6.0,

  mount(ctx) {
    const { difficulty, duration, onWin, onLose, keys, playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0e1a30, groundColor: 0x060e1c });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 1.8, 0);

    // Beat visualization: outer ring (target), inner ring shrinks to it
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.55, 36),
      new THREE.MeshBasicMaterial({ color: 0xffd15c, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    outer.rotation.x = -Math.PI / 2.2;
    outer.position.set(0, 1.8, 0);
    scene.add(outer);

    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.16, 36),
      new THREE.MeshBasicMaterial({ color: 0x4ff0ff, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2.2;
    inner.position.set(0, 1.8, 0);
    scene.add(inner);

    // Beat counter dots
    const beatsTotal = 5 + Math.floor(difficulty * 2);
    const dots = [];
    for (let i = 0; i < beatsTotal; i++) {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x3d1f5e, emissive: 0x3d1f5e, emissiveIntensity: 0.3 })
      );
      d.position.set((i - (beatsTotal - 1) / 2) * 0.45, 3.4, 0);
      scene.add(d);
      dots.push(d);
    }

    // Tempo: ~500ms per beat at diff=0, faster with difficulty
    const beatInterval = Math.max(0.32, 0.55 - difficulty * 0.08);
    const HIT_WINDOW = 0.22;   // ±ms around beat time

    const beats = [];
    for (let i = 0; i < beatsTotal; i++) {
      beats.push({ time: 0.9 + i * beatInterval, hit: false });
    }

    let spaceHeld = !!keys[' '];
    let hitsCount = 0;
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Inner ring expands to outer, snaps back each beat
      const nextUnhit = beats.find(b => !b.hit);
      if (nextUnhit) {
        const timeToBeat = nextUnhit.time - elapsed;
        const frac = Math.max(0, Math.min(1, 1 - timeToBeat / beatInterval));
        const radius = 0.12 + frac * (1.35 - 0.12);
        inner.scale.set(radius / 0.12, radius / 0.12, 1);
        // Pulse color on approach
        const near = Math.abs(timeToBeat) < HIT_WINDOW ? 1 : 0;
        inner.material.color.setHex(near ? 0x6fff9b : 0x4ff0ff);
      }

      // SPACE edge detect
      const spaceNow = !!keys[' '];
      if (spaceNow && !spaceHeld) {
        // Which beat is in window?
        const candidate = beats.find(b => !b.hit && Math.abs(elapsed - b.time) < HIT_WINDOW);
        if (candidate) {
          candidate.hit = true;
          hitsCount++;
          dots[hitsCount - 1].material.color.setHex(0x6fff9b);
          dots[hitsCount - 1].material.emissive.setHex(0x6fff9b);
          dots[hitsCount - 1].material.emissiveIntensity = 1.1;
          if (hitsCount >= beatsTotal) {
            resolved = true;
            onWin('kept tempo');
          }
        } else {
          // Missed — wrong timing
          resolved = true;
          onLose('off beat');
        }
      }
      spaceHeld = spaceNow;

      // A beat passed without a hit?
      for (const b of beats) {
        if (!b.hit && elapsed > b.time + HIT_WINDOW) {
          resolved = true;
          onLose('missed beat');
          return;
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        // Win only if all beats hit — otherwise lose
        if (hitsCount >= beatsTotal) onWin('kept tempo');
        else onLose('timeout');
      }
    }

    function dispose() {
      scene.remove(outer, inner);
      dots.forEach(d => scene.remove(d));
    }

    return { scene, camera, update, dispose };
  }
};
