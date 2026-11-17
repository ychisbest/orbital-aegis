// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a pilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame. The start
// scene idles in demo mode behind the title; the play scene's pilot tracks the nearest
// meteor the way a player would; the end scene's pilot does the opposite — it swings the
// shield away from the nearest meteor — so the planet falls, as a panicked player loses it.

import { FIELD, STEP } from './config.js';
import { PHASE_LOST } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 240;
const NO_CONTROL = { angle: null, turn: 0 };

/** The angle of the nearest active body to the planet, or null when the sky is clear. */
function nearestAngle(state, pool) {
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < pool.length; i += 1) {
    const body = pool[i];
    if (!body.active) continue;
    const d = Math.hypot(body.x - FIELD.centerX, body.y - FIELD.centerY);
    if (d < bestDistance) {
      bestDistance = d;
      best = body;
    }
  }
  return best === null ? null : Math.atan2(best.y - FIELD.centerY, best.x - FIELD.centerX);
}

/** A competent pilot: point the shield at the nearest meteor, else at the nearest orb. */
function goodPilot(state) {
  const angle = nearestAngle(state, state.meteors) ?? nearestAngle(state, state.orbs);
  return angle === null ? NO_CONTROL : { angle, turn: 0 };
}

/** A losing pilot: point the shield opposite the nearest meteor, so almost nothing is blocked. */
function poorPilot(state) {
  const angle = nearestAngle(state, state.meteors);
  return angle === null ? NO_CONTROL : { angle: angle + Math.PI, turn: 0 };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, NO_CONTROL, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    let best = 0;
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      world.step(STEP, goodPilot(world.state), false);
      best = Math.max(best, world.state.score);
      if (world.state.phase === PHASE_LOST) world.reset();
    }
    return { screen: SCREEN_PLAY, best };
  }
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    world.step(STEP, poorPilot(world.state), false);
    if (world.state.phase === PHASE_LOST) break;
  }
  const lost = world.state.phase === PHASE_LOST;
  return { screen: lost ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
