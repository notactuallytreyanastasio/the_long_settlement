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
//   node tools/render-voices.mjs [--content file.mjs|file.json] [--out dir]
//                                [--concurrency n] [--force] [--prune] [--quiet]
//
//   --content   a module exporting `content` (or default), or a JSON file, in
//               the Content shape. Default: src/content/index.js
//   --out       where the .m4a files and manifest.json go. Default: assets/voice
//   --prune     drop manifest entries (and their files) for lines no longer in the content

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
    force: false, prune: false, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--content') opts.content = resolve(value());
    else if (a === '--out') opts.out = resolve(value());
    else if (a === '--concurrency') {
      opts.concurrency = Number(value());
      if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error(`--concurrency must be a positive integer, got ${argv[i]}`);
    } else if (a === '--force') opts.force = true;
    else if (a === '--prune') opts.prune = true;
    else if (a === '--quiet') opts.quiet = true;
    else throw new Error(`unknown argument ${a}`);
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

function pickVoice(member, installed) {
  const voice = member.say.find((name) => installed.has(name));
  if (!voice) throw new Error(`no installed voice for "${member.id}": wanted one of ${member.say.join(', ')}`);
  return voice;
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

  // lines that left the content: kept unless --prune, so a fixture run cannot eat the real set
  let stale = 0;
  for (const [id, entry] of Object.entries(old.lines)) {
    if (id in manifest.lines || lines.some((l) => l.id === id)) continue;
    stale++;
    if (opts.prune) await rm(join(opts.out, `${id}.m4a`), { force: true });
    else manifest.lines[id] = entry;
  }

  const sorted = { lines: Object.fromEntries(Object.entries(manifest.lines).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(sorted, null, 1)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);

  const wall = (performance.now() - t0) / 1000;
  log(`rendered ${jobs.length - errors.length} lines (${audio.toFixed(1)}s of speech) in ${wall.toFixed(2)}s; ${stale} stale ${opts.prune ? 'pruned' : 'kept'}; manifest: ${manifestPath}`);
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
