// Every tuning number and colour of Orbital Aegis in one place. The playfield is a fixed
// 1280x720 logical area with the planet at its centre; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, centerX: 640, centerY: 360 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLANET = {
  radius: 62,
  maxHull: 100,
  /** Hull repaired at the start of each new wave. */
  repairPerWave: 6,
};

export const SHIELD = {
  /** Distance of the shield ring from the planet's centre. */
  radius: 118,
  /** Half of the arc the shield covers, in radians: the full arc is about 84 degrees. */
  halfArc: 0.73,
  thickness: 10,
  /** Fastest the shield may swing, radians per second, under keyboard or autopilot control. */
  turnRate: 4.6,
  /** How quickly the shield eases toward the pointer's angle, per second. */
  followRate: 14,
};

export const METEOR = {
  minRadius: 9,
  maxRadius: 20,
  baseSpeed: 120,
  speedPerWave: 14,
  speedJitter: 55,
  /** Aim error, radians either side of a perfect line at the planet. */
  aimJitter: 0.16,
  /** Hull damage of a meteor of radius 1, scaled by its radius. */
  damagePerRadius: 1.15,
  blockPoints: 10,
};

export const ORB = {
  radius: 11,
  speed: 95,
  speedPerWave: 6,
  catchPoints: 25,
  /** Hull a caught orb restores when the combo is high. */
  healAtCombo: 8,
  healAmount: 4,
};

/** Combo: every block or catch adds one; a leak or a missed orb resets it. Multiplier steps. */
export const COMBO = {
  perMultiplierStep: 4,
  maxMultiplier: 8,
};

/** Waves: how many, how they grow, and the quiet beat between them. */
export const WAVES = {
  count: 10,
  firstMeteors: 7,
  meteorsPerWave: 3,
  firstOrbs: 2,
  spawnGap: 0.85,
  spawnGapPerWave: 0.055,
  minSpawnGap: 0.34,
  betweenSeconds: 2.6,
};

/** How many meteors, orbs and particles can exist at once; pools are allocated once, at boot. */
export const POOL = { meteors: 48, orbs: 16, particles: 320 };

export const PALETTE = {
  space: '#04060f',
  star: '#aebadd',
  planetCore: '#2ee6a8',
  planetDeep: '#0d5c46',
  planetGlow: 'rgba(46, 230, 168, 0.16)',
  shield: '#39c6ff',
  shieldHot: '#b8ecff',
  meteor: '#ff7847',
  meteorCore: '#ffd23e',
  orb: '#ffe95e',
  orbGlow: 'rgba(255, 233, 94, 0.22)',
  danger: '#ff4d6d',
  text: '#eef4ff',
  muted: '#8fa3c8',
  panel: 'rgba(10, 16, 34, 0.78)',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'orbital-aegis.best';
