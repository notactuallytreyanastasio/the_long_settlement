// The Reels of Assay: the three-reel drawing machine in every Mint hall, and now set
// into the head of every table. Pure: a draw is a stop taken from an explicit Rng.
//
// The same line pays from one of two tables, by how the reels came to show it:
//   'lever'           the player paid SPIN_COST marks for the draw. The hall's table: writs.
//   'lanes', 'shot'   the line was earned in play (filled reel by reel through the top lanes,
//                     or spun by a lit shot). The lean table: marks, points and boons, with
//                     writs only for three of a kind and for a pair of crowns or orbs.
// The obvious version is one table for both. It is wrong because a line comes up in play
// about once a minute for nothing: at the hall's 1.44 writs a line nobody would ever pull
// the lever, owe the Mint or need the Commons.
//
// Reading either table (order of the reels never matters):
//   three of a kind   the named lots below
//   a pair            pays by the paired symbol, whatever the third reel shows
//   no pair           the mixed lot, unless the Churn (a tide) is on the reels, which voids the draw
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

/** How a line can come to be on the reels. */
export const SOURCES = ['lever', 'lanes', 'shot'];

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

// ───────────────────────── the lean table: lines earned in play ─────────────────────────
// Different names from the hall's, because the name is what the toast says and the same
// words must not pay two different things. Pays are tuned in test/playthrough.test.js.

/** @type {Record<Sym, Payout>} */
const PLAY_THREE = {
  coin: {
    writs: 1, marks: 60, points: 5000, boon: 'doubleMarks',
    name: 'Three Coins: Honest Weight',
    blurb: 'Three true coins in a row, and for a while every mark you earn is counted twice.',
  },
  scale: {
    writs: 1, marks: 30, points: 5000, boon: 'kickback',
    name: 'Three Scales: The Bench Rises',
    blurb: 'The whole Bench stands for you, and the next thing the tide takes it will have to give back.',
  },
  gavel: {
    writs: 1, marks: 0, points: 5000, boon: 'ballSave',
    name: 'Three Gavels: Order in the Street',
    blurb: 'Three knocks carry down the street, and for a little while nothing of yours can be lost.',
  },
  crown: {
    writs: 2, marks: 150, points: 10000, boon: null,
    name: 'Three Crowns: The Mint Pays Out',
    blurb: 'The Mint pays on a line it never sold you, and the steward counts it out twice to be sure.',
  },
  orb: {
    writs: 2, marks: 50, points: 10000, boon: 'multiball',
    name: 'Three Orbs: Every Name at Once',
    blurb: 'The drum spills, and for one turn of the glass every name in it is yours to play.',
  },
  tide: {
    writs: 0, marks: 0, points: 0, boon: null,
    name: 'Three Tides: Dark Water',
    blurb: 'All three reels show the Churn, and the street goes quiet until it has passed.',
  },
};

/** @type {Record<Sym, Payout>} */
const PLAY_PAIR = {
  coin: {
    writs: 0, marks: 12, points: 2000, boon: null,
    name: 'Two Coins: Small Change',
    blurb: 'A few marks found in the street, which nobody has garnished yet.',
  },
  scale: {
    writs: 0, marks: 5, points: 1000, boon: 'kickback',
    name: 'Two Scales: A Fair Hearing',
    blurb: 'Two magistrates agree that the next ball the outlane takes was taken unlawfully.',
  },
  gavel: {
    writs: 0, marks: 0, points: 1000, boon: 'ballSave',
    name: 'Two Gavels: Held Over',
    blurb: 'The matter is held over, and until the glass runs out nothing you lose stays lost.',
  },
  crown: {
    writs: 1, marks: 60, points: 3000, boon: null,
    name: 'Two Crowns: A Clerical Error',
    blurb: 'A Mint clerk finds a writ and sixty marks in your column and cannot account for either.',
  },
  orb: {
    writs: 1, marks: 0, points: 3000, boon: null,
    name: 'Two Orbs: A Second Name',
    blurb: 'A second slip with your name on it turns up in the drum, good for one more act.',
  },
  tide: {
    writs: 0, marks: 0, points: 0, boon: null,
    name: 'Two Tides: Slack Water',
    blurb: 'Two reels show the Churn, and the third makes no difference to anybody.',
  },
};

