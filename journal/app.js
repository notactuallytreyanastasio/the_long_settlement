// Build log front end. Reads data/*.json (written by sync.mjs and by the
// journaling agent) and renders one merged timeline. No framework.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const nf = new Intl.NumberFormat();
const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

let filter = 'all';
try { filter = localStorage.getItem('feed-filter') || 'all'; } catch {}

async function load(name, fallback) {
  try {
    const r = await fetch(`data/${name}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

// Tiny markdown: paragraphs, `code`, ```blocks```, > quotes, **bold**, *em*, [links](url).
function md(src) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(thread:([\w-]+)\)/g, '<button class="thread-inline" data-thread="$2">$1</button>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|[\w./#-]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  for (const block of String(src).split(/\n{2,}/)) {
    if (block.startsWith('```')) out.push(`<pre>${esc(block.replace(/^```\w*\n?|```$/g, ''))}</pre>`);
    else if (/^!\[[^\]]*\]\([\w./-]+\)$/.test(block.trim())) {
      const [, alt, src] = block.trim().match(/^!\[([^\]]*)\]\(([\w./-]+)\)$/);
      out.push(`<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`);
    } else if (block.startsWith('>')) out.push(`<blockquote>${inline(block.replace(/^>\s?/gm, ''))}</blockquote>`);
    else out.push(`<p>${inline(block).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}

function spark(values) {
  if (values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values), w = 140, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderStats(graph, snaps, build) {
  const last = snaps.at(-1);
  const count = (t) => graph.nodes.filter((n) => n.type === t).length;
  const t = [...snaps].reverse().find((s) => s.tests)?.tests;
  const testCls = !t ? '' : t.fail ? 'bad' : 'good';
  const stats = [
    { k: 'Lines of code', v: nf.format(last?.lines ?? 0), s: `${last?.files ?? 0} files`, extra: spark(snaps.map((s) => s.lines)) },
    { k: 'Tests', v: t ? `${t.pass}/${t.total}` : '—', s: t ? (t.fail ? `${t.fail} failing` : 'all passing') : 'no suite yet', cls: testCls },
    { k: 'Decisions', v: count('decision'), s: `${pl(count('option'), 'option')} weighed` },
    { k: 'Actions', v: count('action'), s: pl(count('outcome'), 'outcome') },
    { k: 'Observations', v: count('observation'), s: pl(count('revisit'), 'revisit') },
    { k: 'Syncs', v: snaps.length, s: build?.sha ? `Pages at ${build.sha.slice(0, 7)}` : 'Pages not built yet' },
  ];
  $('#stats').innerHTML = stats.map((x) => `<div class="stat"><div class="k">${x.k}</div><div class="v ${x.cls || ''}">${x.v}</div><div class="s">${esc(x.s)}</div>${x.extra || ''}</div>`).join('');
}

function renderLive(snaps, build) {
  const last = snaps.at(-1);
  if (!last) { $('#live-text').textContent = 'waiting for the first sync'; return; }
  const age = (Date.now() - new Date(last.at)) / 60000;
  $('.dot').className = 'dot ' + (age < 20 ? 'fresh' : 'stale');
  const bits = [`last change synced ${ago(last.at)}`];
  if (build?.built) bits.push(`site built ${ago(build.built)}`);
  if (build?.playSha) {
    bits.push(build.playIsThisPush
      ? `play is the latest build`
      : `play held at ${build.playSha.slice(0, 7)}, the last build that passed (latest: tests ${build.testsPassed ? 'pass' : 'fail'}, modules ${build.importsOk ? 'ok' : 'missing'})`);
  }
  $('#live-text').textContent = bits.join(' · ');
}

function renderPrompt(graph) {
  const root = graph.nodes.find((n) => n.type === 'goal' && n.prompt);
  $('#prompt').innerHTML = root ? `<pre>${esc(root.prompt)}</pre>` : '<p class="small">No goal logged yet.</p>';
}

function renderTree(tree, snaps) {
  if (!tree.length) { $('#tree').innerHTML = '<p class="small">Nothing yet.</p>'; return; }
  const first = new Set();
  const lastChanged = new Set((snaps.at(-1)?.changed || []).map((c) => c.split(' ').slice(1).join(' ')));
  // Code files get a row each; a directory of mostly binary assets is one summary row.
  const dirs = new Map();
  for (const f of tree) {
    const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    if (!dirs.has(d)) dirs.set(d, []);
    dirs.get(d).push(f);
  }
  const max = Math.max(...tree.filter((f) => !f.path.endsWith('.json')).map((f) => f.lines || 0), 1);
  const kb = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
  let html = '';
  for (const [d, files] of dirs) {
    const binary = files.filter((f) => f.lines == null).length;
    if (files.length > 12 && binary / files.length > 0.5) {
      const bytes = files.reduce((s, f) => s + f.bytes, 0);
      const changed = files.filter((f) => lastChanged.has(f.path)).length;
      html += `<div class="dir">${esc(d)}/</div><div class="row ${changed ? 'new' : ''}"><span class="p">${files.length} files${changed ? `, ${changed} just changed` : ''}</span><span class="n" style="grid-column:span 2;text-align:left">${kb(bytes)}</span></div>`;
      continue;
    }
    html += `<div class="dir">${esc(d)}/</div>`;
    for (const f of files) {
      const name = f.path.slice(f.path.lastIndexOf('/') + 1);
      html += `<div class="row ${lastChanged.has(f.path) ? 'new' : ''}"><span class="p" title="${esc(f.path)}">${esc(name)}</span><span class="n">${f.lines ?? kb(f.bytes)}</span><span class="bar" style="width:${Math.max(2, ((f.lines || 0) / max) * 100)}%"></span></div>`;
    }
  }
  $('#tree').innerHTML = html;
}

function nodeItem(n, graph, byId) {
  const parents = graph.edges.filter((e) => e.to === n.id);
  const kids = graph.edges.filter((e) => e.from === n.id);
  const rejected = parents.some((e) => e.type === 'rejected') || n.status === 'rejected';
  const chosen = parents.some((e) => e.type === 'chosen');
  const under = parents.map((e) => byId.get(e.from)).filter(Boolean);
  const metaBits = [];
  if (under.length) metaBits.push(`under ${under.map((p) => `${p.type} “${esc(p.title.slice(0, 60))}${p.title.length > 60 ? '…' : ''}”`).join(', ')}`);
  if (chosen) metaBits.push('<span class="chosen">chosen</span>');
  if (rejected) metaBits.push('<span class="rej">rejected</span>');
  if (n.confidence != null) metaBits.push(`confidence ${n.confidence}`);
  if (n.status && !['pending', 'active'].includes(n.status)) metaBits.push(n.status);
  const rationale = [...parents, ...kids].map((e) => e.rationale).filter(Boolean);
  const detail = [
    n.description ? md(n.description) : '',
    n.prompt ? `<p><b>Prompt</b></p><pre>${esc(n.prompt)}</pre>` : '',
    rationale.length ? `<p><b>Why</b></p>${[...new Set(rationale)].map((r) => `<p>${esc(r)}</p>`).join('')}` : '',
    n.files?.length ? `<div class="files">${n.files.map(esc).join('<br>')}</div>` : '',
    n.commit ? `<div class="files">commit ${esc(n.commit)}</div>` : '',
  ].join('');
  const head = `<span class="badge t-${n.type}">${n.type}</span><span class="node-title">${esc(n.title)}</span>`;
  const body = detail
    ? `<details><summary>${head}<span class="more">more</span></summary><div class="detail">${detail}</div></details>`
    : head;
  return { kind: 'node', at: n.created, html: `<li class="item ${rejected ? 'rejected' : ''}" data-k="node"><div class="when">${fmtTime(n.created)}</div><div class="what">${body}<div class="meta">${metaBits.join(' · ')}</div></div></li>` };
}

function syncItem(s, prev) {
  if (!s.changed?.length && prev) return null;
  const delta = prev ? s.lines - prev.lines : s.lines;
  const t = s.tests;
  const bits = [`${s.changed?.length || 0} file${s.changed?.length === 1 ? '' : 's'} changed`, `${delta >= 0 ? '+' : ''}${nf.format(delta)} lines`, `${nf.format(s.lines)} total`];
  if (t?.total != null) bits.push(t.fail ? `<span class="rej">tests ${t.pass}/${t.total}</span>` : `<span class="chosen">tests ${t.pass}/${t.total}</span>`);
  const detail = (s.changed || []).map(esc).join('<br>') + (t?.failures?.length ? `<p><b>Failing</b></p>${t.failures.map(esc).join('<br>')}` : '');
  return { kind: 'sync', at: s.at, html: `<li class="item" data-k="sync"><div class="when">${fmtTime(s.at)}</div><div class="what"><details><summary><span class="badge t-sync">sync</span><span class="meta" style="display:inline">${bits.join(' · ')}</span><span class="more">files</span></summary><div class="detail files">${detail}</div></details></div></li>` };
}

let threadNames = {};

function entryItem(e) {
  const tags = (e.threads || []).map((k) => `<button class="thread-tag" data-thread="${esc(k)}">${esc(threadNames[k] || k)}</button>`).join('');
  const note = e.note ? `<div class="note"><b>Since then</b> ${md(e.note).replace(/^<p>|<\/p>$/g, '')}</div>` : '';
  return { kind: 'entry', at: e.at, threads: e.threads || [], html: `<li class="item entry" data-k="entry"><div class="when">${fmtTime(e.at)} · <span class="t-entry">journal</span></div><h3>${esc(e.title)}</h3>${tags ? `<div class="tags">${tags}</div>` : ''}${note}<div class="body">${md(e.body)}</div></li>` };
}

function renderSynthesis(syn, entries) {
  const el = $('#synthesis');
  if (!syn) { el.hidden = true; return; }
  el.hidden = false;
  threadNames = Object.fromEntries((syn.threads || []).map((t) => [t.key, t.name]));
  const count = (k) => entries.filter((e) => (e.threads || []).includes(k)).length;
  el.innerHTML = `<p class="kicker">The story so far · revised ${ago(syn.updated)}</p><h2>${esc(syn.title)}</h2><div class="body">${md(syn.body)}</div>`
    + `<h3 class="threads-h">Threads to follow</h3><ul class="threads">${(syn.threads || []).map((t) => `<li><button class="thread-link" data-thread="${esc(t.key)}"><span class="tn">${esc(t.name)}</span><span class="tc">${count(t.key)} entries, oldest first →</span></button><p>${esc(t.summary)}</p></li>`).join('')}</ul>`;
}

function setFilter(f) {
  filter = f;
  try { localStorage.setItem('feed-filter', filter); } catch {}
  for (const x of document.querySelectorAll('#filters button[data-f]')) x.classList.toggle('on', x.dataset.f === filter);
  try { history.replaceState(null, '', filter.startsWith('thread:') ? `#thread=${filter.slice(7)}` : location.pathname + location.search); } catch {}
  refresh();
}

function renderFeed(graph, snaps, entries) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const items = [
    ...graph.nodes.map((n) => nodeItem(n, graph, byId)),
    ...snaps.map((s, i) => syncItem(s, snaps[i - 1])).filter(Boolean),
    ...entries.map(entryItem),
  ];
  const thread = filter.startsWith('thread:') ? filter.slice(7) : null;
  const shown = items.filter((x) => thread ? x.kind === 'entry' && x.threads.includes(thread) : filter === 'all' || x.kind === filter);
  // A thread reads as a story, so oldest first; the live feed is newest first.
  shown.sort((a, b) => (thread ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)) || (a.kind === 'entry' ? -1 : 1));
  items.length = 0; items.push(...shown);
  if (!items.length) { $('#feed').innerHTML = '<li class="empty">Nothing here yet.</li>'; return; }
  const open = new Set([...document.querySelectorAll('#feed details[open]')].map((d) => d.closest('li').dataset.key));
  let html = '', day = null;
  for (const it of items) {
    const d = fmtDay(it.at);
    if (d !== day) { html += `<li class="day">${d}</li>`; day = d; }
    html += it.html.replace('<li ', `<li data-key="${esc(it.kind + it.at)}" `);
  }
  $('#feed').innerHTML = html;
  for (const li of document.querySelectorAll('#feed li[data-key]')) if (open.has(li.dataset.key)) li.querySelector('details')?.setAttribute('open', '');
}


