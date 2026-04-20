// Reusable 3D numpad for microgames that take numeric input. Each
// button is a mesh with a canvas-textured label, laid out in a 3x4
// grid (digits 1-9, 0, and an optional ✓ submit).
//
// Usage:
//
//   const pad = makeNumpad(scene, {
//     origin: new THREE.Vector3(0, 1, 0),
//     includeSubmit: true,
//     onDigit:  (d) => ...,
//     onSubmit: ()  => ...,
//   });
//
//   // In your click handler:
//   pad.tryClick(camera, mouse);   // returns 'submit' | digit | null
//
//   // In your dispose:
//   pad.dispose();

import { THREE } from '../three-setup.js';

export function makeLabel(text, { size = 0.6, color = '#fff', background = null, font = 'bold 80px ui-sans-serif, system-ui, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  return new THREE.Mesh(geom, mat);
}

// A wider label mesh for equation strings, status text, etc.
export function makeWideLabel(text, { width = 3, height = 0.8, color = '#fff', background = null, font = 'bold 120px ui-sans-serif, system-ui, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  mesh.userData._canvasTexture = { canvas, ctx, tex, color, background, font };
  return mesh;
}

// Update the text of a wide label in place — reuses the canvas texture.
export function setLabelText(mesh, text) {
  const data = mesh.userData._canvasTexture;
  if (!data) return;
  const { canvas, ctx, tex, color, background, font } = data;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  tex.needsUpdate = true;
}

export function makeNumpad(scene, opts = {}) {
  const {
    origin = new THREE.Vector3(0, 1, 0),
    includeSubmit = true,
    includeZero = true,
    onDigit = null,
    onSubmit = null,
    btnSize = 0.75,
    gap = 0.12,
    keyColor = 0x3d1f5e,
    submitColor = 0x6fff9b,
  } = opts;

  const group = new THREE.Group();
  group.position.copy(origin);
  scene.add(group);

  const cellW = btnSize + gap;
  const buttonGroups = [];

  function makeButton(label, { color = keyColor, textColor = '#ffffff', size = btnSize } = {}) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, 0.18),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
    );
    box.castShadow = true;
    g.add(box);
    const lbl = makeLabel(label, { size: size * 0.9, color: textColor });
    lbl.position.z = 0.1;
    g.add(lbl);
    g.userData.box = box;
    return g;
  }

  // Digits 1-9 in a standard numpad grid (7 8 9 on top)
  const rows = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
  ];
  rows.forEach((row, rIdx) => {
    row.forEach((digit, cIdx) => {
      const b = makeButton(digit);
      b.position.set((cIdx - 1) * cellW, -rIdx * cellW, 0);
      b.userData.digit = digit;
      group.add(b);
      buttonGroups.push(b);
    });
  });

  if (includeZero) {
    const z = makeButton('0');
    z.position.set(0, -3 * cellW, 0);
    z.userData.digit = '0';
    group.add(z);
    buttonGroups.push(z);
  }

  if (includeSubmit) {
    const s = makeButton('✓', { color: submitColor, textColor: '#0a0514' });
    s.position.set(cellW, -3 * cellW, 0);
    s.userData.digit = 'submit';
    group.add(s);
    buttonGroups.push(s);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function tryClick(camera, mouse) {
    ndc.set(mouse.x, mouse.y);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(buttonGroups, true);
    if (hits.length === 0) return null;

    let top = hits[0].object;
    while (top.parent && top.parent !== group) top = top.parent;
    const digit = top.userData.digit;
    if (!digit) return null;

    // Visual press feedback
    top.scale.setScalar(0.9);
    setTimeout(() => top.scale.setScalar(1), 110);

    if (digit === 'submit') {
      onSubmit?.();
      return 'submit';
    }
    onDigit?.(digit);
    return digit;
  }

  function dispose() {
    group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose?.();
        obj.material.dispose?.();
      }
    });
    scene.remove(group);
  }

  return { group, tryClick, dispose };
}
