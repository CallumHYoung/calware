// DODGE! — survive N seconds of falling spheres in a small arena.
// Input: WASD / arrows. Win: reach duration alive. Lose: touched by a sphere.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'dodge',
  title: 'DODGE!',
  description: 'Survive the falling spheres. Don\'t get touched.',
  controls: 'WASD / arrows to move',
  thumbnail: 'microgames/thumbnails/dodge.png',
  baseDuration: 5.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys, playerColor, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x2a1250, groundColor: 0x1a0d2e });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 10, 14);
    camera.lookAt(0, 1, 0);

    // Arena outline
    const arena = 6.5;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(arena + 0.1, 0.08, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0xc64bff, emissive: 0xc64bff, emissiveIntensity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    // Player
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || '#4ff0ff', emissive: playerColor || '#4ff0ff', emissiveIntensity: 0.15 })
    );
    player.position.set(0, 0.7, 0);
    player.castShadow = true;
    scene.add(player);

    // Ghosts of other players (translucent capsules at their positions)
    const rig = makeGhostRig(scene, otherPlayers, p => capsuleGhost(p.color), { baseY: 0.7 });

    // Seeded RNG
    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const hazards = [];
    const hazardGeo = new THREE.SphereGeometry(0.42, 14, 10);
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xff5c7a, emissive: 0xff5c7a, emissiveIntensity: 0.5 });

    const fallSpeed = 6 + difficulty * 4;
    const spawnInterval = Math.max(0.12, 0.5 - difficulty * 0.25);
    const playerSpeed = 6.5;

    let spawnTimer = 0;
    let elapsed = 0;
    let resolved = false;

    function spawn() {
      const m = new THREE.Mesh(hazardGeo, hazardMat);
      m.position.set((rand() - 0.5) * arena * 1.9, 11, (rand() - 0.5) * arena * 1.9);
      m.castShadow = true;
      scene.add(m);
      hazards.push(m);
    }

    // Pre-fill a handful so the first second isn't empty
    for (let i = 0; i < 4; i++) {
      spawn();
      hazards[hazards.length - 1].position.y = 3 + i * 2.5;
    }

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Player move
      let vx = 0, vz = 0;
      if (keys['w'] || keys['arrowup'])    vz -= 1;
      if (keys['s'] || keys['arrowdown'])  vz += 1;
      if (keys['a'] || keys['arrowleft'])  vx -= 1;
      if (keys['d'] || keys['arrowright']) vx += 1;
      const mag = Math.hypot(vx, vz);
      if (mag > 0) { vx /= mag; vz /= mag; }
      player.position.x = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.x + vx * playerSpeed * dt));
      player.position.z = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.z + vz * playerSpeed * dt));

      // Spawn
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn();
        spawnTimer = spawnInterval * (0.7 + rand() * 0.6);
      }

      // Fall + collide
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.position.y -= fallSpeed * dt;
        if (!resolved && h.position.y < 1.2 && h.position.y > -0.2) {
          const dx = h.position.x - player.position.x;
          const dz = h.position.z - player.position.z;
          if (Math.hypot(dx, dz) < 0.75) {
            resolved = true;
            onLose('hit');
            return;
          }
        }
        if (h.position.y < -1.2) {
          scene.remove(h);
          hazards.splice(i, 1);
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onWin('survived');
      }

      rig.lerp(dt);
    }

    function dispose() {
      hazards.forEach(h => scene.remove(h));
      hazards.length = 0;
      hazardGeo.dispose();
      hazardMat.dispose();
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({ x: player.position.x, z: player.position.z }),
      setGhostState: rig.setGhostState,
    };
  }
};
