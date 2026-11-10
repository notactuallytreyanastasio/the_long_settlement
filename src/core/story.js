// Story helpers: pure functions over content and game state.
// Used by game.js (the reducer) and by the renderer. No DOM; the only import is the ledger's reading.

import { leaning } from './economy.js';

/** The two sides a ledger can lean to, and so the two endings. */
export const LEANINGS = Object.freeze(['commons', 'mint']);

/**
 * The chapter the game is in. Throws when the index is out of range: there is
 * no sensible chapter to pretend with.
 */
export function currentChapter(content, game) {
  const chapter = content.chapters[game.chapter];
  if (!chapter) throw new Error(`story: no chapter at index ${game.chapter}`);
  return chapter;
}

/**
 * The scene being played, or null when the chapter's scenes are exhausted
 * (the epilogue is running, or the game has ended).
 */
export function currentScene(content, game) {
  const scene = currentChapter(content, game).scenes[game.scene];
  return scene === undefined ? null : scene;
}

function checkObjective(scene) {
  const o = scene.objective;
  if (!o || !Array.isArray(o.ids) || o.ids.length === 0) {
    throw new Error(`story: scene ${scene.id} has an objective with no ids`);
  }
  if (o.kind === 'count' && !(Number.isInteger(o.n) && o.n > 0)) {
    throw new Error(`story: scene ${scene.id} count objective needs a positive integer n, got ${o.n}`);
  }
  return o;
}

/** @returns {{done:number,total:number,complete:boolean}} */
export function objectiveProgress(scene, hits, seq) {
  const o = checkObjective(scene);
  const hit = (id) => hits[id] || 0;
  let done;
  let total;
  if (o.kind === 'all') {
    const unique = [...new Set(o.ids)];
    done = unique.filter((id) => hit(id) > 0).length;
    total = unique.length;
  } else if (o.kind === 'count') {
    const sum = [...new Set(o.ids)].reduce((n, id) => n + hit(id), 0);
    done = Math.min(o.n, sum);
    total = o.n;
  } else if (o.kind === 'sequence') {
    done = Math.min(seq, o.ids.length);
    total = o.ids.length;
  } else {
    throw new Error(`story: scene ${scene.id} has unknown objective kind ${JSON.stringify(o.kind)}`);
  }
  return { done, total, complete: done >= total };
}

/**
 * Register a hit on a table element against a scene's objective.
 * Returns the new progress fields and whether the hit moved the objective on.
 * A hit on an element the objective does not name changes nothing.
 */
export function registerHit(scene, hits, seq, id) {
  const o = checkObjective(scene);
  const same = { hits, seq, progressed: false };
  if (!o.ids.includes(id)) return same;
  const bumped = { ...hits, [id]: (hits[id] || 0) + 1 };
  if (o.kind === 'all') return { hits: bumped, seq, progressed: !(hits[id] > 0) };
  if (o.kind === 'count') return { hits: bumped, seq, progressed: true };
  if (o.kind === 'sequence') {
    return o.ids[seq] === id ? { hits: bumped, seq: seq + 1, progressed: true } : same;
  }
  throw new Error(`story: scene ${scene.id} has unknown objective kind ${JSON.stringify(o.kind)}`);
}

/**
 * Spotting. Which element a hit on `id` counts for in this scene: `id` itself, except that in an 'all'
 * objective a standup target that is already lit passes its hit to the nearest target of its own bank
 * (the same `group` in the table) that the objective still needs. Nearest by place in the bank, the lower
 * one on a tie.
 *
 * Without this, "light all four seals" is four separate shots at targets about 20 units wide. Fired from a
 * trapped ball each one is open for 8 to 17 ms (measured: every standup on every table), which nobody aims
 * for; so banks are finished by luck, and the last target of a bank is where a scene stalls (the worst seeds
 * of the bank scenes ran 4 to 6 minutes). With it the shot is the bank, and every hit on the bank is progress.
 * Lanes, saucers and shots are not spotted: only table.targets, and only in 'all' objectives.
 */
