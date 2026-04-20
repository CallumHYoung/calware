// RACE! — a SHARED-SCENE microgame. Unlike DODGE / COLLECT where each
// player has their own instanced arena, here every player is in the
// same 3D runway. You see the real other players running next to you.
// First to cross the finish line wins; everyone else loses a life.
//
// Protocol: the director already streams per-player { x, z, ... } via
// the ghost channel at 10 Hz. We piggyback a `finished` flag on the
// broadcast — when someone's state arrives with finished=true, any
// local player who hasn't crossed yet instantly loses.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'race',
  title: 'RACE!',
  description: 'Sprint to the finish line. First across wins — everyone else loses a life!',
  controls: 'WASD / arrows to sprint',
  thumbnail: 'microgames/thumbnails/race.png',
  baseDuration: 6.5,

  mount(ctx) {
    const {
      duration, onWin, onLose,
      keys, playerColor, me, otherPlayers = [],
    } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0c2040, groundColor: 0x061228 });

    // Track layout -------------------------------------------------
    const TRACK_LENGTH = 30;
    const FINISH_Z = -TRACK_LENGTH + 2;     // player runs toward -z
    const START_Z = 0;
    const LANE_SPACING = 2;

    // All players in a deterministic order so every peer agrees on
    // lane assignment regardless of join order.
    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const totalPlayers = allIds.length;
    const laneX = (idx) => (idx - (totalPlayers - 1) / 2) * LANE_SPACING;

    // Track surface
    const trackWidth = Math.max(6, totalPlayers * LANE_SPACING + 4);
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 0.12, TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x123a5e, emissive: 0x1e6ba1, emissiveIntensity: 0.08 })
    );
    track.position.set(0, 0.06, -TRACK_LENGTH / 2 + 2);
    track.receiveShadow = true;
    scene.add(track);

    // Lane dividers
    const dividerMat = new THREE.MeshStandardMaterial({ color: 0x4ff0ff, emissive: 0x4ff0ff, emissiveIntensity: 0.3, transparent: true, opacity: 0.45 });
    for (let i = 0; i <= totalPlayers; i++) {
      const x = laneX(i) - LANE_SPACING / 2;
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, TRACK_LENGTH), dividerMat);
      d.position.set(x, 0.13, -TRACK_LENGTH / 2 + 2);
      scene.add(d);
    }

    // Start line
    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 0.02, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 })
    );
    startLine.position.set(0, 0.14, START_Z);
    scene.add(startLine);

    // Finish line — glowing gate
    const finishLine = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 0.04, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.95 })
    );
    finishLine.position.set(0, 0.15, FINISH_Z);
    scene.add(finishLine);

    const leftPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 4, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.6 })
    );
    leftPillar.position.set(-trackWidth / 2 + 0.5, 2, FINISH_Z);
    leftPillar.castShadow = true;
    scene.add(leftPillar);
    const rightPillar = leftPillar.clone();
    rightPillar.position.x = trackWidth / 2 - 0.5;
    scene.add(rightPillar);
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth - 1, 0.35, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.7 })
    );
    topBar.position.set(0, 4, FINISH_Z);
    scene.add(topBar);

    // Player avatar ------------------------------------------------
    const myIdx = allIds.indexOf(me.id);
    const myLaneX = laneX(myIdx);

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.25 })
    );
    player.position.set(myLaneX, 0.7, START_Z - 1);
    player.castShadow = true;
    scene.add(player);

    // Other players — in RACE they're real competitors, not fading
    // ghosts. Use a solid capsule at their starting lane. The rig's
    // initialPosition callback places each mesh deterministically so
    // everyone lines up even before the first broadcast arrives.
    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      return new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
        new THREE.MeshStandardMaterial({
          color: p.color, emissive: p.color, emissiveIntensity: 0.25,
        })
      );
    }, {
      baseY: 0.7,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        return { x: laneX(idx), y: 0.7, z: START_Z - 1 };
      },
    });

    console.log('[race] mount — me.id=%s other=%d allIds=%o myIdx=%d myLane=%f',
      me.id, otherPlayers.length, allIds, allIds.indexOf(me.id), laneX(allIds.indexOf(me.id)));

    // Camera — third person chase
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
    camera.position.set(myLaneX, 4.2, START_Z + 5);
    camera.lookAt(myLaneX, 1, START_Z - 3);

    // Movement -----------------------------------------------------
    const speed = 8.5;
    let elapsed = 0;
    let resolved = false;
    let amFinished = false;

    function finishIfFirst() {
      // Check if any ghost arrived with finished=true before me.
      for (const g of rig.ghosts.values()) {
        if (g.data && g.data.finished) {
          resolved = true;
          onLose('beaten');
          return true;
        }
      }
      return false;
    }

    function update(dt) {
      if (resolved) { rig.lerp(dt); return; }
      elapsed += dt;

      // Movement: z decreases on W/up, x lateral on A/D within lane bounds
      let vx = 0, vz = 0;
      if (keys['w'] || keys['arrowup'])    vz -= 1;
      if (keys['s'] || keys['arrowdown'])  vz += 1;
      if (keys['a'] || keys['arrowleft'])  vx -= 1;
      if (keys['d'] || keys['arrowright']) vx += 1;
      const m = Math.hypot(vx, vz);
      if (m > 0) { vx /= m; vz /= m; }
      player.position.x = Math.max(-trackWidth / 2 + 0.4, Math.min(trackWidth / 2 - 0.4, player.position.x + vx * speed * dt));
      player.position.z = Math.max(FINISH_Z - 0.5, Math.min(START_Z + 1, player.position.z + vz * speed * dt));

      // Did I cross the finish?
      if (!amFinished && player.position.z <= FINISH_Z) {
        amFinished = true;
        resolved = true;
        onWin('first');
      }

      // Did somebody else cross first?
      if (!amFinished && finishIfFirst()) return;

      // Timer out — everyone left on the track loses
      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }

      // Camera follows
      const tx = player.position.x;
      const tz = player.position.z + 5;
      camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 4);
      camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 4);
      camera.position.y = 4.2;
      camera.lookAt(player.position.x, 1, player.position.z - 3);

      rig.lerp(dt);
    }

    function dispose() {
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({
        x: player.position.x,
        z: player.position.z,
        finished: amFinished,
      }),
      setGhostState: rig.setGhostState,
    };
  }
};
