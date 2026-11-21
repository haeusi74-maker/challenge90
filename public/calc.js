/* Kalorien- und Makro-Rechner nach Modul 7 „How to Ernährungsplan erstellen“ (Schritte 1–3).
   Reine Funktionen ohne DOM – läuft im Browser (window.CALC) und in Node (Tests). */
(function (root) {
  'use strict';

  const KCAL_PER_G = { protein: 4.1, carbs: 4.1, fat: 9.3 };
  const FAT_SHARE = 0.25;       // 25 % der Kalorien (Doku: 25–35 %)
  const BUILD_SURPLUS = 300;    // Doku: 250–500 kcal Überschuss

  const GOALS = {
    deficit:    { label: 'Fettverlust / Recomp (moderates Defizit, ×0,8)', factor: 0.8, proteinPerKg: 2.4 },
    aggressive: { label: 'Aggressives Defizit (×0,7)', factor: 0.7, proteinPerKg: 2.4 },
    maintain:   { label: 'Gewicht halten (×1,0)', factor: 1, proteinPerKg: 2.0 },
    build:      { label: 'Muskelaufbau (+300 kcal)', surplus: BUILD_SURPLUS, proteinPerKg: 1.8 },
  };

  const ACTIVITY = [
    [1.2, '1,2 – nur sitzen/liegen'],
    [1.45, '1,4–1,5 – sitzend, <5.000 Schritte'],
    [1.65, '1,6–1,7 – überwiegend sitzend, >5.000 Schritte'],
    [1.85, '1,8–1,9 – stehend/gehend oder Büro + 2–4× Krafttraining'],
    [2.2, '2,0–2,4 – körperlich anstrengend'],
  ];

  const num = v => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')));

  // Ten-Haaf-Formel (Meta-Analyse 2023): Grundumsatz in kcal
  function bmr({ sex, age, height, weight }) {
    const base = 11.936 * num(weight) + 587.728 * (num(height) / 100) - 8.129 * num(age);
    return base + (sex === 'f' ? 29.79 : 220.827);
  }

  function validateProfile(p) {
    if (p.sex !== 'm' && p.sex !== 'f') return 'Bitte Geschlecht wählen.';
    const age = num(p.age), height = num(p.height), weight = num(p.weight), af = num(p.af);
    if (!(age >= 14 && age <= 100)) return 'Bitte ein gültiges Alter (14–100) angeben.';
    if (!(height >= 120 && height <= 230)) return 'Bitte eine gültige Größe in cm (120–230) angeben.';
    if (!(weight >= 30 && weight <= 300)) return 'Bitte ein gültiges Gewicht in kg (30–300) angeben.';
    if (!(af >= 1.2 && af <= 2.4)) return 'Bitte einen Aktivitätsfaktor (1,2–2,4) wählen.';
    if (!GOALS[p.goal]) return 'Bitte ein Ziel wählen.';
    return null;
  }

  function calcPlan(p) {
    const height = num(p.height), weight = num(p.weight);
    const goal = GOALS[p.goal];
    const tdee = Math.round(bmr(p) * num(p.af));
    const kcal = Math.round(goal.factor ? tdee * goal.factor : tdee + goal.surplus);
    // Bei Übergewicht am „Idealgewicht“ (Größe − 100) orientieren, sonst am Ist-Gewicht
    const refWeight = Math.min(weight, height - 100);
    const protein = Math.floor(refWeight * goal.proteinPerKg);
    const fatMin = Math.ceil(height / 3);
    const fatKcal = Math.max(kcal * FAT_SHARE, fatMin * KCAL_PER_G.fat);
    const fat = Math.max(fatMin, Math.floor(fatKcal / KCAL_PER_G.fat));
    const carbs = Math.max(0, Math.floor((kcal - protein * KCAL_PER_G.protein - fatKcal) / KCAL_PER_G.carbs));
    return { bmr: Math.round(bmr(p)), tdee, kcal, protein, fat, carbs, fatMin };
  }

  const api = { bmr, calcPlan, validateProfile, GOALS, ACTIVITY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CALC = api;
})(typeof window !== 'undefined' ? window : globalThis);
