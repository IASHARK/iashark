"use strict";
// BRANCHEMENT DU MOTEUR IASHARK v3 (preparation du 28/09/2026, rien d'active).
//
// Le moteur v3 se construit dans un depot separe (IASHARK/iashark-moteur). Il
// ecrit, par jour, un fichier sortie/AAAA-MM-JJ.json decrit par son
// CONTRAT_SORTIE.md (version 1.1) : pour chaque match, tous les marches avec
// probabilite, fiabilite par marche, « eligible VIP », compositions et leur
// voyant, et le pari publie FIGE avec sa « cote minimum a jouer ».
//
// Ce module est l'ADAPTATEUR cote site. Il est ETEINT par defaut : tant que la
// variable d'environnement MOTEUR_V3 ne vaut pas "1", creerBranchement()
// renvoie un objet inactif et le pipeline (.github/workflows/update-data.yml)
// n'appelle aucune de ses fonctions (chaque appel est sous if(MOTEUR_V3.actif)).
// Sortie du site strictement identique : tests/moteur-v3.test.js.
// Allume mais sortie du moteur inutilisable : AUCUN pari publie et une alerte
// (repli « aucun » par defaut, C1) ; l'ancien moteur seulement si
// MOTEUR_V3_REPLI=ancien est demande explicitement.
//
// Allume (MOTEUR_V3=1, MOTEUR_V3_SORTIE=<fichier ou dossier sortie/>) :
//  1. choisirPourFixture : le pari retenu du match vient du moteur v3 (son
//     pari publie, sinon sa selection « plus_sur » par defaut) au lieu de
//     lib/decision.js#pickMarketFair. Il est traduit en marche du site (id +
//     libelle que lib/resolvers.js sait regler) : l'historique et les regles
//     existantes le traitent comme n'importe quel pari.
//  2. completerMatch : probabilites publiees (p1/pn/p2/po25/btts/lambdas,
//     comparatif, scores probables) remplacees par celles du v3, champs
//     nouveaux ajoutes (fiabilite, voyant compo). JAMAIS ecrits vers le site
//     (avocat du diable, 29/09/2026, C4) : cote_minimum_a_jouer, eligible_vip,
//     avantage, valeur.
//  3. apresGel : apres la garde coup d'envoi et le gel (lib/pick-freeze.js),
//     remet d'aplomb un match dont le pari fige vient de l'ancien moteur et
//     applique l'interrupteur d'urgence du moteur.
// Les regles du site restent au-dessus : la garde coup d'envoi retire tout
// pari d'un match commence, le gel garde le pari deja publie jusqu'au coup
// d'envoi (meme s'il vient de l'ancien moteur), les champs premium sont
// retires des fichiers publics (lib/premium-fields.js liste les nouveaux).
//
// Journaux GitHub Actions publics : resume() ne donne que des compteurs,
// jamais un pari, une cote ou une probabilite (tests/pipeline-log-leak.test.js).

const fs = require("fs");
const path = require("path");
const { scoresConsistentWithMarket } = require("./decision.js");
// Matchs de selections nationales (decision de Clement du 30/09/2026) : jamais eligibles.
const SELECTIONS = require("./selections-nationales.js");
// Une seule source de chiffres (01/10/2026) : chance d'un marche et d'un buteur.
const CHANCE = require("./chance-iashark.js");
// Feux du mathematicien (04/10/2026) : premier buteur (verdicts-maths-temps.md c3).
const VERDICTS_MATHS = require("../config/verdicts-maths.json");

const CONFIG_PAR_DEFAUT_CHEMIN = path.join(__dirname, "..", "config", "moteur-v3.json");

// Champs premium ajoutes par le branchement (copies dans lib/premium-fields.js
// et supabase/functions/match-data/index.ts). v3_suivi suit les compositions et
// les cotes : il reste vivant apres le gel (lib/pick-freeze.js).
// v3_buteurs (01/10/2026) : les buteurs du moteur v3, seul calcul buteur affiche.
const CHAMPS_PREMIUM_V3 = ["v3_fiabilite", "v3_pari", "v3_marches", "v3_suivi", "v3_buteurs"];
// Champ public (amorce honnete : couverture, niveau de fiabilite, voyant compo).
const CHAMP_PUBLIC_V3 = "moteur_v3";

// Selections que le moteur peut ecrire (lues pour la confiance et les raisons
// d'un meme marche). Formule ACCEPTEE pour choisir le pari : « plus_sur »
// seulement (avocat du diable, 29/09/2026, C4 : « sure » et « valeur » retirees,
// la « valeur » a ete rejetee, CLV -5 %).
const FORMULES = ["plus_sur", "sure", "valeur"];
const FORMULES_ACCEPTEES = ["plus_sur"];
const VOYANTS = ["en attente", "compo confirmée", "à surveiller"];

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function arrondi(x, d) { const f = Math.pow(10, d == null ? 1 : d); return Math.round(x * f) / f; }
function pct(p) { const x = nombre(p); return x === null ? null : x * 100; }
function copie(v) { return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; }

// ---------------------------------------------------------------------------
// 1. CORRESPONDANCE DES MARCHES (cle du contrat -> marche du site)
//
// Le libelle (market) est celui du pipeline actuel : lib/resolvers.js le lit
// pour regler l'historique. Familles dont le format de cle est donne par le
// contrat : 1N2, DC, TOTAL, BTTS. Formats DEDUITS par analogie, a confirmer
// avec l'equipe moteur : DC:N2/DC:12, EQUIPE_DOM/EXT:plusX, MT_TOTAL:plusX,
// RB:1/RB:2. Toute autre famille (score exact, mi-temps/fin, handicap,
// corners, cartons, premier but, buteur) n'a pas encore de reglement cote
// site : un tel pari n'est pas affiche (raison MOTEUR_V3_MARCHE_NON_PRIS_EN_CHARGE).
const DIRECT = {
  "1N2:1": { id: "home-win", market: "Victoire Domicile" },
  "1N2:N": { id: "draw", market: "Match nul" },
  "1N2:2": { id: "away-win", market: "Victoire Exterieur" },
  "DC:1N": { id: "dc-1x", market: "DC 1X" },
  "DC:N2": { id: "dc-x2", market: "DC X2" },
  "DC:12": { id: "dc-12", market: "DC 12" },
  "BTTS:oui": { id: "btts-yes", market: "BTTS Oui" },
  "BTTS:non": { id: "btts-no", market: "BTTS Non" },
  "RB:1": { id: "dnb-home", market: "DNB Domicile" },
  "RB:2": { id: "dnb-away", market: "DNB Exterieur" },
};
function ligneId(l) { return String(l).replace(".", ""); } // 2.5 -> "25", 0.5 -> "05"
function ligneTexte(l) { return String(l); }

