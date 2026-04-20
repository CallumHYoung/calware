// 3D walkable lobby. Holds players between matches. Everything here is
// local — the lobby network layer in net.js handles presence, queue, and
// match-start announcements. Match traffic never enters this scene.
//
// Layout: central floor, a glowing "QUEUE" ring on the ground (walk into
// it to toggle queued), a purple exit portal (walk into it to jump to
// another jam game), and a capsule avatar for each peer.

import {
  THREE, makeStudio, setActive, registerUpdater,
} from './three-setup.js';

export function createLobby(app, lobbyNet) {
  const scene = new THREE.Scene();
  makeStudio(scene, { skyColor: 0x1a0a3a, groundColor: 0x140825 });

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  camera.position.set(0, 9, 14);
  camera.lookAt(0, 1, 0);

  // ----- Queue zone -----
  const queueZone = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.12, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x4ff0ff, emissive: 0x4ff0ff, emissiveIntensity: 0.6 })
  );
  queueZone.rotation.x = Math.PI / 2;
  queueZone.position.set(-5, 0.06, 0);
  scene.add(queueZone);

  const queueZoneInner = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 48),
    new THREE.MeshStandardMaterial({ color: 0x4ff0ff, transparent: true, opacity: 0.08, emissive: 0x4ff0ff, emissiveIntensity: 0.2 })
  );
  queueZoneInner.rotation.x = -Math.PI / 2;
  queueZoneInner.position.set(-5, 0.02, 0);
  scene.add(queueZoneInner);

  // Floating "QUEUE" label via sprite-style plane (kept tiny to avoid font work)
  const queuePost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x4ff0ff, emissive: 0x4ff0ff, emissiveIntensity: 0.5 })
  );
  queuePost.position.set(-5, 1.5, 0);
  scene.add(queuePost);

  // ----- Exit portal -----
  const portalGroup = new THREE.Group();
  portalGroup.position.set(5, 0, 0);
  const portalRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.15, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0xc64bff, emissive: 0xc64bff, emissiveIntensity: 0.8 })
  );
  portalRing.position.y = 1.7;
  portalRing.rotation.y = Math.PI / 2;
  portalGroup.add(portalRing);
  const portalDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 40),
    new THREE.MeshStandardMaterial({ color: 0xc64bff, transparent: true, opacity: 0.35, emissive: 0xc64bff, emissiveIntensity: 0.4, side: THREE.DoubleSide })
  );
  portalDisc.position.y = 1.7;
  portalDisc.rotation.y = Math.PI / 2;
  portalGroup.add(portalDisc);
  scene.add(portalGroup);

  // ----- Player avatars -----
  const avatarGeo = new THREE.CapsuleGeometry(0.35, 0.7, 6, 12);

  function makeAvatar(color) {
    const m = new THREE.Mesh(
      avatarGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 })
    );
    m.castShadow = true;
    return m;
  }

  const me = makeAvatar(app.me.color);
  me.position.set(0, 0.7, 0);
  scene.add(me);

  const peerMeshes = new Map(); // peerId -> mesh

  function syncPeerMeshes() {
    const wanted = new Set(lobbyNet.peers.keys());
    for (const [id, mesh] of peerMeshes.entries()) {
      if (!wanted.has(id)) {
        scene.remove(mesh);
        peerMeshes.delete(id);
      }
    }
    let i = 0;
    for (const peer of lobbyNet.peers.values()) {
      let mesh = peerMeshes.get(peer.id);
      if (!mesh) {
        mesh = makeAvatar(peer.color);
        // Initial position: arrange in a ring around center
        const ang = (i + 1) * (Math.PI * 2 / 6);
        mesh.position.set(Math.cos(ang) * 3, 0.7, Math.sin(ang) * 3);
        mesh.userData.targetX = mesh.position.x;
        mesh.userData.targetZ = mesh.position.z;
        scene.add(mesh);
        peerMeshes.set(peer.id, mesh);
      } else {
        // Update color in case it changed
        mesh.material.color.set(peer.color);
        mesh.material.emissive.set(peer.color);
      }
      i++;
    }
  }

  // Position broadcasts (lobby only — cheap, ~5 Hz).
  let sendPos = null;
  if (lobbyNet.room) {
    const [s, recv] = lobbyNet.room.makeAction('pos');
    sendPos = s;
    recv((data, peerId) => {
      const mesh = peerMeshes.get(peerId);
      if (!mesh) return;
      mesh.userData.targetX = data.x;
      mesh.userData.targetZ = data.z;
    });
  }

  // ----- UI wiring -----
  const playerListEl = document.getElementById('player-list');
  const queueListEl  = document.getElementById('queue-list');
  const queueBtn     = document.getElementById('queue-btn');
  const soloBtn      = document.getElementById('solo-btn');
  const queueStatus  = document.getElementById('queue-status');
  const lobbyUI      = document.getElementById('lobby-ui');

  function chip(p, opts = {}) {
    const el = document.createElement('div');
    el.className = 'player-chip' + (opts.me ? ' me' : '');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.color = p.color;
    dot.style.background = p.color;
    el.appendChild(dot);
    el.appendChild(document.createTextNode(p.name || 'guest'));
    return el;
  }

  function renderUI() {
    playerListEl.innerHTML = '';
    for (const p of lobbyNet.lobbyPlayers()) {
      playerListEl.appendChild(chip(p, { me: p.isMe }));
    }
    const q = lobbyNet.queuedPlayers();
    queueListEl.innerHTML = '';
    if (q.length === 0) {
      queueListEl.textContent = 'no one yet';
      queueListEl.style.opacity = '0.4';
    } else {
      queueListEl.style.opacity = '1';
      for (const p of q) queueListEl.appendChild(chip(p));
    }
    queueBtn.classList.toggle('queued', lobbyNet.imQueued());
    queueBtn.textContent = lobbyNet.imQueued() ? 'Leave queue' : 'Queue up';
  }

  const onPeers = () => { syncPeerMeshes(); renderUI(); };
  const onQueue = () => renderUI();

  // Synchronized lobby countdown UI — all peers (participants AND
  // spectators) see the same ticking seconds because the host stamps
  // an absolute startAt into the matchStart payload.
  const countdownEl = document.getElementById('lobby-countdown');
  const countdownNumEl = document.getElementById('lobby-countdown-number');
  const countdownStatusEl = document.getElementById('lobby-countdown-status');
  const countdownPlayersEl = document.getElementById('lobby-countdown-players');
  let countdownTicker = null;

  const hideCountdown = () => {
    countdownEl.classList.add('hidden');
    if (countdownTicker) { clearInterval(countdownTicker); countdownTicker = null; }
  };

  const onCountdown = (e) => {
    const { startAt, players, amIn } = e.detail;
    const tick = () => {
      const remaining = Math.max(0, startAt - Date.now());
      const s = Math.ceil(remaining / 1000);
      if (remaining <= 0) {
        hideCountdown();
        return;
      }
      countdownNumEl.textContent = s;
      countdownStatusEl.textContent = amIn
        ? `You're in — get ready!`
        : `Spectating — ${players.length} players`;
      countdownPlayersEl.textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
    };
    countdownEl.classList.remove('hidden');
    tick();
    if (countdownTicker) clearInterval(countdownTicker);
    countdownTicker = setInterval(tick, 100);
  };

  lobbyNet.on('peersChanged', onPeers);
  lobbyNet.on('queueChanged', onQueue);
  lobbyNet.on('countdown', onCountdown);

  const clickHandlers = [];
  function bind(el, handler) {
    el.addEventListener('click', handler);
    clickHandlers.push(() => el.removeEventListener('click', handler));
  }

  bind(queueBtn, () => lobbyNet.setQueued(!lobbyNet.imQueued()));
  bind(soloBtn, () => app.startSolo());

  // ----- Movement + interactions -----
  const speed = 6;
  let posBroadcastTimer = 0;
  let queueTouched = false;   // edge detection so re-touching toggles
  let portalTouched = false;

  function update(dt) {
    // Move me with WASD
    const k = app.keys;
    let vx = 0, vz = 0;
    if (k['w'] || k['arrowup'])    vz -= 1;
    if (k['s'] || k['arrowdown'])  vz += 1;
    if (k['a'] || k['arrowleft'])  vx -= 1;
    if (k['d'] || k['arrowright']) vx += 1;
    const m = Math.hypot(vx, vz);
    if (m > 0) { vx /= m; vz /= m; }
    me.position.x += vx * speed * dt;
    me.position.z += vz * speed * dt;
    me.position.x = Math.max(-14, Math.min(14, me.position.x));
    me.position.z = Math.max(-8, Math.min(8, me.position.z));

    // Lerp peer meshes toward their target positions
    for (const mesh of peerMeshes.values()) {
      const tx = mesh.userData.targetX ?? mesh.position.x;
      const tz = mesh.userData.targetZ ?? mesh.position.z;
      mesh.position.x += (tx - mesh.position.x) * Math.min(1, dt * 8);
      mesh.position.z += (tz - mesh.position.z) * Math.min(1, dt * 8);
    }

    // Portal glow + queue zone glow
    portalRing.rotation.z += dt * 1.2;
    portalDisc.material.opacity = 0.3 + 0.1 * Math.sin(performance.now() / 300);

    // Queue zone collision (toggle on entry)
    const qd = Math.hypot(me.position.x - queueZone.position.x, me.position.z - queueZone.position.z);
    const inQueue = qd < 2.0;
    if (inQueue && !queueTouched) {
      lobbyNet.setQueued(!lobbyNet.imQueued());
      queueTouched = true;
    } else if (!inQueue) {
      queueTouched = false;
    }

    // Exit portal — only if a jam destination resolved
    if (app.nextJamTarget) {
      const pd = Math.hypot(me.position.x - portalGroup.position.x, me.position.z - portalGroup.position.z);
      if (pd < 1.5 && !portalTouched) {
        portalTouched = true;
        Portal.sendPlayerThroughPortal(app.nextJamTarget.url, {
          username: app.incoming.username,
          color: app.incoming.color,
          speed: app.incoming.speed,
        });
      }
    }

    // Broadcast my position ~5Hz
    posBroadcastTimer += dt;
    if (posBroadcastTimer > 0.2 && sendPos) {
      posBroadcastTimer = 0;
      sendPos({ x: me.position.x, z: me.position.z });
    }

    // Gentle camera follow
    const targetX = me.position.x * 0.3;
    camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 2);
    camera.lookAt(me.position.x * 0.4, 1, 0);
  }

  let unregister = null;
  let started = false;

  return {
    start() {
      if (started) return;
      started = true;
      syncPeerMeshes();
      renderUI();
      setActive(scene, camera);
      unregister = registerUpdater(update);
      lobbyUI.classList.remove('hidden');
    },
    stop() {
      started = false;
      if (unregister) { unregister(); unregister = null; }
      lobbyUI.classList.add('hidden');
      hideCountdown();
    },
    destroy() {
      this.stop();
      hideCountdown();
      lobbyNet.removeEventListener('peersChanged', onPeers);
      lobbyNet.removeEventListener('queueChanged', onQueue);
      lobbyNet.removeEventListener('countdown', onCountdown);
      clickHandlers.forEach(fn => fn());
    },
  };
}
