// Ghost rig — shared helper for multiplayer presence inside a microgame.
//
// Each "ghost" is a translucent mesh representing another player's avatar
// in the scene. The microgame calls getGhostState() on every broadcast
// tick to tell the director what to send; setGhostState(peerId, data)
// delivers incoming state from peers.
//
// Usage inside a microgame:
//
//   import { makeGhostRig, capsuleGhost } from './_ghosts.js';
//
//   const rig = makeGhostRig(scene, otherPlayers, (p) => capsuleGhost(THREE, p.color));
//
//   // in update(dt):
//   rig.lerp(dt);
//
//   return {
//     scene, camera, update, dispose,
//     getGhostState: () => ({ x: me.position.x, z: me.position.z }),
//     setGhostState: rig.setGhostState,
//   };

import { THREE } from '../three-setup.js';

export function capsuleGhost(color) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.7, 6, 12),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.12,
      transparent: true, opacity: 0.55,
      depthWrite: false,
    })
  );
}

export function makeGhostRig(scene, otherPlayers, factory, opts = {}) {
  const { baseY = 0.7, initialPosition = null } = opts;
  const ghosts = new Map();   // peerId -> { mesh, target, seen, data }

  otherPlayers.forEach((p, i) => {
    const mesh = factory(p, i);
    const init = initialPosition
      ? initialPosition(p, i, otherPlayers.length)
      : { x: 0, y: baseY, z: 0 };
    mesh.position.set(init.x, init.y, init.z);
    // Visible from the start. Trystero's per-room peer discovery takes a
    // couple of seconds, so if we hid ghosts until the first broadcast
    // arrived, early rounds looked empty even when everything was
    // actually wired up.
    mesh.visible = true;
    scene.add(mesh);
    ghosts.set(p.id, {
      mesh,
      target: { x: init.x, y: init.y, z: init.z },
      seen: false,
      data: null,
      player: p,
    });
  });

  function setGhostState(peerId, state) {
    const g = ghosts.get(peerId);
    if (!g) return;
    if (typeof state.x === 'number') g.target.x = state.x;
    if (typeof state.y === 'number') g.target.y = state.y;
    if (typeof state.z === 'number') g.target.z = state.z;
    g.data = state;
    g.seen = true;
  }

  function lerp(dt, rate = 10) {
    const k = Math.min(1, dt * rate);
    for (const g of ghosts.values()) {
      g.mesh.position.x += (g.target.x - g.mesh.position.x) * k;
      g.mesh.position.y += (g.target.y - g.mesh.position.y) * k;
      g.mesh.position.z += (g.target.z - g.mesh.position.z) * k;
    }
  }

  function dispose() {
    for (const g of ghosts.values()) {
      scene.remove(g.mesh);
      if (g.mesh.material) g.mesh.material.dispose?.();
    }
    ghosts.clear();
  }

  return { ghosts, setGhostState, lerp, dispose };
}
