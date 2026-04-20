// Trystero-backed networking. Two room abstractions:
//
//   LobbyNet  — everyone loading the site joins "calware-lobby-v1". Carries
//               presence (name, color), queue state, and match-start
//               announcements. Pure coordination layer.
//
//   MatchNet  — one per match, room id `calware-match-<matchId>`. Only the
//               players named in the match-start announcement join it, so
//               traffic is isolated from lobby joiners. Carries round
//               announcements (from host) and per-player results.
//
// Host election is deterministic: sort peer IDs (self included) and the
// lowest id is host. When peers leave the host is recomputed automatically.

const CDNS = [
  'https://esm.run/trystero@0.23',
  'https://cdn.jsdelivr.net/npm/trystero@0.23/+esm',
  'https://esm.sh/trystero@0.23',
];

let trysteroMod = null;
export async function loadTrystero() {
  if (trysteroMod) return trysteroMod;
  let lastErr;
  for (const url of CDNS) {
    try {
      const mod = await import(url);
      if (mod && typeof mod.joinRoom === 'function') {
        console.log('[net] loaded trystero from', url);
        trysteroMod = mod;
        return mod;
      }
      lastErr = new Error(`no joinRoom in ${url}`);
    } catch (e) {
      console.warn('[net] cdn failed:', url, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error('trystero unavailable');
}

const APP_ID = 'calware-v1';

function lowestId(ids) {
  return [...ids].sort()[0];
}

// ----------------------------------------------------------------
// LobbyNet
// ----------------------------------------------------------------

export class LobbyNet extends EventTarget {
  constructor(me) {
    super();
    this.me = me;                       // { id, name, color }
    this.peers = new Map();             // peerId -> { id, name, color }
    this.queued = new Set();            // peerIds currently queued
    this.room = null;
    this.selfId = null;
    this.hostId = null;

    this.pendingMatches = new Set();    // matchIds we've already acted on
    this.countdownTimer = null;
  }

  get allIds() {
    return [this.selfId, ...this.peers.keys()].filter(Boolean);
  }

  isHost() {
    return this.hostId === this.selfId;
  }

  recomputeHost() {
    const prev = this.hostId;
    this.hostId = lowestId(this.allIds);
    if (prev !== this.hostId) {
      this.emit('hostChanged', { hostId: this.hostId, isHost: this.isHost() });
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async connect() {
    const { joinRoom, selfId } = await loadTrystero();
    this.selfId = selfId;
    this.me.id = selfId;

    this.room = joinRoom({ appId: APP_ID }, 'calware-lobby-v1');

    const [sendPresence, recvPresence] = this.room.makeAction('presence');
    const [sendQueue, recvQueue]       = this.room.makeAction('queue');
    const [sendStart, recvStart]       = this.room.makeAction('matchstart');

    this._sendPresence = sendPresence;
    this._sendQueue    = sendQueue;
    this._sendStart    = sendStart;

    this.room.onPeerJoin(id => {
      // Seed a placeholder; real values arrive via presence.
      if (!this.peers.has(id)) {
        this.peers.set(id, { id, name: 'guest', color: '#888' });
      }
      console.log('[lobby] peer joined', id.slice(0, 6));
      // Trystero's WebRTC link isn't necessarily ready the instant
      // onPeerJoin fires. Fire our state three times over 2s so at
      // least one broadcast lands even if the data channel opens late.
      this._burstFullState();
      this.recomputeHost();
      this.emit('peersChanged');
    });

    this.room.onPeerLeave(id => {
      console.log('[lobby] peer left', id.slice(0, 6));
      this.peers.delete(id);
      this.queued.delete(id);
      this.recomputeHost();
      this.emit('peersChanged');
      this.emit('queueChanged');
      this._maybeStartMatch();
    });

    recvPresence((data, peerId) => {
      const existing = this.peers.get(peerId) || { id: peerId };
      this.peers.set(peerId, {
        ...existing,
        id: peerId,
        name: data.name || 'guest',
        color: data.color || '#888',
      });
      // Queue state rides on presence for robustness — even if the
      // dedicated queue channel drops, presence carries the truth.
      if (typeof data.queued === 'boolean') {
        const had = this.queued.has(peerId);
        if (data.queued) this.queued.add(peerId);
        else             this.queued.delete(peerId);
        if (had !== data.queued) {
          console.log('[lobby] %s queued=%s (via presence)', peerId.slice(0, 6), data.queued);
          this.emit('queueChanged');
          this._maybeStartMatch();
        }
      }
      this.emit('peersChanged');
    });

    recvQueue((data, peerId) => {
      const had = this.queued.has(peerId);
      if (data.queued) this.queued.add(peerId);
      else             this.queued.delete(peerId);
      if (had !== data.queued) {
        console.log('[lobby] %s queued=%s (via queue ch)', peerId.slice(0, 6), data.queued);
        this.emit('queueChanged');
        this._maybeStartMatch();
      }
    });

    recvStart((data) => {
      this._handleMatchStart(data);
    });

    this.recomputeHost();
    this._broadcastFullState();
    // Heartbeat: even with no peer churn, resend presence periodically
    // so dropped broadcasts recover without user action.
    this._heartbeat = setInterval(() => this._broadcastFullState(), 3000);
    console.log('[lobby] connected', selfId.slice(0, 6), 'host?', this.isHost());
  }

  _broadcastFullState() {
    if (!this._sendPresence) return;
    const queued = this.queued.has(this.selfId);
    this._sendPresence({ name: this.me.name, color: this.me.color, queued });
    if (this._sendQueue) this._sendQueue({ queued });
  }

  _burstFullState() {
    this._broadcastFullState();
    setTimeout(() => this._broadcastFullState(), 500);
    setTimeout(() => this._broadcastFullState(), 1500);
  }

  setQueued(queued) {
    if (queued) this.queued.add(this.selfId);
    else        this.queued.delete(this.selfId);
    console.log('[lobby] self queued=%s (queue set size=%d)', queued, this.queued.size);
    // Send via BOTH the dedicated queue channel AND presence so either
    // path can deliver to peers whose other channel dropped.
    this._burstFullState();
    this.emit('queueChanged');
    this._maybeStartMatch();
  }

  imQueued() {
    return this.queued.has(this.selfId);
  }

  queuedPlayers() {
    return [...this.queued].map(id => {
      if (id === this.selfId) return { id, name: this.me.name, color: this.me.color };
      return this.peers.get(id) || { id, name: 'guest', color: '#888' };
    });
  }

  lobbyPlayers() {
    return [
      { id: this.selfId, name: this.me.name, color: this.me.color, isMe: true },
      ...[...this.peers.values()],
    ];
  }

  // Only host decides when a match starts. Instead of each peer running
  // its own 3-second clock, the host stamps an absolute `startAt` into
  // the matchStart payload. Every peer shows the same countdown and
  // transitions into the match at exactly the same moment. Broadcast is
  // retried at escalating intervals so even peers whose WebRTC link
  // opens late still receive the announcement in time.
  _maybeStartMatch() {
    if (!this.isHost()) return;
    if (this._announcedMatchId) return;  // a match is already in-flight
    const q = [...this.queued];
    if (q.length < 2) return;

    const matchId = `m${Date.now().toString(36)}${Math.floor(Math.random() * 0x1000).toString(36)}`;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const startAt = Date.now() + 3000;
    const payload = {
      matchId,
      players: q.slice(),
      seed,
      hostId: this.selfId,
      startAt,
    };

    this._announcedMatchId = matchId;
    console.log('[lobby] host firing matchStart matchId=%s startAt=+%dms players=%o',
      matchId, startAt - Date.now(), payload.players.map(p => p.slice(0, 6)));

    // Handle locally first so the host sees the countdown UI too.
    this._handleMatchStart(payload);

    // Rebroadcast aggressively until startAt — catches peers whose data
    // channel opens mid-countdown.
    const retryAt = [0, 200, 500, 1000, 1800, 2500];
    for (const t of retryAt) {
      setTimeout(() => { if (this._sendStart) this._sendStart(payload); }, t);
    }
  }

  _handleMatchStart(data) {
    if (!data || !data.matchId) return;
    if (this.pendingMatches.has(data.matchId)) return;
    this.pendingMatches.add(data.matchId);

    const amIn = data.players.includes(this.selfId);
    const startAt = typeof data.startAt === 'number' ? data.startAt : Date.now();
    const delay = Math.max(0, startAt - Date.now());

    console.log('[lobby] matchStart received matchId=%s amIn=%s delay=%dms players=%o',
      data.matchId, amIn, delay, data.players.map(p => p.slice(0, 6)));

    // Clear queue locally for all named participants.
    for (const pid of data.players) this.queued.delete(pid);
    this.emit('queueChanged');

    // Emit countdown immediately so the UI can show ticking seconds on
    // every peer — participant or not.
    this.emit('countdown', {
      matchId: data.matchId,
      startAt,
      players: data.players,
      amIn,
    });

    // Fire matchStarting at the synchronized moment. Between now and then
    // the lobby shows a visible countdown.
    setTimeout(() => {
      this.emit('matchStarting', { ...data, amIn });
      // Host clears its "announced" lock so it can fire the next match
      // after this one ends.
      this._announcedMatchId = null;
    }, delay);
  }

  // Convenience alias.
  on(type, cb) { this.addEventListener(type, cb); return () => this.removeEventListener(type, cb); }

  leave() {
    if (this.countdownTimer) { clearTimeout(this.countdownTimer); this.countdownTimer = null; }
    if (this._heartbeat)    { clearInterval(this._heartbeat);     this._heartbeat = null; }
    if (this.room) { try { this.room.leave(); } catch {} }
    this.room = null;
  }
}

// ----------------------------------------------------------------
// MatchNet
// ----------------------------------------------------------------
//
// Protocol:
//   round (host -> all):   { n, gameKey, seed, duration }
//   result (all -> all):   { n, won }   — per-player outcome for round n
//   tally (host -> all):   { n, lives: { pid: remaining, ... }, eliminated: [pid...] }
//   finish (host -> all):  { winner: pid | null, reason }

export class MatchNet extends EventTarget {
  constructor(matchId, players, me, hostId) {
    super();
    this.matchId = matchId;
    this.players = players.slice();
    this.me = me;
    this.hostId = hostId;   // host at match-start time (may need re-election on drop)
    this.room = null;
  }

  isHost() { return this.hostId === this.me.id; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, cb) { this.addEventListener(type, cb); return () => this.removeEventListener(type, cb); }

  async connect() {
    const { joinRoom } = await loadTrystero();
    this.room = joinRoom({ appId: APP_ID }, `calware-match-${this.matchId}`);

    const [sendRound,  recvRound]  = this.room.makeAction('round');
    const [sendResult, recvResult] = this.room.makeAction('result');
    const [sendTally,  recvTally]  = this.room.makeAction('tally');
    const [sendFinish, recvFinish] = this.room.makeAction('finish');
    const [sendPos,    recvPos]    = this.room.makeAction('pos');

    this._sendRound = sendRound;
    this._sendResult = sendResult;
    this._sendTally = sendTally;
    this._sendFinish = sendFinish;
    this._sendPos = sendPos;

    this.presentPeers = new Set();
    this.room.onPeerJoin(id => {
      this.presentPeers.add(id);
      this.emit('peerJoined', { id });
    });
    this.room.onPeerLeave(id => {
      this.presentPeers.delete(id);
      this.emit('peerLeft', { id });
      // Simple host failover: if host dropped, lowest surviving player is host.
      if (id === this.hostId) {
        const alive = [this.me.id, ...this.presentPeers].sort();
        this.hostId = alive[0];
        this.emit('hostChanged', { hostId: this.hostId, isHost: this.isHost() });
      }
    });

    recvRound((data, peerId) => {
      if (peerId !== this.hostId) return;       // only trust host
      this.emit('round', data);
    });
    recvResult((data, peerId) => {
      this.emit('result', { ...data, peerId });
    });
    recvTally((data, peerId) => {
      if (peerId !== this.hostId) return;
      this.emit('tally', data);
    });
    recvFinish((data, peerId) => {
      if (peerId !== this.hostId) return;
      this.emit('finish', data);
    });
    recvPos((data, peerId) => {
      // No host trust needed — each peer is authoritative about its own
      // ghost position. The microgame decides what to do with the data.
      this.emit('pos', { ...data, peerId });
    });
  }

  announceRound(payload) { if (this.isHost()) this._sendRound(payload); this.emit('round', payload); }
  reportResult(payload)  { this._sendResult(payload); this.emit('result', { ...payload, peerId: this.me.id }); }
  announceTally(payload) { if (this.isHost()) this._sendTally(payload); this.emit('tally', payload); }
  announceFinish(payload){ if (this.isHost()) this._sendFinish(payload); this.emit('finish', payload); }
  sendPos(payload)       { if (this._sendPos) this._sendPos(payload); }

  leave() { if (this.room) { try { this.room.leave(); } catch {} } this.room = null; }
}

// Seeded RNG so host + peers can deterministically pick identical
// microgame parameters given the same seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
