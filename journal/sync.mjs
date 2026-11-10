#!/usr/bin/env node
// Sync daemon for the_long_settlement.
//
// Every INTERVAL seconds:
//   1. mirror the game agent's working tree (~/code/fable_5_2) into this repo
//   2. run the game's test suite here, in the mirror (never in the agent's tree)
//   3. export the game agent's decision graph (workspace fable_5_2)
//   4. append a snapshot to journal/data/snapshots.json when anything changed
//   5. stage the changed paths by name, commit, push
//
// The game agent's own git state is never touched: this process only reads
// from its directory. The deciduous token is read from ~/.claude.json at
// runtime and is never written anywhere in this repo.
//
// Usage: node journal/sync.mjs [--once]

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { computeUsage } from './usage.mjs';

const SRC = join(homedir(), 'code/fable_5_2');
const REPO = join(homedir(), 'code/the_long_settlement');
const DATA = join(REPO, 'journal/data');
const WORKSPACE = 'fable_5_2';
const INTERVAL = Number(process.env.SYNC_INTERVAL || 150);
const MAX_FILE_BYTES = 40 * 1024 * 1024;

// Paths owned by this repo, never mirrored over or deleted by rsync.
const OURS = ['/journal/', '/.github/', '/.git/', '/.gitignore'];
// Never copied out of the game tree.
const NEVER = ['node_modules/', '.git/', '.env', '.env.*', '*.pem', '*.key', '.DS_Store', '*.log', '.deciduous/', '.claude/'];
// Never staged even if they somehow appear.
const SENSITIVE = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|credentials.*|\.npmrc)$/;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, v) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

function token() {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  const srv = cfg.mcpServers?.deciduous;
  if (!srv) throw new Error('no deciduous MCP server in ~/.claude.json');
  return { url: srv.url.replace(/\/mcp$/, ''), auth: srv.headers.Authorization };
}

function mirror() {
  const big = spawnSync('find', [SRC, '-type', 'f', '-size', `+${MAX_FILE_BYTES / 1024}k`, '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean).map((p) => relative(SRC, p));
  const args = ['-a', '--delete', '--checksum'];
  for (const p of OURS) args.push(`--filter=P ${p}`);
  for (const p of NEVER) args.push(`--exclude=${p}`);
  for (const p of big) { args.push(`--exclude=/${p}`); log('skipping large file', p); }
  args.push(`${SRC}/`, `${REPO}/`);
  const r = spawnSync('rsync', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`rsync failed: ${r.stderr}`);
  return big;
}

function runTests() {
  if (!existsSync(join(REPO, 'test'))) return null;
  const t0 = Date.now();
  const r = spawnSync('node', ['--test', 'test/'], { cwd: REPO, encoding: 'utf8', timeout: 180_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => { const m = out.match(new RegExp(`ℹ ${k} (\\d+)`)); return m ? Number(m[1]) : null; };
  const failures = [...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i).slice(0, 12);
  return {
    total: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), todo: num('todo'),
    timedOut: r.signal === 'SIGTERM', exit: r.status, ms: Date.now() - t0, failures,
  };
}

async function exportGraph() {
  const { url, auth } = token();
  const res = await fetch(`${url}/export?workspace=${WORKSPACE}`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`export ${res.status}`);
  const g = await res.json();
  const nodes = g.nodes.filter((n) => !n.deleted_at).map((n) => ({
    id: n.id, type: n.node_type, status: n.status, title: n.title, description: n.description,
    created: n.created_at, updated: n.updated_at, branch: n.branch,
    confidence: n.metadata?.confidence ?? null, prompt: n.metadata?.prompt ?? null,
    files: n.metadata?.files ?? [], commit: n.metadata?.commit ?? null,
  })).sort((a, b) => a.created.localeCompare(b.created));
  const live = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => live.has(e.from_node_id) && live.has(e.to_node_id)).map((e) => ({
    from: e.from_node_id, to: e.to_node_id, type: e.edge_type, rationale: e.rationale, created: e.created_at,
  }));
  return { workspace: WORKSPACE, nodes, edges };
}

function tree() {
  const files = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name), rel = relative(REPO, p);
      if (/^(\.git|journal|\.github|node_modules)(\/|$)/.test(rel)) continue;
      if (ent.isDirectory()) walk(p);
      else {
        const bytes = statSync(p).size;
        const text = /\.(js|mjs|json|md|html|css|txt|ya?ml)$/.test(ent.name);
        files.push({ path: rel, bytes, lines: text ? readFileSync(p, 'utf8').split('\n').length : null });
      }
    }
  };
  walk(REPO);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function changedPaths() {
  const out = execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: REPO, encoding: 'utf8' });
  const paths = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2), p = parts[i].slice(3);
    paths.push({ code: code.trim(), path: p });
    if (code.startsWith('R')) i++; // rename carries the old path next
  }
  return paths;
}

function defaultReadme() {
  const p = join(REPO, 'README.md');
  if (existsSync(join(SRC, 'README.md'))) return;
  writeFileSync(p, `# The Long Settlement

A voiced epic told through a pinball table that runs on a slot machine. Being
built live by an AI agent; this repo mirrors its working tree every few minutes.

- Build journal: https://notactuallytreyanastasio.github.io/the_long_settlement/
- Play the current build: https://notactuallytreyanastasio.github.io/the_long_settlement/play/

\`journal/\` holds the journal site and the sync daemon. Everything else is the
game, copied from the agent's working tree as it is written. Snapshots are
mid-work and may not run.
`);
}

