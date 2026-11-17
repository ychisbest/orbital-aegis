// The canvas renderer of Orbital Aegis: everything is drawn in code, in a neon palette on
// deep space. It paints the starfield, the planet and its shield ring, the falling meteors
// and orbs, particles and score popups, then the HUD and whichever screen is showing
// (title, play, paused, game over, victory). Drawing never changes the world.

import { COMBO, FIELD, FONT, ORB, PALETTE, PLANET, SHIELD, WAVES } from './config.js';
import { createRandom } from './random.js';
import { PHASE_LOST, PHASE_WON } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Fixed stars, generated once from a seed so every frame and screenshot agrees. */
const STARS = (() => {
  const random = createRandom(20261117);
  const stars = [];
  for (let i = 0; i < 190; i += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, r: 0.6 + random() * 1.7, tw: random() * Math.PI * 2 });
  }
  return stars;
})();

/** A deterministic 0..1 wobble from an integer, for jagged meteor silhouettes. */
function wobble(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Create the renderer bound to `canvas`. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
  }
  window.addEventListener('resize', resize);
  resize();

  function drawStarfield(state) {
    ctx.fillStyle = PALETTE.space;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const nebula = ctx.createRadialGradient(1080, 120, 40, 1080, 120, 520);
    nebula.addColorStop(0, 'rgba(88, 60, 180, 0.20)');
    nebula.addColorStop(1, 'rgba(88, 60, 180, 0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const nebula2 = ctx.createRadialGradient(170, 620, 30, 170, 620, 460);
    nebula2.addColorStop(0, 'rgba(20, 110, 140, 0.16)');
    nebula2.addColorStop(1, 'rgba(20, 110, 140, 0)');
    ctx.fillStyle = nebula2;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (let i = 0; i < STARS.length; i += 1) {
      const star = STARS[i];
      const alpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(state.time * 1.7 + star.tw));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.star;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlanet(state) {
    const { centerX, centerY } = FIELD;
    const lost = state.phase === PHASE_LOST;
    const glow = ctx.createRadialGradient(centerX, centerY, PLANET.radius * 0.4, centerX, centerY, PLANET.radius * 2.6);
    glow.addColorStop(0, PALETTE.planetGlow);
    glow.addColorStop(1, 'rgba(46, 230, 168, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, PLANET.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(centerX - 20, centerY - 22, 8, centerX, centerY, PLANET.radius + 6);
    if (lost) {
      body.addColorStop(0, '#5a3b33');
      body.addColorStop(1, '#241312');
    } else {
      body.addColorStop(0, '#7dfcd0');
      body.addColorStop(0.55, PALETTE.planetCore);
      body.addColorStop(1, PALETTE.planetDeep);
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(centerX, centerY, PLANET.radius, 0, Math.PI * 2);
    ctx.fill();

    // Continents: a few soft blobs turning slowly with the planet.
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, PLANET.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = lost ? 'rgba(30, 16, 12, 0.5)' : 'rgba(6, 84, 60, 0.4)';
    const spin = state.time * 0.05;
    const blobs = [[-24, -12, 17], [14, 16, 13], [30, -26, 10], [-6, 30, 9]];
    for (let i = 0; i < blobs.length; i += 1) {
      const [bx, by, br] = blobs[i];
      const a = Math.atan2(by, bx) + spin;
      const d = Math.hypot(bx, by);
      ctx.beginPath();
      ctx.arc(centerX + Math.cos(a) * d, centerY + Math.sin(a) * d, br, 0, Math.PI * 2);
      ctx.fill();
    }
    // Damage cracks appear as the hull falls.
    if (!lost && state.hull < 55) {
      ctx.strokeStyle = 'rgba(20, 30, 26, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 30, centerY - 34);
      ctx.lineTo(centerX - 12, centerY - 10);
      ctx.lineTo(centerX - 22, centerY + 12);
      if (state.hull < 30) {
        ctx.moveTo(centerX + 26, centerY - 20);
        ctx.lineTo(centerX + 12, centerY + 2);
        ctx.lineTo(centerX + 24, centerY + 26);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = lost ? 'rgba(120, 70, 60, 0.6)' : 'rgba(160, 255, 224, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, PLANET.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawShield(state) {
    const { centerX, centerY } = FIELD;
    // The faint full ring the shield travels on.
    ctx.strokeStyle = 'rgba(57, 198, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, SHIELD.radius, 0, Math.PI * 2);
    ctx.stroke();

    const start = state.shieldAngle - SHIELD.halfArc;
    const end = state.shieldAngle + SHIELD.halfArc;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(57, 198, 255, 0.28)';
    ctx.lineWidth = SHIELD.thickness + 9;
    ctx.beginPath();
    ctx.arc(centerX, centerY, SHIELD.radius, start, end);
    ctx.stroke();
    const pulse = 0.82 + 0.18 * Math.sin(state.time * 5);
    ctx.strokeStyle = PALETTE.shield;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = SHIELD.thickness;
    ctx.beginPath();
    ctx.arc(centerX, centerY, SHIELD.radius, start, end);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.shieldHot;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, SHIELD.radius, start, end);
    ctx.stroke();
    // Bright caps at the arc's ends.
    ctx.fillStyle = PALETTE.shieldHot;
    for (const a of [start, end]) {
      ctx.beginPath();
      ctx.arc(centerX + Math.cos(a) * SHIELD.radius, centerY + Math.sin(a) * SHIELD.radius, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMeteor(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    // A short fire trail behind it, opposite its motion.
    const back = Math.atan2(-m.vy, -m.vx);
    const trail = ctx.createLinearGradient(0, 0, Math.cos(back) * m.radius * 3.2, Math.sin(back) * m.radius * 3.2);
    trail.addColorStop(0, 'rgba(255, 120, 71, 0.55)');
    trail.addColorStop(1, 'rgba(255, 120, 71, 0)');
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-m.radius * 0.6, -m.radius * 0.55);
    ctx.lineTo(Math.cos(back) * m.radius * 3.2, Math.sin(back) * m.radius * 3.2);
    ctx.lineTo(m.radius * 0.6, m.radius * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(m.angle);
    ctx.beginPath();
    const points = 8;
    for (let i = 0; i < points; i += 1) {
      const a = (i / points) * Math.PI * 2;
      const r = m.radius * (0.74 + 0.42 * wobble(i * 3 + Math.round(m.radius * 10)));
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#8a4a38';
    ctx.fill();
    ctx.strokeStyle = PALETTE.meteor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.meteorCore;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOrb(o, time) {
    const pulse = 1 + 0.16 * Math.sin(time * 6 + o.x);
    const glow = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, ORB.radius * 3 * pulse);
    glow.addColorStop(0, PALETTE.orbGlow);
    glow.addColorStop(1, 'rgba(255, 233, 94, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(o.x, o.y, ORB.radius * 3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.orb;
    ctx.beginPath();
    ctx.arc(o.x, o.y, ORB.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(o.x - 3, o.y - 3, ORB.radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles(state) {
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups(state) {
    ctx.textAlign = 'center';
    ctx.font = `700 19px ${FONT}`;
    for (let i = 0; i < state.popups.length; i += 1) {
      const pop = state.popups[i];
      if (!pop.active) continue;
      ctx.globalAlpha = Math.min(1, pop.life / 0.45);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
  }

  function text(str, x, y, size, color, align = 'center', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud(state, best, muted) {
    text(`SCORE ${state.score}`, 26, 44, 26, PALETTE.text, 'left');
    text(`BEST ${Math.max(best, state.score)}`, 26, 74, 16, PALETTE.muted, 'left', 600);
    text(`WAVE ${Math.max(1, state.wave)} / ${WAVES.count}`, FIELD.width / 2, 44, 24, PALETTE.text);
    const left = state.meteorsLeft + state.orbsLeft;
    if (state.phase === 'storm' && left > 0) text(`${left} INBOUND`, FIELD.width / 2, 72, 15, PALETTE.muted, 'center', 600);

    if (state.multiplier > 1) {
      text(`COMBO x${state.multiplier}`, FIELD.width - 26, 44, 26, PALETTE.orb, 'right');
    } else {
      text('COMBO x1', FIELD.width - 26, 44, 26, PALETTE.muted, 'right');
    }
    const toNext = COMBO.perMultiplierStep - (state.combo % COMBO.perMultiplierStep);
    text(state.multiplier >= COMBO.maxMultiplier ? 'MAX MULTIPLIER' : `${toNext} MORE TO x${state.multiplier + 1}`, FIELD.width - 26, 72, 14, PALETTE.muted, 'right', 600);

    // Hull bar, bottom left.
    const barW = 300;
    const barH = 18;
    const x = 26;
    const y = FIELD.height - 44;
    text('PLANET HULL', x, y - 10, 15, PALETTE.muted, 'left', 600);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, barW, barH);
    const frac = state.hull / PLANET.maxHull;
    ctx.fillStyle = frac > 0.5 ? PALETTE.planetCore : frac > 0.25 ? PALETTE.orb : PALETTE.danger;
    ctx.fillRect(x, y, barW * frac, barH);
    text(`${state.hull}`, x + barW + 12, y + 15, 17, PALETTE.text, 'left');
    text(muted ? 'M SOUND OFF · P PAUSE' : 'MOUSE / ARROWS · P PAUSE · M MUTE', FIELD.width - 26, FIELD.height - 28, 14, PALETTE.muted, 'right', 600);

    if (state.bannerTimer > 0 && state.banner) {
      ctx.globalAlpha = Math.min(1, state.bannerTimer / 0.5);
      text(state.banner, FIELD.width / 2, 132, 40, PALETTE.shieldHot);
      ctx.globalAlpha = 1;
    }
  }

  function panel(width, height) {
    const x = FIELD.width / 2 - width / 2;
    const y = FIELD.height / 2 - height / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = 'rgba(57, 198, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 16);
    ctx.fill();
    ctx.stroke();
    return { x, y };
  }

  function drawTitle(state, best) {
    text('ORBITAL AEGIS', FIELD.width / 2, 148, 72, PALETTE.shieldHot);
    text('NEON ORBITAL DEFENSE', FIELD.width / 2, 188, 21, PALETTE.orb, 'center', 600);
    const { y } = panel(620, 218);
    text('Swing the shield ring around the planet.', FIELD.width / 2, y + 52, 21, PALETTE.text, 'center', 600);
    text('Block the meteors. Catch the golden orbs.', FIELD.width / 2, y + 84, 21, PALETTE.text, 'center', 600);
    text('Chains raise your combo multiplier — a leak resets it.', FIELD.width / 2, y + 116, 18, PALETTE.muted, 'center', 600);
    text('Survive all 10 waves. If the hull hits zero, the planet falls.', FIELD.width / 2, y + 146, 18, PALETTE.muted, 'center', 600);
    text('MOUSE or ← → / A D to swing · P pause · M mute', FIELD.width / 2, y + 182, 17, PALETTE.shield, 'center', 600);
    const blink = 0.55 + 0.45 * Math.sin(state.time * 3.2);
    ctx.globalAlpha = blink;
    text('PRESS SPACE OR CLICK TO START', FIELD.width / 2, 616, 24, PALETTE.text);
    ctx.globalAlpha = 1;
    if (best > 0) text(`BEST ${best}`, FIELD.width / 2, 652, 17, PALETTE.muted, 'center', 600);
  }

  function drawEnd(state, best, won) {
    const { y } = panel(560, 330);
    text(won ? 'THE PLANET ENDURES' : 'PLANET LOST', FIELD.width / 2, y + 66, 42, won ? PALETTE.planetCore : PALETTE.danger);
    text(won ? `All ${WAVES.count} waves cleared` : `Fell on wave ${state.wave} of ${WAVES.count}`, FIELD.width / 2, y + 102, 19, PALETTE.muted, 'center', 600);
    text(`SCORE ${state.score}`, FIELD.width / 2, y + 158, 34, PALETTE.text);
    text(`BEST ${Math.max(best, state.score)}`, FIELD.width / 2, y + 190, 17, PALETTE.muted, 'center', 600);
    text(`Meteors blocked ${state.blocked} · Orbs caught ${state.caught} · Impacts ${state.leaked}`, FIELD.width / 2, y + 232, 18, PALETTE.text, 'center', 600);
    const blink = 0.55 + 0.45 * Math.sin(state.time * 3.2);
    ctx.globalAlpha = blink;
    text('PRESS SPACE OR CLICK TO PLAY AGAIN', FIELD.width / 2, y + 282, 20, PALETTE.shieldHot);
    ctx.globalAlpha = 1;
  }

  /** Paint the world and the named screen. `muted` only changes the HUD's sound hint. */
  function draw(state, screen, best, muted) {
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const offsetX = (canvas.width - FIELD.width * scale) / 2;
    const offsetY = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    if (state.shake > 0.2) {
      const sx = Math.sin(state.time * 91) * state.shake;
      const sy = Math.cos(state.time * 83) * state.shake * 0.7;
      ctx.translate(sx, sy);
    }
    drawStarfield(state);
    for (let i = 0; i < state.meteors.length; i += 1) if (state.meteors[i].active) drawMeteor(state.meteors[i]);
    for (let i = 0; i < state.orbs.length; i += 1) if (state.orbs[i].active) drawOrb(state.orbs[i], state.time);
    drawPlanet(state);
    if (state.phase !== PHASE_LOST) drawShield(state);
    drawParticles(state);
    drawPopups(state);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 45, 80, ${state.flash * 0.22})`;
      ctx.fillRect(-30, -30, FIELD.width + 60, FIELD.height + 60);
    }
    if (screen === SCREEN_TITLE) {
      drawHud(state, best, muted);
      drawTitle(state, best);
    } else if (screen === SCREEN_OVER) {
      drawHud(state, best, muted);
      drawEnd(state, best, false);
    } else if (screen === SCREEN_WIN) {
      drawHud(state, best, muted);
      drawEnd(state, best, true);
    } else {
      drawHud(state, best, muted);
      if (screen === SCREEN_PAUSED) {
        ctx.fillStyle = 'rgba(2, 4, 12, 0.55)';
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
        text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 6, 44, PALETTE.text);
        text('Press P or Space to resume', FIELD.width / 2, FIELD.height / 2 + 34, 19, PALETTE.muted, 'center', 600);
      }
    }
  }

  return { draw };
}
