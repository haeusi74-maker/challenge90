'use strict';
// Startet server/server.js als Kindprozess mit temporaerem DATA_DIR/CONTENT_DIR
// auf einem freien Port. Beruehrt nie das echte ./data oder ./content.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const SERVER_JS = path.join(__dirname, '..', '..', 'server', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c90-data-'));
  const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c90-content-'));
  if (opts.seed) opts.seed({ dataDir, contentDir });
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_JS], {
    env: { ...process.env, DATA_DIR: dataDir, CONTENT_DIR: contentDir, PORT: String(port), AI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Server-Start Timeout:\n' + log)), 10000);
    child.stdout.on('data', () => { if (log.includes('läuft')) { clearTimeout(t); resolve(); } });
    child.once('exit', (c) => { clearTimeout(t); reject(new Error('Server beendet (' + c + '):\n' + log)); });
  });
  const base = `http://127.0.0.1:${port}`;

  async function request(method, url, { token, body, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    let payload = raw;
    if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* kein JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  async function createUser(name = 'Test', pin) {
    const r = await request('POST', '/api/users', { body: { name, ...(pin ? { pin } : {}) } });
    return { ...r.json, status: r.status };
  }

  async function stop() {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(contentDir, { recursive: true, force: true });
  }

  return { base, port, dataDir, contentDir, request, createUser, stop };
}

module.exports = { startServer };
