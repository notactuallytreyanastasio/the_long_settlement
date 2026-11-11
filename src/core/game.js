// The root reducer.  update(content, game, msg) -> { game, effects }
//
// Pure: no DOM, no clock, no Math.random, no mutation of arguments. Content is
// passed in; this file never imports from src/shell or src/content.
//
// Shape: every transition is a small function returning a Step
// ({ game, effects }). Each mode has a table of handlers keyed by message
// type; update() only dispatches. A message a mode has no handler for is a
// no-op (confirm during play, skip on the title screen); a message type or
// mode nobody knows throws.
//
// There is no slot screen. The Reels of Assay are part of the table (game.reels) and are
// worked from play in three ways: the top lanes fill one reel each, a lit shot spins all
// three, and with no ball and no writ the plunger button is the lever.

import { initPhys, addBall, addLiveBall, releaseHeld, stepPhysics } from './physics.js';
import { spin, drawSym, payoutFor, SYMBOLS, SOURCES } from './slot.js';
import {
  initEcon, awardPoints, canSpin, paySpin, applyPayout, needsLoan, takeLoan,
  spendWrit, addTrust, aidAvailable, takeAid, leaning, awardBonus,
} from './economy.js';
import { pushRecent, comboBonus } from './stage.js';
import { seed, next, pick } from './rng.js';
import {
  newMeta, checkMeta, startRun, step as frayStep, pull as frayPull, hold as frayHold, take as frayTake, nextWave as frayNext,
  settle as fraySettle, canLeave as frayCanLeave, DT as FRAY_DT,
} from './fray.js';
import {
  currentChapter, currentScene, objectiveProgress, registerHit, spotFor, resolveStage, lineSeconds, eligibleBarks,
  heardLines, readsLeaning, LEANINGS,
} from './story.js';

// ───────────────────────── tuning ─────────────────────────

/** Seconds after a full spin starts at which each reel locks. */
export const REEL_STOPS = [0.7, 1.1, 1.5];
/** Seconds a single reel turns after its lane is rolled. */
export const FILL_SECONDS = 0.5;
/** Seconds a paid line stays on the reels before they clear. */
export const PAY_SECONDS = 1.2;
/**
 * Bumper, sling and target hits needed to light the spin shots again after a spin.
 * At 45 the playthrough bot is paid about ten lines a chapter in play, six of them from
 * lit shots (one every 70 seconds or so) and the rest filled in through the lanes; at 30
 * it was twelve. test/playthrough.test.js prints the numbers.
 */
export const REELS_NEED = 45;
/** Seconds the Commons takes to pass the hat. A lever pull inside them goes to the Mint instead. */
export const AID_WAIT = 2;
/** Seconds after the table empties before the button is the lever: a press meant for a ball that just drained is not a pull. */
export const LEVER_DELAY = 0.35;

/**
 * Bumper, sling and target hits that set the Lanewar board, at the start of a game and again after each
 * visit: about half a minute of a ball in play. The table says so when it is set.
 */
export const FRAY_NEED = 30;
/** Seconds of ball save for coming back from the board with the winnings rather than on a shield. */
export const FRAY_SAVE_SECONDS = 12;

const POINTS = {
  bumper: 100, sling: 50, target: 250, rollover: 150, shot: 500, saucer: 750,
  eject: 0, drain: 0, launch: 0, flip: 0, wall: 0,
};
/** Event types that count as hitting an element for objectives ('eject' repeats the saucer's id). */
const HIT_TYPES = new Set(['bumper', 'sling', 'target', 'rollover', 'shot', 'saucer']);
/** Event types that charge the reels toward the next lit shot. */
const CHARGE_TYPES = new Set(['bumper', 'sling', 'target']);
/** What game.recent calls each of them. */
const LOG_AS = { bumper: 'bumper', sling: 'sling', target: 'target', rollover: 'lane', shot: 'shot', saucer: 'saucer' };
/** Outlane rollover -> the inlane a kickback returns the ball to, by the ids every table's lower third gives them. */
const KICK_TO = { outL: 'inL', outR: 'inR' };

const SAVE_AFTER_CUTSCENE = 5;   // seconds of ball save when play resumes after a cutscene
const BOON_SAVE_SECONDS = 20;
const BOON_MULT = 2;
const BOON_MULT_SECONDS = 30;
const MULTIBALL_EXTRA = 2;
const MULTIBALL_GAP = 0.7;       // seconds between extra balls leaving the plunger lane
const KICKBACK_MAX = 2;          // kickbacks that can be held at once
const KICKBACK_LIFT = 12;         // units above the inlane rollover a kicked ball is set down
const KICKBACK_SPEED = 120;      // units/s, downward, as a ramp delivers a ball to an inlane
const SAUCER_HOLD_EXTRA = 0.25;  // seconds a saucer keeps the ball after the last reel locks
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

/**
 * Enter something that happened in game.recent, the bounded log the stage is drawn from (stage.js lists
 * the types). The log is for watching: the only rule that reads it is the combo's bonus score.
 */
const note = (game, type, detail) => ({
  ...game,
  recent: pushRecent(game.recent, { ...detail, n: game.logged, t: game.t, type }),   // n, t and type are the log's own: no detail may replace them
  logged: game.logged + 1,
});

const NO_BOONS = { ballSave: 0, mult: 1, multT: 0, kickback: 0 };
const EMPTY_CELL = { sym: null, spin: 0 };
/** The reels as a fresh table has them: empty, and lit, so the first good shot of a chapter spins. */
const freshReels = () => ({
  cells: [EMPTY_CELL, EMPTY_CELL, EMPTY_CELL],
  phase: 'open', t: 0, result: null, source: null,
  armed: true, charge: REELS_NEED, need: REELS_NEED,
});

