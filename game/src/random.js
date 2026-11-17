// A small seeded random generator (mulberry32). A fixed seed makes a run, and therefore a
// screenshot scene, exactly reproducible; the live game seeds it from the clock instead.

/** Create a generator from a 32-bit seed. Returns values in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max) drawn from `random`. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random integer in [min, max] drawn from `random`. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
