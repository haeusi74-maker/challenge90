'use strict';
// Unit-Tests fuer public/calc.js (Kalorien- und Makro-Rechner nach Modul 7 "How to Ernaehrungsplan erstellen").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bmr, calcPlan, validateProfile } = require('../public/calc.js');

const SJARD = { sex: 'm', age: 30, height: 182, weight: 86, af: 1.7, goal: 'deficit' };

test('bmr: Ten-Haaf-Formel entspricht dem Beispiel (Mann, 182 cm, 86 kg, 30 J. = 2073)', () => {
  assert.equal(Math.round(bmr(SJARD)), 2073);
});

test('bmr: Frauen-Konstante weicht um ca. 191 kcal nach unten ab', () => {
  const diff = bmr(SJARD) - bmr({ ...SJARD, sex: 'f' });
  assert.ok(Math.abs(diff - (220.827 - 29.79)) < 1e-9);
});

test('calcPlan: Beispiel Sjard im moderaten Defizit (Doku: 2819 kcal, 196 g P)', () => {
  const p = calcPlan(SJARD);
  assert.equal(p.tdee, 3524);
  assert.equal(p.kcal, 2819);
  assert.equal(p.protein, 196);
  assert.ok(Math.abs(p.fat - 75) <= 1);
  assert.ok(Math.abs(p.carbs - 319) <= 1);
});

test('calcPlan: Faktor je Ziel (aggressiv 0,7 / Erhalt 1,0 / Aufbau +300)', () => {
  assert.equal(calcPlan({ ...SJARD, goal: 'aggressive' }).kcal, 2467);
  assert.equal(calcPlan({ ...SJARD, goal: 'maintain' }).kcal, 3524);
  assert.equal(calcPlan({ ...SJARD, goal: 'build' }).kcal, 3824);
});

test('calcPlan: Fett faellt nie unter Koerpergroesse/3', () => {
  const p = calcPlan({ sex: 'f', age: 40, height: 180, weight: 60, af: 1.4, goal: 'aggressive' });
  assert.ok(p.fat >= 60);
});

test('calcPlan: Protein orientiert sich bei Uebergewicht am Idealgewicht (Groesse-100)', () => {
  const p = calcPlan({ ...SJARD, weight: 130, goal: 'deficit' });
  assert.equal(p.protein, Math.floor(82 * 2.4));
});

test('calcPlan: Makro-Kalorien summieren sich auf das Kalorienziel (Rundung +-10)', () => {
  const p = calcPlan(SJARD);
  assert.ok(Math.abs(p.protein * 4.1 + p.fat * 9.3 + p.carbs * 4.1 - p.kcal) <= 10);
});

test('calcPlan: Kohlenhydrate werden nie negativ', () => {
  const p = calcPlan({ sex: 'f', age: 60, height: 200, weight: 50, af: 1.2, goal: 'aggressive' });
  assert.ok(p.carbs >= 0);
});

test('validateProfile: meldet fehlende und unplausible Angaben', () => {
  assert.equal(validateProfile(SJARD), null);
  assert.match(validateProfile({ ...SJARD, height: '' }), /Größe/);
  assert.match(validateProfile({ ...SJARD, weight: 5 }), /Gewicht/);
  assert.match(validateProfile({ ...SJARD, age: 3 }), /Alter/);
  assert.match(validateProfile({ ...SJARD, sex: '' }), /Geschlecht/);
  assert.match(validateProfile({ ...SJARD, goal: 'x' }), /Ziel/);
});
