// Boot: wire modules together, do the YouTube Playables handshake, run the loop.
import { YT } from './yt.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Renderer } from './render.js';

async function boot() {
  const canvas = document.getElementById('game');
  const input = new Input(canvas);
  const audio = new GameAudio();
  const ui = new UI(document.getElementById('ui'));
  const game = new Game(ui, audio, input);
  const renderer = new Renderer(canvas, game);

  window.addEventListener('error', (e) => YT.logError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => YT.logError(e.reason));

  // Cloud save must be loaded before anything writes (prevents clobbering).
  const saved = await YT.loadData();
  game.save = {
    v: 1,
    best: Number.isFinite(saved.best) ? Math.max(0, Math.floor(saved.best)) : 0,
    maxSector: Number.isFinite(saved.maxSector) ? Math.max(1, Math.floor(saved.maxSector)) : 1,
    tutorialDone: saved.tutorialDone === true,
  };

  // Audio follows the YouTube player's sound setting.
  audio.setEnabled(YT.isAudioEnabled());
  YT.onAudioEnabledChange((on) => audio.setEnabled(on));

  // Pause fully stops simulation + rendering + sound; resume waits for a tap
  // on the CONTINUE button so players are never ambushed.
  game.requestResume = () => game.exitPause();
  YT.onPause(() => game.enterPause());
  YT.onResume(() => {
    // menu screens resume immediately; gameplay waits for the CONTINUE tap
    if (game.pauseSilent) game.exitPause();
  });

  // WebAudio unlocks on the first user gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Esc / P toggles pause during a run (desktop convenience).
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    if (game.paused) game.exitPause();
    else game.userPause();
  });

  window.addEventListener('resize', () => renderer.resize());

  // dev-only introspection hook (never present inside YouTube)
  if (!YT.inYouTube) window.__game = { game, renderer, input, audio };

  game.toTitle();

  let last = performance.now();
  let handshook = false;
  let lastErrLog = -Infinity;
  function frame(now) {
    requestAnimationFrame(frame); // schedule first — a bad frame must never kill the loop
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (!game.paused) {
        game.update(dt);
        renderer.draw(now / 1000);
      }
      if (!handshook) {
        handshook = true;
        // First real frame is on screen and the title is interactive.
        YT.firstFrameReady();
        YT.gameReady();
      }
    } catch (e) {
      if (now - lastErrLog > 5000) { // throttle: don't spam health reporting at 60fps
        lastErrLog = now;
        YT.logError(e);
      }
    }
  }
  requestAnimationFrame(frame);
}

boot();
