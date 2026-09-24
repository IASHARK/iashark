"use strict";

// FEUILLE DE MATCH DE REPLI (24/09/2026).
//
// api-football ne publie pas de feuille joueurs (/fixtures/players) pour la
// plupart des matchs amicaux de selections. Sans feuille, le calcul du buteur
// (lib/insights.js#scorerModel) ne voyait ni les titularisations ni les buts
// de ces matchs : Montenegro - Chypre du 25/09/2026 mettait en avant
// Krstovic (2 buts sur ses 10 derniers matchs) alors qu'Osmajic en avait
// marque 7 sur les 7 derniers, dont 4 en amical.
//
// Ce module reconstruit une feuille MINIMALE a partir de deux sources reelles
// du meme match : la composition (/fixtures/lineups : titulaires, remplacants,
// poste) et les evenements (/fixtures/events : buts, passes decisives,
// changements, cartons rouges). Seul ce que ces sources disent est rempli :
// titulaire, minutes jouees, buts, passes decisives, cartons. Les tirs, la
// note et les passes restent null (jamais 0) : le calcul du buteur ne compte
// alors ce match que pour les buts et les minutes, pas pour les tirs.
//
// Changements api-football : player = joueur qui SORT, assist = joueur qui
// ENTRE (verifie le 24/09/2026 sur Slovaquie - Montenegro du 05/06/2026 :
// Osmajic, buteur a la 44e et a la 66e, sort a la 85e).

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DUREE_MATCH = 90;

// Minute d'un evenement : temps reglementaire, arret de jeu plafonne a 90.
function minute(e) {
  const m = num(e && e.time && e.time.elapsed);
  return m === null ? null : Math.max(0, Math.min(DUREE_MATCH, m));
}

// lineups : reponse brute de /fixtures/lineups (tableau par equipe).
// events : reponse brute de /fixtures/events. Rend un bloc au format
// /fixtures/players ({ team, players: [{ player, statistics: [...] }] }),
// ou null si la composition de l'equipe est absente.
function feuilleDepuisCompoEtEvenements(lineups, events, teamId) {
  const compo = (Array.isArray(lineups) ? lineups : []).find((t) => t && t.team && t.team.id === teamId);
  if (!compo || !Array.isArray(compo.startXI) || !compo.startXI.length) return null;
  const evts = (Array.isArray(events) ? events : []).filter((e) => e && e.team && e.team.id === teamId);

  const joueurs = {};
  function ajoute(entree, titulaire) {
    const p = entree && entree.player;
    if (!p || num(p.id) === null) return;
    joueurs[p.id] = {
      id: p.id, name: p.name || null, pos: p.pos || null, titulaire: titulaire,
      entree: titulaire ? 0 : null, sortie: null, buts: 0, passes: 0, jaunes: 0, rouges: 0,
    };
  }
  compo.startXI.forEach((x) => ajoute(x, true));
  (compo.substitutes || []).forEach((x) => ajoute(x, false));

  evts.forEach((e) => {
    const m = minute(e);
    const joueur = e.player && joueurs[e.player.id];
    const second = e.assist && joueurs[e.assist.id];
    const type = String(e.type || "").toLowerCase();
    const detail = String(e.detail || "");
    if (type === "subst") {
      if (joueur && m !== null && joueur.sortie === null) joueur.sortie = m;
      if (second && m !== null && second.entree === null) second.entree = m;
    } else if (type === "goal") {
      if (detail === "Missed Penalty" || detail === "Own Goal") return;
      if (joueur) joueur.buts += 1;
      if (second) second.passes += 1;
    } else if (type === "card") {
      if (!joueur) return;
      if (detail === "Yellow Card") joueur.jaunes += 1;
      else if (detail === "Red Card" || detail === "Second Yellow card") {
        joueur.rouges += 1;
        if (m !== null && joueur.sortie === null) joueur.sortie = m;
      }
    }
  });

  const players = Object.keys(joueurs).map((k) => {
    const j = joueurs[k];
    const aJoue = j.entree !== null;
    const minutes = aJoue ? Math.max(1, (j.sortie === null ? DUREE_MATCH : j.sortie) - j.entree) : 0;
    return {
      player: { id: j.id, name: j.name, photo: null },
      statistics: [{
        games: { position: j.pos, minutes: aJoue ? minutes : null, rating: null, substitute: !j.titulaire },
        shots: { total: null, on: null },
        goals: { total: aJoue ? j.buts : null, assists: aJoue ? j.passes : null },
        passes: { total: null, key: null, accuracy: null },
        tackles: { total: null, interceptions: null },
        duels: { total: null }, dribbles: { attempts: null }, fouls: { committed: null },
        cards: { yellow: j.jaunes, red: j.rouges },
      }],
    };
  });
  return { team: { id: teamId }, players: players, source: "compo+evenements" };
}

module.exports = { feuilleDepuisCompoEtEvenements };
