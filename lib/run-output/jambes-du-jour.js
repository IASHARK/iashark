"use strict";
// JAMBES DES TICKETS, SELECTION EN OR, BUTEUR DU JOUR (demande de Clement du 04/10/2026 ;
// regles du trader de cotes, regles-tickets.md §2.1, §2.2, §2.9, §2.10).
//
// Aucun calcul de probabilite ici : ce module LIT ce que le pipeline a deja publie sur
// chaque match (pari, cote, chance affichee, buteurs du moteur v3) et applique les
// conditions d'entree. Les memes chiffres que la page match, toujours.
//
// Jambe eligible (toutes les conditions) :
//  1. le match a un pari publie : pari_rec non vide, no_signal !== true, market_id,
//     pronostic.publie === true sur le meme marche ;
//  2. pari « verifie » (pronostic.fiabilite === « vérifiée ») : jamais un pari « en test » ;
//  3. chance affichee lisible (chance_iashark, entier 1-99) ;
//  4. cote affichee dans config/leagues.json#fiabilite.fourchette_pari (bornes comprises,
//     au centime, lue dans la config : jamais recopiee ici) ;
//  5. match a venir au moment du calcul : statut NS/TBD et coup d'envoi a plus de 15 min
//     (lib/kickoff-guard.js, la meme garde que les paris) ;
//  6. cote relevee chez un operateur agree ANJ SUIVI (cote_source « anj » et
//     cote_bookmaker dans config/bookmakers-agrees.json, suivi : true). Jamais une cote
//     indicative, jamais Pinnacle ni bet365 ;
//  7. categorie (ligue, famille de pari) non NO-GO pour le mathematicien
//     (config/verdicts-maths.json#categories_no_go, ex. double chance d'Argentine) et
//     competition ou le pari simple est mesure (config/verdicts-maths.json#competitions_jambes :
//     ni coupe nationale, ni tournoi, ni coupe d'Europe ; verdict du 04/10/2026, §1 point 6) ;
//  8. match du jour J de Paris (date publique « AAAA-MM-JJ HH:MM », deja en heure de Paris) ;
//  9. jamais un pari de repli (pronostic.hors_fourchette, avocat du diable du 04/10/2026).

const CHANCE = require("../chance-iashark.js");
const PRONOSTIC = require("../pronostic.js");
const { kickoffGate, KICKOFF_MARGIN_MINUTES } = require("../kickoff-guard.js");
const AGREES = require("../../config/bookmakers-agrees.json");
const REGLES = require("../../config/tickets.json");
const LIGUES = require("../../config/leagues.json");
const VERDICTS = require("../../config/verdicts-maths.json");
const { centimes, chanceEntiere } = require("./combo-math.js");
const { ordreProbable } = require("./combos.js");

const FIABILITE_VERIFIEE = PRONOSTIC.FIABILITE.VERIFIEE;
const OPERATEURS_SUIVIS = ((AGREES.pays && AGREES.pays.fr && AGREES.pays.fr.bookmakers) || [])
  .filter((b) => b && b.suivi === true && typeof b.nom === "string").map((b) => b.nom);

function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function nomEquipe(e) { return texte(e && typeof e === "object" ? (e.n || e.name) : e); }
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

