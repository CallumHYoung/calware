// KING! — shared scene with a glowing zone. Stand inside. Player with
// the most total time-in-zone when the timer ends wins.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'king',
  title: 'KING!',
  description: 'Spend the most time inside the glowing zone. Push rivals out.',
  controls: 'WASD / arrows',
  thumbnail: 'microgames/thumbnails/king.png',
  baseDuration: 7.0,

  mount(ctx) {
    const { duration, onWin, onLose, keys, me, otherPlayers = [], playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x2a0a3a, groundColor: 0x140520 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 10, 14);
    camera.lookAt(0, 0, 0);

    const arena = 7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(arena + 0.05, 0.08, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0xc64bff, emissive: 0xc64bff, emissiveIntensity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    // Zone
    const ZONE_RADIUS = 1.8;
    const zone = new THREE.Mesh(
      new THREE.CircleGeometry(ZONE_RADIUS, 36),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.55, transparent: true, opacity: 0.55 })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.12;
    scene.add(zone);

    const zoneRing = new THREE.Mesh(
      new THREE.TorusGeometry(ZONE_RADIUS, 0.06, 8, 36),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 1 })
    );
    zoneRing.rotation.x = Math.PI / 2;
    zoneRing.position.y = 0.14;
    scene.add(zoneRing);

    // Deterministic lane ordering
    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const n = allIds.length;
    const spawnAngle = (idx) => (idx / n) * Math.PI * 2;
    const spawnRadius = arena - 1;

    const myIdx = allIds.indexOf(me.id);
    const myAng = spawnAngle(myIdx);

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.25 })
    );
    player.position.set(Math.cos(myAng) * spawnRadius, 0.7, Math.sin(myAng) * spawnRadius);
    player.castShadow = true;
    scene.add(player);

    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      const g = capsuleGhost(p.color);
      g.material.opacity = 0.95;
      g.material.depthWrite = true;
      return g;
    }, {
      baseY: 0.7,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        const a = spawnAngle(idx);
        return { x: Math.cos(a) * spawnRadius, y: 0.7, z: Math.sin(a) * spawnRadius };
      },
    });

    const speed = 5.5;
    let myTime = 0;
    let elapsed = 0;
    let resolved = false;

    function inZone(x, z) {
      return Math.hypot(x, z) < ZONE_RADIUS;
    }

    function update(dt) {
      if (resolved) { rig.lerp(dt); return; }
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

      if (inZone(player.position.x, player.position.z)) myTime += dt;

      // Zone pulse
      const pulse = 0.3 + 0.15 * Math.sin(elapsed * 3);
      zone.material.opacity = 0.4 + pulse;

      if (elapsed >= duration && !resolved) {
        resolved = true;
        // Compare my time vs each ghost's reported time
        let best = myTime;
        let bestId = me.id;
        for (const g of rig.ghosts.values()) {
          const t = g.data?.timeInZone ?? 0;
          if (t > best) { best = t; bestId = g.player.id; }
        }
        if (bestId === me.id) onWin('most time');
        else                  onLose('outlasted');
      }

      rig.lerp(dt);
    }

    function dispose() {
      rig.dispose();
      scene.remove(ring, zone, zoneRing, player);
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({
        x: player.position.x, y: player.position.y, z: player.position.z,
        timeInZone: myTime,
      }),
      setGhostState: rig.setGhostState,
    };
  }
};
