// SWAT! — several bugs fly lazily around the scene. Click each one
// before the timer to win. Harder than PUNCH because you need multiple
// hits, but less movement-intensive than COLLECT.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig } from './_ghosts.js';

export default {
  key: 'swat',
  title: 'SWAT!',
  description: 'Click every bug before the timer ends.',
  controls: 'Mouse — click to swat',
  thumbnail: 'microgames/thumbnails/swat.png',
  baseDuration: 5.5,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, mouse, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x1a2030, groundColor: 0x0d1520 });

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 2.2, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const bugCount = 3 + Math.floor(difficulty * 2);
    const bugs = [];
    const bugGeo = new THREE.SphereGeometry(0.32, 12, 10);
    const bugMat = new THREE.MeshStandardMaterial({ color: 0x6fff9b, emissive: 0x6fff9b, emissiveIntensity: 0.4 });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    });

    for (let i = 0; i < bugCount; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bugGeo, bugMat);
      body.castShadow = true;
      g.add(body);
      const wingL = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), wingMat);
      wingL.position.set(-0.28, 0.05, 0);
      wingL.rotation.y = Math.PI / 4;
      g.add(wingL);
      const wingR = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), wingMat);
      wingR.position.set(0.28, 0.05, 0);
      wingR.rotation.y = -Math.PI / 4;
      g.add(wingR);
      const bx = (rand() - 0.5) * 5;
      const by = 1.4 + rand() * 2.6;
      const bz = (rand() - 0.5) * 2.5;
      g.position.set(bx, by, bz);
      g.userData = {
        hx: bx, hy: by, hz: bz,
        phase: rand() * Math.PI * 2,
        amp: 0.4 + difficulty * 0.3 + rand() * 0.3,
        alive: true,
        wings: [wingL, wingR],
      };
      scene.add(g);
      bugs.push(g);
    }

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    // Ghost cursors — show where each opponent is aiming. We project
    // each peer's broadcast mouse-NDC onto a reference plane at z=1.5
    // (roughly where bugs live) so the rings overlay meaningfully.
    const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);
    const cursorHit = new THREE.Vector3();

    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.32, 18),
        new THREE.MeshBasicMaterial({
          color: p.color, side: THREE.DoubleSide,
          transparent: true, opacity: 0.75, depthTest: false,
        })
      );
      ring.renderOrder = 999;
      return ring;
    }, {
      baseY: 2.5,
      initialPosition: (_, i, n) => ({ x: ((i + 0.5) - n / 2) * 1.2, y: 2.5, z: 1.5 }),
    });

    function projectMyCursor() {
      ndc.set(mouse.x, mouse.y);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(cursorPlane, cursorHit);
    }

    let elapsed = 0;
    let resolved = false;
    let remaining = bugCount;

    function findBugGroup(obj) {
      let cur = obj;
      while (cur && cur.parent && cur.parent !== scene) cur = cur.parent;
      return cur && cur.userData && cur.userData.alive !== undefined ? cur : null;
    }

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      for (const bug of bugs) {
        if (!bug.userData.alive) continue;
        const u = bug.userData;
        u.phase += dt * 2.5;
        bug.position.x = u.hx + Math.sin(u.phase) * u.amp;
        bug.position.y = u.hy + Math.cos(u.phase * 1.3) * (u.amp * 0.5);
        bug.position.z = u.hz + Math.sin(u.phase * 0.7) * (u.amp * 0.6);
        const flap = Math.sin(elapsed * 32 + u.phase) * 0.35;
        u.wings[0].scale.y = 1 + flap;
        u.wings[1].scale.y = 1 + flap;
      }

      if (mouse.clicked) {
        mouse.clicked = false;
        ndc.set(mouse.x, mouse.y);
        raycaster.setFromCamera(ndc, camera);
        const aliveBugs = bugs.filter(b => b.userData.alive);
        const hits = raycaster.intersectObjects(aliveBugs, true);
        if (hits.length > 0) {
          const target = findBugGroup(hits[0].object);
          if (target && target.userData.alive) {
            target.userData.alive = false;
            target.visible = false;
            remaining--;
            if (remaining === 0) {
              resolved = true;
              onWin('all');
              return;
            }
          }
        }
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }

      rig.lerp(dt);
    }

    function dispose() {
      bugs.forEach(b => scene.remove(b));
      bugs.length = 0;
      bugGeo.dispose();
      bugMat.dispose();
      wingMat.dispose();
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => {
        const h = projectMyCursor();
        if (!h) return null;
        return { x: cursorHit.x, y: cursorHit.y, z: cursorHit.z };
      },
      setGhostState: rig.setGhostState,
    };
  }
};
