// The SETS registry: every 3D set the game can stand a scene on, by backdrop key.
//
//   import { SETS, hasSet } from './sets/index.js';
//   const set = SETS['harbor-night'].build(GL, { light: 'night', low: false });
//
// An entry is { id, lights: [names], cameras: [names], build(GL, { light, low }) }. `light` picks a light state
// (the first is the default); sets written this round fall back to their first light on an unknown name.
// `low: true` drops distant detail for the live stage band on a phone. See ../index.js for what build() returns.
//
// To add a set: write sets/<id>.js exporting that object, import it here and list it. Every import is static: a set
// file that throws on import takes the whole 3D game down to 2D, so run each new file under node before listing it.

import { lanternStalls } from './lantern-stalls.js';
import { harborNight } from './harbor-night.js';
import { pierRiot } from './pier-riot.js';
import { ferryDawn } from './ferry-dawn.js';
import { ledger } from './ledger.js';
import { line, black } from './abstract.js';
import { drumHall } from './drum-hall.js';
import { bench } from './bench.js';
import { mintOffice } from './mint-office.js';
import { orrery } from './orrery.js';
// chapter 2 (Saltmere)
import { causeway } from './causeway.js';
import { picket } from './picket.js';
import { commonsHall } from './commons-hall.js';
import { mineDeep } from './mine-deep.js';
import { court } from './court.js';
import { ledgerRoom } from './ledger-room.js';
import { shoreDusk } from './shore-dusk.js';
// chapter 3 (Halcyon Reach)
import { academyYard } from './academy-yard.js';
import { hearingHall } from './hearing-hall.js';
import { dormitory } from './dormitory.js';
import { underwritingFloor } from './underwriting-floor.js';
import { proctorOffice } from './proctor-office.js';
// chapter 4 (Little Brand)
import { ferryStorm } from './ferry-storm.js';
import { wreckShore } from './wreck-shore.js';
import { darkVillage } from './dark-village.js';
import { hiddenLamp } from './hidden-lamp.js';
import { underLane } from './under-lane.js';
// chapter 5 (Tallis)
import { exchangeFloor } from './exchange-floor.js';
import { corvaneStudy } from './corvane-study.js';
import { commonsQueue } from './commons-queue.js';
import { clearingHouse } from './clearing-house.js';
import { exchangeSteps } from './exchange-steps.js';
import { cell } from './cell.js';
// chapter 6 (Kedge)
import { kedgeRoads } from './kedge-roads.js';
import { compactHall } from './compact-hall.js';
import { countingRoom } from './counting-room.js';
import { cutterDeck } from './cutter-deck.js';
import { lanternLine } from './lantern-line.js';
import { quarterFlame } from './quarter-flame.js';
// chapter 7 (the Fish Dock)
import { fishDock } from './fish-dock.js';
import { stallDay } from './stall-day.js';
import { hallSteps } from './hall-steps.js';
import { drumOpen } from './drum-open.js';
import { moleLanterns } from './mole-lanterns.js';
import { cutterBrig } from './cutter-brig.js';
// chapter 8 (Cresset)
import { cressetHarbour } from './cresset-harbour.js';
import { fullBench } from './full-bench.js';
import { foundersLamp } from './founders-lamp.js';
import { assembly } from './assembly.js';
import { moleDark } from './mole-dark.js';
import { laneByHand } from './lane-by-hand.js';
import { quayBreak } from './quay-break.js';
import { carrowMorning } from './carrow-morning.js';
import { carrowDusk } from './carrow-dusk.js';

const list = [
  lanternStalls, harborNight, pierRiot, ferryDawn, ledger, line, black, drumHall, bench, mintOffice, orrery,
  causeway, picket, commonsHall, mineDeep, court, ledgerRoom, shoreDusk,
  academyYard, hearingHall, dormitory, underwritingFloor, proctorOffice,
  ferryStorm, wreckShore, darkVillage, hiddenLamp, underLane,
  exchangeFloor, corvaneStudy, commonsQueue, clearingHouse, exchangeSteps, cell,
  kedgeRoads, compactHall, countingRoom, cutterDeck, lanternLine, quarterFlame,
  fishDock, stallDay, hallSteps, drumOpen, moleLanterns, cutterBrig,
  cressetHarbour, fullBench, foundersLamp, assembly, moleDark, laneByHand, quayBreak, carrowMorning, carrowDusk,
];

export const SETS = {};
for (const s of list) {
  if (SETS[s.id]) throw new Error(`sets: two sets are registered as "${s.id}"`);
  SETS[s.id] = s;
}

/** True when a backdrop key has a 3D set. */
export const hasSet = (id) => Object.prototype.hasOwnProperty.call(SETS, id);
