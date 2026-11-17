// The simulation of Orbital Aegis: a planet, the shield ring the player swings around it,
// and everything that falls toward them. Meteors dive at the planet from deep space; energy
// orbs drift in on the same lanes. Crossing the shield's arc destroys a meteor and feeds
// the combo; reaching the planet costs hull. Survive all ten waves to win.
//
// The world is pure state and fixed-step updates: it never reads the clock, the DOM or real
// randomness, so a seeded run (a screenshot scene, a replay) is exactly reproducible.

import { COMBO, FIELD, METEOR, ORB, PLANET, POOL, SHIELD, WAVES } from './config.js';
import { range } from './random.js';

export const EVENT_BLOCK = 1;
export const EVENT_CATCH = 2;
export const EVENT_IMPACT = 4;
export const EVENT_MISS = 8;
export const EVENT_WAVE = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;

export const PHASE_STORM = 'storm';
export const PHASE_BETWEEN = 'between';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

/** How far out, in logical pixels from the planet, new arrivals appear. */
const SPAWN_DISTANCE = 585;

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(angle) {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped >= Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/** The shortest signed turn from `from` to `to`, in [-PI, PI). */
export function angleBetween(from, to) {
  return wrapAngle(to - from);
}

function makeBody() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 0, spin: 0, angle: 0 };
}

function makeParticle() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' };
}

