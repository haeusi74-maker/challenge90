'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

// Jede Gruppe startet einen frischen Server (eigener 429-Zaehler, eigenes Profilregister).
function withServer() {
  const ctx = {};
  before(async () => { ctx.srv = await startServer(); });
  after(async () => { await ctx.srv.stop(); });
  return ctx;
}

describe('POST /api/users und GET /api/users', () => {
  const ctx = withServer();

  test('Name fehlt -> 400', async () => {
    const r = await ctx.srv.request('POST', '/api/users', { body: {} });
    assert.equal(r.status, 400);
  });

  test('Name mit 31 Zeichen -> 400, mit 30 Zeichen -> 200', async () => {
    const tooLong = await ctx.srv.request('POST', '/api/users', { body: { name: 'a'.repeat(31) } });
    const maxLen = await ctx.srv.request('POST', '/api/users', { body: { name: 'a'.repeat(30) } });
    assert.equal(tooLong.status, 400);
    assert.equal(maxLen.status, 200);
  });

  test('PIN, die nicht aus 4-8 Ziffern besteht -> 400', async () => {
    for (const pin of ['123', '123456789', 'abcd', '12a4']) {
      const r = await ctx.srv.request('POST', '/api/users', { body: { name: 'Pin', pin } });
      assert.equal(r.status, 400, 'PIN ' + pin);
    }
  });

  test('ungueltige Farbe faellt auf #ff6a2b zurueck, gueltige bleibt', async () => {
    const bad = await ctx.srv.request('POST', '/api/users', { body: { name: 'C1', color: 'rot' } });
    const good = await ctx.srv.request('POST', '/api/users', { body: { name: 'C2', color: '#00ff99' } });
    assert.equal(bad.json.user.color, '#ff6a2b');
    assert.equal(good.json.user.color, '#00ff99');
  });

  test('GET /api/users liefert hasPin, aber nie pin oder salt', async () => {
    await ctx.srv.createUser('MitPin', '1234');
    const r = await ctx.srv.request('GET', '/api/users');
    const withPin = r.json.find((u) => u.name === 'MitPin');
    const without = r.json.find((u) => u.name === 'C1');
    assert.equal(withPin.hasPin, true);
    assert.equal(without.hasPin, false);
    for (const u of r.json) {
      assert.ok(!('pin' in u));
      assert.ok(!('salt' in u));
    }
  });

  test('beim 21. Profil -> 400 (Limit 20)', async () => {
    const fresh = await startServer();
    try {
      for (let i = 0; i < 20; i++) {
        const ok = await fresh.request('POST', '/api/users', { body: { name: 'U' + i } });
        assert.equal(ok.status, 200);
      }
      const r = await fresh.request('POST', '/api/users', { body: { name: 'U21' } });
      assert.equal(r.status, 400);
    } finally { await fresh.stop(); }
  });
});

describe('POST /api/login', () => {
  const ctx = withServer();

  test('unbekannte id -> 404', async () => {
    const r = await ctx.srv.request('POST', '/api/login', { body: { id: 'gibtsnicht' } });
    assert.equal(r.status, 404);
  });

  test('Profil ohne PIN -> Token, mit dem /api/me/data erreichbar ist', async () => {
    const u = await ctx.srv.createUser('OhnePin');
    const r = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id } });
    assert.equal(r.status, 200);
    const me = await ctx.srv.request('GET', '/api/me/data', { token: r.json.token });
    assert.equal(me.status, 200);
  });

  test('richtige PIN -> Token', async () => {
    const u = await ctx.srv.createUser('RichtigePin', '4321');
    const r = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id, pin: '4321' } });
    assert.equal(r.status, 200);
    assert.ok(r.json.token);
  });

  test('falsche oder fehlende PIN -> 401 ohne Token', async () => {
    const u = await ctx.srv.createUser('FalschePin', '4321');
    const wrong = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id, pin: '0000' } });
    const missing = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id } });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(wrong.json.token, undefined);
  });

  test('nach 5 Fehlversuchen -> 429, auch mit richtiger PIN', async () => {
    const u = await ctx.srv.createUser('Sperre', '5555');
    for (let i = 0; i < 5; i++) {
      const f = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id, pin: '1111' } });
      assert.equal(f.status, 401);
    }
    const r = await ctx.srv.request('POST', '/api/login', { body: { id: u.user.id, pin: '5555' } });
    assert.equal(r.status, 429);
  });
});

describe('auth-Middleware und POST /api/logout', () => {
  const ctx = withServer();

  test('ohne Token oder mit ungueltigem Token -> 401', async () => {
    const none = await ctx.srv.request('GET', '/api/me/data');
    const bad = await ctx.srv.request('GET', '/api/me/data', { token: 'ungueltig' });
    assert.equal(none.status, 401);
    assert.equal(bad.status, 401);
  });

  test('Token per ?token= Query funktioniert', async () => {
    const u = await ctx.srv.createUser('Query');
    const r = await ctx.srv.request('GET', '/api/me/data?token=' + u.token);
    assert.equal(r.status, 200);
    assert.equal(r.json.user.name, 'Query');
  });

  test('nach /api/logout ist das Token ungueltig', async () => {
    const u = await ctx.srv.createUser('Logout');
    const out = await ctx.srv.request('POST', '/api/logout', { token: u.token });
    const after = await ctx.srv.request('GET', '/api/me/data', { token: u.token });
    assert.equal(out.status, 200);
    assert.equal(after.status, 401);
  });
});

