// Story helpers: pure functions over content and game state.
// Used by game.js (the reducer) and by the renderer. No imports, no DOM.

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

/**
 * The lines under a bark key that may be spoken in scene `sceneIndex`. A line with
 * minScene waits until game.scene >= minScene: its speaker has not been met before then.
 * A key the chapter does not have is no lines.
 */
export function eligibleBarks(chapter, key, sceneIndex) {
  const lines = chapter.barks[key];
  if (lines === undefined) return [];
  if (!Array.isArray(lines)) throw new Error(`story: chapter ${chapter.id} barks.${key} is not a list: ${JSON.stringify(lines)}`);
  return lines.filter((line) => {
    if (line.minScene === undefined) return true;
    if (!Number.isInteger(line.minScene) || line.minScene < 0) {
      throw new Error(`story: bark ${line.id} has minScene ${JSON.stringify(line.minScene)}, which is not a scene index`);
    }
    return sceneIndex >= line.minScene;
  });
}

/**
 * Ids of the lines likely to be spoken next, soonest first and without repeats, so the
 * shell can have their audio ready before the core asks for them.
 *   title, card   the opening lines of the chapter's prologue
 *   cine          the next `ahead` lines; when a scene's cutscene is that close to its end,
 *                 also what follows it without a pause (the next briefing, or the epilogue)
 *   slot, play    the scene's briefing, the opening of its cutscene, every bark eligible now
 *   end           nothing
 */
export function preloadIds(content, game, ahead = 3) {
  if (!Number.isInteger(ahead) || ahead < 0) throw new Error(`story: preloadIds ahead must be an integer >= 0, got ${ahead}`);
  const ids = (lines) => lines.map((line) => line.id);
  let out;
  if (game.mode === 'end') {
    out = [];
  } else if (game.mode === 'title' || game.mode === 'card') {
    out = ids(currentChapter(content, game).prologue.slice(0, ahead));
  } else if (game.mode === 'cine') {
    const { cine } = game;
    if (!cine) throw new Error('story: preloadIds in mode cine needs game.cine');
    const upcoming = cine.lines.slice(cine.index + 1, cine.index + 1 + ahead);
    out = ids(upcoming);
    if (cine.kind === 'scene' && upcoming.length < ahead) {
      const chapter = currentChapter(content, game);
      const following = chapter.scenes[game.scene + 1];
      out = out.concat(ids(following ? following.briefing : chapter.epilogue.slice(0, ahead)));
    }
  } else if (game.mode === 'slot' || game.mode === 'play') {
    const chapter = currentChapter(content, game);
    const scene = currentScene(content, game);
    out = scene === null ? [] : [
      ...ids(scene.briefing),
      ...ids(scene.cutscene.slice(0, ahead)),
      ...Object.keys(chapter.barks).flatMap((key) => ids(eligibleBarks(chapter, key, game.scene))),
    ];
  } else {
    throw new Error(`story: preloadIds does not know mode ${JSON.stringify(game.mode)}`);
  }
  return [...new Set(out)];
}
