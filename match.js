// Match director. Runs a series of microgames for a set of players until
// one is left standing (or until the solo player runs out of lives).
//
// The host broadcasts round announcements; every peer mounts the same
// microgame locally (identical seed = identical content) and reports
// its own win/loss. After each round the host tallies lives and moves
// on or finishes the match.
//
// Solo mode uses this same controller with `net === null` — all events
// flow locally and `_shouldFinish` uses a lives-based rule.

import { THREE, setActive, registerUpdater } from './three-setup.js';
import { microgames, microgameKeys } from './microgames/index.js';
import { mulberry32 } from './net.js';

const ROUND_TIMEOUT_PAD = 1.5;   // seconds after duration before forcing a result
const BETWEEN_ROUNDS_MS = 1200;
const PREROUND_STEP_MS = 800;    // countdown tick length (3 ticks → ~2.4s reading time)
const PREROUND_GO_MS = 350;      // "GO!" flash before the microgame actually starts

export class MatchController {
  constructor(app, matchInfo, net) {
    this.app = app;
    this.matchInfo = matchInfo;   // { matchId, players:[peerId...], seed, hostId }
    this.net = net;               // MatchNet | null (solo)
    this.rng = mulberry32(matchInfo.seed >>> 0);
    this.lives = new Map(matchInfo.players.map(p => [p, 4]));
    this.roundIdx = 0;
    this.currentRound = null;
    this.microgame = null;
    this._updateUnsub = null;
    this._roundTimer = null;
    this._timerRaf = null;
    this._tallyBroadcast = false;
    this._resolve = null;
    this._listeners = [];
  }

  isHost() {
    return !this.net || this.net.isHost();
  }

  async run() {
    return new Promise(resolve => {
      this._resolve = resolve;
      this._wireNet();
      this._startNextRound();
    });
  }

  // -- networking wireup ---------------------------------------------

  _wireNet() {
    if (!this.net) return;
    const on = (type, fn) => {
      this.net.on(type, (e) => fn(e.detail));
      this._listeners.push(type);
    };
    on('round',  d => this._onRound(d));
    on('result', d => this._onResult(d));
    on('tally',  d => this._onTally(d));
    on('finish', d => this._onFinish(d));
    on('pos',    d => this._onPos(d));
    this.net.on('hostChanged', () => { /* trivial — host drives via _startNextRound */ });
    this.net.on('peerJoined', () => this._renderPeerStatus());
    this.net.on('peerLeft',   () => this._renderPeerStatus());
  }

  _onPos(data) {
    if (!this.microgame || !this.microgame.setGhostState) return;
    if (!this.currentRound || data.n !== this.currentRound.n) return;
    this._posRxCount = (this._posRxCount || 0) + 1;
    if (this._posRxCount <= 3 || this._posRxCount % 30 === 0) {
      console.log('[match] pos rx #%d from %s', this._posRxCount, (data.peerId || '').slice(0, 6), data);
    }
    this.microgame.setGhostState(data.peerId, data);
  }

  // -- round flow ----------------------------------------------------

  _livingPlayers() {
    return [...this.lives.entries()].filter(([, l]) => l > 0).map(([p]) => p);
  }

  _shouldFinish() {
    const living = this._livingPlayers();
    if (this.matchInfo.players.length === 1) return living.length === 0;
    return living.length <= 1;
  }

