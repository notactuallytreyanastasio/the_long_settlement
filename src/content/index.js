// The whole of the game's authored data, as one plain value.
import { cast } from './cast.js';
import { tables } from './tables.js';
import { chapter1 } from './chapter1.js';
import { chapter2 } from './chapter2.js';
import { chapter3 } from './chapter3.js';
import { chapter4 } from './chapter4.js';
import { chapter5 } from './chapter5.js';
import { chapter6 } from './chapter6.js';
import { chapter7 } from './chapter7.js';
import { chapter8 } from './chapter8.js';

/** @type {import('../core/types.js').Content} */
export const content = {
  chapters: [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7, chapter8],
  tables,
  cast,
};
