import { GAME_NAME, GAME_TAGLINE, TARGET } from './config.js';

// DOM HUD + overlay screens. Gameplay input goes to the canvas; screens only
// take pointer events while visible.

export class UI {
  constructor(root) {
    this.root = root;
    this.cb = {}; // onStart(sector), onRetry, onMenu, onResume, onClearContinue

    const nameHtml = this.logoHtml(GAME_NAME);
    root.innerHTML = `
      <div id="hud">
        <div class="left">
          <div class="score">0</div>
          <div class="best"></div>
        </div>
        <div class="sector">SECTOR 1</div>
        <div class="right">
          <div class="lives">◆◆◆</div>
          <div class="pctwrap">
            <div class="pct">0%</div>
            <div class="bar"><div class="fill"></div><div class="tick" style="left:${TARGET * 100}%"></div></div>
          </div>
        </div>
        <button id="btn-pause" aria-label="Pause"><span></span><span></span></button>
      </div>

      <div id="tutbar">
        <div class="tuttext"></div>
        <div class="tutdots"></div>
      </div>
      <button class="btn ghost" id="btn-tutskip">SKIP TUTORIAL</button>

      <div id="title" class="screen">
        <div class="logo">${nameHtml}</div>
        <div class="tagline">${GAME_TAGLINE}</div>
        <div class="stat" id="title-best" style="display:none">BEST <b>0</b></div>
        <button class="btn pulse" id="btn-start">START</button>
        <button class="btn ghost" id="btn-skip" style="display:none"></button>
        <button class="btn ghost" id="btn-howto">HOW TO PLAY</button>
        <div class="howto">
          <b>DRAW LOOPS</b> to claim territory — reach <b>${Math.round(TARGET * 100)}%</b> to clear the sector.<br>
          Don't let anything touch your line.<br>
          <b>SWIPE</b> &amp; hold to steer · or arrow keys / WASD
        </div>
      </div>

      <div id="intro" class="screen transparent">
        <div class="bigtext" id="intro-text">SECTOR 1</div>
        <div class="stat" id="intro-sub">CLAIM ${Math.round(TARGET * 100)}%</div>
        <div class="bossname" id="intro-boss"></div>
      </div>

      <div id="banner"></div>

      <div id="clear" class="screen">
        <div class="bigtext good">SECTOR CLEAR</div>
        <div class="tally" id="clear-tally"></div>
        <div class="substat fadein">TAP TO CONTINUE</div>
      </div>

      <div id="gameover" class="screen">
        <div class="bigtext bad">SIGNAL LOST</div>
        <div class="stat">SCORE <b id="go-score">0</b></div>
        <div class="stat" id="go-best-row">BEST <b id="go-best">0</b></div>
        <div class="substat" id="go-newbest" style="display:none; color:#ffd23f">★ NEW BEST ★</div>
        <div class="substat" id="go-posted" style="display:none">BEST SCORE POSTED TO YOUTUBE</div>
        <button class="btn pulse" id="btn-retry">RETRY</button>
        <button class="btn ghost" id="btn-menu">MENU</button>
      </div>

      <div id="pause" class="screen">
        <div class="bigtext">PAUSED</div>
        <button class="btn pulse" id="btn-resume">CONTINUE</button>
        <button class="btn ghost" id="btn-prestart">RESTART RUN</button>
        <button class="btn ghost" id="btn-pmenu">MENU</button>
      </div>
    `;

    this.el = {
      hud: root.querySelector('#hud'),
      score: root.querySelector('#hud .score'),
      best: root.querySelector('#hud .best'),
      sector: root.querySelector('#hud .sector'),
      lives: root.querySelector('#hud .lives'),
      pct: root.querySelector('#hud .pct'),
      fill: root.querySelector('#hud .fill'),
      title: root.querySelector('#title'),
      titleBest: root.querySelector('#title-best'),
      btnSkip: root.querySelector('#btn-skip'),
      intro: root.querySelector('#intro'),
      introText: root.querySelector('#intro-text'),
      introSub: root.querySelector('#intro-sub'),
      introBoss: root.querySelector('#intro-boss'),
      banner: root.querySelector('#banner'),
      clear: root.querySelector('#clear'),
      clearTally: root.querySelector('#clear-tally'),
      gameover: root.querySelector('#gameover'),
      goScore: root.querySelector('#go-score'),
      goBest: root.querySelector('#go-best'),
      goNewBest: root.querySelector('#go-newbest'),
      goPosted: root.querySelector('#go-posted'),
      pause: root.querySelector('#pause'),
      tutbar: root.querySelector('#tutbar'),
      tutText: root.querySelector('#tutbar .tuttext'),
      tutDots: root.querySelector('#tutbar .tutdots'),
      tutSkip: root.querySelector('#btn-tutskip'),
    };

    root.querySelector('#btn-start').addEventListener('click', () => this.cb.onStart?.(1));
    this.el.btnSkip.addEventListener('click', () => this.cb.onStart?.(this.skipSector));
    root.querySelector('#btn-howto').addEventListener('click', () => this.cb.onTutorial?.());
    root.querySelector('#btn-retry').addEventListener('click', () => this.cb.onRetry?.());
    root.querySelector('#btn-menu').addEventListener('click', () => this.cb.onMenu?.());
    root.querySelector('#btn-resume').addEventListener('click', () => this.cb.onResume?.());
    root.querySelector('#btn-pause').addEventListener('click', () => this.cb.onPauseBtn?.());
    root.querySelector('#btn-prestart').addEventListener('click', () => this.cb.onRestart?.());
    root.querySelector('#btn-pmenu').addEventListener('click', () => this.cb.onQuit?.());
    this.el.tutSkip.addEventListener('click', () => this.cb.onSkipTutorial?.());
    this.el.clear.addEventListener('click', () => this.cb.onClearContinue?.());
  }

