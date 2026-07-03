import { SEA, LAND, TRAIL } from './grid.js';

const DIR_VECS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N (clockwise)

// ---------------------------------------------------------------- Player
export class Player {
  constructor(x, y) {
    this.cx = x; this.cy = y;      // logical cell
    this.rx = x; this.ry = y;      // render position (smoothed)
    this.anchor = { x, y };        // respawn point (start of current trail)
    this.drawing = false;
    this.moveAcc = 0;
    this.stillTime = 0;            // time stalled while drawing (fuse trigger)
    this.invuln = 0;
    this.onStartTrail = null;      // set by game
    this.onComplete = null;        // set by game
  }

  place(x, y) {
    this.cx = x; this.cy = y; this.rx = x; this.ry = y;
    this.anchor = { x, y };
    this.drawing = false;
    this.moveAcc = 0;
    this.stillTime = 0;
  }

  update(dt, dir, grid, speed) {
    if (this.invuln > 0) this.invuln -= dt;

    let movedThisFrame = false;
    if (dir) {
      this.moveAcc += dt * speed;
      let steps = 0;
      while (this.moveAcc >= 1 && steps < 8) {
        this.moveAcc -= 1;
        if (this.step(dir, grid)) movedThisFrame = true;
        steps++;
      }
      this.moveAcc = Math.min(this.moveAcc, 1);
    } else {
      this.moveAcc = 0;
    }

    if (this.drawing && !movedThisFrame) this.stillTime += dt;
    else this.stillTime = 0;

    // render smoothing
    const k = Math.min(1, dt * 30);
    this.rx += (this.cx - this.rx) * k;
    this.ry += (this.cy - this.ry) * k;
  }

  step(dir, grid) {
    const nx = this.cx + dir.x, ny = this.cy + dir.y;
    if (!grid.inBounds(nx, ny)) return false;
    const cell = grid.get(nx, ny);

    if (!this.drawing) {
      if (cell === LAND) {
        // travel is along the coastline; the off-coast clause frees a ship
        // marooned when a claim moves the shore out from under it
        if (grid.isCoast(nx, ny) || !grid.isCoast(this.cx, this.cy)) {
          this.cx = nx; this.cy = ny;
          return true;
        }
        return false;
      }
      if (cell === SEA) {
        this.anchor = { x: this.cx, y: this.cy };
        grid.beginTrail(nx, ny);
        this.drawing = true;
        this.cx = nx; this.cy = ny;
        if (this.onStartTrail) this.onStartTrail();
        return true;
      }
      return false;
    }

    // drawing
    if (cell === SEA) {
      grid.extendTrail(nx, ny);
      this.cx = nx; this.cy = ny;
      return true;
    }
    if (cell === LAND) {
      this.cx = nx; this.cy = ny;
      this.drawing = false;
      this.stillTime = 0;
      if (this.onComplete) this.onComplete();
      return true;
    }
    return false; // own trail
  }
}

// ---------------------------------------------------------------- Boss
// Archetypes cycle by sector — each has its own look and movement personality.
export const BOSS_TYPES = [
  { key: 'prism',  name: 'PRISM',  color: '#ff5a4e', move: 'wander' },
  { key: 'vortex', name: 'VORTEX', color: '#b26bff', move: 'orbit' },
  { key: 'stalker', name: 'STALKER', color: '#5aff8a', move: 'stalk' },
  { key: 'shard',  name: 'SHARD',  color: '#ff9d2e', move: 'dash' },
  { key: 'pulsar', name: 'PULSAR', color: '#ffd23f', move: 'pulse' },
  { key: 'wraith', name: 'WRAITH', color: '#7dd0ff', move: 'drift' },
];

