import { Grid } from './grid.js';
import { Player, Boss, Minion, Patroller, Projectile, PowerTile } from './entities.js';
import { levelParams } from './levels.js';
import { Fx } from './fx.js';
import { Tutorial } from './tutorial.js';
import { YT } from './yt.js';
import {
  GRID_W, GRID_H, PERFECT, TUNING, SCORING,
  START_LIVES, MAX_LIVES, COLORS,
} from './config.js';

export class Game {
  constructor(ui, audio, input) {
    this.ui = ui;
    this.audio = audio;
    this.input = input;
    this.grid = new Grid(GRID_W, GRID_H);
    this.fx = new Fx();

    this.state = 'title';
    this.paused = false;
    this.stateTimer = 0;
    this.save = { v: 1, best: 0, maxSector: 1 };

    this.score = 0;
    this.lives = START_LIVES;
    this.sector = 1;
    this.params = levelParams(1);
    this.nextLifeAt = SCORING.extraLifeEvery;
    this.bestBeaten = false;
    this.nextMs = 2500;

    this.player = new Player(Math.floor(GRID_W / 2), GRID_H - 1);
    this.boss = null;
    this.minions = [];
    this.patrollers = [];
    this.projectiles = [];
    this.powerTiles = [];
    this.fuse = { active: false, pos: 0 };
    this.effects = { speed: 0, freeze: 0, slow: 0 };
    this.fireTimer = 0;
    this.tutorialMode = false;
    this.tutorial = null;

    this.player.onStartTrail = () => {
      this.audio.setDrawing(true);
    };
    this.player.onComplete = () => this.completeCut();

    ui.cb.onStart = (sector) => {
      this.audio.unlock(); this.audio.tap();
      // first ever play → learn before fighting
      if (sector === 1 && !this.save.tutorialDone) this.startTutorial();
      else this.startRun(sector);
    };
    ui.cb.onTutorial = () => { this.audio.unlock(); this.audio.tap(); this.startTutorial(); };
    ui.cb.onSkipTutorial = () => { this.audio.tap(); if (this.tutorialMode) this.finishTutorial(true); };
    ui.cb.onRetry = () => { this.audio.tap(); this.startRun(this.retrySector); };
    ui.cb.onMenu = () => { this.audio.tap(); this.toTitle(); };
    ui.cb.onResume = () => this.requestResume?.();
    ui.cb.onClearContinue = () => { if (this.state === 'clear') this.nextSector(); };
    ui.cb.onPauseBtn = () => this.userPause();
    ui.cb.onRestart = () => {
      this.audio.tap();
      this.exitPause();
      if (this.tutorialMode) this.startTutorial();
      else this.startRun(this.retrySector);
    };
    ui.cb.onQuit = () => { this.audio.tap(); this.exitPause(); this.toTitle(); };
  }

  // ---------------------------------------------------------- flow
  toTitle() {
    this.state = 'title';
    this.tutorialMode = false;
    this.tutorial = null;
    this.buildSector(1);           // living backdrop behind the logo
    this.audio.stopLoops();
    this.audio.setMusic('menu');
    this.ui.hideTutorial();
    this.ui.showTitle(this.save.best, this.save.maxSector);
  }

  // ---------------------------------------------------------- tutorial
  startTutorial() {
    this.tutorialMode = true;
    this.tutorial = new Tutorial();
    this.score = 0;
    this.lives = START_LIVES;
    this.sector = 1;
    this.retrySector = 1;
    this.nextLifeAt = SCORING.extraLifeEvery;

    this.buildSector(1);
    // defanged practice field: one drowsy boss, gentle fuse, nothing else
    this.minions = [];
    this.patrollers = [];
    this.projectiles = [];
    this.params.shoots = false;
    this.params.fuseSpeed = 8;
    this.boss.speed = 3;
    this.boss.r = 5;

    this.state = 'play';
    this.input.clear();
    this.audio.setMusic('play');
    this.ui.hideAll();
    this.ui.setHudVisible(true);
    this.ui.showTutorial(this.tutorial.text(), 0, this.tutorial.count());
    this.pushHud();
  }

  finishTutorial(skipped = false) {
    this.tutorialMode = false;
    this.tutorial = null;
    this.ui.hideTutorial();
    this.audio.stopLoops();
    if (!skipped) this.audio.clear();
    if (!this.save.tutorialDone) {
      this.save.tutorialDone = true;
      this.persist();
    }
    this.startRun(1);
  }

