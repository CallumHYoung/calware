// DEFLECT! — projectiles fly at the player one at a time. Each projectile
// has an arrow icon showing which arrow key to press to block it. Miss
// one and you lose.

import { THREE, makeStudio } from '../three-setup.js';

const DIRS = [
  { key: 'arrowup',    dx:  0, dz:  1,  label: '↑' },
  { key: 'arrowdown',  dx:  0, dz: -1,  label: '↓' },
  { key: 'arrowleft',  dx:  1, dz:  0,  label: '←' },
  { key: 'arrowright', dx: -1, dz:  0,  label: '→' },
];

export default {
  key: 'deflect',
  title: 'DEFLECT!',
  description: 'Press the arrow key shown above each projectile BEFORE it hits.',
  controls: 'Arrow keys (match the icon)',
  thumbnail: 'microgames/thumbnails/deflect.png',
  baseDuration: 6.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys, playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0b1a2a, groundColor: 0x061019 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 9, 12);
    camera.lookAt(0, 0.5, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.25 })
    );
    player.position.set(0, 0.7, 0);
    player.castShadow = true;
    scene.add(player);

    // Arrow label sprite above a projectile
    function makeArrowSprite(label) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx2 = canvas.getContext('2d');
      ctx2.fillStyle = '#ffd15c';
      ctx2.font = 'bold 110px ui-sans-serif, system-ui, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(label, 64, 72);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      return mesh;
    }

    const spawnDist = 6;
    const projectileCount = 3 + Math.floor(difficulty * 2);
    const approachTime = Math.max(0.9, 1.6 - difficulty * 0.4);
    const gap = approachTime * 0.45;

    // Pre-generate all projectile spawns
    const projectiles = [];
    for (let i = 0; i < projectileCount; i++) {
      const dir = DIRS[Math.floor(rand() * DIRS.length)];
      const spawnTime = 0.4 + i * (approachTime + gap);
      const g = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xff5c7a, emissive: 0xff5c7a, emissiveIntensity: 0.6 })
      );
      g.add(ball);
      const sprite = makeArrowSprite(dir.label);
      sprite.position.y = 0.9;
      g.add(sprite);
      g.position.set(spawnDist * dir.dx * -1, 0.6, spawnDist * dir.dz * -1);   // start at opposite side
      g.visible = false;
      scene.add(g);
      projectiles.push({
        group: g, ball, sprite, dir, spawnTime, arrivalTime: spawnTime + approachTime,
        deflected: false, missed: false,
        startX: g.position.x, startZ: g.position.z,
      });
    }

    // Track previous key state for edge detection
    const prev = {};
    for (const d of DIRS) prev[d.key] = !!keys[d.key];

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Detect new key presses this frame
      const pressed = new Set();
      for (const d of DIRS) {
        const now = !!keys[d.key];
        if (now && !prev[d.key]) pressed.add(d.key);
        prev[d.key] = now;
      }

      for (const p of projectiles) {
        if (p.deflected || p.missed) continue;
        if (elapsed < p.spawnTime) continue;

        p.group.visible = true;
        const t = (elapsed - p.spawnTime) / approachTime; // 0..1
        if (t >= 0 && t <= 1) {
          p.group.position.x = p.startX * (1 - t);
          p.group.position.z = p.startZ * (1 - t);
        }

        // Deflect if the matching key pressed while en route
        if (pressed.has(p.dir.key) && t < 1) {
          p.deflected = true;
          p.ball.material.color.set(0x6fff9b);
          p.ball.material.emissive.set(0x6fff9b);
          pressed.delete(p.dir.key);
          // Flick it back
          p.group.scale.multiplyScalar(1.3);
          setTimeout(() => { p.group.visible = false; }, 100);
        } else if (t >= 1) {
          p.missed = true;
          resolved = true;
          player.material.color.set(0xff5c7a);
          player.material.emissive.set(0xff5c7a);
          onLose('hit');
          return;
        }
      }

      // Wrong key pressed while no pending projectile matches it? Penalize.
      for (const k of pressed) {
        // Check if there's an active projectile we could have been trying to deflect
        const hasActive = projectiles.some(p => !p.deflected && !p.missed && elapsed >= p.spawnTime && elapsed < p.arrivalTime);
        if (hasActive) {
          resolved = true;
          onLose('wrong key');
          return;
        }
      }

      // All deflected?
      if (projectiles.every(p => p.deflected) && !resolved) {
        resolved = true;
        onWin('all deflected');
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }
    }

    function dispose() {
      projectiles.forEach(p => scene.remove(p.group));
      scene.remove(player);
    }

    return { scene, camera, update, dispose };
  }
};