// Jour de Paris « AAAA-MM-JJ » d'un instant (ms).
function jourParis(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Number.isFinite(Number(ms)) ? Number(ms) : Date.now()))
    .forEach((x) => { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}

function familleDe(marketId) {
  const d = PRONOSTIC.MARCHE[String(marketId || "")];
  return d ? d.famille : null;
}

// categories_no_go : [{ ligue?, famille? }] ; une entree vide ne bloque rien.
function categorieNoGo(m, marketId, categories) {
  const ligue = String((m && m.league_key) || "");
  const fam = familleDe(marketId);
  return (Array.isArray(categories) ? categories : []).some(function (c) {
    if (!estObjet(c) || (c.ligue == null && c.famille == null)) return false;
    return (c.ligue == null || String(c.ligue) === ligue) && (c.famille == null || String(c.famille) === fam);
  });
}

// Competition non mesuree pour les paris simples (coupes, tournois, coupes d'Europe).
const KIND_PAR_LIGUE = {};
((LIGUES && LIGUES.leagues) || []).forEach((l) => { if (l && l.key) KIND_PAR_LIGUE[String(l.key)] = l.kind || null; });
function competitionExclue(m, regle) {
  const r = estObjet(regle) ? regle : (VERDICTS.competitions_jambes || {});
  const cle = String((m && m.league_key) || "");
  if ((Array.isArray(r.exclure_ligues) ? r.exclure_ligues : []).map(String).indexOf(cle) !== -1) return true;
  const kind = KIND_PAR_LIGUE[cle];
  return !!kind && (Array.isArray(r.exclure_types) ? r.exclure_types : []).map(String).indexOf(kind) !== -1;
}

function duJour(m, jour) { return typeof (m && m.date) === "string" && m.date.slice(0, 10) === jour; }

// Garde coup d'envoi de la jambe (fixture API-Football du run, jamais devinee).
function garde(m, opts) {
  const fx = opts.fixtureById ? opts.fixtureById[String(m.id)] : null;
  const marge = Number.isFinite(Number(opts.margeMinutes)) ? Number(opts.margeMinutes)
    : Number.isFinite(Number(REGLES.marge_coup_envoi_min)) ? Number(REGLES.marge_coup_envoi_min) : KICKOFF_MARGIN_MINUTES;
  return kickoffGate(fx || null, opts.nowMs, { marginMinutes: marge });
}

// Pourquoi un match n'est pas une jambe (null = jambe). Raisons internes, comptees
// dans le journal, jamais le match lui-meme.
function raisonExclusion(m, opts, F) {
  if (!m || typeof m !== "object" || m.id == null) return "match_illisible";
  if (!duJour(m, opts.jour)) return "autre_jour";
  const marketId = texte(m.market_id);
  const p = estObjet(m.pronostic) ? m.pronostic : null;
  if (!texte(m.pari_rec) || m.no_signal === true || !marketId || !p || p.publie !== true || String(p.market_id || "") !== marketId) return "sans_pari_publie";
  if (p.fiabilite !== FIABILITE_VERIFIEE) return "en_test";
  // Pari de repli (aucune cote dans la fourchette, lib/pronostic.js#choisirPariFourchette) : jamais une jambe,
  // jamais la Selection en or, meme si sa cote retombe dans la fourchette au centime pres.
  if (p.hors_fourchette === true) return "hors_fourchette";
  if (chanceEntiere(CHANCE.chanceDuPari(m)) === null) return "chance_illisible";
  if (!PRONOSTIC.dansFourchette(m.cote_rec, F)) return "hors_fourchette";
  if (m.cote_source !== "anj" || OPERATEURS_SUIVIS.indexOf(String(m.cote_bookmaker || "")) === -1) return "cote_non_agreee";
  if (!garde(m, opts).open) return "coup_envoi";
  if (categorieNoGo(m, marketId, opts.categoriesNoGo)) return "categorie_no_go";
  if (competitionExclue(m, opts.competitions)) return "competition_non_mesuree";
  return null;
}

function jambeDe(m, opts) {
  const g = garde(m, opts);
  const corr = estObjet(m.chance_correction) ? Number(m.chance_correction.calculee) : NaN;
  return {
    fixture_id: Number(m.id),
    domicile: nomEquipe(m.home), exterieur: nomEquipe(m.away),
    ligue: texte(m.league), ligue_key: texte(m.league_key), ligue_id: m.league_id != null && Number.isFinite(Number(m.league_id)) ? Number(m.league_id) : null,
    coup_envoi: m.date, coup_envoi_ms: g.kickoff_ms,
    pari: texte(m.pronostic.libelle_fr) || PRONOSTIC.libelleFr(m.market_id, m) || texte(m.pari_rec),
    market_id: String(m.market_id), famille: familleDe(m.market_id),
    cote: centimes(m.cote_rec) / 100, operateur: String(m.cote_bookmaker),
    chance: chanceEntiere(CHANCE.chanceDuPari(m)),
    chance_calculee: Number.isFinite(corr) ? corr : null,
  };
}

// opts : { jour (Paris), nowMs, fixtureById, configLigues, categoriesNoGo }
// -> { jambes: [...], exclus: { raison: nombre } }.
function jambesDuJour(matchs, opts) {
  opts = Object.assign({}, opts || {});
  if (!opts.jour) opts.jour = jourParis(opts.nowMs);
  const F = PRONOSTIC.fourchettePari(opts.configLigues || null);
  const exclus = {};
  const jambes = [];
  const vues = new Set();
  (matchs || []).forEach(function (m) {
    const r = raisonExclusion(m, opts, F);
    if (r) { if (r !== "autre_jour") exclus[r] = (exclus[r] || 0) + 1; return; }
    if (vues.has(String(m.id))) { exclus.doublon = (exclus.doublon || 0) + 1; return; }
    vues.add(String(m.id));
    jambes.push(jambeDe(m, opts));
  });
  jambes.sort((a, b) => a.fixture_id - b.fixture_id);
  return { jambes: jambes, exclus: exclus };
}

// SELECTION EN OR : les nb (3) paris eligibles les plus probables ; exactement nb, sinon
// rien (jamais completee avec un pari hors regles). Ordre : chance affichee, chance
// calculee avant correction, coup d'envoi le plus tot, plus petit numero de match.
function selectionEnOr(jambes, opts) {
  const nb = Number((opts && opts.nb) || (REGLES.selection_or && REGLES.selection_or.nb) || 3);
  const liste = (jambes || []).filter((j) => j && chanceEntiere(j.chance) !== null).slice().sort(ordreProbable);
  if (liste.length < nb) return null;
  return liste.slice(0, nb).map((j, i) => Object.assign({ rang: i + 1 }, j));
}

// BUTEUR DU JOUR : le plus probable du calcul buteur du moteur v3 (v3_buteurs, titulaires
// probables seulement, le meme que la page match), matchs du jour J, garde coup d'envoi
// ouverte, categorie non NO-GO. Chance = lib/chance-iashark.js#chanceButeur (vers le bas a
// 5 points, 45 % au plus, rien sous 10 %). Personne a 10 % : pas de buteur du jour.
// Egalite : coup d'envoi le plus tot, plus petit numero de match, plus petit joueur_id, nom.
let PERIMETRE_V3 = null;
try { PERIMETRE_V3 = (require("../../config/verdicts-maths.json").perimetre_v3 || {}).ligues || null; } catch (_e) { PERIMETRE_V3 = null; }
function buteurDuJour(matchs, opts) {
  opts = Object.assign({}, opts || {});
  if (!opts.jour) opts.jour = jourParis(opts.nowMs);
  const cands = [];
  (matchs || []).forEach(function (m) {
    if (!m || m.id == null || !duJour(m, opts.jour) || !Array.isArray(m.v3_buteurs)) return;
    if (!garde(m, opts).open) return;
    if ((Array.isArray(opts.categoriesNoGo) ? opts.categoriesNoGo : []).some((c) => estObjet(c) && c.ligue != null && c.famille == null && String(c.ligue) === String(m.league_key || ""))) return;
    if (competitionExclue(m, opts.competitions)) return;
    // Condition du mathematicien (verdicts-maths-finitions.md, mission 2, 04/10/2026) : candidats
    // seulement dans les championnats mesures du v3 (config/verdicts-maths.json#perimetre_v3.ligues).
    if (PERIMETRE_V3 && PERIMETRE_V3.indexOf(String(m.league_key || "")) === -1) return;
    m.v3_buteurs.forEach(function (b) {
      if (!b || typeof b.joueur !== "string" || !b.joueur.trim()) return;
      const p = Number(b.p_marque);
      const chance = CHANCE.chanceButeur(p);
      if (chance === null || (b.cote !== "home" && b.cote !== "away")) return;
      cands.push({
        p: p, chance: chance, fixture_id: Number(m.id), coup_envoi: m.date,
        joueur: b.joueur.trim(), joueur_id: Number.isInteger(Number(b.joueur_id)) && b.joueur_id !== null ? Number(b.joueur_id) : null,
        poste: texte(b.poste), cote: b.cote,
        equipe: b.cote === "home" ? nomEquipe(m.home) : nomEquipe(m.away),
        adversaire: b.cote === "home" ? nomEquipe(m.away) : nomEquipe(m.home),
        domicile: nomEquipe(m.home), exterieur: nomEquipe(m.away),
        ligue: texte(m.league), ligue_key: texte(m.league_key), coup_envoi_ms: garde(m, opts).kickoff_ms,
      });
    });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) {
    return (b.p - a.p) || String(a.coup_envoi).localeCompare(String(b.coup_envoi)) || (a.fixture_id - b.fixture_id)
      || ((a.joueur_id == null ? Infinity : a.joueur_id) - (b.joueur_id == null ? Infinity : b.joueur_id)) || a.joueur.localeCompare(b.joueur);
  });
  const b = cands[0];
  return {
    joueur: b.joueur, joueur_id: b.joueur_id, poste: b.poste, cote: b.cote, equipe: b.equipe, adversaire: b.adversaire,
    domicile: b.domicile, exterieur: b.exterieur, fixture_id: b.fixture_id, ligue: b.ligue, ligue_key: b.ligue_key,
    coup_envoi: b.coup_envoi, coup_envoi_ms: b.coup_envoi_ms, chance: b.chance, p_marque: Math.round(b.p * 10000) / 10000,
  };
}

module.exports = { jambesDuJour, selectionEnOr, buteurDuJour, raisonExclusion, jourParis, categorieNoGo, competitionExclue, OPERATEURS_SUIVIS };