export function spotFor(table, scene, hits, id) {
  const o = checkObjective(scene);
  if (o.kind !== 'all' || !o.ids.includes(id) || !(hits[id] > 0)) return id;
  if (!table || !Array.isArray(table.targets)) throw new Error(`story: spotFor needs a table with targets, got ${JSON.stringify(table && table.id)}`);
  const at = table.targets.findIndex((t) => t.id === id);
  if (at < 0 || table.targets[at].group === undefined) return id;
  const { group } = table.targets[at];
  let best = -1;
  table.targets.forEach((t, i) => {
    if (t.group !== group || !o.ids.includes(t.id) || hits[t.id] > 0) return;
    if (best < 0 || Math.abs(i - at) < Math.abs(best - at)) best = i;
  });
  return best < 0 ? id : table.targets[best].id;
}

/** Element ids the current objective still needs (what the table should light). */
export function litIds(content, game) {
  const scene = currentScene(content, game);
  if (!scene) return [];
  const o = scene.objective;
  if (objectiveProgress(scene, game.hits, game.seq).complete) return [];
  if (o.kind === 'all') return [...new Set(o.ids)].filter((id) => !(game.hits[id] > 0));
  if (o.kind === 'count') return [...new Set(o.ids)];
  return [o.ids[game.seq]]; // sequence; other kinds already threw in objectiveProgress
}

// ───────────────────────── the leaning branch ─────────────────────────
// A Line of a prologue, briefing, cutscene or epilogue may carry lean: 'commons' | 'mint'.
// It is spoken only when the ledger leans that way. Nothing else in the content branches.

function checkLean(line) {
  if (line.lean !== undefined && !LEANINGS.includes(line.lean)) {
    throw new Error(`story: line ${line.id} has lean ${JSON.stringify(line.lean)}; it must be one of ${LEANINGS.join(', ')} or absent`);
  }
  return line.lean;
}

/**
 * The lines of `lines` that are spoken when the ledger leans `lean`: every line with no
 * `lean`, and those whose `lean` equals it, in order. The same array when nothing is dropped.
 */
export function spokenLines(lines, lean) {
  if (!LEANINGS.includes(lean)) throw new Error(`story: spokenLines needs a leaning (${LEANINGS.join(' or ')}), got ${JSON.stringify(lean)}`);
  if (!Array.isArray(lines)) throw new Error(`story: spokenLines needs a list of lines, got ${JSON.stringify(lines)}`);
  let dropped = false;
  const kept = lines.filter((line) => {
    const l = checkLean(line);
    if (l === undefined || l === lean) return true;
    dropped = true;
    return false;
  });
  return dropped ? kept : lines;
}

/**
 * Which way the ledger leans for this game, now: the reading that was frozen (game.ending)
 * once there is one, the live books until then.
 */
export function leaningNow(game) {
  if (game.ending === undefined || game.ending === null) return leaning(game.econ);
  if (!LEANINGS.includes(game.ending)) throw new Error(`story: game.ending is ${JSON.stringify(game.ending)}; it must be null or one of ${LEANINGS.join(', ')}`);
  return game.ending;
}

const hasLean = (lines) => lines.some((line) => checkLean(line) !== undefined);

/**
 * Is the ledger read (frozen into game.ending) when the objective of this scene completes?
 * Only in the final chapter, and there at the first scene of which either is true:
 *   it is the last scene;
 *   its own cutscene, or the briefing or cutscene of any later scene, carries a lean line.
 * So the reading is always taken before the first line that depends on it, and an ending
 * cannot change sides half way through. The obvious rule, "read it at the last objective and
 * nowhere else", lets a chapter whose sixth scene already branches play one ending's sixth
 * scene and the other's seventh if a loan falls between them.
 * A lean line in a prologue, or anywhere in an earlier chapter, is chosen by the live books.
 */