/** @type {Payout} */
const PLAY_MIXED = {
  writs: 0, marks: 4, points: 1000, boon: null,
  name: 'Mixed Lot: Pocket Money',
  blurb: 'The reels agree on nothing, and the street pays you four marks for the show.',
};

/** @type {Payout} */
const PLAY_VOID = {
  writs: 0, marks: 0, points: 0, boon: null,
  name: 'The Churn in the Street: No Draw',
  blurb: 'Weather on the line, and nothing is paid to anybody on either side of the water.',
};

const TABLES = {
  lever: { three: THREE, pair: PAIR, mixed: MIXED, void: VOID },
  lanes: { three: PLAY_THREE, pair: PLAY_PAIR, mixed: PLAY_MIXED, void: PLAY_VOID },
  shot: { three: PLAY_THREE, pair: PLAY_PAIR, mixed: PLAY_MIXED, void: PLAY_VOID },
};

const listing = (t) => [
  ...SYMBOLS.map((sym) => ({ kind: 'three', sym, payout: t.three[sym] })),
  ...SYMBOLS.map((sym) => ({ kind: 'pair', sym, payout: t.pair[sym] })),
  { kind: 'mixed', sym: null, payout: t.mixed },
  { kind: 'void', sym: null, payout: t.void },
];

/** Every payout the lever can make, for the renderer's paytable card. */
export const PAYTABLE = listing(TABLES.lever);
/** Every payout a line earned in play can make. */
export const PLAY_PAYTABLE = listing(TABLES.lanes);

/**
 * @param {[Sym, Sym, Sym]} reels
 * @param {'lever'|'lanes'|'shot'} source  how the line came up; there is no default
 * @returns {Payout}  always with a numeric `points`
 */
export function payoutFor(reels, source) {
  if (!Array.isArray(reels) || reels.length !== 3) {
    throw new Error(`slot.payoutFor: expected three reels, got ${JSON.stringify(reels)}`);
  }
  for (const sym of reels) {
    if (!SYMBOLS.includes(sym)) {
      throw new Error(`slot.payoutFor: unknown symbol ${JSON.stringify(sym)} in ${JSON.stringify(reels)}`);
    }
  }
  if (!SOURCES.includes(source)) {
    throw new Error(`slot.payoutFor: unknown source ${JSON.stringify(source)} (want one of ${SOURCES.join(', ')})`);
  }
  const t = TABLES[source];
  const [a, b, c] = reels;
  let p;
  if (a === b && b === c) p = t.three[a];
  else if (a === b || a === c) p = t.pair[a];
  else if (b === c) p = t.pair[b];
  else if (reels.includes('tide')) p = t.void;
  else p = t.mixed;
  return { points: 0, ...p };
}

/** One stop of reel `i` (0, 1 or 2), drawn from its own strip. */
export function drawSym(rng, i) {
  const strip = REEL_STRIPS[i];
  if (!strip) throw new Error(`slot.drawSym: no reel ${JSON.stringify(i)}`);
  const [k, r] = nextInt(rng, strip.length);
  return { rng: r, sym: strip[k] };
}

/** All three reels at once. @param {import('./types.js').Rng} rng @param {'lever'|'lanes'|'shot'} source */
export function spin(rng, source) {
  let r = rng;
  const reels = /** @type {[Sym, Sym, Sym]} */ ([]);
  for (let i = 0; i < REEL_STRIPS.length; i++) {
    const d = drawSym(r, i);
    r = d.rng;
    reels.push(d.sym);
  }
  return { rng: r, result: { reels, payout: payoutFor(reels, source) } };
}
