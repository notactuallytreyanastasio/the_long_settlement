// The whole of the game's authored data, as one plain value.
import { cast } from './cast.js';
import { tables } from './tables.js';
import { chapter1 } from './chapter1.js';
import { chapter2 } from './chapter2.js';
import { chapter3 } from './chapter3.js';
import { chapter4 } from './chapter4.js';
import { chapter5 } from './chapter5.js';

/** @type {import('../core/types.js').Content} */
export const content = {
  chapters: [chapter1, chapter2, chapter3, chapter4, chapter5],
  tables,
  cast,
};