  _startNextRound() {
    if (this._shouldFinish()) {
      const living = this._livingPlayers();
      const winner = living[0] || null;
      const payload = { winner, reason: winner ? 'last standing' : 'no survivors' };
      if (this.isHost() && this.net) this.net.announceFinish(payload);
      else if (!this.net) this._onFinish(payload);
      return;
    }

    this.roundIdx++;
    if (!this.isHost()) return;    // non-host waits for 'round' event

    const gameKey = microgameKeys[Math.floor(this.rng() * microgameKeys.length)];
    const seed = Math.floor(this.rng() * 0x7fffffff);
    const difficulty = Math.min(1.5, (this.roundIdx - 1) * 0.12);
    const base = microgames[gameKey].baseDuration;
    const duration = Math.max(2.5, base - difficulty * 0.6);
    const payload = { n: this.roundIdx, gameKey, seed, difficulty, duration };

    // Delay round 1 by 1.5s so Trystero peer discovery has time to
    // finish in the fresh match room before we start broadcasting
    // gameplay messages. Subsequent rounds go out immediately.
    const delay = (this.roundIdx === 1 && this.net) ? 1500 : 0;
    setTimeout(() => {
      if (this.net) {
        this.net.announceRound(payload);
        this._startRoundRebroadcast(payload);
      } else {
        this._onRound(payload);
      }
    }, delay);
  }

  // Idempotent — if a retransmitted round announce arrives while we're
  // already on that round, ignore it. Without this check the 500ms
  // rebroadcast would restart every peer's preround countdown.
  _onRound(data) {
    if (this.currentRound && this.currentRound.n === data.n) return;
    this.currentRound = { ...data, results: new Map() };
    this._tallyBroadcast = false;
    this._showPreRound(data);
  }

  // Host-only: keep rebroadcasting the active round announcement so
  // peers whose match-room WebRTC link opens mid-round still get it.
  // Stops as soon as the round resolves.
  _startRoundRebroadcast(payload) {
    this._clearRoundRebroadcast();
    this._roundRebroadcastTimer = setInterval(() => {
      if (!this.currentRound || this._tallyBroadcast || this.currentRound.n !== payload.n) {
        this._clearRoundRebroadcast();
        return;
      }
      // announceRound also emits locally, but _onRound is idempotent.
      this.net.announceRound(payload);
    }, 500);
  }

  _clearRoundRebroadcast() {
    if (this._roundRebroadcastTimer) {
      clearInterval(this._roundRebroadcastTimer);
      this._roundRebroadcastTimer = null;
    }
  }

  // Pre-round screen: show the next microgame's name, rules, and a
  // thumbnail (if present) with a 3-2-1-GO countdown. Only once the
  // countdown finishes do we mount the microgame scene. Timer-based
  // force-end doesn't start until mount either, so pre-round doesn't
  // eat into the playable duration.
  _showPreRound(data) {
    const game = microgames[data.gameKey];
    if (!game) {
      console.error('[match] unknown microgame key', data.gameKey);
      this._mountAndStart(data);
      return;
    }

    const ui          = document.getElementById('preround-ui');
    const titleEl     = document.getElementById('preround-title');
    const descEl      = document.getElementById('preround-description');
    const controlsEl  = document.getElementById('preround-controls');
    const countdownEl = document.getElementById('preround-countdown');
    const roundEl     = document.getElementById('preround-round');
    const thumbWrap   = document.getElementById('preround-thumbnail');
    const thumbImg    = document.getElementById('preround-img');

    roundEl.textContent = `Round ${data.n}`;
    titleEl.textContent = game.title || game.key;
    descEl.textContent = game.description || '';
    controlsEl.textContent = game.controls || '';
    countdownEl.textContent = '3';
    countdownEl.classList.remove('go');

    // Thumbnails are optional — hide gracefully if missing.
    if (game.thumbnail) {
      thumbWrap.classList.remove('hidden');
      thumbImg.onerror = () => thumbWrap.classList.add('hidden');
      thumbImg.onload  = () => thumbWrap.classList.remove('hidden');
      thumbImg.src = game.thumbnail + (game.thumbnail.includes('?') ? '' : '?v=1');
    } else {
      thumbWrap.classList.add('hidden');
      thumbImg.removeAttribute('src');
    }

    ui.classList.remove('hidden');
    document.getElementById('state-tag').textContent = 'up next';

    // 3 → 2 → 1 → GO! → mount
    this._clearPreRoundTicks();
    this._preRoundTicks = [];
    const tick = (remaining) => {
      if (remaining > 0) {
        countdownEl.textContent = String(remaining);
        this._preRoundTicks.push(setTimeout(() => tick(remaining - 1), PREROUND_STEP_MS));
      } else {
        countdownEl.textContent = 'GO!';
        countdownEl.classList.add('go');
        this._preRoundTicks.push(setTimeout(() => {
          ui.classList.add('hidden');
          this._mountAndStart(data);
        }, PREROUND_GO_MS));
      }
    };
    this._preRoundTicks.push(setTimeout(() => tick(2), PREROUND_STEP_MS));
  }

