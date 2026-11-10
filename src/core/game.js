// The root reducer.  update(content, game, msg) -> { game, effects }
//
// Pure: no DOM, no clock, no Math.random, no mutation of arguments. Content is
// passed in; this file never imports from src/shell or src/content.
//
// Shape: every transition is a small function returning a Step
// ({ game, effects }). Each mode has a table of handlers keyed by message
// type; update() only dispatches. A message a mode has no handler for is a
// no-op (confirm during play, toSlot on the title screen); a message type or
// mode nobody knows throws.

import { initPhys, addBall, addLiveBall, releaseHeld, stepPhysics } from './physics.js';
import { spin } from './slot.js';
import {
  initEcon, awardPoints, canSpin, paySpin, applyPayout, needsLoan, takeLoan,
  spendWrit, addTrust, aidAvailable, takeAid,
} from './economy.js';
import { seed, next, pick } from './rng.js';
import {
  currentChapter, currentScene, objectiveProgress, registerHit, resolveStage, lineSeconds, eligibleBarks,
} from './story.js';

// ───────────────────────── tuning ─────────────────────────

/** Seconds at which each reel stops after a spin starts. */
export const REEL_STOPS = [0.9, 1.5, 2.1];

const POINTS = {
  bumper: 100, sling: 50, target: 250, rollover: 150, shot: 500, saucer: 750,
  eject: 0, drain: 0, launch: 0, flip: 0, wall: 0,
};
/** Event types that count as hitting an element for objectives ('eject' repeats the saucer's id). */
const HIT_TYPES = new Set(['bumper', 'sling', 'target', 'rollover', 'shot', 'saucer']);

const SAVE_AFTER_CUTSCENE = 5;   // seconds of ball save when play resumes after a cutscene
const BOON_SAVE_SECONDS = 20;
const BOON_MULT = 2;
const BOON_MULT_SECONDS = 30;
const MULTIBALL_EXTRA = 2;
const MULTIBALL_GAP = 0.7;       // seconds between extra balls leaving the plunger lane
const BARK_COOLDOWN = 8;
const BUMPER_BARK_CHANCE = 0.25;
const IDLE_BARK_SECONDS = 20;
const TOAST_SECONDS = 3;
const TOAST_MAX = 4;

// ───────────────────────── step plumbing ─────────────────────────

const ok = (game, effects = []) => ({ game, effects });
/** Run fn on the step's game and append its effects. */
const then = (step, fn) => {
  const r = fn(step.game);
  return { game: r.game, effects: step.effects.concat(r.effects) };
};

const sfx = (name, vol) => (vol === undefined ? { type: 'sfx', name } : { type: 'sfx', name, vol });
const music = (mood) => ({ type: 'music', mood });
const HUSH = { type: 'hush' };

/** Everything a Line asks for: its music, its one-shot sound, and the line spoken. */
const sayEffects = (line, blocking) => [
  ...(line.music ? [music(line.music)] : []),
  ...(line.sfx ? [sfx(line.sfx)] : []),
  { type: 'say', line, blocking },
];

const enterMode = (game, mode) => ({ ...game, mode, modeT: 0 });

const toast = (game, kind, text) => ({
  ...game,
  toasts: [...game.toasts, { kind, text, t: 0 }].slice(-TOAST_MAX),
});

function tableOf(content, game) {
  const chapter = currentChapter(content, game);
  const table = content.tables[chapter.tableId];
  if (!table) throw new Error(`game: chapter ${chapter.id} names unknown table ${JSON.stringify(chapter.tableId)}`);
  return table;
}

const IDLE_SLOT = { phase: 'idle', t: 0, result: null, stopAt: REEL_STOPS };
const NO_BOONS = { ballSave: 0, mult: 1, multT: 0 };

// ───────────────────────── init / save / load ─────────────────────────

/**
 * Fields beyond the contract's Game typedef (the shell does not need them):
 *   briefed     the current scene's briefing has been spoken
 *   freeBalls   balls waiting at the plunger whose launch costs no writ (ball save)
 *   multiQueue  multiball balls still to be fed onto the table
 *   multiT      seconds since the last multiball feed
 *   idleT       seconds of play since anything scored
 */
