"use strict";
// RESULTATS PUBLIES (onglet « Hier », docs/SPEC_RESULTATS_HIER.md, 20/09/2026).
//
// Module PUR : aucune E/S, aucun reseau, aucune dependance npm. Il prend des
// donnees deja lues par l'appelant (predictions d'historique.json, lignes
// predictions_archive, objets fixture de l'API, lignes match_results deja
// reglees) et rend :
//   - le reglement d'un pari publie (delegue a lib/resolvers.js, jamais une
//     regle de marche reecrite ici) ;
//   - le contenu exact de results/<YYYY-MM-DD>.json et de results/index.json ;
//   - un RAPPORT de diagnostic (jamais publie) qui dit, pari par pari, POURQUOI
//     un pari n'est pas regle.
//
// REGLES NON NEGOCIABLES APPLIQUEES ICI (§ de la specification)
//
// 1. Jamais avant la fin du match (§2). Le SEUL declencheur d'un verdict est le
//    statut final renvoye par l'API (FT/AET/PEN) ou un statut d'annulation
//    (PST/CANC/ABD). Aucune heure estimee, aucun « le match a du se terminer ».
//    Tant que ce statut n'est pas connu, la ligne publiee ne porte NI pari, NI
//    cote, NI source de cote, NI score : seulement les equipes, la competition
//    et le coup d'envoi, qui sont deja publics (historique.json, accueil).
//    -> aucune donnee premium d'un match non termine ne sort d'ici.
//
// 2. Jamais de donnee inventee (§5). Un pari qu'on ne sait pas regler reste
//    `pending`, jamais « gagne » ni « perdu » par defaut :
//      - fixture absente de la reponse API -> pending ;
//      - statut non final -> pending ;
//      - marche non resolvable (resolveMarketWin -> null : ligne quart de
//        handicap, statistiques de tirs absentes...) -> pending ;
//      - pari masque non relu depuis predictions_archive -> pending.
//    Chacune de ces raisons est journalisee telle quelle dans le rapport.
//
// 3. Tout est publie, y compris les pertes (§1). Aucune selection : un pari
//    regle entre dans le fichier, gagnant ou perdant. La seule exclusion est un
//    match sans marche retenu (no_signal), qui n'a jamais ete un pari.
//
// 4. Source des cotes affichee telle qu'elle est (§6). `odds_source` vaut
//    "pinnacle" UNIQUEMENT quand la donnee dit que la cote vient de Pinnacle
//    (has_pinnacle / pinnacle_snapshot / market_source). Sinon "moyenne".
//    Jamais devine, jamais « pinnacle par defaut ».
//
// 5. Le resultat juge le pari PUBLIE (§4, lib/pick-freeze.js) : le libelle
//    vient de la prediction enregistree (historique.json / predictions_archive),
//    jamais d'un recalcul du moteur apres coup.
//
// POINT D'ATTENTION POUR LE RASSEMBLEMENT (session principale) : le contrat
// impose la cle `market_id` sur chaque ligne publiee. `market_id` figure dans
// lib/premium-fields.js#PREMIUM_FIELDS, et une ligne de results/<date>.json a
// la forme d'un match aux yeux de deepPremiumLeaks (id + home + away) :
// tests/premium-leak-real-files.test.js signalera donc results/*.json dans
// dist/ comme une fuite. Ce n'en est pas une (le match est termine, §2), mais
// le controle doit l'apprendre - par exemple en ignorant le prefixe
// dist/results/ dans ce test, ou en n'appliquant premiumLeaks qu'aux objets
// sans champ `result`. Correction hors lot R1 : ni lib/premium-fields.js ni ce
// test ne sont modifies ici.
//
// SCORE PUBLIE : c'est le score REGLEMENTAIRE 90 minutes
// (lib/resolvers.js#extractRegulationScore), le meme que celui qui rend le
// verdict. Pour un match alle en prolongation, afficher le score final
// (prolongation comprise) a cote d'un verdict calcule sur 90 minutes
// donnerait a lire une incoherence ("2-2 / Under 3.5 gagne" devient "3-2 /
// Under 3.5 gagne"). Aucun marche publie par IASHARK n'est un marche
// "apres prolongation".

const { resolveMarketWin, classifyFixtureStatus } = require("./resolvers.js");
const LEAGUE_NAMES = require("./league-names.js");

// Raisons de non-reglement. Journal interne (GitHub Actions) uniquement :
// elles ne sont jamais ecrites dans un fichier public.
const RAISON = {
  FIXTURE_ABSENTE: "fixture introuvable",
  STATUT_NON_FINAL: "statut non final",
  MARCHE_NON_RESOLVABLE: "marche non resolvable",
  PARI_NON_RELU: "pari non relu depuis l'archive",
  SCORE_ABSENT: "score reglementaire absent",
};

