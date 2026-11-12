'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { startServer } = require('./helpers/server');

const SECRET = 'GEHEIM-' + Math.random().toString(36).slice(2);
const filler = (n, s = 'x') => s.repeat(n);
const W0_BODY = '# Woche 0\n' + filler(150);

let srv;
let secretPath;
let token;

function put(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function seed({ contentDir }) {
  // Dateitypen-Filter, Sortierung, Gruppierung, Transkript
  put(contentDir, 'allgemein/1_Eins.md', filler(150));
  put(contentDir, 'allgemein/2_Zwei.md', filler(150));
  put(contentDir, 'allgemein/10_Zehn.md', filler(150));
  put(contentDir, 'allgemein/programm.exe', filler(300));
  put(contentDir, 'allgemein/notiz.docx', filler(300));
  put(contentDir, 'allgemein/.versteckt.md', filler(300));
  put(contentDir, 'allgemein/kurz.md', filler(50));
  put(contentDir, 'allgemein/03.09_Ballaststoffe.mp3', 'audio');
  put(contentDir, 'allgemein/Ballaststoffe.pdf', 'pdf');
  put(contentDir, 'allgemein/03.09_Ballaststoffe.md', filler(250));
  put(contentDir, 'allgemein/.dotdir/geheim.md', filler(300));
  // Titel
  put(contentDir, 'titel/AUDIO_Teil_1___Einleitung_Kurz.mp3', 'audio');
  // Vorab
  put(contentDir, 'vorab/info.md', filler(150));
  put(contentDir, 'vorab/Modul_A/start.md', filler(150));
  // Wochen
  put(contentDir, 'woche-0/start.md', W0_BODY);
  put(contentDir, 'woche-1/eins.md', filler(150));
  put(contentDir, 'woche-2/zwei.md', filler(150));
  put(contentDir, 'woche-2/.geheim.md', filler(150));
  // Datei ausserhalb von CONTENT_DIR fuer Traversal-Tests
  secretPath = path.join(contentDir, '..', 'secret.txt');
  fs.writeFileSync(secretPath, SECRET);
}

before(async () => {
  srv = await startServer({ seed });
  token = (await srv.createUser('Content')).token;
});
after(async () => {
  await srv.stop();
  fs.rmSync(secretPath, { force: true });
});

const section = (list, id) => list.find((s) => s.id === id);
const todayStr = () => {
  const n = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};
async function userWithMeta(meta) {
  const u = await srv.createUser('U' + Math.random().toString(36).slice(2, 8));
  const r = await srv.request('PUT', '/api/me/meta', { token: u.token, body: meta });
  assert.equal(r.status, 200);
  return u.token;
}
async function contentList(tok) {
  const r = await srv.request('GET', '/api/content', { token: tok });
  assert.equal(r.status, 200);
  return r.json;
}
// fetch normalisiert '..', daher roher Pfad ueber node:http
function rawGet(rawPath, tok) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.port, method: 'GET', path: rawPath,
      headers: { Authorization: 'Bearer ' + tok } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('GET /api/content ohne Token gibt 401', async () => {
  const r = await srv.request('GET', '/api/content');
  assert.equal(r.status, 401);
});

test('blendet unbekannte Endungen, Dotfiles und Dot-Ordner aus', async () => {
  const list = await contentList(token);
  const names = section(list, 'allgemein').items.flatMap((i) => i.files.map((f) => f.name));
  assert.ok(!names.includes('programm.exe'));
  assert.ok(!names.includes('notiz.docx'));
  assert.ok(!names.includes('.versteckt.md'));
  assert.ok(!list.some((s) => s.id.includes('.dotdir')));
  assert.ok(names.includes('1_Eins.md'));
});

test('blendet .md unter 100 Bytes aus', async () => {
  const list = await contentList(token);
  const names = section(list, 'allgemein').items.flatMap((i) => i.files.map((f) => f.name));
  assert.ok(!names.includes('kurz.md'));
});

test('sortiert natuerlich: 2 vor 10', async () => {
  const list = await contentList(token);
  const titles = section(list, 'allgemein').items.map((i) => i.title);
  assert.ok(titles.indexOf('Zwei') < titles.indexOf('Zehn'));
  assert.ok(titles.indexOf('Eins') < titles.indexOf('Zwei'));
});

test('gruppiert nummerierte Dateien mit gleichem Praefix zu einem Beitrag', async () => {
  const list = await contentList(token);
  const items = section(list, 'allgemein').items.filter((i) => i.title === 'Ballaststoffe');
  assert.equal(items.length, 1);
  const names = items[0].files.map((f) => f.name).sort();
  assert.deepEqual(names, ['03.09_Ballaststoffe.md', '03.09_Ballaststoffe.mp3', 'Ballaststoffe.pdf']);
});

test('markiert .md mit Audio-Stammnamen und ueber 200 Bytes als Transkript', async () => {
  const list = await contentList(token);
  const item = section(list, 'allgemein').items.find((i) => i.title === 'Ballaststoffe');
  const md = item.files.find((f) => f.name === '03.09_Ballaststoffe.md');
  assert.equal(md.role, 'transcript');
  assert.equal(item.files.find((f) => f.type === 'audio').role, undefined);
});

test('prettify entfernt AUDIO_ und Nummernpraefix, ___ wird Gedankenstrich, _ Leerzeichen', async () => {
  const list = await contentList(token);
  const titles = section(list, 'titel').items.map((i) => i.title);
  assert.deepEqual(titles, ['Teil 1 – Einleitung Kurz']);
  const numbered = section(list, 'allgemein').items.map((i) => i.title);
  assert.ok(numbered.includes('Eins') && !numbered.some((t) => /^\d/.test(t)));
});

test('Ordner vorab und vorab/<Modul> sind eigene Vorab-Abschnitte', async () => {
  const list = await contentList(token);
  const top = section(list, 'vorab');
  const mod = section(list, 'vorab/Modul_A');
  assert.equal(top.vorab, true);
  assert.equal(top.title, 'Vorab-Informationen');
  assert.equal(mod.vorab, true);
  assert.equal(mod.title, 'Vorab · Modul A');
  assert.equal(list[0].vorab, true);
});

test('ohne startDate ist nur Woche 0 offen, Woche 1 und 2 gesperrt mit unlockDay', async () => {
  const tok = await userWithMeta({});
  const list = await contentList(tok);
  const w0 = section(list, 'woche-0'), w1 = section(list, 'woche-1'), w2 = section(list, 'woche-2');
  assert.equal(w0.locked, false);
  assert.equal(w0.items.length, 1);
  assert.equal(w1.locked, true);
  assert.deepEqual(w1.items, []);
  assert.equal(w1.unlockDay, 1);
  assert.equal(w2.locked, true);
  assert.deepEqual(w2.items, []);
  assert.equal(w2.unlockDay, 8);
});

test('meta.unlockAll schaltet alle Wochen frei', async () => {
  const tok = await userWithMeta({ unlockAll: true });
  const list = await contentList(tok);
  for (const id of ['woche-0', 'woche-1', 'woche-2']) {
    assert.equal(section(list, id).locked, false, id);
    assert.equal(section(list, id).items.length, 1, id);
  }
});

test('mit startDate heute ist Woche 1 offen und Woche 2 gesperrt', async () => {
  const tok = await userWithMeta({ startDate: todayStr() });
  const list = await contentList(tok);
  assert.equal(section(list, 'woche-1').locked, false);
  assert.equal(section(list, 'woche-1').items.length, 1);
  assert.equal(section(list, 'woche-2').locked, true);
});

test('GET /content/* liefert mit Token die Datei-Bytes', async () => {
  const r = await srv.request('GET', '/content/woche-0/start.md', { token });
  assert.equal(r.status, 200);
  assert.equal(r.text, W0_BODY);
});

test('GET /content/* ohne Token gibt 401', async () => {
  const r = await srv.request('GET', '/content/woche-0/start.md');
  assert.equal(r.status, 401);
});

test('Dotfile-Pfad gibt 404', async () => {
  const r1 = await srv.request('GET', '/content/allgemein/.versteckt.md', { token });
  const r2 = await srv.request('GET', '/content/allgemein/.dotdir/geheim.md', { token });
  assert.equal(r1.status, 404);
  assert.equal(r2.status, 404);
});

test('gesperrte Woche gibt 403, auch bei Dotfile-freiem Pfad', async () => {
  const tok = await userWithMeta({});
  const r = await srv.request('GET', '/content/woche-1/eins.md', { token: tok });
  assert.equal(r.status, 403);
});

test('nicht vorhandene Datei gibt 404', async () => {
  const r = await srv.request('GET', '/content/woche-0/gibt-es-nicht.md', { token });
  assert.equal(r.status, 404);
});

for (const [label, rawPath] of [
  ['../data/users.json', '/content/../data/users.json'],
  ['%2e%2e/%2e%2e/etc/passwd', '/content/%2e%2e/%2e%2e/etc/passwd'],
  ['woche-0/..%2f..%2fsecret.txt', '/content/woche-0/..%2f..%2fsecret.txt'],
  ['../secret.txt', '/content/../secret.txt'],
  ['%2e%2e%2fsecret.txt', '/content/%2e%2e%2fsecret.txt'],
  ['woche-0/%2e%2e/%2e%2e/secret.txt', '/content/woche-0/%2e%2e/%2e%2e/secret.txt'],
]) {
  test(`Path Traversal ${label} liefert nie Inhalt ausserhalb von CONTENT_DIR`, async () => {
    const r = await rawGet(rawPath, token);
    assert.ok(r.status >= 400 && r.status < 500, 'Status war ' + r.status);
    assert.ok(!r.body.includes(SECRET), 'Geheimer Inhalt wurde ausgeliefert');
    assert.ok(!r.body.includes('root:'), 'Systemdatei wurde ausgeliefert');
  });
}
