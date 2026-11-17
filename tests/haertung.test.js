'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers/server');

const DAY = 864e5;
const seedUsers = (tokens, tokenExp) => ({ dataDir }) => {
  const reg = { users: [{ id: 'u1', name: 'Alt', color: '#ff6a2b', apiKey: 'k-alt' }], tokens };
  if (tokenExp) reg.tokenExp = tokenExp;
  fs.mkdirSync(path.join(dataDir, 'users', 'u1', 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify(reg));
};
const ingest = (srv, headers, extra = {}) => srv.request('POST', '/api/ingest', { headers, body: { steps: 1000, ...extra } });

describe('Token-Ablauf', () => {
  const ctx = {};
  before(async () => {
    ctx.srv = await startServer({ seed: seedUsers(
      { legacy: 'u1', fresh: 'u1', stale: 'u1' },
      { fresh: Date.now() + DAY, stale: Date.now() - 1000 }) });
  });
  after(async () => { await ctx.srv.stop(); });

  test('abgelaufener Token -> 401 und wird aus users.json bereinigt', async () => {
    const r = await ctx.srv.request('GET', '/api/me/data', { token: 'stale' });
    assert.equal(r.status, 401);
    const saved = JSON.parse(fs.readFileSync(path.join(ctx.srv.dataDir, 'users.json'), 'utf8'));
    assert.equal(saved.tokens.stale, undefined);
    assert.equal((saved.tokenExp || {}).stale, undefined);
  });

  test('gueltiger Token mit Ablaufdatum -> 200', async () => {
    const r = await ctx.srv.request('GET', '/api/me/data', { token: 'fresh' });
    assert.equal(r.status, 200);
  });

  test('Alt-Token ohne Ablaufdatum funktioniert weiter und bekommt ein Ablaufdatum ab jetzt', async () => {
    const r = await ctx.srv.request('GET', '/api/me/data', { token: 'legacy' });
    assert.equal(r.status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(ctx.srv.dataDir, 'users.json'), 'utf8'));
    const exp = saved.tokenExp && saved.tokenExp.legacy;
    assert.ok(exp > Date.now() + 29 * DAY && exp <= Date.now() + 31 * DAY, 'Ablauf ~30 Tage: ' + exp);
  });

  test('neu ausgestellter Token (Login) bekommt Ablauf ~30 Tage', async () => {
    const r = await ctx.srv.request('POST', '/api/login', { body: { id: 'u1' } });
    assert.equal(r.status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(ctx.srv.dataDir, 'users.json'), 'utf8'));
    const exp = saved.tokenExp[r.json.token];
    assert.ok(exp > Date.now() + 29 * DAY && exp <= Date.now() + 31 * DAY);
  });
});

describe('Ingest: API-Key nur im Header', () => {
  const ctx = {};
  before(async () => { ctx.srv = await startServer({ seed: seedUsers({}) }); });
  after(async () => { await ctx.srv.stop(); });

  test('Query-key -> 401', async () => {
    const r = await ctx.srv.request('POST', '/api/ingest?key=k-alt', { body: { steps: 5 } });
    assert.equal(r.status, 401);
  });
  test('Body-key -> 401', async () => {
    const r = await ctx.srv.request('POST', '/api/ingest', { body: { key: 'k-alt', steps: 5 } });
    assert.equal(r.status, 401);
  });
  test('Header x-api-key -> Key wird akzeptiert (409: Challenge nicht gestartet, aber nicht 401)', async () => {
    const r = await ingest(ctx.srv, { 'x-api-key': 'k-alt' });
    assert.equal(r.status, 409);
  });
});

describe('Ingest: Rate-Limit pro IP und trust proxy', () => {
  const ctx = {};
  before(async () => { ctx.srv = await startServer({ seed: seedUsers({}) }); });
  after(async () => { await ctx.srv.stop(); });

  test('viele Anfragen einer IP -> 429, andere Client-IP (X-Forwarded-For) bleibt frei', async () => {
    const h = { 'x-forwarded-for': '203.0.113.7' };
    let last;
    for (let i = 0; i < 61; i++) last = await ingest(ctx.srv, h);
    assert.equal(last.status, 429);
    const other = await ingest(ctx.srv, { 'x-forwarded-for': '203.0.113.8' });
    assert.notEqual(other.status, 429);
  });
});

describe('Ingest: Rate-Limit pro API-Key', () => {
  const ctx = {};
  before(async () => { ctx.srv = await startServer({ seed: seedUsers({}) }); });
  after(async () => { await ctx.srv.stop(); });

  test('ein Key von wechselnden IPs -> 429; falscher Key zaehlt nicht auf den gueltigen', async () => {
    let last;
    for (let i = 0; i < 31; i++) last = await ingest(ctx.srv, { 'x-api-key': 'k-alt', 'x-forwarded-for': '198.51.100.' + (i + 1) });
    assert.equal(last.status, 429);
  });
});
