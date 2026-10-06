"use strict";
// CONTROLES DU 04/10/2026 (tour 1 des corrections) sur les jambes des tickets et de la
// Selection en or :
//  - trader de cotes, point 1 (ROUGE) : un pari publie lors d'un calcul precedent est FIGE ;
//    poserPronostics le reecrivait sans « publie », et il n'entrait jamais dans les tickets.
//    Chemin complet du calcul quotidien : gel -> poserPronostics(figes) -> publierPronostics(figes)
//    -> jambesDuJour ;
//  - mathematicien, point 3 : plus/moins 1,5, plus/moins 3,5 et « les deux marquent » restent
//    hors des tickets tant qu'ils ne sont pas mesures (config/verdicts-maths.json#categories_no_go).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PRONOSTIC = require("../lib/pronostic.js");
const J = require("../lib/run-output/jambes-du-jour.js");
const LIGUES = require("../config/leagues.json");
const VERDICTS = require("../config/verdicts-maths.json");

const NOW = Date.parse("2026-10-04T06:00:00Z"); // 08:00 a Paris
function fixtureById(ms) {
  const o = {};
  ms.forEach((m) => { const [d, h] = m.date.split(" "); o[String(m.id)] = { fixture: { timestamp: Math.floor(Date.parse(d + "T" + h + ":00+02:00") / 1000), status: { short: "NS" } } }; });
  return o;
}
// Match du jour J tel que le gel le rend : pari publie la veille (pick_frozen_at), cote agreee
// Winamax 1,55, chance affichee 62 %, pronostic publie « vérifiée » (champ premium restaure).
function fige(id, o) {
  return Object.assign({
    id, home: { n: "Dom" + id }, away: { n: "Ext" + id }, date: "2026-10-04 18:00", league: "Ligue 1", league_key: "ligue1", league_id: 61,
    pari_rec: "Victoire Domicile", market_id: "home-win", marche: "1X2", no_signal: false,
    cote_rec: "1.55", cote_source: "anj", cote_bookmaker: "Winamax", chance_iashark: 62, model_probability: 62,
    pick_frozen_at: "2026-10-03T21:10:00.000Z",
    pronostic: { market_id: "home-win", marche: "1X2", libelle_fr: "Victoire Dom" + id, chance: 62, cote: 1.55, voie: "selection", moteur: "cotes_marche",
      fiabilite: "vérifiée", selection: true, source: "cotes du marché, marge retirée", publie: true, cote_source: "anj", bookmaker: "Winamax", hors_fourchette: false },
  }, o || {});
}
const opts = (ms) => ({ nowMs: NOW, fixtureById: fixtureById(ms), configLigues: LIGUES, categoriesNoGo: VERDICTS.categories_no_go, competitions: VERDICTS.competitions_jambes });

test("pari fige deja publie : il reste publie apres poserPronostics(figes) et publierPronostics(figes), et entre dans les tickets", () => {
  const ms = [fige(1), fige(2, { cote_rec: "1.62", chance_iashark: 58, pronostic: Object.assign({}, fige(2).pronostic, { chance: 58, cote: 1.62 }) })];
  const figes = { 1: true, 2: true };
  const avant = JSON.stringify(ms[0].pronostic);
  const r1 = PRONOSTIC.poserPronostics(ms, { configLigues: LIGUES, figes });
  assert.equal(r1.figes, 2);
  assert.equal(JSON.stringify(ms[0].pronostic), avant, "le pronostic publie n'est pas reecrit");
  assert.equal(ms[0].pronostic.publie, true);
  assert.equal(ms[0].pronostic_dispo, true);
  assert.equal(ms[0].selection_iashark, true);
  const r2 = PRONOSTIC.publierPronostics(ms, [], { configLigues: LIGUES, figes });
  assert.equal(r2.figes, 2, "publierPronostics ne touche pas aux paris figes");
  const j = J.jambesDuJour(ms, opts(ms));
  assert.deepEqual(j.jambes.map((x) => x.fixture_id), [1, 2]);
  assert.deepEqual(j.exclus, {});
  assert.equal(j.jambes[0].cote, 1.55); assert.equal(j.jambes[0].chance, 62); assert.equal(j.jambes[0].operateur, "Winamax");
});

test("sans la liste des paris figes (ancien appel), le pari perd « publie » : c'est le defaut corrige", () => {
  const ms = [fige(1)];
  PRONOSTIC.poserPronostics(ms, { configLigues: LIGUES });
  assert.notEqual(ms[0].pronostic.publie, true);
  assert.deepEqual(J.jambesDuJour(ms, opts(ms)).jambes, []);
  // Le calcul quotidien passe bien la liste des paris figes.
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
  assert.match(wf, /PRONOSTIC\.poserPronostics\(allMatchsData,\{configLigues:LEAGUES_CONFIG,chancesV3Par:CHANCES_V3_PRONO,figes:GEL_FIGES\}\)/);
  assert.ok(wf.indexOf("var GEL_FIGES={}") < wf.indexOf("PRONOSTIC.poserPronostics(allMatchsData"), "GEL_FIGES est rempli avant");
});

test("un pari fige d'un autre marche que le pari affiche, ou jamais publie, n'est pas garde tel quel", () => {
  const autre = fige(1, { market_id: "away-win" });
  PRONOSTIC.poserPronostics([autre], { configLigues: LIGUES, figes: { 1: true } });
  assert.notEqual(autre.pronostic.publie, true, "marche different : recalcule (et donc jamais une jambe)");
  const jamais = fige(2, { pronostic: Object.assign({}, fige(2).pronostic, { publie: undefined }) });
  PRONOSTIC.poserPronostics([jamais], { configLigues: LIGUES, figes: { 2: true } });
  assert.notEqual(jamais.pronostic.publie, true);
});

test("familles plus/moins 1,5 et 3,5, les deux marquent : exclues le 04/10, ouvertes le 06/10 (demande de Clement), en attente du mathematicien", () => {
  // 06/10/2026 : plus aucune famille exclue d'office (seule reste la double chance d'Argentine) ; le mathematicien
  // remet une famille dans categories_no_go si sa mesure echoue (config/verdicts-maths.json#_readme).
  const fam = VERDICTS.categories_no_go.filter((c) => c.famille && !c.ligue).map((c) => c.famille).sort();
  assert.deepEqual(fam, []);
  assert.match(JSON.stringify(VERDICTS._readme), /EN ATTENTE DU MATHEMATICIEN/);
  const ms = [["home-win", 1], ["over-15", 2], ["under-15", 3], ["over-35", 4], ["under-35", 5], ["btts-yes", 6], ["btts-no", 7], ["over-25", 8], ["dc-1x", 9]].map(([mk, id]) =>
    fige(id, { market_id: mk, pronostic: Object.assign({}, fige(id).pronostic, { market_id: mk }) }));
  const r = J.jambesDuJour(ms, opts(ms));
  assert.deepEqual(r.jambes.map((x) => x.fixture_id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Une famille remise NO-GO par le mathematicien sort aussitot.
  const noGo = J.jambesDuJour(ms, Object.assign(opts(ms), { categoriesNoGo: [{ famille: "BTTS" }] }));
  assert.deepEqual(noGo.jambes.map((x) => x.fixture_id), [1, 2, 3, 4, 5, 8, 9]);
});
