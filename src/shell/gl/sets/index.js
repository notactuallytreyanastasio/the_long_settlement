// The SETS registry: every 3D set the game can stand a scene on, by backdrop key.
//
//   import { SETS, hasSet } from './sets/index.js';
//   const set = SETS['harbor-night'].build(GL, { light: 'night', low: false });
//
// An entry is { id, lights: [names], cameras: [names], build(GL, { light, low }) }. `light` picks a light state
// (the first is the default); sets written this round fall back to their first light on an unknown name.
// `low: true` drops distant detail for the live stage band on a phone. See ../index.js for what build() returns.
//
// To add a set: write sets/<id>.js exporting that object, import it here and list it.

import { lanternStalls } from './lantern-stalls.js';
import { harborNight } from './harbor-night.js';

const list = [lanternStalls, harborNight];

export const SETS = {};
for (const s of list) {
  if (SETS[s.id]) throw new Error(`sets: two sets are registered as "${s.id}"`);
  SETS[s.id] = s;
}

/** True when a backdrop key has a 3D set. */
export const hasSet = (id) => Object.prototype.hasOwnProperty.call(SETS, id);
