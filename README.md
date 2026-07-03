# VOIDCUT (working title)

A Volfied/Qix-style territory-capture arcade game built for **YouTube Playables**.
Steer your ship along the coastline, cut loops into the void, and claim **80%**
of each sector — without letting anything touch your line.

No engine, no build step, no binary assets: plain HTML5 canvas + ES modules,
with all art vector-drawn and all sound synthesized via WebAudio. The whole
game is a few dozen KB, which keeps Playables load time near-instant.

## Renaming the game

The name is intentionally centralized:

1. `src/config.js` → `GAME_NAME`, `GAME_TAGLINE` (and optionally `SAVE_KEY`)
2. `index.html` → `<title>`

Nothing else references the name.

## Controls

- **Touch**: press and drag anywhere to steer (leashed joystick); release to stop.
- **Desktop**: arrow keys / WASD. Space/Enter to confirm menus.

## Tutorial

First-time players get an interactive tutorial automatically (move → cut →
claim → hazards → goal) in a defanged practice field with no life loss; it's
skippable and replayable via HOW TO PLAY on the title screen. Completion is
stored in the save (`tutorialDone`). Logic lives in `src/tutorial.js`.

## Gameplay

- You travel on the glowing coastline. Steering into open space starts a cut.
- Returning to land completes the loop; the side without the boss gets claimed.
- Anything touching your line kills you. Stalling mid-cut ignites a **fuse**
  that burns along your line toward you.
- Minions trapped inside a claim are destroyed (+500). Enclose power tiles
  for SPEED / FREEZE / SLOW-MO / points / extra lives.
- From sector 3: patrollers hunt you on the coastline. From sector 4: the
  boss shoots at you.
- Six boss archetypes cycle by sector, each with its own look and behavior
  (`BOSS_TYPES` in `src/entities.js`): PRISM wanders, VORTEX orbits, STALKER
  homes in on you and fires faster, SHARD telegraphs then lunges, PULSAR
  breathes and fires 3-way spreads, WRAITH surges with afterimages.
- Score feedback: milestone popups, a live BEST chip in the HUD that goes
  gold when you pass your record, and a NEW BEST banner mid-run.
- Clear bonus scales with claim % — over-target and 95%+ "PERFECT" pay big.

## Run locally

Any static server works:

```sh
python3 -m http.server 8734
# open http://localhost:8734
```

Outside YouTube the SDK is absent; the game auto-falls back to localStorage
saves and never calls SDK APIs (see `src/yt.js`).

## YouTube Playables integration (`src/yt.js`, `src/main.js`)

- SDK `<script src="https://www.youtube.com/game_api/v1">` loads before game code.
- `firstFrameReady()` then `gameReady()` fire on the first rendered frame
  (there is no loading phase — everything is procedural).
- `loadData()` is awaited **before** any `saveData()`; saves happen on sector
  clear, game over, and pause. Save payload is tiny JSON: `{v, best, maxSector}`.
- `sendScore()` on game over; the sent best always matches the saved best.
- `onPause`/`onResume` fully halt simulation, rendering, and audio; resuming
  requires a tap so the player is never ambushed.
- Audio obeys `isAudioEnabled()` / `onAudioEnabledChange` (hard mute via
  master gain). No in-game mute button, per certification guidance.
- Global error handlers report through `health.logError()`.

## Packaging for submission

Zip the game files with `index.html` at the archive root:

```sh
zip -r voidcut.zip index.html css src -x "*.DS_Store"
```

## Tuning

- Difficulty curve: `src/levels.js` (speeds, enemy counts, fuse, projectiles)
- Feel: `src/config.js` → `TUNING` (movement speeds, fuse delay, invuln)
- Scoring: `src/config.js` → `SCORING`