  _clearPreRoundTicks() {
    if (!this._preRoundTicks) return;
    this._preRoundTicks.forEach(t => clearTimeout(t));
    this._preRoundTicks = null;
  }

  _mountAndStart(data) {
    this._mountMicrogame(data);
    this._showInstruction(data);

    // Safety: force-resolve any missing reporters shortly after timer.
    this._roundTimer = setTimeout(
      () => this._forceRoundEnd(),
      (data.duration + ROUND_TIMEOUT_PAD) * 1000
    );
  }

  _mountMicrogame(data) {
    const game = microgames[data.gameKey];
    if (!game) {
      console.error('[match] unknown microgame key', data.gameKey);
      this._reportResult(false);
      return;
    }
    this._disposeMicrogame();

    // Reset transient input state between rounds so stray clicks made
    // during the between-rounds pause don't trigger an instant action.
    this.app.mouse.clicked = false;

    const meId = this.app.me.id;
    const amAlive = (this.lives.get(meId) || 0) > 0;

    let fired = false;
    const fire = (won) => {
      if (fired) return;
      fired = true;
      this._reportResult(won);
    };

    const otherPlayers = this.matchInfo.players
      .filter(pid => pid !== meId)
      .map(pid => ({
        id: pid,
        name: this._peerName(pid),
        color: this._peerColor(pid) || '#888',
      }));

    console.log('[match] mount %s — me=%s players=%o otherPlayers=%d',
      data.gameKey, meId, this.matchInfo.players, otherPlayers.length);

    const ctx = {
      THREE,
      seed: data.seed,
      difficulty: data.difficulty || 0,
      duration: data.duration,
      playerColor: this.app.me.color,
      playerName: this.app.me.name,
      me: { id: meId, name: this.app.me.name, color: this.app.me.color },
      otherPlayers,
      keys: this.app.keys,
      mouse: this.app.mouse,
      onWin:  () => amAlive && fire(true),
      onLose: () => amAlive && fire(false),
    };

    this.microgame = game.mount(ctx);
    setActive(this.microgame.scene, this.microgame.camera);
    this._updateUnsub = registerUpdater((dt, elapsed) => {
      this.microgame.update(dt, elapsed);
    });

    // Ghost broadcast — only if the microgame wants to share its own
    // state and we actually have a network (skip for solo).
    if (this.net && typeof this.microgame.getGhostState === 'function') {
      this._posTxCount = 0;
      const broadcast = () => {
        if (!this.currentRound || !this.microgame) return;
        const state = this.microgame.getGhostState();
        if (!state) return;
        this.net.sendPos({ n: this.currentRound.n, ...state });
        this._posTxCount++;
        if (this._posTxCount <= 3 || this._posTxCount % 30 === 0) {
          console.log('[match] pos tx #%d', this._posTxCount, state);
        }
      };
      // Fire once immediately so ghosts lock to real positions from the
      // start of the round, then every 100ms after.
      broadcast();
      this._ghostInterval = setInterval(broadcast, 100);
    }

    // Eliminated players don't play — they spectate. Auto-report nothing,
    // the host's _livingPlayers filter excludes them from the expected set.
  }

