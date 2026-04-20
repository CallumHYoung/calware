// JUMP! — walls sweep past. Jump over each one. Survive the duration to win.
// Input: SPACE (or W / up arrow) to jump. Lose: wall hits you while grounded.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

export default {
  key: 'jump',
  title: 'JUMP!',
  description: 'Jump over every wall. Don\'t be standing when one hits you.',
  controls: 'SPACE (or W / up) to jump',
  thumbnail: 'microgames/thumbnails/jump.png',
  baseDuration: 5.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys, playerColor, me, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x0f1e3e, groundColor: 0x0a142a });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(5, 3.2, 7);
    camera.lookAt(0, 1, 0);

    // Runway
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.15, 2),
      new THREE.MeshStandardMaterial({ color: 0x4ff0ff, emissive: 0x4ff0ff, emissiveIntensity: 0.1 })
    );
    runway.position.y = 0.075;
    runway.receiveShadow = true;
    scene.add(runway);

    // Player
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.6, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.2 })
    );
    player.position.set(0, 0.6, 0);
    player.castShadow = true;
    scene.add(player);

    // Ghosts: other players run on adjacent z-slots so you can see them
    // jumping next to you. They're in our instanced scene but the walls
    // don't "hit" them — this is purely visual presence.
    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const laneZ = (idx, n) => {
      if (n <= 1) return 0;
      const step = 1.6;
      return (idx - (n - 1) / 2) * step;
    };
    const rig = makeGhostRig(scene, otherPlayers, (p) => capsuleGhost(p.color), {
      baseY: 0.6,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        return { x: 0, y: 0.6, z: laneZ(idx, allIds.length) };
      },
    });

    // RNG
    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const walls = [];
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xff5c7a, emissive: 0xff5c7a, emissiveIntensity: 0.35 });

    const wallSpeed = 6 + difficulty * 4;
    const spawnEvery = Math.max(0.9, 1.8 - difficulty * 0.4);

    function spawnWall(x) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 1.8), wallMat);
      w.position.set(x, 0.55, 0);
      w.castShadow = true;
      scene.add(w);
      walls.push(w);
    }

    // Seed two walls in front at staggered distances
    spawnWall(8);
    spawnWall(8 + spawnEvery * wallSpeed);

    // Jump state
    let yVel = 0;
    let grounded = true;
    const gravity = 24;
    const jumpImpulse = 8.5;

    // Space edge-detect
    let spaceHeld = false;

    let elapsed = 0;
    let spawnTimer = spawnEvery * 2;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Input: space / up / w for jump
      const jumpPressed = !!(keys[' '] || keys['w'] || keys['arrowup']);
      if (jumpPressed && !spaceHeld && grounded) {
        yVel = jumpImpulse;
        grounded = false;
      }
      spaceHeld = jumpPressed;

      // Physics
      if (!grounded) {
        yVel -= gravity * dt;
        player.position.y += yVel * dt;
        if (player.position.y <= 0.6) {
          player.position.y = 0.6;
          yVel = 0;
          grounded = true;
        }
      }

      // Walls move toward player (-x direction)
      for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        w.position.x -= wallSpeed * dt;
        // Collision: wall centered near x=0 and player low
        if (!resolved && Math.abs(w.position.x - player.position.x) < 0.35) {
          if (player.position.y < 1.2) {
            resolved = true;
            onLose('hit');
            return;
          }
        }
        if (w.position.x < -6) {
          scene.remove(w);
          walls.splice(i, 1);
        }
      }

      // Maintain a pipeline of walls
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const jitter = (rand() - 0.5) * 0.6;
        spawnWall(10 + jitter);
        spawnTimer = spawnEvery * (0.85 + rand() * 0.3);
      }

      // Subtle camera bob
      camera.position.y = 3.2 + Math.sin(elapsed * 4) * 0.04;

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onWin('survived');
      }

      rig.lerp(dt);
    }

    function dispose() {
      walls.forEach(w => scene.remove(w));
      walls.length = 0;
      wallMat.dispose();
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      // Broadcast only Y (jump height). Each peer places ghosts at its
      // own locally-computed lane-Z, so peers don't need to agree on
      // rendering layout.
      getGhostState: () => ({ y: player.position.y }),
      setGhostState: rig.setGhostState,
    };
  }
};
