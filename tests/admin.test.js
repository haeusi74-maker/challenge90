'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

describe('Admin-Bereich', () => {
  const ctx = {};
  let admin, member;
  before(async () => {
    ctx.srv = await startServer();
    admin = await ctx.srv.createUser('Chef');      // erstes Profil = Admin
    member = await ctx.srv.createUser('Mitglied');
  });
  after(async () => { await ctx.srv.stop(); });
  const req = (m, u, token, body) => ctx.srv.request(m, u, { token, body });

  test('erstes Profil ist Admin, weitere nicht', async () => {
    assert.equal(admin.user.isAdmin, true);
    assert.equal(member.user.isAdmin, false);
  });

  test('ohne Admin-Recht -> 403, ohne Token -> 401', async () => {
    assert.equal((await req('GET', '/api/admin/users', member.token)).status, 403);
    assert.equal((await req('GET', '/api/admin/users')).status, 401);
    assert.equal((await req('PUT', '/api/ai/config', member.token, { provider: 'anthropic', baseUrl: 'https://x.test' })).status, 403);
  });

  test('Admin sieht Nutzerliste ohne pin/salt', async () => {
    const r = await req('GET', '/api/admin/users', admin.token);
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 2);
    for (const u of r.json) { assert.ok(!('pin' in u) && !('salt' in u) && !('apiKey' in u)); }
  });

  test('KI-Key per Admin speichern, Nicht-Admin sieht nur hasKey', async () => {
    const put = await req('PUT', '/api/ai/config', admin.token, { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'm', apiKey: 'sk-geheim' });
    assert.equal(put.status, 200);
    const g = await req('GET', '/api/ai/config', member.token);
    assert.equal(g.json.hasKey, true);
    assert.ok(!JSON.stringify(g.json).includes('sk-geheim'));
  });

  test('Admin legt Nutzer an, bearbeitet und setzt PIN zurueck', async () => {
    const c = await req('POST', '/api/admin/users', admin.token, { name: 'Kind', pin: '1234' });
    assert.equal(c.status, 200);
    const id = c.json.user.id;
    const p = await req('PATCH', '/api/admin/users/' + id, admin.token, { name: 'Kind2', color: '#00ff99' });
    assert.equal(p.json.user.name, 'Kind2');
    assert.equal(p.json.user.color, '#00ff99');
    const rp = await req('POST', `/api/admin/users/${id}/pin`, admin.token, { pin: '' });
    assert.equal(rp.status, 200);
    const login = await ctx.srv.request('POST', '/api/login', { body: { id } });
    assert.equal(login.status, 200);
  });

  test('PIN-Reset beendet alte Sitzungen', async () => {
    const u = await ctx.srv.createUser('Sitzung');
    await req('POST', `/api/admin/users/${u.user.id}/pin`, admin.token, { pin: '4321' });
    assert.equal((await req('GET', '/api/me/data', u.token)).status, 401);
  });

  test('Letzten Admin weder loeschen noch degradieren', async () => {
    assert.equal((await req('DELETE', '/api/admin/users/' + admin.user.id, admin.token)).status, 400);
    assert.equal((await req('PATCH', '/api/admin/users/' + admin.user.id, admin.token, { isAdmin: false })).status, 400);
  });

  test('Nutzer loeschen: weg aus Liste, Token ungueltig', async () => {
    const u = await ctx.srv.createUser('Weg');
    assert.equal((await req('DELETE', '/api/admin/users/' + u.user.id, admin.token)).status, 200);
    assert.equal((await req('GET', '/api/me/data', u.token)).status, 401);
    const list = await ctx.srv.request('GET', '/api/users');
    assert.ok(!list.json.some((x) => x.id === u.user.id));
  });

  test('zweiten Admin ernennen, dann darf der erste gehen', async () => {
    const u = await ctx.srv.createUser('Zweiter');
    await req('PATCH', '/api/admin/users/' + u.user.id, admin.token, { isAdmin: true });
    assert.equal((await req('DELETE', '/api/admin/users/' + admin.user.id, u.token)).status, 200);
  });

  test('Registrierung sperren: neue Profile nur noch durch Admin', async () => {
    const adm = (await ctx.srv.request('GET', '/api/users')).json.find((x) => x.isAdmin);
    const login = await ctx.srv.request('POST', '/api/login', { body: { id: adm.id } });
    const tok = login.json.token;
    assert.equal((await req('PUT', '/api/admin/settings', tok, { openSignup: false })).status, 200);
    assert.equal((await ctx.srv.request('POST', '/api/users', { body: { name: 'Fremder' } })).status, 403);
    assert.equal((await req('POST', '/api/admin/users', tok, { name: 'Eingeladen' })).status, 200);
  });
});
