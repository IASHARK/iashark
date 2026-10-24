"use strict";
// « Le film du match » : buts par quart d'heure sur les derniers matchs des deux
// equipes (page match, bloc « Le film du match », ligne « Tranche la plus
// fournie », FAQ, comparatif).
//
// Pourquoi (controle historique-public du 24/10/2026) : la page affichait
// « Sur 51 buts marques par Arsenal et Everton lors de leurs 20 derniers
// matchs ». Recompte reel : 61 buts, et la tranche la plus fournie etait
// 76-90+ (23 %), pas 31-45+ (26 %). Deux causes :
//  - quand la liste d'evenements d'un match revenait vide (plafond d'appels,
//    erreur passagere), le match etait COMPTE quand meme, avec zero but :
//    des buts disparaissaient en silence ;
//  - un but annule par la VAR pouvait rester dans les evenements (2 buts
//    dans les evenements, 1 au score).
// Regle : un match n'entre dans le compte que si ses evenements sont arrives
// ET si les buts qu'ils contiennent redonnent exactement le score a 90 minutes
// des deux equipes. Sinon il est ecarte (et compte comme tel dans le journal).
// Sous MIN_MATCHS_FILM matchs retenus pour une equipe, la page n'affiche pas
// le film : pas de chiffre public faux.
//
// Contre son camp : api-football range le but contre son camp sous l'equipe
// qui en PROFITE (verifie sur des matchs reels le 24/10/2026, ex. Arsenal 2-1
// Chelsea du 01/03/2026 : « Chelsea, Own Goal, P. Hincapie », joueur
// d'Arsenal, et le score de Chelsea est bien 1). Le champ « team » suffit
// donc : il ne faut surtout pas le retourner.
//
// Ce module ne touche ni aux probabilites ni au choix du pari : il ne sert
// qu'aux chiffres affiches.

const MIN_MATCHS_FILM = 10;

function num(v) {
  // Number(null) vaut 0 : un score absent ne doit pas devenir un 0.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function idEquipe(e) {
  return e && e.team && e.team.id != null ? e.team.id : null;
}

function minute(e) {
  return num(e && e.time && e.time.elapsed);
}

function estBut(e) {
  return !!e && e.type === "Goal" && e.detail !== "Missed Penalty";
}

// Decision VAR qui annule un but (« Goal cancelled », « Goal Disallowed -
// offside », ...). « Penalty cancelled » n'en est pas une : le penalty peut
// n'avoir jamais ete tire.
function estAnnulationBut(e) {
  return !!e && e.type === "Var" && /^goal (cancelled|disallowed)/i.test(String(e.detail || ""));
}

// Les evenements du match, sans les buts annules par la VAR : pour chaque
// annulation, on retire le but de la MEME equipe le plus proche dans le temps
// (au plus 2 minutes d'ecart). Rend une copie, l'original n'est pas modifie.
function sansButsAnnules(events) {
  const liste = Array.isArray(events) ? events.slice() : [];
  const annulations = liste.filter(estAnnulationBut);
  annulations.forEach((v) => {
    const mv = minute(v), eq = idEquipe(v);
    if (mv === null || eq === null) return;
    let meilleur = -1, ecart = Infinity;
    liste.forEach((e, i) => {
      if (!estBut(e) || idEquipe(e) !== eq) return;
      const m = minute(e);
      if (m === null) return;
      const d = Math.abs(m - mv);
      if (d <= 2 && d < ecart) { ecart = d; meilleur = i; }
    });
    if (meilleur !== -1) liste.splice(meilleur, 1);
  });
  return liste;
}

// Score de reference a 90 minutes : score.fulltime, sinon le score final
// (goals) si le match s'est termine sans prolongation.
function score90(fx) {
  const ft = fx && fx.score && fx.score.fulltime;
  if (ft && num(ft.home) !== null && num(ft.away) !== null) return { home: num(ft.home), away: num(ft.away) };
  const st = fx && fx.fixture && fx.fixture.status && fx.fixture.status.short;
  const g = fx && fx.goals;
  if (st === "FT" && g && num(g.home) !== null && num(g.away) !== null) return { home: num(g.home), away: num(g.away) };
  return null;
}

// Controle d'un match : { ok, raison, events }. events = evenements nettoyes
// (buts annules retires), a utiliser pour le compte si ok.
//  raison : null | "sans_evenements" | "sans_score" | "score_different"
function controlerMatch(fx, events) {
  if (!Array.isArray(events) || !events.length) return { ok: false, raison: "sans_evenements", events: null };
  const ref = score90(fx);
  const h = fx && fx.teams && fx.teams.home && fx.teams.home.id;
  const a = fx && fx.teams && fx.teams.away && fx.teams.away.id;
  if (!ref || h == null || a == null) return { ok: false, raison: "sans_score", events: null };
  const propres = sansButsAnnules(events);
  // Buts du temps reglementaire (arrets de jeu compris : minute 90 + extra).
  // Les prolongations (minute > 90) et la seance de tirs au but n'entrent ni
  // dans les tranches ni dans le score a 90 minutes.
  const buts = propres.filter((e) => estBut(e) && minute(e) !== null && minute(e) >= 0 && minute(e) <= 90);
  // Un but sans equipe connue ne peut pas etre range : il fera echouer le controle.
  const nh = buts.filter((e) => idEquipe(e) === h).length;
  const na = buts.filter((e) => idEquipe(e) === a).length;
  const sansEquipe = buts.filter((e) => idEquipe(e) !== h && idEquipe(e) !== a).length;
  if (sansEquipe || nh !== ref.home || na !== ref.away) return { ok: false, raison: "score_different", events: null };
  return { ok: true, raison: null, events: propres };
}

// fixtures[i] <-> eventsArr[i] (meme ordre, comme dans le pipeline).
// Rend { events: [evenements des matchs retenus], fixtures: [...],
//        ecartes: { sans_evenements, sans_score, score_different } }.
function matchsRetenus(fixtures, eventsArr) {
  const fx = Array.isArray(fixtures) ? fixtures : [];
  const ev = Array.isArray(eventsArr) ? eventsArr : [];
  const out = { events: [], fixtures: [], ecartes: { sans_evenements: 0, sans_score: 0, score_different: 0 } };
  for (let i = 0; i < fx.length; i++) {
    const c = controlerMatch(fx[i], ev[i]);
    if (c.ok) { out.events.push(c.events); out.fixtures.push(fx[i]); }
    else out.ecartes[c.raison]++;
  }
  return out;
}

// Ce que couvrent les matchs du film, pour le libelle de la page :
//  - "toutes"      : selection nationale, derniers matchs toutes competitions ;
//  - "championnat" : derniers matchs de ce championnat (le pipeline filtre les
//                    derniers matchs sur la competition du jour) ;
//  - "competition" : coupe ou competition continentale (ex. Ligue des
//                    champions) : derniers matchs dans CETTE competition.
const NON_CHAMPIONNAT = ["cup", "tournoi", "nations", "wcq"];
const CONFEDERATIONS = ["UEFA", "FIFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC"];
function perimetre(o) {
  const opts = o || {};
  if (opts.selection) return "toutes";
  const l = opts.ligue;
  if (!l || typeof l !== "object") return "competition";
  if (NON_CHAMPIONNAT.indexOf(l.kind) !== -1) return "competition";
  if (CONFEDERATIONS.indexOf(l.country) !== -1) return "competition";
  return "championnat";
}

module.exports = {
  MIN_MATCHS_FILM,
  sansButsAnnules,
  score90,
  controlerMatch,
  matchsRetenus,
  perimetre,
};