// ───────────────────────── what it cost ─────────────────────────
const usd = (n) => n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
const mtok = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
const SERIES = [['lead', 'var(--series-1)'], ['helpers', 'var(--series-2)'], ['journal', 'var(--series-3)']];

function renderCost(u, snaps, tree, entries) {
  const sec = $('#cost');
  if (!u || !u.total) { sec.hidden = true; return; }
  sec.hidden = false;
  const t = u.total;
  const g = u.byGroup;
  const game = g.lead.cost.total + g.helpers.cost.total;
  const hours = (Date.parse(u.last) - Date.parse(u.first)) / 3.6e6;
  const last = snaps.at(-1) || {};
  const codeLines = Object.entries(last.linesByDir || {}).filter(([d]) => /^(src|test)\b/.test(d)).reduce((a, [, n]) => a + n, 0);
  const tests = [...snaps].reverse().find((x) => x.tests)?.tests?.total || 0;
  const voices = tree.filter((f) => /^assets\/voice\/.+\.m4a$/.test(f.path)).length;
  const saved = 1 - t.cost.total / t.uncachedCost;

  $('#cost-note').textContent = `Counted from the Claude Code transcripts of every agent involved (${u.agents.lead + u.agents.helpers} game transcripts, 1 journal), one count per API response. `
    + `The work ran on a Claude subscription; these are the same tokens priced at Anthropic API list rates as of ${u.pricesAsOf}. Updated ${ago(u.generated)}.`;

  const kpi = (k, v, s, cls = '') => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#cost-kpis').innerHTML = [
    kpi('Total so far', usd(t.cost.total), `${hours.toFixed(1)} hours, ${nf.format(t.responses)} API responses`, 'hero'),
    kpi('The game', usd(game), `journal ${usd(g.journal.cost.total)} on top`),
    kpi('Without caching', usd(t.uncachedCost), `caching saved ${Math.round(saved * 100)}%`),
    kpi('Tokens read', mtok(t.input + t.write5m + t.write1h + t.read), `${Math.round(t.read / (t.input + t.write5m + t.write1h + t.read) * 100)}% from cache`),
    kpi('Tokens written', mtok(t.output), `${Math.round(t.thinking / t.output * 100)}% of it thinking`),
    codeLines ? kpi('Per line of code', `${(game / codeLines * 100).toFixed(1)}¢`, `${nf.format(codeLines)} lines in src/ and test/`) : '',
    tests ? kpi('Per test', usd(game / tests), `${tests} tests`) : '',
    voices ? kpi('Per voiced line', `${(game / voices * 100).toFixed(1)}¢`, `${nf.format(voices)} recorded lines`) : '',
    entries.length ? kpi('Per journal entry', usd(g.journal.cost.total / entries.length), `${entries.length} entries, plus the site`) : '',
  ].join('');

  // legend: always present for >= 2 series; lines are also direct-labelled
  $('#cost-legend').innerHTML = SERIES.map(([k, c]) => `<span><i style="background:${c}"></i>${esc(u.groups[k])} · ${usd(g[k].cost.total)}</span>`).join('');
  drawCostChart(u);

  const kinds = [
    ['Output', 'written by the model', t.cost.output],
    ['Cache writes', '5 min / 1 h', t.cost.write5m + t.cost.write1h],
    ['Cache reads', 'context re-read', t.cost.read],
    ['Fresh input', 'uncached prompt', t.cost.input],
  ];
  const kmax = Math.max(...kinds.map((k) => k[2]));
  $('#cost-kinds').innerHTML = `<div class="kinds">${kinds.map(([n, sub, v]) => `<div class="row" title="${esc(n)}: ${usd(v)}"><span class="lab">${n}<small>${sub}</small></span><span class="bar" style="width:${Math.max(0.5, v / kmax * 100)}%"></span><span class="n">${usd(v)}</span></div>`).join('')}</div>`;
  $('#cost-kinds-note').textContent = `Agents re-read their whole context on every turn: ${mtok(t.read)} tokens came from cache for ${usd(t.cost.read)}. With no prompt caching every one of those is fresh input, and the bill would be ${usd(t.uncachedCost)} instead of ${usd(t.cost.total)}.`;

  const row = (name, v) => `<tr><td>${esc(name)}</td><td>${nf.format(v.responses)}</td><td>${mtok(v.input)}</td><td>${mtok(v.write5m + v.write1h)}</td><td>${mtok(v.read)}</td><td>${mtok(v.output)}</td><td>${mtok(v.thinking)}</td><td>${usd(v.cost.total)}</td><td>${usd(v.uncachedCost)}</td></tr>`;
  const head = '<thead><tr><th>Who</th><th>Responses</th><th>Fresh input</th><th>Cache writes</th><th>Cache reads</th><th>Output</th><th>of which thinking</th><th>Cost</th><th>Without caching</th></tr></thead>';
  const models = Object.entries(u.byModel).map(([m, v]) => row(`model: ${m}`, v)).join('');
  const prices = Object.entries(u.prices).filter(([m]) => u.byModel[m]).map(([m, p]) => `${m}: $${p.input} in, $${p.output} out, $${p.write5m}/$${p.write1h} cache write (5 min/1 h), $${p.read} cache read per million tokens`).join('<br>');
  $('#cost-table').innerHTML = `<table class="cost-table">${head}<tbody>${SERIES.map(([k]) => row(u.groups[k], g[k])).join('')}${models}</tbody><tfoot>${row('Total', t).replace('<tr>', '<tr>')}</tfoot></table><p class="small" style="margin-top:8px">${prices}</p>`;
}