/** Create a world whose arrivals are drawn from `random` (see random.js). */
export function createWorld(random) {
  const state = {
    time: 0,
    shieldAngle: -Math.PI / 2,
    hull: PLANET.maxHull,
    score: 0,
    combo: 0,
    multiplier: 1,
    wave: 0,
    phase: PHASE_BETWEEN,
    phaseTimer: 0,
    meteorsLeft: 0,
    orbsLeft: 0,
    spawnTimer: 0,
    shake: 0,
    flash: 0,
    banner: '',
    bannerTimer: 0,
    blocked: 0,
    caught: 0,
    leaked: 0,
    meteors: [],
    orbs: [],
    particles: [],
    popups: [],
  };
  for (let i = 0; i < POOL.meteors; i += 1) state.meteors.push(makeBody());
  for (let i = 0; i < POOL.orbs; i += 1) state.orbs.push(makeBody());
  for (let i = 0; i < POOL.particles; i += 1) state.particles.push(makeParticle());
  for (let i = 0; i < 10; i += 1) state.popups.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff' });

  function burst(x, y, color, count, speed, size) {
    let spawned = 0;
    for (let i = 0; i < state.particles.length && spawned < count; i += 1) {
      const p = state.particles[i];
      if (p.active) continue;
      const dir = random() * Math.PI * 2;
      const velocity = speed * (0.25 + random() * 0.95);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(dir) * velocity;
      p.vy = Math.sin(dir) * velocity;
      p.maxLife = 0.35 + random() * 0.5;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      spawned += 1;
    }
  }

  function popup(x, y, text, color) {
    for (let i = 0; i < state.popups.length; i += 1) {
      const pop = state.popups[i];
      if (pop.active) continue;
      pop.active = true;
      pop.x = x;
      pop.y = y;
      pop.life = 0.9;
      pop.text = text;
      pop.color = color;
      return;
    }
  }

  function startWave(number) {
    state.wave = number;
    state.meteorsLeft = WAVES.firstMeteors + (number - 1) * WAVES.meteorsPerWave;
    state.orbsLeft = WAVES.firstOrbs + Math.floor((number - 1) / 2);
    state.spawnTimer = 0.4;
    state.phase = PHASE_STORM;
    state.banner = number === WAVES.count ? 'FINAL WAVE' : `WAVE ${number}`;
    state.bannerTimer = 1.6;
    if (number > 1) state.hull = Math.min(PLANET.maxHull, state.hull + PLANET.repairPerWave);
  }

  function spawn(pool, isOrb) {
    for (let i = 0; i < pool.length; i += 1) {
      const body = pool[i];
      if (body.active) continue;
      const arrivalAngle = random() * Math.PI * 2;
      body.x = FIELD.centerX + Math.cos(arrivalAngle) * SPAWN_DISTANCE;
      body.y = FIELD.centerY + Math.sin(arrivalAngle) * SPAWN_DISTANCE;
      const aim = Math.atan2(FIELD.centerY - body.y, FIELD.centerX - body.x) + range(random, -METEOR.aimJitter, METEOR.aimJitter);
      const speed = isOrb
        ? ORB.speed + (state.wave - 1) * ORB.speedPerWave + range(random, -12, 20)
        : METEOR.baseSpeed + (state.wave - 1) * METEOR.speedPerWave + range(random, 0, METEOR.speedJitter);
      body.vx = Math.cos(aim) * speed;
      body.vy = Math.sin(aim) * speed;
      body.radius = isOrb ? ORB.radius : range(random, METEOR.minRadius, METEOR.maxRadius);
      body.spin = range(random, -2.4, 2.4);
      body.angle = random() * Math.PI * 2;
      body.active = true;
      return;
    }
  }

  function gainCombo() {
    state.combo += 1;
    state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perMultiplierStep));
  }

  function breakCombo() {
    state.combo = 0;
    state.multiplier = 1;
  }

  /** Steer the shield in demo mode: track the nearest incoming meteor at a stately pace. */
  function demoSteer(dt) {
    let target = null;
    let bestDistance = Infinity;
    for (let i = 0; i < state.meteors.length; i += 1) {
      const m = state.meteors[i];
      if (!m.active) continue;
      const d = Math.hypot(m.x - FIELD.centerX, m.y - FIELD.centerY);
      if (d < bestDistance) {
        bestDistance = d;
        target = m;
      }
    }
    const goal = target === null ? state.time * 0.4 : Math.atan2(target.y - FIELD.centerY, target.x - FIELD.centerX);
    const turn = angleBetween(state.shieldAngle, goal);
    const maxTurn = SHIELD.turnRate * 0.62 * dt;
    state.shieldAngle = wrapAngle(state.shieldAngle + Math.max(-maxTurn, Math.min(maxTurn, turn)));
  }

  function moveShield(dt, control, demo) {
    if (demo) {
      demoSteer(dt);
      return;
    }
    if (control.turn !== 0) {
      state.shieldAngle = wrapAngle(state.shieldAngle + control.turn * SHIELD.turnRate * dt);
    }
    if (control.angle !== null) {
      const turn = angleBetween(state.shieldAngle, control.angle);
      const eased = turn * Math.min(1, SHIELD.followRate * dt);
      const capped = Math.max(-SHIELD.turnRate * 2.4 * dt, Math.min(SHIELD.turnRate * 2.4 * dt, eased));
      state.shieldAngle = wrapAngle(state.shieldAngle + capped);
    }
  }

  /**
   * Move one falling body; returns an event bit when it meets the shield or the planet.
   * `isOrb` selects the rules: orbs are caught by the shield and fizzle on the planet,
   * meteors are shattered by the shield and wound the planet.
   */
  function moveBody(body, isOrb, demo, dt) {
    const prevRadius = Math.hypot(body.x - FIELD.centerX, body.y - FIELD.centerY);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.spin * dt;
    const radius = Math.hypot(body.x - FIELD.centerX, body.y - FIELD.centerY);
    const positionAngle = Math.atan2(body.y - FIELD.centerY, body.x - FIELD.centerX);
    const onShield = Math.abs(angleBetween(state.shieldAngle, positionAngle)) <= SHIELD.halfArc + body.radius / SHIELD.radius;
    if (prevRadius > SHIELD.radius && radius <= SHIELD.radius && onShield) {
      body.active = false;
      return isOrb ? EVENT_CATCH : EVENT_BLOCK;
    }
    if (radius <= PLANET.radius + body.radius * 0.55) {
      body.active = false;
      return isOrb ? EVENT_MISS : EVENT_IMPACT;
    }
    if (radius > SPAWN_DISTANCE + 90) body.active = false;
    return 0;
  }

  function anyActive() {
    for (let i = 0; i < state.meteors.length; i += 1) if (state.meteors[i].active) return true;
    for (let i = 0; i < state.orbs.length; i += 1) if (state.orbs[i].active) return true;
    return false;
  }

  /**
   * Advance the world one fixed step. `control` is { angle, turn }: the pointer's angle
   * around the planet (or null) and the keyboard's turn (-1, 0, 1). In demo mode the shield
   * steers itself and impacts cost no hull. Returns the events that happened this step.
   */
  function step(dt, control, demo) {
    let events = 0;
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);

    moveShield(dt, control, demo);

    if (state.phase === PHASE_BETWEEN) {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        startWave(state.wave + 1);
        events |= EVENT_WAVE;
      }
    } else if (state.phase === PHASE_STORM) {
      const left = state.meteorsLeft + state.orbsLeft;
      if (left > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const gap = Math.max(WAVES.minSpawnGap, WAVES.spawnGap - (state.wave - 1) * WAVES.spawnGapPerWave);
          state.spawnTimer = gap * (0.7 + random() * 0.6);
          const wantOrb = state.orbsLeft > 0 && (state.meteorsLeft === 0 || random() < state.orbsLeft / left);
          if (wantOrb) {
            spawn(state.orbs, true);
            state.orbsLeft -= 1;
          } else {
            spawn(state.meteors, false);
            state.meteorsLeft -= 1;
          }
        }
      } else if (!anyActive()) {
        if (state.wave >= WAVES.count) {
          state.phase = PHASE_WON;
          events |= EVENT_WIN;
        } else {
          state.phase = PHASE_BETWEEN;
          state.phaseTimer = WAVES.betweenSeconds;
        }
      }
    }

    for (let i = 0; i < state.meteors.length; i += 1) {
      const m = state.meteors[i];
      if (!m.active) continue;
      const hit = moveBody(m, false, demo, dt);
      if (hit === EVENT_BLOCK) {
        gainCombo();
        const points = METEOR.blockPoints * state.multiplier;
        state.score += points;
        state.blocked += 1;
        burst(m.x, m.y, '#ff7847', 10, 190, 3);
        burst(m.x, m.y, '#ffd23e', 5, 130, 2);
        popup(m.x, m.y - 14, `+${points}`, '#7deeff');
        events |= EVENT_BLOCK;
      } else if (hit === EVENT_IMPACT) {
        burst(m.x, m.y, '#ff4d6d', 16, 230, 3.4);
        state.leaked += 1;
        breakCombo();
        state.shake = 13;
        state.flash = 0.55;
        if (!demo) {
          state.hull -= Math.round(m.radius * METEOR.damagePerRadius);
          if (state.hull <= 0) {
            state.hull = 0;
            state.phase = PHASE_LOST;
            burst(FIELD.centerX, FIELD.centerY, '#2ee6a8', 42, 320, 4);
            burst(FIELD.centerX, FIELD.centerY, '#ff7847', 26, 240, 3.4);
            events |= EVENT_OVER;
          }
        }
        events |= EVENT_IMPACT;
      }
    }

    for (let i = 0; i < state.orbs.length; i += 1) {
      const o = state.orbs[i];
      if (!o.active) continue;
      const hit = moveBody(o, true, demo, dt);
      if (hit === EVENT_CATCH) {
        gainCombo();
        const points = ORB.catchPoints * state.multiplier;
        state.score += points;
        state.caught += 1;
        burst(o.x, o.y, '#ffe95e', 12, 150, 2.6);
        popup(o.x, o.y - 14, `+${points}`, '#ffe95e');
        if (state.combo % ORB.healAtCombo === 0 && state.hull < PLANET.maxHull) {
          state.hull = Math.min(PLANET.maxHull, state.hull + ORB.healAmount);
          popup(FIELD.centerX, FIELD.centerY - PLANET.radius - 26, `+${ORB.healAmount} HULL`, '#2ee6a8');
        }
        events |= EVENT_CATCH;
      } else if (hit === EVENT_MISS) {
        breakCombo();
        events |= EVENT_MISS;
      }
    }

    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
    for (let i = 0; i < state.popups.length; i += 1) {
      const pop = state.popups[i];
      if (!pop.active) continue;
      pop.life -= dt;
      pop.y -= 34 * dt;
      if (pop.life <= 0) pop.active = false;
    }
    return events;
  }

  /** Back to a fresh run: full hull, no score, wave 1 about to begin. */
  function reset() {
    state.time = 0;
    state.shieldAngle = -Math.PI / 2;
    state.hull = PLANET.maxHull;
    state.score = 0;
    state.combo = 0;
    state.multiplier = 1;
    state.wave = 0;
    state.phase = PHASE_BETWEEN;
    state.phaseTimer = 0.9;
    state.meteorsLeft = 0;
    state.orbsLeft = 0;
    state.spawnTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = '';
    state.bannerTimer = 0;
    state.blocked = 0;
    state.caught = 0;
    state.leaked = 0;
    for (let i = 0; i < state.meteors.length; i += 1) state.meteors[i].active = false;
    for (let i = 0; i < state.orbs.length; i += 1) state.orbs[i].active = false;
    for (let i = 0; i < state.particles.length; i += 1) state.particles[i].active = false;
    for (let i = 0; i < state.popups.length; i += 1) state.popups[i].active = false;
  }

  reset();
  return { state, step, reset };
}
