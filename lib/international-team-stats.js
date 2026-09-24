"use strict";
// Statistiques d'une SELECTION NATIONALE a partir de ses derniers matchs reels,
// toutes competitions confondues (amical, qualifications, Coupe du monde,
// Ligue des nations, finales).
//
// Pourquoi (23/09/2026, demande du proprietaire) : l'API ne publie pas de
// "statistiques de saison" utilisables pour une selection. Une edition de la
// Ligue des nations commence a zero match joue, et les statistiques de club des
// joueurs ne disent rien de l'equipe nationale. Resultat : les 16 matchs de
// Ligue des nations des 24 et 25/09 etaient calcules sans aucune forme ni
// statistique d'equipe, et la page affichait « donnees insuffisantes ».
//
// Ce module ne fabrique rien : il compte des buts et des resultats dans des
// matchs reellement joues. Il rend le MEME format que /teams/statistics
// d'api-football, pour que le reste du pipeline (calcCriteres, lambdas,
// qualite des donnees) fonctionne sans traitement special.
//
// Regle : en dessous de MIN_MATCHS matchs joues retrouves, on ne rend rien.
// Mieux vaut pas de statistiques qu'une moyenne sur deux matchs.
const MIN_MATCHS = 5;
const MAX_MATCHS = 10;
// Statuts api-football d'un match reellement termine (score definitif).
const JOUES = ["FT", "AET", "PEN"];

function num(v) {
  // Number(null) vaut 0 : un score absent ne doit pas devenir un 0-0 invente.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Un match utilisable : termine, avec un score, et impliquant l'equipe.
function matchJoue(fx, teamId) {
  if (!fx || !fx.fixture || !fx.teams || !fx.goals) return false;
  const st = (fx.fixture.status && fx.fixture.status.short) || "";
  if (JOUES.indexOf(st) === -1) return false;
  if (num(fx.goals.home) === null || num(fx.goals.away) === null) return false;
  const h = fx.teams.home && fx.teams.home.id, a = fx.teams.away && fx.teams.away.id;
  return h === teamId || a === teamId;
}

// Du plus recent au plus ancien.
function parTimestampDecroissant(a, b) {
  return (num(b.fixture.timestamp) || 0) - (num(a.fixture.timestamp) || 0);
}

// Les N derniers matchs JOUES de la selection, du plus recent au plus ancien,
// toutes competitions confondues (amical, qualifications, Coupe du monde, Euro,
// Ligue des nations). Sert au scenario (buts par tranche de 15 minutes), aux
// buteurs en forme et a l'historique des joueurs : decision du proprietaire du
// 24/09/2026, « les 20 derniers matchs de chaque selection, peu importe la
// competition ».
const MAX_MATCHS_SCENARIO = 20;
function derniersMatchsJoues(fixtures, teamId, max) {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.filter((fx) => matchJoue(fx, teamId)).sort(parTimestampDecroissant).slice(0, max || MAX_MATCHS_SCENARIO);
}

// Statistiques de selection a partir d'une liste de fixtures api-football.
// Rend { fixtures, goals, form, ... } au format /teams/statistics, ou null.
function statsFromRecentFixtures(fixtures, teamId, options) {
  const opts = options || {};
  const max = opts.max || MAX_MATCHS;
  const min = opts.min || MIN_MATCHS;
  if (!Array.isArray(fixtures)) return null;
  const joues = fixtures.filter((fx) => matchJoue(fx, teamId)).sort(parTimestampDecroissant).slice(0, max);
  if (joues.length < min) return null;

  const c = {
    playedHome: 0, playedAway: 0, winsHome: 0, winsAway: 0, drawsHome: 0, drawsAway: 0,
    losesHome: 0, losesAway: 0, forHome: 0, forAway: 0, againstHome: 0, againstAway: 0,
  };
  // form : du plus ancien au plus recent, comme le champ "form" d'api-football
  // (calcCriteres lit les cinq derniers caracteres, le dernier etant le match
  // le plus recent).
  const form = [];
  const competitions = {};
  joues.slice().reverse().forEach((fx) => {
    const dom = fx.teams.home.id === teamId;
    const pour = dom ? num(fx.goals.home) : num(fx.goals.away);
    const contre = dom ? num(fx.goals.away) : num(fx.goals.home);
    if (dom) { c.playedHome += 1; c.forHome += pour; c.againstHome += contre; }
    else { c.playedAway += 1; c.forAway += pour; c.againstAway += contre; }
    if (pour > contre) { form.push("W"); if (dom) c.winsHome += 1; else c.winsAway += 1; }
    else if (pour === contre) { form.push("D"); if (dom) c.drawsHome += 1; else c.drawsAway += 1; }
    else { form.push("L"); if (dom) c.losesHome += 1; else c.losesAway += 1; }
    const nom = (fx.league && fx.league.name) || "Compétition inconnue";
    competitions[nom] = (competitions[nom] || 0) + 1;
  });

  const total = c.playedHome + c.playedAway;
  const moy = (v) => Math.round((v / Math.max(total, 1)) * 100) / 100;
  return {
    fixtures: {
      played: { home: c.playedHome, away: c.playedAway, total: total },
      wins: { home: c.winsHome, away: c.winsAway, total: c.winsHome + c.winsAway },
      draws: { home: c.drawsHome, away: c.drawsAway, total: c.drawsHome + c.drawsAway },
      loses: { home: c.losesHome, away: c.losesAway, total: c.losesHome + c.losesAway },
    },
    goals: {
      for: {
        total: { home: c.forHome, away: c.forAway, total: c.forHome + c.forAway },
        average: { total: String(moy(c.forHome + c.forAway)) },
      },
      against: {
        total: { home: c.againstHome, away: c.againstAway, total: c.againstHome + c.againstAway },
        average: { total: String(moy(c.againstHome + c.againstAway)) },
      },
    },
    form: form.join(""),
    // Tracabilite : d'ou vient ce calcul, et sur quels matchs.
    source: "derniers-matchs-selection",
    matches_used: joues.length,
    competitions: competitions,
    fixtures_used: joues,
  };
}

// Phrase de journal pour le rapport du pipeline (« 10 matchs : 4 amicaux, 6 ... »).
function resumeSource(stats) {
  if (!stats) return "aucune statistique";
  const parts = Object.keys(stats.competitions || {})
    .map((k) => stats.competitions[k] + " " + k)
    .sort();
  return stats.matches_used + " matchs (" + parts.join(", ") + "), forme " + stats.form;
}

module.exports = { statsFromRecentFixtures, derniersMatchsJoues, resumeSource, MIN_MATCHS, MAX_MATCHS, MAX_MATCHS_SCENARIO };
