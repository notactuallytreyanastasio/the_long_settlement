import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, next } from '../src/core/rng.js';
import { spin, payoutFor } from '../src/core/slot.js';
import {
  SPIN_COST, LOAN, MARKS_PER_POINT, initEcon, awardPoints, canSpin, paySpin, applyPayout,
  needsLoan, takeLoan, spendWrit, addTrust, aidAvailable, takeAid, TRUST_PER_LOAN, TRUST_PER_GIFT, TRUST_PER_AID, leaning,
} from '../src/core/economy.js';
import { chapter1 } from '../src/content/chapter1.js';
import { chapter2 } from '../src/content/chapter2.js';
import { chapter3 } from '../src/content/chapter3.js';
import { chapter4 } from '../src/content/chapter4.js';
import { chapter5 } from '../src/content/chapter5.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`);

test('constants are sane', () => {
  assert.ok(SPIN_COST > 0);
  assert.ok(LOAN.owed > LOAN.marks, 'the Mint lends at interest');
  assert.ok(LOAN.marks >= SPIN_COST, 'a loan buys at least one spin');
  assert.ok(LOAN.garnish > 0 && LOAN.garnish < 1);
  near(60000 * MARKS_PER_POINT, 60, 'a 60k ball is 60 marks');
  assert.ok(TRUST_PER_GIFT > TRUST_PER_LOAN, 'a gift accepted outweighs a loan');
  assert.equal(TRUST_PER_AID, 25);
});

test('initEcon affords exactly three spins and nothing else', () => {
  let e = initEcon();
  assert.deepEqual(e, {
    score: 0, marks: SPIN_COST * 3, writs: 0, debt: 0, trust: 0, aidUsed: 0, spins: 0,
    trustEarned: 0, loansTaken: 0,
  });
  for (let i = 0; i < 3; i++) { assert.ok(canSpin(e)); e = paySpin(e); }
  assert.equal(canSpin(e), false);
  assert.equal(e.spins, 3);
  assert.throws(() => paySpin(e), new RegExp(`costs ${SPIN_COST} marks, econ has 0`));
});