// Verdicts possibles d'une ligne publiee.
const RESULTATS = ["win", "loss", "void", "pending"];
// Resultats d'historique.json/predictions_archive qui signifient « pas encore regle ».
const EN_ATTENTE = ["scheduled", "pending"];
// Part maximale de paris non regles toleree sur une journee passee avant
// ::warning (§ « journaliser la cause »).
const SEUIL_ALERTE_NON_REGLES = 0.10;

// ---------------------------------------------------------------------------
// Petits utilitaires (aucune dependance)
// ---------------------------------------------------------------------------
function txt(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function num(v) {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function jourDe(v) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v == null ? "" : v));
  return m ? m[1] : null;
}
// Jour de Paris 'YYYY-MM-DD' d'un instant (ms). Le site raisonne en heure de
// Paris, les crons en UTC : la conversion est explicite, jamais implicite.
function parisDay(ms) {
  const parts = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Number.isFinite(Number(ms)) ? Number(ms) : Date.now()))
    .forEach(function (x) { parts[x.type] = x.value; });
  return parts.year + "-" + parts.month + "-" + parts.day;
}
function ajouterJours(jour, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
// Coup d'envoi au format public du site ("YYYY-MM-DD HH:MM", heure de Paris).
function kickoffParis(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) {
    // Deja au format public ? On le rend tel quel plutot que de le perdre.
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(iso || ""));
    return m ? m[1] + " " + m[2] : null;
  }
  const parts = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(t)).forEach(function (x) { parts[x.type] = x.value; });
  return parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute;
}
// Comparaison de noms de joueurs : accents, ponctuation et casse ignores.
function normNom(v) {
  return String(v == null ? "" : v)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Lecture d'un objet fixture de l'API (v3.football.api-sports.io)
// ---------------------------------------------------------------------------
function fixtureId(fix) {
  const id = fix && fix.fixture && fix.fixture.id;
  return id == null ? null : Number(id);
}
function fixtureStatus(fix) {
  return (fix && fix.fixture && fix.fixture.status && fix.fixture.status.short) || "";
}
// Score REGLEMENTAIRE (90 min). Meme regle que lib/resolvers.js#extractRegulationScore,
// recopiee ici pour que le module reste utilisable avec une fixture partielle.
function scoreReglementaire(fix) {
  const ft = fix && fix.score && fix.score.fulltime;
  let gh = ft && ft.home != null ? ft.home : null;
  let ga = ft && ft.away != null ? ft.away : null;
  if ((gh == null || ga == null) && fixtureStatus(fix) === "FT") {
    gh = fix && fix.goals && fix.goals.home != null ? fix.goals.home : null;
    ga = fix && fix.goals && fix.goals.away != null ? fix.goals.away : null;
  }
  const h = num(gh), a = num(ga);
  return { gh: h, ga: a };
}
// Contexte de reglement lisible SANS appel supplementaire : score a la pause.
// Les totaux de tirs (marche « tirs du match ») demandent un appel
// /fixtures/statistics : l'appelant les ajoute s'il les a, sinon le marche
// reste pending — jamais « perdu » faute de statistique (§5).
// ATTENTION : les cles absentes sont volontairement OMISES, jamais mises a
// null. lib/resolvers.js teste `Number.isFinite(Number(context.halftimeHome))`
// et Number(null) vaut 0 : passer null ferait regler un marche « premiere
// mi-temps » comme si le score a la pause etait 0-0, faute de donnee. Omis,
// Number(undefined) vaut NaN et le marche reste pending (§5).
function contexteDepuisFixture(fix) {
  const ht = fix && fix.score && fix.score.halftime;
  const ctx = {};
  if (ht && ht.home != null) ctx.halftimeHome = ht.home;
  if (ht && ht.away != null) ctx.halftimeAway = ht.away;
  return ctx;
}
// ---------------------------------------------------------------------------
// CE QUI S'EST REELLEMENT PASSE sur le marche retenu (20/09/2026, demande du
// proprietaire : « recommande moins de 25 tirs -> et le resultat »). On ne
// montre plus le score du match quand le marche ne porte pas sur les buts :
// on montre la MESURE du marche lui-meme.
//
// Structure, jamais une phrase : la page la traduit dans les 9 versions.
//   { kind: "shots" | "shots_on_target" | "goals_total" | "goals_home"
//           | "goals_away" | "halftime_goals" | "btts" | "outcome",
//     value: nombre, booleen, ou "home" | "draw" | "away" }
// Mesure indisponible : rien (jamais un 0 par defaut, meme regle que §5).
function observedOf(pari, fixture, ctx) {
  const libelle = String((pari && pari.prediction) || "").toLowerCase();
  if (!libelle) return null;
  const c = ctx || {};
  const nb = function (v) { return Number.isFinite(Number(v)) ? Number(v) : null; };
  if (/tirs cadr/.test(libelle)) {
    const v = nb(c.totalShotsOnTarget);
    return v == null ? null : { kind: "shots_on_target", value: v };
  }
  if (/tirs/.test(libelle)) {
    const v = nb(c.totalShots);
    return v == null ? null : { kind: "shots", value: v };
  }
  const sc = scoreReglementaire(fixture);
  const gh = sc ? nb(sc.gh) : null, ga = sc ? nb(sc.ga) : null;
  if (gh == null || ga == null) return null;
  if (/mi-temps|mi temps|premiere periode/.test(libelle)) {
    // Score a la pause : du contexte s'il est fourni, sinon de la fixture
    // elle-meme (contexteDepuisFixture). Absent = pas de mesure affichee.
    const ht = (fixture && fixture.score && fixture.score.halftime) || {};
    const hh = nb(c.halftimeHome != null ? c.halftimeHome : ht.home);
    const ha = nb(c.halftimeAway != null ? c.halftimeAway : ht.away);
    return hh == null || ha == null ? null : { kind: "halftime_goals", value: hh + ha };
  }
  if (/btts|deux equipes|deux équipes/.test(libelle)) return { kind: "btts", value: gh > 0 && ga > 0 };
  if (/domicile/.test(libelle) && /but/.test(libelle)) return { kind: "goals_home", value: gh };
  if (/exterieur|extérieur/.test(libelle) && /but/.test(libelle)) return { kind: "goals_away", value: ga };
  if (/\bdc\b|double chance|victoire|1x|x2|\b12\b|nul/.test(libelle)) {
    return { kind: "outcome", value: gh > ga ? "home" : gh < ga ? "away" : "draw" };
  }
  if (/under|over|moins de|plus de|but/.test(libelle)) return { kind: "goals_total", value: gh + ga };
  return null;
}

function indexerFixtures(fixtures) {
  const parId = {};
  (Array.isArray(fixtures) ? fixtures : []).forEach(function (f) {
    const id = fixtureId(f);
    if (id != null) parId[String(id)] = f;
  });
  return parId;
}

// ---------------------------------------------------------------------------
// Le pari publie : prediction d'historique.json completee par predictions_archive
// ---------------------------------------------------------------------------
// historique.json (depot PUBLIC) masque le pari d'une prediction en attente
// (lib/premium-fields.js#redactPendingPredictions : redacted = true, pari/cote/
// probabilite retires). La version complete vit dans predictions_archive
// (service role). On les fusionne ici, sans jamais inventer : si l'archive ne
// donne rien, le pari reste masque et le reglement s'arretera sur
// RAISON.PARI_NON_RELU.
function fusionnerPari(prediction, ligneArchive) {
  const p = prediction || {};
  const a = ligneArchive || {};
  const libelle = txt(p.prediction) || txt(a.prediction);
  return {
    fixture_id: p.fixture_id != null ? Number(p.fixture_id) : (a.fixture_id != null ? Number(a.fixture_id) : null),
    match: txt(p.match) || txt(a.match_label) || null,
    home: txt(p.home) || txt(a.home) || null,
    away: txt(p.away) || txt(a.away) || null,
    league: txt(p.league) || txt(a.league) || null,
    league_key: txt(p.league_key) || txt(a.league_key) || null,
    day: jourDe(p.date) || jourDe(a.date),
    prediction: libelle,
    // Une cote <= 1 n'est pas une cote (repli NO_ODDS de la publication) : elle
    // est rendue null plutot que d'etre affichee comme une vraie cote.
    cote: (function () { const c = num(p.cote) !== null ? num(p.cote) : num(a.cote); return c !== null && c > 1 ? c : null; })(),
    market_id: txt(p.market) || txt(a.market) || null,
    has_pinnacle: p.has_pinnacle === true || a.has_pinnacle === true,
    // market_source vient du match public quand l'appelant le fournit.
    market_source: txt(p.market_source) || txt(a.market_source) || null,
    // Etat deja enregistre par le pipeline quotidien.
    result: txt(p.result) || txt(a.result) || "scheduled",
    score: txt(p.score) || txt(a.score) || null,
    type: txt(p.type) || txt(a.type) || "single",
    redacted: !libelle,
  };
}

// JOUR D'UNE LIGNE PUBLIEE = LE JOUR DU MATCH, pas le jour de publication.
//
// historique.json date une prediction au jour du RUN qui l'a creee
// (update-data.yml : `date:TODAY`), pas au coup d'envoi : le pipeline publie
// aussi les matchs du lendemain. Un onglet « Hier » qui grouperait sur cette
// date afficherait, dans les resultats d'hier, un match qui se joue ce soir.
// On prefere donc le jour du coup d'envoi (heure de Paris) des qu'il est
// connu - fixture de l'API, ligne match_results, registre des pages match -
// et on retombe sur la date de publication quand il ne l'est pas. Aucune
// donnee inventee : un coup d'envoi inconnu reste un coup d'envoi inconnu.
function jourDuMatch(pari, kickoffDayOf) {
  const k = typeof kickoffDayOf === "function" ? kickoffDayOf(pari.fixture_id) : null;
  return jourDe(k) || pari.day;
}
// Index des jours de coup d'envoi connus, toutes sources confondues.
function indexerJoursDeMatch(fixturesById, resultRows, registry) {
  const out = {};
  Object.keys(fixturesById || {}).forEach(function (id) {
    const d = jourDe(kickoffParis(fixturesById[id] && fixturesById[id].fixture && fixturesById[id].fixture.date));
    if (d) out[id] = d;
  });
  (Array.isArray(resultRows) ? resultRows : []).forEach(function (r) {
    if (!r || r.fixture_id == null || out[String(r.fixture_id)]) return;
    const d = jourDe(r.kickoff);
    if (d) out[String(r.fixture_id)] = d;
  });
  const matches = (registry && registry.matches) || {};
  Object.keys(matches).forEach(function (id) {
    if (out[id]) return;
    const d = jourDe(kickoffParis(registrySnapshotDate(registry, id)));
    if (d) out[id] = d;
  });
  return function (id) { return out[String(id)] || null; };
}

// Les paris publies d'une journee : predictions simples, marche retenu, jour
// demande. Un match sans marche retenu (no_signal) n'est jamais une prediction
// d'historique.json : il n'entre donc jamais ici (§ « Ce que voit le visiteur »).
function parisDuJour(jour, predictions, archiveRows, kickoffDayOf) {
  const j = String(jour || "");
  const parId = {};
  (Array.isArray(archiveRows) ? archiveRows : []).forEach(function (r) {
    if (r && r.fixture_id != null) parId[String(r.fixture_id)] = r;
  });
  const vus = {};
  const out = [];
  (Array.isArray(predictions) ? predictions : []).forEach(function (p) {
    if (!p || p.fixture_id == null) return;
    if (p.type && p.type !== "single") return;
    if (p.result === "no_signal") return;
    const pari = fusionnerPari(p, parId[String(p.fixture_id)]);
    if (jourDuMatch(pari, kickoffDayOf) !== j) return;
    const cle = String(pari.fixture_id);
    if (vus[cle]) return;
    vus[cle] = true;
    out.push(pari);
  });
  // Lignes d'archive dont la prediction locale a ete tronquee du cache JSON
  // (historique.json garde 500 predictions) : elles restent des paris publies.
  (Array.isArray(archiveRows) ? archiveRows : []).forEach(function (r) {
    if (!r || r.fixture_id == null || vus[String(r.fixture_id)]) return;
    if (r.type && r.type !== "single") return;
    if (r.result === "no_signal") return;
    const pari = fusionnerPari(null, r);
    if (jourDuMatch(pari, kickoffDayOf) !== j) return;
    vus[String(r.fixture_id)] = true;
    out.push(pari);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Reglement d'un pari
// ---------------------------------------------------------------------------
// pari : sortie de fusionnerPari. fixture : objet API du match (ou null).
// ctx : contexte de reglement supplementaire ({halftimeHome, halftimeAway,
//   totalShots, totalShotsOnTarget}). Le score a la pause est lu de la fixture
//   si ctx ne le donne pas.
// -> { result, score, status, final, reason }
//   final = true quand l'API dit que le match ne se jouera plus (FT/AET/PEN ou
//   PST/CANC/ABD). C'est le SEUL declencheur autorise pour publier quoi que ce
//   soit du pari (§2).
function settleBet(pari, fixture, ctx) {
  const p = pari || {};
  if (!fixture) return { result: "pending", score: null, status: null, final: false, reason: RAISON.FIXTURE_ABSENTE };
  const status = fixtureStatus(fixture);
  const classe = classifyFixtureStatus(status);
  if (classe === "PENDING") {
    return { result: "pending", score: null, status: status, final: false, reason: RAISON.STATUT_NON_FINAL + ": " + (status || "?") };
  }
  if (classe === "VOID") {
    // Match reporte/annule/abandonne : mise remboursee, aucun verdict sportif.
    return { result: "void", score: null, status: status, final: true, reason: null };
  }
  const sc = scoreReglementaire(fixture);
  if (sc.gh === null || sc.ga === null) {
    return { result: "pending", score: null, status: status, final: true, reason: RAISON.SCORE_ABSENT };
  }
  const score = sc.gh + "-" + sc.ga;
  // Pari masque non relu : le match est bien termine (on peut publier le
  // score), mais on ne connait pas le pari publie -> jamais regle a l'aveugle.
  if (!txt(p.prediction)) {
    return { result: "pending", score: score, status: status, final: true, reason: RAISON.PARI_NON_RELU };
  }
  // Meme precaution que contexteDepuisFixture : une valeur nulle fournie par
  // l'appelant (statistique non lue) est ECARTEE, jamais transmise comme 0.
  const contexte = contexteDepuisFixture(fixture);
  Object.keys(ctx || {}).forEach(function (k) { if (ctx[k] !== null && ctx[k] !== undefined) contexte[k] = ctx[k]; });
  const gagne = resolveMarketWin(p.prediction, sc.gh, sc.ga, contexte);
  if (gagne === null) {
    return { result: "pending", score: score, status: status, final: true, reason: RAISON.MARCHE_NON_RESOLVABLE };
  }
  if (gagne === "void") {
    return { result: "void", score: score, status: status, final: true, reason: null };
  }
  return { result: gagne ? "win" : "loss", score: score, status: status, final: true, reason: null };
}

// Source reelle de la cote (§6). Jamais devine : "pinnacle" seulement quand la
// donnee le dit. null quand il n'y a pas de cote a qualifier.
function oddsSource(pari) {
  const p = pari || {};
  if (num(p.cote) === null || num(p.cote) <= 1) return null;
  const src = txt(p.market_source);
  if (src && /pinnacle/i.test(src)) return "pinnacle";
  if (p.has_pinnacle === true || (p.pinnacle_snapshot != null && p.pinnacle_snapshot !== false)) return "pinnacle";
  return "moyenne";
}

// ---------------------------------------------------------------------------
// Buteur du jour
// ---------------------------------------------------------------------------
// Un pari buteur est GAGNE des que le joueur a marque au moins un but dans le
// match. Entrees : le joueur retenu ({player_id, player, match_id}) et les
// evenements du match (/fixtures/events, ou fixture.events).
//
// Jamais de faux « n'a pas marque » : si les evenements ne sont pas fournis, ou
// si le joueur ne peut pas etre identifie de facon sure (aucun player_id et
// aucun nom exploitable), le pari reste pending.
function butsDuJoueur(events, joueur) {
  const id = num(joueur && joueur.player_id);
  const nom = normNom(joueur && joueur.player);
  if (!Array.isArray(events)) return null;
  if (id === null && !nom) return null;
  let buts = 0;
  let identifiable = id !== null;
  events.forEach(function (e) {
    if (!e || String(e.type || "").toLowerCase() !== "goal") return;
    // Un penalty manque et un but contre son camp ne sont pas des buts du
    // joueur (API-Football : detail "Missed Penalty" / "Own Goal").
    const detail = String(e.detail || "").toLowerCase();
    if (detail.indexOf("missed") !== -1 || detail.indexOf("own goal") !== -1) return;
    const pid = num(e.player && e.player.id);
    if (id !== null) { if (pid === id) buts++; return; }
    const pnom = normNom(e.player && e.player.name);
    if (pnom && pnom === nom) { buts++; identifiable = true; }
  });
  // Nom seul qui ne correspond a aucun buteur : on ne peut pas distinguer
  // « n'a pas marque » de « nom ecrit autrement par l'API » -> pending.
  return identifiable ? buts : null;
}
function resolveScorerPick(joueur, fixture, events) {
  const j = joueur || {};
  const base = {
    match_id: j.match_id != null ? Number(j.match_id) : (fixtureId(fixture) || null),
    match: txt(j.match) || null,
    player: txt(j.player) || null,
    goals: null,
    result: "pending",
  };
  if (!fixture) return base;
  const classe = classifyFixtureStatus(fixtureStatus(fixture));
  if (classe === "PENDING") return base;
  if (classe === "VOID") { base.result = "void"; return base; }
  const evs = Array.isArray(events) ? events : (Array.isArray(fixture.events) ? fixture.events : null);
  const buts = butsDuJoueur(evs, j);
  if (buts === null) return base;
  base.goals = buts;
  base.result = buts >= 1 ? "win" : "loss";
  return base;
}

// ---------------------------------------------------------------------------
// Lien vers la page match existante
// ---------------------------------------------------------------------------
// `href` absent quand la page n'existe pas (contrat). Le registre
// data/match-pages-registry.json est la seule source qui dit quelles pages ont
// ete reellement ecrites ; lib/league-names.js#staticMatchPath donne le chemin.
function matchHref(fixture_id, league_key, registry, dir) {
  const d = txt(dir) || "fr";
  // staticMatchPath n'existe que dans les versions de lib/league-names.js qui
  // portent les pages match statiques. Absent : pas de lien, jamais d'erreur.
  if (!LEAGUE_NAMES || typeof LEAGUE_NAMES.staticMatchPath !== "function") return null;
  const chemin = LEAGUE_NAMES.staticMatchPath(fixture_id, league_key, d);
  if (!chemin) return null;
  const entree = registry && registry.matches ? registry.matches[String(fixture_id)] : null;
  if (!entree) return null;
  // Page supprimee (J+30, 301 vers le hub ligue) : plus de lien direct.
  if (entree.status === "redirected") return null;
  const dirs = Array.isArray(entree.dirs) ? entree.dirs : [];
  if (dirs.indexOf(d) === -1) return null;
  return chemin;
}

// ---------------------------------------------------------------------------
// Fichier results/<YYYY-MM-DD>.json
// ---------------------------------------------------------------------------
function computeTotals(matches) {
  const t = { settled: 0, won: 0, lost: 0, void: 0, pending: 0 };
  (Array.isArray(matches) ? matches : []).forEach(function (m) {
    if (!m) return;
    if (m.result === "win") t.won++;
    else if (m.result === "loss") t.lost++;
    else if (m.result === "void") t.void++;
    else t.pending++;
  });
  // Bandeau « 47 marches sur 52 realises » : void et pending ne comptent ni au
  // numerateur ni au denominateur (§ contrat commun).
  t.settled = t.won + t.lost;
  return t;
}

// Lignes match_results deja ecrites par le job de resolution (source la plus
// recente : elles ont ete ecrites au moment ou l'API disait le match termine).
function indexerResultats(rows) {
  const parId = {};
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (r && r.fixture_id != null) parId[String(r.fixture_id)] = r;
  });
  return parId;
}

// input :
//   day            'YYYY-MM-DD' (heure de Paris)
//   predictions    predictions d'historique.json (toutes journees confondues)
//   archiveRows    lignes predictions_archive (facultatif)
//   results        lignes match_results deja reglees (facultatif)
//   fixtures       objets fixture de l'API pour ce jour (facultatif)
//   contexts       { fixture_id: contexte de reglement } (facultatif)
//   scorers        entrees buteur DEJA resolues (facultatif) - jamais calculees
//                  ici sans evenements : voir resolveScorerPick
//   registry       data/match-pages-registry.json (facultatif)
//   dir            version du site pour href (defaut 'fr')
//   generatedAt    ISO (defaut : maintenant)
//
// -> { file, report }
//   file   : contenu EXACT de results/<day>.json (contrat de la specification).
//   report : diagnostic interne, JAMAIS publie ({ day, total, settled, pending,
//            unsettled: [{fixture_id, match, reason}], byReason, warn }).
function buildDayFile(input) {
  const inp = input || {};
  const day = String(inp.day || "");
  const dir = txt(inp.dir) || "fr";
  const generatedAt = txt(inp.generatedAt) || new Date().toISOString();
  const fixturesParId = inp.fixturesById || indexerFixtures(inp.fixtures);
  const resultatsParId = indexerResultats(inp.results);
  const contexts = inp.contexts || {};
  const jourConnu = indexerJoursDeMatch(fixturesParId, inp.results, inp.registry);
  const paris = parisDuJour(day, inp.predictions, inp.archiveRows, jourConnu);
  // MATCHS JAMAIS PROPOSES (20/09/2026, constat du proprietaire) : le pipeline
  // enregistre une prediction meme pour un match DEJA COMMENCE quand il tourne
  // (matchs de nuit : Amerique du Nord et du Sud). Le site affiche alors
  // « Match commence ou imminent : aucun pronostic » et personne n'a pu la
  // suivre. Ces lignes n'entrent donc ni dans la liste ni dans le compte : les
  // publier reviendrait a s'attribuer des resultats qu'on n'a jamais proposes.
  const jamaisProposes = {};
  ((inp.noSignal && inp.noSignal.length ? inp.noSignal : [])).forEach(function (id) {
    if (id != null) jamaisProposes[String(id)] = true;
  });

  const matches = [];
  const unsettled = [];
  const byReason = {};

  paris.forEach(function (pari) {
    const cle = String(pari.fixture_id);
    const ligne = resultatsParId[cle] || null;
    if (jamaisProposes[cle]) return;   // jamais propose : ni affiche, ni compte
    const fixture = fixturesParId[cle] || null;
    let regle;
    if (ligne && RESULTATS.indexOf(String(ligne.result)) !== -1 && ligne.result !== "pending") {
      // Deja regle par le job de resolution : le match etait termine, on ne
      // redemande rien a l'API et on ne change pas un verdict deja publie.
      regle = { result: String(ligne.result), score: txt(ligne.score), status: null, final: true, reason: null };
    } else {
      regle = settleBet(pari, fixture, contexts[cle]);
      // Repli : le pipeline quotidien a deja regle cette prediction dans
      // historique.json (result win/loss/void + score). C'est le meme
      // declencheur (statut final de l'API au moment de ce reglement), juste
      // constate plus tot.
      if (!regle.final && ["win", "loss", "void"].indexOf(pari.result) !== -1) {
        regle = { result: pari.result, score: pari.score, status: null, final: true, reason: null };
      }
    }

    if (!regle.final) {
      const raison = regle.reason || RAISON.FIXTURE_ABSENTE;
      unsettled.push({ fixture_id: pari.fixture_id, match: pari.match || (pari.home + " - " + pari.away), reason: raison });
      byReason[raison] = (byReason[raison] || 0) + 1;
    } else if (regle.result === "pending") {
      const raison = regle.reason || RAISON.MARCHE_NON_RESOLVABLE;
      unsettled.push({ fixture_id: pari.fixture_id, match: pari.match || (pari.home + " - " + pari.away), reason: raison });
      byReason[raison] = (byReason[raison] || 0) + 1;
    }

    // MATCH NON TERMINE : la ligne existe (le visiteur voit « En attente »)
    // mais ne porte AUCUNE donnee premium - ni pari, ni cote, ni source, ni
    // score. Seuls des faits deja publics sortent ici (§2).
    const termine = regle.final === true;
    const entree = {
      id: pari.fixture_id,
      home: pari.home,
      away: pari.away,
      // Identifiants d'equipe : l'accueil affiche les VRAIS ecussons, comme
      // l'onglet Aujourd'hui (20/09/2026). Donnee publique de l'API.
      home_id: (fixture && fixture.teams && fixture.teams.home && fixture.teams.home.id) || null,
      away_id: (fixture && fixture.teams && fixture.teams.away && fixture.teams.away.id) || null,
      league: pari.league,
      league_key: pari.league_key,
      kickoff: kickoffParis(
        (fixture && fixture.fixture && fixture.fixture.date) ||
        (ligne && ligne.kickoff) ||
        (registrySnapshotDate(inp.registry, pari.fixture_id))
      ),
      // FICHIER PUBLIC MINIMAL (20/09/2026, demande du proprietaire) : l'onglet
      // « Hier » n'affiche qu'un liseré vert ou rouge. On ne publie donc NI le
      // pari, NI la cote, NI le score — seulement de quoi dessiner la ligne et
      // le verdict. Rien de payant ne peut fuiter par ce fichier, meme par
      // erreur : ces champs n'y entrent plus du tout.
      result: regle.result,
    };

    const href = matchHref(pari.fixture_id, pari.league_key, inp.registry, dir);
    if (href) entree.href = href;
    matches.push(entree);
  });

  matches.sort(function (a, b) {
    const ka = String(a.kickoff || ""), kb = String(b.kickoff || "");
    if (ka !== kb) return ka < kb ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });

  const scorers = normaliserButeurs(inp.scorers);
  const totals = computeTotals(matches);
  const file = { day: day, generated_at: generatedAt, totals: totals, matches: matches, scorers: scorers };
  const report = {
    day: day,
    total: paris.length,
    settled: totals.settled + totals.void,
    pending: totals.pending,
    unsettled: unsettled,
    byReason: byReason,
  };
  return { file: file, report: report };
}

// Coup d'envoi connu du registre des pages match (fait public).
function registrySnapshotDate(registry, id) {
  const e = registry && registry.matches ? registry.matches[String(id)] : null;
  if (!e) return null;
  return (e.snapshot && e.snapshot.date) || e.kickoff || null;
}

// Entrees buteur du contrat. Une entree sans joueur nomme n'est pas publiee :
// on ne colore jamais un buteur qu'on ne sait pas nommer (§5).
function normaliserButeurs(scorers) {
  return (Array.isArray(scorers) ? scorers : []).map(function (s) {
    if (!s || s.match_id == null || !txt(s.player)) return null;
    const r = RESULTATS.indexOf(String(s.result)) !== -1 ? String(s.result) : "pending";
    return {
      match_id: Number(s.match_id),
      match: txt(s.match) || null,
      player: txt(s.player),
      goals: num(s.goals) === null ? null : Math.max(0, Math.round(num(s.goals))),
      result: r,
    };
  }).filter(Boolean);
}

// results/index.json : les jours disponibles avec leurs totaux, du plus recent
// au plus ancien. entrees : [{ day, totals }] ou [fichier complet].
function buildIndexFile(jours, generatedAt) {
  const days = (Array.isArray(jours) ? jours : [])
    .map(function (j) {
      if (!j || !j.day) return null;
      return { day: String(j.day), totals: j.totals || computeTotals(j.matches) };
    })
    .filter(Boolean)
    .sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : 0; });
  return { generated_at: txt(generatedAt) || new Date().toISOString(), days: days };
}

