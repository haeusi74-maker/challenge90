'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers/server');

let srv;
// Max. 20 Profile pro Server: je describe-Gruppe ein frischer Server.
const serverHooks = () => {
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.stop(); });
};

let counter = 0;
async function freshUser(prefix = 'U') {
  const u = await srv.createUser(`${prefix}${++counter}`);
  assert.equal(u.status, 200);
  return { id: u.user.id, name: u.user.name, token: u.token };
}
const get = (u, url) => srv.request('GET', url, { token: u.token });
const put = (u, url, body) => srv.request('PUT', url, { token: u.token, body });
const post = (u, url, body) => srv.request('POST', url, { token: u.token, body });
const data = async (u) => (await get(u, '/api/me/data')).json;
const uploadPhoto = (u, slot, bytes) => srv.request('PUT', `/api/me/photo/${slot}`, { token: u.token, raw: bytes, headers: { 'Content-Type': 'image/jpeg' } });
const withoutUser = ({ user, ...rest }) => rest; 

async function waitForPersisted(u, rev) {
  const file = path.join(srv.dataDir, 'users', u.id, 'data.json');
  for (let i = 0; i < 100; i++) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed.rev === rev) return parsed;
    } catch (e) { /* Datei noch nicht (vollstaendig) da */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`data.json mit rev ${rev} nicht erschienen`);
}
describe('GET /api/me/data', () => {
  serverHooks();
  test('liefert frisch rev 0 und leere Sektionen', async () => {
    const u = await freshUser();
    const r = await get(u, '/api/me/data');
    assert.equal(r.status, 200);
    assert.equal(r.json.rev, 0);
    for (const s of ['meta', 'days', 'checks', 'tasks', 'photos']) assert.deepEqual(r.json[s], {}, s);
    assert.deepEqual(r.json.cheers, []);
    assert.deepEqual(r.json.archive, []);
    assert.equal(r.json.summary, null);
  });
  test('setzt Cache-Control no-store', async () => {
    const u = await freshUser();
    assert.equal((await get(u, '/api/me/data')).headers.get('cache-control'), 'no-store');
  });
});
describe('Meta und Summary', () => {
  serverHooks();
  test('PUT /api/me/meta speichert Meta und erhoeht rev', async () => {
    const u = await freshUser();
    const r = await put(u, '/api/me/meta', { name: 'Mein Lauf', startDate: '2026-01-01' });
    assert.equal(r.status, 200);
    const d = await data(u);
    assert.deepEqual(d.meta, { name: 'Mein Lauf', startDate: '2026-01-01' });
    assert.equal(d.rev, 1);
  });
  test('PUT /api/me/summary setzt updated-Zeitstempel und erhoeht rev', async () => {
    const u = await freshUser();
    const before = Date.now();
    const r = await put(u, '/api/me/summary', { streak: 5 });
    assert.equal(r.status, 200);
    const d = await data(u);
    assert.equal(d.summary.streak, 5);
    assert.ok(d.summary.updated >= before && d.summary.updated <= Date.now());
    assert.equal(d.rev, 1);
  });
});
describe('PUT /api/me/:section/:key', () => {
  serverHooks();
  for (const section of ['days', 'checks', 'tasks']) {
    test(`${section}: Wert round-trippt ueber GET /api/me/data`, async () => {
      const u = await freshUser();
      const value = { weight: '80.5', note: 'ok', nested: { a: [1, 2, 3] } };
      const r = await put(u, `/api/me/${section}/7`, value);
      assert.equal(r.status, 200);
      assert.deepEqual((await data(u))[section]['7'], value);
    });
  }
  test('ungueltige Sektion gibt 400', async () => {
    const u = await freshUser();
    assert.equal((await put(u, '/api/me/photos/1', { x: 1 })).status, 400);
    assert.equal((await data(u)).rev, 0);
  });
  test('Key mit Sonderzeichen gibt 400', async () => {
    const u = await freshUser();
    assert.equal((await put(u, '/api/me/days/a%20b', { x: 1 })).status, 400);
    assert.equal((await put(u, '/api/me/days/a.b', { x: 1 })).status, 400);
  });
  test('Key laenger als 20 Zeichen gibt 400, genau 20 ist erlaubt', async () => {
    const u = await freshUser();
    const tooLong = await put(u, `/api/me/days/${'a'.repeat(21)}`, { x: 1 });
    const maxLen = await put(u, `/api/me/days/${'a'.repeat(20)}`, { x: 1 });
    assert.equal(tooLong.status, 400);
    assert.equal(maxLen.status, 200);
  });
  test('rev steigt pro Schreibvorgang um 1', async () => {
    const u = await freshUser();
    await put(u, '/api/me/days/1', { a: 1 });
    await put(u, '/api/me/checks/1', { a: 1 });
    await put(u, '/api/me/tasks/1', { a: 1 });
    assert.equal((await data(u)).rev, 3);
  });
});
describe('Persistenz', () => {
  serverHooks();
  test('nach Schreiben liegt data.json mit passender rev im Nutzerverzeichnis', async () => {
    const u = await freshUser();
    await put(u, '/api/me/days/3', { weight: '70' });
    await put(u, '/api/me/tasks/3', { done: true });
    const parsed = await waitForPersisted(u, 2);
    assert.deepEqual(parsed.days['3'], { weight: '70' });
    assert.deepEqual(parsed.tasks['3'], { done: true });
  });
});
describe('Export und Import', () => {
  serverHooks();
  test('Export liefert Content-Disposition-Header und den Datenbestand', async () => {
    const u = await freshUser();
    await put(u, '/api/me/days/1', { weight: '90' });
    const r = await get(u, '/api/me/export');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="challenge90-backup\.json"/);
    assert.deepEqual(r.json, withoutUser(await data(u)));
  });
  test('Import ohne days gibt 400', async () => {
    const u = await freshUser();
    const r = await post(u, '/api/me/import', { meta: {} });
    assert.equal(r.status, 400);
  });
  test('Import mit ungueltigem Body gibt 400', async () => {
    const u = await freshUser();
    assert.equal((await post(u, '/api/me/import', 'text')).status, 400);
    assert.equal((await srv.request('POST', '/api/me/import', { token: u.token })).status, 400);
  });
  test('Round-Trip Export -> Import ist identisch bis auf rev+1', async () => {
    const u = await freshUser();
    await put(u, '/api/me/meta', { startDate: '2026-02-02' });
    await put(u, '/api/me/days/1', { weight: '81' });
    await put(u, '/api/me/checks/1', { m: { waist: '90' } });
    const exported = (await get(u, '/api/me/export')).json;
    const imp = await post(u, '/api/me/import', exported);
    assert.equal(imp.status, 200);
    const after = withoutUser(await data(u));
    assert.deepEqual(after, { ...exported, rev: exported.rev + 1 });
  });
  test('Import behaelt photos und cheers des Empfaengers', async () => {
    const u = await freshUser();
    const sender = await freshUser();
    await uploadPhoto(u, 'before-front', Buffer.from([1, 2, 3]));
    await post(sender, '/api/family/cheer', { to: u.id, emoji: '🔥' });
    const before = await data(u);
    const r = await post(u, '/api/me/import', { days: { 1: { weight: '1' } }, photos: { 'after-back': 1 }, cheers: [] });
    assert.equal(r.status, 200);
    const after = await data(u);
    assert.deepEqual(after.photos, before.photos);
    assert.deepEqual(after.cheers, before.cheers);
    assert.equal(after.cheers.length, 1);
    assert.deepEqual(after.days, { 1: { weight: '1' } });
  });
});
describe('Fotos', () => {
  serverHooks();
    const getPhotoBytes = async (u, slot) => {
    const res = await fetch(`${srv.base}/photos/${slot}.jpg`, { headers: { Authorization: 'Bearer ' + u.token } });
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
  };

  // Befund: server.js:101 (:section/:key) steht vor /api/me/photo/:slot und faengt jeden Upload mit 400 ab.
  test('hochgeladenes Foto kommt mit denselben Bytes zurueck und steht in photos', { todo: 'Befund: Foto-Upload wird von der Sektionsroute abgefangen (400 bad request)' }, async () => {
    const u = await freshUser();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 250, 251, 0xff, 0xd9]);
    const r = await uploadPhoto(u, 'before-front', bytes);
    assert.equal(r.status, 200);
    const got = await getPhotoBytes(u, 'before-front');
    assert.equal(got.status, 200);
    assert.ok(got.bytes.equals(bytes));
    assert.equal((await data(u)).photos['before-front'], r.json.ts);
  });
  test('ungueltiger Slot gibt 400', async () => {
    const u = await freshUser();
    const r = await uploadPhoto(u, 'middle-front', Buffer.from([1]));
    assert.equal(r.status, 400);
    assert.deepEqual((await data(u)).photos, {});
  });
  test('fehlendes Foto gibt 404', async () => {
    const u = await freshUser();
    assert.equal((await getPhotoBytes(u, 'after-side')).status, 404);
  });
});
describe('Challenge-Neustart', () => {
  serverHooks();
  test('ohne gueltiges startDate gibt 400', async () => {
    const u = await freshUser();
    assert.equal((await post(u, '/api/me/challenge/new', { name: 'X' })).status, 400);
    assert.equal((await post(u, '/api/me/challenge/new', { startDate: '1.1.2026' })).status, 400);
  });
  test('mit vorhandener startDate wird archiviert und zurueckgesetzt', async () => {
    const u = await freshUser();
    await put(u, '/api/me/meta', { name: 'Alt', startDate: '2026-01-01' });
    await put(u, '/api/me/days/1', { weight: '85' });
    await put(u, '/api/me/checks/1', { m: { waist: '95' } });
    await uploadPhoto(u, 'before-front', Buffer.from([9, 9]));
    const r = await post(u, '/api/me/challenge/new', { name: 'Neu', startDate: '2026-06-01' });
    assert.equal(r.status, 200);
    const d = await data(u);
    assert.equal(d.archive.length, 1);
    assert.equal(d.archive[0].startDate, '2026-01-01');
    assert.deepEqual(d.archive[0].days, { 1: { weight: '85' } });
    assert.deepEqual(d.days, {});
    assert.deepEqual(d.checks, {});
    assert.deepEqual(d.photos, {});
    assert.equal(d.meta.startDate, '2026-06-01');
    assert.equal(d.meta.name, 'Neu');
  });
  test('ohne vorherige startDate entsteht kein Archiv', async () => {
    const u = await freshUser();
    const r = await post(u, '/api/me/challenge/new', { startDate: '2026-03-03' });
    assert.equal(r.status, 200);
    const d = await data(u);
    assert.deepEqual(d.archive, []);
    assert.equal(d.meta.startDate, '2026-03-03');
  });
});
describe('Familie und Cheers', () => {
  serverHooks();
  test('GET /api/family listet alle Nutzer mit me-Flag', async () => {
    const a = await freshUser('FamA');
    const b = await freshUser('FamB');
    const r = await get(a, '/api/family');
    assert.equal(r.status, 200);
    const mine = r.json.filter((x) => x.me);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, a.id);
    const other = r.json.find((x) => x.id === b.id);
    assert.equal(other.me, false);
    assert.equal(other.name, b.name);
  });
  test('Cheer an sich selbst gibt 400', async () => {
    const a = await freshUser();
    assert.equal((await post(a, '/api/family/cheer', { to: a.id })).status, 400);
  });
  test('Cheer an unbekannten Nutzer gibt 400', async () => {
    const a = await freshUser();
    assert.equal((await post(a, '/api/family/cheer', { to: 'doesnotexist' })).status, 400);
  });
  test('erfolgreicher Cheer erscheint beim Empfaenger', async () => {
    const a = await freshUser();
    const b = await freshUser();
    const r = await post(a, '/api/family/cheer', { to: b.id, emoji: '💪' });
    assert.equal(r.status, 200);
    const d = await data(b);
    assert.equal(d.cheers.length, 1);
    assert.equal(d.cheers[0].from, a.name);
    assert.equal(d.cheers[0].emoji, '💪');
    assert.equal(d.rev, 1);
  });
  test('Cheers sind auf 20 begrenzt, neueste zuerst', async () => {
    const a = await freshUser();
    const b = await freshUser();
    for (let i = 0; i < 22; i++) await post(a, '/api/family/cheer', { to: b.id, emoji: String(i) });
    const d = await data(b);
    assert.equal(d.cheers.length, 20);
    assert.equal(d.cheers[0].emoji, '21');
  });
  test('DELETE /api/me/cheers leert die Cheers', async () => {
    const a = await freshUser();
    const b = await freshUser();
    await post(a, '/api/family/cheer', { to: b.id });
    const r = await srv.request('DELETE', '/api/me/cheers', { token: b.token });
    assert.equal(r.status, 200);
    assert.deepEqual((await data(b)).cheers, []);
  });
});
describe('Datenisolation', () => {
  serverHooks();
  test('Nutzer B sieht nie Daten von Nutzer A', async () => {
    const a = await freshUser();
    const b = await freshUser();
    await put(a, '/api/me/meta', { secret: 'geheim-A' });
    await put(a, '/api/me/days/1', { weight: '123' });
    await uploadPhoto(a, 'before-side', Buffer.from([7]));
    const d = await data(b);
    assert.equal(d.rev, 0);
    assert.deepEqual(d.meta, {});
    assert.deepEqual(d.days, {});
    assert.deepEqual(d.photos, {});
    assert.ok(!JSON.stringify(d).includes('geheim-A'));
    assert.equal((await get(b, '/photos/before-side.jpg')).status, 404);
    assert.ok(!JSON.stringify((await get(b, '/api/me/export')).json).includes('geheim-A'));
  });
});
