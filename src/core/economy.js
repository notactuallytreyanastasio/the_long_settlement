// The player's books: score, marks, writs, debt to the Mint, trust with the town,
// and the three lifetime totals the ending is read from.
// Pure: every function returns a new Econ.
//
// Tuning (asserted in test/economy.test.js over 200k seeded pulls per skill level, and in
// test/playthrough.test.js by a bot playing all five chapters):
//   a pull of the lever costs 150 marks and returns on average 1.44 writs and 16.5 marks.
//   1000 points is one mark, so a 95k ball is 95 marks: 1.44 * 95 + 16.5 is about 153,
//   and that player holds level. A 60k player loses about 65 marks a pull and meets the
//   Mint around the sixth. The flipper bot, which cannot aim, makes about 21k a ball: it
//   lives on what the Commons gives and the Mint lends, 1.2 loans and 1.3 gifts a chapter.

/** @typedef {import('./types.js').Econ} Econ */
/** @typedef {import('./types.js').Payout} Payout */

/** Marks for one pull of the lever. Lines that come up in play cost nothing and pay from the lean table (slot.js). */
export const SPIN_COST = 150;

/** Marks earned per point scored. A bumper is 0.1 marks, a ramp 2.5, a scene clear 25. */
export const MARKS_PER_POINT = 0.001;

/** The Mint advances 200 (one pull and a third), books 250, and takes three marks in every ten until it is repaid. */
export const LOAN = Object.freeze({ marks: 200, owed: 250, garnish: 0.3 });

/** Trust needed per mutual-aid ball, per chapter. */
export const TRUST_PER_AID = 25;

/**
 * The ledger the ending is read from (leaning, below). It leans to the commons while
 *
 *   trustEarned >= hatsRefused * TRUST_PER_LOAN + (loansTaken - hatsRefused) * TRUST_PER_FORCED_LOAN
 *
 * trustEarned has two sources. The scenes pay 50, 85, 65, 120 and 50 over the first five
 * chapters, 370 in all, and scenes cannot be skipped, so every finished game has that. The
 * rest is TRUST_PER_GIFT for each ball the Commons was allowed to give.
 *
 * A loan is one of two kinds, and the book keeps them apart (takeLoan's second argument):
 *   refused  drawn while the Commons was passing the hat (game.js, leverStatus 'credit').
 *            The player had a gift coming and took the Mint's money instead. TRUST_PER_LOAN.
 *   forced   drawn with nothing on offer: no trust in this town yet, or its aid already
 *            given. There was no choice in it. TRUST_PER_FORCED_LOAN.
 *
 * The first obvious ledger is scene trust against loans and nothing else. It counts luck:
 * over seeds 1 to 16 a bot that took every gift borrowed 0 to 16 times and a bot that took
 * none borrowed 3 to 21 times. So the choice itself went on both sides: a gift accepted is
 * trust earned, and a pull while the hat is going round is a loan.
 *
 * The second obvious ledger weighs every loan the same, 75. It counts skill. A town gives
 * at most four balls a chapter, so a weak player who waits for every one of them still
 * borrows for the rest: the mediocre playthrough bot, always waiting, took 6-10 gifts and
 * 35-79 loans over seeds 1 to 16 and leaned mint on all sixteen, the same book as the same
 * bot never waiting (47-94 loans, all but a handful of them with the hat going round). The
 * ending was not a choice for that player. What separates the two is not how many loans
 * but which kind: the waiting bots refused the hat 0 times in 32 games, the others 7 to 94.
 *
 * So a forced loan weighs 10 and a refused hat 75. Over seeds 1 to 16 of each bot, five chapters:
 *   steady, waits      0-14 forced, 5-8 gifts     closest book 140 against 1020    all commons
 *   steady, never      7-23 refused               closest 525 against 370          all mint
 *   mediocre, waits    35-79 forced, 6-10 gifts   closest 580 against 1150         all commons
 *   mediocre, never    47-94 refused              closest 3525 against 370         all mint
 * test/playthrough.test.js prints the table and holds all 64 to the side their bot chose.
 * A forced loan is not free: a player given six balls who borrows 116 times for want of a
 * choice still ends on the Mint's side. And refusing is not fatal: a gift accepted
 * outweighs a hat refused and two thirds, so somebody who waits for the hat about one time
 * in three or better, and collects what the towns have to give, ends with the commons.
 */
export const TRUST_PER_LOAN = 75;

/** What a loan taken with no gift on offer weighs against lifetime trust. See TRUST_PER_LOAN. */
export const TRUST_PER_FORCED_LOAN = 10;

/**
 * Lifetime trust earned by letting the Commons cover a ball: a gift taken outweighs a loan
 * and two thirds. It goes to trustEarned only, never to the town's meter, or aid would buy aid.
 */
export const TRUST_PER_GIFT = 130;

const FIELDS = ['score', 'marks', 'writs', 'debt', 'trust', 'aidUsed', 'spins', 'trustEarned', 'loansTaken', 'hatsRefused'];

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