  _showInstruction(data) {
    const instrEl = document.getElementById('instruction');
    const timerEl = document.getElementById('timer-fill');
    const roundEl = document.getElementById('round-counter');
    const matchUI = document.getElementById('match-ui');
    matchUI.classList.remove('hidden');
    document.getElementById('state-tag').textContent = 'match';

    instrEl.textContent = microgames[data.gameKey].title;
    instrEl.style.animation = 'none';
    // reflow to restart CSS animation
    void instrEl.offsetWidth;
    instrEl.style.animation = '';

    roundEl.textContent = `Round ${data.n}`;
    this._renderLives();
    this._renderPeerStatus();

    timerEl.style.width = '100%';
    const start = performance.now();
    const total = data.duration * 1000;
    if (this._timerRaf) cancelAnimationFrame(this._timerRaf);
    const tick = () => {
      const el = performance.now() - start;
      const frac = Math.max(0, 1 - el / total);
      timerEl.style.width = (frac * 100) + '%';
      if (frac > 0) this._timerRaf = requestAnimationFrame(tick);
    };
    this._timerRaf = requestAnimationFrame(tick);
  }

  _renderPeerStatus() {
    const el = document.getElementById('peer-status');
    if (!el) return;
    if (!this.net) {
      el.textContent = 'solo';
      el.classList.remove('warn');
      return;
    }
    const expected = Math.max(0, this.matchInfo.players.length - 1);
    const present = this.net.presentPeers ? this.net.presentPeers.size : 0;
    el.textContent = `${present}/${expected} peers connected`;
    el.classList.toggle('warn', present < expected);
  }

  _renderLives() {
    const livesEl = document.getElementById('lives-row');
    livesEl.innerHTML = '';
    const myId = this.app.me.id;
    for (const pid of this.matchInfo.players) {
      const lives = this.lives.get(pid) ?? 0;
      const pip = document.createElement('div');
      pip.className = 'life-pip' + (lives <= 0 ? ' dead' : '');
      const isMe = pid === myId;
      const color = isMe ? this.app.me.color : (this._peerColor(pid) || '#888');
      const name = isMe ? 'you' : this._peerName(pid);
      pip.innerHTML = `
        <span class="dot" style="background:${color};color:${color};"></span>
        <span>${name}</span>
        <span class="hearts">${'♥'.repeat(Math.max(0, lives))}</span>
      `;
      livesEl.appendChild(pip);
    }
  }

  _peerName(id) {
    const p = this.app.lobbyNet?.peers?.get(id);
    return p?.name || (id || '').slice(0, 4);
  }
  _peerColor(id) {
    const p = this.app.lobbyNet?.peers?.get(id);
    return p?.color;
  }

  // -- results & tally -----------------------------------------------

  _reportResult(won) {
    if (!this.currentRound) return;
    if (this.currentRound.results.has(this.app.me.id)) return;
    this.currentRound.results.set(this.app.me.id, won);
    if (this.net) this.net.reportResult({ n: this.currentRound.n, won });
    this._showWaitBanner(won);
    this._maybeEndRound();
  }

  _onResult(data) {
    if (!this.currentRound || data.n !== this.currentRound.n) return;
    this.currentRound.results.set(data.peerId, data.won);
    this._updateWaitProgress();
    this._maybeEndRound();
  }

  // Banner shown to the player the moment they finish their own
  // instance of the microgame — the round itself keeps running until
  // every living peer reports or the timer expires, so without this
  // feedback the game feels frozen after an early win (SWAT, PUNCH,
  // COLLECT, etc.).
  _showWaitBanner(won) {
    const banner = document.getElementById('wait-banner');
    const mark = document.getElementById('wait-mark');
    const text = document.getElementById('wait-text');
    if (!banner) return;
    mark.textContent = won ? '✓' : '✗';
    mark.className = won ? 'win' : 'lose';
    text.textContent = won ? 'COMPLETE' : 'MISSED';
    this._updateWaitProgress();
    banner.classList.remove('hidden');
  }