// ---------------------------------------------------------------------------
// Journalisation et alerte
// ---------------------------------------------------------------------------
// Une ligne par pari non regle, avec la raison exacte. Destine aux journaux
// GitHub Actions : le depot est PUBLIC, donc jamais le libelle du pari ni sa
// cote (tests/pipeline-log-leak.test.js) - seulement le match et la raison.
function formatUnsettledLog(report) {
  const r = report || {};
  const lignes = [];
  (r.unsettled || []).forEach(function (u) {
    lignes.push("  [resultats] " + r.day + " fixture " + u.fixture_id + " (" + (u.match || "?") + ") non regle : " + u.reason);
  });
  return lignes;
}

// ::warning quand plus de 10 % des paris d'une journee restent non regles plus
// de 24 h apres cette journee. Avant 24 h, des matchs peuvent legitimement ne
// pas etre termines : aucune alerte.
// -> chaine ::warning, ou null.
function unsettledWarning(report, opts) {
  const r = report || {};
  const o = opts || {};
  const now = Number.isFinite(Number(o.nowMs)) ? Number(o.nowMs) : Date.now();
  const seuil = Number.isFinite(Number(o.seuil)) ? Number(o.seuil) : SEUIL_ALERTE_NON_REGLES;
  const total = Number(r.total) || 0;
  const nonRegles = (r.unsettled || []).length;
  if (!total || !nonRegles) return null;
  // Fin de la journee reglee (23:59 Paris ~ 22:00 UTC, marge volontairement
  // prudente : on compare a minuit UTC du lendemain).
  const finJour = Date.parse(String(r.day || "") + "T23:59:59Z");
  if (!Number.isFinite(finJour) || now - finJour < 24 * 3600 * 1000) return null;
  const part = nonRegles / total;
  if (part <= seuil) return null;
  const detail = Object.keys(r.byReason || {}).sort().map(function (k) {
    return k + " x" + r.byReason[k];
  }).join(", ");
  return "::warning title=Resultats non regles::" + r.day + " : " + nonRegles + "/" + total +
    " pari(s) (" + Math.round(part * 1000) / 10 + " %) toujours non regle(s) plus de 24 h apres la journee" +
    (detail ? " - " + detail : "") + ".";
}

