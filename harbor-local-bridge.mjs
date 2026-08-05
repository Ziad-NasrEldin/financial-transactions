import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(root, '.harbor', 'harbor-messages-source');
const databasePath = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const port = Number(process.env.HARBOR_BRIDGE_PORT || 4317);
const allowedOrigins = new Set([
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
  'http://127.0.0.1:4175',
  'http://127.0.0.1:4176',
  'http://127.0.0.1:4178',
  'harbor://app'
]);

function sendJson(response, status, value, request) {
  const origin = request.headers.origin;
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(value));
}

async function isReadable(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function canReadMessagesDatabase() {
  if (!(await isReadable(databasePath)) || !(await isReadable(helperPath))) return false;
  try {
    await readMessages({ sinceNs: Number.MAX_SAFE_INTEGER, limit: 1 });
    return true;
  } catch {
    return false;
  }
}

function readMessages({ sinceNs, limit }) {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, ['--db', databasePath, '--since-ns', String(sinceNs), '--limit', String(limit)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Messages source exited unexpectedly'));
        return;
      }
      try {
        resolve(stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Only read-only GET requests are supported' }, request);
    return;
  }

  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    const databaseReadable = await canReadMessagesDatabase();
    sendJson(response, 200, {
      ok: true,
      databaseReadable,
      helperAvailable: await isReadable(helperPath)
    }, request);
    return;
  }

  if (url.pathname !== '/messages') {
    sendJson(response, 404, { error: 'Not found' }, request);
    return;
  }

  if (!(await isReadable(databasePath)) || !(await isReadable(helperPath))) {
    sendJson(response, 503, { error: 'The local Messages reader is not ready' }, request);
    return;
  }

  const sinceNs = Math.max(0, Number(url.searchParams.get('sinceNs') || 0));
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
  try {
    const messages = await readMessages({ sinceNs, limit });
    sendJson(response, 200, { messages }, request);
  } catch (error) {
    console.error('Read-only Messages scan failed:', error instanceof Error ? error.message : 'unknown error');
    sendJson(response, 500, { error: 'The local Messages reader could not complete its read-only scan' }, request);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('Zoid Bank local bridge listening on http://127.0.0.1:' + port);
});
