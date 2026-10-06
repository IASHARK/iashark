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
const BUTEURS_FIGES = require("../buteurs-figes.js");

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
// Joueur ABSENT (regle de Clement du 04/10/2026, 20 h ; lib/buteurs-figes.js#absenceDe) : jamais candidat
// (composition officielle publiee sans lui, absence annoncee pour ce match, hors de l'effectif convoque ; sur un
// doute, il reste candidat).
// opts.exclure : [{ fixture_id, joueur_id, joueur }] jamais repris (remplacement du buteur du jour : l'ancien
// joueur et ceux qu'il remplacait deja, lib/tickets-du-jour.js).
let PERIMETRE_V3 = null;
try { PERIMETRE_V3 = (require("../../config/verdicts-maths.json").perimetre_v3 || {}).ligues || null; } catch (_e) { PERIMETRE_V3 = null; }
function exclu(liste, fixtureId, b) {
  return (Array.isArray(liste) ? liste : []).some(function (x) {
    if (!estObjet(x) || Number(x.fixture_id) !== Number(fixtureId)) return false;
    const idX = x.joueur_id != null && Number.isFinite(Number(x.joueur_id)) ? Number(x.joueur_id) : null;
    const idB = b.joueur_id != null && Number.isFinite(Number(b.joueur_id)) ? Number(b.joueur_id) : null;
    if (idX !== null && idB !== null) return idX === idB;
    return BUTEURS_FIGES.normaliser(x.joueur) === BUTEURS_FIGES.normaliser(b.joueur);
  });
}
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
      if (exclu(opts.exclure, m.id, b)) return;
      if (BUTEURS_FIGES.absenceDe(m, { id: b.joueur_id, nom: b.joueur }, b.cote) !== null) return;
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

// =====================================================================================
// TOUS LES MARCHES (demande de Clement du 06/10/2026) : la Selection en or et les combines ne prennent plus
// SEULEMENT le pari affiche de chaque match, mais tous les marches candidats du match (lib/pronostic.js
// #marchesCandidats : memes sources justes, meme chance, meme cote que le choix du pari), avec deux regles
// differentes :
//   - SELECTION EN OR = « valeur » : marches chiffres par le moteur v3 (chance du modele juste dans ce
//     championnat) dont la cote est plus haute (bornes dans config/tickets.json#selection_or, jamais ecrites ici) ; classement
//     INTERNE par ecart entre la chance du modele et la cote sans marge du meme marche (jamais affiche) ;
//     3 paris de 3 matchs differents, sinon rien. Affichage : match, pari, cote, chance (la chance IASHARK,
//     la meme regle que partout : le plus bas entre le modele et la cote sans marge).
//   - JAMBES DES COMBINES = paris plus surs : cote basse et chance affichee haute (bornes dans
//     config/tickets.json#jambe), toutes sources justes, tous marches.
// Toutes : pari « vérifiée », cote reelle (agreee d'abord, sinon celle d'API-Football, sans nom de
// bookmaker), match du jour J a venir (garde coup d'envoi), competition mesuree, categorie non NO-GO, et
// COHERENT avec le pari affiche sur la page du match (lib/marches-paris.js#coherent) et avec toute autre
// selection du jour deja engagee sur le meme match.

const MP = require("../marches-paris.js");

