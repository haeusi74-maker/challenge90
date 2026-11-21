/* 90-Tage-Challenge – Workbook-App */
'use strict';

const C = window.CONTENT;
const $app = document.getElementById('app');
const $status = document.getElementById('status');

const MEASURES = [
  ['schulter', 'Schulter'], ['brust', 'Brust'], ['armR', 'Rechter Arm'], ['armL', 'Linker Arm'],
  ['bauchO', '5 cm über Nabel'], ['bauch', 'Bauch am Nabel'], ['bauchU', '5 cm unter Nabel'],
  ['huefte', 'Hüfte (breiteste Stelle)'], ['beinL', 'Linkes Bein'], ['beinR', 'Rechtes Bein'],
];
const DEFAULT_TARGETS = { kcal: 2000, protein: 120, fat: 65, carbs: 230, sleep: '8:00', steps: 10000, water: 3 };
const METRICS = [
  ['kcal', 'Kalorien', 'kcal', 'decimal'], ['protein', 'Protein', 'g', 'decimal'], ['fat', 'Fett', 'g', 'decimal'],
  ['carbs', 'Kohlenhydrate', 'g', 'decimal'], ['sleep', 'Schlaf', 'h:min', 'text'], ['steps', 'Schritte', '', 'numeric'],
  ['water', 'Getrunken', 'Liter', 'decimal'],
];
// Wöchentliche (w), monatliche (m) Checks und Abschluss – wie im Workbook
function buildChecks(W) {
  const L = [];
  for (let w = 1; w <= W; w++) {
    let key = `w${w}`, label = `Woche ${w}`;
    if (w === 4) { key = 'm1'; label = 'Monat 1'; } else if (w === 8) { key = 'm2'; label = 'Monat 2'; }
    else if (w > 12 && w % 4 === 0) { key = `m${w / 4}`; label = `Monat ${w / 4}`; }
    L.push([key, label, w * 7]);
  }
  L.push(['final', 'Meilenstein: Auswertung nach 90 Tagen', 90]);
  return L.sort((a, b) => a[2] - b[2] || (a[0] === 'final' ? 1 : -1));
}
let CHECKS = buildChecks(12);
const TASKS = [
  ['t1', 'Eine Sache, die du sofort besser machen könntest', 'Notiere eine Sache, die du sofort und noch heute besser machen könntest, die deine Gesundheit und deine Fitness sofort besser machen würden – und auch warum. (2–5 Min.)'],
  ['t2', 'Auswirkungen auf dein Umfeld und deine Familie', 'Wie wirkt sich ein fitter und vitaler Körper auf deine Freunde und deine Familie aus? Welche Art von Vater oder Mutter kannst du eines Tages sein? Für wen wirst du ein Vorbild? Wie kann dein Leben in 6 Monaten, 2, 5 oder 10 Jahren aussehen? (2–5 Min.)'],
  ['t3', 'Auswirkungen auf deine Karriere', 'Wie wird sich deine Karriere entwickeln, wenn du mehr Kraft und Fokus im Alltag hast, seltener krank und widerstandsfähiger bist? Wie in 6 Monaten? 2 Jahren? 5 Jahren? (5–10 Min.)'],
  ['t4', 'Charaktereigenschaften, die du bewunderst', 'Überlege dir zwei bis drei Leute, die du bewunderst. Warum ausgerechnet sie? Welche Charaktereigenschaften besitzen sie, die du selber gerne hättest? (5 Min.)'],
  ['t5', 'Deine ideale Zukunft', 'Wer willst du sein? Wo willst du hin mit deinem Leben? Warum willst du diese Dinge? Wie hilft dir ein starker Körper dabei? Wie planst du diesen Körper zu erreichen? Welche Maßnahmen führen zum Erfolg? Keine Grenzen, kein Richtig oder Falsch. (10 Min.)'],
  ['t6', 'Deine Zukunft, wenn du scheiterst …', 'Stell dir ausführlich vor, wie sich dein Leben negativ entwickelt, wenn du aufgibst. Wie wirkt sich das auf Karriere, Energielevel in Familie, als Freund und Partner aus? Wo willst du auf keinen Fall enden? (15 Min.)'],
  ['t7', 'Deine Strategie im Notfall', 'Welche Hindernisse hattest du in der Vergangenheit? Welche Probleme können auftreten? Wie willst du reagieren? Beispiel: Du liegst morgens im Bett und hast keine Lust auf Sport … Was sagst du dir, damit du trotzdem gehst? Entwirf Wenn-Dann-Strategien. (15 Min.)'],
];
const KERN = ['Kalorienmenge getroffen', 'Proteinzufuhr getroffen', 'ausreichend Schlaf (7 bis 8,5 Stunden)', 'genügend Wasser getrunken (ca. 4 bis 6 Liter)', 'im Training gewesen (an Trainingstagen)', 'stärker im Training geworden', 'tägliche Schrittzahl erreicht'];

