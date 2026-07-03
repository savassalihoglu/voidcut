import { LAND } from './grid.js';
import { COLORS } from './config.js';
import { POWER_TYPES } from './entities.js';

const HUD_INSET = 64;   // css px reserved for the DOM HUD
const MARGIN = 10;

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.dpr = 1;
    this.scale = 4; this.ox = 0; this.oy = 0;

    // terrain caches — 1 px per cell, repainted only when the grid changes
    const { w, h } = game.grid;
    this.landLayer = document.createElement('canvas');
    this.landLayer.width = w; this.landLayer.height = h;
    this.coastLayer = document.createElement('canvas');
    this.coastLayer.width = w; this.coastLayer.height = h;
    this.paintedRev = -1;

    this.stars = [];
    for (let i = 0; i < 110; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        z: 0.3 + Math.random() * 0.7,
        p: Math.random() * 10,
      });
    }

    this.resize();
  }

  resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.cw = cw; this.ch = ch;

    const { w, h } = this.game.grid;
    const availW = cw - MARGIN * 2;
    const availH = ch - HUD_INSET - MARGIN * 2;
    this.scale = Math.min(availW / w, availH / h);
    this.ox = (cw - w * this.scale) / 2;
    this.oy = HUD_INSET + (availH - h * this.scale) / 2 + MARGIN;
  }

  // ---------- terrain cache ----------
  repaintTerrain() {
    const { grid } = this.game;
    const { w, h, cells } = grid;

    const lctx = this.landLayer.getContext('2d');
    const img = lctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === LAND) {
        const x = i % w, y = (i / w) | 0;
        const n = ((x * 7 + y * 13) % 9) - 4;        // cheap per-cell texture
        const o = i * 4;
        d[o] = 13 + n; d[o + 1] = 34 + n * 2; d[o + 2] = 68 + n * 2; d[o + 3] = 235;
      }
    }
    lctx.putImageData(img, 0, 0);

    const cctx = this.coastLayer.getContext('2d');
    const cimg = cctx.createImageData(w, h);
    const cd = cimg.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid.isCoast(x, y)) {
          const o = (y * w + x) * 4;
          cd[o] = 55; cd[o + 1] = 224; cd[o + 2] = 255; cd[o + 3] = 255;
        }
      }
    }
    cctx.putImageData(cimg, 0, 0);

    this.paintedRev = grid.rev;
  }

  // ---------- main draw ----------
  draw(time) {
    const { ctx, game } = this;
    const { grid, fx } = game;
    if (this.paintedRev !== grid.rev) this.repaintTerrain();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cw, this.ch);

    this.drawStars(time);

    const shake = fx.shakeOffset();
    ctx.save();
    ctx.translate(this.ox + shake.x * this.scale, this.oy + shake.y * this.scale);
    ctx.scale(this.scale, this.scale);

    this.drawSea(time);

    // land + coast glow (nearest-neighbor keeps the chunky pixel look)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.landLayer, 0, 0);
    ctx.save();
    ctx.shadowColor = COLORS.landEdge;
    ctx.shadowBlur = 10 * this.scale * 0.25;
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 2.2);
    ctx.drawImage(this.coastLayer, 0, 0);
    ctx.restore();
    ctx.drawImage(this.coastLayer, 0, 0);

    this.drawClaimFlashes();
    this.drawPowerTiles(time);
    this.drawTrail(time);
    this.drawFuse(time);
    for (const m of game.minions) this.drawMinion(m);
    for (const p of game.patrollers) this.drawPatroller(p);
    if (game.boss) this.drawBoss(game.boss, time);
    for (const pr of game.projectiles) this.drawProjectile(pr);
    this.drawPlayer(time);
    this.drawTutorialHints(time);
    this.drawParticles();
    this.drawPopups();

    ctx.restore();
  }

  drawStars(time) {
    const { ctx } = this;
    ctx.fillStyle = '#9fb6ff';
    for (const s of this.stars) {
      const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * 1.4 + s.p * 7));
      ctx.globalAlpha = 0.35 * tw * s.z;
      const x = (s.x + time * 0.004 * s.z) % 1;
      ctx.fillRect(x * this.cw, s.y * this.ch, 2 * s.z, 2 * s.z);
    }
    ctx.globalAlpha = 1;
  }

  drawSea(time) {
    const { ctx, game } = this;
    const { w, h } = game.grid;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.seaTop);
    g.addColorStop(1, COLORS.seaBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint tech grid
    ctx.strokeStyle = 'rgba(90, 140, 255, 0.05)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    for (let x = 8; x < w; x += 8) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 8; y < h; y += 8) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // sector accent wash
    ctx.fillStyle = `hsla(${game.params.hue}, 80%, 50%, 0.03)`;
    ctx.fillRect(0, 0, w, h);
  }

  drawClaimFlashes() {
    const { ctx, game } = this;
    for (const f of game.fx.flashes) {
      if (!f.path) {
        f.path = new Path2D();
        for (const c of f.cells) f.path.rect(c.x, c.y, 1, 1);
      }
      const a = 1 - f.t / f.dur;
      ctx.fillStyle = `rgba(190, 240, 255, ${0.55 * a})`;
      ctx.fill(f.path);
    }
  }

  drawTrail(time) {
    const { ctx, game } = this;
    const trail = game.grid.trail;
    if (!trail.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = COLORS.trail;
    ctx.shadowBlur = 8 * this.scale * 0.25;

    ctx.beginPath();
    ctx.moveTo(trail[0].x + 0.5, trail[0].y + 0.5);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x + 0.5, trail[i].y + 0.5);
    ctx.strokeStyle = COLORS.trail;
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.35 + 0.1 * Math.sin(time * 12);
    ctx.stroke();
    ctx.restore();
  }

  drawFuse(time) {
    const { ctx, game } = this;
    const fp = game.fusePoint();
    if (!fp) return;
    ctx.save();
    ctx.translate(fp.x + 0.5, fp.y + 0.5);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12 * this.scale * 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 0.9 + 0.35 * Math.sin(time * 25), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(time) {
    const { ctx, game } = this;
    const p = game.player;
    if (!p || game.state === 'gameover' || game.state === 'title') return;
    if (p.invuln > 0 && Math.floor(time * 14) % 2 === 0) return; // blink

    const x = p.rx + 0.5, y = p.ry + 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = p.drawing ? COLORS.trail : COLORS.landEdge;
    ctx.shadowBlur = 14 * this.scale * 0.25;

    const s = 2.1 + (p.drawing ? 0.3 * Math.sin(time * 14) : 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.rotate(-Math.PI / 4);

    ctx.strokeStyle = p.drawing ? COLORS.trail : COLORS.landEdge;
    ctx.lineWidth = 0.35;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6 + 0.3 * Math.sin(time * 6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawBoss(b, time) {
    const { ctx } = this;
    const color = b.info.color;
    const hot = b.flash > 0 || b.dashTele;   // telegraphing an attack
    const main = hot ? '#ffffff' : color;
    const r = b.rNow;

    // WRAITH afterimages (drawn in world space, before the transform)
    if (b.info.key === 'wraith') {
      for (let i = 3; i < b.hist.length; i += 4) {
        const g = b.hist[i];
        ctx.save();
        ctx.globalAlpha = 0.16 * (1 - i / b.hist.length);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(g.x, g.y, r * (1 - i / 30), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * this.scale * 0.25;
    ctx.strokeStyle = main;
    ctx.lineWidth = 0.7;

    switch (b.info.key) {
      case 'vortex': {
        // spinning fan blades
        ctx.rotate(b.phase * 2.3);
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.4)' : 'rgba(178, 107, 255, 0.22)';
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r, 0, Math.PI / 3.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = main;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'stalker': {
        // an eye that watches the ship
        const p = this.game.player;
        const dx = (p.rx + 0.5) - b.x, dy = (p.ry + 0.5) - b.y;
        const d = Math.hypot(dx, dy) || 1;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = r * (1 + 0.07 * Math.sin(b.phase * 3 + i * 2.2));
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                  : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.35)' : 'rgba(90, 255, 138, 0.14)';
        ctx.fill(); ctx.stroke();
        const ox = (dx / d) * r * 0.3, oy = (dy / d) * r * 0.3;
        ctx.fillStyle = main;
        ctx.beginPath(); ctx.arc(ox, oy, r * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#05060f';
        ctx.beginPath(); ctx.arc(ox * 1.4, oy * 1.4, r * 0.18, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'shard': {
        // jagged star; flares white before it lunges
        ctx.rotate(b.phase * 0.6);
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rr = i % 2 === 0 ? r * 1.05 : r * 0.5;
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                  : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.45)' : 'rgba(255, 157, 46, 0.18)';
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = main;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pulsar': {
        // breathing concentric rings
        for (const k of [1, 0.72, 0.45]) {
          ctx.globalAlpha = k;
          ctx.beginPath(); ctx.arc(0, 0, r * k, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.22 + 0.05 * Math.sin(time * 6)), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wraith': {
        // ghostly blob with hollow eyes
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rr = r * (1 + 0.12 * Math.sin(b.phase * 2.4 + i * 1.9));
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                  : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.35)' : 'rgba(125, 208, 255, 0.16)';
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = main;
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.1, r * 0.13, 0, Math.PI * 2); ctx.fill();
        break;
      }
      default: { // prism — the original morphing polygon
        ctx.rotate(b.phase * 0.5);
        ctx.beginPath();
        for (let i = 0; i <= b.sides; i++) {
          const a = (i / b.sides) * Math.PI * 2;
          const rr = r * (1 + 0.14 * Math.sin(b.phase * 2.1 + i * 1.7));
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                  : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.35)' : 'rgba(255, 90, 78, 0.16)';
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.3 + 0.06 * Math.sin(time * 5)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawMinion(m) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.phase * 3);
    ctx.shadowColor = COLORS.minion;
    ctx.shadowBlur = 10 * this.scale * 0.25;
    ctx.fillStyle = COLORS.minion;
    const s = m.r * 1.6;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-s / 5, -s / 5, s / 2.5, s / 2.5);
    ctx.restore();
  }

  drawPatroller(p, time) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(p.rx + 0.5, p.ry + 0.5);
    ctx.rotate(p.phase * 4);
    ctx.shadowColor = COLORS.patrol;
    ctx.shadowBlur = 10 * this.scale * 0.25;
    ctx.strokeStyle = COLORS.patrol;
    ctx.fillStyle = 'rgba(255, 157, 46, 0.3)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const px = Math.cos(a) * 1.7, py = Math.sin(a) * 1.7;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawProjectile(pr) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = COLORS.projectile;
    ctx.shadowBlur = 10 * this.scale * 0.25;
    ctx.strokeStyle = 'rgba(255, 123, 110, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pr.x - pr.vx * 0.12, pr.y - pr.vy * 0.12);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.projectile;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPowerTiles(time) {
    const { ctx, game } = this;
    for (const t of game.powerTiles) {
      if (t.taken) continue;
      const info = POWER_TYPES[t.type];
      const pulse = 0.75 + 0.25 * Math.sin(time * 4 + t.phase);
      ctx.save();
      ctx.translate(t.x + 0.5, t.y + 0.5);
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 10 * this.scale * 0.25;
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = info.color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 0.4;
      const s = 3.4;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = info.color;
      ctx.font = '600 3px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.symbol, 0, 0.1);
      ctx.restore();
    }
  }

  drawTutorialHints(time) {
    const { ctx, game } = this;
    const t = game.tutorial;
    if (!game.tutorialMode || !t || game.state !== 'play') return;
    const id = t.currentId();
    const p = game.player;
    const px = p.rx + 0.5, py = p.ry + 0.5;

    if (id === 'move' || id === 'cut') {
      // attention ring around the ship
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 255, 155, 0.9)';
      ctx.shadowColor = '#7dff9b';
      ctx.shadowBlur = 10 * this.scale * 0.25;
      ctx.lineWidth = 0.45;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 5);
      ctx.beginPath();
      ctx.arc(px, py, 4.6 + 0.7 * Math.sin(time * 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (id === 'cut' && !p.drawing) {
      // chevrons marching from the ship toward open water
      const cx = game.grid.w / 2, cy = game.grid.h / 2;
      const dx = cx - px, dy = cy - py;
      const d = Math.hypot(dx, dy) || 1;
      const vx = dx / d, vy = dy / d;
      const ang = Math.atan2(vy, vx);
      ctx.save();
      ctx.fillStyle = '#7dff9b';
      ctx.shadowColor = '#7dff9b';
      ctx.shadowBlur = 8 * this.scale * 0.25;
      for (let i = 0; i < 3; i++) {
        const dist = 7 + i * 4 + ((time * 9) % 4);
        const a = 1 - i * 0.25 - ((time * 9) % 4) / 16;
        ctx.globalAlpha = Math.max(0, a * 0.9);
        ctx.save();
        ctx.translate(px + vx * dist, py + vy * dist);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(1.4, 0);
        ctx.lineTo(-0.9, -1.5);
        ctx.lineTo(-0.2, 0);
        ctx.lineTo(-0.9, 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  drawParticles() {
    const { ctx, game } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.fx.particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  drawPopups() {
    const { ctx, game } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of game.fx.popups) {
      const k = p.t / p.life;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `800 ${4.2 * p.size}px "Avenir Next", system-ui, sans-serif`;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8 * this.scale * 0.25;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - k * 6);
    }
    ctx.restore();
  }
}