// ───────────────────────── init / save / load ─────────────────────────

/**
 * Fields beyond the contract's Game typedef (the shell does not need them):
 *   briefed     the current scene's briefing has been spoken
 *   freeBalls   balls waiting at the plunger whose launch costs no writ (ball save)
 *   paid        ids of balls on the table whose launch is already paid for
 *   multiQueue  multiball balls still to be fed onto the table
 *   multiT      seconds since the last multiball feed
 *   idleT       seconds of play since anything scored
 *   emptyT      seconds the table has stood empty with no writ to refill it
 *   plungeWas   input.plunge on the previous play tick (the lever acts on the press, not the hold)
 *   logged      how many entries game.recent has ever been given (the next entry's n)
 *   fray        the Lanewar board's Meta (fray.js): whether the saucer opens it, the loadout, the wave. Saved
 *   run         the game of Lanewar being played, in mode 'fray'; null otherwise. Not saved
 *   frayAcc     seconds of table time the board has not yet stepped (it steps at fray.DT)
 *   frayDue     a ball went into the saucer with the board set, on this tick: playTick opens the board
 * `recent` is in the typedef: the event log the stage is drawn from. Neither is saved; a load starts both empty.
 * And one that is in it: `ending`, null until the ledger is read in the final chapter
 * (story.readsLeaning), then 'commons' or 'mint' for good.
 */
export function init(seedN) {
  return {
    mode: 'title',
    chapter: 0,
    scene: 0,
    hits: {},
    seq: 0,
    cine: null,
    reels: freshReels(),
    econ: initEcon(),
    phys: null,
    rng: seed(seedN),
    t: 0,
    modeT: 0,
    boons: NO_BOONS,
    barkCool: 0,
    spunThisChapter: false,
    toasts: [],
    ending: null,
    briefed: false,
    freeBalls: 0,
    paid: [],
    multiQueue: 0,
    multiT: 0,
    idleT: 0,
    emptyT: 0,
    plungeWas: false,
    recent: [],
    logged: 0,
    fray: newMeta(),
    run: null,
    frayDue: false,
    frayAcc: 0,
  };
}

export const SAVE_VERSION = 6;
/** The first version that kept the reels. */
const REELS_SINCE = 3;
/**
 * Save versions load() accepts. 1 was written at the old slot screen, 2 before the reels were
 * kept, 3 before the ledger could be read (no `ending`, and no econ.hatsRefused), 4 before Lanewar
 * (no `fray`) and 5 with the turn-based Lanewar: for both the board loads as a new game has it.
 */
const LOADABLE = [1, 2, 3, 4, 5, SAVE_VERSION];
/** The first version whose `fray` this build reads. 5 was the turn-based board, for a day: its loadout means nothing now. */
const FRAY_SINCE = 6;
/** The same list, for the shell: which stored saves are worth handing to load. */
export const LOADABLE_SAVES = Object.freeze([...LOADABLE]);

/**
 * The part of the reels that outlives a session: what each reel shows (or is turning toward),
 * what set them going, whether the spin shots are lit and how far the charge has got. A line
 * that has just paid is not kept: it has paid, and the cells would clear in a second anyway.
 */
function reelsToSave(reels) {
  const r = reels.phase === 'paying' ? clearCells(reels) : reels;
  return { cells: r.cells.map((c) => ({ sym: c.sym, spin: c.spin })), source: r.source, armed: r.armed, charge: r.charge };
}

export function toSave(game) {
  return {
    v: SAVE_VERSION, chapter: game.chapter, scene: game.scene, econ: { ...game.econ }, seed: game.rng.s,
    reels: reelsToSave(game.reels), ending: game.ending,
    // A save written with the board open (none is, today: saves are written at scene ends) would lose
    // the run, so it gives the light back.
    fray: { ...game.fray, lit: game.fray.lit || game.run !== null, weapons: game.fray.weapons.map((w) => ({ ...w })), stats: { ...game.fray.stats } },
  };
}

/**
 * The reels a save describes. A v:1 or v:2 save has none and gets fresh ones, as it always did.
 * A v:3 or v:4 save must describe them properly: a reel showing a symbol nobody knows would pay
 * nothing nameable when the line completed, so that is refused here, at the door.
 */
function reelsFromSave(save) {
  if (save.v < REELS_SINCE) return freshReels();
  const r = save.reels;
  const bad = (why) => new Error(`game: save has bad reels (${why}): ${JSON.stringify(r)}`);
  if (!r || typeof r !== 'object') throw bad('not an object');
  if (!Array.isArray(r.cells) || r.cells.length !== 3) throw bad('cells must be three');
  if (typeof r.armed !== 'boolean') throw bad('armed must be true or false');
  if (!Number.isInteger(r.charge) || r.charge < 0) throw bad('charge must be a whole number, zero or more');
  if (r.source !== null && !SOURCES.includes(r.source)) throw bad('unknown source');
  const maxSpin = Math.max(...REEL_STOPS, FILL_SECONDS);
  const cells = r.cells.map((c) => {
    if (!c || typeof c !== 'object') throw bad('a cell is not an object');
    if (c.sym !== null && !SYMBOLS.includes(c.sym)) throw bad(`unknown symbol ${JSON.stringify(c.sym)}`);
    if (typeof c.spin !== 'number' || !(c.spin >= 0) || c.spin > maxSpin) throw bad(`a reel cannot have ${JSON.stringify(c.spin)} seconds left to turn`);
    if (c.sym === null && c.spin > 0) throw bad('a reel is turning toward nothing');
    return c.sym === null ? EMPTY_CELL : { sym: c.sym, spin: c.spin };
  });
  const shown = cells.some((c) => c.sym !== null);
  if (shown && r.source === null) throw bad('reels showing symbols need a source');
  // The need is the build's, not the save's: a retuned REELS_NEED applies to old saves too.
  const armed = r.armed || r.charge >= REELS_NEED;
  const base = { ...freshReels(), armed, charge: armed ? REELS_NEED : r.charge };
  // Three locked reels with nothing turning cannot happen in play (the line pays on the tick
  // the last one locks). Nothing would ever settle them, so they are cleared.
  if (!shown || cells.every((c) => c.sym !== null && c.spin === 0)) return base;
  return { ...base, cells, source: r.source };
}