// ---------- Helpers ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const num = (v) => { if (v == null || v === '') return NaN; let t = String(v).trim(); if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); return parseFloat(t.replace(',', '.')); };
const fmt = (n, d = 1) => Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '–';
const sgn = (n, d = 1) => Number.isFinite(n) ? (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d) : '–';
function parseSleep(s) { // "8:12" | "8h 12" | "8,5" -> Stunden
  if (s == null || s === '') return NaN;
  s = String(s).trim().toLowerCase();
  let m = s.match(/^(\d{1,2})\s*(?::|h)\s*(\d{1,2})?\s*(?:min\.?)?$/);
  if (m) return +m[1] + (+m[2] || 0) / 60;
  return num(s);
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dateOfDay(n) { const s = parseISO(DATA.meta.startDate); s.setDate(s.getDate() + n - 1); return s; }
const fmtDate = (d) => `${WD[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
function todayIndex() { // 0 = noch nicht gestartet, >90 = vorbei
  if (!DATA.meta.startDate) return 0;
  const a = parseISO(DATA.meta.startDate), b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 864e5) + 1;
}
// Offene Laufzeit: mindestens 90 Tage, danach so lange wie die Challenge läuft
const lastDay = () => Math.max(90, todayIndex() + 7);
const clampDay = (n) => Math.max(1, Math.min(lastDay(), n));
const isPause = (n) => ((DATA.days[n] || {}).mode === 'pause');
const loggedDays = () => Object.keys(DATA.days).map(Number).filter(i => i >= 1 && hasData(i)).sort((a, b) => a - b);

// ---------- Datenhaltung / Sync ----------
let DATA = { meta: {}, days: {}, checks: {}, tasks: {}, photos: {}, rev: 0 };
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
let SESSION = null; try { SESSION = JSON.parse(LS.get('c90-session') || 'null'); } catch (e) { }
let pending = {};
function loadLocal() {
  DATA = { meta: {}, days: {}, checks: {}, tasks: {}, photos: {}, cheers: [], archive: [], rev: 0 }; pending = {};
  if (!SESSION) return;
  try { const c = LS.get('c90-cache-' + SESSION.id); if (c) DATA = { ...DATA, ...JSON.parse(c) }; } catch (e) { }
  try { pending = JSON.parse(LS.get('c90-pending-' + SESSION.id) || '{}'); } catch (e) { }
}
loadLocal();
function api(url, opt = {}) {
  opt.headers = { ...(opt.headers || {}), ...(SESSION ? { Authorization: 'Bearer ' + SESSION.token } : {}) };
  return fetch(url, opt).then(r => { if (r.status === 401 && SESSION && !url.startsWith('/api/login')) { logout(true); throw new Error('auth'); } return r; });
}
const jput = (url, body, method = 'PUT') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function logout(silent) { SESSION = null; LS.set('c90-session', 'null'); clearTimeout(timer); loadLocal(); view = 'login'; render(); }
const photoUrl = (slot, ts) => `/photos/${slot}.jpg?t=${ts}&token=${SESSION.token}`;
let timer = null, retry = null;

function cache() { if (!SESSION) return; LS.set('c90-cache-' + SESSION.id, JSON.stringify(DATA)); LS.set('c90-pending-' + SESSION.id, JSON.stringify(pending)); }
function say(msg, err) { $status.textContent = msg; $status.className = 'status show' + (err ? ' err' : ''); clearTimeout(say.t); if (!err) say.t = setTimeout(() => $status.classList.remove('show'), 1200); }
function save(section, key) { // section: meta|days|checks|tasks
  pending[section + '/' + key] = 1; cache(); clearTimeout(timer); timer = setTimeout(flush, 500);
}
async function flush() {
  const keys = Object.keys(pending); if (!keys.length) return;
  try {
    for (const pk of keys) {
      const [section, key] = pk.split('/');
      const r = section === 'meta' ? await jput('/api/me/meta', DATA.meta) : await jput(`/api/me/${section}/${key}`, DATA[section][key]);
      if (!r.ok) throw new Error(r.status);
      delete pending[pk];
    }
    cache(); say('Gespeichert ✓'); pushSummary();
  } catch (e) { if (e.message === 'auth') return; say('Offline – wird nachgesendet', true); clearTimeout(retry); retry = setTimeout(flush, 5000); }
}
async function load() {
  try {
    if (Object.keys(pending).length) await flush();
    const r = await api('/api/me/data', { cache: 'no-store' });
    if (!r.ok) throw 0;
    const d = await r.json();
    if (!Object.keys(pending).length) { DATA = { meta: {}, days: {}, checks: {}, tasks: {}, photos: {}, cheers: [], rev: 0, ...d }; cache(); }
  } catch (e) { if (e.message !== 'auth') say('Server nicht erreichbar – Offline-Stand', true); }
}

let lastSum = '';
function pushSummary() {
  const t = todayIndex(); if (!SESSION || t < 1) return;
  let logged = 0, tr = 0, sc = [], wk = 0;
  logged = loggedDays().length;
  for (let i = Math.max(1, t - 6); i <= t; i++) { const s = dayScore(i); if (s != null) sc.push(s); if ((DATA.days[i] || {}).done === true) wk++; }
  tr = Object.values(DATA.days).filter(d => d.done === true).length;
  const sum = { day: t, logged, streak: streak(), avg7: sc.length ? Math.round(sc.reduce((a, b) => a + b) / sc.length * 100) : null, trainWeek: wk, trainTotal: tr, todayDone: hasData(t) };
  if (DATA.meta.shareWeight) { const w0 = startWeight(); let wl = NaN; for (const i of loggedDays().reverse()) if (Number.isFinite(weightOf(i))) { wl = weightOf(i); break; } if (Number.isFinite(wl - w0)) sum.dWeight = Math.round((wl - w0) * 10) / 10; }
  const j = JSON.stringify(sum); if (j === lastSum) return; lastSum = j;
  jput('/api/me/summary', sum).catch(() => { lastSum = ''; });
}

// ---------- Auswertung ----------
function targetOf(day, f) {
  const own = day && day.soll && day.soll[f]; if (own) return own;
  const base = (DATA.meta.targets || DEFAULT_TARGETS)[f];
  if (f === 'kcal' && day && day.mode === 'event') { const ev = num(DATA.meta.eventKcal); return Number.isFinite(ev) && ev > 0 ? ev : (num(base) || 0) + 800; }
  return base;
}
function evalDay(n) {
  const d = DATA.days[n] || {}; const res = [];
  if (d.mode === 'pause') return res;
  const T = (f) => num(targetOf(d, f));
  const add = (label, ok) => res.push({ label, ok });
  const kcal = num(d.kcal), prot = num(d.protein), sl = parseSleep(d.sleep), st = num(d.steps), wa = num(d.water);
  if (Number.isFinite(kcal) && T('kcal')) add('Kalorien', d.mode === 'event' ? kcal <= T('kcal') * 1.07 : Math.abs(kcal - T('kcal')) <= T('kcal') * 0.07);
  if (Number.isFinite(prot) && T('protein')) add('Protein', prot >= T('protein') * 0.95);
  if (Number.isFinite(sl)) add('Schlaf', sl >= (parseSleep(targetOf(d, 'sleep')) || 7) - 0.5);
  if (Number.isFinite(wa) && T('water')) add('Wasser', wa >= T('water') * 0.95);
  if (Number.isFinite(st) && T('steps')) add('Schritte', st >= T('steps'));
  if (d.planned === true) { add('Training', d.done === true); if (d.done === true && d.prog != null) add('Progression', d.prog === true); }
  else if (d.planned == null && d.done === true) add('Training', true);
  return res;
}
const dayScore = (n) => { const r = evalDay(n); return r.length ? r.filter(x => x.ok).length / r.length : null; };
function hasData(n) { const d = DATA.days[n]; return !!d && (['weight', 'kcal', 'protein', 'fat', 'carbs', 'sleep', 'steps', 'water'].some(k => d[k] !== '' && d[k] != null) || d.done != null || d.planned != null); }
function weightOf(n) { const w = num((DATA.days[n] || {}).weight); return Number.isFinite(w) ? w : NaN; }
function avgWeight(a, b) { const v = []; for (let i = a; i <= b; i++) { const w = weightOf(i); if (Number.isFinite(w)) v.push(w); } return v.length ? v.reduce((x, y) => x + y) / v.length : NaN; }
function startWeight() { const w = num((DATA.meta.status || {}).weight); return Number.isFinite(w) ? w : (() => { for (let i = 1; i <= 7; i++) if (Number.isFinite(weightOf(i))) return weightOf(i); return NaN; })(); }
function streak() { let s = 0; const t = todayIndex(); for (let i = t; i >= 1; i--) { if (hasData(i)) s++; else if (isPause(i)) continue; else if (i !== t) break; } return s; }

// ---------- Navigation ----------
let view = 'today', curDay = null, sub = null, ready = false;
const tabs = document.getElementById('tabs');
tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { go(b.dataset.v); } });
function go(v, s) { view = v; sub = s || null; render(); window.scrollTo(0, 0); }
function render() {
  if (!SESSION) view = 'login';
  CHECKS = buildChecks(Math.max(12, Math.ceil(Math.max(todayIndex(), 1) / 7)));
  tabs.style.display = view === 'login' ? 'none' : '';
  [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.v === view));
  $app.replaceChildren();
  if (view === 'login') return vLogin();
  if (!ready && !DATA.meta.startDate) return void $app.append(h('div', { class: 'sub', style: 'padding:40px 0;text-align:center' }, 'Lade …'));
  if (ready && !DATA.meta.startDate && view !== 'start' && view !== 'wissen') return go('start');
  ({ today: vToday, history: vHistory, archive: () => vArchive(sub), checks: vChecks, family: vFamily, wissen: vWissen, start: vStart })[view]();
}

// ---------- Eingabefelder ----------
function input(opts) { // opts: value, onInput, type, inputmode, placeholder
  const i = h('input', { type: opts.type || 'text', inputmode: opts.inputmode, placeholder: opts.placeholder || '', autocomplete: 'off', value: opts.value ?? '' });
  i.addEventListener('input', () => opts.onInput(i.value));
  return i;
}
// Kalorien- & Makro-Rechner (Modul 7, Schritte 1–3) – übernimmt auf Wunsch die Tagesziele
function calcCard(meta, touch) {
  const P = meta.profile = meta.profile || { sex: '', age: '', height: '', af: '1.65', goal: 'deficit' };
  const out = h('div');
  const sel = (opts, value, onChange) => {
    const s = h('select', null, opts.map(([v, l]) => h('option', { value: v, ...(String(v) === String(value) ? { selected: true } : {}) }, l)));
    s.addEventListener('change', () => onChange(s.value)); return s;
  };
  const st = meta.status = meta.status || { m: {} };
  const profile = () => ({ ...P, weight: st.weight });
  const paint = () => {
    const err = CALC.validateProfile(profile());
    if (err) return out.replaceChildren(h('div', { class: 'hint' }, err));
    const r = CALC.calcPlan(profile());
    out.replaceChildren(
      h('div', { class: 'hint' }, `Grundumsatz ${fmt(r.bmr, 0)} kcal × Aktivität = Erhaltung ${fmt(r.tdee, 0)} kcal. Fett mindestens ${r.fatMin} g (Größe ÷ 3).`),
      h('div', { class: 'chips' }, h('span', { class: 'chip ok' }, `${fmt(r.kcal, 0)} kcal`), h('span', { class: 'chip' }, `P ${r.protein} g`), h('span', { class: 'chip' }, `F ${r.fat} g`), h('span', { class: 'chip' }, `KH ${r.carbs} g`)),
      h('button', { class: 'btn acc', onclick: () => {
        meta.targets = { ...(meta.targets || DEFAULT_TARGETS), kcal: String(r.kcal), protein: String(r.protein), fat: String(r.fat), carbs: String(r.carbs) };
        touch(); say('Tagesziele übernommen ✓'); render();
      } }, 'Als Tagesziele übernehmen'),
      h('div', { class: 'hint' }, 'Startwerte für die ersten 14 Tage – danach im Check anpassen (Coaching Woche 2).'));
  };
  const field = (label, ctl) => h('div', { class: 'field' }, h('label', null, label), ctl);
  const upd = (k) => (v) => { P[k] = v; touch(); paint(); };
  const weightIn = input({ value: st.weight, inputmode: 'decimal', onInput: v => { st.weight = v; touch(); const o = document.getElementById('st-weight'); if (o) o.value = v; paint(); } });
  weightIn.id = 'calc-weight';
  const card = h('div', { class: 'card' }, h('h3', null, 'Kalorien & Makros berechnen'),
    h('div', { class: 'row' },
      field('Gewicht (kg)', weightIn),
      field('Geschlecht', sel([['', '– wählen –'], ['m', 'Mann'], ['f', 'Frau']], P.sex, upd('sex'))),
      field('Alter (Jahre)', input({ value: P.age, inputmode: 'numeric', onInput: upd('age') })),
      field('Größe (cm)', input({ value: P.height, inputmode: 'numeric', onInput: upd('height') }))),
    field('Aktivität im Alltag', sel(CALC.ACTIVITY, P.af, upd('af'))),
    field('Ziel', sel(Object.entries(CALC.GOALS).map(([k, g]) => [k, g.label]), P.goal, upd('goal'))),
    out);
  paint();
  return card;
}
function yn(value, onChange) {
  const y = h('button', { type: 'button' }, 'Ja'), n = h('button', { type: 'button' }, 'Nein');
  const paint = (v) => { y.className = 'y' + (v === true ? ' on' : ''); n.className = 'n' + (v === false ? ' on' : ''); };
  const set = (v) => { value = (value === v) ? null : v; paint(value); onChange(value); };
  y.onclick = () => set(true); n.onclick = () => set(false); paint(value);
  return h('div', { class: 'yn' }, y, n);
}

// ---------- HEUTE ----------
function vToday() {
  const t = todayIndex();
  if (curDay == null) curDay = clampDay(t);
  const n = curDay;
  const day = DATA.days[n] = DATA.days[n] || {};
  const q = C.quotes[(n - 1) % 90];
  const dt = dateOfDay(n);
  const touch = () => { save('days', n); upd(); };

  const ring = h('div', { class: 'ring' }, h('span', null, '–'));
  const chips = h('div', { class: 'chips' });
  const upd = () => {
    const r = evalDay(n); const s = dayScore(n);
    ring.style.setProperty('--p', s == null ? 0 : Math.round(s * 100));
    ring.firstChild.textContent = s == null ? '–' : Math.round(s * 100) + '%';
    chips.replaceChildren(...r.map(x => h('span', { class: 'chip ' + (x.ok ? 'ok' : 'no') }, (x.ok ? '✓ ' : '✗ ') + x.label)));
  };

  $app.append(
    h('div', { class: 'dayhead' },
      h('div', null, h('h1', null, `Tag ${n}`), h('div', { class: 'sub' }, fmtDate(dt) + (n === t ? ' · heute' : n > t ? ' · geplant' : '') + (n > 90 ? ' · Runde 2+' : ''))),
      h('div', { class: 'nav' },
        h('button', { class: 'btn', disabled: n <= 1, onclick: () => { curDay = n - 1; render(); window.scrollTo(0, 0); } }, '‹'),
        h('button', { class: 'btn', disabled: n >= lastDay(), onclick: () => { curDay = n + 1; render(); window.scrollTo(0, 0); } }, '›'))),
    h('div', { class: 'card quote' }, h('p', null, '„' + q.text + '“'), q.author ? h('small', null, '— ' + q.author) : null));

  if ((DATA.cheers || []).length && n === clampDay(t)) {
    $app.append(h('div', { class: 'banner' }, h('span', null, (DATA.cheers.slice(0, 3).map(c => `${c.emoji} ${c.from}`).join(' · ')) + ' feuert dich an!'),
      h('button', { class: 'btn sm', onclick: () => { api('/api/me/cheers', { method: 'DELETE' }); DATA.cheers = []; render(); } }, 'OK')));
  }
  if (t < 1) $app.append(h('div', { class: 'banner' }, h('span', null, `Die Challenge startet am ${fmtDate(parseISO(DATA.meta.startDate))}.`)));
  if (CHECKS.some(c => c[2] === n)) {
    const c = CHECKS.find(c => c[2] === n && c[0] !== 'final') || CHECKS.find(c => c[2] === n);
    $app.append(h('div', { class: 'banner' }, h('span', null, `📏 ${c[1]}: Heute ist Mess- und Wiege-Tag.`), h('button', { class: 'btn acc sm', onclick: () => go('checks', c[0]) }, 'Zum Check')));
  }

  const wk = Math.ceil(n / 7);
  if (t >= 1 && n === clampDay(t) && CONTENT_CACHE !== false) {
    loadContent().then(g => { const grp = g.find(x => x.week === wk && !x.locked); if (grp && view === 'today' && curDay === n) mat.replaceChildren(h('div', { class: 'banner' }, h('span', null, `📚 ${n === 1 || n % 7 === 1 ? 'Neu: ' : ''}Material für Woche ${wk} (${grp.items.length} Beiträge)`), h('button', { class: 'btn acc sm', onclick: () => go('wissen') }, 'Öffnen'))); });
  }
  const mat = h('div'); $app.append(mat);
  // Tagesmodus
  const modeBtn = (v, label) => h('button', { type: 'button', class: (day.mode || 'normal') === v ? 'on' : '', onclick: () => { day.mode = v === 'normal' ? undefined : v; save('days', n); render(); } }, label);
  $app.append(h('div', { class: 'card' }, h('div', { class: 'seg' }, modeBtn('normal', 'Normal'), modeBtn('event', '🎉 Event'), modeBtn('pause', '⏸ Pause')),
    day.mode === 'event' ? h('div', { style: 'margin-top:10px' }, h('label', null, 'Anlass'), input({ value: day.event, placeholder: 'z. B. Weihnachtsfeier', onInput: v => { day.event = v; save('days', n); } }),
      h('div', { class: 'hint' }, `Kalorienziel heute: ${fmt(num(targetOf(day, 'kcal')), 0)} kcal (Standard unter „Start“ einstellbar). Nur nach oben begrenzt.`)) : null,
    day.mode === 'pause' ? h('div', { class: 'hint' }, 'Pause-Tage (Urlaub, krank) zählen weder für noch gegen dich: Serie und Durchschnitt bleiben unberührt.') : null));
  $app.append(weekCard(n));

  // Körpergewicht
  $app.append(h('div', { class: 'card' },
    h('div', { class: 'score' }, h('div', { style: 'flex:1' }, h('label', null, 'Körpergewicht (kg)'),
      input({ value: day.weight, inputmode: 'decimal', placeholder: 'z. B. 82,4', onInput: v => { day.weight = v; touch(); } })), ring), chips));

  // Ernährung / Aktivität
  const rows = [h('div', { class: 'mhead' }, h('span'), h('span', null, 'Soll'), h('span', null, 'Ist'))];
  for (const [f, label, unit, im] of METRICS) {
    rows.push(h('div', { class: 'metric' },
      h('b', null, label, h('div', { class: 'u' }, unit)),
      input({ value: (day.soll && day.soll[f]) ?? '', placeholder: String(targetOf(day, f) ?? ''), inputmode: im, onInput: v => { day.soll = day.soll || {}; if (v === '') delete day.soll[f]; else day.soll[f] = v; touch(); } }),
      input({ value: day[f], inputmode: im, placeholder: f === 'sleep' ? '8:12' : '', onInput: v => { day[f] = v; touch(); } })));
  }
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Ernährung & Alltag'), ...rows,
    h('div', { class: 'hint' }, 'Soll ist vorausgefüllt (Einstellungen unter „Start“) und lässt sich pro Tag überschreiben.')));

  // Mahlzeiten (KI)
  day.meals = day.meals || [];
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Mahlzeiten'),
    ...day.meals.map((m, i) => h('div', { class: 'meal' },
      h('div', { style: 'flex:1' }, h('b', null, m.name), h('div', { class: 'sub' }, `${fmt(m.kcal, 0)} kcal · P ${fmt(m.protein, 0)} · F ${fmt(m.fat, 0)} · KH ${fmt(m.carbs, 0)}`)),
      h('button', { class: 'btn sm danger', onclick: () => { if (!confirm(`„${m.name}“ entfernen?`)) return; applyMeal(day, m, -1); day.meals.splice(i, 1); save('days', n); render(); } }, '✕'))),
    h('button', { class: 'btn acc', style: 'width:100%;margin-top:8px', onclick: () => mealDialog(day, n) }, '📷 Mahlzeit per KI erfassen')));

  // Krafttraining
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Krafttraining'),
    h('div', { class: 'row3' },
      h('div', null, h('label', null, 'Geplant'), yn(day.planned ?? null, v => { day.planned = v; touch(); })),
      h('div', null, h('label', null, 'Durchgeführt'), yn(day.done ?? null, v => { day.done = v; touch(); })),
      h('div', null, h('label', null, 'Progression'), yn(day.prog ?? null, v => { day.prog = v; touch(); })))));

  // Drei Dinge
  const bullets = (key, title) => {
    day[key] = day[key] || ['', '', ''];
    return h('div', { class: 'card bullets' }, h('h3', null, title),
      day[key].map((v, i) => h('div', { class: 'field' }, h('span', { class: 'dot' }, '●'),
        input({ value: v, onInput: x => { day[key][i] = x; touch(); } }))));
  };
  $app.append(bullets('good', 'Drei Dinge, die gestern gut liefen'), bullets('todo', 'Drei Dinge, die ich heute umsetze'));
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Notizen'),
    h('textarea', { placeholder: 'Training, Gefühl, Besonderheiten …', oninput: (e) => { day.note = e.target.value; touch(); } }, day.note || '')));
  upd();
}

// Rollende 7-Tage-Bilanz (endet am angezeigten Tag)
function weekCard(n) {
  const thr = (num(DATA.meta.okPct) || 80) / 100, goal = num(DATA.meta.weekGoal) || 5;
  let bud = 0, eat = 0, kd = 0, ok = 0, cnt = 0, lg = 0;
  for (let i = Math.max(1, n - 6); i <= n; i++) {
    const d = DATA.days[i] || {}; if (d.mode === 'pause') continue; cnt++;
    const sc = dayScore(i); if (sc != null) { lg++; if (sc >= thr) ok++; }
    const k = num(d.kcal), tk = num(targetOf(d, 'kcal'));
    if (Number.isFinite(k) && Number.isFinite(tk)) { eat += k; bud += tk; kd++; }
  }
  const need = Math.min(goal, cnt), good = ok >= need && cnt > 0;
  const saldo = bud - eat;
  return h('div', { class: 'card' }, h('h3', null, 'Letzte 7 Tage (rollend)'),
    h('div', { class: 'stats' },
      stat(`${ok}/${cnt}`, `Tage im Soll (≥${Math.round(thr * 100)}%)`),
      stat(kd ? fmt(eat / kd, 0) : '–', 'Ø kcal/Tag'),
      stat(kd ? sgn(saldo, 0) : '–', 'Budget-Saldo')),
    h('div', { class: 'chips' }, h('span', { class: 'chip ' + (good ? 'ok' : '') }, `Wochenziel: ${need} von ${cnt} Tagen ${good ? '✓ erreicht' : lg ? '– noch offen' : ''}`)),
    kd ? h('div', { class: 'hint' }, `Gegessen ${fmt(eat, 0)} von ${fmt(bud, 0)} kcal Budget (nur Tage mit Kalorieneintrag; Events haben ihr eigenes Ziel). ${saldo >= 0 ? 'Du liegst unter dem Budget.' : 'Du liegst über dem Budget – ein paar ruhigere Tage gleichen das locker aus.'}` ) : h('div', { class: 'hint' }, 'Sobald du Kalorien einträgst, siehst du hier dein Wochenbudget.'));
}

// ---------- VERLAUF ----------
function vHistory() {
  const t = todayIndex();
  const logged = loggedDays();
  const scores = logged.map(dayScore).filter(s => s != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b) / scores.length : NaN;
  const w0 = startWeight(); let wl = NaN; for (const i of [...logged].reverse()) if (Number.isFinite(weightOf(i))) { wl = weightOf(i); break; }

  $app.append(h('h1', null, 'Verlauf'), h('div', { class: 'sub' }, DATA.meta.startDate ? `Start: ${fmtDate(parseISO(DATA.meta.startDate))}` : ''));
  $app.append(h('div', { class: 'card' }, h('div', { class: 'stats' },
    stat(logged.length + (t > 0 && t < 90 ? '/90' : ''), 'Tage geloggt'), stat(streak() + '', 'Serie'), stat(Number.isFinite(avg) ? Math.round(avg * 100) + '%' : '–', 'Ø Erfüllung'),
    stat(Number.isFinite(wl) ? fmt(wl) : '–', 'Gewicht kg'), stat(Number.isFinite(wl + w0) ? sgn(wl - w0) : '–', 'seit Start'), stat(fmt(logged.filter(i => DATA.days[i].done === true).length, 0), 'Trainings'))));

  const grid = h('div', { class: 'grid' });
  const cells = Math.max(90, Math.ceil(Math.max(t, ...(logged.length ? [logged[logged.length - 1]] : [0])) / 10) * 10);
  for (let i = 1; i <= cells; i++) {
    const s = dayScore(i); const md = (DATA.days[i] || {}).mode;
    const cls = 'cell' + (md === 'event' ? ' ev' : md === 'pause' ? ' pa' : '') + (s == null ? (hasData(i) ? ' l1' : '') : s >= 0.99 ? ' l3' : s >= 0.6 ? ' l2' : ' l1') + (i === t ? ' today' : '') + (i % 7 === 0 ? ' wk' : '');
    grid.append(h('button', { class: cls, onclick: () => { curDay = i; go('today'); } }, String(i)));
  }
  $app.append(h('h2', null, cells > 90 ? 'Alle Tage' : '90 Tage'), h('div', { class: 'card' }, grid,
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--acc)' }), 'alles erfüllt'), h('span', null, h('i', { style: 'background:rgba(255,106,43,.55)' }), '≥ 60 %'), h('span', null, h('i', { style: 'background:rgba(255,106,43,.28)' }), 'geloggt'), h('span', null, h('i', { style: 'background:#2f9cf4' }), 'Event'), h('span', null, h('i', { style: 'background:var(--line)' }), 'Pause'))));

  $app.append(h('h2', null, 'Gewichtsverlauf'), h('div', { class: 'card' }, chart(logged)));
  $app.append(h('h2', null, 'Letzte Tage'));
  const rec = logged.slice(-7).reverse();
  if (!rec.length) $app.append(h('div', { class: 'sub' }, 'Noch keine Einträge.'));
  const list = h('div', { class: 'list' });
  for (const i of rec) {
    const d = DATA.days[i]; const s = dayScore(i);
    list.append(h('button', { class: 'item', onclick: () => { curDay = i; go('today'); } },
      h('span', null, h('b', null, `Tag ${i}`), h('div', { class: 'meta' }, `${fmtDate(dateOfDay(i))}${d.weight ? ' · ' + d.weight + ' kg' : ''}${d.kcal ? ' · ' + d.kcal + ' kcal' : ''}`)),
      h('span', { class: s != null && s >= .99 ? 'done' : 'meta' }, s == null ? '' : Math.round(s * 100) + '%')));
  }
  $app.append(list);
}
const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));

function chart(logged) {
  const pts = []; for (const i of logged) { const w = weightOf(i); if (Number.isFinite(w)) pts.push([i, w]); }
  if (pts.length < 2) return h('div', { class: 'sub' }, 'Ab zwei Gewichtseinträgen erscheint hier die Kurve.');
  // gleitender 7-Tage-Schnitt
  const avgP = pts.map(([i]) => { const v = pts.filter(([j]) => j <= i && j > i - 7).map(p => p[1]); return [i, v.reduce((a, b) => a + b) / v.length]; });
  const all = pts.map(p => p[1]); let lo = Math.min(...all), hi = Math.max(...all); const m = Math.max((hi - lo) * .15, .3); lo -= m; hi += m;
  const W = 340, H = 180, L = 34, R = 8, T = 8, B = 22;
  const maxX = Math.max(14, pts[pts.length - 1][0]);
  const x = i => L + (i - 1) / (maxX - 1) * (W - L - R), y = w => T + (hi - w) / (hi - lo) * (H - T - B);
  const path = (a) => a.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%');
  let s = '';
  for (let k = 0; k <= 3; k++) { const w = lo + (hi - lo) * k / 3; s += `<line x1="${L}" x2="${W - R}" y1="${y(w)}" y2="${y(w)}" stroke="var(--line)"/><text x="${L - 4}" y="${y(w) + 3}" text-anchor="end">${fmt(w, 1)}</text>`; }
  for (let i = 1; i <= maxX; i += (maxX > 45 ? 14 : 7)) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${i}</text>`;
  s += `<path d="${path(pts)}" fill="none" stroke="var(--mute)" stroke-width="1.5" opacity=".6"/>`;
  s += pts.map(p => `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="2.5" fill="var(--mute)"/>`).join('');
  s += `<path d="${path(avgP)}" fill="none" stroke="var(--acc)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const i of logged) if ((DATA.days[i] || {}).mode === 'event' && i <= maxX) s += `<text x="${x(i)}" y="${H - 14}" text-anchor="middle" style="fill:#2f9cf4">▲</text>`;
  svg.innerHTML = s;
  return h('div', null, svg, h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--mute)' }), 'Tageswert'), h('span', null, h('i', { style: 'background:var(--acc)' }), 'gleitend (7 Tage)')));
}

// ---------- CHECKS ----------
function checkRange(key) {
  const c = CHECKS.find(c => c[0] === key); return [Math.max(1, c[2] - 6), c[2]];
}
function vChecks() {
  if (sub) return vCheck(sub);
  $app.append(h('h1', null, 'Checks'), h('div', { class: 'sub' }, 'Wöchentlich messen & wiegen, monatlich Kalorien anpassen.'));
  const list = h('div', { class: 'list', style: 'margin-top:12px' });
  const t = todayIndex();
  for (const [k, label, day] of CHECKS) {
    const ck = DATA.checks[k]; const filled = ck && (Object.values(ck.m || {}).some(v => v !== '' && v != null) || ck.fazit || ck.newKcal);
    const due = t >= day && !filled, soon = !due && t >= day - 1 && !filled;
    list.append(h('button', { class: 'item', onclick: () => go('checks', k) },
      h('span', null, h('b', null, label), h('div', { class: 'meta' }, k === 'final' ? 'Tag 90 · Maße, Fotos & Fazit (Zwischenziel)' : `nach Tag ${day}` + (DATA.meta.startDate ? ' · ' + fmtDate(dateOfDay(day)) : ''))),
      h('span', { class: filled ? 'done' : 'meta' }, filled ? '✓' : due ? '● fällig' : soon ? 'morgen' : '')));
  }
  $app.append(list);
}
function vCheck(key) {
  const idx = CHECKS.findIndex(c => c[0] === key); const [, label, endDay] = CHECKS[idx];
  const isFinal = key === 'final', isMonth = key[0] === 'm';
  const ck = DATA.checks[key] = DATA.checks[key] || { m: {} }; ck.m = ck.m || {};
  const [a, b] = checkRange(key);
  const prevKey = idx > 0 ? CHECKS[idx - 1][0] : null;
  const prevM = isFinal ? ((DATA.meta.status || {}).m || {}) : (prevKey && DATA.checks[prevKey] ? (DATA.checks[prevKey].m || {}) : ((DATA.meta.status || {}).m || {}));
  const startM = (DATA.meta.status || {}).m || {};
  const touch = () => { save('checks', key); calc(); };
  const w0 = startWeight();
  let wNow, wPrev;
  if (isFinal) { wNow = Number.isFinite(weightOf(90)) ? weightOf(90) : avgWeight(84, 90); wPrev = w0; }
  else { wNow = avgWeight(a, b); wPrev = a > 1 ? avgWeight(a - 7, a - 1) : w0; }

  const wInfo = h('div', { class: 'stats' });
  const calc = () => {
    const base = Number.isFinite(num(ck.weight)) ? num(ck.weight) : wNow;
    const items = isFinal
      ? [stat(fmt(base), 'Gewicht Tag 90'), stat(fmt(w0), 'Gewicht Tag 1'), stat(sgn(base - w0), 'Veränderung')]
      : [stat(fmt(base), 'gleitend diese Woche'), stat(fmt(wPrev), 'gleitend Vorwoche'), stat(sgn(base - wPrev), 'Δ Woche')];
    if (!isFinal) items.push(stat(sgn(base - w0), 'Δ seit Tag 1'));
    if (isMonth) { const mb = key === 'm1' ? w0 : avgWeight(a - 28, a - 22); items.push(stat(sgn(base - mb), 'Δ diesen Monat')); }
    wInfo.replaceChildren(...items);
    wInfo.style.gridTemplateColumns = items.length === 4 ? '1fr 1fr' : '1fr 1fr 1fr';
    for (const [mk] of MEASURES) {
      const cur = num(ck.m[mk]);
      const dP = document.getElementById('dp-' + mk), dS = document.getElementById('ds-' + mk);
      if (dP) setDelta(dP, cur - num(prevM[mk])); if (dS) setDelta(dS, cur - num(startM[mk]));
    }
  };
  const setDelta = (el, v) => { el.textContent = Number.isFinite(v) ? sgn(v) : '–'; el.className = 'delta ' + (v < 0 ? 'neg' : v > 0 ? 'pos' : ''); };

  $app.append(h('button', { class: 'back', onclick: () => go('checks') }, '‹ Alle Checks'),
    h('h1', null, label), h('div', { class: 'sub' }, isFinal ? 'Das große Finale – Tag 90' : `Tag ${a}–${b} · ${fmtDate(dateOfDay(b))}`));

  $app.append(h('div', { class: 'card' }, h('h3', null, isFinal ? 'Körpergewicht' : 'Körpergewicht (gleitend)'),
    wInfo, h('div', { class: 'field', style: 'margin-top:10px' }, h('label', null, `${isFinal ? 'Gewicht Tag 90' : 'Gleitendes Gewicht'} manuell (optional, sonst Ø der Tageswerte)`),
      input({ value: ck.weight, inputmode: 'decimal', placeholder: Number.isFinite(wNow) ? fmt(wNow, 2) : 'kg', onInput: v => { ck.weight = v; touch(); } }))));

  const head = h('div', { class: 'mtable h' }, h('span', null, 'Umfang (cm)'), h('span', null, isFinal ? 'Tag 90' : 'Aktuell'), h('span', { style: 'text-align:right' }, isFinal ? 'Δ Tag 1' : 'Δ Vorwoche'), h('span', { style: 'text-align:right' }, isFinal ? '' : 'Δ Tag 1'));
  const rows = MEASURES.map(([mk, ml]) => h('div', { class: 'mtable' }, h('span', { class: 'n' }, ml),
    input({ value: ck.m[mk], inputmode: 'decimal', onInput: v => { ck.m[mk] = v; touch(); } }),
    h('span', { id: 'dp-' + mk, class: 'delta' }), isFinal ? h('span') : h('span', { id: 'ds-' + mk, class: 'delta' })));
  if (isFinal) { /* Δ Tag 1 steht in Spalte 3 */ }
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Umfänge'), head, ...rows,
    h('div', { class: 'hint' }, 'Richtig messen: immer morgens, nüchtern, locker stehen, Maßband anliegend, nicht einschnüren. Hüfte an der breitesten Stelle.')));

  if (isMonth) {
    $app.append(h('div', { class: 'card' }, h('h3', null, 'Anpassungen'),
      h('div', { class: 'row' },
        h('div', null, h('label', null, 'Aktuelle Kalorienmenge'), input({ value: ck.oldKcal ?? ((DATA.meta.targets || DEFAULT_TARGETS).kcal), inputmode: 'numeric', onInput: v => { ck.oldKcal = v; touch(); } })),
        h('div', null, h('label', null, 'Neue Kalorienmenge'), input({ value: ck.newKcal, inputmode: 'numeric', onInput: v => { ck.newKcal = v; touch(); } }))),
      h('button', { class: 'btn sm', style: 'margin-top:10px', onclick: () => {
        const v = num(ck.newKcal); if (!Number.isFinite(v)) return alert('Bitte neue Kalorienmenge eintragen.');
        DATA.meta.targets = { ...(DATA.meta.targets || DEFAULT_TARGETS), kcal: v }; save('meta', 'meta'); say('Neues Kalorienziel gesetzt ✓');
      } }, 'Als neues Tagesziel übernehmen')));
  }
  if (isFinal) {
    $app.append(h('div', { class: 'card' }, h('h3', null, 'Deine Nachher-Bilder'), photoGrid('after'),
      h('div', { class: 'hint' }, 'Sende ein aktuelles Foto + Erfahrungsbericht gern an 90tage@sjardfitness.de.')));
  }
  $app.append(h('div', { class: 'card' }, h('h3', null, isFinal ? 'Fazit' : 'Notizen'),
    h('textarea', { placeholder: isFinal ? 'Wie ist es gelaufen? Wie hat sich dein Körper verändert? Welche Gewohnheiten hast du gemeistert?' : 'Wie lief die Woche? Was ändere ich?', oninput: e => { ck.fazit = e.target.value; touch(); } }, ck.fazit || '')));
  calc();
}

// ---------- Fotos ----------
function photoGrid(kind) {
  const g = h('div', { class: 'photos' });
  for (const [s, l] of [['front', 'von vorn'], ['back', 'von hinten'], ['side', 'seitlich']]) {
    const slot = `${kind}-${s}`; const ts = DATA.photos[slot];
    const box = h('div', { class: 'photo' }, ts ? h('img', { src: photoUrl(slot, ts) }) : h('span', null, '＋ Foto'),
      h('div', { class: 'lbl' }, l), h('input', { type: 'file', accept: 'image/*' }));
    box.querySelector('input').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const blob = await shrink(f);
        const r = await api('/api/me/photo/' + slot, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        const j = await r.json(); DATA.photos[slot] = j.ts; cache(); say('Foto gespeichert ✓'); render();
      } catch (err) { say('Foto-Upload fehlgeschlagen', true); }
    });
    g.append(box);
  }
  return g;
}
function shrink(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const m = max, k = Math.min(1, m / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => b ? res(b) : rej(), 'image/jpeg', .85);
    };
    img.onerror = rej; img.src = u;
  });
}

// ---------- Challenge-Material ----------
let CONTENT_CACHE = null;
async function loadContent() { try { const r = await api('/api/content'); if (r.ok) CONTENT_CACHE = await r.json(); } catch (e) { } return CONTENT_CACHE || []; }
const contentUrl = (p) => '/content/' + p.split('/').map(encodeURIComponent).join('/') + '?token=' + SESSION.token;
function mdToHtml(src) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.t}>` + list.items.map(i => `<li>${inline(i)}</li>`).join('') + `</${list.t}>`); list = null; } };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd(); let m;
    if (!l.trim()) { flushP(); flushL(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flushP(); flushL(); out.push('<hr>'); continue; }
    if ((m = l.match(/^\s*[-*+•]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    flushL(); para.push(l.trim());
  }
  flushP(); flushL(); return out.join('\n');
}
function openMd(file) {
  const ov = h('div', { class: 'overlay' }), box = h('div', { class: 'sheet md' }); ov.append(box);
  box.append(h('div', { class: 'dayhead' }, h('b', null, file.title), h('button', { class: 'btn sm', onclick: () => ov.remove() }, 'Schließen')), h('div', { class: 'sub' }, 'Lädt …'));
  document.body.append(ov);
  api(contentUrl(file.path).replace(/\?token=.*/, '')).then(r => r.text()).then(t => { const body = h('div', { class: 'mdbody' }); if (file.type === 'txt') { body.style.whiteSpace = 'pre-wrap'; body.textContent = t; } else body.innerHTML = mdToHtml(t); box.lastChild.replaceWith(body); }).catch(() => { box.lastChild.textContent = 'Konnte Datei nicht laden.'; });
}
function itemRow(it) {
  const row = h('div', { class: 'frow' }, h('div', { class: 'ftitle' }, it.title));
  const btns = h('div', { class: 'fbtns' });
  for (const f of it.files) {
    if (f.role === 'transcript') continue;
    if (f.type === 'md' || f.type === 'txt') btns.append(h('button', { class: 'btn sm', onclick: () => openMd({ ...f, title: it.title }) }, '📄 Lesen'));
    else if (f.type === 'pdf') btns.append(h('a', { class: 'btn sm', href: contentUrl(f.path), target: '_blank', style: 'text-decoration:none' }, '📕 PDF'));
  }
  if (btns.children.length) row.append(btns);
  for (const f of it.files) {
    if (f.type === 'audio') row.append(h('audio', { controls: true, preload: 'none', src: contentUrl(f.path), style: 'width:100%;margin-top:8px' }));
    else if (f.type === 'video') row.append(h('video', { controls: true, preload: 'none', playsinline: true, src: contentUrl(f.path), style: 'width:100%;margin-top:8px;border-radius:10px' }));
    else if (f.type === 'image') row.append(h('img', { src: contentUrl(f.path), style: 'width:100%;margin-top:8px;border-radius:10px' }));
  }
  for (const f of it.files) if (f.role === 'transcript') {
    const body = h('div', { class: 'mdbody', style: 'padding-top:8px' }, 'Lädt …'); let loaded = false;
    const det = h('details', { class: 'transcript' }, h('summary', null, '📝 Transkript'), body);
    det.addEventListener('toggle', () => {
      if (!det.open || loaded) return; loaded = true;
      api(contentUrl(f.path).replace(/\?token=.*/, '')).then(r => r.text()).then(t => { body.innerHTML = mdToHtml(t.replace(/^# .*\n+/, '')); }).catch(() => { loaded = false; body.textContent = 'Konnte Transkript nicht laden.'; });
    });
    row.append(det);
  }
  return row;
}
function lockedWeek(g) {
  const when = DATA.meta.startDate ? ` (${fmtDate(dateOfDay(g.unlockDay))})` : '';
  return h('div', { class: 'acc-item locked' }, h('div', { class: 'locked-row' }, h('span', null, '🔒 ' + g.title), h('span', { class: 'meta' }, `ab Tag ${g.unlockDay}${when} · ${g.count} Beiträge`)));
}
function materialSection(host, curWeek) {
  loadContent().then(groups => {
    if (!groups.length) { host.replaceChildren(h('div', { class: 'hint' }, 'Noch kein Material im Ordner „content/“ auf dem Server.')); return; }
    host.replaceChildren(...groups.map(g => g.locked ? lockedWeek(g) : h('details', { class: 'acc-item', open: g.week != null && g.week === curWeek }, h('summary', null, g.title + (g.week != null && g.week === curWeek ? ' · aktuelle Woche' : '')), h('div', { class: 'body' }, g.items.map(itemRow)))));
  });
}

// ---------- WISSEN ----------
function vWissen() {
  $app.append(h('h1', null, 'Wissen'), h('div', { class: 'sub' }, 'Alle Kapitel aus dem Workbook zum Nachlesen.'));
  const tg = (DATA.meta.targets || DEFAULT_TARGETS);
  const t0 = todayIndex(); const matHost = h('div'); $app.append(h('h2', null, 'Challenge-Material'), matHost); materialSection(matHost, t0 >= 1 ? Math.ceil(t0 / 7) : null);
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Die 7 Kernelemente – jeden Tag im Check'),
    h('ul', { style: 'margin:0;padding-left:20px' }, KERN.map(k => h('li', null, k))),
    h('p', { class: 'hint' }, 'Schaffst du diese Dinge an 6 von 7 Tagen, kommst du Woche für Woche voran.')));
  $app.append(h('h2', null, 'Kapitel'));
  for (const ch of C.chapters) {
    $app.append(h('details', { class: 'acc-item' }, h('summary', null, ch.title),
      h('div', { class: 'body' }, ch.paras.map(p => h('p', null, p)))));
  }
  $app.append(h('h2', null, 'Denk- & Schreibaufgaben'), h('div', { class: 'sub' }, 'Das mentale Fundament – schriftlich beantworten, die Texte werden gespeichert.'));
  for (const [k, title, prompt] of TASKS) {
    const rec = DATA.tasks[k] = DATA.tasks[k] || { text: '' };
    $app.append(h('details', { class: 'acc-item' }, h('summary', null, title + (rec.text ? ' ✓' : '')),
      h('div', { class: 'body' }, h('p', { class: 'sub' }, prompt),
        h('textarea', { style: 'min-height:200px', oninput: e => { rec.text = e.target.value; save('tasks', k); } }, rec.text))));
  }
  void tg;
}

// ---------- START / EINSTELLUNGEN ----------
function vStart() {
  const meta = DATA.meta; const first = !meta.startDate;
  meta.status = meta.status || { m: {} }; meta.status.m = meta.status.m || {};
  meta.targets = meta.targets || { ...DEFAULT_TARGETS };
  const touch = () => save('meta', 'meta');
  $app.append(h('h1', null, first ? 'Willkommen!' : 'Start & Einstellungen'),
    h('div', { class: 'sub' }, first ? 'Deine Zeit ist hier und jetzt. Lege den Starttag fest und los geht’s.' : 'Status quo, Ziele und Backup.'));

  const dateIn = h('input', { type: 'date', value: meta.startDate || iso(new Date()) });
  if (!first) {
    $app.append(h('div', { class: 'card' }, h('h3', null, 'Challenge'),
      h('div', { class: 'field' }, h('label', null, 'Name'), input({ value: meta.name, placeholder: `Challenge ${(DATA.archive || []).length + 1}`, onInput: v => { meta.name = v; touch(); } })),
      h('div', { class: 'hint' }, `Läuft seit ${fmtDate(parseISO(meta.startDate))} (Tag ${Math.max(1, todayIndex())}).`),
      h('button', { class: 'btn', onclick: newChallengeDialog }, '↻ Neue Challenge starten'),
      (DATA.archive || []).length ? h('div', { style: 'margin-top:12px' }, h('h3', null, 'Frühere Challenges'), (DATA.archive).slice().reverse().map(a => h('button', { class: 'item', style: 'display:flex;width:100%;justify-content:space-between;align-items:center;padding:12px;margin:0 0 6px;background:var(--card2);border:0;border-radius:12px;color:var(--text);font:inherit', onclick: () => go('archive', a.id) }, h('span', null, h('b', null, a.name), h('div', { class: 'meta' }, `ab ${fmtDate(parseISO(a.startDate))}`)), h('span', { class: 'meta' }, '›')))) : null));
  }
  if (first) $app.append(calcCard(meta, touch));
  $app.append(h('div', { class: 'card' }, h('h3', null, 'Challenge'),
    h('div', { class: 'field' }, h('label', null, 'Starttag (Tag 1)'), dateIn),
    first ? h('button', { class: 'btn acc', onclick: () => { meta.startDate = dateIn.value || iso(new Date()); touch(); curDay = null; go('today'); } }, 'Challenge starten') : null));
  if (!first) $app.append(h('div', { class: 'card' }, h('h3', null, 'Coaching-Material'),
    h('label', { class: 'chk', style: 'display:flex;gap:10px;align-items:center' }, h('input', { type: 'checkbox', checked: !!meta.unlockAll, onchange: (e) => { meta.unlockAll = e.target.checked || undefined; touch(); CONTENT_CACHE = null; say(meta.unlockAll ? 'Alle Wochen freigeschaltet' : 'Wochen folgen wieder dem Fortschritt'); } }), 'Alle Coaching-Wochen sofort freischalten'),
    h('div', { class: 'hint' }, 'Standard: Woche N öffnet sich an Tag 7·(N−1)+1 deiner Challenge. Mit dem Schalter kannst du alles vorab ansehen oder nachholen.')));
  if (!first) dateIn.addEventListener('change', () => { if (dateIn.value) { meta.startDate = dateIn.value; touch(); say('Startdatum geändert'); } });

  $app.append(h('div', { class: 'card' }, h('h3', null, 'Tagesziele (Standard-Soll) & Flexibilität'),
    h('div', { class: 'row' }, METRICS.map(([f, label, unit, im]) => h('div', { class: 'field' }, h('label', null, `${label}${unit ? ' (' + unit + ')' : ''}`),
      input({ value: meta.targets[f], inputmode: im, onInput: v => { meta.targets[f] = v; touch(); } })))),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('div', { class: 'field' }, h('label', null, 'Event-Kalorien (Standard)'), input({ value: meta.eventKcal, inputmode: 'numeric', placeholder: 'Ziel + 800', onInput: v => { meta.eventKcal = v; touch(); } })),
      h('div', { class: 'field' }, h('label', null, 'Wochenziel (Tage im Soll)'), input({ value: meta.weekGoal, inputmode: 'numeric', placeholder: '5', onInput: v => { meta.weekGoal = v; touch(); } })),
      h('div', { class: 'field' }, h('label', null, 'Tag im Soll ab (%)'), input({ value: meta.okPct, inputmode: 'numeric', placeholder: '80', onInput: v => { meta.okPct = v; touch(); } }))),
    h('div', { class: 'hint' }, 'Tipp: Kalorien & Makros kannst du unten im Rechner „Kalorien & Makros berechnen“ ermitteln und direkt übernehmen.')));

  const st = meta.status;
  $app.append(h('h2', null, 'Dein Status quo'),
    h('div', { class: 'card' }, h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', null, 'Aktuelles Gewicht (kg)'), (() => { const i = input({ value: st.weight, inputmode: 'decimal', onInput: v => { st.weight = v; touch(); const o = document.getElementById('calc-weight'); if (o) { o.value = v; o.dispatchEvent(new Event('input')); } } }); i.id = 'st-weight'; return i; })()),
      h('div', { class: 'field' }, h('label', null, 'Körperfettanteil (%)'), input({ value: st.bf, inputmode: 'decimal', onInput: v => { st.bf = v; touch(); } }))),
      h('h3', { style: 'margin-top:12px' }, 'Umfänge (cm)'),
      h('div', { class: 'row' }, MEASURES.map(([mk, ml]) => h('div', { class: 'field' }, h('label', null, ml), input({ value: st.m[mk], inputmode: 'decimal', onInput: v => { st.m[mk] = v; touch(); } }))))),
    first ? null : calcCard(meta, touch),
    h('div', { class: 'card' }, h('h3', null, 'Deine Vorher-Bilder'), h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'Die Person, die du nie wieder sein wirst!'), photoGrid('before')));

  $app.append(h('h2', null, 'Apple Health / Kurzbefehle'), importCard());
  $app.append(h('h2', null, 'KI-Anbindung'), aiCard());
  $app.append(h('h2', null, 'Profil'), h('div', { class: 'card' },
    h('div', { class: 'dayhead' }, h('b', null, DATA.user ? DATA.user.name : ''), h('button', { class: 'btn sm', onclick: async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) { } logout(); } }, 'Profil wechseln')),
    h('label', { style: 'display:flex;gap:10px;align-items:center;margin-top:12px;text-transform:none;letter-spacing:0;font-size:15px;color:var(--text)' },
      h('input', { type: 'checkbox', style: 'width:22px;min-height:22px', checked: !!meta.shareWeight, onchange: (e) => { meta.shareWeight = e.target.checked; touch(); lastSum = ''; } }), 'Gewichtsveränderung für die Familie sichtbar'),
    h('button', { class: 'btn sm', style: 'margin-top:12px', onclick: async () => {
      const p = prompt('Neue PIN (4–8 Ziffern, leer = PIN entfernen):'); if (p == null) return;
      const r = await jput('/api/me/pin', { pin: p || undefined }); say(r.ok ? 'PIN gespeichert ✓' : 'PIN ungültig', !r.ok);
    } }, 'PIN ändern')),
  h('h2', null, 'Backup'), h('div', { class: 'card' },
    h('div', { class: 'hint' }, 'Alle Daten liegen auf deinem Server (Docker-Volume). Hier kannst du zusätzlich eine Sicherung laden oder einspielen.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: '/api/me/export?token=' + SESSION.token, style: 'text-align:center;text-decoration:none' }, 'Export (JSON)'),
      h('label', { class: 'btn', style: 'text-align:center;margin:0;color:var(--text);text-transform:none;letter-spacing:0;font-size:16px' }, 'Import …', h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const j = JSON.parse(await f.text()); const r = await jput('/api/me/import', j, 'POST'); if (!r.ok) throw 0; await load(); say('Import ✓'); curDay = null; go('today'); } catch (err) { alert('Import fehlgeschlagen'); }
      } })))));
  $app.append(h('p', { class: 'hint', style: 'text-align:center;margin-top:20px' }, 'Inhalte: „Challenge Workbook“ von Sjard Roscher, © FFA GmbH. Nur zur persönlichen Nutzung.'));
}

