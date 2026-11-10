// The Reels of Assay: the three-reel drawing machine in every Mint hall.
// Pure: a spin is three stops drawn from an explicit Rng.
//
// Reading the paytable (order of the reels never matters):
//   three of a kind   the named lots below
//   a pair            pays by the paired symbol, whatever the third reel shows
//   no pair           one common writ, unless the Churn (a tide) is on the reels, which voids the draw
//   tides             a pair of tides pays nothing; three is the bust

import { nextInt } from './rng.js';

/** @typedef {import('./types.js').Sym} Sym */
/** @typedef {import('./types.js').Payout} Payout */

/** @type {Sym[]} */
export const SYMBOLS = ['coin', 'scale', 'gavel', 'crown', 'tide', 'orb'];

const C = 'coin', S = 'scale', G = 'gavel', K = 'crown', T = 'tide', O = 'orb';

// 24 stops a reel. Each reel carries 7 coin, 6 scale, 4 gavel, 2 crown, 2 orb, 3 tide,
// in a different order so the three windows never scroll in step.
/** @type {[Sym[], Sym[], Sym[]]} */
export const REEL_STRIPS = [
  [C, S, T, C, G, S, K, C, O, S, C, G, T, S, C, K, G, S, C, O, T, C, G, S],
  [S, C, G, C, O, S, C, T, K, S, C, G, S, O, C, T, S, G, C, K, S, T, C, G],
  [C, K, S, C, T, G, S, C, O, C, S, G, K, C, S, T, O, S, G, C, T, S, C, G],
];

// Names and blurbs are in-world (story/BIBLE.md). The orb is the Lot, the drawing that
// makes a Tribune. The coin is the mark, "payable in calm". The scale is the Benches,
// the gavel their injunction, the crown the Mint. The tide is the Churn: two are a lane
// closing, three are a light going out.
// Three orbs must be named exactly 'The Lot Falls': chapter 1's rigged spin shows that name.

/** @type {Record<Sym, Payout>} */
const THREE = {
  coin: {
    writs: 3, marks: 150, boon: 'doubleMarks',
    name: 'Three Coins: Payable in Calm',
    blurb: 'Every mark is a claim on stillsalt, and tonight the Mint honours yours at twice its face.',
  },
  scale: {
    writs: 4, marks: 30, boon: null,
    name: 'Three Scales: The Full Bench',
    blurb: 'All three magistrates sit, poor and proud and slow, and every one of them finds for you.',
  },
  gavel: {
    writs: 3, marks: 0, boon: 'ballSave',
    name: 'Three Gavels: Injunction',
    blurb: 'By order of the Benches nothing may be taken from you until the matter is heard.',
  },
  crown: {
    writs: 3, marks: 400, boon: null,
    name: "Three Crowns: The Mint's Favour",
    blurb: 'The Mint is open-handed tonight, and it enters in a careful hand everyone it has favoured.',
  },
  orb: {
    writs: 3, marks: 150, boon: 'multiball',
    name: 'The Lot Falls',
    blurb: 'Three orbs on the line, and out of every name in the drum the lot has fallen to you.',
  },
  tide: {
    writs: 0, marks: 0, boon: null,
    name: 'The Churn Thrice: A Light Goes Out',
    blurb: 'The salt ration is stopped, the lamp gutters, and within the week no lane reaches you.',
  },
};

/** @type {Record<Sym, Payout>} */
const PAIR = {
  coin: {
    writs: 2, marks: 40, boon: null,
    name: "Two Coins: A Day's Wages",
    blurb: 'Two writs and a few marks, which is all most of Aurelle has ever asked of the Reels.',
  },
  scale: {
    writs: 3, marks: 20, boon: null,
    name: 'Two Scales: Leave to Proceed',
    blurb: 'The Benches can find no lawful way to refuse your petition, and award you costs.',
  },
  gavel: {
    writs: 2, marks: 0, boon: 'ballSave',
    name: 'Two Gavels: A Stay',
    blurb: 'A clerk stamps the stay, and for a little while the law stands between you and the dark.',
  },
  crown: {
    writs: 2, marks: 100, boon: null,
    name: "Two Crowns: The Chancellor's Advance",
    blurb: 'The Chancellor is pleased to advance you marks, and too courteous to say against what.',
  },
  orb: {
    writs: 3, marks: 0, boon: null,
    name: 'Two Orbs: One Stop Short',
    blurb: 'The Reels come within one stop of your name, and the hall allots three writs to steady you.',
  },
  tide: {
    writs: 0, marks: 0, boon: null,
    name: 'The Churn Twice: A Lane Closes',
    blurb: 'Two lights no longer overlap, and nothing crosses the water between them, not post and not you.',
  },
};

/** @type {Payout} */
const MIXED = {
  writs: 1, marks: 0, boon: null,
  name: 'Mixed Lot: A Common Writ',
  blurb: 'The Reels agree on nothing, and under the Settlement that is still enough to license one act.',
};

/** @type {Payout} */
const VOID = {
  writs: 0, marks: 0, boon: null,
  name: 'The Churn on the Reels: Void Draw',
  blurb: 'Weather has got in among the lots, and the clerk tears up your slip without a word.',
};

/** Every payout the machine can make, for the renderer's paytable card. */
export const PAYTABLE = [
  ...SYMBOLS.map((sym) => ({ kind: 'three', sym, payout: THREE[sym] })),
  ...SYMBOLS.map((sym) => ({ kind: 'pair', sym, payout: PAIR[sym] })),
  { kind: 'mixed', sym: null, payout: MIXED },
  { kind: 'void', sym: null, payout: VOID },
];

/** @param {[Sym, Sym, Sym]} reels @returns {Payout} */
export function payoutFor(reels) {
  if (!Array.isArray(reels) || reels.length !== 3) {
    throw new Error(`slot.payoutFor: expected three reels, got ${JSON.stringify(reels)}`);
  }
  for (const sym of reels) {
    if (!SYMBOLS.includes(sym)) {
      throw new Error(`slot.payoutFor: unknown symbol ${JSON.stringify(sym)} in ${JSON.stringify(reels)}`);
    }
  }
  const [a, b, c] = reels;
  let p;
  if (a === b && b === c) p = THREE[a];
  else if (a === b || a === c) p = PAIR[a];
  else if (b === c) p = PAIR[b];
  else if (reels.includes('tide')) p = VOID;
  else p = MIXED;
  return { ...p };
}

/** @param {import('./types.js').Rng} rng */
export function spin(rng) {
  let r = rng;
  const reels = /** @type {[Sym, Sym, Sym]} */ ([]);
  for (const strip of REEL_STRIPS) {
    const [i, r2] = nextInt(r, strip.length);
    r = r2;
    reels.push(strip[i]);
  }
  return { rng: r, result: { reels, payout: payoutFor(reels) } };
}
