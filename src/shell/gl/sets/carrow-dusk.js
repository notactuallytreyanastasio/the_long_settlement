// SET: carrow-dusk. Carrow at dusk (mint ending): the same shingle, racks, goats and stone lamp-house as
// sets/carrow-morning.js, with no lane. She stands in the lamp-house door holding one small lamp, which is the
// light of the scene; the boat is drawn up on the shingle; and the sea stands all round the island, like a wall
// round a garden.
// Chapter 8: ch8.mepi.19-.27 (he comes home; she asks him nothing; he asks after the smallest).
//
//   import { carrowDusk } from './sets/carrow-dusk.js';
//   const set = carrowDusk.build(GL, { light: 'dusk', low: false });
//
// The place is built by buildCarrow() in carrow-morning.js: see that file for the shape, the hooks (setSea) and the marks.

import { buildCarrow, CARROW_LIGHTS } from './carrow-morning.js';

const DUSK = { dusk: CARROW_LIGHTS.dusk };
export const carrowDusk = { id: 'carrow-dusk', lights: Object.keys(DUSK), cameras: ['wide', 'two', 'close', 'low', 'stage', 'landscape'], build: (engine, opts) => buildCarrow('carrow-dusk', DUSK, opts) };
export default carrowDusk;