describe('PUT /api/me/pin', () => {
  const ctx = withServer();
  const login = (id, pin) => ctx.srv.request('POST', '/api/login', { body: { id, pin } });

  test('PIN setzen: Login ohne PIN scheitert, mit PIN klappt', async () => {
    const u = await ctx.srv.createUser('Setzen');
    const put = await ctx.srv.request('PUT', '/api/me/pin', { token: u.token, body: { pin: '1234' } });
    assert.equal(put.status, 200);
    assert.equal((await login(u.user.id)).status, 401);
    assert.equal((await login(u.user.id, '1234')).status, 200);
  });

  test('PIN aendern: alte PIN gilt nicht mehr, neue schon', async () => {
    const u = await ctx.srv.createUser('Aendern', '1111');
    await ctx.srv.request('PUT', '/api/me/pin', { token: u.token, body: { pin: '2222' } });
    assert.equal((await login(u.user.id, '1111')).status, 401);
    assert.equal((await login(u.user.id, '2222')).status, 200);
  });

  test('PIN entfernen mit leerem Body: Login ohne PIN klappt, hasPin ist false', async () => {
    const u = await ctx.srv.createUser('Entfernen', '1111');
    const put = await ctx.srv.request('PUT', '/api/me/pin', { token: u.token, body: {} });
    const list = await ctx.srv.request('GET', '/api/users');
    assert.equal(put.status, 200);
    assert.equal((await login(u.user.id)).status, 200);
    assert.equal(list.json.find((x) => x.id === u.user.id).hasPin, false);
  });

  test('ungueltige PIN -> 400 und alte PIN bleibt gueltig', async () => {
    const u = await ctx.srv.createUser('Ungueltig', '1111');
    const put = await ctx.srv.request('PUT', '/api/me/pin', { token: u.token, body: { pin: '12' } });
    assert.equal(put.status, 400);
    assert.equal((await login(u.user.id, '1111')).status, 200);
  });

  test('ohne Token -> 401', async () => {
    const r = await ctx.srv.request('PUT', '/api/me/pin', { body: { pin: '1234' } });
    assert.equal(r.status, 401);
  });
});

describe('/api/me/apikey und /api/ingest', () => {
  const ctx = withServer();
  const ingest = (key, body) => ctx.srv.request('POST', '/api/ingest', { headers: key ? { 'x-api-key': key } : {}, body });

  test('GET /api/me/apikey ist stabil, POST rotiert den Key', async () => {
    const u = await ctx.srv.createUser('Key');
    const a = await ctx.srv.request('GET', '/api/me/apikey', { token: u.token });
    const b = await ctx.srv.request('GET', '/api/me/apikey', { token: u.token });
    const rotated = await ctx.srv.request('POST', '/api/me/apikey', { token: u.token });
    const c = await ctx.srv.request('GET', '/api/me/apikey', { token: u.token });
    assert.ok(a.json.key);
    assert.equal(a.json.key, b.json.key);
    assert.notEqual(rotated.json.key, a.json.key);
    assert.equal(c.json.key, rotated.json.key);
  });

  test('/api/ingest ohne oder mit ungueltigem Key -> 401', async () => {
    const none = await ingest(undefined, { weight: '80' });
    const bad = await ingest('falscherkey', { weight: '80' });
    assert.equal(none.status, 401);
    assert.equal(bad.status, 401);
  });

  test('nach Rotation ist der alte Key ungueltig', async () => {
    const u = await ctx.srv.createUser('Rotation');
    const old = (await ctx.srv.request('GET', '/api/me/apikey', { token: u.token })).json.key;
    await ctx.srv.request('POST', '/api/me/apikey', { token: u.token });
    const r = await ingest(old, { weight: '80' });
    assert.equal(r.status, 401);
  });

  test('gueltiger Key ohne startDate -> 409', async () => {
    const u = await ctx.srv.createUser('OhneStart');
    const key = (await ctx.srv.request('GET', '/api/me/apikey', { token: u.token })).json.key;
    const r = await ingest(key, { date: '2026-01-03', weight: '82.4 kg' });
    assert.equal(r.status, 409);
  });

  test('gueltiger Key mit startDate speichert Gewicht als Tag 3 mit Komma', async () => {
    const u = await ctx.srv.createUser('Erfolg');
    const key = (await ctx.srv.request('GET', '/api/me/apikey', { token: u.token })).json.key;
    await ctx.srv.request('PUT', '/api/me/meta', { token: u.token, body: { startDate: '2026-01-01' } });
    const r = await ingest(key, { date: '2026-01-03', weight: '82.4 kg' });
    assert.equal(r.status, 200);
    assert.equal(r.json.day, 3);
    assert.equal(r.json.set.weight, '82,4');
    const data = await ctx.srv.request('GET', '/api/me/data', { token: u.token });
    assert.equal(data.json.days['3'].weight, '82,4');
  });
});