// ---------- KI-Mahlzeiten ----------
function applyMeal(day, m, sign) {
  for (const f of ['kcal', 'protein', 'fat', 'carbs']) {
    const cur = num(day[f]); const v = (Number.isFinite(cur) ? cur : 0) + sign * (m[f] || 0);
    day[f] = String(Math.max(0, Math.round(v * 10) / 10)).replace('.', ',');
  }
}
function mealDialog(day, n) {
  let imgData = null;
  const ov = h('div', { class: 'overlay' }); const box = h('div', { class: 'sheet' }); ov.append(box);
  const close = () => ov.remove();
  const body = h('div'); 
  const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const prev = h('div', { class: 'sub', style: 'margin:8px 0' }, 'Noch kein Foto (optional – Text allein geht auch).');
  const txt = h('textarea', { style: 'min-height:70px', placeholder: 'Optional: Beschreibung/Mengen, z. B. „200 g Reis, 150 g Hähnchen, 1 EL Öl“' });
  const go = h('button', { class: 'btn acc', style: 'width:100%;margin-top:10px' }, 'Analysieren');
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const b = await shrink(f, 1024); imgData = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); prev.replaceChildren(h('img', { src: imgData, style: 'width:100%;max-height:240px;object-fit:cover;border-radius:12px' })); } catch (e) { alert('Bild konnte nicht gelesen werden'); } };
  const result = h('div');
  go.onclick = async () => {
    if (!imgData && !txt.value.trim()) return alert('Bitte Foto oder Beschreibung angeben.');
    go.disabled = true; go.textContent = 'KI analysiert …'; result.replaceChildren();
    try {
      const r = await jput('/api/me/meal/analyze', { image: imgData, text: txt.value }, 'POST'); const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Fehler');
      showResult(j);
    } catch (e) { result.replaceChildren(h('div', { class: 'card', style: 'border-color:var(--bad)' }, e.message)); }
    go.disabled = false; go.textContent = 'Erneut analysieren';
  };
  function showResult(j) {
    const items = j.items; const nm = h('input', { value: items.map(i => i.name).join(', ').slice(0, 80) });
    const rows = items.map(it => h('div', { class: 'itemrow' }, h('div', { class: 'sub' }, `${it.name}${it.grams ? ' · ' + fmt(it.grams, 0) + ' g' : ''}`),
      h('div', { class: 'row4' }, ...[['kcal', 'kcal'], ['protein', 'P'], ['fat', 'F'], ['carbs', 'KH']].map(([f, l]) => h('div', null, h('label', null, l), input({ value: it[f], inputmode: 'decimal', onInput: v => { it[f] = num(v) || 0; sum(); } }))))));
    const tot = h('div', { class: 'chips' });
    const sum = () => { const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 }; for (const it of items) for (const f in t) t[f] += it[f] || 0; sum.t = t; tot.replaceChildren(h('span', { class: 'chip ok' }, `Σ ${fmt(t.kcal, 0)} kcal`), h('span', { class: 'chip' }, `P ${fmt(t.protein, 0)} g`), h('span', { class: 'chip' }, `F ${fmt(t.fat, 0)} g`), h('span', { class: 'chip' }, `KH ${fmt(t.carbs, 0)} g`)); };
    sum();
    result.replaceChildren(h('h3', { style: 'margin-top:14px' }, 'Ergebnis' + (j.confidence ? ` · Sicherheit: ${j.confidence}` : '')), ...rows, tot, j.notes ? h('div', { class: 'hint' }, j.notes) : null,
      h('div', { class: 'field', style: 'margin-top:8px' }, h('label', null, 'Name der Mahlzeit'), nm),
      h('button', { class: 'btn acc', style: 'width:100%', onclick: () => { const m = { name: nm.value || 'Mahlzeit', ...sum.t, time: new Date().toTimeString().slice(0, 5) }; day.meals.push(m); applyMeal(day, m, 1); save('days', n); close(); render(); } }, 'Zum Tag hinzufügen'),
      h('div', { class: 'hint' }, 'KI-Schätzungen sind ungenau (oft ±20–30 %). Werte bitte prüfen und anpassen.'));
  }
  box.append(h('div', { class: 'dayhead' }, h('h2', { style: 'margin:0' }, 'Mahlzeit erfassen'), h('button', { class: 'btn sm', onclick: close }, 'Schließen')),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: () => { file.removeAttribute('capture'); file.click(); } }, '🖼 Galerie'), h('button', { class: 'btn', onclick: () => { file.setAttribute('capture', 'environment'); file.click(); } }, '📷 Kamera')),
    file, prev, txt, go, result);
  document.body.append(ov);
}

