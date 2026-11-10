// The stage model: what the live 3D stage should be showing, as a pure function of content and game.
//
//   stageState(content, game) -> StageState      which set, who stands on it, the opposition and its bar,
//                                                the combo, how much power the table is sending up, the buffs
//   comboOf(log, now, opts)   -> Combo           the chain a log of table events amounts to
//   pushRecent(log, entry)    -> log             the reducer's bounded event log (game.recent)
//
// No DOM, no clock, no mutation. The shell reads; nothing here is read back by the rules of the game
// except COMBO_MULT, which game.js uses to add bonus SCORE (never marks: see comboBonus).
//
// game.recent is the event log. Each entry is { n, t, type, ...detail }: n counts up from 0 for the life
// of the Game value (the shell keeps a cursor on it; it starts again at 0 after a load), t is game.t.
// Types and their detail:
//   launch                                   a ball left the plunger
//   bumper | sling | target | saucer  { id }
//   lane    { id }                           any rollover: lot lanes, inlanes, outlanes
//   shot    { id, via: 'ramp' | 'orbit' }    ramp when the table carries the ball (shot.exit), else orbit
//   objective { id, done, total }            the scene's objective moved on (id: the element it counted for)
//   sceneClear { scene }                     the objective is complete; the cutscene follows
//   trust   { gained, trust }                the town's trust rose by `gained`, to `trust` (scene rewards)
//   payout  { kind: 'payout' | 'jackpot' | 'bust', boon, source, writs }
//   lit                                      the spin shots lit again
//   drain   { saved, balls }                 saved: a ball save covered it. balls: balls left on the table
//   save    { kind: 'ballSave' | 'kickback' }
//   hat                                      the table is empty and the Commons has begun passing the hat
//   aid                                      the hat came round: a ball, nothing owed
//   loan    { refused }                      a loan from the Mint; refused: drawn while the hat was going round
//   chain   { count, last }                  not an event: older entries folded away (see pushRecent)

import { aidAvailable } from './economy.js';
import { currentChapter, currentScene, objectiveProgress } from './story.js';

// ───────────────────────── combos ─────────────────────────

/** How much each logged event adds to a chain. Anything not listed does not count (and does not break it). */
export const COMBO_WEIGHT = Object.freeze({ bumper: 1, sling: 1, lane: 1, target: 2, saucer: 2, shot: 3, payout: 3, objective: 2 });
/**
 * Seconds a chain survives without a counting event, and the chain count at which each level begins:
 * level 1 single jabs, 2 two characters together, 3 the named team move, 4 the big one.
 *
 * Tuned on the playthrough bots so that the levels are an escalation and the top one is an occasion. With the
 * director's first numbers (4.5 s, 1/5/11/20) a chain only ends on a drain, the count runs away, and the
 * mediocre bot (somebody's first evening: late flips, one ball in eight missed) stood at level 4 for 31% of
 * its time at the table and the steady bot for 73%: FESTIVAL STORM was the weather. With these, share of
 * table time at levels 0..4 over a whole eight-chapter game:
 *   mediocre  25 27 26 17  5 %   reaching level 2 3.7 times a minute, level 3 1.6, level 4 once in three minutes
 *   steady     9 16 20 27 28 %   (no person plays like the steady bot)
 */
export const COMBO_WINDOW = 3;
export const COMBO_LEVELS = Object.freeze([1, 8, 20, 45]);
/** What the stage calls each level. Levels 0 and 1 have no name. */
export const COMBO_NAMES = Object.freeze(['', '', 'DOUBLE', 'LANTERN RUSH', 'FESTIVAL STORM']);
/** Score multiplier by level, for table hits. Score only: see comboBonus. */
export const COMBO_MULT = Object.freeze([1, 1, 1.5, 2, 3]);

const NEVER = -Infinity;

function counts(e) {
  if (e.type === 'payout') return e.kind === 'bust' ? 0 : COMBO_WEIGHT.payout;   // a bust is not a hit
  return COMBO_WEIGHT[e.type] || 0;
}

