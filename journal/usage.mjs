// Token usage and cost of building The Long Settlement, priced at Anthropic API list rates.
//
// Reads the Claude Code session transcripts for the game's working directory and writes
// journal/data/usage.json. Only numbers leave this script: per-response `usage` counts,
// models, timestamps and tool *names*. No message text, tool input or file content is read
// into the output.
//
// One API response is logged as several transcript lines (one per content block), each
// carrying the same usage, so responses are counted once per message.id.
//
// The work was done on a subscription, not billed per token; these figures are what the
// same tokens would cost on the API at list price.
//
// usage: node journal/usage.mjs [outFile]   (also imported by sync.mjs)

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { homedir } from 'node:os';

export const PROJECT_DIR = join(homedir(), '.claude/projects/-Users-bobdawg-code-fable-5-2');
// The session that keeps this journal. Everything else in the project directory is the game.
export const JOURNAL_SESSION = '667baad5-9594-419a-8595-a33208fbe346';

// $ per million tokens. Source: Anthropic API pricing as published in the claude-api
// reference (models.md / prompt-caching.md), cached 2026-11-03. Cache writes are 1.25x
// input for the 5-minute TTL and 2x for the 1-hour TTL.
export const PRICES_AS_OF = '2026-11-03';
export const PRICES = {
  'claude-fable-5-2':  { input: 8,   output: 40,  write5m: 10,    write1h: 16,  read: 0.20 },
  'claude-mythos-5-2': { input: 8,   output: 40,  write5m: 10,    write1h: 16,  read: 0.20 },
  'claude-opus-5-5':   { input: 4,   output: 20,  write5m: 5,     write1h: 8,   read: 0.20 },
  'claude-sonnet-5-5': { input: 2,   output: 10,  write5m: 2.5,   write1h: 4,   read: 0.10 },
  // Haiku 5.5: prompts <= 100K tokens. Its cache-read rate is not published in the reference;
  // 0.1x input is assumed and the model is flagged if it ever appears.
  'claude-haiku-5-5':  { input: 0.10, output: 0.50, write5m: 0.125, write1h: 0.20, read: 0.01, assumedRead: true },
};
// Fast mode list prices are 2x standard on Fable 5.2 and Opus 5.5; applied to every component.
const FAST_MULT = 2;

export const GROUPS = {
  lead: 'Game: lead agent',
  helpers: 'Game: subagents and workflows',
  journal: 'This journal',
};

function* files(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* files(p);
    else if (ent.name.endsWith('.jsonl')) yield p;
  }
}

function groupOf(path) {
  const rel = relative(PROJECT_DIR, path);
  if (rel.includes('/workflows/') && basename(rel) === 'journal.jsonl') return null; // workflow log, not a transcript
  if (rel.startsWith(JOURNAL_SESSION)) return 'journal';
  if (rel.includes('/')) return 'helpers';
  return 'lead';
}

const MTOK = 1e6;

