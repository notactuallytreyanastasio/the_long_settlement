import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, next } from '../src/core/rng.js';
import { spin, payoutFor } from '../src/core/slot.js';
import {
  SPIN_COST, LOAN, MARKS_PER_POINT, initEcon, awardPoints, canSpin, paySpin, applyPayout,
  needsLoan, takeLoan, spendWrit, addTrust, aidAvailable, takeAid,
} from '../src/core/economy.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

test('constants are sane', () => {
  assert.ok(SPIN_COST > 0);
  assert.ok(LOAN.owed > LOAN.marks, 'the Mint lends at interest');
  assert.ok(LOAN.marks >= SPIN_COST, 'a loan buys at least one spin');
  assert.ok(LOAN.garnish > 0 && LOAN.garnish < 1);
  near(60000 * MARKS_PER_POINT, 60, 'a 60k ball is 60 marks');
});

test('initEcon affords exactly three spins and nothing else', () => {
  let e = initEcon();
  assert.deepEqual(e, { score: 0, marks: SPIN_COST * 3, writs: 0, debt: 0, trust: 0, aidUsed: 0, spins: 0 });
  for (let i = 0; i < 3; i++) { assert.ok(canSpin(e)); e = paySpin(e); }
  assert.equal(canSpin(e), false);
  assert.equal(e.spins, 3);
  assert.throws(() => paySpin(e), /costs 100 marks, econ has 0/);
});

test('awardPoints adds score and converts to marks; mult touches marks only', () => {
  const e0 = Object.freeze(initEcon());
  const e1 = awardPoints(e0, 2500);
  assert.equal(e1.score, 2500);
  near(e1.marks, 302.5);
  const e2 = awardPoints(e0, 2500, 2);
  assert.equal(e2.score, 2500);
  near(e2.marks, 305);
  near(awardPoints(e0, 100).marks, 300.1);
  assert.deepEqual(e0, initEcon(), 'argument not mutated');
  assert.throws(() => awardPoints(e0, -5), /got -5/);
  assert.throws(() => awardPoints(e0, NaN), /got NaN/);
  assert.throws(() => awardPoints({ ...e0, marks: undefined }, 5), /econ\.marks/);
});

test('needsLoan: no writs and cannot afford a spin', () => {
  const broke = { ...initEcon(), marks: SPIN_COST - 1 };
  assert.equal(needsLoan(broke), true);
  assert.equal(needsLoan({ ...broke, writs: 1 }), false);
  assert.equal(needsLoan({ ...broke, marks: SPIN_COST }), false);
});

test('a loan advances LOAN.marks, books LOAN.owed, and garnishes every mark until repaid', () => {
  const broke = { ...initEcon(), marks: 0 };
  let e = takeLoan(broke);
  assert.equal(e.marks, LOAN.marks);
  assert.equal(e.debt, LOAN.owed);
  assert.equal(canSpin(e), true);

  e = awardPoints(e, 100000); // 100 marks earned
  near(e.marks, LOAN.marks + 100 * (1 - LOAN.garnish));
  near(e.debt, LOAN.owed - 100 * LOAN.garnish);
  assert.equal(e.score, 100000, 'the Mint does not garnish score');

  // slot winnings are garnished too
  const before = e;
  e = applyPayout(e, payoutFor(['crown', 'crown', 'crown']));
  near(e.marks, before.marks + 400 * (1 - LOAN.garnish));
  near(e.debt, before.debt - 400 * LOAN.garnish);
  assert.equal(e.writs, 3);

  // the last payment takes only what is owed, then garnishment stops
  const nearly = { ...initEcon(), marks: 0, debt: 3 };
  const paid = awardPoints(nearly, 100000);
  assert.equal(paid.debt, 0);
  near(paid.marks, 97);
  near(awardPoints(paid, 100000).marks, 197);

  // loans stack
  assert.equal(takeLoan(takeLoan(broke)).debt, LOAN.owed * 2);
});

test('applyPayout grants writs and marks and rejects malformed payouts', () => {
  const e = applyPayout(initEcon(), payoutFor(['coin', 'coin', 'scale']));
  assert.equal(e.writs, 2);
  assert.equal(e.marks, 340);
  assert.deepEqual(applyPayout(initEcon(), payoutFor(['tide', 'tide', 'tide'])), initEcon());
  assert.throws(() => applyPayout(initEcon(), { writs: 1.5, marks: 0 }), /got 1.5/);
  assert.throws(() => applyPayout(initEcon(), null), /not a Payout/);
});

test('spendWrit takes one writ and throws on none', () => {
  assert.equal(spendWrit({ ...initEcon(), writs: 2 }).writs, 1);
  assert.throws(() => spendWrit(initEcon()), /no writ to spend/);
});

test('trust is clamped to 0..100', () => {
  assert.equal(addTrust(initEcon(), 30).trust, 30);
  assert.equal(addTrust(addTrust(initEcon(), 80), 80).trust, 100);
  assert.equal(addTrust(initEcon(), -10).trust, 0);
  assert.throws(() => addTrust(initEcon(), 'lots'), /lots/);
});

