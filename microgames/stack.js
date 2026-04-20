// STACK! — a block slides side-to-side above a growing tower. Press SPACE
// to drop it. The overlap with the previous block becomes the new
// block's width. Stack N blocks to win. Miss entirely and you lose.

import { THREE, makeStudio } from '../three-setup.js';
import { makeGhostRig } from './_ghosts.js';

export default {
  key: 'stack',
  title: 'STACK!',
  description: 'Drop each block to land on the one below. Stack them all!',
  controls: 'SPACE to drop',
  thumbnail: 'microgames/thumbnails/stack.png',
  baseDuration: 7.0,

  mount(ctx) {
    const { seed, difficulty, duration, onWin, onLose, keys, me, otherPlayers = [] } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x2b0e3a, groundColor: 0x180626 });

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(7, 4, 8);
    camera.lookAt(0, 1, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const BLOCK_DEPTH = 2;
    const BLOCK_HEIGHT = 0.55;
    const SLIDE_EXTENT = 3.6;
    const COLORS = [0x4ff0ff, 0xff4fd8, 0xffd15c, 0xc64bff, 0x6fff9b];
    const START_WIDTH = 2;

    const stack = []; // { mesh, x, y, width }

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(START_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x7a3db5, emissive: 0x7a3db5, emissiveIntensity: 0.15 })
    );
    base.position.y = BLOCK_HEIGHT / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);
    stack.push({ mesh: base, x: 0, y: base.position.y, width: START_WIDTH });

    const target = 3 + Math.floor(difficulty * 1.5);
    const slideSpeed = 4 + difficulty * 2.2;

    // Ghost towers for other players — translucent columns beside mine.
    // Broadcast is just the current top Y; the column scales vertically
    // to match. Lane spacing keeps them visibly separate.
    const allIds = [me.id, ...otherPlayers.map(p => p.id)].sort();
    const laneX = (idx, n) => {
      if (n <= 1) return 0;
      const step = 4.5;
      return (idx - (n - 1) / 2) * step;
    };
    const GHOST_COL_HEIGHT = 1;  // reference — mesh.scale.y is stretched to the broadcast topY
    const rig = makeGhostRig(scene, otherPlayers, (p) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_DEPTH * 0.7, GHOST_COL_HEIGHT, BLOCK_DEPTH * 0.7),
        new THREE.MeshStandardMaterial({
          color: p.color, emissive: p.color, emissiveIntensity: 0.25,
          transparent: true, opacity: 0.4, depthWrite: false,
        })
      );
      mesh.scale.y = 0.001;   // starts at near-zero height until broadcast arrives
      return mesh;
    }, {
      baseY: 0,
      initialPosition: (p) => {
        const idx = allIds.indexOf(p.id);
        return { x: laneX(idx, allIds.length), y: 0, z: 0 };
      },
    });

    function updateGhostHeights(dt) {
      const k = Math.min(1, dt * 8);
      for (const g of rig.ghosts.values()) {
        const topY = g.data?.topY ?? 0;
        const desired = Math.max(0.001, topY);
        // Origin at y=0: scale from the base upward.
        const currentScale = g.mesh.scale.y;
        const newScale = currentScale + (desired - currentScale) * k;
        g.mesh.scale.y = newScale;
        // Because BoxGeometry is centered on origin, lift the mesh so its
        // base sits at y=0 regardless of scale.
        g.mesh.position.y = newScale / 2;
      }
    }

    let sliderX = -SLIDE_EXTENT;
    let sliderDir = 1;
    let sliderWidth = START_WIDTH;
    let slider = null;

    function spawnSlider() {
      const color = COLORS[stack.length % COLORS.length];
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(sliderWidth, BLOCK_HEIGHT, BLOCK_DEPTH),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
      );
      m.position.set(sliderX, topY() + 2, 0);
      m.castShadow = true;
      scene.add(m);
      return m;
    }

    function topY() {
      return stack.length * BLOCK_HEIGHT;
    }

    slider = spawnSlider();

    let spaceHeld = false;
    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      // Slide back and forth
      sliderX += sliderDir * slideSpeed * dt;
      if (sliderX > SLIDE_EXTENT)  { sliderX = SLIDE_EXTENT;  sliderDir = -1; }
      if (sliderX < -SLIDE_EXTENT) { sliderX = -SLIDE_EXTENT; sliderDir = 1; }
      slider.position.x = sliderX;
      slider.position.y = topY() + 1.5;

      // Camera rises with the tower
      const targetCamY = 4 + topY() * 0.8;
      camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 4);
      camera.lookAt(0, Math.max(1, topY() - 0.5), 0);

      // SPACE to drop
      const pressed = !!(keys[' '] || keys['enter']);
      if (pressed && !spaceHeld) {
        spaceHeld = true;
        const prev = stack[stack.length - 1];
        const sliderL = sliderX - sliderWidth / 2;
        const sliderR = sliderX + sliderWidth / 2;
        const prevL = prev.x - prev.width / 2;
        const prevR = prev.x + prev.width / 2;
        const overlap = Math.min(sliderR, prevR) - Math.max(sliderL, prevL);

        if (overlap <= 0.12) {
          resolved = true;
          onLose('missed');
          return;
        }

        const newX = (Math.min(sliderR, prevR) + Math.max(sliderL, prevL)) / 2;

        scene.remove(slider);
        const color = slider.material.color.getHex();
        const newWidth = overlap;
        const landed = new THREE.Mesh(
          new THREE.BoxGeometry(newWidth, BLOCK_HEIGHT, BLOCK_DEPTH),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
        );
        landed.position.set(newX, stack.length * BLOCK_HEIGHT + BLOCK_HEIGHT / 2, 0);
        landed.castShadow = true;
        landed.receiveShadow = true;
        scene.add(landed);
        stack.push({ mesh: landed, x: newX, y: landed.position.y, width: newWidth });

        if (stack.length - 1 >= target) {
          resolved = true;
          onWin('stacked');
          return;
        }

        sliderWidth = newWidth;
        sliderX = -SLIDE_EXTENT;
        sliderDir = 1;
        slider = spawnSlider();
      } else if (!pressed) {
        spaceHeld = false;
      }

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }

      rig.lerp(dt);
      updateGhostHeights(dt);
    }

    function dispose() {
      stack.forEach(b => scene.remove(b.mesh));
      stack.length = 0;
      if (slider) scene.remove(slider);
      rig.dispose();
    }

    return {
      scene, camera, update, dispose,
      getGhostState: () => ({ topY: stack.length * BLOCK_HEIGHT }),
      setGhostState: rig.setGhostState,
    };
  }
};
