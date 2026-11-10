#!/usr/bin/env node
// Does the game load? Follows every relative ES module import reachable from the
// <script type="module"> tags in an HTML entry, and fails if any file is missing.
//
// The game's unit tests exercise src/core and src/content in node and never import
// the browser shell, so a shell file that is imported but not yet written passes the
// suite and still leaves the published page dead (a 404 on one module stops the whole
// graph; the page's own error handler never runs). This catches exactly that.
//
// usage: node journal/check-imports.mjs [index.html]

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const entry = resolve(process.argv[2] || 'index.html');
if (!existsSync(entry)) { console.log(`no ${relative(process.cwd(), entry)}: nothing to check`); process.exit(0); }

const html = readFileSync(entry, 'utf8');
const roots = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1])
  .concat([...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*type=["']module["']/gi)].map((m) => m[1]));
const local = (s) => !/^[a-z]+:|^\/\//i.test(s);

// Static `import ... from '...'`, `export ... from '...'`, bare `import '...'` and literal `import('...')`.
const SPEC = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*(['"])([^'"]+)\1|(?:^|[\s;])import\s*(['"])([^'"]+)\3|import\(\s*(['"])([^'"]+)\5\s*\)/gm;

const seen = new Set();
const missing = [];
const queue = roots.filter(local).map((s) => ({ file: resolve(dirname(entry), s), from: relative(process.cwd(), entry) }));
while (queue.length) {
  const { file, from } = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsSync(file)) { missing.push(`${relative(process.cwd(), file)} (imported by ${from})`); continue; }
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of src.matchAll(SPEC)) {
    const spec = m[2] || m[4] || m[6];
    if (!spec || !local(spec) || !/^\.{1,2}\//.test(spec)) continue;
    queue.push({ file: resolve(dirname(file), spec), from: relative(process.cwd(), file) });
  }
}

console.log(`checked ${seen.size} modules from ${roots.length} entry script(s)`);
if (missing.length) {
  console.log(`MISSING ${missing.length}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