/** @returns {Econ} able to afford three pulls of the lever, owning nothing else */
export function initEcon() {
  return {
    score: 0, marks: SPIN_COST * 3, writs: 0, debt: 0, trust: 0, aidUsed: 0, spins: 0,
    trustEarned: 0, loansTaken: 0, hatsRefused: 0,
  };
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

/**
 * Grants the payout's writs, marks and points. Marks are garnished like any others; points
 * go through awardPoints, so they add to the score and earn their marks at `mult`.
 * A payout with no `points` (the scripted first draw) pays none. Boons are game.js's business.
 * @param {Econ} econ @param {Payout} payout @param {number} [mult]
 */
export function applyPayout(econ, payout, mult = 1) {
  check(econ, 'applyPayout');
  if (!payout || typeof payout !== 'object') {
    throw new Error(`economy.applyPayout: not a Payout: ${JSON.stringify(payout)}`);
  }
  amount(payout.marks, 'applyPayout', 'payout.marks');
  if (!Number.isInteger(payout.writs) || payout.writs < 0) {
    throw new Error(`economy.applyPayout: payout.writs must be an integer >= 0, got ${String(payout.writs)}`);
  }
  const points = payout.points === undefined ? 0 : payout.points;
  amount(points, 'applyPayout', 'payout.points');
  const paid = earn({ ...econ, writs: econ.writs + payout.writs }, payout.marks);
  return points > 0 ? awardPoints(paid, points, mult) : paid;
}

/** No writs and cannot afford a spin. */
export function needsLoan(econ) {
  check(econ, 'needsLoan');
  return econ.writs <= 0 && econ.marks < SPIN_COST;
}

/**
 * The Mint lends to anyone, at any time, and loans stack. The advance itself is not garnished.
 * Every loan is counted in loansTaken for good: repaying the debt does not take it back.
 * refusedHat: the loan was drawn while the Commons was passing the hat. It is also counted
 * in hatsRefused, and weighs more in the ledger (TRUST_PER_LOAN against TRUST_PER_FORCED_LOAN).
 */
export function takeLoan(econ, refusedHat = false) {
  check(econ, 'takeLoan');
  if (typeof refusedHat !== 'boolean') throw new Error(`economy.takeLoan: refusedHat must be true or false, got ${JSON.stringify(refusedHat)}`);
  if (refusedHat && !aidAvailable(econ)) {
    throw new Error(`economy.takeLoan: no hat was going round to refuse (trust ${econ.trust}, ${econ.aidUsed} aid drawn this chapter)`);
  }
  return {
    ...econ, marks: econ.marks + LOAN.marks, debt: econ.debt + LOAN.owed,
    loansTaken: econ.loansTaken + 1, hatsRefused: econ.hatsRefused + (refusedHat ? 1 : 0),
  };
}

/** @param {Econ} econ */
export function spendWrit(econ) {
  check(econ, 'spendWrit');
  if (econ.writs < 1) {
    throw new Error(`economy.spendWrit: no writ to spend, econ.writs is ${econ.writs}`);
  }
  return { ...econ, writs: econ.writs - 1 };
}

/**
 * @param {Econ} econ @param {number} n may be negative; trust is clamped to 0..100.
 * A positive n is also added, whole, to the lifetime trustEarned. The whole of it and not
 * the clamped part: the meter is how much aid one town can give, the total is what was
 * done for people, and chapter 4 pays 120 against a meter that stops at 100.
 */
export function addTrust(econ, n) {
  check(econ, 'addTrust');
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`economy.addTrust: n must be a finite number, got ${String(n)}`);
  }
  return {
    ...econ,
    trust: Math.min(100, Math.max(0, econ.trust + n)),
    trustEarned: econ.trustEarned + Math.max(0, n),
  };
}

/**
 * The two pans of the scale leaning() reads, in the same unit (trust): what was done for
 * people and accepted from them, and what the loans weigh. The HUD's scale draws these.
 * @param {Econ} econ @returns {{trust:number, loans:number}}
 */
export function ledger(econ) {
  check(econ, 'ledger');
  if (econ.hatsRefused > econ.loansTaken) {
    throw new Error(`economy.ledger: ${econ.hatsRefused} hats refused but only ${econ.loansTaken} loans taken; every refusal is a loan`);
  }
  return {
    trust: econ.trustEarned,
    loans: econ.hatsRefused * TRUST_PER_LOAN + (econ.loansTaken - econ.hatsRefused) * TRUST_PER_FORCED_LOAN,
  };
}

/**
 * Which ending the ledger currently describes. A book with nothing in it leans commons:
 * nobody has been borrowed from yet. Level is commons.
 * @param {Econ} econ @returns {'commons'|'mint'}
 */
export function leaning(econ) {
  const { trust, loans } = ledger(econ);
  return trust >= loans ? 'commons' : 'mint';
}

/** One aid ball per 25 trust, per chapter (game.js zeroes aidUsed when a chapter begins). */
export function aidAvailable(econ) {
  check(econ, 'aidAvailable');
  return econ.aidUsed < Math.floor(econ.trust / TRUST_PER_AID);
}

/** The Commons gives: a writ, no debt, no interest. Being given to is entered in the lifetime trust (TRUST_PER_GIFT). */
export function takeAid(econ) {
  check(econ, 'takeAid');
  if (!aidAvailable(econ)) {
    throw new Error(
      `economy.takeAid: no aid available at trust ${econ.trust} with ${econ.aidUsed} already drawn this chapter`,
    );
  }
  return { ...econ, aidUsed: econ.aidUsed + 1, writs: econ.writs + 1, trustEarned: econ.trustEarned + TRUST_PER_GIFT };
}