test('awardPoints adds score and converts to marks; mult touches marks only', () => {
  const e0 = Object.freeze(initEcon());
  const e1 = awardPoints(e0, 2500);
  assert.equal(e1.score, 2500);
  near(e1.marks, e0.marks + 2.5);
  const e2 = awardPoints(e0, 2500, 2);
  assert.equal(e2.score, 2500);
  near(e2.marks, e0.marks + 5);
  near(awardPoints(e0, 100).marks, e0.marks + 0.1);
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
  e = applyPayout(e, payoutFor(['crown', 'crown', 'crown'], 'lever'));
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

test('loansTaken counts every loan and repayment does not take one back', () => {
  const broke = Object.freeze({ ...initEcon(), marks: 0 });
  let e = takeLoan(takeLoan(broke));
  assert.equal(e.loansTaken, 2);
  assert.equal(broke.loansTaken, 0, 'argument not mutated');
  e = awardPoints(e, 3000000); // 3000 marks earned: 900 garnished against 600 owed
  assert.equal(e.debt, 0);
  assert.equal(e.loansTaken, 2, 'the book remembers a loan that has been repaid');
  assert.equal(takeLoan(e).loansTaken, 3);
});

test('trustEarned takes every positive gain whole, past the clamp, and never goes down', () => {
  let e = addTrust(Object.freeze(initEcon()), 30);
  assert.deepEqual([e.trust, e.trustEarned], [30, 30]);
  e = addTrust(e, 80);
  assert.deepEqual([e.trust, e.trustEarned], [100, 110], 'the meter stops at 100, the total does not');
  e = addTrust(e, -40);
  assert.deepEqual([e.trust, e.trustEarned], [60, 110], 'losing standing does not unearn it');
  e = addTrust(e, 0);
  assert.deepEqual([e.trust, e.trustEarned], [60, 110]);
  assert.equal(takeAid(e).trustEarned, 110 + TRUST_PER_GIFT, 'drawing aid spends nothing from the total: a gift accepted adds to it');
  assert.equal(takeAid(e).trust, 60, 'and leaves the town\'s meter where it was');
});

test('leaning: commons while trustEarned >= loansTaken * TRUST_PER_LOAN, mint past it', () => {
  const book = (trustEarned, loansTaken) => leaning({ ...initEcon(), trustEarned, loansTaken });
  assert.equal(leaning(initEcon()), 'commons', 'an empty book owes nobody');
  assert.equal(book(0, 1), 'mint');
  assert.equal(book(TRUST_PER_LOAN, 1), 'commons', 'level is commons');
  assert.equal(book(TRUST_PER_LOAN - 1, 1), 'mint');
  assert.equal(book(TRUST_PER_LOAN * 3 + 1, 3), 'commons');
  assert.equal(leaning(takeLoan(addTrust(initEcon(), TRUST_PER_LOAN))), 'commons');
  assert.equal(leaning(takeLoan(takeLoan(addTrust(initEcon(), TRUST_PER_LOAN)))), 'mint');
  assert.throws(() => leaning({ ...initEcon(), loansTaken: undefined }), /econ\.loansTaken/);
  assert.throws(() => leaning({ ...initEcon(), trustEarned: 'much' }), /econ\.trustEarned must be a finite number, got much/);
});

test('the ledger against the five chapters: scene trust covers four loans, and every gift accepted covers one and more', () => {
  const chapters = [chapter1, chapter2, chapter3, chapter4, chapter5];
  const perChapter = chapters.map((ch) => ch.scenes.reduce((n, s) => n + (s.reward.trust || 0), 0));
  const total = perChapter.reduce((a, b) => a + b, 0);
  console.log(`trust on offer per chapter ${perChapter.join(', ')}; total ${total}; TRUST_PER_LOAN ${TRUST_PER_LOAN}; TRUST_PER_GIFT ${TRUST_PER_GIFT}`);
  assert.ok(perChapter.every((n) => n > 0), 'every chapter pays some trust');
  assert.equal(total, 370, 'TRUST_PER_LOAN was set against this figure');

  // Play every scene through the real reducers. In each chapter the player is out of balls
  // `empties` times after its first trust has been paid; `waits` says whether they wait for
  // the Commons (a gift while the town has one to give, otherwise a loan) or go to the Mint.
  const run = (empties, waits) => {
    let e = initEcon();
    for (const ch of chapters) {
      e = { ...e, trust: 0, aidUsed: 0 }; // what game.js does at a chapter card
      for (const s of ch.scenes) e = addTrust(e, s.reward.trust || 0);
      for (let i = 0; i < empties; i++) e = waits && aidAvailable(e) ? takeAid(e) : takeLoan(e);
    }
    return e;
  };
  const none = run(0, true);
  assert.equal(none.trustEarned, total, 'nothing is lost to the 0..100 clamp');
  assert.equal(leaning(none), 'commons');

  // a book with no gifts in it turns on one loan
  const turn = Math.floor(total / TRUST_PER_LOAN);
  assert.equal(turn, 4);
  assert.equal(leaning({ ...initEcon(), trustEarned: total, loansTaken: turn }), 'commons');
  assert.equal(leaning({ ...initEcon(), trustEarned: total, loansTaken: turn + 1 }), 'mint');

  // the same number of empty tables, answered the two ways
  for (const empties of [1, 2, 3, 4, 6]) {
    const waited = run(empties, true), refused = run(empties, false);
    console.log(`${empties} empty tables a chapter: waiting ${waited.trustEarned} trust against ${waited.loansTaken} loans -> ${leaning(waited)}; `
      + `not waiting ${refused.trustEarned} against ${refused.loansTaken} -> ${leaning(refused)}`);
    assert.equal(refused.trustEarned, total);
    assert.equal(refused.loansTaken, empties * chapters.length);
    assert.equal(leaning(refused), 'mint', `refusing the Commons ${empties} times a chapter`);
    assert.ok(waited.trustEarned - waited.loansTaken * TRUST_PER_LOAN > refused.trustEarned - refused.loansTaken * TRUST_PER_LOAN);
  }
  for (const empties of [1, 2, 3, 4]) assert.equal(leaning(run(empties, true)), 'commons', `waiting for the Commons ${empties} times a chapter`);
  // the Commons has only so much to give: a player who is out of balls far more often than
  // the town can cover ends in the Mint's book however patiently they waited
  assert.equal(leaning(run(12, true)), 'mint');
});

test('applyPayout grants writs and marks and rejects malformed payouts', () => {
  const m0 = initEcon().marks;
  const e = applyPayout(initEcon(), payoutFor(['coin', 'coin', 'scale'], 'lever'));
  assert.equal(e.writs, 2);
  assert.equal(e.marks, m0 + 40);
  assert.equal(e.score, 0);
  assert.deepEqual(applyPayout(initEcon(), payoutFor(['tide', 'tide', 'tide'], 'lever')), initEcon());
  assert.deepEqual(applyPayout(initEcon(), payoutFor(['tide', 'tide', 'tide'], 'lanes')), initEcon());

  // a line earned in play pays points too: score, and their marks at the multiplier given
  const lean = payoutFor(['coin', 'coin', 'scale'], 'lanes');
  assert.deepEqual([lean.writs, lean.marks, lean.points], [0, 12, 2000]);
  const p1 = applyPayout(initEcon(), lean);
  assert.deepEqual([p1.writs, p1.score], [0, 2000]);
  near(p1.marks, m0 + 12 + 2);
  near(applyPayout(initEcon(), lean, 2).marks, m0 + 12 + 4);
  // and all of it is garnished while debt stands
  const owing = applyPayout(takeLoan(initEcon()), lean);
  near(owing.debt, LOAN.owed - 14 * LOAN.garnish);
  // a payout written by hand without points (the scripted first draw) pays none
  assert.equal(applyPayout(initEcon(), { writs: 3, marks: 0, boon: null, name: 'x', blurb: 'x' }).score, 0);
  assert.throws(() => applyPayout(initEcon(), { writs: 1, marks: 0, points: -1 }), /payout\.points must be a finite number >= 0, got -1/);
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
  assert.deepEqual([e.aidUsed, e.writs, e.debt, e.marks], [1, 1, 0, SPIN_COST * 3]);
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
// A player plays every writ, pulls the lever whenever they can, and borrows only when they must.
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
      const s = spin(r, 'lever'); r = s.rng;
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

test('200k pulls: a 95-marks-a-ball player stays about level', () => {
  const c = cohort(95000, 400, 500);
  show('95k/ball, 400 players x 500 pulls', c);
  assert.ok(Math.abs(c.drift) < 6, `net drift per pull ${c.drift}`);
  assert.ok(c.medFirstLoan >= 10, `median first loan at pull ${c.medFirstLoan}`);
  assert.equal(c.medDebt, 0, 'the median level player ends out of debt');
});

test('200k pulls: a 60-marks-a-ball player drifts into debt, not instantly', () => {
  const c = cohort(60000, 400, 500);
  show('60k/ball, 400 players x 500 pulls', c);
  assert.ok(c.drift < -45 && c.drift > -85, `net drift per pull ${c.drift}`);
  assert.ok(c.medFirstLoan >= 4 && c.medFirstLoan <= 12, `median first loan at pull ${c.medFirstLoan}`);
  assert.ok(c.medDebt > 0);
  assert.equal(c.neverBorrowed, 0);
});

test('200k pulls: a 120-marks-a-ball player gets ahead and rarely borrows', () => {
  const c = cohort(120000, 400, 500);
  show('120k/ball, 400 players x 500 pulls', c);
  assert.ok(c.drift > 15, `net drift per pull ${c.drift}`);
  assert.ok(c.neverBorrowed > 0.6, `never borrowed ${c.neverBorrowed}`);
});

test('over one game (25 pulls) the bot-grade player owes a dozen loans if nobody gives it anything', () => {
  // 21k a ball is what the playthrough bot scores. This model has no mutual aid, no ball
  // saves and no lines paid in play, so it is the ceiling on what such a player borrows;
  // the playthrough, which has all three, measures 6 loans for the bot that takes aid.
  const bot = cohort(21000, 2000, 25);
  const level = cohort(95000, 2000, 60);
  show('21k/ball, 2000 players x 25 pulls', bot);
  show('95k/ball, 2000 players x 60 pulls', level);
  assert.ok(bot.meanLoans > 8 && bot.meanLoans < 18, `mean loans ${bot.meanLoans}`);
  assert.ok(bot.medDebt > LOAN.owed * 6 && bot.medDebt < LOAN.owed * 18, `median debt ${bot.medDebt}`);
  assert.ok(level.medDebt === 0);
  assert.ok(Math.abs(level.drift) < 6, `level drift ${level.drift}`);
});