const saveEffect = (game) => ({ type: 'save', save: toSave(game) });

/**
 * Restore a save: the start of that scene, at the table, with a fresh table and the reels as
 * they stood (v:3). A v:1 save was written at the slot screen, which no longer exists, and a
 * v:2 before the reels were kept; both hold the other fields and load with fresh reels.
 */
function load(content, save) {
  if (!save || !LOADABLE.includes(save.v)) {
    throw new Error(`game: cannot load save version ${JSON.stringify(save && save.v)}`);
  }
  const chapter = content.chapters[save.chapter];
  if (!chapter) throw new Error(`game: save names chapter index ${save.chapter}, which does not exist`);
  if (!chapter.scenes[save.scene]) {
    throw new Error(`game: save names scene index ${save.scene}, which chapter ${chapter.id} does not have`);
  }
  if (!save.econ || typeof save.econ !== 'object') throw new Error(`game: save has no econ: ${JSON.stringify(save.econ)}`);
  // A save from before the lifetime totals existed has neither: it starts both at zero.
  // (A total that is present but not a number is not excused; economy.js throws on it.)
  // Likewise hatsRefused, which came with v:4: its loans are all read as taken for want of a choice.
  const econ = { trustEarned: 0, loansTaken: 0, hatsRefused: 0, ...save.econ };
  // The reading of the ledger, if the save was written after it was taken. Older saves have none.
  const ending = save.ending === undefined ? null : save.ending;
  if (ending !== null && !LEANINGS.includes(ending)) {
    throw new Error(`game: save has ending ${JSON.stringify(save.ending)}; it must be null or one of ${LEANINGS.join(', ')}`);
  }
  const fray = save.v < FRAY_SINCE ? newMeta() : checkMeta(save.fray);
  const base = { ...init(save.seed), chapter: save.chapter, scene: save.scene, econ, reels: reelsFromSave(save), ending, fray };
  const game = {
    ...base,
    phys: initPhys(tableOf(content, base)),
    // The rigged spin belongs to the very start of a chapter; later scenes are past it.
    spunThisChapter: save.scene > 0,
  };
  return then(ok(game, [HUSH]), (g) => enterPlay(content, g));
}

// ───────────────────────── barks ─────────────────────────

/**
 * One short line over live play, chosen by rng, at most one per BARK_COOLDOWN unless forced.
 * Lines whose speaker has not been met yet (story.eligibleBarks) are not in the draw; if that leaves
 * none, nothing is said and neither the rng nor the cooldown is touched.
 */
function bark(content, game, key, force = false) {
  if (!force && game.barkCool > 0) return ok(game);
  const lines = eligibleBarks(content, game, key);
  if (lines.length === 0) return ok(game);
  const [line, rng] = pick(game.rng, lines);
  return ok({ ...game, rng, barkCool: BARK_COOLDOWN }, sayEffects(line, false));
}

// ───────────────────────── chapters ─────────────────────────

/**
 * Chapter card: fresh table and reels, trust and aid reset, nothing spun yet. Trust is standing with
 * one town and stays there; econ.trustEarned and econ.loansTaken are carried on untouched.
 */
function startChapter(content, game, index) {
  const at = { ...game, chapter: index, scene: 0 };
  const next_ = {
    ...enterMode(at, 'card'),
    hits: {},
    seq: 0,
    cine: null,
    reels: freshReels(),
    econ: { ...game.econ, trust: 0, aidUsed: 0 },
    phys: initPhys(tableOf(content, at)),
    boons: NO_BOONS,
    spunThisChapter: false,
    briefed: false,
    freeBalls: 0,
    paid: [],
    multiQueue: 0,
    multiT: 0,
    idleT: 0,
    emptyT: 0,
  };
  return ok(next_, [HUSH, music('silence'), sfx('card')]);
}

// ───────────────────────── cinematics ─────────────────────────

/**
 * Begin a cinematic. Of `all` its lines, only those this ledger hears are kept (story.heardLines):
 * game.cine.lines is what will actually be played, so the stage, the index and the shell's
 * progress bar are all over the one ending and never see the other.
 */
