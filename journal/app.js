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
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|[\w./#-]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  for (const block of String(src).split(/\n{2,}/)) {
    if (block.startsWith('```')) out.push(`<pre>${esc(block.replace(/^```\w*\n?|```$/g, ''))}</pre>`);
    else if (block.startsWith('>')) out.push(`<blockquote>${inline(block.replace(/^>\s?/gm, ''))}</blockquote>`);
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
    { k: 'Decisions', v: count('decision'), s: `${count('option')} options weighed` },
    { k: 'Actions', v: count('action'), s: `${count('outcome')} outcomes` },
    { k: 'Observations', v: count('observation'), s: `${count('revisit')} revisits` },
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
  const max = Math.max(...tree.map((f) => f.lines || 0), 1);
  let html = '', dir = null;
  for (const f of tree) {
    const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    if (d !== dir) { html += `<div class="dir">${esc(d)}/</div>`; dir = d; }
    const name = f.path.slice(f.path.lastIndexOf('/') + 1);
    html += `<div class="row ${lastChanged.has(f.path) ? 'new' : ''}"><span class="p" title="${esc(f.path)}">${esc(name)}</span><span class="n">${f.lines ?? ''}</span><span class="bar" style="width:${Math.max(2, ((f.lines || 0) / max) * 100)}%"></span></div>`;
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

function entryItem(e) {
  return { kind: 'entry', at: e.at, html: `<li class="item entry" data-k="entry"><div class="when">${fmtTime(e.at)} · <span class="t-entry">journal</span></div><h3>${esc(e.title)}</h3><div class="body">${md(e.body)}</div></li>` };
}

function renderFeed(graph, snaps, entries) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const items = [
    ...graph.nodes.map((n) => nodeItem(n, graph, byId)),
    ...snaps.map((s, i) => syncItem(s, snaps[i - 1])).filter(Boolean),
    ...entries.map(entryItem),
  ].filter((x) => filter === 'all' || x.kind === filter)
    .sort((a, b) => b.at.localeCompare(a.at) || (a.kind === 'entry' ? -1 : 1));
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

async function refresh() {
  const [graph, snaps, entries, tree, build] = await Promise.all([
    load('graph.json', { nodes: [], edges: [] }), load('snapshots.json', []), load('entries.json', []),
    load('tree.json', []), load('build.json', null),
  ]);
  renderLive(snaps, build);
  renderStats(graph, snaps, build);
  renderPrompt(graph);
  renderTree(tree, snaps);
  renderFeed(graph, snaps, entries);
}

for (const b of document.querySelectorAll('#filters button')) {
  b.classList.toggle('on', b.dataset.f === filter);
  b.addEventListener('click', () => {
    filter = b.dataset.f;
    try { localStorage.setItem('feed-filter', filter); } catch {}
    for (const x of document.querySelectorAll('#filters button')) x.classList.toggle('on', x === b);
    refresh();
  });
}
refresh();
setInterval(refresh, 60_000);
