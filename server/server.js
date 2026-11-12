const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || '/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PORT = process.env.PORT || 3000;
fs.mkdirSync(path.join(DATA_DIR, 'users'), { recursive: true });

// ---------- Benutzerverwaltung ----------
let reg = { users: [], tokens: {} }; // users: {id,name,color,salt,pin}
try { reg = { ...reg, ...JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) }; } catch (e) { }
const saveReg = () => fs.writeFileSync(USERS_FILE, JSON.stringify(reg));
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const userDir = (id) => path.join(DATA_DIR, 'users', id);
const photoDir = (id) => path.join(userDir(id), 'photos');
const publicUser = (u) => ({ id: u.id, name: u.name, color: u.color, hasPin: !!u.pin });
function issueToken(id) { const t = crypto.randomBytes(24).toString('hex'); reg.tokens[t] = id; saveReg(); return t; }

// ---------- Pro-Benutzer-Datenbank ----------
const emptyDb = () => ({ meta: {}, days: {}, checks: {}, tasks: {}, photos: {}, summary: null, cheers: [], archive: [], rev: 0 });
const dbs = new Map(); const writers = new Map();
function getDb(id) {
  if (!dbs.has(id)) {
    let d = emptyDb();
    try { d = { ...d, ...JSON.parse(fs.readFileSync(path.join(userDir(id), 'data.json'), 'utf8')) }; } catch (e) { }
    dbs.set(id, d);
  }
  return dbs.get(id);
}
function persist(id) {
  const w = writers.get(id) || { saving: false, dirty: false }; writers.set(id, w);
  w.dirty = true; if (w.saving) return;
  w.saving = true; w.dirty = false;
  const file = path.join(userDir(id), 'data.json'), tmp = file + '.tmp';
  fs.writeFile(tmp, JSON.stringify(getDb(id)), (err) => {
    const done = () => { w.saving = false; if (w.dirty) persist(id); };
    if (err) { console.error(err); return done(); }
    fs.rename(tmp, file, done);
  });
}