test('mutual aid: one ball per 25 trust per chapter, free of debt', () => {
  let e = initEcon();
  assert.equal(aidAvailable(e), false);
  assert.throws(() => takeAid(e), /trust 0/);
  assert.equal(aidAvailable(addTrust(e, 24)), false);
  e = addTrust(e, 60); // two aid balls
  assert.equal(aidAvailable(e), true);
  e = takeAid(e);
  assert.deepEqual([e.aidUsed, e.writs, e.debt, e.marks], [1, 1, 0, 300]);
  e = takeAid(e);
  assert.equal(e.writs, 2);
  assert.equal(aidAvailable(e), false);
  assert.throws(() => takeAid(e), /2 already drawn/);
  assert.equal(aidAvailable(addTrust(e, 15)), true, '75 trust opens a third');
  assert.equal(aidAvailable({ ...addTrust(e, 40), aidUsed: 0 }), true);
  let full = addTrust(initEcon(), 100);
  for (let i = 0; i < 4; i++) full = takeAid(full);
  assert.equal(aidAvailable(full), false, 'four at most');
});

// ───────── tuning, by seeded play ─────────
// A player plays every writ, spins whenever they can, and borrows only when they must.
// Each ball scores meanPoints * U(0.5, 1.5). doubleMarks is modelled as doubling the next ball.
// ballSave, multiball, scene rewards and mutual aid are not modelled: all four only help the player.
function career(seedN, meanPoints, spins) {
  let r = seed(seedN), e = initEcon(), loans = 0, firstLoan = null, dbl = false;
  while (e.spins < spins) {
    if (e.writs > 0) {
      const [u, r2] = next(r); r = r2;
      e = awardPoints(spendWrit(e), meanPoints * (0.5 + u), dbl ? 2 : 1);
      dbl = false;
    } else if (canSpin(e)) {
      const s = spin(r); r = s.rng;
      e = applyPayout(paySpin(e), s.result.payout);
      if (s.result.payout.boon === 'doubleMarks') dbl = true;
    } else {
      assert.ok(needsLoan(e));
      if (firstLoan === null) firstLoan = e.spins;
      e = takeLoan(e); loans++;
    }
  }
  return { e, loans, firstLoan };
}

function cohort(meanPoints, players, spins) {
  const out = [];
  for (let i = 0; i < players; i++) out.push(career(5000 + i, meanPoints, spins));
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const net = out.map((o) => o.e.marks - o.e.debt);
  return {
    drift: (net.reduce((a, b) => a + b, 0) / players - SPIN_COST * 3) / spins,
    medNet: median(net),
    medFirstLoan: median(out.map((o) => o.firstLoan ?? Infinity)),
    neverBorrowed: out.filter((o) => o.firstLoan === null).length / players,
    meanLoans: out.reduce((a, o) => a + o.loans, 0) / players,
    medDebt: median(out.map((o) => o.e.debt)),
  };
}
const show = (label, c) => console.log(
  `${label}: drift ${c.drift.toFixed(2)} marks/spin, median net worth ${Math.round(c.medNet)}, ` +
  `median first loan at spin ${c.medFirstLoan}, never borrowed ${(c.neverBorrowed * 100).toFixed(1)}%, ` +
  `mean loans ${c.meanLoans.toFixed(2)}, median debt ${Math.round(c.medDebt)}`);

test('200k spins: a 60-marks-a-ball player stays about level', () => {
  const c = cohort(60000, 400, 500);
  show('60k/ball, 400 players x 500 spins', c);
  assert.ok(Math.abs(c.drift) < 6, `net drift per spin ${c.drift}`);
  assert.ok(c.medFirstLoan >= 15, `median first loan at spin ${c.medFirstLoan}`);
  assert.equal(c.medDebt, 0, 'the median level player ends out of debt');
});

test('200k spins: a 40-marks-a-ball player drifts into debt slowly, not instantly', () => {
  const c = cohort(40000, 400, 500);
  show('40k/ball, 400 players x 500 spins', c);
  assert.ok(c.drift < -20 && c.drift > -45, `net drift per spin ${c.drift}`);
  assert.ok(c.medFirstLoan >= 5 && c.medFirstLoan <= 15, `median first loan at spin ${c.medFirstLoan}`);
  assert.ok(c.medDebt > 0);
  assert.equal(c.neverBorrowed, 0);
});

test('200k spins: an 80-marks-a-ball player gets ahead and rarely borrows', () => {
  const c = cohort(80000, 400, 500);
  show('80k/ball, 400 players x 500 spins', c);
  assert.ok(c.drift > 15, `net drift per spin ${c.drift}`);
  assert.ok(c.neverBorrowed > 0.6, `never borrowed ${c.neverBorrowed}`);
});

test('over one sitting (60 spins) the weak player owes a few loans, not a fortune', () => {
  const weak = cohort(40000, 2000, 60);
  const level = cohort(60000, 2000, 60);
  show('40k/ball, 2000 players x 60 spins', weak);
  show('60k/ball, 2000 players x 60 spins', level);
  assert.ok(weak.medDebt > LOAN.owed && weak.medDebt < LOAN.owed * 12, `median debt ${weak.medDebt}`);
  assert.ok(level.medDebt === 0);
  assert.ok(Math.abs(level.drift) < 6, `level drift ${level.drift}`);
});
