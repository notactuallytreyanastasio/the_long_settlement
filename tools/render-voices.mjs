#!/usr/bin/env node
// Renders every spoken Line to assets/voice/<lineId>.m4a with the macOS `say`
// command, and records what it made in assets/voice/manifest.json:
//
//   { lines: { "<lineId>": { url, seconds, hash } } }
//
// hash covers voice + rate + text. A line is skipped when its file exists and
// the manifest already holds the same hash, so a re-run only renders what
// changed. The radio effect is applied at playback, not baked in.
//
// The output directory is made to match the content exactly. After a run the
// only .m4a files in it are those of lines that exist now, saying what those
// lines say now:
//   - a file whose line id is no longer in the content is deleted, whether or
//     not the old manifest knew about it;
//   - a file whose hash changed is deleted BEFORE its replacement is rendered,
//     so a failed render leaves no file (and the game falls back to speech
//     synthesis for that line) rather than the old words under a new subtitle.
// Nothing but <id>.m4a files is ever deleted. Because of this, rendering a
// fixture into the real directory would empty it: that is refused unless
// --out is given along with --content.
//
//   node tools/render-voices.mjs [--content file.mjs|file.json] [--out dir]
//                                [--concurrency n] [--force] [--dry-run] [--quiet]
//
//   --content   a module exporting `content` (or default), or a JSON file, in
//               the Content shape. Default: src/content/index.js
//   --out       where the .m4a files and manifest.json go. Default: assets/voice
//   --dry-run   say what would be rendered and deleted; change nothing
//   --prune     accepted and ignored: pruning is no longer optional

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ───────────── arguments ─────────────
function parseArgs(argv) {
  const opts = {
    content: join(ROOT, 'src/content/index.js'),
    out: join(ROOT, 'assets/voice'),
    concurrency: Math.max(1, Math.min(6, availableParallelism())),
    force: false, dryRun: false, quiet: false,
  };
  let gaveContent = false;
  let gaveOut = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--content') { opts.content = resolve(value()); gaveContent = true; }
    else if (a === '--out') { opts.out = resolve(value()); gaveOut = true; }
    else if (a === '--concurrency') {
      opts.concurrency = Number(value());
      if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error(`--concurrency must be a positive integer, got ${argv[i]}`);
    } else if (a === '--force') opts.force = true;
    else if (a === '--prune') { /* always on now */ }
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--quiet') opts.quiet = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (gaveContent && !gaveOut) {
    throw new Error(`--content ${opts.content} without --out would delete every file in ${opts.out} that this content does not name; give --out as well`);
  }
  return opts;
}

// ───────────── processes ─────────────
function run(cmd, args, input) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => fail(new Error(`${cmd}: ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) ok(out);
      else fail(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${err.trim() || out.trim()}`));
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input ?? '');
  });
}

async function has(cmd) {
  try { await run('/usr/bin/which', [cmd]); return true; } catch { return false; }
}