export class Boss {
  constructor(x, y, r, speed, sides, typeIdx = 0) {
    this.x = x; this.y = y;
    this.r = r;
    this.rNow = r;            // effective radius (PULSAR breathes)
    this.speed = speed;
    this.sides = sides;
    this.info = BOSS_TYPES[typeIdx % BOSS_TYPES.length];
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a); this.vy = Math.sin(a);
    this.phase = Math.random() * 10;
    this.flash = 0;           // telegraph before firing
    this.dashState = 'cruise';
    this.dashT = 2.2;
    this.dashTele = false;    // telegraph before lunging (SHARD)
    this.hist = [];           // afterimage trail (WRAITH)
  }

  update(dt, grid, mult, tx = null, ty = null) {
    if (this.flash > 0) this.flash -= dt;
    const mode = this.info.move;

    // per-type speed envelope
    let spMult = 1;
    if (mode === 'drift') {
      const w = 0.5 + 0.5 * Math.sin(this.phase * 0.85);
      spMult = 0.35 + 0.95 * w * w;                    // ghostly surges
    } else if (mode === 'dash') {
      this.dashT -= dt * (mult > 0 ? 1 : 0);           // freeze stalls the lunge cycle
      if (this.dashState === 'cruise') {
        spMult = 0.5;
        if (this.dashT <= 0) { this.dashState = 'tele'; this.dashT = 0.55; this.dashTele = true; }
      } else if (this.dashState === 'tele') {
        spMult = 0.12;
        if (this.dashT <= 0) {
          this.dashState = 'dash'; this.dashT = 0.6; this.dashTele = false;
          if (tx != null) {                            // lunge straight at the ship
            const d = Math.hypot(tx - this.x, ty - this.y) || 1;
            this.vx = (tx - this.x) / d; this.vy = (ty - this.y) / d;
          }
        }
      } else {
        spMult = 3.1;
        if (this.dashT <= 0) { this.dashState = 'cruise'; this.dashT = 2.2; }
      }
    }

    const sp = this.speed * mult * spMult;
    if (mult <= 0) return;                             // fully frozen
    this.phase += dt;
    if (mode === 'pulse') this.rNow = this.r * (0.85 + 0.18 * Math.sin(this.phase * 1.7));
    else this.rNow = this.r;

    // steering
    if (mode === 'orbit') {
      const turn = dt * 1.15;
      const cos = Math.cos(turn), sin = Math.sin(turn);
      const nvx = this.vx * cos - this.vy * sin;
      this.vy = this.vx * sin + this.vy * cos;
      this.vx = nvx;
    } else if (mode === 'stalk' && tx != null) {
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      const k = Math.min(1, dt * 1.1);
      this.vx += ((tx - this.x) / d - this.vx) * k;
      this.vy += ((ty - this.y) / d - this.vy) * k;
    } else if (!(mode === 'dash' && this.dashState === 'dash')) {
      const drift = (Math.random() - 0.5) * dt * 1.6;
      const cos = Math.cos(drift), sin = Math.sin(drift);
      const nvx = this.vx * cos - this.vy * sin;
      this.vy = this.vx * sin + this.vy * cos;
      this.vx = nvx;
    }

    const stepX = this.vx * sp * dt;
    const stepY = this.vy * sp * dt;
    if (this.circleFree(grid, this.x + stepX, this.y, this.r)) this.x += stepX;
    else { this.vx = -this.vx; this.vy += (Math.random() - 0.5) * 0.4; }
    if (this.circleFree(grid, this.x, this.y + stepY, this.r)) this.y += stepY;
    else { this.vy = -this.vy; this.vx += (Math.random() - 0.5) * 0.4; }
    const n = Math.hypot(this.vx, this.vy) || 1;
    this.vx /= n; this.vy /= n;

    if (mode === 'drift') {
      this.hist.unshift({ x: this.x, y: this.y });
      if (this.hist.length > 14) this.hist.pop();
    }
  }

  circleFree(grid, x, y, r) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(grid.w - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(grid.h - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx - x, dy = cy - y;
        if (dx * dx + dy * dy <= r2 && grid.get(cx, cy) === LAND) return false;
      }
    }
    return true;
  }

  touchesTrail(grid) {
    const r = this.rNow + 0.4;
    const x0 = Math.max(0, Math.floor(this.x - r)), x1 = Math.min(grid.w - 1, Math.ceil(this.x + r));
    const y0 = Math.max(0, Math.floor(this.y - r)), y1 = Math.min(grid.h - 1, Math.ceil(this.y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx - this.x, dy = cy - this.y;
        if (dx * dx + dy * dy <= r2 && grid.get(cx, cy) === TRAIL) return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------- Minion
export class Minion {
  constructor(x, y, speed) {
    this.x = x; this.y = y;
    this.r = 1.1;
    const a = (Math.PI / 4) + Math.floor(Math.random() * 4) * (Math.PI / 2); // diagonals
    this.vx = Math.cos(a) * speed;
    this.vy = Math.sin(a) * speed;
    this.phase = Math.random() * 10;
    this.dead = false;
  }

  update(dt, grid, mult) {
    this.phase += dt;
    const stepX = this.vx * mult * dt, stepY = this.vy * mult * dt;
    if (this.free(grid, this.x + stepX, this.y)) this.x += stepX;
    else this.vx = -this.vx;
    if (this.free(grid, this.x, this.y + stepY)) this.y += stepY;
    else this.vy = -this.vy;
  }

  free(grid, x, y) {
    const r = this.r;
    return !grid.isLand(Math.round(x + r), Math.round(y)) &&
           !grid.isLand(Math.round(x - r), Math.round(y)) &&
           !grid.isLand(Math.round(x), Math.round(y + r)) &&
           !grid.isLand(Math.round(x), Math.round(y - r)) &&
           !grid.isLand(Math.round(x), Math.round(y));
  }

  onTrail(grid) {
    return grid.isTrail(Math.round(this.x), Math.round(this.y)) ||
           grid.isTrail(Math.round(this.x + this.r), Math.round(this.y)) ||
           grid.isTrail(Math.round(this.x - this.r), Math.round(this.y)) ||
           grid.isTrail(Math.round(this.x), Math.round(this.y + this.r)) ||
           grid.isTrail(Math.round(this.x), Math.round(this.y - this.r));
  }
}

// ---------------------------------------------------------------- Patroller
// Walks the coastline (right-hand rule), menacing the "safe" border.
export class Patroller {
  constructor(x, y, dir, speed) {
    this.cx = x; this.cy = y;
    this.rx = x; this.ry = y;
    this.dir = dir; // 0..3 index into DIR_VECS
    this.speed = speed;
    this.acc = 0;
    this.phase = Math.random() * 10;
  }

  update(dt, grid, mult) {
    this.phase += dt;
    this.acc += dt * this.speed * mult;
    let steps = 0;
    while (this.acc >= 1 && steps < 6) {
      this.acc -= 1;
      this.step(grid);
      steps++;
    }
    const k = Math.min(1, dt * 20);
    this.rx += (this.cx - this.rx) * k;
    this.ry += (this.cy - this.ry) * k;
  }

  step(grid) {
    // try right, straight, left, back — hugs the wall around corners
    const order = [(this.dir + 1) % 4, this.dir, (this.dir + 3) % 4, (this.dir + 2) % 4];
    for (const d of order) {
      const [dx, dy] = DIR_VECS[d];
      const nx = this.cx + dx, ny = this.cy + dy;
      if (grid.isCoast(nx, ny)) {
        this.cx = nx; this.cy = ny; this.dir = d;
        return;
      }
    }
  }

  // A claim can delete the stretch of coast it was walking — re-seat it.
  reseat(grid) {
    if (grid.isCoast(this.cx, this.cy)) return;
    const c = grid.nearestCoast(this.cx, this.cy);
    if (c) { this.cx = c.x; this.cy = c.y; this.rx = c.x; this.ry = c.y; }
  }
}

// ---------------------------------------------------------------- Projectile
export class Projectile {
  constructor(x, y, tx, ty, speed) {
    this.x = x; this.y = y;
    const d = Math.hypot(tx - x, ty - y) || 1;
    this.vx = (tx - x) / d * speed;
    this.vy = (ty - y) / d * speed;
    this.dead = false;
    this.life = 0;
  }

  update(dt, grid) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life += dt;
    if (this.x < 1 || this.y < 1 || this.x > grid.w - 2 || this.y > grid.h - 2 || this.life > 12) {
      this.dead = true;
    }
  }
}

// ---------------------------------------------------------------- PowerTile
export const POWER_TYPES = {
  SPEED:  { color: '#37e0ff', symbol: '▲' },
  FREEZE: { color: '#bfe9ff', symbol: '✦' },
  SLOW:   { color: '#ffb02e', symbol: '◐' },
  POINTS: { color: '#ffd23f', symbol: '★' },
  LIFE:   { color: '#ff6bd6', symbol: '♥' },
};

export class PowerTile {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.phase = Math.random() * 10;
    this.taken = false;
  }
}
