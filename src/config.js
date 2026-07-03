// ============================================================
//  Game identity — rename the game here (and in index.html <title>).
// ============================================================
export const GAME_NAME = 'VOIDCUT';
export const GAME_TAGLINE = 'CARVE THE VOID';
export const VERSION = '0.1.0';
export const SAVE_KEY = 'voidcut_save_v1'; // localStorage key for non-YouTube fallback

// ---------- playfield ----------
export const GRID_W = 128;   // cells, portrait-ish 4:5 field
export const GRID_H = 160;
export const TARGET = 0.80;  // claimed fraction required to clear a sector
export const PERFECT = 0.95;

// ---------- movement (cells / second) ----------
export const TUNING = {
  landSpeed: 34,
  drawSpeed: 21,
  speedPowerMult: 1.45,
  respawnInvuln: 1.8,     // seconds of invulnerability after death
  fuseDelay: 0.45,        // stall time while drawing before the fuse ignites
  deathFreeze: 0.9,       // dramatic pause after dying
  powerDuration: 8,       // speed / slow effect length
  freezeDuration: 4.5,
};

// ---------- scoring ----------
export const SCORING = {
  perPercent: 150,               // base points per 1% claimed
  chunkBonus: [                  // one-cut size multipliers (checked top-down)
    { pct: 30, mult: 4.0, label: 'MASSIVE CUT' },
    { pct: 15, mult: 2.5, label: 'BIG CUT' },
    { pct: 6,  mult: 1.5, label: 'NICE CUT' },
  ],
  minionKill: 500,
  pointsPower: 2000,
  clearBase: 1000,
  overTargetPerPct: 150,         // per % above target on clear
  perfectBonus: 5000,
  extraLifeEvery: 50000,
};

export const START_LIVES = 3;
export const MAX_LIVES = 6;

// ---------- palette ----------
export const COLORS = {
  bg: '#05060f',
  seaTop: '#0a0e22', seaBottom: '#060814',
  land: '#0d2244', landEdge: '#37e0ff',
  trail: '#ff3df5',
  player: '#ffffff',
  boss: '#ff5a4e',
  minion: '#ffd23f',
  patrol: '#ff9d2e',
  projectile: '#ff7b6e',
  fuse: '#ffffff',
  text: '#cfe8ff',
  good: '#7dff9b',
};
