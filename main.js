// CalWare entry. Boots the Three.js renderer, joins the lobby room, and
// bridges lobby match-start announcements to the MatchController.
//
// State machine is implicit:
//   lobby scene  →  (match-start received, I'm in)  →  match scenes
//   match scenes →  (finish)                        →  lobby scene
//
// Players who join mid-match stay in the lobby; match traffic lives in
// its own Trystero room (per net.js) so it cannot leak back here.

import { getRenderer, startLoop } from './three-setup.js';
import { LobbyNet, MatchNet } from './net.js';
import { createLobby } from './lobby.js';
import { MatchController } from './match.js';

// ----- Portal intake -----
const incoming = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;

// ----- Shared app state -----
const app = {
  me: {
    id: null,
    name: incoming.username,
    color: '#' + incoming.color,
  },
  incoming,
  nextJamTarget: null,
  keys: {},
  mouse: { x: 0, y: 0, clicked: false },
  lobbyNet: null,
  lobby: null,
  match: null,
  startSolo: null,
};

// Block the default browser behavior for movement keys so space doesn't
// scroll and arrows don't flip focus while playing.
const MOVEMENT_KEYS = new Set(['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d']);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  app.keys[k] = true;
  if (MOVEMENT_KEYS.has(k)) e.preventDefault();
}, { passive: false });
addEventListener('keyup', e => { app.keys[e.key.toLowerCase()] = false; });

addEventListener('mousemove', e => {
  app.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  app.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
addEventListener('mousedown', () => { app.mouse.clicked = true; });

// ----- Renderer -----
getRenderer();
startLoop();

// ----- Pre-fetch jam portal target (best-effort, never blocks) -----
Portal.pickPortalTarget().then(t => { app.nextJamTarget = t; }).catch(() => {});

// ----- Lobby network -----
const lobbyNet = new LobbyNet(app.me);
app.lobbyNet = lobbyNet;

const peersEl = document.getElementById('peers');
function updatePeerCount() {
  const total = 1 + (lobbyNet.peers?.size || 0);
  peersEl.textContent = `${total} online`;
}
lobbyNet.on('peersChanged', updatePeerCount);

try {
  await lobbyNet.connect();
  updatePeerCount();
} catch (err) {
  console.warn('[main] lobby offline — solo only', err);
  app.me.id = 'local-me';
  peersEl.textContent = 'offline';
  peersEl.style.color = '#ff6b6b';
}

// ----- Lobby scene -----
const lobby = createLobby(app, lobbyNet);
app.lobby = lobby;
lobby.start();

// ----- Match bridge -----
lobbyNet.on('matchStarting', async (e) => {
  const data = e.detail;
  if (!data.amIn) {
    flashStatus(`Match starting with ${data.players.length} players…`);
    return;
  }
  await runNetworkedMatch(data);
});

async function runNetworkedMatch(data) {
  lobby.stop();
  const matchNet = new MatchNet(data.matchId, data.players, app.me, data.hostId);
  try {
    await matchNet.connect();
  } catch (err) {
    console.error('[main] match connect failed', err);
    lobby.start();
    return;
  }
  const match = new MatchController(app, data, matchNet);
  app.match = match;
  const result = await match.run();
  matchNet.leave();
  app.match = null;
  lobby.start();                        // re-activate lobby scene immediately
  showMatchResult(result);
}

// ----- Solo mode -----
app.startSolo = async () => {
  if (app.match) return;
  if (!app.me.id) app.me.id = 'local-me';
  lobby.stop();
  const matchInfo = {
    matchId: 'solo-' + Date.now().toString(36),
    players: [app.me.id],
    seed: Math.floor(Math.random() * 0x7fffffff),
    hostId: app.me.id,
  };
  const match = new MatchController(app, matchInfo, null);
  app.match = match;
  const result = await match.run();
  app.match = null;
  lobby.start();
  showMatchResult(result);
};

// ----- UI helpers -----
function flashStatus(msg) {
  const status = document.getElementById('queue-status');
  status.textContent = msg;
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = '';
  }, 2500);
}

function showMatchResult(result) {
  const ui = document.getElementById('result-ui');
  const txt = document.getElementById('result-text');
  const detail = document.getElementById('result-detail');
  const btn = document.getElementById('return-lobby');

  if (result.iWon) txt.textContent = 'YOU WIN!';
  else if (result.winner && result.winner !== app.me.id) txt.textContent = 'DEFEATED';
  else txt.textContent = 'GAME OVER';

  detail.textContent = result.reason || '';
  btn.classList.remove('hidden');
  ui.classList.remove('hidden');
  btn.onclick = () => {
    ui.classList.add('hidden');
    btn.classList.add('hidden');
  };
}

// Clean up on unload so the lobby room releases our peer id.
addEventListener('beforeunload', () => {
  try { lobbyNet.leave(); } catch {}
});
