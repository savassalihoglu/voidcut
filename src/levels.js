// Difficulty curve — everything the game varies per sector.
// Speeds are in grid cells per second.
import { BOSS_TYPES } from './entities.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function levelParams(n) {
  const bossType = (n - 1) % BOSS_TYPES.length;
  return {
    sector: n,
    target: 0.80,
    bossType,
    bossName: BOSS_TYPES[bossType].name,
    bossColor: BOSS_TYPES[bossType].color,

    minions: clamp(1 + Math.floor((n - 1) * 0.8), 1, 7),
    minionSpeed: clamp(9 + n * 0.9, 9, 22),

    bossR: clamp(5.5 + n * 0.25, 5.5, 9),
    bossSpeed: clamp(6.5 + n * 1.05, 6.5, 19),
    bossSides: 5 + (n % 4),

    patrollers: n < 3 ? 0 : n < 6 ? 1 : 2,
    patrolSpeed: clamp(9 + n * 0.7, 9, 17),

    shoots: n >= 4,
    fireInterval: clamp(4.6 - (n - 4) * 0.3, 2.2, 4.6),
    projectileSpeed: clamp(18 + n * 0.8, 18, 30),

    fuseSpeed: clamp(13 + n * 1.2, 13, 30),

    powerups: 2 + (n % 2),

    hue: (185 + n * 47) % 360, // accent tint so sectors feel distinct
  };
}
