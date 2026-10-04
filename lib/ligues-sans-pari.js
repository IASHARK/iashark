"use strict";
// CHAMPIONNATS SANS PARI (03/10/2026, etape 0 du plan moteur). Colombie
// (Primera A, 239), Perou (Liga 1, 281) et Afrique du Sud (Premier Soccer
// League, 288) n'ont aucune cote collectable chez nous (aucune cle The Odds API,
// seulement le repli Pinnacle d'api-football) : AUCUN pari n'est publie pour eux.
// Les matchs restent affiches comme une fiche d'information (equipes, date,
// stade, classement, forme, H2H, cotes brutes), exactement comme un match ferme
// par la garde coup d'envoi (lib/kickoff-guard.js#closeMatchForPick), avec leur
// propre raison.
//
// Liste : drapeau "sansPari": true dans config/leagues.json (une seule source).
//
// Ce que la regle ne fait PAS : retirer un pari deja publie avant ce drapeau.
// Le gel (lib/pick-freeze.js) le garde jusqu'au coup d'envoi et il reste dans le
// bilan (regles 3 et « ne jamais retirer un match publie d'un bilan » de
// CLAUDE.md) ; un retrait serait une decision du proprietaire, tracee dans
// config/results-exclusions.json.

const { closeMatchForPick } = require("./kickoff-guard.js");

// Raison publiee dans no_signal_reason (data.json, ligne premium). Volontairement
// differente de KICKOFF_* / FIXTURE_NOT_UPCOMING : le site affiche le match en
// « aucun signal » (home-list.js), pas en « match ferme ».
const RAISON = "LEAGUE_WITHOUT_COLLECTABLE_ODDS";
// Libelle affiche : la phrase standard du site, deja traduite dans toutes les
// langues (index.html, home-list.js), plutot qu'une phrase francaise seule.
const LIBELLE = "Aucun signal clair sur ce match";

// -> ids api-football des championnats marques "sansPari": true.
function idsSansPari(config) {
  const ligues = Array.isArray(config) ? config : (config && Array.isArray(config.leagues) ? config.leagues : []);
  return ligues
    .filter(function (l) { return l && l.sansPari === true && Number.isFinite(Number(l.apiFootballId)); })
    .map(function (l) { return Number(l.apiFootballId); });
}

function estSansPari(leagueId, ids) {
  if (leagueId === null || leagueId === undefined || leagueId === "") return false;
  const n = Number(leagueId);
  return Number.isFinite(n) && (ids || []).indexOf(n) !== -1;
}

// Championnat d'un match du pipeline : league_id du match, sinon celui de sa
// fixture api-football (fixturesById : { "<id>": element api-football }).
function ligueDuMatch(match, fixturesById) {
  if (match && match.league_id != null && match.league_id !== "") return Number(match.league_id);
  const fx = match && match.id != null && fixturesById ? fixturesById[String(match.id)] : null;
  return fx && fx.league && fx.league.id != null ? Number(fx.league.id) : null;
}

// Ferme un match au pari : champs premium retires (pari, cote, probabilites,
// textes d'analyse...), lignes premium videes, raison et libelle de ce module.
// premiumRows : une ligne, une liste de lignes du meme match, ou null.
// Mutation en place ; renvoie le match.
function fermerSansPari(match, premiumRows, premiumFields) {
  if (!match || typeof match !== "object") return match;
  const lignes = Array.isArray(premiumRows) ? premiumRows : (premiumRows ? [premiumRows] : []);
  closeMatchForPick(match, null, premiumFields, RAISON);
  lignes.forEach(function (r) { closeMatchForPick({}, r, [], RAISON); });
  match.no_signal_label = LIBELLE;
  return match;
}

// Candidats de la selection canonique (lib/run-output : SAFE_PICK, combines) :
// retire ceux d'un championnat sans pari. Championnat lu sur le candidat
// (league_id) ou sur sa fixture api-football ; inconnu = garde (les autres
// filtres du pipeline, comme filterOpenCandidates, s'en chargent).
function sansCandidatsSansPari(candidates, fixturesById, ids) {
  return (candidates || []).filter(function (c) {
    const id = c && c.fixture_id != null ? c.fixture_id : c && c.fixture && c.fixture.fixture_id;
    const fx = id != null && fixturesById ? fixturesById[String(id)] : null;
    const ligue = c && c.league_id != null ? c.league_id : fx && fx.league ? fx.league.id : null;
    return !estSansPari(ligue, ids);
  });
}

module.exports = { RAISON, LIBELLE, idsSansPari, estSansPari, ligueDuMatch, fermerSansPari, sansCandidatsSansPari };