export function init(seedN) {
  return {
    mode: 'title',
    after: 'slot',
    chapter: 0,
    scene: 0,
    hits: {},
    seq: 0,
    cine: null,
    slot: IDLE_SLOT,
    econ: initEcon(),
    phys: null,
    rng: seed(seedN),
    t: 0,
    modeT: 0,
    boons: NO_BOONS,
    barkCool: 0,
    spunThisChapter: false,
    toasts: [],
    briefed: false,
    freeBalls: 0,
    multiQueue: 0,
    multiT: 0,
    idleT: 0,
  };
}

export function toSave(game) {
  return { v: 1, chapter: game.chapter, scene: game.scene, econ: { ...game.econ }, seed: game.rng.s };
}

const saveEffect = (game) => ({ type: 'save', save: toSave(game) });

/** Restore a save: the start of that scene, at the reels, with a fresh table. */
function load(content, save) {
  if (!save || save.v !== 1) throw new Error(`game: cannot load save version ${JSON.stringify(save && save.v)}`);
  const chapter = content.chapters[save.chapter];
  if (!chapter) throw new Error(`game: save names chapter index ${save.chapter}, which does not exist`);
  if (!chapter.scenes[save.scene]) {
    throw new Error(`game: save names scene index ${save.scene}, which chapter ${chapter.id} does not have`);
  }
  if (!save.econ || typeof save.econ !== 'object') throw new Error(`game: save has no econ: ${JSON.stringify(save.econ)}`);
  // A save from before the lifetime totals existed has neither: it starts both at zero.
  // (A total that is present but not a number is not excused; economy.js throws on it.)
  const econ = { trustEarned: 0, loansTaken: 0, ...save.econ };
  const base = { ...init(save.seed), chapter: save.chapter, scene: save.scene, econ };
  const game = {
    ...base,
    mode: 'slot',
    phys: initPhys(tableOf(content, base)),
    // The rigged spin belongs to the very start of a chapter; later scenes are past it.
    spunThisChapter: save.scene > 0,
  };
  return ok(game, [HUSH, music(chapter.music.slot)]);
}

// ───────────────────────── barks ─────────────────────────

/**
 * One short line over live play, chosen by rng, at most one per BARK_COOLDOWN unless forced.
 * Lines whose speaker has not been met yet (minScene) are not in the draw; if that leaves
 * none, nothing is said and neither the rng nor the cooldown is touched.
 */
function bark(content, game, key, force = false) {
  if (!force && game.barkCool > 0) return ok(game);
  const lines = eligibleBarks(currentChapter(content, game), key, game.scene);
  if (lines.length === 0) return ok(game);
  const [line, rng] = pick(game.rng, lines);
  return ok({ ...game, rng, barkCool: BARK_COOLDOWN }, sayEffects(line, false));
}

// ───────────────────────── chapters ─────────────────────────

/**
 * Chapter card: fresh table, trust and aid reset, nothing spun yet. Trust is standing with
 * one town and stays there; econ.trustEarned and econ.loansTaken are carried on untouched.
 */
function startChapter(content, game, index) {
  const at = { ...game, chapter: index, scene: 0 };
  const next_ = {
    ...enterMode(at, 'card'),
    hits: {},
    seq: 0,
    cine: null,
    slot: IDLE_SLOT,
    econ: { ...game.econ, trust: 0, aidUsed: 0 },
    phys: initPhys(tableOf(content, at)),
    boons: NO_BOONS,
    spunThisChapter: false,
    briefed: false,
    freeBalls: 0,
    multiQueue: 0,
    multiT: 0,
    idleT: 0,
  };
  return ok(next_, [HUSH, music('silence'), sfx('card')]);
}

// ───────────────────────── cinematics ─────────────────────────

