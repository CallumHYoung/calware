# CalWare — 3D Microgame Brawler

Fork of the Ordinary Game Jam starter. A browser-only, P2P multiplayer
3D microgame battler in the WarioWare tradition: short reflex games, one
after another, last player with lives wins.

## Run

```bash
python -m http.server 8000
# open http://localhost:8000
```

Open in two tabs to test multiplayer. Walk into the cyan ring in the
lobby to queue, or press **Play solo** to try it alone.

## How it's wired

- **Lobby room** (`calware-lobby-v1`, via Trystero) holds all connected
  players. Carries presence, queue state, and match-start announcements.
- **Match rooms** (`calware-match-<id>`) are created per match. Only the
  invited players join, so new loads landing in the lobby can never
  interrupt an in-progress match.
- **Host model**: lowest peer id in a room is host. Host picks
  microgames + seeds; all peers run the same seeded simulation locally
  and report their own win/loss.
- **Solo mode** uses the same match controller with a null network — so
  the microgame interface is identical online and offline.

## Files

```
index.html         shell + importmap for three
style.css
portal.js          Ordinary Game Jam portal protocol (unchanged)
main.js            entry — wires lobby <-> match
net.js             LobbyNet + MatchNet (Trystero)
three-setup.js     shared renderer, loop, studio rig
lobby.js           3D lobby scene + queue/portal zones
match.js           match director (rounds, lives, tally, finish)
microgames/
  index.js         registry
  _ghosts.js       helper: translucent opponent avatars from pos broadcasts
  dodge.js         WASD, survive falling spheres                  (+ ghosts)
  punch.js         mouse aim + click a moving target
  jump.js          SPACE to jump walls
  collect.js       WASD, gather every orb                         (+ ghosts)
  stack.js         SPACE to drop each sliding block onto the last
  swat.js          mouse, click every flying bug
  race.js          SHARED scene — sprint to the finish, first wins
  thumbnails/      drop 320x180 (or square) PNGs here per key
```

## Multiplayer modes

Microgames come in two flavors:

- **Instanced (default)** — each player runs their own copy with the
  same seed. Ghosts of other players are shown as translucent avatars
  based on their broadcast `{ x, z }` state. You play independently but
  see where the others are.
- **Shared scene** — every player is in the same 3D world (`race.js`).
  Lane assignment is deterministic (sorted peer-ids), each peer drives
  their own avatar, and the ghost channel carries custom state like
  `finished: true` to coordinate wins/losses.

The director broadcasts `microgame.getGhostState()` at 10 Hz through
the MatchNet `pos` channel, and delivers incoming data to
`microgame.setGhostState(peerId, state)`. Both are optional — if you
don't implement them, your microgame stays pure-instanced with no
ghosts. See `_ghosts.js` for the reusable rig used by the built-in
multiplayer microgames.

Between each round the director shows a "Up Next" screen with the
microgame's title, one-line rules, controls, optional thumbnail, and a
3-2-1-GO countdown. Durations scale with round difficulty so late-match
rounds feel tighter.

## Adding a microgame

1. Create `microgames/<name>.js` with a default export:

```js
export default {
  key: 'myname',
  title: 'DO THE THING!',                       // flashed on preround + HUD
  description: 'Explain what to do in one line.',
  controls: 'Mouse — click',                    // optional hint chip
  thumbnail: 'microgames/thumbnails/myname.png',// optional; missing is fine
  baseDuration: 5.0,
  mount(ctx) {
    // ctx = {
    //   THREE, seed, difficulty, duration,
    //   onWin, onLose,
    //   keys, mouse,
    //   me: { id, name, color },         // multiplayer-aware games
    //   otherPlayers: [{ id, name, color }, ...],
    //   playerColor, playerName,          // convenience aliases
    // }
    return {
      scene, camera, update(dt), dispose(),
      getGhostState() { return { x, z, ...anything } },   // optional — broadcast at 10 Hz
      setGhostState(peerId, state) { /* apply incoming */ }, // optional — route from director
    };
  },
};
```

2. Register it in `microgames/index.js`.

The round seed is host-broadcast, so every peer running the same
microgame sees identical procedural content. Use the seed to parametrize
your RNG.

## Portal protocol

Walk into the purple portal in the lobby to jump to another jam game
(pulled live from the jam registry). Incoming portal params are
respected — if another game sent you here with a username/color, we use
them.

Spec: https://github.com/CallumHYoung/gamejam/blob/main/SPEC.md
