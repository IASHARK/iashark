"use strict";
// BILAN D'HIER (lib/bilan-hier.js, etape 2 du plan du 21/10/2026) : pari offert et Selection en or de la veille,
// gagnes et perdus, tires du site seulement ; jamais un chiffre faux, jamais un mauvais jour retire.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const B = require("../lib/bilan-hier.js");

const ROOT = path.join(__dirname, "..");
const JOUR = "2026-10-22";
const registre = { matchs: [
  { jour: "2026-10-21", fixture_id: 9, match: "Veille - Avant", pari: "Over 2.5", cote_affichee: 1.6 },
  { jour: JOUR, fixture_id: 1, match: "Bayern Munich - Arsenal", pari: null, market_id: null, cote_affichee: null, masque: true },
] };
const publies = { 1: { pari: "Over 2.5", cote: "1.62", market: "over-25" }, 2: { pari: "DC 1X", cote: "1.45", market: "dc-1x" },
  3: { pari: "Victoire Domicile", cote: "1.50", market: "home-win" }, 4: { pari: "Under 3.5", cote: "1.44", market: "under-35" } };
const resultats = { matches: [{ id: 1, result: "win" }, { id: 2, result: "win" }, { id: 3, result: "loss" }, { id: 4, result: "void" }] };
const or = (paris) => ({ type: "or", regle_version: "tickets-2026-10-21", contenu: { paris } });
const p = (id, market, cote) => ({ fixture_id: id, domicile: "Dom" + id, exterieur: "Ext" + id, pari: "pari " + id, market_id: market, cote });

test("pari offert : le match du registre, le pari publie (entree encore masquee) et son resultat", () => {
  const b = B.construireBilan({ jour: JOUR, registre, ticketOr: null, resultats, parisPublies: publies, genereLe: "2026-10-23T05:30:00Z" });
  assert.deepEqual(b.offert, { fixture_id: 1, match: "Bayern Munich - Arsenal", pari: "Over 2.5", cote: 1.62, resultat: "gagne" });
  assert.equal(b.selection_or, null);
  assert.deepEqual([b.version, b.jour, b.genere_le], [1, JOUR, "2026-10-23T05:30:00Z"]);
});

test("Selection en or : gagnes sur regles, annules dits a part ; un mauvais jour reste affiche", () => {
  const b = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(2, "dc-1x", 1.45), p(3, "home-win", 1.5), p(4, "under-35", 1.44)]), resultats, parisPublies: publies });
  assert.deepEqual([b.selection_or.gagnes, b.selection_or.regles, b.selection_or.annules, b.selection_or.total], [1, 2, 1, 3]);
  assert.deepEqual(b.selection_or.paris.map((x) => [x.fixture_id, x.match, x.resultat]), [[2, "Dom2 - Ext2", "gagne"], [3, "Dom3 - Ext3", "perdu"], [4, "Dom4 - Ext4", "annule"]]);
  const pire = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(3, "home-win", 1.5)]), resultats, parisPublies: publies });
  assert.deepEqual([pire.selection_or.gagnes, pire.selection_or.regles], [0, 1], "0 sur 1 : affiche aussi");
});

test("jamais « 2 sur 2 » : un pari de la Selection en or absent de results/ (pas regle, retire) = pas de Selection en or", () => {
  const sansLe3 = { matches: [{ id: 2, result: "win" }, { id: 3, result: "win" }] };
  const b = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(2, "dc-1x", 1.45), p(3, "home-win", 1.5), p(4, "under-35", 1.44)]), resultats: sansLe3, parisPublies: publies });
  assert.equal(b.selection_or, null);
});

