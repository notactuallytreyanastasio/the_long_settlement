// The cast of The Long Settlement. Pure data.
//
// `say` lists macOS voice names in preference order. The premium and enhanced
// voices come first so a machine that has them downloaded gets them; the
// names after those are the compact voices that ship with every Mac, chosen
// so that on a stock install every speaker still resolves to a DIFFERENT
// voice (tools/render-voices.mjs takes the first one that is installed).
// The newer natural voices go to the people who talk most; the smaller parts
// take the Eloquence voices, which are synthetic but unmistakable. No name
// appears in two members' lists, so no two speakers can ever share a voice.
//
// Ansel and Wyn were cast by measurement, not by name. Median pitch of one
// sentence at 160 wpm, from `say` on a stock install: Sandy (UK) 267 Hz,
// Sandy (US) 262, Flo 242, Junior and Kathy 213, Samantha 180. Sandy is the
// highest natural voice there is, so the twelve-year-old gets it. The only
// elderly voices are Grandma and Grandpa; Nan has Grandma (UK), so her sister
// has Grandma (US): the same family of voice, a different accent, and a
// quicker rate.
//
// `rate` is words per minute for `say`; `pitch` (0..2) is only used by the
// in-browser speechSynthesis fallback when a line has no rendered file.
//
// `look` is what the cinema renderer paints from. Colours are css hex.
// hairStyle is one of: cropped, short, tied, long, braid, bun, wild, bald, hood.