function startCine(content, game, kind, lines, after) {
  const chapter = currentChapter(content, game);
  if (lines.length === 0) {
    // Nothing to show: fall straight through to whatever follows this kind.
    return endCine(content, { ...game, after, cine: { kind, lines, index: 0, lineT: 0, bg: 'black', on: [], t: 0 } });
  }
  const first = lines[0];
  const cine = { kind, lines, index: 0, lineT: 0, ...resolveStage(lines, 0), t: 0 };
  // A cutscene that names no music keeps the table's mood; a prologue or epilogue takes the quieter one.
  const fallback = kind === 'scene' ? chapter.music.play : chapter.music.slot;
  return ok({ ...enterMode(game, 'cine'), after, cine }, [
    HUSH,
    ...(first.music ? [] : [music(fallback)]),
    ...sayEffects(first, true),
  ]);
}

function advanceCine(content, game) {
  const { cine } = game;
  const index = cine.index + 1;
  if (index >= cine.lines.length) return endCine(content, game);
  const nextCine = { ...cine, index, lineT: 0, ...resolveStage(cine.lines, index) };
  return ok({ ...game, cine: nextCine }, sayEffects(cine.lines[index], true));
}

const CINE_END = {
  prologue: (content, game) => then(enterSlot(content, { ...game, cine: null }), (g) => ok(g, [saveEffect(g)])),
  scene: endSceneCine,
  epilogue: endEpilogue,
};

function endCine(content, game) {
  const end = CINE_END[game.cine.kind];
  if (!end) throw new Error(`game: unknown cinematic kind ${JSON.stringify(game.cine.kind)}`);
  return end(content, game);
}

/** The scene's cutscene is over: next scene on the same table, or the epilogue. */
function endSceneCine(content, game) {
  const chapter = currentChapter(content, game);
  const advanced = { ...game, cine: null, scene: game.scene + 1, hits: {}, seq: 0, briefed: false };
  if (advanced.scene >= chapter.scenes.length) {
    return startCine(content, advanced, 'epilogue', chapter.epilogue, 'slot');
  }
  const released = releaseHeld(tableOf(content, advanced), advanced.phys);
  const resumed = {
    ...advanced,
    phys: released.phys,
    boons: { ...advanced.boons, ballSave: Math.max(advanced.boons.ballSave, SAVE_AFTER_CUTSCENE) },
  };
  const step = ok(resumed, [saveEffect(resumed), ...released.events.map(eventSfx)]);
  return then(step, (g) => enterPlay(content, g));
}

function endEpilogue(content, game) {
  const nextIndex = game.chapter + 1;
  if (nextIndex < content.chapters.length) return startChapter(content, { ...game, cine: null }, nextIndex);
  return ok({ ...enterMode(game, 'end'), cine: null }, [HUSH, music('title')]);
}

function cineTick(content, game, msg) {
  const { cine } = game;
  const lineT = cine.lineT + msg.dt;
  const ticked = { ...game, cine: { ...cine, lineT, t: cine.t + msg.dt } };
  // Safety net: the shell never said lineDone, so move on by ourselves.
  if (lineT >= lineSeconds(cine.lines[cine.index]) * 1.5 + 2) {
    return then(ok(ticked, [HUSH]), (g) => advanceCine(content, g));
  }
  return ok(ticked);
}

const cineHandlers = {
  tick: cineTick,
  lineDone: (content, game, msg) =>
    (msg.id === game.cine.lines[game.cine.index].id ? advanceCine(content, game) : ok(game)),
  confirm: (content, game) => then(ok(game, [HUSH]), (g) => advanceCine(content, g)),
  skip: (content, game) => then(ok(game, [HUSH]), (g) => endCine(content, g)),
};

// ───────────────────────── title / card / end ─────────────────────────

const titleHandlers = {
  // The first tick announces the title music; init() cannot emit effects.
  tick: (content, game) => ok(game, game.modeT === 0 ? [music('title')] : []),
  confirm: (content, game) => then(ok(game, [sfx('confirm')]), (g) => startChapter(content, g, 0)),
};

const cardHandlers = {
  confirm: (content, game) => then(ok(game, [sfx('confirm')]), (g) =>
    startCine(content, g, 'prologue', currentChapter(content, g).prologue, 'slot')),
};

const endHandlers = {};

// ───────────────────────── slot (the Reels of Assay) ─────────────────────────

