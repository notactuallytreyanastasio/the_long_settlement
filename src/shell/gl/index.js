// The cel engine's public surface, in one import:
//   import * as GL from './gl/index.js';   or   import { createRenderer, sphere, material, ... } from './gl/index.js';
export * from './math.js';
export * from './mesh.js';
export * from './scene.js';
export * from './rig.js';
export * from './sprites.js';
export * from './fx.js';
export { createAtlas } from './atlas.js';
export { createRenderer } from './renderer.js';
export { createFaces, EMOTES } from './faces.js';
export { createCharacter, figureMaterial, teamMove, mirrorPose, CAST, CLIPS, POSES, HAIR, EXTRAS, PROPS } from './characters.js';
export { createTableView, tableEvents, TABLE_ART, registerTableArt } from './table3d.js';
export { createTroupe, createCine, createEncounter, comboOf, frameHeads, inkFor, projectTo, BEATS, COMBO_WEIGHT, COMBO_NAMES } from './stage.js';
export * as kit from './sets/kit.js';
import { lanternStalls } from './sets/lantern-stalls.js';
export const SETS = { [lanternStalls.id]: lanternStalls };
