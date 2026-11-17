// Pointer and keyboard input for Orbital Aegis. The pointer steers the shield by its angle
// around the planet; the arrow keys (or A and D) swing it at a fixed rate. Space, Enter and
// clicks confirm (start, restart); P or Escape pauses; M mutes. One-shot actions are queued
// as a bitmask and drained by the game loop each frame.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const TURN_KEYS = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};

/** The canvas transform the renderer uses: logical field fitted into the window, centred. */
export function fieldTransform(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
  return {
    scale,
    offsetX: (rect.width - FIELD.width * scale) / 2,
    offsetY: (rect.height - FIELD.height * scale) / 2,
  };
}

/** Create the input reader bound to `canvas`. */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let pointerAngle = null;
  let pointerSeen = false;

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const t = fieldTransform(canvas);
    const x = (event.clientX - rect.left - t.offsetX) / t.scale;
    const y = (event.clientY - rect.top - t.offsetY) / t.scale;
    pointerAngle = Math.atan2(y - FIELD.centerY, x - FIELD.centerX);
    pointerSeen = true;
  }

  window.addEventListener('pointermove', updatePointer);
  window.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    }
    if (event.code in TURN_KEYS) {
      held.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
  });

  return {
    /** The control the world steps with: pointer angle (or null) and keyboard turn. */
    control() {
      let turn = 0;
      for (const code of held) turn += TURN_KEYS[code] ?? 0;
      return { angle: pointerSeen ? pointerAngle : null, turn: Math.max(-1, Math.min(1, turn)) };
    },
    /** Drain the one-shot actions pressed since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