/** Walk a log to `now`: the chain's count and the time of its last counting event. */
function chainOf(log, now, window) {
  let count = 0;
  let last = NEVER;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || typeof e.t !== 'number' || Number.isNaN(e.t)) {
      throw new Error(`stage.comboOf: log entry ${i} has no time: ${JSON.stringify(e)}`);
    }
    if (e.t > now) break;
    if (e.type === 'chain') { count = e.count; last = e.count > 0 ? e.last : NEVER; continue; }
    if (e.type === 'drain') { if (!e.saved) { count = 0; last = NEVER; } continue; }
    const w = counts(e);
    if (!w) continue;
    if (e.t - last > window) count = 0;
    count += w;
    last = e.t;
  }
  if (now - last > window) { count = 0; last = NEVER; }
  return { count, last };
}

/**
 * The combo a log of table events amounts to at time `now`. `log` is game.recent (or any
 * [{ t, type }], oldest first). A drain that no ball save covered ends the chain; so does
 * `window` seconds without a counting event. Pure: same log, same answer.
 * @returns {{count:number, level:number, left:number, last:number, name:string, mult:number}}
 *   level 0..levels.length; left: 0..1 of the window remaining; last: time of the last counting
 *   event (-Infinity when there is no chain); mult: the score multiplier at this level.
 */
export function comboOf(log, now, { window = COMBO_WINDOW, levels = COMBO_LEVELS } = {}) {
  if (!Array.isArray(log)) throw new Error(`stage.comboOf: log must be an array, got ${JSON.stringify(log)}`);
  if (typeof now !== 'number' || Number.isNaN(now)) throw new Error(`stage.comboOf: now must be a number, got ${String(now)}`);
  if (!(window > 0)) throw new Error(`stage.comboOf: window must be > 0, got ${String(window)}`);
  const { count, last } = chainOf(log, now, window);
  let level = 0;
  while (level < levels.length && count >= levels[level]) level++;
  const left = count > 0 ? Math.min(1, Math.max(0, 1 - (now - last) / window)) : 0;
  return {
    count, level, left, last,
    name: COMBO_NAMES[Math.min(level, COMBO_NAMES.length - 1)],
    mult: COMBO_MULT[Math.min(level, COMBO_MULT.length - 1)],
  };
}

/**
 * Extra SCORE a table hit worth `points` earns at the chain `log` describes at `now`. Whole points.
 *
 * Score, and nothing else. The obvious version multiplies the points before they are awarded, and that is
 * wrong here: points become marks, marks pay for pulls of the lever, and a purse that can pay does not
 * borrow. A combo that paid marks would move loansTaken, and so the ledger the ending is read from, by
 * how fast the player's hands are. Score is never spent and nothing reads it, so the bonus goes there.
 */
export function comboBonus(log, now, points) {
  if (!(points > 0)) return 0;
  return Math.round(points * (comboOf(log, now).mult - 1));
}

// ───────────────────────── the log ─────────────────────────

/** Most entries game.recent holds. */
export const RECENT_MAX = 48;
const FOLD = 16;   // how many of the oldest are folded into one 'chain' entry when the log is full

/**
 * Append an entry to the log, keeping it bounded. When it would pass RECENT_MAX the oldest FOLD entries are
 * replaced by one { type: 'chain', t, count, last } entry holding the chain as it stood after them, so that
 * comboOf(log, now) gives the same answer as it would on the whole history (at the default window) for any
 * `now` at or after the newest entry. Just dropping them is the obvious version and is wrong: a long chain
 * would lose count as its early hits fell off the front, and the counter on the stage would run backwards.
 */
export function pushRecent(log, entry) {
  if (!entry || typeof entry.type !== 'string' || typeof entry.t !== 'number') {
    throw new Error(`stage.pushRecent: an entry needs a type and a time: ${JSON.stringify(entry)}`);
  }
  if (log.length > 0 && entry.t < log[log.length - 1].t) {
    throw new Error(`stage.pushRecent: entry at ${entry.t} is older than the log's newest (${log[log.length - 1].t})`);
  }
  if (log.length < RECENT_MAX) return [...log, entry];
  const old = log.slice(0, FOLD);
  const at = old[old.length - 1];
  const { count, last } = chainOf(old, at.t, COMBO_WINDOW);
  return [{ n: at.n, t: at.t, type: 'chain', count, last: count > 0 ? last : null }, ...log.slice(FOLD), entry];
}

