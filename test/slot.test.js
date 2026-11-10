import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/core/rng.js';
import { SYMBOLS, SOURCES, REEL_STRIPS, PAYTABLE, PLAY_PAYTABLE, payoutFor, drawSym, spin } from '../src/core/slot.js';
import { chapter1 } from '../src/content/chapter1.js';

const BOONS = [null, 'ballSave', 'multiball', 'doubleMarks', 'kickback'];
// The tests below that name no table are about the lever's: the one a pull is paid for.
const lever = (reels) => payoutFor(reels, 'lever');

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

test('every one of the 216 combinations has a complete, well-formed payout, from the lever and in play', () => {
  assert.deepEqual(SOURCES, ['lever', 'lanes', 'shot']);
  const all = new Map();
  for (const [source, listed] of [['lever', PAYTABLE], ['lanes', PLAY_PAYTABLE], ['shot', PLAY_PAYTABLE]]) {
    const names = new Map();
    for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
      const p = payoutFor([a, b, c], source);
      assert.ok(Number.isInteger(p.writs) && p.writs >= 0, `${a},${b},${c} writs`);
      assert.ok(Number.isFinite(p.marks) && p.marks >= 0, `${a},${b},${c} marks`);
      assert.ok(Number.isInteger(p.points) && p.points >= 0, `${a},${b},${c} points ${p.points}`);
      assert.ok(BOONS.includes(p.boon), `${a},${b},${c} boon ${p.boon}`);
      assert.ok(typeof p.name === 'string' && p.name.length > 3);
      assert.ok(typeof p.blurb === 'string' && /^[A-Z].*\.$/.test(p.blurb), `blurb: ${p.blurb}`);
      assert.equal((p.blurb.match(/[.!?]/g) || []).length, 1, `one sentence: ${p.blurb}`);
      if (names.has(p.name)) assert.equal(names.get(p.name), p.blurb);
      names.set(p.name, p.blurb);
    }
    assert.equal(names.size, 14, source);
    assert.equal(new Set(names.values()).size, 14, 'every payout has its own blurb');
    assert.equal(listed.length, 14);
    assert.deepEqual(new Set(listed.map((e) => e.payout.name)), new Set(names.keys()));
    for (const [name, blurb] of names) all.set(`${source === 'lever' ? 'lever' : 'play'}|${name}`, blurb);
  }
  // The name is what the toast says: the same words never pay two different things.
  assert.equal(all.size, 28);
  assert.equal(new Set([...all.keys()].map((k) => k.split('|')[1])).size, 28, 'no name is on both tables');
  assert.equal(new Set(all.values()).size, 28, 'no blurb is on both tables');
});

