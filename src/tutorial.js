// Interactive first-play tutorial. Runs inside a defanged sector 1 (one slow
// boss, nothing else, gentle fuse). Steps advance on real player actions;
// deaths cost nothing while it's active.

const IS_TOUCH = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

const STEPS = [
  {
    id: 'move',
    text: () => (IS_TOUCH ? 'HOLD & DRAG TO MOVE ALONG THE WALL' : 'ARROW KEYS / WASD — MOVE ALONG THE WALL'),
    check: (game, t) => t.movedCells >= 12,
  },
  {
    id: 'cut',
    text: () => 'NOW STEER INTO THE VOID TO CUT A LINE',
    check: (game) => game.player.drawing && game.grid.trail.length >= 6,
  },
  {
    id: 'claim',
    text: () => 'REACH ANY WALL TO CLOSE THE LOOP AND CLAIM IT',
    check: (game) => game.grid.claimedPercent() > 0.0005,
  },
  { id: 'danger', text: () => 'DANGER — NOTHING MAY TOUCH YOUR LINE', timed: 3.6 },
  { id: 'fuse', text: () => 'KEEP MOVING MID-CUT: A STALLED LINE BURNS', timed: 3.6 },
  { id: 'goal', text: () => 'FILL THE BAR — CLAIM 80% TO WIN. GO!', timed: 3.0 },
];

export class Tutorial {
  constructor() {
    this.idx = 0;
    this.timer = 0;
    this.movedCells = 0;
    this.last = null;
    this.finished = false;
  }

  get step() { return STEPS[this.idx]; }
  currentId() { return this.step ? this.step.id : null; }
  text() { return this.step ? this.step.text() : ''; }
  count() { return STEPS.length; }

  // Returns the id of the step just completed, or null.
  update(game, dt) {
    if (this.finished || !this.step) return null;

    const p = game.player;
    if (this.last && (this.last.x !== p.cx || this.last.y !== p.cy)) this.movedCells++;
    this.last = { x: p.cx, y: p.cy };

    const st = this.step;
    let done;
    if (st.timed) {
      this.timer += dt;
      done = this.timer >= st.timed;
    } else {
      done = st.check(game, this);
    }
    if (!done) return null;

    this.idx++;
    this.timer = 0;
    if (this.idx >= STEPS.length) this.finished = true;
    return st.id;
  }
}