  logoHtml(name) {
    // splits the name visually: first half cyan, second half magenta
    const mid = Math.ceil(name.length / 2);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `${esc(name.slice(0, mid))}<em>${esc(name.slice(mid))}</em>`;
  }

  screens() { return [this.el.title, this.el.intro, this.el.clear, this.el.gameover, this.el.pause]; }
  hideAll() { for (const s of this.screens()) s.classList.remove('on'); }

  setHudVisible(on) { this.el.hud.classList.toggle('on', on); }

  hud({ score, sector, pct, lives, best = 0, bestBeaten = false }) {
    this.el.score.textContent = score.toLocaleString('en-US');
    if (bestBeaten) {
      this.el.best.textContent = `★ ${score.toLocaleString('en-US')}`;
      this.el.best.classList.add('gold');
    } else if (best > 0) {
      this.el.best.textContent = `BEST ${best.toLocaleString('en-US')}`;
      this.el.best.classList.remove('gold');
    } else {
      this.el.best.textContent = '';
    }
    this.el.sector.textContent = `SECTOR ${sector}`;
    this.el.lives.textContent = '◆'.repeat(Math.max(0, lives));
    this.el.pct.textContent = `${Math.floor(pct * 100)}%`;
    this.el.fill.style.width = `${Math.min(100, pct * 100)}%`;
  }

  banner(text, color = '#ffd23f') {
    this.el.banner.textContent = text;
    this.el.banner.style.color = color;
    this.el.banner.classList.remove('pop');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('pop');
  }

  showTitle(best, maxSector) {
    this.hideAll();
    this.setHudVisible(false);
    if (best > 0) {
      this.el.titleBest.style.display = '';
      this.el.titleBest.querySelector('b').textContent = String(best);
    }
    if (maxSector > 1) {
      this.skipSector = maxSector;
      this.el.btnSkip.style.display = '';
      this.el.btnSkip.textContent = `WARP TO SECTOR ${maxSector}`;
    } else {
      this.el.btnSkip.style.display = 'none';
    }
    this.el.title.classList.add('on');
  }

  showIntro(sector, bossName = '', bossColor = '#ff5a4e') {
    this.hideAll();
    this.setHudVisible(true);
    this.el.introText.textContent = `SECTOR ${sector}`;
    this.el.introBoss.textContent = bossName ? `⟡ THE ${bossName} ⟡` : '';
    this.el.introBoss.style.color = bossColor;
    this.el.introBoss.style.textShadow = `0 0 12px ${bossColor}`;
    // retrigger the zoom animation
    this.el.introText.style.animation = 'none';
    void this.el.introText.offsetWidth;
    this.el.introText.style.animation = '';
    this.el.intro.classList.add('on');
  }
  hideIntro() { this.el.intro.classList.remove('on'); }

  showClear(rows) {
    this.hideAll();
    this.el.clearTally.innerHTML = rows
      .map(([k, v]) => `<div class="row fadein"><span>${k}</span><span>${v}</span></div>`)
      .join('');
    this.el.clear.classList.add('on');
  }

  showGameover(score, best, isNewBest, posted = false) {
    this.hideAll();
    this.el.goScore.textContent = score.toLocaleString('en-US');
    this.el.goBest.textContent = best.toLocaleString('en-US');
    this.el.goNewBest.style.display = isNewBest ? '' : 'none';
    this.el.goPosted.style.display = posted ? '' : 'none';
    this.el.gameover.classList.add('on');
  }

  showPause() {
    // pause overlays whatever screen is up; don't clear others
    this.el.pause.classList.add('on');
  }
  hidePause() { this.el.pause.classList.remove('on'); }

  showTutorial(text, doneCount, total) {
    this.el.tutText.textContent = text;
    this.el.tutDots.textContent = '●'.repeat(doneCount) + '○'.repeat(Math.max(0, total - doneCount));
    // retrigger the attention pulse on step change
    this.el.tutText.style.animation = 'none';
    void this.el.tutText.offsetWidth;
    this.el.tutText.style.animation = '';
    this.el.tutbar.classList.add('on');
    this.el.tutSkip.classList.add('on');
  }
  hideTutorial() {
    this.el.tutbar.classList.remove('on');
    this.el.tutSkip.classList.remove('on');
  }
}
