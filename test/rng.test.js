import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, next, nextInt, pick } from '../src/core/rng.js';

test('seed coerces to uint32 state', () => {
  assert.deepEqual(seed(1), { s: 1 });
  assert.deepEqual(seed(-1), { s: 0xffffffff });
  assert.deepEqual(seed(2 ** 32 + 5), { s: 5 });
});

test('seed rejects non-numbers', () => {
  assert.throws(() => seed(NaN), /NaN/);
  assert.throws(() => seed('7'), /7/);
});

test('next matches the reference mulberry32 stream', () => {
  // The canonical mutable implementation, kept here as the oracle.
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (const s of [0, 1, 42, 0xdeadbeef, 0xffffffff]) {
    const ref = mulberry32(s);
    let r = seed(s);
    for (let i = 0; i < 1000; i++) {
      const [v, r2] = next(r);
      assert.equal(v, ref(), `seed ${s} draw ${i}`);
      r = r2;
    }
  }
});

test('next is pure: same state, same value, argument untouched', () => {
  const r = Object.freeze(seed(99));
  const [a, ra] = next(r);
  const [b, rb] = next(r);
  assert.equal(a, b);
  assert.deepEqual(ra, rb);
  assert.deepEqual(r, { s: 99 });
  assert.notDeepEqual(ra, r);
});

test('next stays in [0,1) with a flat distribution over 200k draws', () => {
  let r = seed(2026);
  const buckets = new Array(10).fill(0);
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const [v, r2] = next(r);
    r = r2;
    assert.ok(v >= 0 && v < 1);
    buckets[Math.floor(v * 10)]++;
    sum += v;
    assert.ok(Number.isInteger(r.s) && r.s >= 0 && r.s <= 0xffffffff);
  }
  assert.ok(Math.abs(sum / N - 0.5) < 0.005, `mean ${sum / N}`);
  for (const b of buckets) assert.ok(Math.abs(b / N - 0.1) < 0.005, `bucket ${b / N}`);
});

test('nextInt covers [0,n) and nothing else', () => {
  let r = seed(7);
  const seen = new Array(6).fill(0);
  for (let i = 0; i < 60000; i++) {
    const [v, r2] = nextInt(r, 6);
    r = r2;
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
    seen[v]++;
  }
  for (const c of seen) assert.ok(Math.abs(c / 60000 - 1 / 6) < 0.01, `face share ${c / 60000}`);
});

test('nextInt rejects bad n by name', () => {
  assert.throws(() => nextInt(seed(1), 0), /got 0/);
  assert.throws(() => nextInt(seed(1), 2.5), /got 2.5/);
  assert.throws(() => nextInt(seed(1), -3), /got -3/);
});

test('pick returns members and advances the rng; empty array throws', () => {
  const arr = ['a', 'b', 'c'];
  let r = seed(3);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const [v, r2] = pick(r, arr);
    assert.ok(arr.includes(v));
    assert.notDeepEqual(r2, r);
    seen.add(v);
    r = r2;
  }
  assert.equal(seen.size, 3);
  assert.deepEqual(arr, ['a', 'b', 'c']);
  assert.throws(() => pick(seed(1), []), /non-empty/);
});

test('next rejects a value that is not an Rng', () => {
  assert.throws(() => next({ s: 1.5 }), /not an Rng/);
  assert.throws(() => next(undefined), /not an Rng/);
});
