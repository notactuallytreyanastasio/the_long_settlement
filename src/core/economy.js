// The player's books: score, marks, writs, debt to the Mint, trust with the town.
// Pure: every function returns a new Econ.
//
// Tuning (asserted in test/economy.test.js over 200k seeded spins per skill level):
//   a spin costs 100 marks and returns on average 1.44 writs and 16.5 marks.
//   1000 points is one mark, so a 60k ball is 60 marks: 1.44 * 60 + 16.5, plus a little
//   from doubled marks, is about 104 before interest, and that player holds level.
//   A 40k player loses about 34 marks a spin and meets the Mint around the seventh spin.

/** @typedef {import('./types.js').Econ} Econ */
/** @typedef {import('./types.js').Payout} Payout */

export const SPIN_COST = 100;

/** Marks earned per point scored. A bumper is 0.1 marks, a ramp 2.5, a scene clear 25. */
export const MARKS_PER_POINT = 0.001;

/** The Mint advances 250, books 300, and takes three marks in every ten until it is repaid. */
export const LOAN = Object.freeze({ marks: 250, owed: 300, garnish: 0.3 });

/** Trust needed per mutual-aid ball, per chapter. */
export const TRUST_PER_AID = 25;

const FIELDS = ['score', 'marks', 'writs', 'debt', 'trust', 'aidUsed', 'spins'];

function check(econ, fn) {
  if (!econ || typeof econ !== 'object') {
    throw new Error(`economy.${fn}: not an Econ: ${JSON.stringify(econ)}`);
  }
  for (const f of FIELDS) {
    if (typeof econ[f] !== 'number' || !Number.isFinite(econ[f])) {
      throw new Error(`economy.${fn}: econ.${f} must be a finite number, got ${String(econ[f])}`);
    }
  }
}

function amount(n, fn, what) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new Error(`economy.${fn}: ${what} must be a finite number >= 0, got ${String(n)}`);
  }
}

// Every mark earned passes through here: the Mint takes its share first while debt stands.
function earn(econ, marks) {
  if (econ.debt <= 0 || marks <= 0) return { ...econ, marks: econ.marks + marks };
  const taken = Math.min(econ.debt, marks * LOAN.garnish);
  return { ...econ, marks: econ.marks + marks - taken, debt: econ.debt - taken };
}

/** @returns {Econ} able to afford three spins, owning nothing else */
export function initEcon() {
  return { score: 0, marks: SPIN_COST * 3, writs: 0, debt: 0, trust: 0, aidUsed: 0, spins: 0 };
}

/**
 * Adds `points` to score and converts them to marks. `mult` multiplies the marks only
 * (it is the doubleMarks boon), never the score.
 * @param {Econ} econ @param {number} points @param {number} [mult]
 */
export function awardPoints(econ, points, mult = 1) {
  check(econ, 'awardPoints');
  amount(points, 'awardPoints', 'points');
  amount(mult, 'awardPoints', 'mult');
  return earn({ ...econ, score: econ.score + points }, points * MARKS_PER_POINT * mult);
}

/** @param {Econ} econ */
export function canSpin(econ) {
  check(econ, 'canSpin');
  return econ.marks >= SPIN_COST;
}

/** @param {Econ} econ */
export function paySpin(econ) {
  check(econ, 'paySpin');
  if (econ.marks < SPIN_COST) {
    throw new Error(`economy.paySpin: a spin costs ${SPIN_COST} marks, econ has ${econ.marks}`);
  }
  return { ...econ, marks: econ.marks - SPIN_COST, spins: econ.spins + 1 };
}

/** Grants the payout's writs and marks (marks are garnished like any others). Boons are game.js's business. */
export function applyPayout(econ, payout) {
  check(econ, 'applyPayout');
  if (!payout || typeof payout !== 'object') {
    throw new Error(`economy.applyPayout: not a Payout: ${JSON.stringify(payout)}`);
  }
  amount(payout.marks, 'applyPayout', 'payout.marks');
  if (!Number.isInteger(payout.writs) || payout.writs < 0) {
    throw new Error(`economy.applyPayout: payout.writs must be an integer >= 0, got ${String(payout.writs)}`);
  }
  return earn({ ...econ, writs: econ.writs + payout.writs }, payout.marks);
}

/** No writs and cannot afford a spin. */
export function needsLoan(econ) {
  check(econ, 'needsLoan');
  return econ.writs <= 0 && econ.marks < SPIN_COST;
}

/** The Mint lends to anyone, at any time, and loans stack. The advance itself is not garnished. */
export function takeLoan(econ) {
  check(econ, 'takeLoan');
  return { ...econ, marks: econ.marks + LOAN.marks, debt: econ.debt + LOAN.owed };
}

/** @param {Econ} econ */
export function spendWrit(econ) {
  check(econ, 'spendWrit');
  if (econ.writs < 1) {
    throw new Error(`economy.spendWrit: no writ to spend, econ.writs is ${econ.writs}`);
  }
  return { ...econ, writs: econ.writs - 1 };
}

/** @param {Econ} econ @param {number} n may be negative; result is clamped to 0..100 */
export function addTrust(econ, n) {
  check(econ, 'addTrust');
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`economy.addTrust: n must be a finite number, got ${String(n)}`);
  }
  return { ...econ, trust: Math.min(100, Math.max(0, econ.trust + n)) };
}

/** One aid ball per 25 trust, per chapter (game.js zeroes aidUsed when a chapter begins). */
export function aidAvailable(econ) {
  check(econ, 'aidAvailable');
  return econ.aidUsed < Math.floor(econ.trust / TRUST_PER_AID);
}

/** The Commons gives: a writ, no debt, no interest. */
export function takeAid(econ) {
  check(econ, 'takeAid');
  if (!aidAvailable(econ)) {
    throw new Error(
      `economy.takeAid: no aid available at trust ${econ.trust} with ${econ.aidUsed} already drawn this chapter`,
    );
  }
  return { ...econ, aidUsed: econ.aidUsed + 1, writs: econ.writs + 1 };
}