const AI_PRESETS = {
  anthropic: { label: 'Claude (Anthropic)', provider: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  openai: { label: 'OpenAI (ChatGPT)', provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
  gemini: { label: 'Google Gemini', provider: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  xai: { label: 'xAI (Grok)', provider: 'openai', baseUrl: 'https://api.x.ai/v1' },
  deepseek: { label: 'DeepSeek (nur Text)', provider: 'openai', baseUrl: 'https://api.deepseek.com' },
  openrouter: { label: 'OpenRouter (viele Modelle)', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  ollama: { label: 'Ollama lokal', provider: 'openai', baseUrl: 'http://host.docker.internal:11434/v1' },
  custom: { label: 'Eigene (OpenAI-kompatibel)', provider: 'openai', baseUrl: '' },
};
function aiCard() {
  const card = h('div', { class: 'card' }, h('div', { class: 'sub' }, 'Lädt …')); 
  (async () => {
    let cfg; try { cfg = await (await api('/api/ai/config')).json(); } catch (e) { card.replaceChildren('Nicht erreichbar'); return; }
    const key0 = Object.keys(AI_PRESETS).find(k => AI_PRESETS[k].baseUrl === cfg.baseUrl) || 'custom';
    const sel = h('select', null, Object.entries(AI_PRESETS).map(([k, p]) => h('option', { value: k, selected: k === key0 }, p.label)));
    const url = input({ value: cfg.baseUrl, onInput: () => { } }), mod = input({ value: cfg.model, placeholder: 'Modellname', onInput: () => { } }), key = h('input', { type: 'password', placeholder: cfg.hasKey ? '•••••••• (gespeichert – leer lassen zum Behalten)' : 'API-Key', autocomplete: 'off' });
    mod.setAttribute('list', 'ai-models'); const dl = h('datalist', { id: 'ai-models' });
    let provider = AI_PRESETS[key0].provider;
    sel.onchange = () => { const p = AI_PRESETS[sel.value]; provider = p.provider; url.value = p.baseUrl; mod.value = ''; dl.replaceChildren(); };
    const msg = h('div', { class: 'hint' });
    const persist = async () => { const r = await jput('/api/ai/config', { provider, baseUrl: url.value.trim(), model: mod.value.trim(), apiKey: key.value }); const j = await r.json(); if (!r.ok) throw new Error(j.error); key.value = ''; key.placeholder = '•••••••• (gespeichert – leer lassen zum Behalten)'; return j; };
    card.replaceChildren(
      h('div', { class: 'hint' }, 'Für die Foto-Kalorien. Gilt für die ganze Familie; der Key bleibt auf dem Server. Foto-Analyse braucht ein Modell mit Bildverständnis.'),
      h('div', { class: 'field' }, h('label', null, 'Anbieter'), sel), h('div', { class: 'field' }, h('label', null, 'API-URL'), url),
      h('div', { class: 'field' }, h('label', null, 'API-Key'), key), h('div', { class: 'field' }, h('label', null, 'Modell'), mod, dl),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => { msg.textContent = 'Lade Modelle …'; try { await persist(); const r = await api('/api/ai/models'); const j = await r.json(); if (!r.ok) throw new Error(j.error); dl.replaceChildren(...j.map(m => h('option', { value: m }))); msg.textContent = `${j.length} Modelle geladen – tippe ins Feld „Modell“.`; } catch (e) { msg.textContent = 'Fehler: ' + e.message; } } }, 'Modelle laden'),
        h('button', { class: 'btn acc', onclick: async () => { try { await persist(); msg.textContent = 'Gespeichert ✓'; } catch (e) { msg.textContent = 'Fehler: ' + e.message; } } }, 'Speichern')), msg);
  })();
  return card;
}

function importCard() {
  const card = h('div', { class: 'card' }, h('div', { class: 'sub' }, 'Lädt …'));
  (async () => {
    let key; try { key = (await (await api('/api/me/apikey')).json()).key; } catch (e) { card.replaceChildren('Nicht erreichbar'); return; }
    const url = location.origin + '/api/ingest';
    const ro = (val) => { const i = h('input', { value: val, readonly: true }); i.onfocus = () => i.select(); return i; };
    const example = `curl -X POST ${url} \\\n  -H 'X-Api-Key: ${key}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"weight":"82.4","steps":10025,"sleepHours":7.5}'`;
    card.replaceChildren(
      h('div', { class: 'hint' }, 'Mit einem iOS-Kurzbefehl (Automation) schickst du Gewicht, Schritte und Schlaf aus Apple Health automatisch an die App. Der Key gehört nur zu deinem Profil.'),
      h('div', { class: 'field' }, h('label', null, 'URL'), ro(url)), h('div', { class: 'field' }, h('label', null, 'API-Key'), ro(key)),
      h('details', { class: 'acc-item', style: 'margin-top:10px' }, h('summary', null, 'Anleitung: Kurzbefehl einrichten'), h('div', { class: 'body' },
        h('p', null, h('b', null, '1. Neuer Kurzbefehl'), ' in der App „Kurzbefehle“ → Plus.'),
        h('p', null, h('b', null, '2. Gewicht:'), ' Aktion „Health-Daten suchen“ (Typ: Körpergewicht, Sortieren: Startdatum, neueste zuerst, Limit: 1). Danach „Details der Health-Daten abrufen“ → Wert.'),
        h('p', null, h('b', null, '3. Schritte:'), ' „Health-Daten suchen“ (Typ: Schritte, Startdatum ist heute), danach „Statistik berechnen“ → Summe.'),
        h('p', null, h('b', null, '4. Schlaf (optional):'), ' „Health-Daten suchen“ (Typ: Schlaf, Startdatum ist heute, Wert = Schlafdauer), Dauer-Summe in Minuten bilden → Feld sleepMinutes.'),
        h('p', null, h('b', null, '5. Senden:'), ' Aktion „Inhalte von URL abrufen“ → URL oben, Methode POST, Kopfzeile ', h('code', null, 'X-Api-Key'), ' = dein Key, Anfragetext JSON mit den Feldern ', h('code', null, 'weight'), ', ', h('code', null, 'steps'), ', ', h('code', null, 'sleepMinutes'), ' (jeweils die Variablen aus Schritt 2–4).'),
        h('p', null, h('b', null, '6. Automation:'), ' Tab „Automation“ → Persönliche Automation → Tageszeit (z. B. 22:00) → Kurzbefehl wählen → „Sofort ausführen“.'),
        h('p', { class: 'sub' }, 'Weitere Felder: water (Liter) oder waterMl, kcal, protein, fat, carbs und date (JJJJ-MM-TT, Standard: heute). Werte wie „82,4 kg“ werden toleriert. Neuere Werte überschreiben die des Tages. Das iPhone muss die Adresse erreichen können (WLAN daheim bzw. VPN).'),
        h('div', { class: 'field' }, h('label', null, 'Test per Terminal'), h('textarea', { readonly: true, style: 'min-height:120px;font-family:monospace;font-size:12px' }, example)))),
      h('button', { class: 'btn sm danger', style: 'margin-top:10px', onclick: async () => { if (!confirm('Neuen Key erzeugen? Der alte Kurzbefehl funktioniert dann nicht mehr.')) return; await api('/api/me/apikey', { method: 'POST' }); render(); } }, 'Key erneuern'));
  })();
  return card;
}

function newChallengeDialog() {
  const ov = h('div', { class: 'overlay' }), box = h('div', { class: 'sheet' }); ov.append(box);
  const nm = h('input', { value: `Challenge ${(DATA.archive || []).length + 2}` }), dt = h('input', { type: 'date', value: iso(new Date()) });
  box.append(h('div', { class: 'dayhead' }, h('h2', { style: 'margin:0' }, 'Neue Challenge'), h('button', { class: 'btn sm', onclick: () => ov.remove() }, 'Abbrechen')),
    h('p', { class: 'hint' }, 'Die aktuelle Challenge wird archiviert (bleibt lesbar, mit Verlauf, Checks und Fotos). Tagesziele, Einstellungen, Denk-Aufgaben und Familie bleiben erhalten. Letztes Gewicht und letzte Umfänge werden als neuer Status quo vorgeschlagen.'),
    h('div', { class: 'field' }, h('label', null, 'Name'), nm), h('div', { class: 'field' }, h('label', null, 'Startdatum (Tag 1)'), dt),
    h('button', { class: 'btn acc', style: 'width:100%', onclick: async () => {
      try { await flush(); const r = await jput('/api/me/challenge/new', { name: nm.value, startDate: dt.value }, 'POST'); const j = await r.json(); if (!r.ok) throw new Error(j.error);
        DATA = { meta: {}, days: {}, checks: {}, tasks: {}, photos: {}, cheers: [], archive: [], rev: 0, ...j }; cache(); lastSum = ''; ov.remove(); curDay = null; say('Neue Challenge gestartet ✓'); go('start'); } catch (e) { alert('Fehler: ' + e.message); }
    } }, 'Challenge starten'));
  document.body.append(ov);
}
function vArchive(id) {
  const a = (DATA.archive || []).find(x => x.id === id); if (!a) return go('start');
  $app.append(h('button', { class: 'back', onclick: () => go('start') }, '‹ Zurück'), h('h1', null, a.name), h('div', { class: 'sub' }, `Start ${fmtDate(parseISO(a.startDate))} · archiviert ${new Date(a.endedAt).toLocaleDateString('de-DE')}`));
  const saved = DATA; let stats, ch;
  DATA = { ...saved, meta: a.meta, days: a.days, checks: a.checks, photos: a.photos };
  try {
    const lg = loggedDays(); const sc = lg.map(dayScore).filter(x => x != null);
    const avg = sc.length ? Math.round(sc.reduce((x, y) => x + y) / sc.length * 100) : null;
    const wts = lg.map(weightOf).filter(Number.isFinite); const w0 = startWeight(); const wl = wts.length ? wts[wts.length - 1] : NaN;
    stats = h('div', { class: 'stats' }, stat(lg.length + '', 'Tage geloggt'), stat(avg == null ? '–' : avg + '%', 'Ø Erfüllung'), stat(fmt(Object.values(a.days).filter(d => d.done === true).length, 0), 'Trainings'),
      stat(Number.isFinite(w0) ? fmt(w0) : '–', 'Start kg'), stat(Number.isFinite(wl) ? fmt(wl) : '–', 'Ende kg'), stat(Number.isFinite(wl - w0) ? sgn(wl - w0) : '–', 'Veränderung'));
    ch = chart(lg);
  } finally { DATA = saved; }
  $app.append(h('div', { class: 'card' }, stats), h('h2', null, 'Gewichtsverlauf'), h('div', { class: 'card' }, ch));
  const shots = ['before', 'after'].filter(k => ['front', 'back', 'side'].some(s => a.photos[`${k}-${s}`]));
  for (const k of shots) {
    const g = h('div', { class: 'photos' });
    for (const [s, l] of [['front', 'vorn'], ['back', 'hinten'], ['side', 'seitlich']]) { const ts = a.photos[`${k}-${s}`]; g.append(h('div', { class: 'photo' }, ts ? h('img', { src: `/photos/archive/${a.id}/${k}-${s}.jpg?t=${ts}&token=${SESSION.token}` }) : h('span', null, '–'), h('div', { class: 'lbl' }, l))); }
    $app.append(h('h2', null, k === 'before' ? 'Vorher' : 'Nachher'), h('div', { class: 'card' }, g));
  }
  const fz = Object.entries(a.checks).filter(([, c]) => c && c.fazit);
  for (const [k, c] of fz.filter(([k]) => k === 'final')) $app.append(h('h2', null, 'Fazit'), h('div', { class: 'card' }, c.fazit));
}

// ---------- LOGIN / PROFILE ----------
const COLORS = ['#ff6a2b', '#2f9cf4', '#34c759', '#bf5af2', '#ff375f', '#ffcc00'];
async function vLogin() {
  $app.append(h('h1', null, '90-Tage-Challenge'), h('div', { class: 'sub' }, 'Wer trainiert heute?'));
  const box = h('div', { class: 'list', style: 'margin-top:14px' }); $app.append(box);
  let users = [];
  try { users = await (await fetch('/api/users')).json(); } catch (e) { box.append(h('div', { class: 'sub' }, 'Server nicht erreichbar.')); }
  const enter = async (r) => {
    const j = await r.json(); if (!r.ok) return alert(j.error || 'Fehler');
    SESSION = { id: j.user.id, token: j.token }; LS.set('c90-session', JSON.stringify(SESSION)); lastSum = '';
    loadLocal(); curDay = null; view = 'today'; ready = false; render(); await load(); ready = true; view = 'today'; render();
  };
  for (const u of users) {
    box.append(h('button', { class: 'item', onclick: async () => {
      let pin = ''; if (u.hasPin) { pin = prompt(`PIN für ${u.name}:`); if (pin == null) return; }
      enter(await jput('/api/login', { id: u.id, pin }, 'POST'));
    } }, h('span', { style: 'display:flex;align-items:center;gap:12px' }, h('span', { class: 'avatar', style: `background:${u.color}` }, u.name[0].toUpperCase()), h('b', null, u.name)), h('span', { class: 'meta' }, u.hasPin ? '🔒' : '')));
  }
  let color = COLORS[users.length % COLORS.length];
  const nm = h('input', { placeholder: 'Name', maxlength: 30 }), pn = h('input', { placeholder: 'PIN (optional, 4–8 Ziffern)', inputmode: 'numeric', type: 'password', maxlength: 8 });
  const sw = h('div', { class: 'swatches' }, COLORS.map(c => h('button', { type: 'button', class: c === color ? 'on' : '', style: `background:${c}`, onclick: (e) => { color = c; sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target)); } })));
  $app.append(h('h2', null, users.length ? 'Neues Profil' : 'Erstes Profil anlegen'),
    h('div', { class: 'card' }, h('div', { class: 'field' }, h('label', null, 'Name'), nm), h('div', { class: 'field' }, h('label', null, 'Farbe'), sw), h('div', { class: 'field' }, h('label', null, 'PIN-Schutz'), pn),
      h('button', { class: 'btn acc', onclick: async () => { if (!nm.value.trim()) return nm.focus(); enter(await jput('/api/users', { name: nm.value, color, pin: pn.value || undefined }, 'POST')); } }, 'Profil anlegen')),
    h('p', { class: 'hint' }, 'Jedes Familienmitglied hat eigene Daten, Fotos und Ziele. Ohne PIN kann jeder im Netzwerk das Profil öffnen.'));
}