let lastUsage = null;
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (lastUsage) drawCostChart(lastUsage); }, 150); });

function drawCostChart(u) {
  lastUsage = u;
  const wrap = $('#cost-chart');
  const pts = u.series;
  if (pts.length < 2) { wrap.innerHTML = '<p class="small">Not enough data yet.</p>'; return; }
  // Drawn at the container's real width so text stays at its true size on a phone.
  const W = Math.max(300, Math.min(760, Math.round(wrap.clientWidth || 640))), H = W < 480 ? 220 : 260, L = 40, R = W < 480 ? 96 : 118, T = 10, B = 26;
  const x0 = Date.parse(pts[0].at), x1 = Date.parse(pts.at(-1).at);
  const ymax = Math.max(...pts.flatMap((p) => SERIES.map(([k]) => p[k]))) * 1.08 || 1;
  const X = (t) => L + (t - x0) / (x1 - x0 || 1) * (W - L - R);
  const Y = (v) => T + (1 - v / ymax) * (H - T - B);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => ymax / s <= 5) || 1000;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative API-price cost over time, by who spent it">`;
  for (let v = 0; v <= ymax; v += step) svg += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)" stroke-width="1"/><text class="axis" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">$${v}</text>`;
  const ticks = W < 480 ? 3 : 5;
  for (let i = 0; i <= ticks; i++) { const t = x0 + (x1 - x0) * i / ticks; svg += `<text class="axis" x="${X(t)}" y="${H - 6}" text-anchor="middle">${fmtTime(new Date(t).toISOString())}</text>`; }
  // end labels, nudged apart so they never collide
  const ends = SERIES.map(([k, c]) => ({ k, c, y: Y(pts.at(-1)[k]), v: pts.at(-1)[k] })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const [k, c] of SERIES) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(Date.parse(p.at)).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  for (const e of ends) svg += `<circle cx="${X(x1)}" cy="${Y(e.v)}" r="4" fill="${e.c}" stroke="var(--paper)" stroke-width="2"/><text class="end-label" x="${X(x1) + 8}" y="${e.y + 4}">${({ lead: 'lead', helpers: 'helpers', journal: 'journal' })[e.k]} ${usd(e.v)}</text>`;
  svg += `<line id="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  svg += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg><div class="tip" id="cost-tip" hidden></div>`;
  wrap.innerHTML = svg;
  const el = wrap.querySelector('svg'), hit = wrap.querySelector('#hit'), xh = wrap.querySelector('#xh'), tip = wrap.querySelector('#cost-tip');
  const show = (ev) => {
    const r = el.getBoundingClientRect();
    const sx = (ev.clientX - r.left) / r.width * W;
    const t = x0 + (sx - L) / (W - L - R) * (x1 - x0);
    let i = 0, best = Infinity;
    pts.forEach((p, j) => { const dd = Math.abs(Date.parse(p.at) - t); if (dd < best) { best = dd; i = j; } });
    const p = pts[i], px = X(Date.parse(p.at));
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    const sum = SERIES.reduce((a, [k]) => a + p[k], 0);
    tip.innerHTML = `<b>${fmtTime(p.at)}</b><br>${SERIES.map(([k, c]) => `<i style="background:${c}"></i>${esc(u.groups[k])}: ${usd(p[k])}`).join('<br>')}<br>Total: ${usd(sum)}`;
    tip.hidden = false;
    const left = px / W * r.width;
    tip.style.left = `${Math.min(Math.max(0, left + 12), r.width - tip.offsetWidth)}px`;
    tip.style.top = `8px`;
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
}

