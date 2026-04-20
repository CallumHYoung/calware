// TAG! — one player is IT (red glow). Touching another player passes
// the IT status to them. Whoever is IT when time runs out loses.
// Everyone else wins.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig, capsuleGhost } from './_ghosts.js';

const TAG_RADIUS = 1.1;

export default {
  key: 'tag',
  title: 'TAG!',
  description: "Don't be IT when time runs out. IT passes on contact.",
  controls: 'WASD / arrows',
  thumbnail: 'microgames/thumbnails/tag.png',
  baseDuration: 7.0,
  // TAG needs someone to tag you (or vice versa) — alone, you start
  // as IT, have no one to pass it to, and auto-lose when the timer
  // expires. Skipped in solo matches.
  soloFriendly: false,

  mount(ctx) {
    const { duration, onWin, onLose, keys, me, otherPlayers = [], playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a2a30, groundColor: 0x0c1518 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 10, 14);
    camera.lookAt(0, 0, 0);

    const arena = 7;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(arena + 0.05, 0.08, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x6fff9b, emissive: 0x6fff9b, emissiveIntensity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const n = allIds.length;
    const spawnAngle = (idx) => (idx / n) * Math.PI * 2;
    const spawnRadius = arena - 1;

    const myIdx = allIds.indexOf(me.id);
    const myAng = spawnAngle(myIdx);

    // Initial IT is the first player in sorted order — deterministic.
    let amIt = (allIds[0] === me.id);

    const playerColor3 = new THREE.Color(playerColor || '#ff4fd8');
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor3, emissive: playerColor3, emissiveIntensity: 0.25 })
    );
    player.position.set(Math.cos(myAng) * spawnRadius, 0.7, Math.sin(myAng) * spawnRadius);
    player.castShadow = true;
    scene.add(player);

    function refreshPlayerColor() {
      if (amIt) {
        player.material.color.set(0xff5c7a);
        player.material.emissive.set(0xff5c7a);
        player.material.emissiveIntensity = 0.9;
      } else {
        player.material.color.copy(playerColor3);
        player.material.emissive.copy(playerColor3);
        player.material.emissiveIntensity = 0.25;
      }
    }
    refreshPlayerColor();

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

    function refreshGhostColors() {
      for (const g of rig.ghosts.values()) {
        const theyIt = !!g.data?.isIt;
        if (theyIt) {
          g.mesh.material.color.set(0xff5c7a);
          g.mesh.material.emissive.set(0xff5c7a);
          g.mesh.material.emissiveIntensity = 0.9;
        } else {
          g.mesh.material.color.set(g.player.color);
          g.mesh.material.emissive.set(g.player.color);
          g.mesh.material.emissiveIntensity = 0.15;
        }
      }
    }

    const speed = 5.8;
    let elapsed = 0;
    let resolved = false;
    let tagCooldown = 0;  // short immunity after becoming IT (prevents instant-retag)

    function update(dt) {
      if (resolved) { rig.lerp(dt); return; }
      elapsed += dt;
      tagCooldown = Math.max(0, tagCooldown - dt);

      let vx = 0, vz = 0;
      if (keys['w'] || keys['arrowup'])    vz -= 1;
      if (keys['s'] || keys['arrowdown'])  vz += 1;
      if (keys['a'] || keys['arrowleft'])  vx -= 1;
      if (keys['d'] || keys['arrowright']) vx += 1;
      const m = Math.hypot(vx, vz);
      if (m > 0) { vx /= m; vz /= m; }
      player.position.x = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.x + vx * speed * dt));
      player.position.z = Math.max(-arena + 0.4, Math.min(arena - 0.4, player.position.z + vz * speed * dt));

      // If I'm IT and collide with a ghost, tag them
      if (amIt && tagCooldown <= 0) {
        for (const g of rig.ghosts.values()) {
          const d = player.position.distanceTo(g.mesh.position);
          if (d < TAG_RADIUS) {
            amIt = false;
            // Broadcast the tag by including tagged in our ghost state
            lastTagged = g.player.id;
            tagCooldown = 0.6;
            refreshPlayerColor();
            break;
          }
        }
      }

      // If someone's broadcast says they tagged me, become IT
      if (!amIt) {
        for (const g of rig.ghosts.values()) {
          if (g.data?.tagged === me.id && g.data?.tagAt > lastTaggedAt) {
            amIt = true;
            lastTaggedAt = g.data.tagAt;
            tagCooldown = 0.6;
            refreshPlayerColor();
            break;
          }
        }
      }

      refreshGhostColors();

      if (elapsed >= duration && !resolved) {
        resolved = true;
        if (amIt) onLose('still IT');
        else      onWin('escaped');
      }

      rig.lerp(dt);
    }

    let lastTagged = null;
    let lastTaggedAt = 0;
    let broadcastTick = 0;

    function dispose() {
      rig.dispose();
      scene.remove(player);
      scene.remove(ring);
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => {
        broadcastTick++;
        return {
          x: player.position.x, y: player.position.y, z: player.position.z,
          isIt: amIt,
          tagged: lastTagged,
          // Increment a timestamp each broadcast so receivers see fresh tags
          tagAt: lastTagged ? broadcastTick : 0,
        };
      },
      setGhostState: rig.setGhostState,
    };
  }
};