// Altdaten (Single-User-Version) beim ersten Profil übernehmen
function adoptLegacy(id) {
  const legacy = path.join(DATA_DIR, 'data.json'), lp = path.join(DATA_DIR, 'photos');
  if (fs.existsSync(legacy)) fs.renameSync(legacy, path.join(userDir(id), 'data.json'));
  if (fs.existsSync(lp)) { fs.rmdirSync(photoDir(id)); fs.renameSync(lp, photoDir(id)); }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

app.get('/api/users', (req, res) => res.json(reg.users.map(publicUser)));
app.post('/api/users', (req, res) => {
  const { name, color, pin } = req.body || {};
  if (!name || String(name).trim().length < 1 || String(name).length > 30) return res.status(400).json({ error: 'Name fehlt' });
  if (pin && !/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN: 4–8 Ziffern' });
  if (reg.users.length >= 20) return res.status(400).json({ error: 'Zu viele Profile' });
  const id = crypto.randomBytes(5).toString('hex');
  const u = { id, name: String(name).trim(), color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff6a2b' };
  if (pin) { u.salt = crypto.randomBytes(8).toString('hex'); u.pin = hashPin(pin, u.salt); }
  fs.mkdirSync(photoDir(id), { recursive: true });
  if (reg.users.length === 0) adoptLegacy(id);
  reg.users.push(u);
  res.json({ user: publicUser(u), token: issueToken(id) });
});
const fails = {};
app.post('/api/login', (req, res) => {
  const { id, pin } = req.body || {};
  const u = reg.users.find(x => x.id === id); if (!u) return res.status(404).json({ error: 'unbekannt' });
  if (u.pin) {
    const f = fails[id] || { n: 0, t: 0 };
    if (f.n >= 5 && Date.now() - f.t < 60000) return res.status(429).json({ error: 'Zu viele Versuche – kurz warten' });
    if (hashPin(pin || '', u.salt) !== u.pin) { fails[id] = { n: f.n + 1, t: Date.now() }; return res.status(401).json({ error: 'Falsche PIN' }); }
    delete fails[id];
  }
  res.json({ user: publicUser(u), token: issueToken(id) });
});

// Authentifizierung (Header oder ?token= für Bilder)
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '') || req.query.token;
  const id = reg.tokens[t];
  if (!id || !reg.users.find(u => u.id === id)) return res.status(401).json({ error: 'auth' });
  req.uid = id; req.db = getDb(id); next();
}
app.post('/api/logout', auth, (req, res) => { delete reg.tokens[(req.headers.authorization || '').replace(/^Bearer /, '')]; saveReg(); res.json({ ok: true }); });
const bump = (req) => { req.db.rev++; persist(req.uid); };

app.get('/api/me/data', auth, (req, res) => { res.set('Cache-Control', 'no-store'); const u = reg.users.find(x => x.id === req.uid); res.json({ ...req.db, user: publicUser(u) }); });
app.put('/api/me/meta', auth, (req, res) => { req.db.meta = req.body || {}; bump(req); res.json({ ok: true }); });
app.put('/api/me/summary', auth, (req, res) => { req.db.summary = { ...(req.body || {}), updated: Date.now() }; bump(req); res.json({ ok: true }); });
app.put('/api/me/pin', auth, (req, res) => {
  const u = reg.users.find(x => x.id === req.uid); const { pin } = req.body || {};
  if (pin) { if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN: 4–8 Ziffern' }); u.salt = crypto.randomBytes(8).toString('hex'); u.pin = hashPin(pin, u.salt); } else { delete u.pin; delete u.salt; }
  saveReg(); res.json({ ok: true });
});
const SECTIONS = ['days', 'checks', 'tasks'];
app.put('/api/me/:section/:key', auth, (req, res) => {
  const { section, key } = req.params;
  if (!SECTIONS.includes(section) || !/^[\w-]{1,20}$/.test(key)) return res.status(400).json({ error: 'bad request' });
  req.db[section][key] = req.body; bump(req); res.json({ ok: true });
});

const SLOT = /^(before|after)-(front|back|side)$/;
app.put('/api/me/photo/:slot', auth, express.raw({ type: '*/*', limit: '15mb' }), (req, res) => {
  if (!SLOT.test(req.params.slot)) return res.status(400).json({ error: 'bad slot' });
  fs.writeFile(path.join(photoDir(req.uid), req.params.slot + '.jpg'), req.body, (err) => {
    if (err) return res.status(500).json({ error: 'write failed' });
    req.db.photos[req.params.slot] = Date.now(); bump(req); res.json({ ok: true, ts: req.db.photos[req.params.slot] });
  });
});
app.get('/photos/:slot.jpg', auth, (req, res) => {
  if (!SLOT.test(req.params.slot)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, no-cache');
  res.sendFile(path.join(photoDir(req.uid), req.params.slot + '.jpg'), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});
app.get('/api/me/export', auth, (req, res) => { res.set('Content-Disposition', 'attachment; filename="challenge90-backup.json"'); res.json(req.db); });
app.post('/api/me/import', auth, (req, res) => {
  const b = req.body; if (!b || typeof b !== 'object' || !b.days) return res.status(400).json({ error: 'invalid backup' });
  const keep = { photos: req.db.photos, cheers: req.db.cheers };
  dbs.set(req.uid, { ...emptyDb(), ...b, ...keep, rev: req.db.rev + 1 }); persist(req.uid); res.json({ ok: true });
});

// ---------- Import (Apple Health / Kurzbefehle) ----------
function apiKeyOf(u) { if (!u.apiKey) { u.apiKey = crypto.randomBytes(18).toString('hex'); saveReg(); } return u.apiKey; }
app.get('/api/me/apikey', auth, (req, res) => res.json({ key: apiKeyOf(reg.users.find(u => u.id === req.uid)) }));
app.post('/api/me/apikey', auth, (req, res) => { const u = reg.users.find(x => x.id === req.uid); u.apiKey = null; res.json({ key: apiKeyOf(u) }); });

// Toleranter Zahlen-Parser: "82.4 kg", "10,025", "7,5 h"
function parseNum(v) {
  if (v == null) return NaN; if (typeof v === 'number') return v;
  let t = String(v).trim().replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  return parseFloat(t.replace(',', '.'));
}
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDE = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');
function dayIndex(startDate, dateStr) {
  const [y, m, d] = startDate.split('-').map(Number), [y2, m2, d2] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
}
app.all('/api/ingest', (req, res) => {
  const key = req.headers['x-api-key'] || req.query.key || (req.body && req.body.key);
  const u = key && reg.users.find(x => x.apiKey && x.apiKey === key);
  if (!u) return res.status(401).json({ error: 'API-Key ungültig' });
  const p = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  const db = getDb(u.id);
  if (!db.meta.startDate) return res.status(409).json({ error: 'Challenge noch nicht gestartet (Startdatum fehlt)' });
  const now = new Date(); const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const date = /^\d{4}-\d{2}-\d{2}/.test(p.date || '') ? p.date.slice(0, 10) : today;
  const n = dayIndex(db.meta.startDate, date);
  if (n < 1 || n > 1000) return res.status(422).json({ error: `Datum ${date} liegt vor dem Start der Challenge (Tag ${n})` });
  const day = db.days[n] = db.days[n] || {}; const set = {};
  const put = (f, v) => { day[f] = v; set[f] = v; };
  let v;
  if (Number.isFinite(v = parseNum(p.weight)) && v > 20 && v < 400) put('weight', fmtDE(v, 2));
  if (Number.isFinite(v = parseNum(p.steps)) && v >= 0) put('steps', String(Math.round(v)));
  let sh = parseNum(p.sleepHours); if (!Number.isFinite(sh) && Number.isFinite(v = parseNum(p.sleepMinutes))) sh = v / 60;
  if (Number.isFinite(sh) && sh > 0 && sh < 24) { const mins = Math.round(sh * 60); put('sleep', `${Math.floor(mins / 60)}:${pad2(mins % 60)}`); }
  let w = parseNum(p.water); if (!Number.isFinite(w) && Number.isFinite(v = parseNum(p.waterMl))) w = v / 1000;
  if (Number.isFinite(w) && w >= 0) put('water', fmtDE(w, 2));
  for (const f of ['kcal', 'protein', 'fat', 'carbs']) if (Number.isFinite(v = parseNum(p[f])) && v >= 0) put(f, fmtDE(v, 1));
  if (!Object.keys(set).length) return res.status(400).json({ error: 'Keine bekannten Werte (weight, steps, sleepHours, sleepMinutes, water, waterMl, kcal, protein, fat, carbs)' });
  db.rev++; persist(u.id);
  res.json({ ok: true, day: n, date, set });
});

// ---------- KI-Anbindung (anbieterunabhängig) ----------
const AI_FILE = path.join(DATA_DIR, 'ai.json');
let ai = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: '', apiKey: '' };
try { ai = { ...ai, ...JSON.parse(fs.readFileSync(AI_FILE, 'utf8')) }; } catch (e) { }
if (!ai.apiKey && process.env.AI_API_KEY) ai.apiKey = process.env.AI_API_KEY;
const saveAi = () => fs.writeFileSync(AI_FILE, JSON.stringify(ai), { mode: 0o600 });
const aiPublic = () => ({ provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, hasKey: !!ai.apiKey });
const base = () => ai.baseUrl.replace(/\/+$/, '');

app.get('/api/ai/config', auth, (req, res) => res.json(aiPublic()));
app.put('/api/ai/config', auth, (req, res) => {
  const { provider, baseUrl, model, apiKey } = req.body || {};
  if (!['anthropic', 'openai'].includes(provider) || !/^https?:\/\//.test(baseUrl || '')) return res.status(400).json({ error: 'Ungültige Konfiguration' });
  ai.provider = provider; ai.baseUrl = baseUrl; ai.model = String(model || '');
  if (typeof apiKey === 'string' && apiKey.trim()) ai.apiKey = apiKey.trim();
  saveAi(); res.json(aiPublic());
});
async function aiFetch(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(90000) });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch (e) { j = null; }
  if (!r.ok) throw new Error((j && (j.error && (j.error.message || j.error) || j.message)) || `HTTP ${r.status}: ${text.slice(0, 200)}`);
  return j;
}
const aiHeaders = () => ai.provider === 'anthropic'
  ? { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
  : { Authorization: 'Bearer ' + ai.apiKey, 'content-type': 'application/json' };
app.get('/api/ai/models', auth, async (req, res) => {
  try {
    const j = await aiFetch(base() + (ai.provider === 'anthropic' ? '/v1/models?limit=100' : '/models'), { headers: aiHeaders() });
    const list = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).map(x => String(x).replace(/^models\//, ''));
    res.json(list.sort());
  } catch (e) { res.status(502).json({ error: e.message }); }
});

const MEAL_PROMPT = `Du bist ein Ernährungs-Assistent. Analysiere die Mahlzeit (Foto und/oder Beschreibung) und schätze Mengen und Nährwerte so realistisch wie möglich. Berücksichtige versteckte Fette (Öl, Soßen, Dressings) und typische Portionsgrößen. Wenn die Beschreibung Mengen nennt, haben diese Vorrang vor der Bildschätzung.
Antworte AUSSCHLIESSLICH mit JSON in diesem Format, ohne Text davor oder danach:
{"items":[{"name":"...","grams":0,"kcal":0,"protein":0,"fat":0,"carbs":0}],"confidence":"hoch|mittel|niedrig","notes":"kurze Hinweise zu Unsicherheiten"}
Zahlen sind Zahlen (kein Text), Protein/Fett/Kohlenhydrate in Gramm, Kalorien in kcal, je Zutat bzw. Gericht für die gezeigte Portion.`;
function extractJson(t) {
  t = String(t).replace(/```json|```/g, ''); const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Antwort der KI war kein JSON: ' + t.slice(0, 150));
  return JSON.parse(t.slice(a, b + 1));
}
app.post('/api/me/meal/analyze', auth, async (req, res) => {
  const { image, text } = req.body || {};
  if (!ai.apiKey) return res.status(400).json({ error: 'Noch kein API-Key hinterlegt (Start → KI-Anbindung).' });
  if (!ai.model) return res.status(400).json({ error: 'Kein Modell gewählt (Start → KI-Anbindung).' });
  if (!image && !text) return res.status(400).json({ error: 'Foto oder Beschreibung nötig.' });
  const b64 = image ? String(image).replace(/^data:image\/\w+;base64,/, '') : null;
  const userText = (text ? `Beschreibung: ${String(text).slice(0, 1000)}` : 'Keine Beschreibung, nur Foto.');
  try {
    let out;
    if (ai.provider === 'anthropic') {
      const content = []; if (b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }); content.push({ type: 'text', text: userText });
      const j = await aiFetch(base() + '/v1/messages', { method: 'POST', headers: aiHeaders(), body: JSON.stringify({ model: ai.model, max_tokens: 1500, system: MEAL_PROMPT, messages: [{ role: 'user', content }] }) });
      out = (j.content || []).map(c => c.text || '').join('');
    } else {
      const content = []; content.push({ type: 'text', text: userText }); if (b64) content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } });
      const j = await aiFetch(base() + '/chat/completions', { method: 'POST', headers: aiHeaders(), body: JSON.stringify({ model: ai.model, messages: [{ role: 'system', content: MEAL_PROMPT }, { role: 'user', content: b64 ? content : userText }] }) });
      out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    }
    const r = extractJson(out);
    const n = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0; };
    res.json({ items: (r.items || []).slice(0, 20).map(i => ({ name: String(i.name || '?').slice(0, 80), grams: n(i.grams), kcal: n(i.kcal), protein: n(i.protein), fat: n(i.fat), carbs: n(i.carbs) })), confidence: r.confidence || '', notes: String(r.notes || '').slice(0, 400) });
  } catch (e) { console.error('AI error:', e.message); res.status(502).json({ error: e.message }); }
});

