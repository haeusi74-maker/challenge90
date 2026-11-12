'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('GET /api/users liefert leere Liste bei frischem Datenverzeichnis', async () => {
  const r = await srv.request('GET', '/api/users');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, []);
});

test('geschuetzte Route ohne Token gibt 401', async () => {
  const r = await srv.request('GET', '/api/me/data');
  assert.equal(r.status, 401);
});

test('Nutzer anlegen gibt Token, mit dem /api/me/data erreichbar ist', async () => {
  const u = await srv.createUser('Smoke');
  assert.equal(u.status, 200);
  const r = await srv.request('GET', '/api/me/data', { token: u.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.name, 'Smoke');
  assert.equal(r.json.rev, 0);
});