function enterSlot(content, game) {
  const slot = { ...game.slot, phase: 'idle', t: 0 };
  return ok({ ...enterMode(game, 'slot'), slot }, [music(currentChapter(content, game).music.slot)]);
}

function startSpin(game, result) {
  const slot = { phase: 'spinning', t: 0, result, stopAt: REEL_STOPS };
  return ok({ ...game, slot, spunThisChapter: true }, [sfx('reelStart')]);
}

function slotConfirm(content, game) {
  if (game.slot.phase === 'spinning') return ok(game);
  const chapter = currentChapter(content, game);
  const { econ } = game;
  if (!game.spunThisChapter && chapter.riggedSpin) {
    // The scripted spin is on the house: it must land whatever the player can afford.
    return startSpin({ ...game, econ: { ...econ, spins: econ.spins + 1 } }, chapter.riggedSpin);
  }
  if (canSpin(econ)) {
    const { rng, result } = spin(game.rng);
    return startSpin({ ...game, rng, econ: paySpin(econ) }, result);
  }
  if (needsLoan(econ)) {
    const lent = toast({ ...game, econ: takeLoan(econ) }, 'loan', 'The Mint advances you marks, at interest.');
    return then(ok(lent, [sfx('loan')]), (g) => bark(content, g, 'loan', true));
  }
  return ok(toast(game, 'hint', 'Not enough marks to spin. Take your writs to the table.'));
}

function applyBoon(game, boon) {
  if (boon === null) return game;
  if (boon === 'ballSave') {
    return { ...game, boons: { ...game.boons, ballSave: Math.max(game.boons.ballSave, BOON_SAVE_SECONDS) } };
  }
  if (boon === 'multiball') return { ...game, multiQueue: game.multiQueue + MULTIBALL_EXTRA };
  if (boon === 'doubleMarks') return { ...game, boons: { ...game.boons, mult: BOON_MULT, multT: BOON_MULT_SECONDS } };
  throw new Error(`game: unknown boon ${JSON.stringify(boon)}`);
}

function payoutKind({ reels, payout }) {
  if (payout.writs === 0 && payout.marks === 0 && payout.boon === null) return 'bust';
  if (reels[0] === reels[1] && reels[1] === reels[2]) return 'jackpot';
  return 'payout';
}

/** All three reels are down: pay out. */
function settleSpin(content, game) {
  const { result } = game.slot;
  const kind = payoutKind(result);
  const paid = applyBoon({ ...game, econ: applyPayout(game.econ, result.payout) }, result.payout.boon);
  const settled = toast({ ...paid, slot: { ...game.slot, phase: 'settled', t: 0 } }, kind, result.payout.name);
  const effects = [sfx(kind), ...(kind === 'jackpot' ? [{ type: 'flash', color: '#ffd76a' }] : [])];
  if (kind === 'payout') return ok(settled, effects);
  return then(ok(settled, effects), (g) => bark(content, g, kind));
}

function slotTick(content, game, msg) {
  const { slot } = game;
  const t = slot.t + msg.dt;
  const ticked = { ...game, slot: { ...slot, t } };
  if (slot.phase !== 'spinning') return ok(ticked);
  const stops = slot.stopAt.filter((at) => slot.t < at && t >= at).map(() => sfx('reelStop'));
  if (t < slot.stopAt[2]) return ok(ticked, stops);
  return then(ok(ticked, stops), (g) => settleSpin(content, g));
}

function slotToTable(content, game) {
  if (game.slot.phase === 'spinning') return ok(game);
  if (game.econ.writs <= 0 && game.phys.balls.length === 0) {
    return ok(toast(game, 'hint', 'No writ, no Plumb. Spin the Reels.'));
  }
  return enterPlay(content, game);
}

const slotHandlers = { tick: slotTick, confirm: slotConfirm, toTable: slotToTable };

// ───────────────────────── play (the Orrery) ─────────────────────────