// ---------- Challenge-Material (Ordner /content) ----------
const CONTENT_DIR = process.env.CONTENT_DIR || '/content';
const CTYPES = { md: 'md', txt: 'txt', pdf: 'pdf', mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', jpg: 'image', jpeg: 'image', png: 'image', mp4: 'video', m4v: 'video' };
const natural = (a, b) => a.localeCompare(b, 'de', { numeric: true });
const stripExt = (n) => n.replace(/\.[^.]+$/, '');
const NUMPFX = /^(\d{1,3}(?:\.\d{1,3})*)(?=[\s._-])/; // "03", "03.09"
function prettify(n) { return stripExt(n).replace(/^\d{1,3}(?:\.\d{1,3})*[\s._-]+/, '').replace(/^AUDIO[\s_-]+/i, '').replace(/_{3,}/g, ' – ').replace(/_/g, ' ').trim() || n; }
const normKey = (n) => prettify(n).toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').trim();
function groupKey(f) { const m = stripExt(f).match(NUMPFX); return m ? 'n' + m[1].split('.').map(Number).join('.') : 't' + normKey(f); }
const randomId = (t) => /^\d{8,}/.test(t) || /^[\w-]{18,}$/.test(t);
// Coaching-Wochen werden mit dem Challenge-Fortschritt freigeschaltet (Woche N ab Tag 7·(N−1)+1; Woche 0 immer)
const weekOfDir = (d) => { const m = d.match(/^(?:coaching[\s_-]*)?woche[\s_-]*0*(\d+)$/i) || (/^(?:coaching[\s_-]*)?woche[\s_-]*0+$/i.test(d) ? [0, '0'] : null); return m ? +m[1] : null; };
function unlockedWeek(db) {
  if (db.meta.unlockAll) return Infinity;
  if (!db.meta.startDate) return 0;
  const now = new Date(), today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return Math.max(0, Math.ceil(dayIndex(db.meta.startDate, today) / 7));
}
app.get('/api/content', auth, (req, res) => {
  const out = []; const maxWeek = unlockedWeek(req.db);
  const subdirs = (rel) => { try { return fs.readdirSync(path.join(CONTENT_DIR, rel), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name); } catch (e) { return []; } };
  const dirs = []; for (const d of subdirs('')) { dirs.push(d); if (/^vorab/i.test(d)) dirs.push(...subdirs(d).map(x => d + '/' + x)); } // vorab/<Modul> als eigene Abschnitte
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(path.join(CONTENT_DIR, d), { withFileTypes: true }).filter(f => f.isFile() && !f.name.startsWith('.')).map(f => f.name).sort(natural); } catch (e) { }
    files = files.filter(f => CTYPES[f.split('.').pop().toLowerCase()] && !(/\.md$/i.test(f) && fs.statSync(path.join(CONTENT_DIR, d, f)).size < 100)); // leere Transkripte ausblenden
    if (!files.length) continue;
    const groups = new Map();
    for (const f of files) {
      const ext = f.split('.').pop().toLowerCase(); const k = groupKey(f);
      if (!groups.has(k)) groups.set(k, { files: [], order: f });
      groups.get(k).files.push({ name: f, path: d + '/' + f, type: CTYPES[ext], size: fs.statSync(path.join(CONTENT_DIR, d, f)).size });
    }
    // Dateien ohne Nummer zu einem nummerierten Beitrag mit gleichem Titel dazunehmen (z. B. 03.09_Ballaststoffe.mp3 + Ballaststoffe.pdf)
    for (const [k, g] of [...groups]) {
      if (k[0] !== 't') continue;
      const tgt = [...groups.entries()].find(([k2, g2]) => k2[0] === 'n' && normKey(g2.files[0].name) === k.slice(1));
      if (tgt) { tgt[1].files.push(...g.files); groups.delete(k); }
    }
    const rank = { md: 0, txt: 0, pdf: 1, audio: 2, video: 3, image: 4 };
    const items = [...groups.values()].sort((x, y) => natural(x.order, y.order)).map(g => {
      g.files.sort((x, y) => rank[x.type] - rank[y.type]);
      const named = g.files.find(f => f.type === 'md' || f.type === 'txt' || f.type === 'pdf') || g.files[0];
      let title = prettify(named.name);
      if (randomId(title)) title = /bestätig|teilnahme/i.test(g.files.map(f => f.name).join(' ')) ? 'Teilnahmebestätigung' : 'Dokument';
      if (/^\d{8,}/.test(stripExt(named.name))) title = 'Teilnahmebestätigung';
      // Transkript = .md mit dem Dateinamen des Audios; die übrige .md ist nur der Text-Auszug aus dem PDF
      const stems = (t) => g.files.filter(f => t.includes(f.type)).map(f => stripExt(f.name));
      const media = stems(['audio', 'video']), pdfs = stems(['pdf']);
      for (const f of g.files) if (f.type === 'md' && media.includes(stripExt(f.name)) && f.size > 200) f.role = 'transcript';
      if (g.files.some(f => f.role) && pdfs.length) g.files = g.files.filter(f => !(f.type === 'md' && !f.role));
      return { title, files: g.files };
    });
    const week = weekOfDir(d);
    const vorab = /^vorab/i.test(d); const sub = d.includes('/');
    const locked = week != null && week > maxWeek;
    const unlockDay = week != null ? 7 * (week - 1) + 1 : null;
    out.push({ id: d, week, vorab, title: sub ? 'Vorab · ' + d.split('/').pop().replace(/^(\d+(?:\.\d+)?)\.?\s+/, '$1 ').replace(/_/g, ' ') : vorab ? 'Vorab-Informationen' : prettify(d.replace(/^woche[-_ ]0*(\d+)$/i, 'Woche $1')), locked, unlockDay, count: items.length, items: locked ? [] : items });
  }
  const ord = (g) => g.vorab ? [0, 0] : g.week != null ? [1, g.week] : [2, 0];
  out.sort((a, b) => { const x = ord(a), y = ord(b); return x[0] - y[0] || x[1] - y[1] || natural(a.id, b.id); });
  res.json(out);
});
app.get('/content/*', auth, (req, res) => {
  const rel = req.params[0];
  if (!rel || rel.split('/').some(p => p.startsWith('.'))) return res.sendStatus(404);
  const wk = weekOfDir(rel.split('/')[0]);
  if (wk != null && wk > unlockedWeek(req.db)) return res.status(403).json({ error: 'Noch nicht freigeschaltet' });
  res.sendFile(rel, { root: CONTENT_DIR, acceptRanges: true }, (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});

// ---------- Neue Challenge / Archiv ----------
app.post('/api/me/challenge/new', auth, (req, res) => {
  const { name, startDate } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) return res.status(400).json({ error: 'Startdatum fehlt' });
  const d = req.db;
  if (d.meta.startDate) {
    const aid = crypto.randomBytes(4).toString('hex');
    const dir = path.join(photoDir(req.uid), 'arch-' + aid); fs.mkdirSync(dir, { recursive: true });
    for (const slot of Object.keys(d.photos)) { try { fs.renameSync(path.join(photoDir(req.uid), slot + '.jpg'), path.join(dir, slot + '.jpg')); } catch (e) { } }
    d.archive = d.archive || [];
    d.archive.push({ id: aid, name: d.meta.name || `Challenge ${d.archive.length + 1}`, startDate: d.meta.startDate, endedAt: Date.now(), meta: d.meta, days: d.days, checks: d.checks, photos: d.photos });
  }
  const old = d.meta;
  const days = Object.keys(d.days || {}).map(Number).sort((a, b) => b - a);
  const lastW = (days.map(i => d.days[i].weight).find(w => w) || (old.status || {}).weight || '');
  const lastCk = Object.values(d.checks || {}).reverse().find(c => c && c.m && Object.values(c.m).some(v => v)) ;
  d.meta = { ...old, name: String(name || `Challenge ${(d.archive || []).length + 1}`).slice(0, 40), startDate, status: { weight: lastW, bf: '', m: { ...(lastCk ? lastCk.m : (old.status || {}).m || {}) } } };
  d.days = {}; d.checks = {}; d.photos = {}; d.summary = null; d.rev++; persist(req.uid);
  res.json({ ...d, user: publicUser(reg.users.find(x => x.id === req.uid)) });
});
app.get('/photos/archive/:aid/:slot.jpg', auth, (req, res) => {
  if (!SLOT.test(req.params.slot) || !/^[0-9a-f]{8}$/.test(req.params.aid)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(photoDir(req.uid), 'arch-' + req.params.aid, req.params.slot + '.jpg'), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});

// ---------- Familie ----------
app.get('/api/family', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(reg.users.map(u => { const d = getDb(u.id); return { ...publicUser(u), me: u.id === req.uid, summary: d.summary, startDate: (d.meta || {}).startDate || null }; }));
});
app.post('/api/family/cheer', auth, (req, res) => {
  const { to, emoji } = req.body || {};
  if (!reg.users.find(u => u.id === to) || to === req.uid) return res.status(400).json({ error: 'bad' });
  const d = getDb(to); const from = reg.users.find(u => u.id === req.uid).name;
  d.cheers = [{ from, emoji: String(emoji || '👏').slice(0, 4), ts: Date.now() }, ...(d.cheers || [])].slice(0, 20); d.rev++; persist(to);
  res.json({ ok: true });
});
app.delete('/api/me/cheers', auth, (req, res) => { req.db.cheers = []; bump(req); res.json({ ok: true }); });

app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.listen(PORT, () => console.log('Challenge90 läuft auf Port ' + PORT));