  startRun(sector) {
    this.score = 0;
    this.lives = START_LIVES;
    this.sector = sector;
    this.retrySector = sector;
    this.nextLifeAt = SCORING.extraLifeEvery;
    this.bestBeaten = false;
    this.nextMs = this.nextMilestoneAfter(0);
    this.startSector(sector);
  }

  // score milestones: a fixed early ladder, then every 50k
  nextMilestoneAfter(v) {
    for (const m of [2500, 5000, 10000, 20000, 35000, 50000, 75000, 100000]) {
      if (v < m) return m;
    }
    return (Math.floor(v / 50000) + 1) * 50000;
  }

  nextSector() {
    this.sector++;
    this.startSector(this.sector);
  }

  startSector(n) {
    this.buildSector(n);
    this.state = 'intro';
    this.stateTimer = 1.7;
    this.input.clear();
    this.audio.setMusic('play');
    this.ui.showIntro(n, this.params.bossName, this.params.bossColor);
    this.pushHud();
  }

  buildSector(n) {
    const p = this.params = levelParams(n);
    const { grid } = this;
    grid.reset();
    this.fx.reset();

    this.player.place(Math.floor(GRID_W / 2), GRID_H - 1);
    this.player.invuln = 0;

    this.boss = new Boss(GRID_W / 2, GRID_H * 0.42, p.bossR, p.bossSpeed, p.bossSides, p.bossType);

    this.minions = [];
    for (let i = 0; i < p.minions; i++) {
      const c = this.spawnCellAwayFromPlayer(30);
      if (c) this.minions.push(new Minion(c.x, c.y, p.minionSpeed));
    }

    this.patrollers = [];
    for (let i = 0; i < p.patrollers; i++) {
      const x = Math.floor(GRID_W / 2) + (i === 0 ? -8 : 8);
      this.patrollers.push(new Patroller(x, 0, i === 0 ? 0 : 2, p.patrolSpeed));
    }

    this.projectiles = [];
    this.fireTimer = p.shoots ? p.fireInterval : 0;

    this.powerTiles = [];
    const types = this.pickPowerTypes(n, p.powerups);
    for (const type of types) {
      const c = grid.randomSeaCell(14);
      if (c && Math.hypot(c.x - this.boss.x, c.y - this.boss.y) > p.bossR + 5) {
        this.powerTiles.push(new PowerTile(c.x, c.y, type));
      }
    }

    this.fuse = { active: false, pos: 0 };
    this.effects = { speed: 0, freeze: 0, slow: 0 };
    this.audio.stopLoops();
  }

  pickPowerTypes(n, count) {
    const pool = ['SPEED', 'FREEZE', 'SLOW', 'POINTS', 'SPEED', 'POINTS'];
    const out = [];
    for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
    if (n >= 5 && Math.random() < 0.18) out[0] = 'LIFE';
    return out;
  }

  spawnCellAwayFromPlayer(minDist) {
    for (let t = 0; t < 60; t++) {
      const c = this.grid.randomSeaCell(10);
      if (c && Math.hypot(c.x - this.player.cx, c.y - this.player.cy) >= minDist) return c;
    }
    return this.grid.randomSeaCell(10);
  }

