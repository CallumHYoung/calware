// COLLECT! — run around an arena gathering glowing orbs. Collect them
// all before the timer to win. Different from DODGE in that you're
// pursuing targets instead of avoiding them.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'collect',
  title: 'COLLECT!',
  description: 'Grab every orb before the timer runs out.',
  controls: 'WASD / arrows to move',
  thumbnail: 'microgames/thumbnails/collect.png',
  baseDuration: 5.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys, playerColor, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0d2238, groundColor: 0x07172a });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 11, 14);
    camera.lookAt(0, 0.5, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const arena = 7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(arena + 0.1, 0.08, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.45 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.2 })
    );
    player.position.set(0, 0.7, 0);
    player.castShadow = true;
    scene.add(player);

    // Ghost avatars for the other players
    const rig = makeGhostRig(scene, otherPlayers, p => capsuleGhost(p.color), { baseY: 0.7 });

    const orbCount = Math.min(6, 3 + Math.floor(difficulty * 2));
    const orbs = [];
    const orbGeo = new THREE.IcosahedronGeometry(0.35, 1);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.85 });

    for (let i = 0; i < orbCount; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set((rand() - 0.5) * arena * 1.7, 0.6, (rand() - 0.5) * arena * 1.7);
      orb.castShadow = true;
      orb.userData.phase = rand() * Math.PI * 2;
      scene.add(orb);
      orbs.push(orb);
    }

    const speed = 7 + difficulty * 1.5;
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      let vx = 0, vz = 0;
      if (keys['w'] || keys['arrowup'])    vz -= 1;
      if (keys['s'] || keys['arrowdown'])  vz += 1;
      if (keys['a'] || keys['arrowleft'])  vx -= 1;
      if (keys['d'] || keys['arrowright']) vx += 1;
      const m = Math.hypot(vx, vz);
      if (m > 0) { vx /= m; vz /= m; }
      player.position.x = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.x + vx * speed * dt));
      player.position.z = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.z + vz * speed * dt));

      for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        orb.rotation.y += dt * 2;
        orb.position.y = 0.6 + Math.sin(elapsed * 3 + orb.userData.phase) * 0.15;
        const dx = orb.position.x - player.position.x;
        const dz = orb.position.z - player.position.z;
        if (Math.hypot(dx, dz) < 0.8) {
          scene.remove(orb);
          orbs.splice(i, 1);
        }
      }

      if (!resolved && orbs.length === 0) {
        resolved = true;
        onWin('all');
        return;
      }
      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }

      rig.lerp(dt);
    }

    function dispose() {
      orbs.forEach(o => scene.remove(o));
      orbs.length = 0;
      orbGeo.dispose();
      orbMat.dispose();
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({ x: player.position.x, z: player.position.z }),
      setGhostState: rig.setGhostState,
    };
  }
};