function startCine(content, game, kind, all) {
  const chapter = currentChapter(content, game);
  const lines = heardLines(all, game);
  if (lines.length === 0) {
    // Nothing to show: fall straight through to whatever follows this kind.
    return endCine(content, { ...game, cine: { kind, lines, index: 0, lineT: 0, bg: 'black', on: [], t: 0 } });
  }
  const first = lines[0];
  const cine = { kind, lines, index: 0, lineT: 0, ...resolveStage(lines, 0), t: 0 };
  // A cutscene that names no music keeps the table's mood; a prologue or epilogue takes the quieter one.
  const fallback = kind === 'scene' ? chapter.music.play : chapter.music.cine;
  return ok({ ...enterMode(game, 'cine'), cine }, [
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
  // Straight to the table. In chapter one there is no writ yet, so what waits there is the lever.
  prologue: (content, game) => then(enterPlay(content, { ...game, cine: null }), (g) => ok(g, [saveEffect(g)])),
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
    return startCine(content, advanced, 'epilogue', chapter.epilogue);
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
    startCine(content, g, 'prologue', currentChapter(content, g).prologue)),
};

const endHandlers = {};

// ───────────────────────── the Reels of Assay ─────────────────────────
// game.reels. A cell is { sym, spin }: sym null is empty, spin > 0 is seconds left turning
// before it locks on sym. The symbol is drawn when the reel starts, not when it stops, so
// what a reel will show is already decided while it turns.

const turning = (reels) => reels.cells.some((c) => c.spin > 0);
/** All three reels are turning together (a lit shot or the lever): the lanes cannot touch them. */
const fullSpin = (reels) => turning(reels) && (reels.source === 'shot' || reels.source === 'lever');
const clearCells = (reels) => ({
  ...reels, cells: [EMPTY_CELL, EMPTY_CELL, EMPTY_CELL], phase: 'open', t: 0, result: null, source: null,
});
/** A line still being shown gives way at once to whatever the player does next. */
const opened = (reels) => (reels.phase === 'paying' ? clearCells(reels) : reels);

/** Lane i was rolled: reel i turns briefly and locks on a fresh draw, whatever it showed before. */
function fillReel(game, i) {
  if (fullSpin(game.reels)) return ok(game);
  const reels = opened(game.reels);
  const drawn = drawSym(game.rng, i);
  const cells = reels.cells.map((c, k) => (k === i ? { sym: drawn.sym, spin: FILL_SECONDS } : c));
  return ok({ ...game, rng: drawn.rng, reels: { ...reels, cells, source: 'lanes', t: 0 } });
}

/** Set all three reels turning toward `syms`. A spin earned by a shot spends the light. */
function spinReels(game, source, syms) {
  const reels = opened(game.reels);
  const cells = syms.map((sym, i) => ({ sym, spin: REEL_STOPS[i] }));
  const lit = source === 'shot' ? { armed: false, charge: 0 } : {};
  return ok({ ...game, reels: { ...reels, ...lit, cells, phase: 'open', t: 0, result: null, source } }, [sfx('reelStart')]);
}

/** A lit spin shot was made. The saucer keeps the ball until the last reel is down. */
function spinShot(game, ev) {
  if (!game.reels.armed || fullSpin(game.reels)) return ok(game);
  const { rng, result } = spin(game.rng, 'shot');
  const holdMs = (REEL_STOPS[2] + SAUCER_HOLD_EXTRA) * 1000;
  const phys = ev.type !== 'saucer' ? game.phys : {
    ...game.phys,
    balls: game.phys.balls.map((b) => (b.id === ev.ballId && b.state === 'held'
      ? { ...b, heldMs: Math.max(b.heldMs || 0, holdMs) } : b)),
  };
  return spinReels({ ...game, rng, phys }, 'shot', result.reels);
}

/** A bumper, sling or target: one more toward lighting the spin shots. */
function chargeReels(game) {
  const { reels } = game;
  if (reels.armed) return ok(game);
  const charge = reels.charge + 1;
  if (charge < reels.need) return ok({ ...game, reels: { ...reels, charge } });
  const lit = toast(note({ ...game, reels: { ...reels, charge: reels.need, armed: true } }, 'lit'),
    'hint', 'The Reels are lit. Shoot the ramp, the orbit or the saucer.');
  return ok(lit, [sfx('confirm')]);
}

function applyBoon(game, boon) {
  if (boon === null) return game;
  if (boon === 'ballSave') {
    return { ...game, boons: { ...game.boons, ballSave: Math.max(game.boons.ballSave, BOON_SAVE_SECONDS) } };
  }
  if (boon === 'multiball') return { ...game, multiQueue: game.multiQueue + MULTIBALL_EXTRA };
  if (boon === 'doubleMarks') return { ...game, boons: { ...game.boons, mult: BOON_MULT, multT: BOON_MULT_SECONDS } };
  if (boon === 'kickback') {
    return { ...game, boons: { ...game.boons, kickback: Math.min(KICKBACK_MAX, game.boons.kickback + 1) } };
  }
  throw new Error(`game: unknown boon ${JSON.stringify(boon)}`);
}

function payoutKind({ reels, payout }) {
  if (payout.writs === 0 && payout.marks === 0 && !payout.points && payout.boon === null) return 'bust';
  if (reels[0] === reels[1] && reels[1] === reels[2]) return 'jackpot';
  return 'payout';
}

/**
 * All three reels are locked: the line pays, by the table its source reads from. The one
 * exception is the chapter's scripted first pull of the lever, which pays what the chapter says.
 */
function settleReels(content, game) {
  const { reels } = game;
  const chapter = currentChapter(content, game);
  const syms = reels.cells.map((c) => c.sym);
  const rigged = reels.source === 'lever' && !game.spunThisChapter && chapter.riggedSpin;
  const result = rigged ? chapter.riggedSpin : { reels: syms, payout: payoutFor(syms, reels.source) };
  const kind = payoutKind(result);
  const paid = applyBoon(
    { ...game, econ: applyPayout(game.econ, result.payout, game.boons.mult) },
    result.payout.boon === undefined ? null : result.payout.boon,
  );
  const settled = toast(note({
    ...paid,
    reels: { ...reels, phase: 'paying', t: 0, result },
    spunThisChapter: game.spunThisChapter || reels.source === 'lever',
    idleT: 0,
  }, 'payout', { kind, boon: result.payout.boon === undefined ? null : result.payout.boon, source: reels.source, writs: result.payout.writs }),
  kind, result.payout.name);
  const effects = [sfx(kind), ...(kind === 'jackpot' ? [{ type: 'flash', color: '#ffd76a' }] : [])];
  if (kind === 'payout') return ok(settled, effects);
  return then(ok(settled, effects), (g) => bark(content, g, kind));
}

/** Reel time: turning reels run down and lock; a full line pays; a paid line clears. */
function tickReels(content, game, dt) {
  const { reels } = game;
  if (reels.phase === 'paying') {
    const t = reels.t + dt;
    return ok({ ...game, reels: t >= PAY_SECONDS ? clearCells(reels) : { ...reels, t } });
  }
  if (reels.phase !== 'open') throw new Error(`game: unknown reels phase ${JSON.stringify(reels.phase)}`);
  if (!turning(reels)) return ok(game);
  const cells = reels.cells.map((c) => (c.spin > 0 ? { sym: c.sym, spin: c.spin - dt > 1e-9 ? c.spin - dt : 0 } : c));
  const stops = cells.filter((c, i) => c.spin === 0 && reels.cells[i].spin > 0).map(() => sfx('reelStop'));
  const ticked = { ...game, reels: { ...reels, cells, t: reels.t + dt } };
  if (cells.some((c) => c.sym === null || c.spin > 0)) return ok(ticked, stops);
  return then(ok(ticked, stops), (g) => settleReels(content, g));
}

// ───────────────────────── the lever ─────────────────────────

/**
 * What a press of the plunger button would do as the lever, or null when it is not the lever
 * (a ball is on the table or a writ will bring one).
 *   'wait'    the reels are still turning, or the table emptied a moment ago
 *   'free'    the chapter's scripted first pull
 *   'credit'  the Commons is passing the hat and the player will not wait for it: the pull
 *             is drawn on the Mint, a loan and a spin in the one press, whatever is in the purse
 *   'pull'    pays SPIN_COST and spins
 *   'loan'    cannot pay: the press borrows, and the next press pulls
 *
 * 'credit' is what makes the ending a choice. Without it the lever only ever borrows when
 * the purse is empty, the count of loans measures luck and skill, and a player who turns
 * the Commons down every time ends with the same book as one who never does: before this
 * existed the two playthrough bots took 0-16 and 3-21 loans over 16 seeds. See TRUST_PER_LOAN
 * in economy.js.
 */
export function leverStatus(content, game) {
  if (game.mode !== 'play' || game.phys.balls.length > 0 || game.econ.writs > 0) return null;
  if (turning(game.reels) || game.emptyT < LEVER_DELAY) return 'wait';
  if (!game.spunThisChapter && currentChapter(content, game).riggedSpin) return 'free';
  if (aidAvailable(game.econ)) return 'credit';
  if (canSpin(game.econ)) return 'pull';
  if (needsLoan(game.econ)) return 'loan';
  throw new Error(`game: an empty table that can neither pay for a spin nor borrow: ${JSON.stringify(game.econ)}`);
}

const borrow = (content, game, text, refusedHat = false) => then(
  ok(toast(note({ ...game, econ: takeLoan(game.econ, refusedHat) }, 'loan', { refused: refusedHat }), 'loan', text), [sfx('loan')]),
  (g) => bark(content, g, 'loan', true),
);

function paidPull(game) {
  const { rng, result } = spin(game.rng, 'lever');
  return spinReels({ ...game, rng, econ: paySpin(game.econ), emptyT: 0 }, 'lever', result.reels);
}

const LEVER = {
  wait: (content, game) => ok(game),
  // The scripted spin is on the house: it must land whatever the player can afford.
  free: (content, game) => spinReels(
    { ...game, econ: { ...game.econ, spins: game.econ.spins + 1 }, emptyT: 0 },
    'lever', currentChapter(content, game).riggedSpin.reels,
  ),
  credit: (content, game) => then(
    borrow(content, game, 'You would not wait for the hat. The Mint advances the pull, at interest.', true),
    paidPull,
  ),
  pull: (content, game) => paidPull(game),
  loan: (content, game) => borrow(content, game, 'The Mint advances you marks, at interest. Pull again.'),
};

/** The plunger button was pressed this tick. */
function pullLever(content, game) {
  const status = leverStatus(content, game);
  if (status === null) return ok(game);
  const act = LEVER[status];
  if (!act) throw new Error(`game: unknown lever status ${JSON.stringify(status)}`);
  return act(content, game);
}

// ───────────────────────── play (the Orrery) ─────────────────────────

/** Go to the table. The press that is already down when play begins is not a lever pull. */
function enterPlay(content, game) {
  const playing = { ...enterMode(game, 'play'), idleT: 0, emptyT: 0, plungeWas: true };
  return ok(playing, [music(currentChapter(content, game).music.play)]);
}

/**
 * Speak the scene's briefing over play, once, when a ball is first in motion in the scene:
 * straight away after a cutscene, and not until the launch when the scene opens on an empty
 * table (the lever and its payout come first, and have their own voices).
 */
function brief(content, game) {
  if (game.briefed || !game.phys.balls.some((b) => b.state !== 'plunger')) return ok(game);
  const scene = currentScene(content, game);
  if (!scene) return ok(game);
  const briefing = heardLines(scene.briefing, game);
  const spoken = briefing.reduce((s, line) => s + lineSeconds(line), 0);
  return ok(
    { ...game, briefed: true, barkCool: Math.max(game.barkCool, spoken + 2) },
    briefing.flatMap((line) => sayEffects(line, false)),
  );
}

/** Boon clocks run only while a ball is in play: a save won at the lever is not spent waiting at the plunger. */
function tickBoons(game, dt) {
  const idle = { ...game, idleT: game.idleT + dt };
  if (!game.phys.balls.some((b) => b.state !== 'plunger')) return idle;
  const { boons } = game;
  const multT = Math.max(0, boons.multT - dt);
  return {
    ...idle,
    boons: { ...boons, ballSave: Math.max(0, boons.ballSave - dt), mult: multT > 0 ? boons.mult : 1, multT },
  };
}

function eventSfx(ev) {
  return sfx(ev.type, Math.min(1, Math.max(0.15, ev.speed / 1200)));
}

/**
 * A ball left the plunger: this is the moment its writ is spent. Once per ball: a weak
 * plunge that rolls back down the lane and is plunged again has already paid.
 */
function onLaunch(content, game, ev) {
  const onTable = new Set(game.phys.balls.map((b) => b.id));
  const paid = game.paid.filter((id) => onTable.has(id));
  if (paid.includes(ev.ballId)) return ok({ ...game, paid });
  const charged = game.freeBalls > 0
    ? { ...game, freeBalls: game.freeBalls - 1 }
    : { ...game, econ: spendWrit(game.econ) };
  return bark(content, note({ ...charged, paid: [...paid, ev.ballId], multiT: 0 }, 'launch'), 'launch');
}

function onDrain(content, table, game) {
  const shaken = [{ type: 'shake', power: 0.5 }];
  const balls = game.phys.balls.length;   // the drained ball is already gone
  if (game.boons.ballSave <= 0) return then(ok(note(game, 'drain', { saved: false, balls }), shaken), (g) => bark(content, g, 'drain'));
  const saved = toast(
    note(note({ ...game, phys: addBall(table, game.phys), freeBalls: game.freeBalls + 1 }, 'drain', { saved: true, balls }), 'save', { kind: 'ballSave' }),
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

/**
 * A ball is in an outlane with a kickback held: it is lifted over the post into the inlane
 * beside it, once. Not fired back up the outlane, which is the obvious kickback: every
 * table has a rubber guard above the outlane mouth that a ball going straight up meets
 * from underneath and comes straight back down from.
 */
function kickBack(content, table, game, ev) {
  if (game.boons.kickback <= 0) return ok(game);
  const inlane = table.rollovers.find((r) => r.id === KICK_TO[ev.id]);
  if (!inlane) throw new Error(`game: table ${JSON.stringify(table.id)} has outlane ${ev.id} but no inlane ${KICK_TO[ev.id]} to kick back to`);
  const balls = game.phys.balls.map((b) => (b.id === ev.ballId && b.state === 'live'
    ? { ...b, pos: [inlane.pos[0], inlane.pos[1] - KICKBACK_LIFT], vel: [0, KICKBACK_SPEED], inside: [] } : b));
  const kicked = toast(
    note({ ...game, phys: { ...game.phys, balls }, boons: { ...game.boons, kickback: game.boons.kickback - 1 } }, 'save', { kind: 'kickback' }),
    'save', 'Kicked back.',
  );
  return then(ok(kicked, [sfx('eject'), { type: 'shake', power: 0.3 }]), (g) => bark(content, g, 'save'));
}

const EVENT_EXTRAS = {
  launch: (content, table, game, ev) => onLaunch(content, game, ev),
  drain: onDrain,
  bumper: (content, table, game) => onBumper(content, game),
  shot: (content, table, game) => bark(content, game, 'ramp'),
};

/** What an element means to the reels, by the table's own lists. An element in neither list means nothing. */
function reelsEvent(content, table, game, ev) {
  if (!HIT_TYPES.has(ev.type) || ev.id === undefined) return ok(game);
  if (!table.reels) throw new Error(`game: table ${JSON.stringify(table.id)} has no reels: { fill, spin }`);
  const lane = table.reels.fill.indexOf(ev.id);
  if (lane >= 0) return fillReel(game, lane);
  if (table.reels.spin.includes(ev.id)) return spinShot(game, ev);
  if (Object.hasOwn(KICK_TO, ev.id)) return kickBack(content, table, game, ev);
  return CHARGE_TYPES.has(ev.type) ? chargeReels(game) : ok(game);
}

/** A hit, as the log names it: a rollover is a lane, and a shot says whether the table carried the ball. */
function noteHit(table, game, ev) {
  const type = LOG_AS[ev.type];
  if (type !== 'shot') return note(game, type, { id: ev.id });
  const shot = table.shots.find((s) => s.id === ev.id);
  if (!shot) throw new Error(`game: table ${JSON.stringify(table.id)} has no shot ${JSON.stringify(ev.id)}`);
  return note(game, 'shot', { id: ev.id, via: shot.exit ? 'ramp' : 'orbit' });
}

// ───────────────────────── Lanewar (fray.js) ─────────────────────────
// The tin-soldier board. The table sets it (FRAY_NEED hits), the saucer opens it, and the ball waits in
// the saucer while it is played: mode 'fray' steps no physics, so the saucer's own clock holds still and
// the ball comes out when play resumes. What comes back is score and, for leaving by choice, a ball save.
// Never marks: marks are what the ending is read from, and a board that paid them would let the lever be
// fed from somewhere the Mint and the Commons have no say in.

/** What an element means to the board: a bumper, sling or target sets it; the saucer, once set, opens it. */
function frayEvent(game, ev) {
  const { fray } = game;
  if (fray.lit) return ok(ev.type === 'saucer' ? { ...game, frayDue: true } : game);
  if (!CHARGE_TYPES.has(ev.type)) return ok(game);
  const charge = fray.charge + 1;
  if (charge < FRAY_NEED) return ok({ ...game, fray: { ...fray, charge } });
  return ok(toast({ ...game, fray: { ...fray, charge: FRAY_NEED, lit: true } }, 'hint', 'The Lanewar board is set. Shoot the saucer.'), [sfx('confirm')]);
}

/** The run's seed: from the table's rng and how much has happened, without drawing from the table's rng. */
const fraySeed = (game) => (game.rng.s ^ Math.imul(game.logged + 1, 0x9e3779b1) ^ Math.imul(game.fray.felled + 1, 0x85ebca6b)) >>> 0;

function enterFray(content, game) {
  const run = startRun(game.fray, fraySeed(game));
  const opened = toast({ ...enterMode(game, 'fray'), run, frayAcc: 0, frayDue: false, fray: { ...game.fray, lit: false, charge: 0 } },
    'scene', `Lanewar: wave ${run.wave}`);
  return ok(opened, [sfx('card'), { type: 'flash', color: '#ffffff' }]);
}

/** What a step of the board sounded like: everything in the run's log that `before` had not yet seen. One sound of a kind a step. */
function fraySounds(before, run) {
  const out = [];
  let kills = 0, hurt = 0, tin = 0, shot = false, blast = false, swing = false, cleared = false, fallen = false, level = false;
  for (const e of run.fx) {
    if (e.n < before.fxN) continue;
    if (e.type === 'kill') kills++;
    else if (e.type === 'hurt') hurt += e.dmg;
    else if (e.type === 'tin') tin += e.v;
    else if (e.type === 'shot') shot = true;
    else if (e.type === 'blast' || e.type === 'flame') blast = true;
    else if (e.type === 'swing') swing = true;
    else if (e.type === 'level') level = true;
    else if (e.type === 'cleared') cleared = true;
    else if (e.type === 'fallen') fallen = true;
  }
  if (shot) out.push(sfx('frayShot', 0.45));
  if (swing) out.push(sfx('fraySlash', 0.3));
  if (blast) out.push(sfx('frayBoom', 0.8), { type: 'shake', power: 0.25 });
  if (kills > 0) out.push(sfx('frayFell', Math.min(1, 0.4 + kills * 0.12)));
  if (tin > 0) out.push(sfx('frayCoin', Math.min(1, 0.4 + tin * 0.08)));
  if (hurt > 0) out.push(sfx('frayHurt', 0.9), { type: 'shake', power: 0.5 }, { type: 'flash', color: '#ff5a4a' });
  if (level) out.push(sfx('confirm'));
  if (cleared) out.push(sfx('sceneClear'));
  if (fallen) out.push(sfx('drain'), { type: 'flash', color: '#ff5a4a' });
  return out;
}

/**
 * The board's time. It steps at fray.DT (every second tick of the table's clock), with the stick as it is now:
 * msg.input.move, [x, y] each -1..1, and standing still when the shell sends none.
 */
function frayTick(content, game, msg) {
  const acc = game.frayAcc + msg.dt;
  if (acc < FRAY_DT - 1e-9) return ok({ ...game, frayAcc: acc });
  const before = game.run;
  const run = frayStep(before, (msg.input && msg.input.move) || STILL);
  return ok({ ...game, run, frayAcc: acc - FRAY_DT }, run === before ? [] : fraySounds(before, run));
}
const STILL = Object.freeze([0, 0]);

/** Back to the table with what the run earned. The ball is still in the saucer and comes out on its own clock. */
function leaveFray(content, game) {
  const { banked, score, meta } = fraySettle(game.fray, game.run);
  const paid = { ...game, run: null, fray: meta, econ: awardBonus(game.econ, score) };
  const safe = banked
    ? { ...paid, boons: { ...paid.boons, ballSave: Math.max(paid.boons.ballSave, FRAY_SAVE_SECONDS) } }
    : paid;
  const told = toast(safe, banked ? 'payout' : 'bust',
    banked ? `Lanewar: ${score} carried home. Ball save lit.` : `Lanewar: fallen at wave ${game.run.wave}. ${score} kept.`);
  return then(ok(told, [sfx(banked ? 'payout' : 'bust')]), (g) => enterPlay(content, g));
}

/**
 * The reels, between waves: {type:'fray'} with one of pull:true, hold:i, take:i, next:true, leave:true.
 * One that cannot be done now (no tin, reels still turning, a wave in progress) changes nothing.
 */
function frayMsg(content, game, msg) {
  const { run } = game;
  const known = msg.pull === true || msg.next === true || msg.leave === true || Number.isInteger(msg.hold) || Number.isInteger(msg.take);
  if (!known) throw new Error(`game: a fray message needs pull, hold, take, next or leave: ${JSON.stringify(msg)}`);
  if (msg.leave === true) return frayCanLeave(run) ? leaveFray(content, game) : ok(game);
  if (run.phase !== 'shop') return ok(game);
  let next_, sound;
  if (msg.pull === true) { next_ = frayPull(run); sound = [sfx('reelStart')]; }
  else if (Number.isInteger(msg.hold)) { next_ = frayHold(run, msg.hold); sound = [sfx('reelStop')]; }
  else if (Number.isInteger(msg.take)) { next_ = frayTake(run, msg.take); const last = next_.fx[next_.fx.length - 1]; sound = [sfx(last && last.type === 'took' && last.mult >= 3 ? 'jackpot' : 'payout')]; }
  else { next_ = frayNext(run); sound = [sfx('card')]; }
  if (next_ === run) return ok(game);
  const told = msg.next === true ? toast({ ...game, run: next_ }, 'scene', `Lanewar: wave ${next_.wave}`) : { ...game, run: next_ };
  return ok(told, sound);
}

const frayHandlers = {
  tick: frayTick,
  fray: frayMsg,
  // The fallen board is dismissed like a card. In a wave or at the reels Enter does nothing: neither has a default.
  confirm: (content, game) => (game.run.phase === 'over' ? leaveFray(content, game) : ok(game)),
};

/** One physics event: sound, points, objective progress, the reels, and whatever else its type means. */
function onEvent(content, table, game, ev) {
  if (!(ev.type in POINTS)) throw new Error(`game: unknown physics event type ${JSON.stringify(ev.type)}`);
  const points = POINTS[ev.type];
  let g = points > 0
    ? { ...game, econ: awardPoints(game.econ, points, game.boons.mult), idleT: 0 }
    : game;
  const effects = [eventSfx(ev)];
  if (HIT_TYPES.has(ev.type) && ev.id !== undefined) {
    g = noteHit(table, g, ev);
    // The chain this hit belongs to pays extra score, and only score (stage.comboBonus says why).
    const bonus = comboBonus(g.recent, g.t, points);
    if (bonus > 0) g = { ...g, econ: awardBonus(g.econ, bonus) };
  }
  const scene = currentScene(content, g);
  if (scene && HIT_TYPES.has(ev.type) && ev.id !== undefined) {
    // a lit target of a bank passes its hit along the bank (story.spotFor)
    const spot = spotFor(table, scene, g.hits, ev.id);
    const hit = registerHit(scene, g.hits, g.seq, spot);
    if (hit.progressed) {
      const { done, total } = objectiveProgress(scene, hit.hits, hit.seq);
      g = note({ ...g, hits: hit.hits, seq: hit.seq }, 'objective', { id: spot, done, total });
      effects.push(sfx('objective'));
    }
  }
  const step = then(then(ok(g, effects), (h) => reelsEvent(content, table, h, ev)), (h) => frayEvent(h, ev));
  const extra = EVENT_EXTRAS[ev.type];
  return extra ? then(step, (h) => extra(content, table, h, ev)) : step;
}

/**
 * Objective met: pay the reward, earn the town's trust, and cut to the scene. In the final
 * chapter this is also where the ledger is read, once (story.readsLeaning says at which scene):
 * after this scene's own trust is entered, and before the first line that depends on it.
 */
function completeScene(content, game, scene) {
  const rewarded = addTrust(
    awardPoints(game.econ, scene.reward.points, game.boons.mult),
    scene.reward.trust || 0,
  );
  const ending = game.ending === null && readsLeaning(content, game.chapter, game.scene) ? leaning(rewarded) : game.ending;
  const trust = rewarded.trust - game.econ.trust;
  const trusted = trust > 0 ? note(game, 'trust', { gained: trust, trust: rewarded.trust }) : game;
  const cleared = toast(note({ ...trusted, econ: rewarded, ending }, 'sceneClear', { scene: scene.id }), 'scene', scene.title);
  const effects = [sfx('sceneClear'), { type: 'flash', color: '#ffffff' }];
  return then(ok(cleared, effects), (g) => startCine(content, g, 'scene', scene.cutscene));
}

/**
 * Keep a ball on the table. None left: a writ puts a new one at the plunger (spent at
 * launch). No writ either: wait for any reel still turning, since the line may pay one.
 * Then the Commons, if the town trusts you, passes the hat, which takes AID_WAIT seconds;
 * and all the while the plunger button is the lever (pullLever). The Mint is quicker than
 * the Commons and that is the choice: whoever will not wait for the hat pays, or borrows.
 */
function supplyBall(content, table, game, dt) {
  if (game.phys.balls.length > 0) return ok(game.emptyT === 0 ? game : { ...game, emptyT: 0 });
  if (game.econ.writs > 0) return ok({ ...game, emptyT: 0, phys: addBall(table, game.phys) });
  if (turning(game.reels)) return ok(game);
  const emptyT = game.emptyT + dt;
  const waiting = { ...game, emptyT };
  if (!aidAvailable(game.econ)) return ok(waiting);
  if (game.emptyT === 0) return ok(toast(note(waiting, 'hat'), 'aid', 'The Commons is passing the hat for you.'));
  if (emptyT < AID_WAIT) return ok(waiting);
  const aided = toast(
    note({ ...waiting, emptyT: 0, econ: takeAid(game.econ), phys: addBall(table, game.phys) }, 'aid'),
    'aid', 'The Commons covers your ball. Nothing is owed.',
  );
  return then(ok(aided, [sfx('aid')]), (g) => bark(content, g, 'aid', true));
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

/** One fixed step of the table: physics, the reels, the step's events, the objective, ball supply, the lever. */
function playTick(content, game, msg) {
  if (!msg.input) throw new Error('game: a tick in play needs msg.input');
  const table = tableOf(content, game);
  const pressed = !!msg.input.plunge && !game.plungeWas;
  const stepped = stepPhysics(table, game.phys, msg.input, msg.dt);
  const moved = { ...tickBoons(game, msg.dt), phys: stepped.phys, plungeWas: !!msg.input.plunge, frayDue: false };
  // The briefing goes first so that it, not a launch bark, is what is heard as the scene opens.
  // Reel time passes before this tick's events, so a reel an event starts has its full time to run.
  let step = then(brief(content, moved), (g) => tickReels(content, g, msg.dt));
  step = stepped.events.reduce((s, ev) => then(s, (g) => onEvent(content, table, g, ev)), step);
  const scene = currentScene(content, step.game);
  if (scene && objectiveProgress(scene, step.game.hits, step.game.seq).complete) {
    // The scene's cutscene comes first. The board stays set for the next saucer.
    return then(step, (g) => completeScene(content, { ...g, frayDue: false }, scene));
  }
  if (step.game.frayDue) return then(step, (g) => enterFray(content, g));
  step = then(step, (g) => supplyBall(content, table, g, msg.dt));
  if (pressed) step = then(step, (g) => pullLever(content, g));
  step = then(step, (g) => feedMultiball(table, g, msg.dt));
  return then(step, (g) => idleBark(content, g));
}

const playHandlers = { tick: playTick };

// ───────────────────────── update ─────────────────────────

const MODES = {
  title: titleHandlers,
  card: cardHandlers,
  cine: cineHandlers,
  play: playHandlers,
  fray: frayHandlers,
  end: endHandlers,
};

const MSG_TYPES = new Set(['tick', 'confirm', 'skip', 'lineDone', 'load', 'fray']);

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