async function refresh() {
  const [graph, snaps, entries, tree, build, syn, usage] = await Promise.all([
    load('graph.json', { nodes: [], edges: [] }), load('snapshots.json', []), load('entries.json', []),
    load('tree.json', []), load('build.json', null), load('synthesis.json', null), load('usage.json', null),
  ]);
  renderSynthesis(syn, entries);
  const chip = $('#thread-chip');
  chip.hidden = !filter.startsWith('thread:');
  if (!chip.hidden) chip.innerHTML = `Thread: ${esc(threadNames[filter.slice(7)] || filter.slice(7))} <span aria-hidden="true">×</span>`;
  renderLive(snaps, build);
  renderStats(graph, snaps, build);
  try { renderCost(usage, snaps, tree, entries); } catch (e) { console.error('cost section:', e); $('#cost').hidden = true; }
  renderPrompt(graph);
  renderTree(tree, snaps);
  renderFeed(graph, snaps, entries);
}

for (const b of document.querySelectorAll('#filters button[data-f]')) b.addEventListener('click', () => setFilter(b.dataset.f));
$('#thread-chip').addEventListener('click', () => setFilter('all'));
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-thread]');
  if (!t) return;
  setFilter(`thread:${t.dataset.thread}`);
  $('#filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
{ const m = location.hash.match(/^#thread=([\w-]+)$/); setFilter(m ? `thread:${m[1]}` : filter.startsWith('thread:') ? 'all' : filter); }
setInterval(refresh, 60_000);