// ---------- FAMILIE ----------
async function vFamily() {
  $app.append(h('h1', null, 'Familie'), h('div', { class: 'sub' }, 'Gemeinsam dranbleiben – jeder sieht nur Fortschritt, keine Details.'));
  const box = h('div', null); $app.append(box);
  let fam = [];
  try { fam = await (await api('/api/family')).json(); } catch (e) { if (e.message !== 'auth') box.append(h('div', { class: 'sub' }, 'Server nicht erreichbar.')); return; }
  if (view !== 'family') return;
  for (const f of fam) {
    const s = f.summary;
    const card = h('div', { class: 'card' },
      h('div', { class: 'dayhead' }, h('span', { style: 'display:flex;align-items:center;gap:12px' }, h('span', { class: 'avatar', style: `background:${f.color}` }, f.name[0].toUpperCase()),
        h('div', null, h('b', null, f.name + (f.me ? ' (du)' : '')), h('div', { class: 'sub' }, s ? `Tag ${s.day}${s.day <= 90 ? ' von 90' : ''}${s.todayDone ? ' · heute geloggt ✓' : ''}` : f.startDate ? 'Noch keine Daten' : 'Noch nicht gestartet'))),
        f.me ? null : h('span', { style: 'display:flex;gap:4px' }, ['👏', '🔥', '💪'].map(em => h('button', { class: 'btn sm', onclick: async (e) => { e.target.disabled = true; await jput('/api/family/cheer', { to: f.id, emoji: em }, 'POST'); say(`${em} an ${f.name} gesendet`); } }, em)))));
    if (s) card.append(h('div', { class: 'stats', style: 'margin-top:10px' }, stat(s.streak + '', 'Serie'), stat(s.avg7 == null ? '–' : s.avg7 + '%', 'Ø 7 Tage'), stat(`${s.trainWeek}`, 'Training Woche'),
      stat(`${s.logged}`, 'Tage geloggt'), stat(`${s.trainTotal}`, 'Trainings ges.'), stat(s.dWeight != null ? sgn(s.dWeight) + ' kg' : '🔒', 'Gewicht')));
    box.append(card);
  }
  if (fam.length < 2) box.append(h('p', { class: 'hint' }, 'Lege über „Start → Profil wechseln“ weitere Profile an, dann erscheinen sie hier.'));
}

// ---------- Start ----------
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !SESSION || Object.keys(pending).length) return;
  const rev = DATA.rev; await load();
  const ae = document.activeElement; const typing = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName);
  if (DATA.rev !== rev && !typing && view !== 'login') render();
});
(async () => { render(); if (SESSION) { await load(); } ready = true; render(); pushSummary(); })();
