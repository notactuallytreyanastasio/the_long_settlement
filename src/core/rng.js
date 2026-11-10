// Explicit, pure randomness: mulberry32 over a uint32 state.
// Every function returns the value together with the next Rng; nothing is mutated.

/** @typedef {import('./types.js').Rng} Rng */

/** @param {number} n @returns {Rng} */
export function seed(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`rng.seed: seed must be a finite number, got ${String(n)}`);
  }
  return { s: n >>> 0 };
}

/** @param {Rng} rng @returns {[number, Rng]} float in [0,1) */
export function next(rng) {
  if (!rng || typeof rng.s !== 'number' || !Number.isInteger(rng.s) || rng.s < 0 || rng.s > 0xffffffff) {
    throw new Error(`rng.next: not an Rng: ${JSON.stringify(rng)}`);
  }
  const s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { s }];
}

/** @param {Rng} rng @param {number} n @returns {[number, Rng]} int in [0,n) */
export function nextInt(rng, n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`rng.nextInt: n must be a positive integer, got ${String(n)}`);
  }
  const [f, r] = next(rng);
  return [Math.floor(f * n), r];
}

/** @template T @param {Rng} rng @param {T[]} arr @returns {[T, Rng]} */
export function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`rng.pick: needs a non-empty array, got ${JSON.stringify(arr)}`);
  }
  const [i, r] = nextInt(rng, arr.length);
  return [arr[i], r];
}
