import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const port = Number(process.env.HARBOR_WEB_PORT || 4173);
const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function responseJson(response, status, value) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function safeDistPath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(distRoot, relative);
  return candidate.startsWith(`${distRoot}${path.sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') { responseJson(response, 405, { error: 'Only read-only GET requests are supported' }); return; }
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health') { responseJson(response, 200, { ok: true, service: 'zoid-bank-dashboard', build: 'dist' }); return; }
  try {
    const candidate = safeDistPath(url.pathname);
    if (!candidate) throw new Error('unsafe path');
    let filePath = candidate;
    try { if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html'); await stat(filePath); } catch { filePath = path.join(distRoot, 'index.html'); }
    const body = await readFile(filePath);
    response.writeHead(200, { 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable', 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(body);
  } catch { responseJson(response, 404, { error: 'Not found' }); }
});

server.listen(port, '127.0.0.1', () => console.log(`Zoid Bank production dashboard listening on http://127.0.0.1:${port}`));