/** @type {Object<string, import('../core/types.js').CastMember>} */
export const cast = {
  narrator: {
    id: 'narrator',
    name: 'The Ledger',
    role: 'An account kept by someone who loved them',
    color: '#c9b78a',
    say: ['Moira (Enhanced)', 'Fiona (Enhanced)', 'Moira'],
    rate: 148,
    pitch: 0.8,
    look: {
      skin: '#b98a66', hair: '#8d8d93', hairStyle: 'hood',
      coat: '#3a3226', trim: '#c9b78a', build: 'slim', age: 'old',
      mark: 'ink-stained fingers; face kept in the shadow of a hood',
    },
  },

  ren: {
    id: 'ren',
    name: 'Ren Vasker',
    role: 'Halcyon cadet, Surety to the Tribune',
    color: '#6fa8dc',
    say: ['Evan (Enhanced)', 'Nathan (Enhanced)', 'Aman', 'Eddy (English (US))'],
    rate: 166,
    pitch: 0.95,
    look: {
      skin: '#c8956c', hair: '#1c1f2b', hairStyle: 'cropped',
      coat: '#2c4a6e', trim: '#b8c4d0', build: 'slim', age: 'young',
      mark: 'grey cadet coat buttoned to the throat; a thin scar through the left eyebrow; an earpiece wire behind the right ear',
    },
  },

  ilse: {
    id: 'ilse',
    name: 'Ilse Maravel',
    role: "Magistrate's clerk, Tribune of the Lot",
    color: '#f2c14e',
    say: ['Zoe (Premium)', 'Ava (Premium)', 'Samantha (Enhanced)', 'Samantha', 'Flo (English (US))'],
    rate: 186,
    pitch: 1.25,
    look: {
      skin: '#e8c4a0', hair: '#a8532a', hairStyle: 'braid',
      coat: '#e9e2cf', trim: '#f2c14e', build: 'small', age: 'young',
      mark: 'copper braid over one shoulder with a pen pushed through it; ink on the cuff; freckles',
    },
  },

  thorne: {
    id: 'thorne',
    name: 'Proctor Thorne',
    role: 'Halcyon Academy, on the Line',
    color: '#9fb4a8',
    say: ['Serena (Premium)', 'Kate (Enhanced)', 'Karen (Premium)', 'Karen', 'Shelley (English (UK))'],
    rate: 172,
    pitch: 0.9,
    look: {
      skin: '#d9b99b', hair: '#b9bcc2', hairStyle: 'bun',
      coat: '#1f2a2a', trim: '#9fb4a8', build: 'slim', age: 'mid',
      mark: 'steel-grey hair pinned flat; high black collar; half-moon spectacles; one grey glove always on',
    },
  },

  corvane: {
    id: 'corvane',
    name: 'Chancellor Corvane',
    role: 'The Mint of Aurelle',
    color: '#d4a84a',
    say: ['Oliver (Enhanced)', 'Daniel (Enhanced)', 'Daniel'],
    rate: 142,
    pitch: 0.7,
    look: {
      skin: '#e3c6ab', hair: '#f1eee6', hairStyle: 'long',
      coat: '#4a1620', trim: '#d4a84a', build: 'broad', age: 'old',
      mark: 'white hair swept back to the collar; oxblood robe with a gold chain of office; heavy-lidded, always half smiling',
    },
  },

  tobb: {
    id: 'tobb',
    name: 'Tobb Quill',
    role: 'Bookmaker, struck-off actuary',
    color: '#e07a3f',
    say: ['Tom (Enhanced)', 'Rishi (Enhanced)', 'Rishi', 'Eddy (English (UK))'],
    rate: 204,
    pitch: 1.05,
    look: {
      skin: '#8a5a3c', hair: '#2a1a12', hairStyle: 'wild',
      coat: '#5c6b2f', trim: '#e07a3f', build: 'slim', age: 'mid',
      mark: 'green checked waistcoat; a stub of chalk behind one ear; round wire spectacles mended with thread',
    },
  },

  maravel: {
    id: 'maravel',
    name: 'Magistrate Maravel',
    role: 'The Benches, Vessery',
    color: '#a99bc4',
    say: ['Lee (Premium)', 'Grandpa (English (UK))', 'Grandpa (English (US))', 'Ralph'],
    rate: 146,
    pitch: 0.75,
    look: {
      skin: '#e0c2a6', hair: '#9a9aa0', hairStyle: 'short',
      coat: '#1b1b22', trim: '#a99bc4', build: 'slim', age: 'old',
      mark: 'black bench robe worn shiny at the elbows; white bands at the throat; grey beard cut square; stooped',
    },
  },

  sable: {
    id: 'sable',
    name: 'Sable Vasker',
    role: 'Assessor, the Audit',
    color: '#c0c6d6',
    say: ['Jamie (Premium)', 'Reed (English (UK))', 'Reed (English (US))'],
    rate: 160,
    pitch: 0.9,
    look: {
      skin: '#f0dcc8', hair: '#d8d2c0', hairStyle: 'tied',
      coat: '#0f1116', trim: '#c0c6d6', build: 'slim', age: 'young',
      mark: 'pale hair tied at the nape; long black Audit coat with a silver ledger-pin; grey gloves; never quite meets the eye',
    },
  },

  hesper: {
    id: 'hesper',
    name: 'Hesper Dunmore',
    role: 'Shift-captain, Saltmere Commons',
    color: '#7fb5b0',
    say: ['Tessa (Enhanced)', 'Matilda (Premium)', 'Tessa'],
    rate: 164,
    pitch: 0.8,
    look: {
      skin: '#7a4e36', hair: '#2b2622', hairStyle: 'short',
      coat: '#4d4a42', trim: '#7fb5b0', build: 'broad', age: 'mid',
      mark: 'salt-white dust in the hair and brows; canvas work jacket with a brass lamp-check tag; sleeves rolled, forearms scarred',
    },
  },

  nan: {
    id: 'nan',
    name: 'Nan Okerby',
    role: 'Lantern-maker, Vessery docks',
    color: '#f0a060',
    say: ['Grandma (English (UK))', 'Tara', 'Kathy'],
    rate: 150,
    pitch: 1.1,
    look: {
      skin: '#a5714c', hair: '#ececec', hairStyle: 'bun',
      coat: '#7a3b2e', trim: '#f0a060', build: 'small', age: 'old',
      mark: 'red knitted shawl; paper-cut fingers wrapped in tape; a lantern frame always half finished in her lap',
    },
  },

  ansel: {
    id: 'ansel',
    name: 'Ansel Pryce',
    role: 'Scholarship cadet, bed nineteen',
    color: '#9ec3e6',
    say: ['Sandy (English (UK))', 'Sandy (English (US))', 'Junior'],
    rate: 158,
    pitch: 1.55,
    look: {
      skin: '#e6c3a3', hair: '#b08d57', hairStyle: 'cropped',
      coat: '#2c4a6e', trim: '#b8c4d0', build: 'small', age: 'young',
      mark: "twelve years old: Ren's cadet coat a size too large, cuffs turned back twice; cropped straw hair with a cowlick; ink tally strokes on the back of the left hand; stands at attention when spoken to",
    },
  },

  wyn: {
    id: 'wyn',
    name: 'Wyn Okerby',
    role: 'Lamp-keeper, Little Brand',
    color: '#d9c27a',
    say: ['Grandma (English (US))', 'Shelley (English (US))'],
    rate: 168,
    pitch: 0.95,
    look: {
      skin: '#9c6a48', hair: '#e4e4e0', hairStyle: 'braid',
      coat: '#2f4a44', trim: '#d9c27a', build: 'slim', age: 'old',
      mark: "her sister Nan's face, weathered harder; white braid down the back tied off with net twine; patched sea-green oilskin over a fisherman's jersey; kelp-ash grey on the fingertips; one eyebrow always raised",
    },
  },

  crowd: {
    id: 'crowd',
    name: 'Voice in the crowd',
    role: 'A docker, a clerk, a crier, a miner',
    color: '#9a9a9a',
    say: ['Rocko (English (US))', 'Rocko (English (UK))', 'Fred', 'Albert'],
    rate: 180,
    pitch: 1.0,
    look: {
      skin: '#b08a6a', hair: '#4a4038', hairStyle: 'short',
      coat: '#555048', trim: '#9a9a9a', build: 'broad', age: 'mid',
      mark: 'drawn as a silhouette among others: flat cap, turned-up collar, no face to remember',
    },
  },
};