/** Go to the table; speak the scene's briefing over play the first time. */
function enterPlay(content, game) {
  const chapter = currentChapter(content, game);
  const playing = { ...enterMode(game, 'play'), idleT: 0 };
  const scene = currentScene(content, playing);
  if (playing.briefed || !scene) return ok(playing, [music(chapter.music.play)]);
  const spoken = scene.briefing.reduce((s, line) => s + lineSeconds(line), 0);
  return ok(
    { ...playing, briefed: true, barkCool: Math.max(playing.barkCool, spoken + 2) },
    [music(chapter.music.play), ...scene.briefing.flatMap((line) => sayEffects(line, false))],
  );
}

function tickBoons(game, dt) {
  const { boons } = game;
  const multT = Math.max(0, boons.multT - dt);
  return {
    ...game,
    idleT: game.idleT + dt,
    boons: { ballSave: Math.max(0, boons.ballSave - dt), mult: multT > 0 ? boons.mult : 1, multT },
  };
}

function eventSfx(ev) {
  return sfx(ev.type, Math.min(1, Math.max(0.15, ev.speed / 1200)));
}

/** A ball left the plunger: this is the moment its writ is spent. */
function onLaunch(content, game) {
  const paid = game.freeBalls > 0
    ? { ...game, freeBalls: game.freeBalls - 1 }
    : { ...game, econ: spendWrit(game.econ) };
  return bark(content, { ...paid, multiT: 0 }, 'launch');
}

function onDrain(content, table, game) {
  const shaken = [{ type: 'shake', power: 0.5 }];
  if (game.boons.ballSave <= 0) return then(ok(game, shaken), (g) => bark(content, g, 'drain'));
  const saved = toast(
    { ...game, phys: addBall(table, game.phys), freeBalls: game.freeBalls + 1 },
    'save', 'Ball saved.',
  );
  return then(ok(saved, shaken), (g) => bark(content, g, 'save', true));
}

function onBumper(content, game) {
  if (game.barkCool > 0) return ok(game);
  const [roll, rng] = next(game.rng);
  const rolled = { ...game, rng };
  return roll < BUMPER_BARK_CHANCE ? bark(content, rolled, 'bumper') : ok(rolled);
}

const EVENT_EXTRAS = {
  launch: (content, table, game) => onLaunch(content, game),
  drain: onDrain,
  bumper: (content, table, game) => onBumper(content, game),
  shot: (content, table, game) => bark(content, game, 'ramp'),
};

/** One physics event: sound, points, objective progress, and whatever else its type means. */
function onEvent(content, table, game, ev) {
  if (!(ev.type in POINTS)) throw new Error(`game: unknown physics event type ${JSON.stringify(ev.type)}`);
  const points = POINTS[ev.type];
  let g = points > 0
    ? { ...game, econ: awardPoints(game.econ, points, game.boons.mult), idleT: 0 }
    : game;
  const effects = [eventSfx(ev)];
  const scene = currentScene(content, g);
  if (scene && HIT_TYPES.has(ev.type) && ev.id !== undefined) {
    const hit = registerHit(scene, g.hits, g.seq, ev.id);
    if (hit.progressed) {
      g = { ...g, hits: hit.hits, seq: hit.seq };
      effects.push(sfx('objective'));
    }
  }
  const extra = EVENT_EXTRAS[ev.type];
  return extra ? then(ok(g, effects), (h) => extra(content, table, h)) : ok(g, effects);
}

/** Objective met: pay the reward, earn the town's trust, and cut to the scene. */
function completeScene(content, game, scene) {
  const rewarded = addTrust(
    awardPoints(game.econ, scene.reward.points, game.boons.mult),
    scene.reward.trust || 0,
  );
  const cleared = toast({ ...game, econ: rewarded }, 'scene', scene.title);
  const effects = [sfx('sceneClear'), { type: 'flash', color: '#ffffff' }];
  return then(ok(cleared, effects), (g) => startCine(content, g, 'scene', scene.cutscene, 'play'));
}

/**
 * Keep a ball on the table. None left: a writ puts a new one at the plunger
 * (spent at launch); with no writs the Commons covers one if the town trusts
 * you; otherwise it is back to the Reels.
 */