// ---------------------------------------------------------------------------
// Ligne de la table public.match_results (migration 0032)
// ---------------------------------------------------------------------------
// Une ligne n'est produite QUE pour un match dont l'API a donne un statut
// final : la table est lisible en anonyme, elle ne doit jamais porter le pari
// d'un match non termine (§2). La contrainte CHECK de la migration refuse de
// toute facon une ligne sans resolved_at.
function matchResultRow(entree, day, resolvedAt) {
  if (!entree || entree.id == null) return null;
  // Ligne « En attente » d'un match non termine (pick null) : jamais ecrite.
  // Depuis le 20/09/2026 le fichier public ne porte plus ni pari ni score :
  // une entree « pending » n'a donc simplement aucun de ces champs.
  if (entree.result === "pending" && !entree.score && !entree.pick) return null;
  return {
    fixture_id: Number(entree.id),
    day: String(day || ""),
    home: entree.home || null,
    away: entree.away || null,
    league: entree.league || null,
    league_key: entree.league_key || null,
    kickoff: entree.kickoff || null,
    score: entree.score || null,
    pick: entree.pick || null,
    market_id: entree.market_id || null,
    cote: entree.cote != null ? Number(entree.cote) : null,
    odds_source: entree.odds_source || null,
    result: entree.result,
    scorer_player: entree.scorer_player || null,
    scorer_goals: entree.scorer_goals != null ? Number(entree.scorer_goals) : null,
    scorer_result: entree.scorer_result || null,
    resolved_at: txt(resolvedAt) || new Date().toISOString(),
  };
}