// Garde commune d'un match : jour J, coup d'envoi, competition mesuree. -> raison ou null.
function raisonMatch(m, opts) {
  if (!m || typeof m !== "object" || m.id == null) return "match_illisible";
  if (!duJour(m, opts.jour)) return "autre_jour";
  if (!garde(m, opts).open) return "coup_envoi";
  if (competitionExclue(m, opts.competitions)) return "competition_non_mesuree";
  return null;
}
// Pari affiche sur la page du match (ancre de coherence), ou null.
function pariAffiche(m) {
  return texte(m && m.pari_rec) && m.no_signal !== true && texte(m.market_id) ? String(m.market_id) : null;
}
function entreBornes(cote, min, max) {
  const c = centimes(cote);
  return c !== null && c >= Math.round(Number(min) * 100) && c <= Math.round(Number(max) * 100);
}
// Une selection (jambe ou pari de la Selection en or) a partir d'un candidat du match. Le marche du pari
// affiche garde EXACTEMENT la cote, l'operateur et la chance de la page (une seule source).
function selectionDe(m, c, opts) {
  const g = garde(m, opts);
  const memePari = pariAffiche(m) === String(c.market_id);
  const chancePage = memePari ? chanceEntiere(CHANCE.chanceDuPari(m)) : null;
  const cote = memePari && centimes(m.cote_rec) !== null ? centimes(m.cote_rec) / 100 : centimes(c.cote) / 100;
  const agree = memePari ? m.cote_source === "anj" && OPERATEURS_SUIVIS.indexOf(String(m.cote_bookmaker || "")) !== -1 : c.cote_anj === true && OPERATEURS_SUIVIS.indexOf(String(c.bookmaker || "")) !== -1;
  return {
    fixture_id: Number(m.id),
    domicile: nomEquipe(m.home), exterieur: nomEquipe(m.away),
    ligue: texte(m.league), ligue_key: texte(m.league_key), ligue_id: m.league_id != null && Number.isFinite(Number(m.league_id)) ? Number(m.league_id) : null,
    coup_envoi: m.date, coup_envoi_ms: g.kickoff_ms,
    pari: texte(c.libelle_fr) || PRONOSTIC.libelleFr(c.market_id, m) || String(c.market_id),
    market_id: String(c.market_id), famille: c.famille || familleDe(c.market_id),
    cote: cote, operateur: agree ? String(memePari ? m.cote_bookmaker : c.bookmaker) : null,
    chance: chancePage !== null ? chancePage : chanceEntiere(Number(c.chance_affichee)),
    chance_calculee: Number.isFinite(Number(c.chance)) ? Number(c.chance) : null,
  };
}
function compter(exclus, r) { exclus[r] = (exclus[r] || 0) + 1; }

// Candidats d'un type (« jambe » ou « or ») pour le jour J.
// candidatsPar : lib/pronostic.js#marchesCandidats. opts : { jour, nowMs, fixtureById, competitions,
// categoriesNoGo, regles (config/tickets.json) }. -> { selections: [...], exclus: { raison: n } }.
function candidatsDuJour(matchs, candidatsPar, niveau, opts) {
  opts = Object.assign({}, opts || {});
  if (!opts.jour) opts.jour = jourParis(opts.nowMs);
  const regles = opts.regles || REGLES;
  const rj = regles.jambe || {}, ro = regles.selection_or || {};
  const seuil = regles.coherence && Number.isFinite(Number(regles.coherence.seuil_jambe)) ? Number(regles.coherence.seuil_jambe) : 0.8;
  const exclus = {};
  const out = [];
  (matchs || []).forEach(function (m) {
    const r = raisonMatch(m, opts);
    if (r) { if (r !== "autre_jour") compter(exclus, r); return; }
    const ancre = pariAffiche(m);
    const liste = candidatsPar && Array.isArray(candidatsPar[String(m.id)]) ? candidatsPar[String(m.id)] : [];
    liste.forEach(function (c) {
      if (!c || !c.market_id || !MP.CATALOGUE[String(c.market_id)]) return compter(exclus, /^F\d+:/.test(String(c && c.market_id)) ? "autre_marche_non_mesure_en_jambe" : "marche_inconnu");
      // Autres marches des bookmakers (codes « F… ») : mesures par le mathematicien comme PARI de la page seulement, jamais
      // comme jambe de combine ni Selection en or (controle de l'avocat du diable du 06/10) : jamais candidats ici. Ils
      // restent des ANCRES de coherence (pari affiche du match).
      if (c.fiabilite !== FIABILITE_VERIFIEE) return compter(exclus, "en_test");
      if (categorieNoGo(m, c.market_id, opts.categoriesNoGo)) return compter(exclus, "categorie_no_go");
      if (chanceEntiere(Number(c.chance_affichee)) === null) return compter(exclus, "chance_illisible");
      // Cote et chance PUBLIEES (celles de la page pour le marche du pari affiche) : c'est sur elles que portent
      // les bornes.
      const s = selectionDe(m, c, opts);
      if (s.chance === null || centimes(s.cote) === null) return compter(exclus, "chance_illisible");
      if (niveau === MP.NIVEAU.OR) {
        if (!entreBornes(s.cote, ro.cote_min, ro.cote_max)) return compter(exclus, "or_hors_cote");
        const p = Number(c.p_modele), q = Number(c.q);
        if (c.p_modele == null || c.q == null || !Number.isFinite(p) || !Number.isFinite(q)) return compter(exclus, "or_sans_modele");
        if (!(p - q > (Number(ro.ecart_min_points) || 0))) return compter(exclus, "or_sans_ecart");
      } else {
        if (!entreBornes(s.cote, rj.cote_min, rj.cote_max)) return compter(exclus, "jambe_hors_cote");
        if (s.chance < Number(rj.chance_min || 0)) return compter(exclus, "jambe_chance_basse");
      }
      if (ancre && !MP.coherent(m, ancre, c.market_id, niveau, seuil).ok) return compter(exclus, "incoherent_pari_affiche");
      if (niveau === MP.NIVEAU.OR) s.ecart = Math.round((Number(c.p_modele) - Number(c.q)) * 10) / 10;
      out.push(s);
    });
  });
  out.sort((a, b) => (a.fixture_id - b.fixture_id) || a.market_id.localeCompare(b.market_id));
  return { selections: out, exclus: exclus };
}

