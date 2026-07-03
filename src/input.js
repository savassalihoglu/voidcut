// Unified input: arrow keys / WASD on desktop, drag-to-steer on touch.
// `dir` is the currently-held 4-way direction ({x,y}) or null when idle.
// Touch works like a leashed joystick: the anchor follows the finger so
// direction changes are instant without lifting.

const KEY_DIRS = {
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
};

const DEAD_ZONE = 14;   // px before a drag counts as steering
const LEASH = 34;       // px anchor trails behind the finger

export class Input {
  constructor(canvas) {
    this.dir = null;
    this.held = [];            // key codes in press order (latest wins)
    this.touchId = null;
    this.anchor = null;
    this.tapped = false;       // one-shot "user tapped/pressed" flag
    this.touchActive = false;  // finger currently down (drives on-screen hint)

    window.addEventListener('keydown', (e) => {
      if (KEY_DIRS[e.code]) {
        e.preventDefault();
        if (!this.held.includes(e.code)) this.held.push(e.code);
        this.updateKeyDir();
      }
      if (e.code === 'Space' || e.code === 'Enter') this.tapped = true;
    });
    window.addEventListener('keyup', (e) => {
      const i = this.held.indexOf(e.code);
      if (i >= 0) this.held.splice(i, 1);
      this.updateKeyDir();
    });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tapped = true;
      this.touchId = e.pointerId;
      this.anchor = { x: e.clientX, y: e.clientY };
      this.touchActive = true;
      try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* synthetic or already-released pointer */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchId || !this.anchor) return;
      e.preventDefault();
      const dx = e.clientX - this.anchor.x;
      const dy = e.clientY - this.anchor.y;
      const d = Math.hypot(dx, dy);
      if (d > DEAD_ZONE) {
        this.dir = Math.abs(dx) > Math.abs(dy)
          ? { x: Math.sign(dx), y: 0 }
          : { x: 0, y: Math.sign(dy) };
      }
      if (d > LEASH) { // drag the anchor along so reversals register quickly
        this.anchor.x = e.clientX - (dx / d) * LEASH;
        this.anchor.y = e.clientY - (dy / d) * LEASH;
      }
    });
    const end = (e) => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null;
      this.anchor = null;
      this.touchActive = false;
      if (this.held.length === 0) this.dir = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateKeyDir() {
    const last = this.held[this.held.length - 1];
    if (last) this.dir = KEY_DIRS[last];
    else if (!this.touchActive) this.dir = null;
  }

  consumeTap() {
    const t = this.tapped;
    this.tapped = false;
    return t;
  }

  clear() {
    this.dir = null;
    this.held = [];
    this.tapped = false;
  }
}