function cleVersSite(cle) {
  const c = String(cle || "").trim();
  if (Object.prototype.hasOwnProperty.call(DIRECT, c)) return Object.assign({}, DIRECT[c]);
  let m = /^TOTAL:(plus|moins)(\d+(?:\.\d+)?)$/.exec(c);
  if (m) {
    const plus = m[1] === "plus";
    return { id: (plus ? "over-" : "under-") + ligneId(m[2]), market: (plus ? "Over " : "Under ") + ligneTexte(m[2]) };
  }
  m = /^EQUIPE_(DOM|EXT):(plus|moins)(\d+(?:\.\d+)?)$/.exec(c);
  if (m) {
    const cote = m[1] === "DOM" ? "home" : "away";
    const nom = m[1] === "DOM" ? "Domicile" : "Exterieur";
    const plus = m[2] === "plus";
    const but = Number(m[3]) < 2 ? "but" : "buts";
    return { id: cote + "-team-" + (plus ? "over-" : "under-") + ligneId(m[3]), market: nom + (plus ? " plus de " : " moins de ") + ligneTexte(m[3]) + " " + but };
  }
  m = /^MT_TOTAL:(plus|moins)(\d+(?:\.\d+)?)$/.exec(c);
  if (m) {
    const plus = m[1] === "plus";
    const but = Number(m[2]) < 2 ? "but" : "buts";
    return { id: "fh-" + (plus ? "over-" : "under-") + ligneId(m[2]), market: "Premiere mi-temps " + (plus ? "plus de " : "moins de ") + ligneTexte(m[2]) + " " + but };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. LECTURE ET CONTROLE DE LA SORTIE DU MOTEUR

// Controle leger du contrat 1.1 (le schema machine contrat/sortie.schema.json
// annonce par le contrat n'existe pas encore dans le depot du moteur).
// -> liste d'erreurs (vide = conforme pour ce que le site utilise).
function validerSortie(sortie, config) {
  const err = [];
  const versions = (config && config.versions_contrat_acceptees) || ["1.1"];
  if (!estObjet(sortie)) return ["sortie : objet attendu"];
  if (versions.indexOf(String(sortie.contrat_version)) === -1) err.push("contrat_version non acceptee : " + sortie.contrat_version);
  if (typeof sortie.moteur_version !== "string" || !sortie.moteur_version) err.push("moteur_version manquant");
  if (!Number.isFinite(Date.parse(String(sortie.genere_le || "")))) err.push("genere_le illisible");
  if (typeof sortie.interrupteur_urgence !== "boolean") err.push("interrupteur_urgence : booleen attendu");
  if (!Array.isArray(sortie.matchs)) { err.push("matchs : liste attendue"); return err; }
  sortie.matchs.forEach(function (m, i) {
    const p = "matchs[" + i + "]";
    if (!estObjet(m)) { err.push(p + " : objet attendu"); return; }
    ["match_id", "date", "domicile", "exterieur", "ligue_code"].forEach(function (k) {
      if (typeof m[k] !== "string" || !m[k]) err.push(p + "." + k + " manquant");
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ""))) err.push(p + ".date : AAAA-MM-JJ attendu");
    // Contrat 1.1 (schema du moteur) : liens API-Football presents, null si non faits.
    ["api_football_fixture_id", "ids_api_football", "coup_envoi_utc", "probabilite_source"].forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) err.push(p + "." + k + " manquant (contrat 1.1)");
    });
    if (m.ids_api_football != null && (!estObjet(m.ids_api_football) || !Number.isInteger(m.ids_api_football.fixture))) err.push(p + ".ids_api_football.fixture : entier attendu");
    // Buts attendus du moteur (contrat 1.1) : obligatoires. Ce sont eux que la page,
    // la simulation 15 min et les videos utilisent ; jamais ceux de l'ancien moteur.
    const ba = m.buts_attendus;
    if (!estObjet(ba) || !(nombre(ba.domicile) > 0) || !(nombre(ba.exterieur) > 0)) err.push(p + ".buts_attendus : domicile et exterieur > 0 attendus");
    if (typeof m.eligible_vip !== "boolean") err.push(p + ".eligible_vip : booleen attendu");
    if (m.couverture === "données limitées" && m.eligible_vip === true) err.push(p + " : eligible_vip interdit en « données limitées »");
    if (!estObjet(m.fiabilite)) err.push(p + ".fiabilite manquant");
    if (!Array.isArray(m.marches)) err.push(p + ".marches : liste attendue");
    (m.marches || []).forEach(function (mk, j) {
      const q = p + ".marches[" + j + "]";
      if (!estObjet(mk) || typeof mk.cle !== "string") { err.push(q + ".cle manquant"); return; }
      const pr = nombre(mk.probabilite);
      if (pr === null || pr < 0 || pr > 1) err.push(q + ".probabilite hors 0-1");
      if (typeof mk.eligible_vip !== "boolean") err.push(q + ".eligible_vip : booleen attendu");
      if (m.couverture === "données limitées" && mk.eligible_vip === true) err.push(q + " : eligible_vip interdit en « données limitées »");
    });
    if (m.compositions != null) {
      if (!estObjet(m.compositions)) err.push(p + ".compositions : objet attendu");
      else if (m.compositions.voyant != null && VOYANTS.indexOf(m.compositions.voyant) === -1) err.push(p + ".compositions.voyant inconnu : " + m.compositions.voyant);
    }
    if (m.publication != null) {
      const pub = m.publication;
      if (!estObjet(pub) || typeof pub.cle !== "string") err.push(p + ".publication.cle manquant");
      else {
        const pp = nombre(pub.probabilite_publiee);
        if (pp === null || pp <= 0 || pp > 1) err.push(p + ".publication.probabilite_publiee hors 0-1");
        if (pub.cote_minimum_a_jouer != null && !(nombre(pub.cote_minimum_a_jouer) > 1)) err.push(p + ".publication.cote_minimum_a_jouer : > 1 attendu");
      }
    }
  });
  return err;
}

// chemin : un fichier sortie/AAAA-MM-JJ.json ou le dossier sortie/ (le plus
// recent est pris). -> { ok, sortie, fichier, raison, erreurs }.
function chargerSortie(chemin, opts) {
  opts = opts || {};
  const lire = opts.lireFichier || function (f) { return fs.readFileSync(f, "utf8"); };
  const config = opts.config || {};
  if (!chemin) return { ok: false, raison: "MOTEUR_V3_SORTIE non renseigne" };
  let fichier = chemin;
  try {
    if (!opts.lireFichier && fs.statSync(chemin).isDirectory()) {
      const jours = fs.readdirSync(chemin).filter(function (n) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(n); }).sort();
      if (!jours.length) return { ok: false, raison: "aucun fichier AAAA-MM-JJ.json dans " + chemin };
      fichier = path.join(chemin, jours[jours.length - 1]);
    }
  } catch (e) { return { ok: false, raison: "sortie introuvable : " + e.message }; }
  let sortie;
  try { sortie = JSON.parse(lire(fichier)); } catch (e) { return { ok: false, raison: "sortie illisible : " + e.message }; }
  const erreurs = validerSortie(sortie, config);
  if (erreurs.length) return { ok: false, raison: "sortie non conforme au contrat (" + erreurs.length + " erreur(s))", erreurs: erreurs, fichier: fichier };
  const nowMs = nombre(opts.nowMs) !== null ? nombre(opts.nowMs) : Date.now();
  const ageMax = nombre(config.age_max_heures) !== null ? nombre(config.age_max_heures) : 26;
  const ageH = (nowMs - Date.parse(sortie.genere_le)) / 3600000;
  if (ageH > ageMax) return { ok: false, raison: "sortie trop ancienne (" + Math.round(ageH) + " h > " + ageMax + " h)", fichier: fichier };
  if (ageH < -1) return { ok: false, raison: "sortie datee dans le futur", fichier: fichier };
  return { ok: true, sortie: sortie, fichier: fichier };
}