// ───────────────────────── encounters ─────────────────────────

export const ENCOUNTER_KINDS = Object.freeze(['people', 'force']);
/** What the party is doing to the opposition: the family of actions the stage plays for table events. */
export const ENCOUNTER_MODES = Object.freeze(['fight', 'work', 'stealth', 'hold', 'talk', 'walk']);
export const LIGHTS = Object.freeze(['dusk', 'night', 'dawn', 'day', 'interior']);

/** Index of the beat an encounter is in when `done` of its objective is done: the last beat with at <= done. */
export function beatAt(encounter, done) {
  const beats = encounter.beats || [];
  let index = -1;
  for (let i = 0; i < beats.length; i++) if (beats[i].at <= done) index = i;
  return index;
}

/**
 * Everything wrong with a scene's encounter, as a list of sentences (empty: nothing). For tests, and for a
 * shell that wants to refuse a chapter at the door rather than half-draw it.
 */
export function encounterProblems(content, chapter, scene) {
  const e = scene.encounter;
  const at = `${scene.id}.encounter`;
  if (!e || typeof e !== 'object') return [`${scene.id} has no encounter`];
  const out = [];
  const isCast = (id) => Object.hasOwn(content.cast, id) && id !== 'narrator' && id !== 'crowd';
  if (typeof e.set !== 'string' || !e.set) out.push(`${at}.set must name a set`);
  if (!LIGHTS.includes(e.light)) out.push(`${at}.light must be one of ${LIGHTS.join(', ')}, got ${JSON.stringify(e.light)}`);
  if (!ENCOUNTER_MODES.includes(e.mode)) out.push(`${at}.mode must be one of ${ENCOUNTER_MODES.join(', ')}, got ${JSON.stringify(e.mode)}`);
  if (!Array.isArray(e.party) || e.party.length < 1 || e.party.length > 3) out.push(`${at}.party must list one to three cast ids`);
  else for (const id of e.party) if (!isCast(id)) out.push(`${at}.party names ${JSON.stringify(id)}, who is not a person in the cast`);
  const o = e.opposition;
  if (!o || typeof o !== 'object') out.push(`${at}.opposition is missing`);
  else {
    if (!ENCOUNTER_KINDS.includes(o.kind)) out.push(`${at}.opposition.kind must be one of ${ENCOUNTER_KINDS.join(', ')}`);
    if (!Array.isArray(o.who) || o.who.length < 1 || o.who.length > 3 || o.who.some((w) => typeof w !== 'string' || !w)) {
      out.push(`${at}.opposition.who must list one to three ids or type names`);
    }
    if (typeof o.name !== 'string' || !o.name || o.name.length > 22) out.push(`${at}.opposition.name must be 1 to 22 characters (it sits over the bar)`);
  }
  if (e.extras !== undefined && (!Array.isArray(e.extras) || e.extras.length > 3 || e.extras.some((w) => typeof w !== 'string' || !w))) {
    out.push(`${at}.extras must list at most three ids or type names`);
  }
  if (!e.setback || typeof e.setback.cue !== 'string' || typeof e.setback.show !== 'string') out.push(`${at}.setback needs a cue and what is shown`);
  const total = objectiveProgress(scene, {}, 0).total;
  const beats = e.beats;
  if (!Array.isArray(beats) || beats.length < 2) out.push(`${at}.beats must list at least an opening and a resolving beat`);
  else {
    if (beats[0].at !== 0) out.push(`${at}.beats must open at 0`);
    if (beats[beats.length - 1].at !== total) out.push(`${at}.beats must end at the objective's total (${total})`);
    const cues = new Set();
    beats.forEach((b, i) => {
      if (!Number.isInteger(b.at) || (i > 0 && b.at <= beats[i - 1].at)) out.push(`${at}.beats[${i}].at must be a whole number greater than the beat before`);
      if (typeof b.cue !== 'string' || !/^[a-z][a-z0-9-]*$/.test(b.cue)) out.push(`${at}.beats[${i}].cue must be a kebab-case key`);
      else if (cues.has(b.cue)) out.push(`${at}.beats[${i}].cue ${b.cue} is used twice`);
      else cues.add(b.cue);
      if (typeof b.name !== 'string' || !b.name || b.name.length > 28) out.push(`${at}.beats[${i}].name must be 1 to 28 characters`);
      if (typeof b.show !== 'string' || !b.show) out.push(`${at}.beats[${i}].show must say what is seen`);
    });
  }
  const sets = chapter.stage && chapter.stage.sets;
  if (!sets || !Object.hasOwn(sets, e.set)) out.push(`${at}.set ${JSON.stringify(e.set)} is not in ${chapter.id}.stage.sets`);
  return out;
}

