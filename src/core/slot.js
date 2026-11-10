// The Reels of Assay: the three-reel drawing machine in every Mint hall.
// Pure: a spin is three stops drawn from an explicit Rng.
//
// Reading the paytable (order of the reels never matters):
//   three of a kind   the named lots below
//   a pair            pays by the paired symbol, whatever the third reel shows
//   no pair           one common writ, unless the Undertow is on the reels, which voids the draw
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

/** @type {Record<Sym, Payout>} */
const THREE = {
  coin: {
    writs: 3, marks: 150, boon: 'doubleMarks',
    name: 'Three Coins: Payable in Stillness',
    blurb: 'Every note promises calm to its bearer, and for a little while tonight the promise is kept twice over.',
  },
  scale: {
    writs: 4, marks: 30, boon: null,
    name: 'Three Scales: The Full Bench',
    blurb: 'Three magistrates sit, poor and proud and slow, and for once every one of them finds for you.',
  },
  gavel: {
    writs: 3, marks: 0, boon: 'ballSave',
    name: 'Three Gavels: Injunction',
    blurb: 'By order of the Benches nothing may be taken from you until the matter has been heard.',
  },
  crown: {
    writs: 3, marks: 400, boon: null,
    name: "Three Crowns: The Mint's Favour",
    blurb: 'The Mint is generous tonight, and the Mint keeps a careful record of everyone it has been generous to.',
  },
  orb: {
    writs: 3, marks: 150, boon: 'multiball',
    name: "Three Orbs: The Bearer's Lot",
    blurb: 'The drum turns and one name comes up out of all the names there are.',
  },
  tide: {
    writs: 0, marks: 0, boon: null,
    name: 'Three Tides: Foreclosed',
    blurb: 'The sea went out, and no one in the hall can now say who was standing at the reels.',
  },
};

/** @type {Record<Sym, Payout>} */
const PAIR = {
  coin: {
    writs: 2, marks: 40, boon: null,
    name: "Two Coins: A Day's Wages",
    blurb: 'Two writs and a little money, which is all most of Aurelle has ever asked of the reels.',
  },
  scale: {
    writs: 3, marks: 20, boon: null,
    name: 'Two Scales: Leave to Proceed',
    blurb: 'The Benches have read your petition, can find no lawful way to refuse it, and award you costs.',
  },
  gavel: {
    writs: 2, marks: 0, boon: 'ballSave',
    name: 'Two Gavels: Interim Order',
    blurb: 'A clerk stamps a stay, and for a short while the law stands between you and the water.',
  },
  crown: {
    writs: 2, marks: 100, boon: null,
    name: "Two Crowns: The Chancellor's Advance",
    blurb: 'The Mint presses marks into your hand and does not mention, tonight, what it will want for them.',
  },
  orb: {
    writs: 3, marks: 0, boon: null,
    name: "Two Orbs: Pilgrim's Passage",
    blurb: 'Whoever walks beside a Bearer is licensed to carry steel, by a law older than the Mint.',
  },
  tide: {
    writs: 0, marks: 0, boon: null,
    name: 'Two Tides: In Arrears',
    blurb: 'The water stands a little lower on the harbour wall than it did this morning.',
  },
};

/** @type {Payout} */
const MIXED = {
  writs: 1, marks: 0, boon: null,
  name: 'Mixed Lot: A Common Writ',
  blurb: 'The reels agree on nothing, and by ancient law that is still enough to license one act.',
};

/** @type {Payout} */
const VOID = {
  writs: 0, marks: 0, boon: null,
  name: 'Tide on the Reels: Void Draw',
  blurb: 'The Undertow shows its face among the lots, and the clerk tears up the slip without a word.',
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
