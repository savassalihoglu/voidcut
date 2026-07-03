// Particles, floating score popups, screen shake, claim flashes.
// All coordinates are in grid-cell space; render.js applies the transform.

export class Fx {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.flashes = [];   // { cells, t, dur } claimed-region white flash
    this.shakeAmt = 0;
  }

  reset() {
    this.particles.length = 0;
    this.popups.length = 0;
    this.flashes.length = 0;
    this.shakeAmt = 0;
  }

  burst(x, y, color, n = 12, speed = 14, life = 0.6, size = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.5 + Math.random() * 0.5), t: 0,
        color, size: size * (0.5 + Math.random() * 0.8),
      });
    }
  }

  trailFizzle(trail, color) {
    for (let i = 0; i < trail.length; i += 2) {
      const c = trail[i];
      this.burst(c.x, c.y, color, 2, 8, 0.5, 0.6);
    }
  }

  popup(x, y, text, color = '#ffd23f', size = 1) {
    this.popups.push({ x, y, text, color, size, t: 0, life: 1.1 });
  }

  claimFlash(cellList) {
    // sample the region for sparkles
    const step = Math.max(1, Math.floor(cellList.length / 70));
    for (let i = 0; i < cellList.length; i += step) {
      const c = cellList[i];
      this.burst(c.x, c.y, '#9be8ff', 1, 6, 0.5, 0.7);
    }
    this.flashes.push({ cells: cellList, t: 0, dur: 0.45 });
  }

  shake(amt) { this.shakeAmt = Math.min(2.5, this.shakeAmt + amt); }

  update(dt) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 4);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.2;
      p.vy *= 1 - dt * 2.2;
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t >= p.life) this.popups.splice(i, 1);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.dur) this.flashes.splice(i, 1);
    }
  }

  shakeOffset() {
    if (this.shakeAmt <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shakeAmt,
      y: (Math.random() - 0.5) * this.shakeAmt,
    };
  }
}