export function computeUsage() {
  if (!existsSync(PROJECT_DIR)) throw new Error(`usage: no transcripts at ${PROJECT_DIR}`);
  const seen = new Set();
  const responses = [];
  const toolCounts = {};
  const agents = { lead: new Set(), helpers: new Set(), journal: new Set() };
  for (const f of files(PROJECT_DIR)) {
    const group = groupOf(f);
    if (!group) continue;
    agents[group].add(relative(PROJECT_DIR, f));
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }          // a line still being written
      const m = r.message;
      if (r.type !== 'assistant' || !m || !m.usage || !m.id) continue;
      if (!m.model || m.model.startsWith('<')) continue;          // synthetic, not an API call
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b && b.type === 'tool_use' && typeof b.name === 'string') {
          const k = `${group}\u0000${b.name}`;
          toolCounts[k] = (toolCounts[k] || 0) + 1;
        }
      }
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const u = m.usage;
      const cc = u.cache_creation || {};
      const w1h = cc.ephemeral_1h_input_tokens ?? 0;
      const w5m = cc.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
      responses.push({
        group, model: m.model, at: r.timestamp, fast: u.speed === 'fast',
        input: u.input_tokens || 0, write5m: w5m, write1h: w1h,
        read: u.cache_read_input_tokens || 0, output: u.output_tokens || 0,
        thinking: u.output_tokens_details?.thinking_tokens || 0,
      });
    }
  }
  responses.sort((a, b) => a.at.localeCompare(b.at));

  const zero = () => ({ responses: 0, input: 0, write5m: 0, write1h: 0, read: 0, output: 0, thinking: 0,
    cost: { input: 0, write5m: 0, write1h: 0, read: 0, output: 0, total: 0 }, uncachedCost: 0, unpriced: 0 });
  const add = (acc, r) => {
    acc.responses++;
    for (const k of ['input', 'write5m', 'write1h', 'read', 'output', 'thinking']) acc[k] += r[k];
    const p = PRICES[r.model];
    if (!p) { acc.unpriced++; return; }
    const mult = r.fast ? FAST_MULT : 1;
    const c = {
      input: r.input * p.input, write5m: r.write5m * p.write5m, write1h: r.write1h * p.write1h,
      read: r.read * p.read, output: r.output * p.output,
    };
    for (const k in c) { c[k] = (c[k] / MTOK) * mult; acc.cost[k] += c[k]; acc.cost.total += c[k]; }
    // The same request with no prompt caching: every prompt token at the plain input rate.
    acc.uncachedCost += ((r.input + r.write5m + r.write1h + r.read) * p.input + r.output * p.output) / MTOK * mult;
  };

  const total = zero();
  const byGroup = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, zero()]));
  const byModel = {};
  for (const r of responses) {
    add(total, r);
    add(byGroup[r.group], r);
    add((byModel[r.model] ??= zero()), r);
  }

  // Cumulative cost per group, one point per 5 minutes from the first response.
  const BUCKET = 5 * 60 * 1000;
  const series = [];
  if (responses.length) {
    const t0 = Math.floor(Date.parse(responses[0].at) / BUCKET) * BUCKET;
    const run = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 0]));
    let i = 0;
    for (let t = t0; i < responses.length; t += BUCKET) {
      while (i < responses.length && Date.parse(responses[i].at) < t + BUCKET) {
        const one = zero(); add(one, responses[i]); run[responses[i].group] += one.cost.total; i++;
      }
      series.push({ at: new Date(t + BUCKET).toISOString(), ...Object.fromEntries(Object.entries(run).map(([k, v]) => [k, +v.toFixed(4)])) });
    }
  }

  const tools = {};
  for (const [k, n] of Object.entries(toolCounts)) {
    const [g, name] = k.split('\u0000');
    (tools[g] ??= {})[name] = n;
  }

  const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v)));
  return round({
    generated: new Date().toISOString(),
    pricesAsOf: PRICES_AS_OF,
    prices: PRICES,
    note: 'Built on a Claude subscription. Figures are what the same tokens would cost at Anthropic API list prices.',
    groups: GROUPS,
    agents: Object.fromEntries(Object.entries(agents).map(([g, s]) => [g, s.size])),
    first: responses[0]?.at ?? null,
    last: responses.at(-1)?.at ?? null,
    total, byGroup, byModel, series, tools,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const u = computeUsage();
  const out = process.argv[2];
  if (out) writeFileSync(out, JSON.stringify(u, null, 1) + '\n');
  const $ = (n) => `$${n.toFixed(2)}`;
  console.log(`${u.total.responses} API responses, ${u.first} .. ${u.last}`);
  console.log(`total ${$(u.total.cost.total)} (without caching ${$(u.total.uncachedCost)})`);
  for (const [g, v] of Object.entries(u.byGroup)) console.log(`  ${GROUPS[g].padEnd(32)} ${$(v.cost.total).padStart(9)}  ${v.responses} responses, ${u.agents[g]} transcripts, unpriced ${v.unpriced}`);
  for (const [m, v] of Object.entries(u.byModel)) console.log(`  model ${m.padEnd(26)} ${$(v.cost.total).padStart(9)}  ${v.responses} responses`);
  const t = u.total;
  console.log(`tokens: input ${t.input}, cache write 5m ${t.write5m}, 1h ${t.write1h}, cache read ${t.read}, output ${t.output} (thinking ${t.thinking})`);
  console.log('cost by kind:', Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, $(v)])));
}
