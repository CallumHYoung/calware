// MAZE! — navigate a small 3D maze with WASD to reach the goal.

import { THREE, makeStudio } from '../three-setup.js';

// Hand-authored 9x7 mazes. '#' = wall, '.' = floor, 'S' = start, 'G' = goal.
const MAZES = [
  [
    '#########',
    '#S..#...#',
    '###.#.#.#',
    '#...#.#.#',
    '#.###.###',
    '#.....#G#',
    '#########',
  ],
  [
    '#########',
    '#S#.....#',
    '#.#.###.#',
    '#.#.#...#',
    '#.#.#.###',
    '#...#..G#',
    '#########',
  ],
  [
    '#########',
    '#S......#',
    '#.#####.#',
    '#.#...#.#',
    '#.#.#.#.#',
    '#...#..G#',
    '#########',
  ],
];

export default {
  key: 'maze',
  title: 'MAZE!',
  description: 'Navigate to the glowing goal.',
  controls: 'WASD / arrows',
  thumbnail: 'microgames/thumbnails/maze.png',
  baseDuration: 8.0,

  mount(ctx) {
    const { seed, duration, onWin, onLose, keys, playerColor } = ctx;

    const scene = new THREE.Scene();
    makeStudio(scene, { skyColor: 0x14152c, groundColor: 0x08091a });

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 11, 7);
    camera.lookAt(0, 0, 0);

    let r = (seed >>> 0) || 1;
    const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 0xffffffff; };

    const layout = MAZES[Math.floor(rand() * MAZES.length)];
    const rows = layout.length;
    const cols = layout[0].length;
    const cell = 1;
    const wallHeight = 1.2;
    const offX = -(cols - 1) / 2 * cell;
    const offZ = -(rows - 1) / 2 * cell;

    let startX = 0, startZ = 0, goalX = 0, goalZ = 0;
    const walls = [];
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d1f5e, emissive: 0x3d1f5e, emissiveIntensity: 0.2 });
    const wallGeo = new THREE.BoxGeometry(cell, wallHeight, cell);

    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const ch = layout[ry][cx];
        const wx = offX + cx * cell;
        const wz = offZ + ry * cell;
        if (ch === '#') {
          const w = new THREE.Mesh(wallGeo, wallMat);
          w.position.set(wx, wallHeight / 2, wz);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
          walls.push({ mesh: w, cx, ry });
        } else if (ch === 'S') {
          startX = wx; startZ = wz;
        } else if (ch === 'G') {
          goalX = wx; goalZ = wz;
        }
      }
    }

    // Goal indicator
    const goal = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.08, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd15c, emissive: 0xffd15c, emissiveIntensity: 1.1 })
    );
    goal.position.set(goalX, 0.35, goalZ);
    goal.rotation.x = Math.PI / 2;
    scene.add(goal);

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.35, 6, 12),
      new THREE.MeshStandardMaterial({ color: playerColor || 0xff4fd8, emissive: playerColor || 0xff4fd8, emissiveIntensity: 0.3 })
    );
    player.position.set(startX, 0.4, startZ);
    player.castShadow = true;
    scene.add(player);

    const speed = 3.5;
    const playerRadius = 0.22;

    function isWallAt(wx, wz) {
      // Check if (wx, wz) falls inside any wall cell (AABB)
      for (const w of walls) {
        const dx = Math.abs(w.mesh.position.x - wx);
        const dz = Math.abs(w.mesh.position.z - wz);
        if (dx < (cell / 2 + playerRadius) && dz < (cell / 2 + playerRadius)) return true;
      }
      return false;
    }

    let elapsed = 0;
    let resolved = false;

    function update(dt) {
      if (resolved) return;
      elapsed += dt;

      let vx = 0, vz = 0;
      if (keys['w'] || keys['arrowup'])    vz -= 1;
      if (keys['s'] || keys['arrowdown'])  vz += 1;
      if (keys['a'] || keys['arrowleft'])  vx -= 1;
      if (keys['d'] || keys['arrowright']) vx += 1;
      const m = Math.hypot(vx, vz);
      if (m > 0) { vx /= m; vz /= m; }

      // Move x then z separately for cleaner wall sliding
      const newX = player.position.x + vx * speed * dt;
      if (!isWallAt(newX, player.position.z)) player.position.x = newX;
      const newZ = player.position.z + vz * speed * dt;
      if (!isWallAt(player.position.x, newZ)) player.position.z = newZ;

      // Goal?
      const gd = Math.hypot(player.position.x - goalX, player.position.z - goalZ);
      if (gd < 0.55 && !resolved) {
        resolved = true;
        goal.material.color.set(0x6fff9b);
        goal.material.emissive.set(0x6fff9b);
        onWin('escaped');
      }

      goal.rotation.z += dt * 2;

      if (!resolved && elapsed >= duration) {
        resolved = true;
        onLose('timeout');
      }
    }

    function dispose() {
      walls.forEach(w => scene.remove(w.mesh));
      scene.remove(goal);
      scene.remove(player);
      wallGeo.dispose();
      wallMat.dispose();
    }

    return { scene, camera, update, dispose };
  }
};
