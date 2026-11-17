// Procedural sound for Orbital Aegis: every effect is synthesised with WebAudio oscillators
// and filtered noise, so the game ships no audio files. The context is created lazily on the
// first user gesture (a key press or a click), never at page load, and every call is safe
// when audio is unavailable or muted.

/** Create the sound player. Nothing is audible until `unlock` runs inside a user gesture. */
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  /** One oscillator note with a quick attack and an exponential decay. */
  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (context === null || muted) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise, for impacts and explosions. */
  function noise(seconds, volume, cutoff, delay = 0) {
    if (context === null || muted) return;
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    /** A meteor shatters on the shield: a bright metallic ping, higher as the combo grows. */
    block(combo) {
      const lift = Math.min(combo, 16) * 18;
      tone(620 + lift, 240, 0.11, 'square', 0.16);
      noise(0.08, 0.1, 3200);
    },
    /** An energy orb is caught: a soft two-note chime. */
    catchOrb() {
      tone(880, 880, 0.09, 'sine', 0.2);
      tone(1318, 1318, 0.14, 'sine', 0.18, 0.07);
    },
    /** A meteor reaches the planet: a deep thud and a crunch. */
    impact() {
      tone(140, 42, 0.32, 'sine', 0.5);
      noise(0.28, 0.34, 700);
    },
    /** An orb slips past uncaught: a falling blip. */
    miss() {
      tone(420, 190, 0.16, 'triangle', 0.12);
    },
    /** A new wave arrives: a short rising horn. */
    waveHorn() {
      tone(196, 196, 0.12, 'sawtooth', 0.14);
      tone(294, 294, 0.18, 'sawtooth', 0.14, 0.1);
    },
    /** The planet falls: a long descending sweep. */
    gameOver() {
      tone(392, 55, 1.1, 'sawtooth', 0.22);
      noise(0.9, 0.2, 500, 0.1);
    },
    /** All waves cleared: a small victory arpeggio. */
    victory() {
      const notes = [523, 659, 784, 1046];
      for (let i = 0; i < notes.length; i += 1) tone(notes[i], notes[i], 0.22, 'triangle', 0.2, i * 0.13);
    },
  };
}
