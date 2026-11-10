import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/core/rng.js';
import { SYMBOLS, REEL_STRIPS, PAYTABLE, payoutFor, spin } from '../src/core/slot.js';
import { chapter1 } from '../src/content/chapter1.js';

const BOONS = [null, 'ballSave', 'multiball', 'doubleMarks'];

test('SYMBOLS are the six contract symbols', () => {
  assert.deepEqual([...SYMBOLS].sort(), ['coin', 'crown', 'gavel', 'orb', 'scale', 'tide']);
});

test('each reel strip has 24 stops with the same symbol counts', () => {
  assert.equal(REEL_STRIPS.length, 3);
  const want = { coin: 7, scale: 6, gavel: 4, crown: 2, orb: 2, tide: 3 };
  for (const strip of REEL_STRIPS) {
    assert.equal(strip.length, 24);
    const got = {};
    for (const s of strip) got[s] = (got[s] || 0) + 1;
    assert.deepEqual(got, want);
  }
  assert.notDeepEqual(REEL_STRIPS[0], REEL_STRIPS[1]);
  assert.notDeepEqual(REEL_STRIPS[1], REEL_STRIPS[2]);
});

test('every one of the 216 combinations has a complete, well-formed payout', () => {
  const names = new Map();
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    const p = payoutFor([a, b, c]);
    assert.ok(Number.isInteger(p.writs) && p.writs >= 0, `${a},${b},${c} writs`);
    assert.ok(Number.isFinite(p.marks) && p.marks >= 0, `${a},${b},${c} marks`);
    assert.ok(BOONS.includes(p.boon), `${a},${b},${c} boon ${p.boon}`);
    assert.ok(typeof p.name === 'string' && p.name.length > 3);
    assert.ok(typeof p.blurb === 'string' && /^[A-Z].*\.$/.test(p.blurb), `blurb: ${p.blurb}`);
    assert.equal((p.blurb.match(/[.!?]/g) || []).length, 1, `one sentence: ${p.blurb}`);
    if (names.has(p.name)) assert.equal(names.get(p.name), p.blurb);
    names.set(p.name, p.blurb);
  }
  assert.equal(names.size, 14);
  assert.equal(new Set(names.values()).size, 14, 'every payout has its own blurb');
  assert.equal(PAYTABLE.length, 14);
  assert.deepEqual(new Set(PAYTABLE.map((e) => e.payout.name)), new Set(names.keys()));
});

test('the named lots mean what the world says they mean', () => {
  const orb = payoutFor(['orb', 'orb', 'orb']);
  assert.equal(orb.name, 'The Lot Falls', "chapter 1's rigged spin shows this name");
  assert.equal(orb.name, chapter1.riggedSpin.payout.name);
  assert.deepEqual(chapter1.riggedSpin.reels, ['orb', 'orb', 'orb']);
  assert.equal(orb.writs, 3);
  assert.equal(orb.boon, 'multiball');

  const gavel = payoutFor(['gavel', 'gavel', 'gavel']);
  assert.equal(gavel.name, 'Three Gavels: Injunction');
  assert.equal(gavel.boon, 'ballSave');

  const crown = payoutFor(['crown', 'crown', 'crown']);
  assert.equal(crown.marks, 400);
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    assert.ok(payoutFor([a, b, c]).marks <= crown.marks, 'nothing pays more money than the Mint');
  }

  assert.equal(payoutFor(['coin', 'coin', 'coin']).boon, 'doubleMarks');
  assert.equal(payoutFor(['scale', 'scale', 'scale']).writs, 4);

  const bust = payoutFor(['tide', 'tide', 'tide']);
  assert.equal(bust.name, 'The Churn Thrice: A Light Goes Out');
  assert.equal(payoutFor(['tide', 'tide', 'coin']).name, 'The Churn Twice: A Lane Closes');
  assert.match(payoutFor(['coin', 'coin', 'coin']).name, /Payable in Calm$/);
  assert.deepEqual([bust.writs, bust.marks, bust.boon], [0, 0, null]);
});

test('reel order never matters; a pair pays whatever the third reel shows', () => {
  const perms = ([a, b, c]) => [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    const base = payoutFor([a, b, c]);
    for (const p of perms([a, b, c])) assert.deepEqual(payoutFor(p), base);
  }
  assert.deepEqual(payoutFor(['scale', 'scale', 'tide']), payoutFor(['scale', 'scale', 'orb']));
  assert.equal(payoutFor(['scale', 'tide', 'scale']).writs, 3);
});