export function readsLeaning(content, chapterIndex, sceneIndex) {
  const chapter = content.chapters[chapterIndex];
  if (!chapter) throw new Error(`story: no chapter at index ${chapterIndex}`);
  if (!chapter.scenes[sceneIndex]) throw new Error(`story: chapter ${chapter.id} has no scene at index ${sceneIndex}`);
  if (chapterIndex !== content.chapters.length - 1) return false;
  if (sceneIndex === chapter.scenes.length - 1) return true;
  if (hasLean(chapter.scenes[sceneIndex].cutscene)) return true;
  return chapter.scenes.slice(sceneIndex + 1).some((sc) => hasLean(sc.briefing) || hasLean(sc.cutscene));
}

/**
 * What the end screen says. leaning: the frozen reading (or the live books if none was ever
 * taken). title and text: the last chapter's `endings[leaning]`, or null when that chapter
 * has no `endings`, in which case the shell shows its plain end screen.
 * @returns {{leaning:'commons'|'mint', title:string|null, text:string|null}}
 */
export function endingOf(content, game) {
  const lean = leaningNow(game);
  const chapter = content.chapters[content.chapters.length - 1];
  if (!chapter) throw new Error('story: endingOf needs a content with at least one chapter');
  if (chapter.endings === undefined) return { leaning: lean, title: null, text: null };
  const e = chapter.endings && chapter.endings[lean];
  if (!e || typeof e.title !== 'string' || typeof e.text !== 'string') {
    throw new Error(`story: chapter ${chapter.id} endings.${lean} must be { title, text }, got ${JSON.stringify(e)}`);
  }
  return { leaning: lean, title: e.title, text: e.text };
}

/** Backdrop and cast on stage at lines[index], carrying forward from earlier lines. */
export function resolveStage(lines, index) {
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
    throw new Error(`story: resolveStage index ${index} is outside 0..${lines.length - 1}`);
  }
  let bg = 'black';
  let on = [];
  for (let i = 0; i <= index; i++) {
    if (lines[i].bg !== undefined) bg = lines[i].bg;
    if (lines[i].on !== undefined) on = lines[i].on;
  }
  return { bg, on: [...on] };
}

/** Fallback spoken duration of a line, in seconds (about 160 words a minute). */
export function lineSeconds(line) {
  if (!line || typeof line.text !== 'string') {
    throw new Error(`story: line ${line && line.id} has no text`);
  }
  const trimmed = line.text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  return 0.6 + words * 0.38;
}

// Speakers met, by content -> 'chapter.scene' -> Set. A cache of a pure function of its key.
const metCache = new WeakMap();

/**
 * Everyone the player has seen or heard in a cinematic by the time scene `sceneIndex` of
 * chapter `chapterIndex` is being played: the speakers and the cast on stage in every
 * cinematic of the earlier chapters, in this chapter's prologue, and in the cutscenes of
 * this chapter's earlier scenes. Briefings and barks introduce nobody.
 * @returns {Set<string>}
 */
