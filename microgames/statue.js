// STATUE! — do nothing. Press no keys. Survive the duration to win.
// Any new keypress during the round loses. Keys already held at mount
// time (e.g. a stray SPACE carried over from JUMP) don't count — only
// edge-triggered presses do.

import { THREE, makeStudio } from '../three-setup.js';

const WATCHED_KEYS = [
  'w','a','s','d',' ',
  'arrowup','arrowdown','arrowleft','arrowright',
  'shift','enter','e','q','r','f',
];

export default {
  key: 'statue',
  title: 'STATUE!',
  description: "Don't move. Don't press any keys. Just stand there.",
  controls: 'Hands off',
  thumbnail: 'microgames/thumbnails/statue.png',
  baseDuration: 4.0,

  mount(ctx) {
    const { duration, onWin, onLose, keys, playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x15091e, groundColor: 0x0a0514 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 1, 0);

    // Player silhouette
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 0.9, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.3 })
    );
    player.position.set(0, 0.85, 0);
    player.castShadow = true;
    scene.add(player);

    // Pedestal so it really feels like a statue
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a1250 })
    );
    pedestal.position.y = 0.2;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    // Sweeping "motion sensor" beam for tension
    const sensor = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 4, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff5c7a, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
    );
    sensor.position.set(0, 2.5, 0);
    sensor.rotation.x = Math.PI;
    scene.add(sensor);

    // Snapshot held keys at mount — only detect *new* presses.
    const prevState = {};
    for (const k of WATCHED_KEYS) prevState[k] = !!keys[k];

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Orbit sensor cone around the player for visual tension
      const ang = elapsed * 1.5;
      sensor.position.set(Math.cos(ang) * 2.5, 2.5, Math.sin(ang) * 2.5);
      sensor.lookAt(player.position);
      sensor.rotateX(Math.PI);

      // Detect key transitions: released -> pressed is movement
      for (const k of WATCHED_KEYS) {
        const now = !!keys[k];
        if (now && !prevState[k]) {
          resolved = true;
          player.material.color.set(0xff5c7a);
          player.material.emissive.set(0xff5c7a);
          onLose('moved');
          return;
        }
        prevState[k] = now;
      }

      if (elapsed >= duration) {
        resolved = true;
        player.material.color.set(0x6fff9b);
        player.material.emissive.set(0x6fff9b);
        onWin('held still');
      }
    }

    function dispose() {
      scene.remove(player, pedestal, sensor);
      player.geometry.dispose();
      player.material.dispose();
      pedestal.geometry.dispose();
      pedestal.material.dispose();
      sensor.geometry.dispose();
      sensor.material.dispose();
    }

    return { scene, camera, update, dispose };
  }
};
