// The cel engine's public surface, in one import. The live game reaches it through app.js (the 3D renderer main.js picks).
//   import * as GL from './gl/index.js';
// Slice page: /tools/gl-demo.html?view=live|cine|table|cast|engine (its header lists every parameter).
//
// LAYERS (each only imports the ones above it)
//   math.js mesh.js scene.js rig.js sprites.js fx.js   pure data: meshes, nodes, materials, env, rigs, particles
//   atlas.js gl.js shaders.js renderer.js              the only files that touch a canvas or GL
//   faces.js characters.js                             the cast: defs are data, bodies and faces are built from them
//   sets/kit.js sets/<id>.js                           prop builders, and one file per set
//   table3d.js                                         a pinball table as a toon diorama, from src/content tables
//   stage.js                                           cast on a set: cutscene director, live encounter, combos
//
// ONE FRAME
//   const renderer = createRenderer(canvas, { dprCap: 2 });        one canvas, one context, for everything
//   renderer.render(scene, camera, timeSeconds, { x, y, w, h, shadowCenter, shadowRadius });   a rectangle in CSS px
//   Several render() calls per frame share the canvas (stage band + table). Things that are per view and live on
//   the scene (env.outline.width, env.shadow, set.foreground.visible, troupe.aim) must be set before each call.
//
// A SET        SETS[id].build(GL, { light: 'dusk' | 'night' | 'day' })  ->
//   { id, light, scene, env, actors (Node: add characters here), foreground (Node: near clutter, hide for close cameras),
//     cameras: { wide, two, close, low, stage, landscape }: { target, dist, yaw, pitch, fov, aspect, shadowCenter, shadowRadius, outline? },
//     frame(camera, name, time), view(name) -> { shadowCenter, shadowRadius },
//     marks: { a, b, c, two[2], party[3], opposition[3] }: { pos, face }, plus set-specific ones,
//     lamps[], setPower(0..1.5), update(time, dt) }
//   Convention: figures face +Z, cameras look toward -Z, the stage strip x -3.2..3.2, z 0..1.6 is kept clear,
//   at most 6 fixed point lights (8 are drawn; two stay free for carried lamps).
//
// THE CAST     const troupe = createTroupe({ detail });  const ch = troupe.spawn('ren' | def);
//   ch.root (feet at its origin), ch.update(dt, { emote, speaking | talk, pose, look, face, camera, wind, snap }),
//   ch.act(clipName) -> { dur, impact }, ch.release(), ch.home(), ch.headPos, ch.lampPos, ch.headRadius, ch.skin.flash
//   troupe.aim(camera, side, lift, across): the character light. Figures take their terminator from material.keyLight,
//   a direction that follows the camera, so faces are lit the same way in every shot; rim and cast shadows still come
//   from the set's sun. Call it after placing the camera, before render().
//   CAST, CLIPS, POSES, EMOTES, HAIR, EXTRAS, PROPS are the registries a new cast member is written against.
//
// A CUTSCENE   const cine = createCine(set, troupe, { on: ['nan', 'ren', 'ilse'] });   left to right on marks a, b, c
//   cine.update(dt, time, { speaker, emote, emotes: { id: emote }, cam: 'wide' | 'two' | 'close' | 'low', camera, aspect, viewHeight, still });
//   renderer.render(set.scene, camera, time, { x, y, w, h, ...cine.view });
//   'close' and 'two' are computed from head positions (frameHeads), so they work for any cast on any set; 'wide' and
//   'low' are the set's own marks.
//
// THE TABLE    const view = createTableView(content, tableId);  view.fit(layout);  view.update(game, events, dt);  view.render(renderer, time);
//   tableEvents(content, before, msg, after, out) -> this tick's events (pure).  view.project / where / reelPos / punch.
//   registerTableArt(id, { palette, groups, paint, bumperTop, scenery, glints, env }) gives a table its own look.
//
// THE LIVE STAGE   const enc = createEncounter(set, troupe, { party: [ids], opposition: [ids], title, yaw, zoom });
//   enc.update(dt, time, events, { done, total });  enc.frame(camera, aspect, time, viewHeight);  render with { ...enc.view }
//   enc.combo { count, level, left }, enc.resolve 0..1, enc.power, enc.punch, enc.cues [], enc.reset(), enc.dialogue(camera, aspect, time, speaker)
//   comboOf(log, now) is pure (bound for src/core); BEATS maps table event types to stage actions.
export * from './math.js';
export * from './mesh.js';
export * from './scene.js';
export * from './rig.js';
export * from './sprites.js';
export * from './fx.js';
export { createAtlas } from './atlas.js';
export { createRenderer } from './renderer.js';
export { createFaces, EMOTES } from './faces.js';
export { createCharacter, createCrowd, castVariant, figureMaterial, teamMove, mirrorPose, CAST, CLIPS, POSES, HAIR, EXTRAS, PROPS } from './characters.js';
export { createTableView, tableEvents, TABLE_ART, registerTableArt } from './table3d.js';
export { createTroupe, createCine, createEncounter, createDirector, castReady, UNITS, MODES, comboOf, frameHeads, inkFor, projectTo, BEATS, COMBO_WEIGHT, COMBO_NAMES } from './stage.js';
export * as kit from './sets/kit.js';
export { SETS, hasSet } from './sets/index.js';
