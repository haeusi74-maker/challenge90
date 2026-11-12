'use strict';
// Unit-Tests fuer die reinen Hilfsfunktionen aus server/server.js.
// DATA_DIR/CONTENT_DIR zeigen auf Temp-Verzeichnisse, bevor das Modul geladen wird.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c90-unit-'));
process.env.CONTENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c90-unit-content-'));
const { parseNum, fmtDE, dayIndex, prettify, groupKey, normKey, weekOfDir, extractJson } = require('../server/server');

test('parseNum liest Zahl mit Einheit', () => {
  assert.equal(parseNum('82.4 kg'), 82.4);
  assert.equal(parseNum('7,5 h'), 7.5);
});

test('parseNum behandelt Tausenderpunkt und -komma als Tausendertrenner', () => {
  assert.equal(parseNum('10,025'), 10025);
  assert.equal(parseNum('10.025'), 10025);
  assert.equal(parseNum('1.234.567'), 1234567);
});

test('parseNum gibt Zahlen unveraendert zurueck und NaN fuer null/Text', () => {
  assert.equal(parseNum(42), 42);
  assert.ok(Number.isNaN(parseNum(null)));
  assert.ok(Number.isNaN(parseNum(undefined)));
  assert.ok(Number.isNaN(parseNum('abc')));
});

test('fmtDE formatiert mit Komma und rundet auf die Nachkommastellen', () => {
  assert.equal(fmtDE(82.449, 1), '82,4');
  assert.equal(fmtDE(82.45, 2), '82,45');
  assert.equal(fmtDE(7, 1), '7');
});

test('dayIndex zaehlt den Starttag als Tag 1', () => {
  assert.equal(dayIndex('2026-01-01', '2026-01-01'), 1);
  assert.equal(dayIndex('2026-01-01', '2026-01-03'), 3);
  assert.equal(dayIndex('2026-01-01', '2026-04-01'), 91);
});

test('dayIndex ist negativ/null vor dem Start und stabil ueber die Zeitumstellung', () => {
  assert.equal(dayIndex('2026-01-05', '2026-01-04'), 0);
  assert.equal(dayIndex('2026-03-28', '2026-03-30'), 3);
});

test('prettify entfernt Nummer, AUDIO-Praefix und Endung', () => {
  assert.equal(prettify('03.09_Ballaststoffe.mp3'), 'Ballaststoffe');
  assert.equal(prettify('AUDIO_Teil_1___Einleitung.mp3'), 'Teil 1 – Einleitung');
  assert.equal(prettify('05-AUDIO_-_Wie_es_geht.m4a'), 'Wie es geht');
});

test('groupKey gruppiert nummerierte Dateien und normalisiert Nummern', () => {
  assert.equal(groupKey('03.09_X.mp3'), groupKey('3.9_Y.pdf'));
  assert.equal(groupKey('03.09_X.mp3'), 'n3.9');
});

test('groupKey nutzt den normalisierten Titel fuer unnummerierte Dateien', () => {
  assert.equal(groupKey('Ballaststoffe.pdf'), 't' + normKey('Ballaststoffe.pdf'));
  assert.equal(groupKey('Ballaststoffe.pdf'), 'tballaststoffe');
});

test('weekOfDir erkennt Wochenordner in mehreren Schreibweisen', () => {
  assert.equal(weekOfDir('woche-1'), 1);
  assert.equal(weekOfDir('Woche_03'), 3);
  assert.equal(weekOfDir('coaching woche 12'), 12);
  assert.equal(weekOfDir('woche-0'), 0);
  assert.equal(weekOfDir('vorab'), null);
});

test('extractJson zieht JSON aus Text und Codeblock', () => {
  assert.deepEqual(extractJson('Hier: ```json\n{"a":1}\n``` fertig'), { a: 1 });
});

test('extractJson wirft bei fehlendem JSON', () => {
  assert.throws(() => extractJson('kein json'), /kein JSON/);
});