test("jamais un chiffre faux : autre marche que le pari publie, ou paris publies illisibles ce passage = rien", () => {
  const b = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(2, "dc-1x", 1.45), p(3, "over-25", 1.9)]), resultats, parisPublies: publies });
  assert.equal(b.selection_or, null);
  assert.ok(b.offert, "le pari offert reste");
  const devoile = { matchs: [{ jour: JOUR, fixture_id: 1, match: "Bayern Munich - Arsenal", pari: "Over 2.5", market_id: "over-25", cote_affichee: 1.62 }] };
  assert.equal(B.construireBilan({ jour: JOUR, registre: devoile, resultats, parisPublies: {} }).offert, null, "base illisible : rien");
  assert.equal(B.construireBilan({ jour: JOUR, registre: devoile, resultats, parisPublies: { 1: { pari: "DC 1X", cote: "1.3", market: "dc-1x" } } }).offert, null, "autre marche : rien");
  assert.equal(B.construireBilan({ jour: JOUR, registre: devoile, resultats, parisPublies: publies }).offert.resultat, "gagne");
});

test("deux matchs offerts le meme jour : le pari offert n'est pas montre (jamais deviner lequel)", () => {
  const deux = { matchs: [{ jour: JOUR, fixture_id: 1, match: "A - B" }, { jour: JOUR, fixture_id: 2, match: "C - D" }] };
  assert.equal(B.construireBilan({ jour: JOUR, registre: deux, resultats, parisPublies: publies }).offert, null);
});

test("pas regle : rien ; sans registre ni ticket : fichier vide (remplace celui de la veille)", () => {
  const b = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(2, "dc-1x", 1.45)]), resultats: null, parisPublies: publies });
  assert.deepEqual([b.offert, b.selection_or], [null, null]);
  const vide = B.construireBilan({ jour: "2026-10-30", registre, ticketOr: null, resultats, parisPublies: publies });
  assert.deepEqual([vide.jour, vide.offert, vide.selection_or], ["2026-10-30", null, null]);
  assert.equal(B.construireBilan({ jour: JOUR, registre, resultats, parisPublies: {} }).offert, null, "jamais un pari invente");
});

test("jamais un bilan du jour remplace par un plus pauvre ; un nouveau jour remplace tout", () => {
  const riche = B.construireBilan({ jour: JOUR, registre, ticketOr: or([p(2, "dc-1x", 1.45)]), resultats, parisPublies: publies });
  const pauvre = B.construireBilan({ jour: JOUR, registre, ticketOr: null, resultats, parisPublies: {} });
  const f = B.fusionnerAvecPrecedent(pauvre, riche);
  assert.deepEqual([!!f.offert, !!f.selection_or], [true, true]);
  const demain = B.construireBilan({ jour: "2026-10-23", registre, ticketOr: null, resultats, parisPublies: publies });
  assert.deepEqual([B.fusionnerAvecPrecedent(demain, riche).offert, B.fusionnerAvecPrecedent(demain, riche).selection_or], [null, null]);
});

test("calcul quotidien : bilan ecrit apres les fichiers results/, public dans preuves/, journal sans match ni pari", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /var BILAN_HIER=require\('\.\/lib\/bilan-hier\.js'\);/);
  assert.match(wf, /tickets_du_jour\?select=jour,type,regle_version,contenu&type=eq\.or&jour=eq\.'\+HIER/);
  assert.match(wf, /fs\.writeFileSync\('preuves\/bilan-hier\.json'/);
  assert.match(wf, /BILAN_HIER\.fusionnerAvecPrecedent\(BILAN_HIER\.construireBilan\(/);
  assert.match(wf, /OUTPUTS="preuves /);
  const i = wf.indexOf("BILAN_HIER.construireBilan"), j = wf.indexOf("fs.writeFileSync(RESULTS_DIR+'/index.json'");
  assert.ok(i > j && j > 0, "apres l'ecriture des fichiers results/");
  const log = wf.slice(i, i + 900).match(/console\.log\([^;]*\);/g) || [];
  log.forEach((l) => assert.doesNotMatch(l, /\.match\b|\.pari\b|\.cote\b/, l));
});
