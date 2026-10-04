"use strict";
// MOTS INTERDITS dans tout ce que le serveur produit pour les tickets, la Selection en or, le
// buteur du jour et le panneau Marches (regles-tickets.md §8, test 20 ; L121-4 7° et 15°) :
// ni « sûr », ni « garanti », ni « gagnant », ni gain, mise, unite, capital, esperance ;
// jamais bet365 ni Pinnacle. Les textes visibles (copie du ticket, libelles) sont faits par la
// page dans la langue du visiteur ; ici, les donnees qu'elle recoit.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const T = require("../lib/tickets-du-jour.js");
const P = require("../lib/marches-panneau.js");
const LIGUES = require("../config/leagues.json");

// « sur » sans accent est la preposition : seul « sûr » (accentue) est interdit.
const INTERDITS = /sûr|garanti|gagnant|\bgains?\b|\bmises?\b|unit[ée]|capital|esp[ée]rance|bet365|pinnacle|value|valeur|kelly/i;
const NOW = Date.parse("2026-10-04T06:00:00Z");

function match(id, o) {
  return Object.assign({
    id: id, home: { n: "Dom" + id }, away: { n: "Ext" + id }, date: "2026-10-04 18:00", league: "Ligue 1", league_key: "ligue1", league_id: 61,
    pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, cote_rec: (1.4 + (id % 4) * 0.08).toFixed(2),
    cote_source: "anj", cote_bookmaker: ["Betclic", "NetBet", "PMU", "Unibet", "Winamax"][id % 5], chance_iashark: 55 + id,
    pronostic: { market_id: "home-win", publie: true, fiabilite: "vérifiée", libelle_fr: "Victoire Dom" + id },
    v3_buteurs: id === 1 ? [{ joueur_id: 3, joueur: "Z", cote: "away", p_marque: 0.33 }] : undefined,
    v3_marches: [{ cle: "TOTAL:plus2.5", market_id: "over-25", libelle_fr: "Plus de 2,5 buts", probabilite: 55, fiabilite_marche: "vérifié sur le passé", etiquette: "vérifié sur le passé" }],
  }, o || {});
}

test("20. aucune donnee produite pour les tickets ni pour le panneau ne porte un mot interdit", async () => {
  const ms = []; for (let i = 1; i <= 10; i++) ms.push(match(i));
  const fixtureById = {}; ms.forEach((m) => { fixtureById[String(m.id)] = { fixture: { timestamp: Date.parse("2026-10-04T16:00:00Z") / 1000, status: { short: "NS" } } }; });
  const c = T.calculerDuJour(ms, { jour: "2026-10-04", nowMs: NOW, fixtureById, configLigues: LIGUES });
  const C = await import(pathToFileURL(path.join(__dirname, "..", "supabase/functions/_shared/tickets-contrat.mjs")).href);
  const lignes = ["x5", "x10", "or", "buteur"].filter((t) => c[t]).map((t) => ({ type: t, meta: c[t].meta, contenu: c[t].contenu, etats: {}, publie_a: "2026-10-04T06:00:01Z" }));
  assert.equal(lignes.length, 4);
  for (const niveau of ["anonyme", "gratuit", "pro"]) {
    assert.doesNotMatch(JSON.stringify(C.construireReponse({ jour: "2026-10-04", niveau, lignes, calcul: null })), INTERDITS, niveau);
  }
  assert.doesNotMatch(JSON.stringify(c), INTERDITS);
  const panneau = P.construirePanneau(ms[0], { verdicts: { marches_panneau: { statut: "GO" } } });
  assert.doesNotMatch(JSON.stringify(panneau), INTERDITS);
  assert.doesNotMatch(JSON.stringify(require("../config/tickets.json")).replace(/jamais Pinnacle ni bet365/g, ""), INTERDITS);
});