test('a line earned in play pays the lean table: writs only for triples and for crown and orb pairs', () => {
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    const line = [a, b, c];
    const p = payoutFor(line, 'lanes');
    assert.deepEqual(payoutFor(line, 'shot'), p, 'lanes and shots read the same table');
    const hall = payoutFor(line, 'lever');
    assert.ok(p.writs <= hall.writs, `${line}: the lean table pays more writs than the lever`);
    if (p.writs > 0) assert.ok(p.writs < hall.writs && p.marks <= hall.marks, `${line}: a paying line in play is worth what the lever's is`);
    const counts = {};
    for (const x of line) counts[x] = (counts[x] || 0) + 1;
    const [top, n] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
    const writsAllowed = (n === 3 && top !== 'tide') || (n === 2 && (top === 'crown' || top === 'orb'));
    assert.equal(p.writs > 0, writsAllowed, `${line} pays ${p.writs} writs in play`);
    assert.ok(p.writs <= 2);
    assert.equal(hall.points, 0, 'the lever pays no points');
  }
  // each boon can be won in play, kickback only there
  const boonsOf = (table) => new Set(table.map((e) => e.payout.boon));
  assert.deepEqual(boonsOf(PLAY_PAYTABLE), new Set(BOONS));
  assert.equal(boonsOf(PAYTABLE).has('kickback'), false);
  assert.equal(payoutFor(['scale', 'scale', 'coin'], 'lanes').boon, 'kickback');
  assert.equal(payoutFor(['gavel', 'tide', 'gavel'], 'shot').boon, 'ballSave');
  assert.equal(payoutFor(['coin', 'coin', 'coin'], 'lanes').boon, 'doubleMarks');
  assert.equal(payoutFor(['orb', 'orb', 'orb'], 'lanes').boon, 'multiball');

  // exact expectation over all 24^3 stops: what a line in play is worth, beside a pull of the lever
  const exact = (source) => {
    const m = { writs: 0, marks: 0, points: 0, nothing: 0, n: 0 };
    for (const a of REEL_STRIPS[0]) for (const b of REEL_STRIPS[1]) for (const c of REEL_STRIPS[2]) {
      const p = payoutFor([a, b, c], source);
      m.n++; m.writs += p.writs; m.marks += p.marks; m.points += p.points;
      if (p.writs === 0 && p.marks === 0 && p.points === 0 && p.boon === null) m.nothing++;
    }
    return { writs: m.writs / m.n, marks: m.marks / m.n, points: m.points / m.n, nothing: m.nothing / m.n };
  };
  const play = exact('lanes'), hall = exact('lever');
  const row = (m) => `${m.writs.toFixed(3)} writs, ${m.marks.toFixed(1)} marks, ${Math.round(m.points)} points, pays nothing ${(m.nothing * 100).toFixed(1)}%`;
  console.log(`a line in play: ${row(play)}\na pull of the lever: ${row(hall)}`);
  assert.ok(play.writs > 0.05 && play.writs < 0.12, `mean writs in play ${play.writs}`);
  assert.ok(play.writs < hall.writs / 10, 'the lever is where balls come from');
  assert.ok(play.marks > 5 && play.marks < 10, `mean marks in play ${play.marks}`);
  assert.ok(play.points > 800 && play.points < 1600, `mean points in play ${play.points}`);
  assert.ok(Math.abs(play.nothing - hall.nothing) < 1e-12, 'the Churn voids the same lines on both tables');
});

test('the named lots mean what the world says they mean', () => {
  const orb = lever(['orb', 'orb', 'orb']);
  assert.equal(orb.name, 'The Lot Falls', "chapter 1's rigged spin shows this name");
  assert.equal(orb.name, chapter1.riggedSpin.payout.name);
  assert.deepEqual(chapter1.riggedSpin.reels, ['orb', 'orb', 'orb']);
  assert.equal(orb.writs, 3);
  assert.equal(orb.boon, 'multiball');

  const gavel = lever(['gavel', 'gavel', 'gavel']);
  assert.equal(gavel.name, 'Three Gavels: Injunction');
  assert.equal(gavel.boon, 'ballSave');

  const crown = lever(['crown', 'crown', 'crown']);
  assert.equal(crown.marks, 400);
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    assert.ok(lever([a, b, c]).marks <= crown.marks, 'nothing pays more money than the Mint');
  }

  assert.equal(lever(['coin', 'coin', 'coin']).boon, 'doubleMarks');
  assert.equal(lever(['scale', 'scale', 'scale']).writs, 4);

  const bust = lever(['tide', 'tide', 'tide']);
  assert.equal(bust.name, 'The Churn Thrice: A Light Goes Out');
  assert.equal(lever(['tide', 'tide', 'coin']).name, 'The Churn Twice: A Lane Closes');
  assert.match(lever(['coin', 'coin', 'coin']).name, /Payable in Calm$/);
  assert.deepEqual([bust.writs, bust.marks, bust.boon], [0, 0, null]);
});

test('reel order never matters; a pair pays whatever the third reel shows', () => {
  const perms = ([a, b, c]) => [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    const base = lever([a, b, c]);
    for (const p of perms([a, b, c])) assert.deepEqual(lever(p), base);
  }
  assert.deepEqual(lever(['scale', 'scale', 'tide']), lever(['scale', 'scale', 'orb']));
  assert.equal(lever(['scale', 'tide', 'scale']).writs, 3);
});

test('no payout speaks of the old premise', () => {
  for (const { payout } of PAYTABLE) {
    assert.doesNotMatch(`${payout.name} ${payout.blurb}`, /bearer|undertow|pilgrim|stillness|shrine/i, payout.name);
  }
});