function supplyBall(content, table, game) {
  if (game.phys.balls.length > 0) return ok(game);
  if (game.econ.writs > 0) return ok({ ...game, phys: addBall(table, game.phys) });
  if (aidAvailable(game.econ)) {
    const aided = toast(
      { ...game, econ: takeAid(game.econ), phys: addBall(table, game.phys) },
      'aid', 'The Commons covers your ball. Nothing is owed.',
    );
    return then(ok(aided, [sfx('aid')]), (g) => bark(content, g, 'aid', true));
  }
  return then(ok(toast(game, 'bust', 'Out of writs. Back to the Reels.')), (g) => enterSlot(content, g));
}

/** Multiball: feed queued balls up the plunger lane, one at a time, while a ball is live. */
function feedMultiball(table, game, dt) {
  if (game.multiQueue <= 0 || !game.phys.balls.some((b) => b.state === 'live')) return ok(game);
  const multiT = game.multiT + dt;
  if (multiT < MULTIBALL_GAP) return ok({ ...game, multiT });
  const speed = table.plunger.maxSpeed * (game.multiQueue % 2 === 0 ? 0.95 : 0.85);
  const phys = addLiveBall(game.phys, table.plunger.pos, [0, -speed]);
  return ok({ ...game, phys, multiQueue: game.multiQueue - 1, multiT: 0 }, [sfx('launch')]);
}

function idleBark(content, game) {
  if (game.idleT < IDLE_BARK_SECONDS) return ok(game);
  return bark(content, { ...game, idleT: 0 }, 'idle');
}

/** One fixed step of the table: physics, its events, the objective, then ball supply. */
function playTick(content, game, msg) {
  if (!msg.input) throw new Error('game: a tick in play needs msg.input');
  const table = tableOf(content, game);
  const stepped = stepPhysics(table, game.phys, msg.input, msg.dt);
  let step = stepped.events.reduce(
    (s, ev) => then(s, (g) => onEvent(content, table, g, ev)),
    ok({ ...tickBoons(game, msg.dt), phys: stepped.phys }),
  );
  const scene = currentScene(content, step.game);
  if (scene && objectiveProgress(scene, step.game.hits, step.game.seq).complete) {
    return then(step, (g) => completeScene(content, g, scene));
  }
  step = then(step, (g) => supplyBall(content, table, g));
  if (step.game.mode !== 'play') return step;
  step = then(step, (g) => feedMultiball(table, g, msg.dt));
  return then(step, (g) => idleBark(content, g));
}

function playToSlot(content, game) {
  if (game.phys.balls.some((b) => b.state === 'live')) return ok(toast(game, 'hint', 'The Plumb is still turning.'));
  return enterSlot(content, game);
}

const playHandlers = { tick: playTick, toSlot: playToSlot };

// ───────────────────────── update ─────────────────────────

const MODES = {
  title: titleHandlers,
  card: cardHandlers,
  cine: cineHandlers,
  slot: slotHandlers,
  play: playHandlers,
  end: endHandlers,
};

const MSG_TYPES = new Set(['tick', 'confirm', 'toTable', 'toSlot', 'skip', 'lineDone', 'load']);

/** Time that passes in every mode: clocks, toast ageing, the bark cooldown. */
function commonTick(game, dt) {
  return {
    ...game,
    t: game.t + dt,
    modeT: game.modeT + dt,
    barkCool: Math.max(0, game.barkCool - dt),
    toasts: game.toasts.map((x) => ({ ...x, t: x.t + dt })).filter((x) => x.t < TOAST_SECONDS),
  };
}

export function update(content, game, msg) {
  if (!msg || !MSG_TYPES.has(msg.type)) throw new Error(`game: unknown message type ${JSON.stringify(msg && msg.type)}`);
  if (msg.type === 'load') return load(content, msg.save);
  const handlers = MODES[game.mode];
  if (!handlers) throw new Error(`game: unknown mode ${JSON.stringify(game.mode)}`);
  const handler = handlers[msg.type];
  if (msg.type !== 'tick') return handler ? handler(content, game, msg) : ok(game);
  if (typeof msg.dt !== 'number' || !(msg.dt > 0)) throw new Error(`game: tick needs a positive dt, got ${msg.dt}`);
  const step = handler ? handler(content, game, msg) : ok(game);
  return { game: commonTick(step.game, msg.dt), effects: step.effects };
}
