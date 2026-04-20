// BUZZER! — shared scene. A stoplight goes red → yellow → GREEN. First
// player to press SPACE after green wins. Press before green and you
// lose immediately.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'buzzer',
  title: 'BUZZER!',
  description: 'Wait for the GREEN light. First to press SPACE wins — press too early and you lose!',
  controls: 'SPACE — but only after green!',
  thumbnail: 'microgames/thumbnails/buzzer.png',
  baseDuration: 4.5,

  mount(ctx) {
    const { duration, onWin, onLose, keys, me, otherPlayers = [], playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x16091e, groundColor: 0x080410 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 4, 9);
    camera.lookAt(0, 2.5, 0);

    // Deterministic lane ordering — all peers agree
    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const n = allIds.length;
    const laneX = (idx) => (idx - (n - 1) / 2) * 1.6;
    const myIdx = allIds.indexOf(me.id);

    // Player podium
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.3 })
    );
    player.position.set(laneX(myIdx), 0.7, 2);
    player.castShadow = true;
    scene.add(player);

    // Stoplight housing
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 3, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x1a0826 })
    );
    box.position.set(0, 3.3, -1.5);
    box.castShadow = true;
    scene.add(box);

    const lamps = [0xff5c7a, 0xffd15c, 0x6fff9b].map((c, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x000, emissiveIntensity: 0 })
      );
      m.position.set(0, 4.1 - i * 0.9, -1.1);
      scene.add(m);
      m.userData.color = c;
      return m;
    });

    function light(idx) {
      lamps.forEach((l, i) => {
        if (i === idx) {
          l.material.color.setHex(l.userData.color);
          l.material.emissive.setHex(l.userData.color);
          l.material.emissiveIntensity = 1;
        } else {
          l.material.color.setHex(0x222);
          l.material.emissive.setHex(0x000);
          l.material.emissiveIntensity = 0;
        }
      });
    }

    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      const g = capsuleGhost(p.color);
      g.material.opacity = 0.95;
      g.material.depthWrite = true;
      return g;
    }, {
      baseY: 0.7,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        return { x: laneX(idx), y: 0.7, z: 2 };
      },
    });

    // Stoplight timing — deterministic so every peer agrees
    const RED_DURATION = 1.2;
    const YELLOW_DURATION = 1.0;
    // GREEN fires at t = RED + YELLOW

    let spaceHeld = !!keys[' '];
    let elapsed = 0;
    let resolved = false;
    let amBuzzed = false;
    const greenAt = RED_DURATION + YELLOW_DURATION;

    function update(dt) {
      if (resolved) { rig.lerp(dt); return; }
      elapsed += dt;

      if (elapsed < RED_DURATION) light(0);
      else if (elapsed < greenAt) light(1);
      else light(2);

      // Did anyone else buzz first?
      if (!amBuzzed) {
        for (const g of rig.ghosts.values()) {
          if (g.data && g.data.buzzed) {
            resolved = true;
            player.material.emissiveIntensity = 0.1;
            onLose('someone else was faster');
            return;
          }
        }
      }

      // My input
      const spaceNow = !!keys[' '];
      if (spaceNow && !spaceHeld) {
        if (elapsed < greenAt) {
          resolved = true;
          player.material.color.set(0xff5c7a);
          player.material.emissive.set(0xff5c7a);
          onLose('too early');
          return;
        } else if (!amBuzzed) {
          amBuzzed = true;
          resolved = true;
          player.material.color.set(0x6fff9b);
          player.material.emissive.set(0x6fff9b);
          onWin('first');
          return;
        }
      }
      spaceHeld = spaceNow;

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('no press');
      }

      rig.lerp(dt);
    }

    function dispose() {
      rig.dispose();
      scene.remove(player, box);
      lamps.forEach(l => scene.remove(l));
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({
        x: player.position.x, y: player.position.y, z: player.position.z,
        buzzed: amBuzzed,
      }),
      setGhostState: rig.setGhostState,
    };
  }
};
