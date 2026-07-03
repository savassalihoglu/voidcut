// Territory grid — the Qix/Volfied core.
// Cells: SEA (unclaimed), LAND (claimed), TRAIL (the line being drawn).
// The playfield starts as sea with a 1-cell land frame. Completing a trail
// converts it to land and flood-fills every sea region that does NOT contain
// the boss.

export const SEA = 0, LAND = 1, TRAIL = 2;

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.mark = new Uint8Array(w * h);   // scratch for flood fill
    this.stack = new Int32Array(w * h);  // scratch stack (indices)
    this.trail = [];                     // ordered [{x,y}] — last item is the player's cell
    this.rev = 0;                        // bumped on any land/trail change (render cache key)
    this.reset();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.cells[y * this.w + x]; }

  reset() {
    this.cells.fill(SEA);
    for (let x = 0; x < this.w; x++) {
      this.cells[this.idx(x, 0)] = LAND;
      this.cells[this.idx(x, this.h - 1)] = LAND;
    }
    for (let y = 0; y < this.h; y++) {
      this.cells[this.idx(0, y)] = LAND;
      this.cells[this.idx(this.w - 1, y)] = LAND;
    }
    this.trail = [];
    this.initialSea = (this.w - 2) * (this.h - 2);
    this.seaCount = this.initialSea;
    this.rev++;
  }

  isLand(x, y) { return this.inBounds(x, y) && this.get(x, y) === LAND; }
  isSea(x, y) { return this.inBounds(x, y) && this.get(x, y) === SEA; }
  isTrail(x, y) { return this.inBounds(x, y) && this.get(x, y) === TRAIL; }

  // Land cell touching open water (or an active trail) — where ships and
  // patrollers are allowed to travel.
  isCoast(x, y) {
    if (!this.isLand(x, y)) return false;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (this.inBounds(nx, ny) && this.cells[this.idx(nx, ny)] !== LAND) return true;
    }
    return false;
  }

  claimedPercent() { return 1 - this.seaCount / this.initialSea; }

  // ---------- trail ----------
  beginTrail(x, y) {
    this.trail = [{ x, y }];
    this.cells[this.idx(x, y)] = TRAIL;
    this.rev++;
  }

  extendTrail(x, y) {
    this.trail.push({ x, y });
    this.cells[this.idx(x, y)] = TRAIL;
    this.rev++;
  }

  cancelTrail() {
    for (const c of this.trail) this.cells[this.idx(c.x, c.y)] = SEA;
    this.trail = [];
    this.rev++;
  }

  // Completes the trail. bossX/bossY: the region containing this cell stays sea.
  // Returns { claimed: number, cellList: [{x,y}] of every newly-land cell }.
  completeTrail(bossX, bossY) {
    const { cells, w, h } = this;
    const cellList = [];

    for (const c of this.trail) {
      cells[this.idx(c.x, c.y)] = LAND;
      cellList.push(c);
    }
    let claimed = this.trail.length;
    this.seaCount -= this.trail.length;
    this.trail = [];

    // Flood-fill the boss's sea region → everything sea and unmarked is claimed.
    this.mark.fill(0);
    let seed = this.findSeaSeed(bossX, bossY);
    if (seed >= 0) {
      const stack = this.stack;
      let sp = 0;
      stack[sp++] = seed;
      this.mark[seed] = 1;
      while (sp > 0) {
        const i = stack[--sp];
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (this.mark[ni] === 0 && cells[ni] === SEA) {
            this.mark[ni] = 1;
            stack[sp++] = ni;
          }
        }
      }
    }

    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === SEA && this.mark[i] === 0) {
        cells[i] = LAND;
        claimed++;
        this.seaCount--;
        cellList.push({ x: i % w, y: (i / w) | 0 });
      }
    }

    this.rev++;
    return { claimed, cellList };
  }

  // Nearest sea cell to (x,y) — the boss lives in open water, but guard against
  // rounding putting its center on a freshly-landed cell.
  findSeaSeed(x, y) {
    x = Math.max(0, Math.min(this.w - 1, Math.round(x)));
    y = Math.max(0, Math.min(this.h - 1, Math.round(y)));
    if (this.get(x, y) === SEA) return this.idx(x, y);
    for (let r = 1; r < Math.max(this.w, this.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.inBounds(nx, ny) && this.get(nx, ny) === SEA) return this.idx(nx, ny);
        }
      }
    }
    return -1; // no sea left
  }

  // Random sea cell at least `margin` cells from the frame (power-up placement).
  randomSeaCell(margin = 12) {
    for (let tries = 0; tries < 200; tries++) {
      const x = margin + Math.floor(Math.random() * (this.w - margin * 2));
      const y = margin + Math.floor(Math.random() * (this.h - margin * 2));
      if (this.isSea(x, y)) return { x, y };
    }
    return null;
  }

  // Nearest coast cell to (x,y) — BFS over land; used to re-seat patrollers
  // after a claim erases their stretch of coastline.
  nearestCoast(x, y, maxR = 80) {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.isCoast(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
}
