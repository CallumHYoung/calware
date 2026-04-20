// PUNCH! — a target appears in the arena. Aim with the mouse, click to punch.
// Win: click the target before time runs out. Lose: miss / time out.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig } from './_ghosts.js';

export default {
  key: 'punch',
  title: 'PUNCH!',
  description: 'Aim with the mouse. Click the glowing target before time runs out.',
  controls: 'Mouse — click to punch',
  thumbnail: 'microgames/thumbnails/punch.png',
  baseDuration: 4.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse, playerColor, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a0a3a, groundColor: 0x140825 });

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 2, 0);

    // RNG
    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    // Target — a glowing sphere on a small pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.4, 18),
      new THREE.MeshStandardMaterial({ color: 0x3d1f5e })
    );
    const targetX = (rand() - 0.5) * 4;
    const targetY = 1.5 + rand() * 1.2;
    pedestal.position.set(targetX, targetY - 0.9, 0);
    pedestal.castShadow = true;
    scene.add(pedestal);

    const target = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 0.7 })
    );
    target.position.set(targetX, targetY, 0);
    target.castShadow = true;
    scene.add(target);

    // Glove — follows mouse (NDC coords). Z plane = 0.
    const glove = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.3 })
    );
    glove.castShadow = true;
    scene.add(glove);

    // Ghost gloves — small translucent orbs at each opponent's glove pos.
    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      return new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.28, 0),
        new THREE.MeshStandardMaterial({
          color: p.color, emissive: p.color, emissiveIntensity: 0.35,
          transparent: true, opacity: 0.55, depthWrite: false,
        })
      );
    }, {
      baseY: targetY,
      initialPosition: (p, i, n) => ({
        x: ((i + 1) - (n + 1) / 2) * 1.4,
        y: targetY + 1.2,
        z: 0,
      }),
    });

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0

    let elapsed = 0;
    let resolved = false;
    let punchAnim = 0; // 0..1 burst when clicked
    let hitAnim = 0;   // 0..1 burst after a successful hit (visual feedback)

    // Difficulty: target drifts and shrinks.
    const drift = 0.4 + difficulty * 0.8;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Target oscillates
      target.position.x = targetX + Math.sin(elapsed * drift * 2) * 0.8;
      target.position.y = targetY + Math.cos(elapsed * drift * 1.4) * 0.4;
      pedestal.position.x = target.position.x;
      pedestal.position.y = target.position.y - 0.9;

      // Glove follows mouse on z=0 plane
      ndc.set(mouse.x, mouse.y);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, hit);
      if (hit) glove.position.lerp(hit, 0.35);

      if (punchAnim > 0) {
        punchAnim -= dt * 3;
        const s = 1 + Math.max(0, punchAnim) * 0.8;
        glove.scale.setScalar(s);
      } else {
        glove.scale.setScalar(1);
      }

      // Click to punch
      if (mouse.clicked && !resolved) {
        mouse.clicked = false;
        punchAnim = 1;
        const d = glove.position.distanceTo(target.position);
        if (d < 0.85) {
          resolved = true;
          hitAnim = 1;
          // Target celebrates the hit: flash green, puff up.
          target.material.color.set(0x6fff9b);
          target.material.emissive.set(0x6fff9b);
          target.material.emissiveIntensity = 1.2;
          onWin('hit');
        }
      }

      // Hit celebration — swells the target and fades as it dies out.
      if (hitAnim > 0) {
        hitAnim = Math.max(0, hitAnim - dt * 1.5);
        const s = 1 + hitAnim * 1.4;
        target.scale.setScalar(s);
        target.material.opacity = hitAnim;
        target.material.transparent = true;
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }

      rig.lerp(dt);
    }

    function dispose() {
      scene.remove(target, pedestal, glove);
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({
        x: glove.position.x,
        y: glove.position.y,
        z: glove.position.z,
      }),
      setGhostState: rig.setGhostState,
    };
  }
};