async function tick() {
  const skipped = mirror();
  defaultReadme();
  let graph = null;
  try { graph = await exportGraph(); } catch (e) { log('graph export failed:', e.message); }
  const files = tree();
  const gameChanges = changedPaths().filter((c) => !/^(journal\/|\.github\/|\.gitignore$|README\.md$)/.test(c.path));
  const prevGraph = readJSON(join(DATA, 'graph.json'), { nodes: [], edges: [] });
  const graphChanged = graph && (graph.nodes.length !== prevGraph.nodes.length || graph.edges.length !== prevGraph.edges.length
    || JSON.stringify(graph.nodes.map((n) => n.updated + n.status)) !== JSON.stringify(prevGraph.nodes.map((n) => n.updated + n.status)));

  const snapshots = readJSON(join(DATA, 'snapshots.json'), []);
  const before = snapshots.length;
  if (gameChanges.length || graphChanged || snapshots.length === 0) {
    const tests = gameChanges.some((c) => /\.(m?js|json)$/.test(c.path)) || snapshots.length === 0
      ? runTests() : snapshots.at(-1)?.tests ?? null;
    const byType = {};
    for (const n of graph?.nodes ?? prevGraph.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
    const prevIds = new Set(prevGraph.nodes.map((n) => n.id));
    snapshots.push({
      at: new Date().toISOString(),
      files: files.length,
      lines: files.reduce((s, f) => s + (f.lines || 0), 0),
      bytes: files.reduce((s, f) => s + f.bytes, 0),
      linesByDir: files.reduce((m, f) => { const d = f.path.includes('/') ? f.path.split('/').slice(0, 2).join('/') : '.'; m[d] = (m[d] || 0) + (f.lines || 0); return m; }, {}),
      changed: gameChanges.map((c) => `${c.code} ${c.path}`).slice(0, 80),
      tests,
      nodes: byType,
      newNodes: graph ? graph.nodes.filter((n) => !prevIds.has(n.id)).map((n) => n.id) : [],
      skippedLarge: skipped,
    });
    writeJSON(join(DATA, 'snapshots.json'), snapshots);
    if (graph) writeJSON(join(DATA, 'graph.json'), graph);
    writeJSON(join(DATA, 'tree.json'), files);
  }

  // Token usage: refreshed with any other change, or every 30 minutes on its own, so the
  // journal's own spending doesn't force a commit on every tick.
  const usagePath = join(DATA, 'usage.json');
  const prevUsage = readJSON(usagePath, null);
  const usageStale = !prevUsage || Date.now() - Date.parse(prevUsage.generated) > 30 * 60 * 1000; // each push redeploys ~120 MB
  if (gameChanges.length || graphChanged || usageStale) {
    try { writeJSON(usagePath, computeUsage()); } catch (e) { log('usage failed:', e.message); }
  }

  const all = changedPaths().filter((c) => !SENSITIVE.test(c.path));
  if (!all.length) { log('no changes'); return; }
  const paths = all.map((c) => c.path);
  execFileSync('git', ['add', '-A', '--', ...paths], { cwd: REPO }); // -A here only records deletions of the named paths
  // Only this tick's snapshot may describe this commit; an older one would repeat its news.
  const fresh = snapshots.length > before ? snapshots.at(-1) : null;
  const snap = { tests: snapshots.at(-1)?.tests, newNodes: fresh?.newNodes ?? [] };
  const newest = graph?.nodes.filter((n) => snap?.newNodes?.includes(n.id)).slice(-3).map((n) => `  ${n.type}: ${n.title}`) ?? [];
  const t = snap?.tests;
  const subject = `sync: ${gameChanges.length} game file${gameChanges.length === 1 ? '' : 's'} changed`
    + (t?.total != null ? `, tests ${t.pass}/${t.total}` : '')
    + (snap?.newNodes?.length ? `, ${snap.newNodes.length} new graph node${snap.newNodes.length === 1 ? '' : 's'}` : '');
  const body = [
    gameChanges.length ? 'Game files:\n' + gameChanges.slice(0, 30).map((c) => `  ${c.code} ${c.path}`).join('\n') : '',
    newest.length ? 'Newest decisions in the game agent\'s graph:\n' + newest.join('\n') : '',
    t?.failures?.length ? 'Failing tests:\n' + t.failures.map((f) => `  ${f}`).join('\n') : '',
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  ].filter(Boolean).join('\n\n');
  execFileSync('git', ['commit', '-q', '-m', subject, '-m', body], { cwd: REPO });
  const push = spawnSync('git', ['push', '-q', 'origin', 'main'], { cwd: REPO, encoding: 'utf8' });
  log(subject, push.status === 0 ? 'pushed' : `PUSH FAILED: ${push.stderr}`);
}

const once = process.argv.includes('--once');
for (;;) {
  try { await tick(); } catch (e) { log('tick failed:', e.stack || e.message); }
  if (once) break;
  await new Promise((r) => setTimeout(r, INTERVAL * 1000));
}