// ───────────────────────── the state of the stage ─────────────────────────

/** Seconds of a scene's cutscene during which the stage is still the encounter, resolving, before it is the cutscene. */
export const RESOLVE_SECONDS = 1.2;
/** Trust per townsperson standing behind the party (the same step that buys one aid ball). */
export const TRUST_PER_SUPPORTER = 25;

const POWER = { idle: 0.6, empty: 0.25, waiting: 0.4, live: 0.55, perLevel: 0.1, recent: 0.15, recentSeconds: 6 };

/**
 * How much the table is sending up to the stage, 0..1. An empty table dims it; a ball waiting at the
 * plunger is a little better; a ball in play lights it, more for a chain and for a hit in the last few seconds.
 * The shell smooths it.
 */
function powerOf(game, combo) {
  if (game.mode !== 'play' || !game.phys) return POWER.idle;
  const balls = game.phys.balls;
  if (balls.length === 0) return POWER.empty;
  if (!balls.some((b) => b.state !== 'plunger')) return POWER.waiting;
  const since = game.t - combo.last;
  const fresh = since < POWER.recentSeconds ? 1 - since / POWER.recentSeconds : 0;
  return Math.min(1, POWER.live + POWER.perLevel * combo.level + POWER.recent * fresh);
}

/** What the party is carrying or backed by, from the economy and the boons. */
function buffsOf(game) {
  const { boons, econ, phys } = game;
  const inPlay = phys ? phys.balls.filter((b) => b.state !== 'plunger').length : 0;
  const empty = game.mode === 'play' && !!phys && phys.balls.length === 0 && econ.writs <= 0;
  return {
    shield: boons.ballSave,                               // seconds of ball save left
    double: boons.multT > 0 ? boons.mult : 1,             // the mark multiplier while it lasts, else 1
    doubleT: boons.multT,
    kickback: boons.kickback,                             // kickbacks held
    helpers: Math.max(0, inPlay - 1) + (game.multiQueue || 0),   // multiball: helpers beside the party
    hat: empty && (game.emptyT || 0) > 0 && aidAvailable(econ),  // the Commons is passing the hat right now
    supporters: Math.floor(econ.trust / TRUST_PER_SUPPORTER),    // townsfolk gathered behind the party
    trust: econ.trust,
    debt: econ.debt,                                      // marks owed: the Mint's clerk has reason to hang about
  };
}

function stageOfBg(chapter, bg, encounter) {
  // The cutscene is on the set the encounter was fought on: keep its light (a set may be lit two ways in one chapter).
  if (encounter && encounter.set === bg) return { set: encounter.set, light: encounter.light };
  const sets = chapter.stage && chapter.stage.sets;
  if (!sets) return { set: bg, light: null };             // a chapter not yet staged: the shell falls back to 2D
  if (!Object.hasOwn(sets, bg)) throw new Error(`stage: ${chapter.id}.stage.sets has no entry for backdrop ${JSON.stringify(bg)}`);
  return { set: sets[bg].set, light: sets[bg].light };
}

const NOTHING = { done: 0, total: 0 };

