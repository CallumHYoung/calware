// SUMO! — circular platform shrinks over time. Collide with other
// players to apply pushback (both sides feel the same push thanks to
// local symmetric impulses). Fall off the edge = lose. Last on wins.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

const PUSH_RADIUS = 1.1;
const PUSH_STRENGTH = 7;
const FRICTION = 3.5;

export default {
  key: 'sumo',
  title: 'SUMO!',
  description: "Shove rivals off the platform. Don't fall off yourself.",
  controls: 'WASD / arrows',
  thumbnail: 'microgames/thumbnails/sumo.png',
  baseDuration: 7.5,
  // Without opponents to push you, SUMO is an unsatisfying "just stand
  // still and win" — skipped in solo matches.
  soloFriendly: false,

  mount(ctx) {
    const { duration, onWin, onLose, keys, me, otherPlayers = [], playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x2a1408, groundColor: 0x120805 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 10, 13);
    camera.lookAt(0, 0, 0);

    // Platform (shrinks over time)
    const START_RADIUS = 6;
    const END_RADIUS = 3.2;
    let platformRadius = START_RADIUS;

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(START_RADIUS, START_RADIUS * 0.9, 0.5, 42),
      new THREE.MeshStandardMaterial({ color: 0x623511, emissive: 0x321809, emissiveIntensity: 0.3 })
    );
    platform.position.y = 0.25;
    platform.receiveShadow = true;
    scene.add(platform);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(START_RADIUS, 0.1, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.5 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    scene.add(rim);

    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const n = allIds.length;
    const spawnAngle = (idx) => (idx / n) * Math.PI * 2;
    const spawnRadius = START_RADIUS - 1.8;

    const myIdx = allIds.indexOf(me.id);
    const myAng = spawnAngle(myIdx);

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.3 })
    );
    player.position.set(Math.cos(myAng) * spawnRadius, 1.0, Math.sin(myAng) * spawnRadius);
    player.castShadow = true;
    scene.add(player);

    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      const g = capsuleGhost(p.color);
      g.material.opacity = 0.95;
      g.material.depthWrite = true;
      return g;
    }, {
      baseY: 1.0,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        const a = spawnAngle(idx);
        return { x: Math.cos(a) * spawnRadius, y: 1.0, z: Math.sin(a) * spawnRadius };
      },
    });

    const moveSpeed = 10;
    let vx = 0, vz = 0;    // velocity (includes impulses)
    let fallen = false;
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) { rig.lerp(dt); return; }
      elapsed += dt;

      // Platform shrinks
      const shrinkFrac = Math.min(1, elapsed / duration);
      platformRadius = START_RADIUS - (START_RADIUS - END_RADIUS) * shrinkFrac;
      platform.scale.set(platformRadius / START_RADIUS, 1, platformRadius / START_RADIUS);
      rim.scale.set(platformRadius / START_RADIUS, platformRadius / START_RADIUS, 1);

      // Input → acceleration
      let ax = 0, az = 0;
      if (keys['w'] || keys['arrowup'])    az -= 1;
      if (keys['s'] || keys['arrowdown'])  az += 1;
      if (keys['a'] || keys['arrowleft'])  ax -= 1;
      if (keys['d'] || keys['arrowright']) ax += 1;
      const m = Math.hypot(ax, az);
      if (m > 0) { ax /= m; az /= m; }
      vx += ax * moveSpeed * dt;
      vz += az * moveSpeed * dt;

      // Collision pushback with ghosts — applied locally & symmetrically
      for (const g of rig.ghosts.values()) {
        const dx = player.position.x - g.mesh.position.x;
        const dz = player.position.z - g.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0 && d < PUSH_RADIUS) {
          const force = (PUSH_RADIUS - d) / PUSH_RADIUS * PUSH_STRENGTH;
          vx += (dx / d) * force * dt * 60;
          vz += (dz / d) * force * dt * 60;
        }
      }

      // Friction
      const fr = 1 - Math.min(1, FRICTION * dt);
      vx *= fr;
      vz *= fr;
      // Cap
      const vm = Math.hypot(vx, vz);
      if (vm > moveSpeed * 1.5) {
        vx = vx / vm * moveSpeed * 1.5;
        vz = vz / vm * moveSpeed * 1.5;
      }

      player.position.x += vx * dt;
      player.position.z += vz * dt;

      // Fall off?
      const distFromCenter = Math.hypot(player.position.x, player.position.z);
      if (!fallen && distFromCenter > platformRadius - 0.2) {
        fallen = true;
      }
      if (fallen) {
        player.position.y -= dt * 6;
        player.rotation.z += dt * 4;
        if (player.position.y < -3) {
          resolved = true;
          onLose('fell');
          return;
        }
      }

      // Win — survived platform + nobody to push me off
      if (elapsed >= duration && !resolved && !fallen) {
        resolved = true;
        onWin('last standing');
      }

      rig.lerp(dt);
    }

    function dispose() {
      rig.dispose();
      scene.remove(platform, rim, player);
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({
        x: player.position.x, y: player.position.y, z: player.position.z,
      }),
      setGhostState: rig.setGhostState,
    };
  }
};