  _updateWaitProgress() {
    const prog = document.getElementById('wait-progress');
    if (!prog || !this.currentRound) return;
    const living = this._livingPlayers();
    const reported = living.filter(p => this.currentRound.results.has(p)).length;
    prog.textContent = reported >= living.length
      ? 'round ending…'
      : `${reported}/${living.length} finished — waiting…`;
  }

  _hideWaitBanner() {
    const banner = document.getElementById('wait-banner');
    if (banner) banner.classList.add('hidden');
  }

  _maybeEndRound() {
    if (!this.isHost()) return;
    const living = this._livingPlayers();
    const done = living.every(p => this.currentRound.results.has(p));
    if (!done) return;
    this._computeAndBroadcastTally();
  }

  _forceRoundEnd() {
    if (!this.currentRound) return;
    const living = this._livingPlayers();
    for (const p of living) {
      if (!this.currentRound.results.has(p)) this.currentRound.results.set(p, false);
    }
    if (this.isHost()) this._computeAndBroadcastTally();
  }

  _computeAndBroadcastTally() {
    if (this._tallyBroadcast) return;
    this._tallyBroadcast = true;

    const lives = {};
    const eliminated = [];
    for (const pid of this.matchInfo.players) {
      const cur = this.lives.get(pid) ?? 0;
      const res = this.currentRound.results.get(pid);
      const next = res === false ? Math.max(0, cur - 1) : cur;
      lives[pid] = next;
      if (cur > 0 && next === 0) eliminated.push(pid);
    }
    const payload = { n: this.currentRound.n, lives, eliminated };
    if (this.net) this.net.announceTally(payload);
    else          this._onTally(payload);
  }

  _onTally(data) {
    for (const [pid, l] of Object.entries(data.lives)) this.lives.set(pid, l);
    this._disposeMicrogame();
    this._renderLives();
    this._flashResult();
    setTimeout(() => {
      this.currentRound = null;
      this._startNextRound();
    }, BETWEEN_ROUNDS_MS);
  }

  _flashResult() {
    const me = this.app.me.id;
    const myRes = this.currentRound?.results.get(me);
    const instr = document.getElementById('instruction');
    if (myRes === true)       instr.textContent = '✓ SAFE';
    else if (myRes === false) instr.textContent = '✗ LOST A LIFE';
    else                      instr.textContent = '—';
    instr.style.animation = 'none';
    void instr.offsetWidth;
    instr.style.animation = '';
  }

  _onFinish(data) {
    this._disposeMicrogame();
    document.getElementById('match-ui').classList.add('hidden');
    document.getElementById('state-tag').textContent = 'lobby';
    if (this._timerRaf) cancelAnimationFrame(this._timerRaf);

    this._resolve?.({
      winner: data.winner,
      reason: data.reason,
      lives: Object.fromEntries(this.lives),
      iWon: data.winner === this.app.me.id,
    });
    this._resolve = null;
  }

  // -- cleanup -------------------------------------------------------

  _disposeMicrogame() {
    this._clearPreRoundTicks();
    this._clearRoundRebroadcast();
    this._hideWaitBanner();
    if (this._ghostInterval) { clearInterval(this._ghostInterval); this._ghostInterval = null; }
    if (this._roundTimer) { clearTimeout(this._roundTimer); this._roundTimer = null; }
    if (this._updateUnsub) { this._updateUnsub(); this._updateUnsub = null; }
    if (this.microgame) {
      try { this.microgame.dispose(); } catch (e) { console.error('[match] dispose', e); }
      this.microgame = null;
    }
    // Safety net: hide pre-round overlay if we're tearing down mid-countdown.
    const pre = document.getElementById('preround-ui');
    if (pre) pre.classList.add('hidden');
  }

  destroy() {
    this._disposeMicrogame();
    if (this._timerRaf) cancelAnimationFrame(this._timerRaf);
  }
}