  // ---------------------------------------------------------- update
  update(dt) {
    this.fx.update(dt);
    const tapped = this.input.consumeTap();

    switch (this.state) {
      case 'title':
        this.updateEnemies(dt, 1);
        break;

      case 'intro':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0 || tapped) {
          this.ui.hideIntro();
          this.state = 'play';
          this.input.clear();
        }
        break;

      case 'play':
        this.updatePlay(dt);
        break;

      case 'dying':
        this.stateTimer -= dt;
        this.updateEnemies(dt, 0.25); // slow-mo drama
        if (this.stateTimer <= 0) this.afterDeath();
        break;

      case 'clear':
        this.stateTimer -= dt;
        this.updateEnemies(dt, 0.4);
        if (this.stateTimer <= 0) this.nextSector();
        break;

      case 'gameover':
        this.updateEnemies(dt, 0.4);
        break;
    }
  }

  enemyMult() {
    if (this.effects.freeze > 0) return 0;
    if (this.effects.slow > 0) return 0.45;
    return 1;
  }

  updateEnemies(dt, baseMult) {
    const mult = baseMult * (this.state === 'play' ? this.enemyMult() : 1);
    if (this.boss) this.boss.update(dt, this.grid, mult, this.player.rx + 0.5, this.player.ry + 0.5);
    for (const m of this.minions) m.update(dt, this.grid, mult);
    for (const p of this.patrollers) p.update(dt, this.grid, mult);
    for (const pr of this.projectiles) pr.update(dt, this.grid);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updatePlay(dt) {
    const { player, grid, effects } = this;

    effects.speed = Math.max(0, effects.speed - dt);
    effects.freeze = Math.max(0, effects.freeze - dt);
    effects.slow = Math.max(0, effects.slow - dt);

    const speedMult = effects.speed > 0 ? TUNING.speedPowerMult : 1;
    const speed = (player.drawing ? TUNING.drawSpeed : TUNING.landSpeed) * speedMult;
    player.update(dt, this.input.dir, grid, speed);

    // ---- fuse: stall while drawing and your own line starts burning down
    if (player.drawing) {
      if (!this.fuse.active && player.stillTime > TUNING.fuseDelay) {
        this.fuse.active = true;
        this.fuse.pos = 0;
        this.audio.setFuse(true);
      }
      if (this.fuse.active && player.stillTime > 0.05) {
        this.fuse.pos += this.params.fuseSpeed * dt;
        if (this.fuse.pos >= grid.trail.length - 0.5) {
          this.kill('fuse');
          return;
        }
      }
    } else if (this.fuse.active) {
      this.fuse = { active: false, pos: 0 };
      this.audio.setFuse(false);
    }

    this.updateEnemies(dt, 1);

    // ---- boss firing
    if (this.params.shoots && this.effects.freeze <= 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0.6 && this.boss.flash <= 0) this.boss.flash = this.fireTimer;
      if (this.fireTimer <= 0) {
        const bkey = this.boss.info.key;
        if (bkey === 'pulsar') {
          // radial 3-way spread
          const base = Math.atan2(player.ry - this.boss.y, player.rx - this.boss.x);
          for (const off of [-0.35, 0, 0.35]) {
            this.projectiles.push(new Projectile(
              this.boss.x, this.boss.y,
              this.boss.x + Math.cos(base + off) * 10,
              this.boss.y + Math.sin(base + off) * 10,
              this.params.projectileSpeed,
            ));
          }
        } else {
          this.projectiles.push(new Projectile(
            this.boss.x, this.boss.y,
            player.rx, player.ry,
            this.params.projectileSpeed,
          ));
        }
        this.audio.shoot();
        // the STALKER shoots noticeably more often
        this.fireTimer = this.params.fireInterval * (bkey === 'stalker' ? 0.75 : 1);
      }
    }

    this.checkCollisions();
    this.pushHud();

    // ---- tutorial step progression
    if (this.tutorialMode && this.tutorial && this.state === 'play') {
      const completed = this.tutorial.update(this, dt);
      if (completed) {
        if (this.tutorial.finished) return this.finishTutorial();
        if (['move', 'cut', 'claim'].includes(completed)) {
          this.audio.power();
          this.fx.popup(player.rx, Math.max(8, player.ry - 6), 'NICE!', '#7dff9b', 1.2);
        } else {
          this.audio.tap();
        }
        // the "danger" lesson wakes the boss up a little
        if (this.tutorial.currentId() === 'danger' && this.boss) this.boss.speed = 7;
        this.ui.showTutorial(this.tutorial.text(), this.tutorial.idx, this.tutorial.count());
      }
    }
  }

  checkCollisions() {
    const { player, grid, boss } = this;
    const shielded = player.invuln > 0;

    // trail is always fatal to touch — it's your exposed line
    if (player.drawing) {
      if (boss.touchesTrail(grid)) return this.kill('boss-trail');
      for (const m of this.minions) {
        if (m.onTrail(grid)) return this.kill('minion-trail');
      }
    }

    if (!shielded) {
      if (player.drawing) {
        const bd = Math.hypot(boss.x - (player.rx + 0.5), boss.y - (player.ry + 0.5));
        if (bd < boss.rNow + 1.2) return this.kill('boss');
        for (const m of this.minions) {
          if (Math.hypot(m.x - (player.rx + 0.5), m.y - (player.ry + 0.5)) < m.r + 0.9) {
            return this.kill('minion');
          }
        }
      }
      for (const p of this.patrollers) {
        if (Math.hypot(p.rx - player.rx, p.ry - player.ry) < 1.0) return this.kill('patrol');
      }
      for (const pr of this.projectiles) {
        if (Math.hypot(pr.x - (player.rx + 0.5), pr.y - (player.ry + 0.5)) < 1.3) {
          return this.kill('projectile');
        }
      }
    }

    // projectiles cut the line no matter what
    if (player.drawing) {
      for (const pr of this.projectiles) {
        if (grid.isTrail(Math.round(pr.x), Math.round(pr.y))) return this.kill('projectile-trail');
      }
    }
  }

  // ---------------------------------------------------------- claiming
  completeCut() {
    const { grid, fx, audio } = this;
    this.audio.setDrawing(false);
    this.fuse = { active: false, pos: 0 };
    this.audio.setFuse(false);

    const res = grid.completeTrail(this.boss.x, this.boss.y);
    const pctGained = (res.claimed / grid.initialSea) * 100;

    let mult = 1, label = null;
    for (const b of SCORING.chunkBonus) {
      if (pctGained >= b.pct) { mult = b.mult; label = b.label; break; }
    }
    const points = Math.max(10, Math.round(pctGained * SCORING.perPercent * mult));
    this.addScore(points);

    const px = this.player.rx, py = this.player.ry;
    fx.popup(px, Math.max(6, py - 5), `+${points}`, '#ffd23f', 1);
    if (label) fx.popup(px, Math.max(12, py - 11), `${label} ×${mult}`, '#7dff9b', 1.3);
    fx.claimFlash(res.cellList);
    fx.shake(Math.min(2, 0.3 + pctGained * 0.06));
    audio.claim(pctGained);

    // minions trapped inside the fill are destroyed
    let killDelay = 0;
    this.minions = this.minions.filter((m) => {
      if (grid.isLand(Math.round(m.x), Math.round(m.y))) {
        this.addScore(SCORING.minionKill);
        fx.burst(m.x, m.y, COLORS.minion, 16, 16, 0.7);
        fx.popup(m.x, m.y, `+${SCORING.minionKill}`, COLORS.minion, 0.9);
        setTimeout(() => audio.kill(), 60 + killDelay * 90);
        killDelay++;
        return false;
      }
      return true;
    });

    // power tiles swallowed by the claim
    for (const t of this.powerTiles) {
      if (!t.taken && grid.isLand(t.x, t.y)) {
        t.taken = true;
        this.applyPower(t);
      }
    }

    for (const p of this.patrollers) p.reseat(grid);

    this.pushHud();

    if (grid.claimedPercent() >= this.params.target) {
      if (this.tutorialMode) this.finishTutorial();
      else this.sectorClear();
    }
  }

  applyPower(t) {
    const { fx, audio } = this;
    audio.power();
    fx.burst(t.x, t.y, '#ffffff', 18, 14, 0.7);
    switch (t.type) {
      case 'SPEED':
        this.effects.speed = TUNING.powerDuration;
        fx.popup(t.x, t.y, 'SPEED UP', '#37e0ff', 1.1);
        break;
      case 'FREEZE':
        this.effects.freeze = TUNING.freezeDuration;
        fx.popup(t.x, t.y, 'FREEZE', '#bfe9ff', 1.1);
        break;
      case 'SLOW':
        this.effects.slow = TUNING.powerDuration;
        fx.popup(t.x, t.y, 'SLOW-MO', '#ffb02e', 1.1);
        break;
      case 'POINTS':
        this.addScore(SCORING.pointsPower);
        fx.popup(t.x, t.y, `+${SCORING.pointsPower}`, '#ffd23f', 1.2);
        break;
      case 'LIFE':
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        fx.popup(t.x, t.y, '1UP', '#ff6bd6', 1.4);
        break;
    }
  }

  addScore(n) {
    this.score += n;
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += SCORING.extraLifeEvery;
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      this.fx.popup(this.player.rx, Math.max(8, this.player.ry - 8), '1UP', '#ff6bd6', 1.4);
      this.audio.power();
    }
    if (this.tutorialMode) return; // practice points don't celebrate

    while (this.score >= this.nextMs) {
      this.fx.popup(this.player.rx, Math.max(12, this.player.ry - 12),
        `${this.nextMs.toLocaleString('en-US')}!`, '#ffd23f', 1.3);
      this.audio.milestone();
      this.nextMs = this.nextMilestoneAfter(this.nextMs);
    }
    if (!this.bestBeaten && this.save.best > 0 && this.score > this.save.best) {
      this.bestBeaten = true;
      this.ui.banner('★ NEW BEST ★');
      this.audio.perfect();
      this.fx.burst(this.player.rx + 0.5, this.player.ry + 0.5, '#ffd23f', 24, 18, 0.9);
      this.fx.shake(1);
    }
  }

  // ---------------------------------------------------------- death
  kill(cause) {
    const { player, fx, audio, grid } = this;
    audio.stopLoops();
    audio.death();
    fx.burst(player.rx + 0.5, player.ry + 0.5, '#ffffff', 26, 22, 0.9, 1);
    fx.burst(player.rx + 0.5, player.ry + 0.5, COLORS.trail, 18, 16, 0.8);
    fx.shake(2);
    if (grid.trail.length) fx.trailFizzle(grid.trail, COLORS.trail);
    grid.cancelTrail();
    player.drawing = false;
    this.fuse = { active: false, pos: 0 };

    if (this.tutorialMode) {
      // learning is free
      fx.popup(player.rx, Math.max(8, player.ry - 6), 'CAREFUL!', '#ff5a4e', 1.2);
    } else {
      this.lives--;
    }
    this.state = 'dying';
    this.stateTimer = TUNING.deathFreeze;
    this.pushHud();
  }

  afterDeath() {
    if (this.lives < 0) return this.gameOver();
    const { player } = this;
    player.place(player.anchor.x, player.anchor.y);
    player.invuln = TUNING.respawnInvuln;
    this.input.clear();
    this.state = 'play';
  }

  // ---------------------------------------------------------- endings
  sectorClear() {
    const { audio, grid } = this;
    audio.stopLoops();
    const pct = grid.claimedPercent() * 100;
    const over = Math.max(0, Math.round(pct - this.params.target * 100));
    const overBonus = over * SCORING.overTargetPerPct;
    const isPerfect = grid.claimedPercent() >= PERFECT;

    let bonus = SCORING.clearBase + overBonus + (isPerfect ? SCORING.perfectBonus : 0);
    this.addScore(bonus);

    const rows = [
      ['CLAIMED', `${pct.toFixed(1)}%`],
      ['CLEAR BONUS', `+${SCORING.clearBase}`],
      [`OVER TARGET +${over}%`, `+${overBonus}`],
    ];
    if (isPerfect) rows.push(['★ PERFECT', `+${SCORING.perfectBonus}`]);

    audio.clear();
    if (isPerfect) audio.perfect();

    this.save.maxSector = Math.max(this.save.maxSector, this.sector + 1);
    this.persist();

    this.state = 'clear';
    this.stateTimer = 4.0;
    this.ui.showClear(rows);
    this.pushHud();
  }

  gameOver() {
    const { audio } = this;
    audio.stopLoops();
    audio.gameOver();
    audio.setMusic('menu');
    this.state = 'gameover';

    const isNewBest = this.score > this.save.best;
    if (isNewBest) this.save.best = this.score;
    this.persist();
    YT.sendScore(this.save.best);

    this.ui.showGameover(this.score, this.save.best, isNewBest, YT.inYouTube);
  }

  persist() { YT.saveData(this.save); }

  // ---------------------------------------------------------- helpers
  fusePoint() {
    if (!this.fuse.active || !this.player.drawing) return null;
    const trail = this.grid.trail;
    if (!trail.length) return null;
    const i = Math.min(Math.floor(this.fuse.pos), trail.length - 1);
    const j = Math.min(i + 1, trail.length - 1);
    const t = Math.min(1, this.fuse.pos - i);
    return {
      x: trail[i].x + (trail[j].x - trail[i].x) * t,
      y: trail[i].y + (trail[j].y - trail[i].y) * t,
    };
  }

  pushHud() {
    this.ui.hud({
      score: this.score,
      sector: this.sector,
      pct: this.grid.claimedPercent(),
      lives: this.lives,
      best: this.save.best,
      bestBeaten: this.bestBeaten && !this.tutorialMode,
    });
  }

  // ---------------------------------------------------------- pause
  // The HUD pause button / Esc key. Only meaningful while a run is live.
  userPause() {
    if (this.paused) return;
    if (['play', 'intro', 'dying', 'clear'].includes(this.state)) {
      this.audio.tap();
      this.enterPause(true);
    }
  }

  enterPause(force = false) {
    if (this.paused) return;
    this.paused = true;
    // menu screens don't need a tap-to-continue gate — only live gameplay does
    this.pauseSilent = !force && !['play', 'intro', 'dying'].includes(this.state);
    this.audio.stopLoops();
    this.audio.suspend();
    this.persist();
    if (!this.pauseSilent) this.ui.showPause();
  }

  exitPause() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.resume();
    this.input.clear();
    this.ui.hidePause();
  }
}
