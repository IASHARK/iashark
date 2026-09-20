"use strict";
// LISERÉ VERT / ROUGE SUR L'ONGLET « AUJOURD'HUI » (20/09/2026, demande du
// proprietaire : « tu mets juste un trait vert sur la bordure de gauche pour
// ceux qui sont bons et rouge pour les pas bons, c'est tout »).
//
// Regles verifiees ici :
//   - la ligne du jour ne change en RIEN a part le liseré : elle reste
//     verrouillee pour un visiteur sans abonnement, garde son etoile et sa
//     zone d'analyse (ce n'est pas une ligne de l'onglet « Hier ») ;
//   - un match non termine ou absent du fichier ne prend aucune couleur ;
//   - le fichier du jour n'apporte QUE le verdict : aucun pari, aucune cote,
//     aucun score ne peut arriver par ce chemin ;
//   - le verdict est dit en toutes lettres pour un lecteur d'ecran.
const test = require("node:test");
const assert = require("node:assert/strict");
const HL = require("../home-list.js");

const helpers = () => Object.assign(HL.defaultHelpers(), {
  leagueName: (m) => m.league || m.league_key,
  leagueCountry: () => "", leagueFlag: () => "", leagueLogoUrl: () => null,
  teamLogoUrl: (tm) => (tm && tm.id ? "https://media.api-sports.io/football/teams/" + tm.id + ".png" : null),
  heure: () => "15:00", matchTimestamp: () => Date.parse("2026-09-20T13:00:00Z"),
  matchDay: (m) => String(m.date || "").slice(0, 10), lien: (p) => "/" + p,
});
// Match d'aujourd'hui : marche retenu, deja termine. Vu par un NON-abonne.
const match = (extra) => Object.assign({
  id: 1557411, home: { n: "Fulham", id: 36 }, away: { n: "Manchester United", id: 33 },
  league: "Premier League", league_key: "premier_league", date: "2026-09-20 15:00",
  status: "FT", has_signal: true, prob_band: "good",
}, extra || {});
const ctx = (verdicts) => ({
  isPro: false, hasAccount: false, freeMatchId: null, simulations: 5000,
  favorites: { has: () => false }, favMatches: { has: () => false, list: () => [] },
  collapsed: {}, nowTs: Date.parse("2026-09-20T16:00:00Z"), verdicts: verdicts || null,
});

test("le fichier du jour ne donne que des verdicts établis", () => {
  const lu = HL.verdictsDuFichier({ day: "2026-09-20", matches: [
    { id: 1, result: "win" }, { id: 2, result: "loss" }, { id: 3, result: "pending" },
    { id: 4, result: "void" }, { id: 5 }, { fixture_id: 6, result: "WIN" }, { result: "win" },
  ] });
  assert.deepEqual(lu, { 1: "win", 2: "loss", 6: "win" });
  assert.deepEqual(HL.verdictsDuFichier(null), {});
});

test("liseré vert / rouge sur une ligne d'aujourd'hui, et rien d'autre ne bouge", () => {
  const H = helpers();
  const gagne = HL.renderMatchRow(match(), ctx({ 1557411: "win" }), H, 0);
  assert.match(gagne, /class="hl-row hl-grid is-locked[^"]*hl-win"/);
  // La ligne reste une ligne d'aujourd'hui : verrou Pro, etoile, pas « is-past ».
  assert.doesNotMatch(gagne, /is-past/);
  assert.match(gagne, /hl-lockpill/, "le verrou Pro a disparu");
  assert.match(gagne, /data-hl-mfav="1557411"/, "l'étoile du match a disparu");
  assert.match(gagne, /Recommandation passée\./, "verdict non lisible par un lecteur d'écran");

  const perdu = HL.renderMatchRow(match(), ctx({ 1557411: "loss" }), H, 0);
  assert.match(perdu, /hl-loss"/);
  assert.match(perdu, /Recommandation non passée\./);
});

test("aucune couleur sans verdict établi", () => {
  const H = helpers();
  for (const v of [null, {}, { 1557411: "pending" }, { 1557411: "void" }, { 999: "win" }]) {
    const html = HL.renderMatchRow(match(), ctx(v), H, 0);
    assert.doesNotMatch(html, /hl-win|hl-loss/, "couleur posée sans verdict : " + JSON.stringify(v));
  }
});

test("le verdict du jour n'ouvre aucune donnée payante", () => {
  const H = helpers();
  const html = HL.renderMatchRow(match(), ctx({ 1557411: "win" }), H, 0);
  assert.doesNotMatch(html, /Under 3\.5|1,54|1\.54|2-1/);
  // Meme piege que l'onglet « Hier » : un non-abonne ne doit lire aucun champ payant.
  const piege = new Proxy(match({ conf: 7.7, pari_rec: "SECRET", market_id: "under-35" }), {
    get(cible, cle) {
      if (["conf", "pari_rec", "market_id", "cote_rec", "p1", "po25"].includes(cle)) {
        throw new Error("champ payant lu sur une ligne verrouillée : " + String(cle));
      }
      return cible[cle];
    },
  });
  assert.doesNotThrow(() => HL.renderMatchRow(piege, ctx({ 1557411: "win" }), H, 0));
});