export function metSpeakers(content, chapterIndex, sceneIndex) {
  if (!content.chapters[chapterIndex]) throw new Error(`story: no chapter at index ${chapterIndex}`);
  if (!Number.isInteger(sceneIndex) || sceneIndex < 0) throw new Error(`story: metSpeakers scene index ${JSON.stringify(sceneIndex)} is not a scene index`);
  let byKey = metCache.get(content);
  if (!byKey) { byKey = new Map(); metCache.set(content, byKey); }
  const key = `${chapterIndex}.${sceneIndex}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const met = new Set();
  const see = (lines) => {
    for (const line of lines) {
      met.add(line.who);
      for (const id of line.on || []) met.add(id);
    }
  };
  content.chapters.slice(0, chapterIndex).forEach((ch) => {
    see(ch.prologue);
    ch.scenes.forEach((sc) => see(sc.cutscene));
    see(ch.epilogue);
  });
  const chapter = content.chapters[chapterIndex];
  see(chapter.prologue);
  chapter.scenes.slice(0, sceneIndex).forEach((sc) => see(sc.cutscene));
  byKey.set(key, met);
  return met;
}

/**
 * The lines under a bark key that may be spoken where the game is now. Two rules, both
 * about not hearing a stranger:
 *   the speaker has appeared in a cinematic already (metSpeakers, derived from content);
 *   a line with minScene also waits until game.scene >= minScene.
 * A key the chapter does not have is no lines.
 */
export function eligibleBarks(content, game, key) {
  const chapter = currentChapter(content, game);
  const lines = chapter.barks[key];
  if (lines === undefined) return [];
  if (!Array.isArray(lines)) throw new Error(`story: chapter ${chapter.id} barks.${key} is not a list: ${JSON.stringify(lines)}`);
  const met = metSpeakers(content, game.chapter, game.scene);
  return lines.filter((line) => {
    if (line.minScene !== undefined) {
      if (!Number.isInteger(line.minScene) || line.minScene < 0) {
        throw new Error(`story: bark ${line.id} has minScene ${JSON.stringify(line.minScene)}, which is not a scene index`);
      }
      if (game.scene < line.minScene) return false;
    }
    return met.has(line.who);
  });
}

/**
 * Ids of the lines likely to be spoken next, soonest first and without repeats, so the
 * shell can have their audio ready before the core asks for them.
 *   title, card   the opening lines of the chapter's prologue
 *   (lines of the other ending, by `lean`, are left out everywhere)
 *   cine          the next `ahead` lines; when a scene's cutscene is that close to its end,
 *                 also what follows it without a pause (the next briefing, or the epilogue)
 *   play          the scene's briefing, the opening of its cutscene, every bark eligible now
 *   end           nothing
 */
export function preloadIds(content, game, ahead = 3) {
  if (!Number.isInteger(ahead) || ahead < 0) throw new Error(`story: preloadIds ahead must be an integer >= 0, got ${ahead}`);
  // only the lines this ledger will hear: the other ending's are never asked for
  const ids = (lines) => spokenLines(lines, leaningNow(game)).map((line) => line.id);
  let out;
  if (game.mode === 'end') {
    out = [];
  } else if (game.mode === 'title' || game.mode === 'card') {
    out = ids(currentChapter(content, game).prologue).slice(0, ahead);
  } else if (game.mode === 'cine') {
    const { cine } = game;
    if (!cine) throw new Error('story: preloadIds in mode cine needs game.cine');
    const upcoming = cine.lines.slice(cine.index + 1, cine.index + 1 + ahead);
    out = ids(upcoming);
    if (upcoming.length < ahead) {
      const chapter = currentChapter(content, game);
      if (cine.kind === 'scene') {
        const following = chapter.scenes[game.scene + 1];
        out = out.concat(following ? ids(following.briefing) : ids(chapter.epilogue).slice(0, ahead));
      } else if (cine.kind === 'prologue' && chapter.scenes[0]) {
        // The table follows a prologue directly now; there is no screen between them.
        out = out.concat(ids(chapter.scenes[0].briefing));
      }
    }
  } else if (game.mode === 'play') {
    const chapter = currentChapter(content, game);
    const scene = currentScene(content, game);
    out = scene === null ? [] : [
      ...ids(scene.briefing),
      ...ids(scene.cutscene).slice(0, ahead),
      ...Object.keys(chapter.barks).flatMap((key) => ids(eligibleBarks(content, game, key))),
    ];
  } else {
    throw new Error(`story: preloadIds does not know mode ${JSON.stringify(game.mode)}`);
  }
  return [...new Set(out)];
}

/** Table element ids that will spin the reels if hit now (what the renderer lights): none unless armed. */
export function spinIds(content, game) {
  const chapter = currentChapter(content, game);
  const table = content.tables[chapter.tableId];
  if (!table) throw new Error(`story: chapter ${chapter.id} names unknown table ${JSON.stringify(chapter.tableId)}`);
  return game.reels && game.reels.armed ? [...table.reels.spin] : [];
}