test('the Churn voids an unpaired draw and its own pair pays nothing', () => {
  assert.equal(lever(['coin', 'scale', 'gavel']).writs, 1);
  assert.equal(lever(['coin', 'scale', 'tide']).writs, 0);
  assert.equal(lever(['coin', 'scale', 'tide']).name, 'The Churn on the Reels: Void Draw');
  assert.equal(lever(['tide', 'crown', 'tide']).writs, 0);
  assert.equal(lever(['tide', 'crown', 'tide']).marks, 0);
});

test('payoutFor returns a fresh object and rejects bad input by name', () => {
  const p = lever(['coin', 'coin', 'coin']);
  p.writs = 99;
  assert.equal(lever(['coin', 'coin', 'coin']).writs, 3);
  assert.throws(() => lever(['coin', 'coin', 'skull']), /skull/);
  assert.throws(() => lever(['coin', 'coin']), /three reels/);
  assert.throws(() => payoutFor(['coin', 'coin', 'coin']), /unknown source undefined/, 'there is no default table');
  assert.throws(() => payoutFor(['coin', 'coin', 'coin'], 'slot'), /unknown source "slot"/);
});

test('spin is deterministic, pure, and consistent with payoutFor', () => {
  const r = Object.freeze(seed(1234));
  const a = spin(r, 'lever');
  const b = spin(r, 'lever');
  assert.deepEqual(a, b);
  assert.deepEqual(r, { s: 1234 });
  assert.notDeepEqual(a.rng, r);
  assert.equal(a.result.reels.length, 3);
  assert.deepEqual(a.result.payout, lever(a.result.reels));
  a.result.reels.forEach((s, i) => assert.ok(REEL_STRIPS[i].includes(s)));
  // the same stops whatever the source; only the table read differs
  const shot = spin(r, 'shot');
  assert.deepEqual(shot.result.reels, a.result.reels);
  assert.deepEqual(shot.rng, a.rng);
  assert.deepEqual(shot.result.payout, payoutFor(a.result.reels, 'shot'));
  assert.throws(() => spin(r), /unknown source undefined/);
});

test('drawSym draws one reel from its own strip, and three of them are a spin', () => {
  const r = Object.freeze(seed(77));
  const d0 = drawSym(r, 0), d1 = drawSym(d0.rng, 1), d2 = drawSym(d1.rng, 2);
  assert.deepEqual([d0.sym, d1.sym, d2.sym], spin(r, 'lanes').result.reels);
  assert.deepEqual(d2.rng, spin(r, 'lanes').rng);
  assert.deepEqual(drawSym(r, 0), d0, 'deterministic');
  // every stop of every strip turns up, in proportion
  for (let i = 0; i < 3; i++) {
    const got = {};
    let x = seed(900 + i);
    for (let k = 0; k < 24000; k++) { const d = drawSym(x, i); x = d.rng; got[d.sym] = (got[d.sym] || 0) + 1; }
    for (const sym of SYMBOLS) {
      const want = REEL_STRIPS[i].filter((s) => s === sym).length * 1000;
      assert.ok(Math.abs(got[sym] - want) < want * 0.1, `reel ${i} ${sym}: ${got[sym]} of an expected ${want}`);
    }
  }
  assert.throws(() => drawSym(r, 3), /no reel 3/);
});

test('measured odds over 200k seeded spins match the design and the exact enumeration', () => {
  // Exact figures by enumerating all 24^3 stop combinations.
  let exWin = 0, exWrits = 0, exMarks = 0, total = 0;
  for (const a of REEL_STRIPS[0]) for (const b of REEL_STRIPS[1]) for (const c of REEL_STRIPS[2]) {
    const p = lever([a, b, c]);
    total++; exWrits += p.writs; exMarks += p.marks; if (p.writs > 0) exWin++;
  }
  exWin /= total; exWrits /= total; exMarks /= total;

  const N = 200000;
  let r = seed(20261109);
  let win = 0, writs = 0, marks = 0;
  const byName = {};
  for (let i = 0; i < N; i++) {
    const s = spin(r, 'lever');
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