async function installedVoices() {
  const out = await run('say', ['-v', '?']);
  const names = new Set();
  for (const row of out.split('\n')) {
    // "Eddy (English (UK)) en_GB    # Hello! My name is Eddy."
    const m = row.match(/^(.+?)\s+[a-z]{2,3}[_-][A-Za-z0-9]+\s+#/);
    if (m) names.add(m[1].trim());
  }
  if (names.size === 0) throw new Error('`say -v ?` listed no voices');
  return names;
}

// ───────────── content ─────────────
async function loadContent(path) {
  if (!existsSync(path)) throw new Error(`content file not found: ${path}`);
  if (path.endsWith('.json')) return JSON.parse(await readFile(path, 'utf8'));
  const mod = await import(pathToFileURL(path).href);
  const content = mod.content ?? mod.default;
  if (!content) throw new Error(`${path} exports neither \`content\` nor a default`);
  return content;
}

/** Every Line in the content, in story order, with where it came from. */
export function collectLines(content) {
  if (!Array.isArray(content.chapters)) throw new Error('content.chapters is not an array');
  const found = [];
  const take = (lines, where) => {
    if (!Array.isArray(lines)) throw new Error(`${where} is not an array of lines`);
    lines.forEach((line, i) => found.push({ line, where: `${where}[${i}]` }));
  };
  for (const ch of content.chapters) {
    take(ch.prologue, `${ch.id}.prologue`);
    for (const sc of ch.scenes) {
      take(sc.briefing, `${sc.id}.briefing`);
      take(sc.cutscene, `${sc.id}.cutscene`);
    }
    take(ch.epilogue, `${ch.id}.epilogue`);
    for (const [key, lines] of Object.entries(ch.barks)) take(lines, `${ch.id}.barks.${key}`);
  }
  const seen = new Map();
  for (const { line, where } of found) {
    if (typeof line.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(line.id)) {
      throw new Error(`${where}: line id ${JSON.stringify(line.id)} cannot be used as a file name`);
    }
    if (seen.has(line.id)) throw new Error(`duplicate line id "${line.id}" at ${seen.get(line.id)} and ${where}`);
    seen.set(line.id, where);
    if (typeof line.text !== 'string' || line.text.trim() === '') throw new Error(`${where}: line "${line.id}" has no text`);
    if (!content.cast[line.who]) throw new Error(`${where}: line "${line.id}" has unknown speaker "${line.who}"`);
  }
  return found.map((f) => f.line);
}

// `say -v Nobody` exits 0 and speaks in the system voice, so the list is the
// only truth about what is installed. The list is also inconsistent about
// names: the same voice shows as "Daniel" or as "Daniel (English (UK))"
// depending on the macOS release, so a bare wanted name also matches an
// installed "<name> (...)". The installed spelling is what gets passed to say.
function pickVoice(member, installed) {
  for (const want of member.say) {
    if (installed.has(want)) return want;
    if (!want.includes('(')) {
      for (const name of installed) if (name.startsWith(`${want} (`)) return name;
    }
  }
  throw new Error(`no installed voice for "${member.id}": wanted one of ${member.say.join(', ')}`);
}

/**
 * Which of the .m4a files in the output directory must go.
 * names: what readdir returned. keep: Set of line ids that are up to date.
 * current: Set of every line id in the content.
 * Returns [{ name, why: 'gone' | 'changed' }]; anything that is not <something>.m4a is left alone.
 */
export function staleFiles(names, keep, current) {
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.m4a')) continue;
    const id = name.slice(0, -4);
    if (keep.has(id)) continue;
    out.push({ name, why: current.has(id) ? 'changed' : 'gone' });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const hashOf = (voice, rate, text) => createHash('sha1').update(`${voice}\n${rate}\n${text}`).digest('hex').slice(0, 16);

// ───────────── rendering ─────────────
async function renderOne(job, tmp, converter) {
  const aiff = join(tmp, `${job.id}.aiff`);
  const part = join(tmp, `${job.id}.m4a`);
  // text goes in on stdin: a line that begins with a dash is not an option
  await run('say', ['-v', job.voice, '-r', String(job.rate), '-o', aiff], job.text);
  if (converter === 'ffmpeg') {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ac', '1', '-ar', '22050', '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart', part]);
  } else {
    await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-c', '1', '-b', '40000', aiff, part]);
  }
  const info = await run('afinfo', [part]);
  const m = info.match(/estimated duration:\s*([\d.]+)\s*sec/);
  if (!m) throw new Error(`afinfo gave no duration for ${part}`);
  const seconds = Number(m[1]);
  if (!(seconds > 0.05)) throw new Error(`"${job.id}" rendered ${seconds}s of audio with voice ${job.voice}; text was ${JSON.stringify(job.text)}`);
  await rename(part, job.file);
  await rm(aiff, { force: true });
  return Math.round(seconds * 100) / 100;
}

async function pool(jobs, limit, work) {
  let next = 0;
  const errors = [];
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await work(job); } catch (e) { errors.push(e); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return errors;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = opts.quiet ? () => {} : (s) => console.log(s);
  const t0 = performance.now();

  const content = await loadContent(opts.content);
  const lines = collectLines(content);
  const installed = await installedVoices();
  const converter = (await has('ffmpeg')) ? 'ffmpeg' : (await has('afconvert')) ? 'afconvert' : null;
  if (!converter) throw new Error('neither ffmpeg nor afconvert is on PATH');

  await mkdir(opts.out, { recursive: true });
  const manifestPath = join(opts.out, 'manifest.json');
  const old = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { lines: {} };
  if (!old.lines || typeof old.lines !== 'object') throw new Error(`${manifestPath} has no "lines" object`);

  const voiceOf = {};
  for (const id of Object.keys(content.cast)) {
    if (lines.some((l) => l.who === id)) voiceOf[id] = pickVoice(content.cast[id], installed);
  }

  const manifest = { lines: {} };
  const jobs = [];
  let skipped = 0;
  for (const line of lines) {
    const member = content.cast[line.who];
    const voice = voiceOf[line.who];
    const hash = hashOf(voice, member.rate, line.text);
    const file = join(opts.out, `${line.id}.m4a`);
    const url = relative(ROOT, file).split(sep).join('/');
    const prev = old.lines[line.id];
    if (!opts.force && prev && prev.hash === hash && existsSync(file)) {
      manifest.lines[line.id] = { url, seconds: prev.seconds, hash };
      skipped++;
    } else {
      jobs.push({ id: line.id, who: line.who, voice, rate: member.rate, text: line.text, file, url, hash });
    }
  }

  log(`${lines.length} lines, ${skipped} up to date, ${jobs.length} to render with ${converter}, ${opts.concurrency} at a time`);
  for (const [id, v] of Object.entries(voiceOf)) log(`  ${id.padEnd(9)} ${v} @ ${content.cast[id].rate} wpm`);

  // Everything in the directory that is not an up-to-date line goes now, before
  // any rendering: lines that left the content, and lines about to be re-rendered.
  const keep = new Set(Object.keys(manifest.lines));
  const stale = staleFiles(await readdir(opts.out), keep, new Set(lines.map((l) => l.id)));
  const gone = stale.filter((f) => f.why === 'gone').length;
  const forgotten = Object.keys(old.lines).filter((id) => !lines.some((l) => l.id === id)).length;
  for (const f of stale) {
    log(`  delete ${f.name.padEnd(26)} ${f.why === 'gone' ? 'line no longer exists' : opts.force ? 'forced' : 'voice, rate or text changed'}`);
    if (!opts.dryRun) await rm(join(opts.out, f.name));
  }
  log(`deleted ${stale.length} files: ${gone} for lines that no longer exist, ${stale.length - gone} to be rendered again; ${forgotten} manifest entries dropped`);
  if (opts.dryRun) {
    for (const job of jobs) log(`  would render ${job.id.padEnd(22)} ${job.who.padEnd(9)} ${job.voice}`);
    log('dry run: nothing was changed');
    return;
  }

  const tmp = await mkdtemp(join(tmpdir(), 'tls-voice-'));
  let audio = 0;
  let errors;
  try {
    errors = await pool(jobs, opts.concurrency, async (job) => {
      const t = performance.now();
      const seconds = await renderOne(job, tmp, converter);
      manifest.lines[job.id] = { url: job.url, seconds, hash: job.hash };
      audio += seconds;
      log(`  ${job.id.padEnd(22)} ${job.who.padEnd(9)} ${seconds.toFixed(2).padStart(6)}s audio  ${Math.round(performance.now() - t).toString().padStart(5)}ms`);
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  const sorted = { lines: Object.fromEntries(Object.entries(manifest.lines).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(sorted, null, 1)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);

  const wall = (performance.now() - t0) / 1000;
  log(`rendered ${jobs.length - errors.length} lines (${audio.toFixed(1)}s of speech) in ${wall.toFixed(2)}s; manifest: ${manifestPath}`);
  if (errors.length) {
    for (const e of errors) console.error(`FAILED: ${e.message}`);
    throw new Error(`${errors.length} of ${jobs.length} lines failed to render`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`render-voices: ${e.message}`);
    process.exit(1);
  });
}
