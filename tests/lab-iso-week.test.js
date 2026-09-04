"use strict";
// Test de contrat ISO 8601 semaine/annee contre des dates de reference
// connues (verifiees independamment) - necessaire pour le bootstrap
// EXP-001 corrige (block = semaine x league-season, exige par la SPEC).

const test = require("node:test");
const assert = require("node:assert/strict");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");

const CASES = [
  ["2023-01-01", 2022, 52], // dimanche -> derniere semaine ISO de l'annee precedente
  ["2023-01-02", 2023, 1],  // lundi -> premiere semaine ISO 2023
  ["2024-01-01", 2024, 1],  // lundi -> premiere semaine ISO 2024
  ["2021-01-01", 2020, 53], // vendredi -> 2020 a 53 semaines ISO
  ["2020-12-31", 2020, 53], // jeudi -> derniere semaine ISO 2020
  ["2024-12-30", 2025, 1],  // lundi -> premiere semaine ISO 2025 (chevauche l'annee civile)
  ["2023-08-11", 2023, 32], // date reelle presente dans le dataset EXP-001 (vendredi)
];

for (const [date, expectedYear, expectedWeek] of CASES) {
  test(`getIsoYearWeek(${date}) = ISO ${expectedYear}-W${expectedWeek}`, () => {
    const { isoYear, isoWeek } = getIsoYearWeek(date + "T12:00:00.000Z");
    assert.equal(isoYear, expectedYear, `annee ISO pour ${date}`);
    assert.equal(isoWeek, expectedWeek, `semaine ISO pour ${date}`);
  });
}

test("getIsoYearWeek: deterministe (meme date -> meme resultat a chaque appel)", () => {
  const a = getIsoYearWeek("2023-08-11T00:00:00.000Z");
  const b = getIsoYearWeek("2023-08-11T00:00:00.000Z");
  assert.deepEqual(a, b);
});

test("getIsoYearWeek: deux dates de la meme semaine ISO (lun-dim) donnent le meme resultat", () => {
  // 2023-08-14 (lundi) a 2023-08-20 (dimanche) = meme semaine ISO
  const mon = getIsoYearWeek("2023-08-14T00:00:00.000Z");
  const sun = getIsoYearWeek("2023-08-20T00:00:00.000Z");
  assert.deepEqual(mon, sun);
});
