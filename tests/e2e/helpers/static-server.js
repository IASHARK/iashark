#!/usr/bin/env node
'use strict';
// Serveur statique minimal pour les tests E2E locaux : sert dist/ (sortie de
// scripts/build-public.js) sans dependance npm.
//
// - un repertoire sert son index.html ;
// - les en-tetes du bloc "/*" de dist/_headers sont appliques (CSP comprise),
//   pour que les erreurs CSP apparaissent en local comme en production ;
// - _redirects n'est PAS applique (c'est le role de la suite production) :
//   les tests locaux visent les vrais chemins de fichiers.
//
// Usage : node tests/e2e/helpers/static-server.js  (E2E_PORT, E2E_DIST)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(process.env.E2E_DIST || path.join(ROOT, 'dist'));
const PORT = Number(process.env.E2E_PORT || 4173);
const HOST = process.env.E2E_HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function globalHeaders() {
  const file = path.join(DIST, '_headers');
  const out = {};
  if (!fs.existsSync(file)) return out;
  let inGlobal = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\S/.test(line)) { inGlobal = line.trim() === '/*'; continue; }
    if (!inGlobal) continue;
    const m = line.match(/^\s+([A-Za-z0-9-]+):\s*(.+)$/);
    // HSTS inutile (et genant) sur http://127.0.0.1.
    if (m && m[1].toLowerCase() !== 'strict-transport-security') out[m[1]] = m[2].trim();
  }
  return out;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[e2e] ' + DIST + ' introuvable : lancer d\'abord node scripts/build-locales.js && node scripts/build-public.js');
  process.exit(1);
}

const HEADERS = globalHeaders();

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache' }, HEADERS, extra || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  const target = path.normalize(path.join(DIST, pathname));
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  let file = target;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch (e) { /* 404 ci-dessous */ }
  fs.readFile(file, (err, data) => {
    if (err) {
      // Meme comportement que la regle 404 non forcee de _redirects : 404.html du repertoire.
      const dir = (pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)\//) || [])[1];
      const notFound = dir ? path.join(DIST, dir, '404.html') : path.join(DIST, '404.html');
      const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found';
      return send(res, 404, body, 'text/html; charset=utf-8');
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (req.method === 'HEAD') return send(res, 200, '', type, { 'Content-Length': data.length });
    send(res, 200, data, type);
  });
});

server.listen(PORT, HOST, () => {
  console.log('[e2e] dist/ servi sur http://' + HOST + ':' + PORT + '/ (' + DIST + ')');
});
