#!/usr/bin/env node
// A static file server for the game. No dependencies.
//
//   node tools/serve.mjs [port]        default 5173, or $PORT; this machine only
//   node tools/serve.mjs [port] --lan  also answers the local network, and prints the address
//                                      to open on a phone on the same Wi-Fi
//
// ES modules will not load from file://, and a module served with the wrong MIME type is
// refused by the browser without much of an error, so the type table is the point of this.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const unknown = flags.filter((f) => f !== '--lan');
if (unknown.length > 0) throw new Error(`serve: unknown option ${unknown.join(' ')} (the only one is --lan)`);
const LAN = flags.includes('--lan');
const portArg = args.find((a) => !a.startsWith('--'));
const PORT = Number(portArg || process.env.PORT || 5173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`serve: bad port ${portArg || process.env.PORT}`);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', { allow: 'GET, HEAD' });
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad url'); }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'outside the project');
    // dotfiles (.git, .deciduous, .env) are nobody's business
    if (file.slice(ROOT.length).split(sep).some((part) => part.startsWith('.'))) return send(res, 404, `not found: ${path}`);
    let info;
    try { info = await stat(file); } catch { return send(res, 404, `not found: ${path}`); }
    if (!info.isFile()) return send(res, 404, `not found: ${path}`);
    const type = TYPES[extname(file).toLowerCase()];
    if (!type) return send(res, 415, `no MIME type known for ${extname(file) || path}`);
    // Source is edited while the page is open and voice files are re-rendered in place, so
    // everything is revalidated (no-cache); the ETag makes that a 304 and not the file again,
    // which matters for a phone re-fetching a voice line its decoded cache has let go.
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': 'no-cache' });
      return res.end();
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-cache',
      etag,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', (e) => res.destroy(e)).pipe(res);
  } catch (e) {
    send(res, 500, `serve: ${e.message}`);
  }
});

server.on('error', (e) => {
  console.error(`serve: ${e.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : e.message}`);
  process.exit(1);
});
server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`The Long Settlement: http://localhost:${PORT}/`);
  if (!LAN) return;
  const addrs = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  if (addrs.length === 0) console.log('  --lan: this machine has no network address to offer');
  for (const n of addrs) console.log(`  on a phone on the same network: http://${n.address}:${PORT}/`);
});