// ---------------------------------------------------------------------------
// 3. RETROUVER LE MATCH DU SITE DANS LA SORTIE DU MOTEUR
// Le moteur nomme les equipes comme football-data, le site comme API-Football
// (contrat section 6). Comparaison sans accents ni ponctuation ni sigles de
// club, plus la table config/moteur-v3.json#equipes pour les vrais ecarts.
const SIGLES = ["fc", "cf", "sc", "afc", "cd", "club", "ac", "as", "ssc", "sv", "vfb", "vfl", "tsg", "rc", "ud", "sd", "ca", "cp"];
function normaliserEquipe(nom) {
  const base = String(nom || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\./g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const mots = base.split(" ").filter(function (w) { return w && SIGLES.indexOf(w) === -1; });
  return (mots.length ? mots : base.split(" ")).join(" ");
}
function nomMoteur(nomSite, alias) {
  const a = alias || {};
  if (Object.prototype.hasOwnProperty.call(a, nomSite)) return a[nomSite];
  const n = normaliserEquipe(nomSite);
  const k = Object.keys(a).find(function (x) { return normaliserEquipe(x) === n; });
  return k ? a[k] : nomSite;
}
function dateParis(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? String(iso).slice(0, 10) : null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}
function ecartJours(a, b) {
  const x = Date.parse(a + "T00:00:00Z"), y = Date.parse(b + "T00:00:00Z");
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round(Math.abs(x - y) / 86400000) : Infinity;
}

function idFixtureMoteur(m) {
  const ids = m && estObjet(m.ids_api_football) ? m.ids_api_football : null;
  const v = ids && ids.fixture != null ? ids.fixture : (m ? m.api_football_fixture_id : null);
  return v != null && Number.isFinite(Number(v)) ? String(Number(v)) : null;
}

function indexerSortie(sortie) {
  const idx = {};
  const parFixture = {};
  ((sortie && sortie.matchs) || []).forEach(function (m) {
    const k = normaliserEquipe(m.domicile) + "|" + normaliserEquipe(m.exterieur);
    (idx[k] = idx[k] || []).push(m);
    const f = idFixtureMoteur(m);
    if (f) (parFixture[f] = parFixture[f] || []).push(m);
  });
  Object.defineProperty(idx, "__fixtures", { value: parFixture, enumerable: false });
  return idx;
}

// ctx : { kickoff (ISO du site), leagueId (API-Football), home, away }.
// -> { match, raison } ; match null si introuvable ou ambigu.
function trouverMatch(index, ctx, config) {
  config = config || {};
  // 1) Identifiant API-Football du match (contrat 1.1) : aucune table de noms.
  const parFixture = (index && index.__fixtures) || {};
  if (ctx.fixtureId != null && parFixture[String(ctx.fixtureId)]) {
    const liste = parFixture[String(ctx.fixtureId)];
    if (liste.length > 1) return { match: null, raison: "MOTEUR_V3_MATCH_AMBIGU" };
    const ids = liste[0].ids_api_football || {};
    // Garde-fou : equipes inversees ou autre match sous le meme numero -> refuse.
    if (ctx.homeId != null && ids.domicile != null && String(ids.domicile) !== String(ctx.homeId)) return { match: null, raison: "MOTEUR_V3_EQUIPES_DIFFERENTES" };
    if (ctx.awayId != null && ids.exterieur != null && String(ids.exterieur) !== String(ctx.awayId)) return { match: null, raison: "MOTEUR_V3_EQUIPES_DIFFERENTES" };
    return { match: liste[0], raison: null, par: "fixture" };
  }
  // 2) Sinon, noms football-data + table d'alias (moteur sans lien API-Football).
  const alias = config.equipes || {};
  const k = normaliserEquipe(nomMoteur(ctx.home, alias)) + "|" + normaliserEquipe(nomMoteur(ctx.away, alias));
  const jour = dateParis(ctx.kickoff);
  const ligueAttendue = ctx.leagueId != null && config.ligues ? config.ligues[String(ctx.leagueId)] || null : null;
  // Tolerance d'un jour : la date football-data est la date locale du match
  // (un match de MLS a 02:30 a Paris est la veille sur place).
  const candidats = (index[k] || []).filter(function (m) {
    if (ligueAttendue && m.ligue_code && m.ligue_code !== ligueAttendue) return false;
    return !jour || ecartJours(m.date, jour) <= 1;
  });
  if (!candidats.length) return { match: null, raison: "MOTEUR_V3_MATCH_INTROUVABLE" };
  const tries = candidats.slice().sort(function (a, b) { return ecartJours(a.date, jour) - ecartJours(b.date, jour); });
  if (tries.length > 1 && ecartJours(tries[0].date, jour) === ecartJours(tries[1].date, jour)) return { match: null, raison: "MOTEUR_V3_MATCH_AMBIGU" };
  // Un match que le moteur a relie a un AUTRE numero API-Football n'est jamais pris par son nom.
  if (ctx.fixtureId != null && idFixtureMoteur(tries[0]) && idFixtureMoteur(tries[0]) !== String(ctx.fixtureId)) return { match: null, raison: "MOTEUR_V3_MATCH_INTROUVABLE" };
  return { match: tries[0], raison: null, par: "noms" };
}

// ---------------------------------------------------------------------------
// 4. LE PARI DU MOTEUR, TRADUIT EN PARI DU SITE

function marcheParCle(v3, cle) {
  return ((v3 && v3.marches) || []).find(function (m) { return m && m.cle === cle; }) || null;
}

// Le pari publie par le moteur (fige de son cote) prime ; sinon la selection de
// la formule demandee (« plus_sur » par defaut, objectif n°1 du contrat).
function pariDuMoteur(v3, formule) {
  const pub = v3 && estObjet(v3.publication) && typeof v3.publication.cle === "string" ? v3.publication : null;
  if (pub) return { source: "publication", cle: pub.cle, probabilite: nombre(pub.probabilite_publiee), choix: pub };
  const sel = v3 && estObjet(v3.selections) ? v3.selections[formule] : null;
  if (estObjet(sel) && typeof sel.cle === "string") return { source: formule, cle: sel.cle, probabilite: nombre(sel.probabilite), choix: sel };
  return null;
}

const VERIFIE = "vérifié sur le passé";
function gardeFou(v3, pari) {
  const mk = marcheParCle(v3, pari.cle);
  if (!mk || mk.etiquette !== VERIFIE || mk.fiabilite_marche !== VERIFIE) return "MOTEUR_V3_MARCHE_NON_VERIFIE";
  if (mk.eligible_vip !== true || v3.eligible_vip !== true || pari.choix.eligible_vip === false) return "MOTEUR_V3_NON_ELIGIBLE";
  if (v3.couverture !== "vérifiée") return "MOTEUR_V3_NON_ELIGIBLE";
  // Confiance : portee par la selection du meme marche (la publication n'en a pas).
  const sels = estObjet(v3.selections) ? FORMULES.map(function (f) { return v3.selections[f]; }).filter(function (x) { return estObjet(x) && x.cle === pari.cle; }) : [];
  const confiance = typeof pari.choix.confiance === "string" ? pari.choix.confiance : (sels.length && typeof sels[0].confiance === "string" ? sels[0].confiance : null);
  if (confiance !== "normale") return "MOTEUR_V3_CONFIANCE_FAIBLE";
  return null;
}

// candidats : allMarketCandidates du pipeline ({id, market, cote, prob, marketProb}).
// -> { pickedMarket, downgrade, raison, detail }.
function choisirPari(v3, candidats, opts) {
  opts = opts || {};
  const formule = FORMULES_ACCEPTEES.indexOf(opts.formule) !== -1 ? opts.formule : "plus_sur";
  const pari = pariDuMoteur(v3, formule);
  if (!pari) return { pickedMarket: null, downgrade: null, raison: "MOTEUR_V3_AUCUN_PARI" };
  // GARDE-FOU DU SITE (avocat du diable, 28/09/2026 : le moteur 9425d40 publiait des
  // paris sur des marches non verifies, Colombie, Perou, double chance). Meme si le
  // moteur le publie, le site n'affiche un pari que si :
  //  - le marche est « vérifié sur le passé » (etiquette ET fiabilite_marche) ;
  //  - eligible_vip est vrai pour le marche, pour le pari et pour le match ;
  //  - la confiance du moteur est « normale » (H-017 : « faible » = 60-70 %, jamais publie).
  const refus = gardeFou(v3, pari);
  if (refus) return { pickedMarket: null, downgrade: null, raison: refus };
  const site = cleVersSite(pari.cle);
  if (!site) return { pickedMarket: null, downgrade: null, raison: "MOTEUR_V3_MARCHE_NON_PRIS_EN_CHARGE" };
  if (pari.probabilite === null || pari.probabilite <= 0 || pari.probabilite > 1) return { pickedMarket: null, downgrade: null, raison: "MOTEUR_V3_PROBABILITE_ILLISIBLE" };
  const cand = (candidats || []).find(function (c) { return c && c.id === site.id; }) || null;
  const marche = marcheParCle(v3, pari.cle);
  // Cote affichee et suivie dans l'historique : celle du site (bookmakers
  // API-Football, la meme que partout sur la page), sinon celle du moteur.
  const coteSite = cand ? nombre(cand.cote) : null;
  const coteMoteur = nombre(pari.choix.cote_disponible != null ? pari.choix.cote_disponible : marche && marche.cote_disponible);
  const cote = coteSite !== null && coteSite > 1 ? coteSite : (coteMoteur !== null && coteMoteur > 1 ? coteMoteur : null);
  // Les 3 raisons en clair : celles du pari, sinon celles de la selection du
  // meme marche (le contrat ne met pas de raisons dans la publication).
  const texte = function (l) { return Array.isArray(l) ? l.filter(function (r) { return typeof r === "string" && r.trim(); }) : []; };
  let raisons = texte(pari.choix.raisons);
  if (!raisons.length && v3 && estObjet(v3.selections)) {
    FORMULES.some(function (f) { const s = v3.selections[f]; if (estObjet(s) && s.cle === pari.cle && texte(s.raisons).length) { raisons = texte(s.raisons); return true; } return false; });
  }
  const pickedMarket = {
    id: site.id,
    market: site.market,
    label: site.market,
    cote: cote,
    prob: pari.probabilite * 100,
    marketProb: cand && nombre(cand.marketProb) !== null ? nombre(cand.marketProb) : null,
    fairProb: null,
    why: raisons[0] || null,
    moteur: "v3",
  };
  return { pickedMarket: pickedMarket, downgrade: cote === null ? "NO_ODDS" : null, raison: null, detail: { source: pari.source, cle: pari.cle, site: site, marche: marche, choix: pari.choix, raisons: raisons } };
}

// ---------------------------------------------------------------------------
// 5. CHAMPS DU MATCH

function probabilitesSite(v3) {
  const out = {};
  const p = function (cle) { const m = marcheParCle(v3, cle); return m ? pct(m.probabilite) : null; };
  const pose = function (k, v) { if (v !== null && v !== undefined && Number.isFinite(v)) out[k] = v; };
  pose("p1", p("1N2:1")); pose("pn", p("1N2:N")); pose("p2", p("1N2:2"));
  pose("po15", p("TOTAL:plus1.5")); pose("po25", p("TOTAL:plus2.5")); pose("btts", p("BTTS:oui"));
  const ba = estObjet(v3 && v3.buts_attendus) ? v3.buts_attendus : {};
  pose("lambda_h", nombre(ba.domicile)); pose("lambda_a", nombre(ba.exterieur));
  return out;
}

function marchesV3(v3) {
  return ((v3 && v3.marches) || []).map(function (m) {
    const site = cleVersSite(m.cle);
    return {
      cle: m.cle, market_id: site ? site.id : null, famille: m.famille || null, libelle_fr: m.libelle_fr || null,
      probabilite: pct(m.probabilite) !== null ? arrondi(pct(m.probabilite), 1) : null,
      cote_juste: nombre(m.cote_juste), cote_disponible: nombre(m.cote_disponible),
      fiabilite_marche: m.fiabilite_marche || null,
      etiquette: m.etiquette || null,
      // C4 (avocat du diable, 29/09/2026) : valeur, avantage et eligible_vip ne
      // sortent jamais du moteur vers le site (ni page, ni data.json, ni Supabase).
    };
  });
}

// Comparatif (premium) : meme forme que le pipeline ({id, market, probability,
// consensus, edge}). La probabilite vient du moteur v3 ; la reference marche
// (consensus, cote sans marge) reste celle calculee par le site. Une ligne que
// le moteur ne chiffre pas est retiree (jamais deux moteurs dans un tableau).
function comparatifV3(comparatif, v3, pickedMarket) {
  const parId = {};
  ((v3 && v3.marches) || []).forEach(function (m) { const s = cleVersSite(m.cle); if (s && pct(m.probabilite) !== null) parId[s.id] = { p: pct(m.probabilite), market: s.market }; });
  const out = [];
  (comparatif || []).forEach(function (l) {
    const v = l && parId[l.id];
    if (!v) return;
    const prob = arrondi(v.p, 1);
    const ref = nombre(l.consensus);
    out.push({ id: l.id, market: l.market, probability: prob, consensus: ref, edge: ref !== null ? arrondi(prob - ref, 1) : null });
  });
  if (pickedMarket && !out.some(function (l) { return l.id === pickedMarket.id; }) && parId[pickedMarket.id]) {
    out.unshift({ id: pickedMarket.id, market: pickedMarket.market, probability: arrondi(parId[pickedMarket.id].p, 1), consensus: null, edge: null });
  }
  if (pickedMarket) out.sort(function (a, b) { return (b.id === pickedMarket.id ? 1 : 0) - (a.id === pickedMarket.id ? 1 : 0); });
  return out.slice(0, 8);
}

function scoresV3(v3, marketId) {
  const liste = ((v3 && v3.marches) || [])
    .filter(function (m) { return m && /^SCORE:\d+-\d+$/.test(m.cle) && pct(m.probabilite) !== null; })
    .map(function (m) { return { score: m.cle.slice(6), n: null, pct: Math.round(pct(m.probabilite)) }; })
    .sort(function (a, b) { return b.pct - a.pct; });
  return scoresConsistentWithMarket(liste, marketId || null, 3);
}

function suiviV3(v3) {
  const compo = estObjet(v3 && v3.compositions) ? v3.compositions : {};
  const pub = estObjet(v3 && v3.publication) ? v3.publication : {};
  const maj = Array.isArray(pub.mises_a_jour) ? pub.mises_a_jour.filter(estObjet) : [];
  const derniere = maj.length ? maj[maj.length - 1] : null;
  const derniereCote = maj.filter(function (u) { return u.type === "cote"; }).pop() || null;
  return {
    cle: typeof pub.cle === "string" ? pub.cle : null,
    voyant: compo.voyant || "en attente",
    compo_mise_a_jour_le: compo.mis_a_jour_le || null,
    absents: Array.isArray(compo.absents) ? compo.absents.length : 0,
    probabilite_information: derniere && nombre(derniere.probabilite_information) !== null ? arrondi(nombre(derniere.probabilite_information) * 100, 1) : null,
    cote_observee: derniereCote ? nombre(derniereCote.cote_observee) : null,
    alerte_cote: derniereCote ? (derniereCote.alerte || null) : null,
    heure: derniere ? (derniere.heure || null) : null,
  };
}

// BUTEURS (une seule source, 01/10/2026) : le calcul buteur du moteur v3 (p_marque,
// contrat 1.1 §5 bis) est le SEUL affiche, sur la page match, l'accueil Pro et le
// Canal Pro. Titulaires probables seulement, chance arrondie vers le bas a 5 points,
// plafonnee a 45 %, rien sous 10 % (lib/chance-iashark.js#chanceButeur, la meme regle
// que canal-pro-menu.mjs). cote : « home » / « away » (equipe du moteur = domicile ou
// exterieur de SON match). Au plus 6 joueurs par equipe, du plus probable au moins probable.
function buteursV3(v3) {
  const dom = v3 && v3.domicile, ext = v3 && v3.exterieur;
  const out = [];
  ((v3 && v3.buteurs) || []).forEach(function (b) {
    if (!estObjet(b) || b.statut !== "titulaire probable" || typeof b.joueur !== "string" || !b.joueur.trim()) return;
    const cote = b.equipe === dom ? "home" : b.equipe === ext ? "away" : null;
    const p = nombre(b.p_marque);
    const chance = CHANCE.chanceButeur(p);
    if (!cote || chance === null) return;
    out.push({ joueur_id: Number.isInteger(Number(b.joueur_id)) && b.joueur_id !== null ? Number(b.joueur_id) : null, joueur: b.joueur.trim(), cote: cote, poste: b.poste || null, p_marque: arrondi(p, 4), chance: chance });
  });
  out.sort(function (a, b) { return b.p_marque - a.p_marque || a.joueur.localeCompare(b.joueur); });
  const parCote = { home: 0, away: 0 };
  return out.filter(function (b) { parCote[b.cote]++; return parCote[b.cote] <= 6; });
}

// PREMIER BUTEUR (04/10/2026, verdicts-maths-temps.md c3 : GO avec condition) : la chance
// d'ouvrir le score (p_premier_buteur du moteur v3, contrat 1.1 §5 bis) des 3 joueurs les plus
// probables, titulaires probables seulement (jamais un absent annonce), en % ENTIER (pas
// l'arrondi a 5 points des buteurs « a tout moment » : sous 15 % il effacerait l'information).
// Toujours une chance, jamais « il marquera le premier ». Champ Pro seulement
// (v3_premiers_buteurs), vivant comme v3_buteurs (suit les compositions, lib/pick-freeze.js).
// Seulement en couverture « vérifiée », dans un des 12 championnats mesures du v3
// (config/verdicts-maths.json#perimetre_v3.ligues ; controle du mathematicien du 04/10/2026,
// point 1 : jamais une selection ni une coupe) et avec le feu vert du mathematicien
// (config/verdicts-maths.json#match.premier_buteur). opts.ligue : league_key du match du site
// (OBLIGATOIRE : sans elle, rien).
const NB_PREMIERS_BUTEURS = 3;
function premiersButeursV3(v3, opts) {
  if (!v3 || v3.couverture !== "vérifiée") return [];
  const ligues = VERDICTS_MATHS.perimetre_v3 && Array.isArray(VERDICTS_MATHS.perimetre_v3.ligues) ? VERDICTS_MATHS.perimetre_v3.ligues.map(String) : [];
  if (!opts || ligues.indexOf(String(opts.ligue || "")) === -1) return [];
  const dom = v3.domicile, ext = v3.exterieur;
  const out = [];
  ((v3 && v3.buteurs) || []).forEach(function (b) {
    if (!estObjet(b) || b.statut !== "titulaire probable" || typeof b.joueur !== "string" || !b.joueur.trim()) return;
    const cote = b.equipe === dom ? "home" : b.equipe === ext ? "away" : null;
    const p = nombre(b.p_premier_buteur);
    if (!cote || p === null || !(p > 0) || p >= 1) return;
    const chance = Math.round(Number((p * 100).toPrecision(12)));
    if (chance < 1) return;
    out.push({ joueur_id: Number.isInteger(Number(b.joueur_id)) && b.joueur_id !== null ? Number(b.joueur_id) : null, joueur: b.joueur.trim(), cote: cote, poste: b.poste || null, p_premier_buteur: arrondi(p, 4), chance: chance });
  });
  out.sort(function (a, b) { return b.p_premier_buteur - a.p_premier_buteur || a.joueur.localeCompare(b.joueur); });
  return out.slice(0, NB_PREMIERS_BUTEURS);
}

// Version rapide (decision du 28/09) : la fiabilite du moteur v3 passe dans le
// champ reliability deja affiche par la page (lib/insights.js#reliabilityInfo :
// libelle Elevee / Moyenne / Faible). H-016 : le score 0-100 du moteur est un
// usage INTERNE, jamais affiche ni utilise pour le libelle. Le libelle vient de la
// verification sur le passe et de la confiance du moteur :
//  - competition verifiee et confiance normale -> « Élevée » ;
//  - competition verifiee, confiance faible ou inconnue -> « Moyenne » ;
//  - donnees limitees (non verifie sur le passe) -> « Faible ».
function reliabilityV3(v3, ancienne) {
  const f = estObjet(v3 && v3.fiabilite) ? v3.fiabilite : {};
  const verifie = v3 && v3.couverture === "vérifiée" && f.niveau === VERIFIE;
  const ps = v3 && estObjet(v3.selections) && estObjet(v3.selections.plus_sur) ? v3.selections.plus_sur : null;
  const label = !verifie ? "Faible" : (ps && ps.confiance === "normale" ? "Élevée" : "Moyenne");
  const base = estObjet(ancienne) ? ancienne : {};
  return {
    label: label,
    model_agreement: base.model_agreement != null ? base.model_agreement : null,
    data_quality: base.data_quality != null ? base.data_quality : null,
    sample_size: base.sample_size != null ? base.sample_size : null,
    sample_size_label: base.sample_size_label != null ? base.sample_size_label : null,
    historical_calibration: verifie ? "VERIFIED_ON_PAST" : "NOT_AVAILABLE_YET",
    source: "moteur_v3",
    methode: f.methode || null,
  };
}

// ORIGINE DU CHIFFRE (condition 1 du mathematicien et de l'avocat du diable,
// 30/09/2026). Contrat §8 : dans les championnats europeens avec cote d'avant-match,
// la probabilite melange le modele et la cote sans marge (« modèle + cotes ») ;
// ailleurs (MLS, Mexique, Argentine, Suede, Japon, coupes, selections, ligues sans
// cote), le moteur calcule seul (« modèle seul »). Sur 549 paris jamais vus ou le
// modele seul depassait la cote sans marge : 77,0 % annonces, 69,6 % passes. La page
// et le canal lisent ce champ public pour ne jamais annoncer « Sur 100 matchs… » ni
// « +X points » dans ce cas. Source absente ou inconnue : « modèle seul » (prudence).
const ORIGINE_AVEC_COTES = "modèle + cotes";
const ORIGINE_MODELE_SEUL = "modèle seul";
function origineProbabilite(v3) {
  const src = v3 && typeof v3.probabilite_source === "string" ? v3.probabilite_source : "";
  return /cote/i.test(src) && !/seul/i.test(src) ? ORIGINE_AVEC_COTES : ORIGINE_MODELE_SEUL;
}

function publicV3(sortie, v3, source, raison) {
  const out = { version_contrat: String(sortie && sortie.contrat_version || ""), version_moteur: String(sortie && sortie.moteur_version || ""), source: source };
  if (raison) out.raison = raison;
  if (v3) {
    out.origine_probabilite = origineProbabilite(v3);
    out.couverture = v3.couverture || null;
    out.fiabilite_niveau = estObjet(v3.fiabilite) ? (v3.fiabilite.niveau || null) : null;
    const compo = estObjet(v3.compositions) ? v3.compositions : {};
    out.compo = { voyant: compo.voyant || "en attente", mis_a_jour_le: compo.mis_a_jour_le || null };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. LA FACADE APPELEE PAR LE PIPELINE

function inactif(raison) {
  return {
    actif: false,
    raison: raison || "MOTEUR_V3 eteint",
    choisirPourFixture: function () { return { remplace: false }; },
    completerMatch: function () {},
    apresGel: function () { return {}; },
    idsMoteurV3: function () { return {}; },
    comparaison: function () { return []; },
    donneesTexte: function (d) { return d; },
    alerteLiaison: function () { return null; },
    chancesPourCanal: function () { return {}; },
    resume: function () { return "moteur v3 eteint (" + (raison || "MOTEUR_V3 different de 1") + ")"; },
  };
}

function repliDe(env) { return env && env.MOTEUR_V3_REPLI === "ancien" ? "ancien" : "aucun"; }

// Message d'alerte en clair pour le proprietaire (journal du run en ::error,
// fichier MOTEUR_V3_ALERTE lu par l'etape « Alerte moteur v3 », qui met le run
// au rouge : GitHub envoie alors son e-mail d'echec). Jamais un pari ni une cote.
function alerteEchec(raison, repli) {
  return "Moteur v3 indisponible ce run (" + raison + "). " +
    (repli === "ancien" ? "MOTEUR_V3_REPLI=ancien : l'ancien moteur publie a sa place." : "Aucun nouveau pari publie aujourd'hui (les paris deja publies restent affiches jusqu'au coup d'envoi).");
}

// MOTEUR_V3=1 mais sortie du moteur inutilisable, repli « aucun » (defaut) :
// le run continue (pages, resultats, historique) mais AUCUN nouveau pari n'est
// publie, ni par l'ancien moteur ni par la SAFE_PICK canonique. Les paris deja
// publies (gel) restent affiches jusqu'au coup d'envoi.
function enEchec(raison, charge) {
  const RAISON = "MOTEUR_V3_INDISPONIBLE";
  let traites = 0;
  return {
    actif: true,
    echec: charge || { ok: false, raison: raison },
    raison: raison,
    repli: "aucun",
    alerte: alerteEchec(raison, "aucun"),
    choisirPourFixture: function () { traites++; return { remplace: true, pickedMarket: null, downgrade: null, raison: RAISON }; },
    completerMatch: function (matchObj) {
      if (!matchObj) return;
      matchObj[CHAMP_PUBLIC_V3] = { version_contrat: "", version_moteur: "", source: "aucun pari (moteur v3 indisponible)", raison: RAISON };
    },
    apresGel: function (matchs) {
      const ids = {};
      (matchs || []).forEach(function (m) { if (m && m.id != null) ids[String(m.id)] = true; });
      return ids;
    },
    idsMoteurV3: function () { return {}; },
    comparaison: function () { return []; },
    // Panne du v3 (2e contre-controle de l'avocat du diable, 30/09/2026) : aucun
    // match n'a de pari ce jour-la, et la vraie raison n'est pas « historique
    // insuffisant ». sans_pari_v3 + v3_indisponible choisissent la consigne neutre
    // de genAnalyse, qui n'avance AUCUNE raison.
    donneesTexte: function (d) { return d ? Object.assign({}, d, { sans_pari_v3: true, v3_indisponible: true }) : d; },
    alerteLiaison: function () { return null; },
    chancesPourCanal: function () { return {}; },
    resume: function () { return "moteur v3 INDISPONIBLE (" + raison + ") : aucun nouveau pari publie, " + traites + " match(s) sans pari"; },
  };
}

// opts : { env, config, lireFichier, nowMs }.
function creerBranchement(opts) {
  opts = opts || {};
  const env = opts.env || {};
  if (String(env.MOTEUR_V3 || "") !== "1") return inactif();
  let config = opts.config;
  if (!config) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_PAR_DEFAUT_CHEMIN, "utf8")); }
    catch (e) {
      const raison = "config/moteur-v3.json illisible : " + e.message;
      if (repliDe(env) === "ancien") { const b = inactif(raison); b.alerte = alerteEchec(raison, "ancien"); return b; }
      return enEchec(raison, null);
    }
  }
  const charge = chargerSortie(env.MOTEUR_V3_SORTIE, { config: config, lireFichier: opts.lireFichier, nowMs: opts.nowMs });
  // Sortie absente, illisible, non conforme ou perimee (etape Python en echec) :
  // AUCUN pari publie ce run et une alerte pour le proprietaire (C1). L'ancien
  // moteur ne reprend la main que si MOTEUR_V3_REPLI=ancien est demande.
  if (!charge.ok) {
    if (repliDe(env) === "ancien") { const b = inactif(charge.raison); b.echec = charge; b.alerte = alerteEchec(charge.raison, "ancien"); return b; }
    return enEchec(charge.raison, charge);
  }
  const sortie = charge.sortie;
  const index = indexerSortie(sortie);
  const formule = FORMULES_ACCEPTEES.indexOf(env.MOTEUR_V3_FORMULE) !== -1 ? env.MOTEUR_V3_FORMULE : (FORMULES_ACCEPTEES.indexOf(config.formule_par_defaut) !== -1 ? config.formule_par_defaut : "plus_sur");
  // Match du site absent de la sortie : "aucun" (DEFAUT depuis le 29/09/2026,
  // avocat du diable C1) le publie sans pari ; "ancien" (a demander
  // explicitement) garde l'ancien moteur pour ce match.
  const repli = repliDe(env);
  const urgence = sortie.interrupteur_urgence === true;
  const parFixture = {};
  const comparaisons = {};
  // Chance IASHARK de chaque marche 1N2 / double chance du v3, par match (Canal Pro) :
  // meme regle et meme cote sans marge que le pari de la page (lib/chance-iashark.js).
  const chancesMarches = {};
  const compteurs = {};
  const resumePari = function (p) { return p ? { market_id: p.id || null, pari: p.market || null, probabilite: nombre(p.prob) !== null ? arrondi(nombre(p.prob), 1) : null, cote: nombre(p.cote) } : null; };
  const compte = function (k) { compteurs[k] = (compteurs[k] || 0) + 1; };

  function choisirPourFixture(ctx) {
    ctx = ctx || {};
    const cle = String(ctx.fixtureId);
    const trouve = trouverMatch(index, ctx, config);
    comparaisons[cle] = { fixture_id: ctx.fixtureId, match: (ctx.home || "") + " - " + (ctx.away || ""), coup_envoi: ctx.kickoff || null, ancien: resumePari(ctx.ancien), nouveau: null, raison: null, lien: trouve.par || null };
    // SELECTIONS NATIONALES (decision de Clement du 30/09/2026, modele des selections
    // ORANGE chez le mathematicien) : eligible_vip = false a la selection du site, donc
    // aucun pari publie, ni du moteur v3 ni de l'ancien moteur (ni VIP, ni Canal Pro, ni
    // match offert). Les probabilites du moteur restent affichees, sans y toucher.
    // opts.selectionsNationalesEligibles : seulement pour les anciens tests bases sur la sortie
    // d'exemple du contrat (Ligue des nations) ; le pipeline ne le passe jamais.
    if (opts.selectionsNationalesEligibles !== true && SELECTIONS.estSelectionNationale({ league_id: ctx.leagueId, league: ctx.league })) {
      const raisonSel = "MOTEUR_V3_SELECTION_NATIONALE";
      compte(raisonSel);
      parFixture[cle] = trouve.match ? { source: "v3", v3: trouve.match, choix: { pickedMarket: null, downgrade: null, raison: raisonSel }, raison: raisonSel, selection: true } : { source: "aucun", raison: raisonSel, selection: true };
      comparaisons[cle].raison = raisonSel;
      return { remplace: true, pickedMarket: null, downgrade: null, raison: raisonSel };
    }
    if (!trouve.match) {
      compte(trouve.raison);
      parFixture[cle] = { source: repli === "aucun" ? "aucun" : "ancien", raison: trouve.raison };
      comparaisons[cle].raison = trouve.raison;
      return repli === "aucun" ? { remplace: true, pickedMarket: null, downgrade: null, raison: trouve.raison } : { remplace: false, raison: trouve.raison };
    }
    const v3 = trouve.match;
    if (urgence) {
      compte("MOTEUR_V3_URGENCE");
      parFixture[cle] = { source: "v3", v3: v3, raison: "MOTEUR_V3_URGENCE", urgence: true };
      comparaisons[cle].raison = "MOTEUR_V3_URGENCE";
      return { remplace: true, pickedMarket: null, downgrade: null, raison: "MOTEUR_V3_URGENCE" };
    }
    const choix = choisirPari(v3, ctx.candidats, { formule: formule });
    compte(choix.pickedMarket ? "V3_PARI" : choix.raison);
    parFixture[cle] = { source: "v3", v3: v3, choix: choix, raison: choix.raison };
    comparaisons[cle].nouveau = resumePari(choix.pickedMarket);
    comparaisons[cle].raison = choix.raison;
    comparaisons[cle].fiabilite_v3 = estObjet(v3.fiabilite) ? { score_interne: nombre(v3.fiabilite.score), niveau: v3.fiabilite.niveau || null } : null;
    comparaisons[cle].plus_sur_moteur = estObjet(v3.selections) && estObjet(v3.selections.plus_sur) ? { cle: v3.selections.plus_sur.cle, probabilite: nombre(v3.selections.plus_sur.probabilite), confiance: v3.selections.plus_sur.confiance || null, eligible_vip: v3.selections.plus_sur.eligible_vip === true } : null;
    comparaisons[cle].publication_moteur = estObjet(v3.publication) ? v3.publication.cle : null;
    comparaisons[cle].couverture = v3.couverture || null;
    return { remplace: true, pickedMarket: choix.pickedMarket, downgrade: choix.downgrade, raison: choix.raison };
  }

  // A appeler juste apres la construction de matchObj et de sa ligne premium
  // (avant la garde coup d'envoi, qui peut encore tout retirer).
  // extra.consensusDe(id du site) : la cote sans marge du marche, calculee par le pipeline
  // (la meme que la colonne consensus de markets_compared) ; sert a la chance IASHARK de
  // chaque marche 1N2 / double chance pour le Canal Pro (chancesPourCanal).
  function completerMatch(matchObj, premiumRow, fixtureId, extra) {
    if (!matchObj) return;
    const etat = parFixture[String(fixtureId != null ? fixtureId : matchObj.id)];
    if (!etat) return;
    if (etat.selection) marquerSelection(matchObj, premiumRow);
    if (etat.source !== "v3") { matchObj[CHAMP_PUBLIC_V3] = publicV3(sortie, null, etat.source === "aucun" ? "aucun pari (match absent du moteur)" : "ancien moteur (repli)", etat.raison); return; }
    const v3 = etat.v3;
    matchObj[CHAMP_PUBLIC_V3] = publicV3(sortie, v3, "v3", etat.raison);
    if (etat.urgence) return;
    const cmp = comparaisons[String(fixtureId != null ? fixtureId : matchObj.id)];
    if (cmp) {
      const pr = function (o) { return { p1: nombre(o.p1), pn: nombre(o.pn), p2: nombre(o.p2), po25: nombre(o.po25), btts: nombre(o.btts), lambda_h: nombre(o.lambda_h), lambda_a: nombre(o.lambda_a) }; };
      cmp.probabilites_ancien = pr(matchObj);
      cmp.probabilites_nouveau = pr(Object.assign({}, matchObj, probabilitesSite(v3)));
      cmp.fiabilite_ancien = estObjet(matchObj.reliability) ? matchObj.reliability.label || null : null;
    }
    Object.assign(matchObj, probabilitesSite(v3));
    // Fiabilite du moteur v3 dans le champ deja affiche (avec ou sans pari : jamais
    // la fiabilite de l'ancien moteur a cote des probabilites du nouveau).
    matchObj.reliability = reliabilityV3(v3, matchObj.reliability);
    if (cmp) cmp.fiabilite_nouveau = matchObj.reliability && matchObj.reliability.label;
    const pm = etat.choix && etat.choix.pickedMarket;
    const fiab = estObjet(v3.fiabilite) ? v3.fiabilite : {};
    // C4 : eligible_vip reste interne au garde-fou (gardeFou), jamais ecrit.
    matchObj.v3_fiabilite = { niveau: fiab.niveau || null, methode: fiab.methode || null, couverture: v3.couverture || null };
    // Selection « la plus sure » du moteur, PUBLIEE OU NON sur le site (premium,
    // dans v3_fiabilite) : sert a choisir le match des videos du jour (decision de
    // Clement du 29/09/2026 : le match dont le v3 est le plus sur). Probabilite en %.
    const ps = estObjet(v3.selections) && estObjet(v3.selections.plus_sur) && typeof v3.selections.plus_sur.cle === "string" ? v3.selections.plus_sur : null;
    const psProba = ps ? pct(ps.probabilite) : null;
    if (ps && psProba !== null && psProba > 0 && psProba <= 100) matchObj.v3_fiabilite.plus_sur = { cle: ps.cle, probabilite: arrondi(psProba, 1) };
    matchObj.v3_marches = marchesV3(v3);
    matchObj.v3_suivi = suiviV3(v3);
    const buteurs = buteursV3(v3);
    if (buteurs.length) matchObj.v3_buteurs = buteurs; else delete matchObj.v3_buteurs;
    const premiers = VERDICTS_MATHS.match && VERDICTS_MATHS.match.premier_buteur === "GO" ? premiersButeursV3(v3, { ligue: matchObj.league_key }) : [];
    if (premiers.length) matchObj.v3_premiers_buteurs = premiers; else delete matchObj.v3_premiers_buteurs;
    const consensusDe = extra && typeof extra.consensusDe === "function" ? extra.consensusDe : null;
    const cm = {};
    (v3.marches || []).forEach(function (mk) {
      if (!mk || !/^(1N2|DC):/.test(String(mk.cle))) return;
      const site = cleVersSite(mk.cle);
      const p = pct(mk.probabilite);
      if (!site || p === null) return;
      const c = CHANCE.chanceIashark(p, consensusDe ? consensusDe(site.id) : null);
      if (c) cm[mk.cle] = { market_id: site.id, chance: c.chance, source: c.source, modele: p };
    });
    chancesMarches[String(fixtureId != null ? fixtureId : matchObj.id)] = cm;
    const scores = scoresV3(v3, pm && pm.id);
    if (scores.length) { matchObj.mc_scores = scores; matchObj.simulation_count = null; }
    const comparatif = comparatifV3(matchObj.markets_compared, v3, pm);
    matchObj.markets_compared = comparatif;
    if (premiumRow && typeof premiumRow === "object") premiumRow.markets_compared = comparatif;
    if (pm) {
      const d = etat.choix.detail;
      const mk = d.marche || {};
      matchObj.model_output_available = true;
      matchObj.v3_pari = {
        cle: d.cle, market_id: pm.id, formule: d.source, libelle_fr: d.choix.libelle_fr || mk.libelle_fr || null,
        probabilite: arrondi(pm.prob, 1),
        cote_juste: nombre(d.choix.cote_juste != null ? d.choix.cote_juste : mk.cote_juste),
        // C4 (avocat du diable, 29/09/2026) : ni cote_minimum_a_jouer, ni
        // eligible_vip, ni avantage, ni valeur dans ce qui part vers le site.
        fiabilite_marche: mk.fiabilite_marche || null,
        etiquette: d.choix.etiquette || mk.etiquette || null,
        raisons: d.raisons.slice(0, 3),
        publie_le: d.source === "publication" ? (d.choix.publie_le || null) : null,
        empreinte: d.source === "publication" ? (d.choix.empreinte || null) : (v3.empreinte || null),
      };
      // Textes : les 3 raisons en clair du moteur ouvrent les facteurs de decision.
      if (d.raisons.length) matchObj.decision_factors = d.raisons.slice(0, 3);
    }
    if (etat.selection) marquerSelection(matchObj, premiumRow);
  }

  // Selection nationale : « Fiabilité : en test » (champ public league_reliability, meme
  // valeur que lib/league-scope.js), jamais « vérifié sur le passé », seulement le 1N2 et
  // la double chance dans le comparatif. Aucune probabilite n'est modifiee.
  function marquerSelection(matchObj, premiumRow) {
    matchObj.league_reliability = "en_test";
    const base = estObjet(matchObj.reliability) ? matchObj.reliability : {};
    matchObj.reliability = Object.assign({}, base, { label: "En test", historical_calibration: "NOT_AVAILABLE_YET" });
    if (estObjet(matchObj[CHAMP_PUBLIC_V3])) matchObj[CHAMP_PUBLIC_V3].fiabilite_niveau = null;
    if (estObjet(matchObj.v3_fiabilite)) matchObj.v3_fiabilite.niveau = null;
    delete matchObj.v3_marches;
    const garde = function (liste) { return liste.filter(function (c) { return c && SELECTIONS.marcheAutorise(c.id); }); };
    if (Array.isArray(matchObj.markets_compared)) matchObj.markets_compared = garde(matchObj.markets_compared);
    if (premiumRow && typeof premiumRow === "object" && Array.isArray(premiumRow.markets_compared)) premiumRow.markets_compared = garde(premiumRow.markets_compared);
  }

  // Apres la garde coup d'envoi (second passage) et le gel. deps :
  // { closeMatchForPick, premiumFields }. -> { "<id>": true } des matchs
  // dont le pari vient du moteur v3 (exclus de la SAFE_PICK canonique).
  function apresGel(matchs, premiumRows, deps) {
    deps = deps || {};
    const ids = {};
    (matchs || []).forEach(function (m) {
      if (!m || m.id == null) return;
      const etat = parFixture[String(m.id)];
      if (!etat || etat.source === "ancien") return;
      // Match absent du moteur, publie sans pari (repli « aucun ») : jamais de
      // pari de l'ancien moteur par la SAFE_PICK canonique non plus (C1).
      ids[String(m.id)] = true;
      if (etat.source !== "v3") return;
      if (etat.urgence) {
        // Interrupteur d'urgence du moteur : aucun pari, meme fige.
        if (m.pari_rec || m.no_signal !== true) {
          const row = (premiumRows || []).find(function (r) { return r && String(r.fixture_id) === String(m.id); }) || null;
          if (typeof deps.closeMatchForPick === "function") deps.closeMatchForPick(m, row, deps.premiumFields || [], "MOTEUR_V3_URGENCE");
          m.no_signal_label = "Analyse momentanément suspendue";
        }
        return;
      }
      // Pari fige publie AVANT le branchement (ancien moteur) : il reste tel
      // quel jusqu'au coup d'envoi ; aucun champ v3 ne doit le decrire.
      const pariV3 = m.v3_pari && m.market_id === m.v3_pari.market_id && m.pari_rec;
      if (!pariV3) {
        delete m.v3_pari;
        delete m.v3_suivi;
        if (m.pari_rec && m[CHAMP_PUBLIC_V3]) m[CHAMP_PUBLIC_V3].source = "ancien moteur (pari fige avant le branchement)";
        return;
      }
      // Suivi (vivant) d'un autre pari que celui qui est fige et affiche : on
      // ne garde que le voyant de composition, jamais une alerte de cote qui
      // parlerait d'un autre marche.
      if (m.v3_suivi && m.v3_suivi.cle && m.v3_suivi.cle !== m.v3_pari.cle) {
        m.v3_suivi = { cle: null, voyant: m.v3_suivi.voyant, compo_mise_a_jour_le: m.v3_suivi.compo_mise_a_jour_le, absents: m.v3_suivi.absents, probabilite_information: null, cote_observee: null, alerte_cote: null, heure: null };
      }
    });
    return ids;
  }

  // TEXTE D'ANALYSE (avocat du diable, 2e revue, point A) : appele au debut de
  // genAnalyse. Match dont le pari vient du moteur v3 : les chiffres donnes au texte
  // sont ceux du v3 (probabilites, buts attendus, scores, marches) ; jamais ceux de
  // l'ancien moteur, qui sont remplaces sur la page juste apres. Autres matchs : inchange.
  function donneesTexte(d) {
    if (!d || d.fixtureId == null) return d;
    const etat = parFixture[String(d.fixtureId)];
    // Aucun pari v3 sur ce match (absent du moteur, aucune selection publiable,
    // interrupteur d'urgence) : le texte ne doit inventer AUCUNE raison
    // (contre-controle de l'avocat du diable, 30/09/2026). sans_pari_v3 choisit
    // la consigne neutre de genAnalyse.
    const sansPari = !!etat && etat.source !== "ancien" && (etat.source !== "v3" || etat.urgence || !(etat.choix && etat.choix.pickedMarket));
    if (!etat || etat.source !== "v3" || etat.urgence) return sansPari ? Object.assign({}, d, { sans_pari_v3: true }) : d;
    const v3 = etat.v3;
    const pr = probabilitesSite(v3);
    const r1 = function (x) { return x === null || x === undefined ? null : arrondi(x, 1); };
    const out = Object.assign({}, d, sansPari ? { moteur_texte: "v3", sans_pari_v3: true } : { moteur_texte: "v3" });
    // Source de la probabilite (contrat §8) : « modèle et cotes d'avant-match » pour les
    // championnats europeens, « modèle seul » ailleurs. La consigne de l'IA le dit
    // (contre-controle ronde 4 : plus de « jamais influencees par une cote »).
    // Meme regle que l'origine publiee dans moteur_v3 (origineProbabilite).
    const src = typeof (v3 && v3.probabilite_source) === "string" ? v3.probabilite_source : "";
    out.v3_avec_cotes = src ? origineProbabilite(v3) === ORIGINE_AVEC_COTES : null;
    // Buts attendus donnes au texte : le MEME arrondi que la page (une decimale,
    // lib/chance-iashark.js#arrondi1), pour qu'un texte ne cite jamais 1,45 a cote d'un 1,5.
    if (pr.lambda_h != null) out.poisson_lambdaH = CHANCE.arrondi1(pr.lambda_h);
    if (pr.lambda_a != null) out.poisson_lambdaA = CHANCE.arrondi1(pr.lambda_a);
    ["poisson", "dixon", "mc", "final"].forEach(function (k) {
      out[k + "_p1"] = r1(pr.p1); out[k + "_pN"] = r1(pr.pn); out[k + "_p2"] = r1(pr.p2);
    });
    out.poisson_over25 = r1(pr.po25); out.poisson_under25 = pr.po25 != null ? r1(100 - pr.po25) : null;
    out.poisson_bttsY = r1(pr.btts); out.poisson_bttsN = pr.btts != null ? r1(100 - pr.btts) : null;
    const pm = etat.choix && etat.choix.pickedMarket;
    out.mc_scores = scoresV3(v3, pm && pm.id);
    out.simulation_count = null;
    const parId = {};
    ((v3 && v3.marches) || []).forEach(function (m) { const site = cleVersSite(m.cle); if (site && pct(m.probabilite) !== null) parId[site.id] = r1(pct(m.probabilite)); });
    out.all_markets = (d.all_markets || []).filter(function (m) { return m && parId[m.id] != null; })
      .map(function (m) { return Object.assign({}, m, { prob: parId[m.id], estimate: null }); });
    return out;
  }

  // ALERTE : moteur v3 allume et lisible, mais AUCUN match du site relie (noms ou
  // numeros qui ne correspondent pas) alors que des matchs ont ete traites :
  // zero pari sans autre signe. -> message, ou null.
  function alerteLiaison() {
    const cles = Object.keys(parFixture);
    if (!cles.length) return null;
    const relies = cles.filter(function (k) { return parFixture[k].source === "v3"; }).length;
    if (relies) return null;
    return "Moteur v3 lu (" + (sortie.matchs || []).length + " match(s) dans sa sortie) mais AUCUN des " + cles.length + " match(s) du site n'a ete relie : aucun pari v3 publie aujourd'hui (verifier les numeros API-Football et config/moteur-v3.json).";
  }

  // Tableau ancien / nouveau par match (essai local : MOTEUR_V3_COMPARAISON).
  // Contient les paris : jamais dans les journaux publics ni dans le depot.
  function comparaison() { return Object.keys(comparaisons).map(function (k) { return comparaisons[k]; }); }

  // CANAL PRO (une seule source, 01/10/2026) : chance IASHARK de chaque marche 1N2 /
  // double chance des matchs relies au moteur v3, a deposer avec la sortie du moteur
  // (scripts/canal-pro/deposer-sortie-v3.mjs). A appeler sur les matchs FINAUX (apres gel,
  // SAFE_PICK et lib/chance-iashark.js#poserChance) : le marche du pari affiche sur le site
  // prend EXACTEMENT sa chance_iashark. Contient des chances : jamais dans les journaux
  // publics ni dans le depot (fichier temporaire du run).
  // -> { "<fixture API-Football>": { match_id, marches: { "<cle v3>": chance en % } } }.
  function chancesPourCanal(matchs) {
    const out = {};
    (matchs || []).forEach(function (m) {
      if (!m || m.id == null) return;
      const etat = parFixture[String(m.id)];
      const cm = chancesMarches[String(m.id)];
      if (!etat || etat.source !== "v3" || etat.urgence || !cm) return;
      const marches = {};
      Object.keys(cm).forEach(function (cle) {
        const pari = m.market_id != null && String(m.market_id) === cm[cle].market_id ? CHANCE.chanceDuPari(m) : null;
        // UNE SEULE COTE (lib/cote-anj.js) : cote ANJ relevee pour ce match -> la cote sans marge
        // de chaque marche vient de la meme source que la cote affichee (sinon, celle du pipeline).
        const anj = m.cote_source === "anj" && m.sans_marge_anj ? CHANCE.chanceIashark(cm[cle].modele, m.sans_marge_anj[cm[cle].market_id]) : null;
        marches[cle] = pari !== null ? pari : anj && anj.sans_marge !== null ? anj.chance : cm[cle].chance;
      });
      if (Object.keys(marches).length) out[String(m.id)] = { match_id: etat.v3.match_id || null, marches: marches };
    });
    return out;
  }

  function idsMoteurV3() {
    const ids = {};
    Object.keys(parFixture).forEach(function (k) { if (parFixture[k].source !== "ancien") ids[k] = true; });
    return ids;
  }

  function resume() {
    return "moteur v3 ALLUME (contrat " + sortie.contrat_version + ", " + sortie.moteur_version + ", " + (sortie.matchs || []).length + " match(s) lus" +
      (urgence ? ", INTERRUPTEUR D'URGENCE" : "") + ") : " +
      (Object.keys(compteurs).sort().map(function (k) { return k + "=" + compteurs[k]; }).join(" ") || "aucun match traite");
  }

  return { actif: true, raison: null, sortie: sortie, fichier: charge.fichier, formule: formule, repli: repli, urgence: urgence, choisirPourFixture: choisirPourFixture, completerMatch: completerMatch, apresGel: apresGel, idsMoteurV3: idsMoteurV3, comparaison: comparaison, resume: resume, donneesTexte: donneesTexte, alerteLiaison: alerteLiaison, chancesPourCanal: chancesPourCanal };
}

module.exports = {
  CHAMPS_PREMIUM_V3: CHAMPS_PREMIUM_V3,
  CHAMP_PUBLIC_V3: CHAMP_PUBLIC_V3,
  cleVersSite: cleVersSite,
  validerSortie: validerSortie,
  chargerSortie: chargerSortie,
  normaliserEquipe: normaliserEquipe,
  indexerSortie: indexerSortie,
  trouverMatch: trouverMatch,
  choisirPari: choisirPari,
  probabilitesSite: probabilitesSite,
  buteursV3: buteursV3,
  premiersButeursV3: premiersButeursV3,
  reliabilityV3: reliabilityV3,
  origineProbabilite: origineProbabilite,
  ORIGINE_AVEC_COTES: ORIGINE_AVEC_COTES,
  ORIGINE_MODELE_SEUL: ORIGINE_MODELE_SEUL,
  comparatifV3: comparatifV3,
  creerBranchement: creerBranchement,
  FORMULES_ACCEPTEES: FORMULES_ACCEPTEES,
};