/**
 * What the stage should be showing now.
 *   phase 'fight'     in play: the scene's encounter. set/light/party/opposition/extras/mode are the encounter's,
 *                     progress is the objective's (the opposition's bar is total - done), beat is where it has got to
 *   phase 'resolve'   the first RESOLVE_SECONDS of the scene's cutscene: still the encounter, complete
 *   phase 'dialogue'  a cinematic: set and light come from the line's backdrop, party is who is on stage
 *                     (cine.on), and line/speaker/radio/cam/emote describe the line being spoken
 *   phase 'idle'      title, chapter card, end screen: nothing staged
 * Always present: combo (comboOf of game.recent at game.t), power 0..1, buffs.
 * A scene with no `encounter` (chapters whose sets do not exist yet) gives phase 'fight' with set null.
 */
export function stageState(content, game) {
  const combo = comboOf(game.recent || [], game.t);
  const base = {
    set: null, light: null, mode: null, party: [], opposition: null, extras: [],
    progress: NOTHING, beat: null, setback: null,
    combo, power: powerOf(game, combo), buffs: buffsOf(game),
    phase: 'idle', kind: null, line: null, speaker: null, radio: false, cam: null, emote: null,
  };
  if (game.mode === 'title' || game.mode === 'card' || game.mode === 'end') return base;
  const chapter = currentChapter(content, game);
  const scene = currentScene(content, game);
  const encounter = scene && scene.encounter ? scene.encounter : null;
  const inCine = game.mode === 'cine' && game.cine;
  const fought = () => {
    const p = objectiveProgress(scene, game.hits, game.seq);
    const done = inCine ? p.total : p.done;      // the reducer clears hits only when the cutscene ends, but say what is meant
    const i = beatAt(encounter, done);
    return {
      set: encounter.set, light: encounter.light, mode: encounter.mode,
      party: encounter.party, opposition: encounter.opposition, extras: encounter.extras || [],
      progress: { done, total: p.total },
      beat: i < 0 ? null : { index: i, of: encounter.beats.length, ...encounter.beats[i] },
      setback: encounter.setback || null,
    };
  };
  if (game.mode === 'play') {
    if (!scene) return base;
    if (!encounter) return { ...base, phase: 'fight', kind: 'scene', progress: (({ done, total }) => ({ done, total }))(objectiveProgress(scene, game.hits, game.seq)) };
    return { ...base, ...fought(), phase: 'fight', kind: 'scene' };
  }
  if (!inCine) throw new Error(`stage: cannot stage mode ${JSON.stringify(game.mode)} (cine: ${JSON.stringify(!!game.cine)})`);
  const { cine } = game;
  if (cine.kind === 'scene' && encounter && cine.t < RESOLVE_SECONDS) {
    return { ...base, ...fought(), phase: 'resolve', kind: 'scene' };
  }
  const line = cine.lines[cine.index];
  return {
    ...base,
    ...stageOfBg(chapter, cine.bg, cine.kind === 'scene' ? encounter : null),
    party: cine.on,
    phase: 'dialogue', kind: cine.kind,
    line, speaker: line.who, radio: line.fx === 'radio', cam: line.cam || null, emote: line.emote || null,
  };
}

/** Every set id a chapter needs, in first-use order: its encounters' sets and every backdrop its cinematics name. [] when the chapter is not staged. */
export function setsNeeded(chapter) {
  if (!chapter.stage || !chapter.stage.sets) return [];
  const seen = new Set();
  const want = (bg) => {
    if (!Object.hasOwn(chapter.stage.sets, bg)) throw new Error(`stage: ${chapter.id}.stage.sets has no entry for backdrop ${JSON.stringify(bg)}`);
    seen.add(chapter.stage.sets[bg].set);
  };
  const lines = (ls) => { for (const l of ls) if (l.bg) want(l.bg); };
  lines(chapter.prologue);
  for (const s of chapter.scenes) { if (s.encounter) want(s.encounter.set); lines(s.cutscene); }
  lines(chapter.epilogue);
  return [...seen];
}