// Selections deja engagees aujourd'hui sur un match ({ fixture_id, market_id }) : une nouvelle selection du
// meme match doit aller dans le meme sens que chacune (niveau de la NOUVELLE selection).
function coherentAvecEngagees(s, engagees, matchParId, niveau, seuil) {
  const m = matchParId ? matchParId[String(s.fixture_id)] : null;
  return (engagees || []).every(function (e) {
    if (!e || Number(e.fixture_id) !== Number(s.fixture_id)) return true;
    return MP.coherent(m || {}, e.market_id, s.market_id, niveau, seuil).ok;
  });
}

// SELECTION EN OR (valeur) : par ecart decroissant (chance du modele moins cote sans marge), puis chance,
// coup d'envoi, numero de match, marche ; un pari par match ; exactement nb (3), sinon null.
function selectionEnOrValeur(selections, opts) {
  opts = opts || {};
  const regles = opts.regles || REGLES;
  const nb = Number((regles.selection_or && regles.selection_or.nb) || 3);
  const tries = (selections || []).slice().sort(function (a, b) {
    return (Number(b.ecart) - Number(a.ecart)) || (b.chance - a.chance) || String(a.coup_envoi || "").localeCompare(String(b.coup_envoi || ""))
      || (a.fixture_id - b.fixture_id) || String(a.market_id).localeCompare(String(b.market_id));
  });
  const pris = [], vus = new Set();
  for (const s of tries) {
    if (pris.length >= nb) break;
    if (vus.has(s.fixture_id)) continue;
    if (!coherentAvecEngagees(s, opts.engagees, opts.matchParId, MP.NIVEAU.OR)) continue;
    vus.add(s.fixture_id);
    pris.push(s);
  }
  if (pris.length < nb) return null;
  // Copie publiee : jamais l'ecart (classement interne, jamais affiche).
  return pris.map(function (s, i) { const c = Object.assign({ rang: i + 1 }, s); delete c.ecart; return c; });
}

module.exports = { jambesDuJour, selectionEnOr, selectionEnOrValeur, candidatsDuJour, coherentAvecEngagees, pariAffiche, buteurDuJour, raisonExclusion, raisonMatch, jourParis, categorieNoGo, competitionExclue, OPERATEURS_SUIVIS };