test('no payout speaks of the old premise', () => {
  for (const { payout } of PAYTABLE) {
    assert.doesNotMatch(`${payout.name} ${payout.blurb}`, /bearer|undertow|pilgrim|stillness|shrine/i, payout.name);
  }
});

test('the Churn voids an unpaired draw and its own pair pays nothing', () => {
  assert.equal(payoutFor(['coin', 'scale', 'gavel']).writs, 1);
  assert.equal(payoutFor(['coin', 'scale', 'tide']).writs, 0);
  assert.equal(payoutFor(['coin', 'scale', 'tide']).name, 'The Churn on the Reels: Void Draw');
  assert.equal(payoutFor(['tide', 'crown', 'tide']).writs, 0);
  assert.equal(payoutFor(['tide', 'crown', 'tide']).marks, 0);
});

test('payoutFor returns a fresh object and rejects bad input by name', () => {
  const p = payoutFor(['coin', 'coin', 'coin']);
  p.writs = 99;
  assert.equal(payoutFor(['coin', 'coin', 'coin']).writs, 3);
  assert.throws(() => payoutFor(['coin', 'coin', 'skull']), /skull/);
  assert.throws(() => payoutFor(['coin', 'coin']), /three reels/);
});

test('spin is deterministic, pure, and consistent with payoutFor', () => {
  const r = Object.freeze(seed(1234));
  const a = spin(r);
  const b = spin(r);
  assert.deepEqual(a, b);
  assert.deepEqual(r, { s: 1234 });
  assert.notDeepEqual(a.rng, r);
  assert.equal(a.result.reels.length, 3);
  assert.deepEqual(a.result.payout, payoutFor(a.result.reels));
  a.result.reels.forEach((s, i) => assert.ok(REEL_STRIPS[i].includes(s)));
});

test('measured odds over 200k seeded spins match the design and the exact enumeration', () => {
  // Exact figures by enumerating all 24^3 stop combinations.
  let exWin = 0, exWrits = 0, exMarks = 0, total = 0;
  for (const a of REEL_STRIPS[0]) for (const b of REEL_STRIPS[1]) for (const c of REEL_STRIPS[2]) {
    const p = payoutFor([a, b, c]);
    total++; exWrits += p.writs; exMarks += p.marks; if (p.writs > 0) exWin++;
  }
  exWin /= total; exWrits /= total; exMarks /= total;

  const N = 200000;
  let r = seed(20261109);
  let win = 0, writs = 0, marks = 0;
  const byName = {};
  for (let i = 0; i < N; i++) {
    const s = spin(r);
    r = s.rng;
    const p = s.result.payout;
    if (p.writs > 0) win++;
    writs += p.writs; marks += p.marks;
    byName[p.name] = (byName[p.name] || 0) + 1;
  }
  const pWin = win / N, meanWrits = writs / N, meanMarks = marks / N;
  const table = Object.entries(byName).sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${(v / N * 100).toFixed(2).padStart(6)}%  ${k}`).join('\n');
  console.log(`slot over ${N} spins: P(writ>=1)=${pWin.toFixed(4)} mean writs=${meanWrits.toFixed(4)} mean marks=${meanMarks.toFixed(2)}\n${table}`);

  assert.ok(pWin >= 0.65 && pWin <= 0.75, `P(at least one writ) ${pWin}`);
  assert.ok(meanWrits >= 1.3 && meanWrits <= 1.8, `mean writs ${meanWrits}`);
  assert.ok(Math.abs(pWin - exWin) < 0.005, `sampled ${pWin} vs exact ${exWin}`);
  assert.ok(Math.abs(meanWrits - exWrits) < 0.02, `sampled ${meanWrits} vs exact ${exWrits}`);
  assert.ok(Math.abs(meanMarks - exMarks) < 1, `sampled ${meanMarks} vs exact ${exMarks}`);

  assert.equal(Object.keys(byName).length, 14, 'every payout turns up');
  const share = (n) => byName[n] / N;
  const dark = share('The Churn Thrice: A Light Goes Out');
  assert.ok(dark > 0.001 && dark < 0.004, `a light goes out ${dark}`);
  assert.ok(share('The Lot Falls') < 0.002, 'the jackpot is rare');
  assert.ok(share("Three Crowns: The Mint's Favour") < 0.002);
});
