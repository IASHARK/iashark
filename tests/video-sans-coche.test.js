"use strict";
// Contre-controle de l'avocat du diable (30/09/2026) : la video « le plus probable »
// (DailySafe) et le combine (DailyCombo) partent AVANT les matchs. Une coche verte
// sur chaque pari y serait lue comme un ticket deja gagnant (meme promesse implicite
// que « GAGNER » ou « SAFE ») : aucune coche, aucun vert « gagne » dans ces videos.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("video du ticket du jour : aucune coche verte avant le match", () => {
  const src = read("remotion-score-template/src/DailyTicket.tsx");
  const code = src.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /<Check\b|const Check\b/, "composant coche retire");
  assert.doesNotMatch(code, /#1fc95b|#22c55e|#16a34a|rgba?\(\s*31\s*,\s*201\s*,\s*91/i, "aucun vert « gagne »");
  assert.doesNotMatch(code, /[✓✔✅]/);
  assert.doesNotMatch(code, /d="M14 24\.5l7 7 13-14"/, "trace de la coche");
  // Les deux videos du jour utilisent bien ce composant.
  const compo = read("remotion-score-template/src/Composition.tsx");
  assert.match(compo, /id="DailySafe" component=\{DailyTicket\}/);
  assert.match(compo, /id="DailyCombo" component=\{DailyTicket\}/);
});

test("videos du jour : ni « SAFE », ni « GAGNER », ni « sûr » dans les textes publics", () => {
  const b = read("scripts/videos/build-daily-videos.mjs");
  assert.match(b, /ticketProps\("LE PLUS PROBABLE", safe\)/);
  const chaines = (b.match(/"[^"\n]*"|`[^`\n]*`/g) || []).join("\n");
  // « sur » (preposition) reste permis : seules les formes « sûr », « sûre(s) » sont interdites.
  assert.doesNotMatch(chaines, /\bSAFE\b|GAGNER|sûre?s?|SÛRE?S?/);
});