module.exports = {
  RAISON: RAISON,
  RESULTATS: RESULTATS,
  EN_ATTENTE: EN_ATTENTE,
  SEUIL_ALERTE_NON_REGLES: SEUIL_ALERTE_NON_REGLES,
  parisDay: parisDay,
  ajouterJours: ajouterJours,
  jourDe: jourDe,
  kickoffParis: kickoffParis,
  fixtureId: fixtureId,
  fixtureStatus: fixtureStatus,
  scoreReglementaire: scoreReglementaire,
  contexteDepuisFixture: contexteDepuisFixture,
  observedOf: observedOf,
  indexerFixtures: indexerFixtures,
  fusionnerPari: fusionnerPari,
  parisDuJour: parisDuJour,
  jourDuMatch: jourDuMatch,
  indexerJoursDeMatch: indexerJoursDeMatch,
  settleBet: settleBet,
  oddsSource: oddsSource,
  butsDuJoueur: butsDuJoueur,
  resolveScorerPick: resolveScorerPick,
  matchHref: matchHref,
  computeTotals: computeTotals,
  buildDayFile: buildDayFile,
  buildIndexFile: buildIndexFile,
  formatUnsettledLog: formatUnsettledLog,
  unsettledWarning: unsettledWarning,
  matchResultRow: matchResultRow,
};
