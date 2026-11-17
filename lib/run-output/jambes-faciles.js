"use strict";
// JAMBES DES COMBINES x5 / x10 « CORRIGES » (decision de Clement du 17/11/2026 : « Garder x5 / x10 corriges » ; regles du
// trader de cotes, config/tickets.json#jambes_combines).
//
// Mesure du 21/10 au 17/11 (tickets_du_jour + predictions_archive) : x5 gagne 7 jours sur 26, x10 4 sur 24 ; jambes en
// victoire seche (1N2) 34 gagnees sur 67, jambes cotees 1,70 ou plus 12 sur 30. D'ou :
//   - plus aucune jambe en victoire seche (famille 1N2) ;
//   - plus aucune jambe cotee 1,70 ou plus (bornes config/tickets.json#jambes_combines.cote_min / cote_max) ;
//   - chaque jambe = le pari AFFICHE du match quand il passe ces bornes (meme pari, meme cote, meme chance que sa page) ;
//     sinon sa VERSION PLUS FACILE : un marche qui gagne CHAQUE FOIS que le pari affiche gagne (lib/marches-paris.js#implique,
//     ex. « Lens gagne » -> « Lens ou match nul », « plus de 2,5 buts » -> « plus de 1,5 but »), avec la cote Bet365
//     relevee dans le flux du match (jamais inventee : pas de flux, pas de version facile) ;
//   - chance minimale par jambe (config/tickets.json#jambes_combines.chance_min).
// Jamais une jambe qui contredit la page : la version facile est IMPLIQUEE par le pari affiche (le ticket ne peut pas
// perdre sur ce match si le pari de la page gagne). Le reste (garde coup d'envoi, competition mesuree, categorie NO-GO,
// pari « en test », repli des coupes) est la regle commune des jambes (jambes-du-jour.js#candidatsDuJour).
//
// Chance d'une version facile : la cote Bet365 sans marge (methode puissance, lib/flux-paris.js), seule source disponible
// pour ce marche (lib/chance-iashark.js#chanceIashark sans modele). Le pari affiche garde la chance de sa page.

const MP = require("../marches-paris.js");
const FP = require("../flux-paris.js");
const PRONOSTIC = require("../pronostic.js");
const CHANCE = require("../chance-iashark.js");
const CFG_MARCHES_PARI = require("../../config/marches-pari.json");
const { centimes, chanceEntiere } = require("./combo-math.js");

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function familleDe(id) { const d = PRONOSTIC.MARCHE[String(id || "")]; return d ? d.famille : null; }
function entre(cote, min, max) {
  const c = centimes(cote);
  return c !== null && c >= Math.round(Number(min) * 100) && c <= Math.round(Number(max) * 100);
}

// Regle lue dans config/tickets.json#jambes_combines -> { cote_min, cote_max, chance_min, exclure_familles } ou null.
function regleCombines(regles) {
  const r = regles && estObjet(regles.jambes_combines) ? regles.jambes_combines : null;
  if (!r) return null;
  const min = Number(r.cote_min), max = Number(r.cote_max), ch = Number(r.chance_min);
  if (!(min > 1) || !(max >= min) || !Number.isFinite(ch)) throw new Error("config/tickets.json#jambes_combines illisible");
  return { cote_min: min, cote_max: max, chance_min: ch, exclure_familles: (Array.isArray(r.exclure_familles) ? r.exclure_familles : []).map(String),
    versions_faciles: r.versions_faciles !== false };
}

// Le pari affiche passe-t-il seul la regle des jambes (famille, cote, chance de la page) ?
function ancreSuffit(c, R) {
  if (!c) return false;
  if (R.exclure_familles.indexOf(String(c.famille || familleDe(c.market_id))) !== -1) return false;
  if (!entre(c.cote, R.cote_min, R.cote_max)) return false;
  const ch = chanceEntiere(Number(c.chance_affichee));
  return ch !== null && ch >= R.chance_min;
}

// Versions plus faciles du pari affiche `ancre` sur ce match, depuis le flux Bet365 du match (raw API-Football).
// -> [candidat au format de lib/tickets-du-jour.js#candidatsAvecPariAffiche].
function versionsFaciles(m, ancre, raw, ancreCandidat, R) {
  if (!MP.CATALOGUE[String(ancre)] || !raw) return [];
  const r = FP.selectionsDuMatch(raw, { match: m, regle: PRONOSTIC.regleFlux(CFG_MARCHES_PARI) });
  const vus = {};
  const out = [];
  (r.selections || []).forEach(function (s) {
    // « Goal Line » (50, 72) en demi-ligne = la meme issue que les buts (5, 6) : meme identifiant (lib/pronostic.js).
    const id = MP.idDuFlux({ 50: 5, 72: 6 }[s.bet_id] || s.bet_id, s.value);
    if (!id || vus[id] || id === String(ancre)) return;
    const d = MP.CATALOGUE[id];
    if (!d || d.ft !== true) return;
    vus[id] = true;
    const famille = familleDe(id);
    if (R.exclure_familles.indexOf(String(famille)) !== -1) return;
    if (!MP.implique(String(ancre), id)) return; // gagne chaque fois que le pari affiche gagne, sinon jamais
    const cote = Math.round(Number(s.cote) * 100) / 100;
    if (!entre(cote, R.cote_min, R.cote_max)) return;
    const c = CHANCE.chanceIashark(Number(s.chance) * 100, null);
    if (!c || !Number.isFinite(Number(c.chance))) return;
    out.push({ market_id: id, famille: famille, libelle_fr: PRONOSTIC.libelleFr(id, m) || null, cote: cote,
      cote_anj: false, bookmaker: null, chance: Number(s.chance) * 100, chance_affichee: Number(c.chance),
      p_modele: null, q: Number(s.chance) * 100, voie: "version_facile", fiabilite: ancreCandidat ? ancreCandidat.fiabilite : null,
      pari_affiche: String(ancre) });
  });
  return out;
}

// Candidats des jambes x5 / x10 de chaque match. candidatsPar : candidats du pari affiche (lib/tickets-du-jour.js) ;
// opts.fluxPar : { id: { raw } } (FLUX_PARIS du pipeline). -> { candidatsPar, versions_faciles: nombre de matchs }.
function candidatsCombines(matchs, candidatsPar, opts) {
  opts = opts || {};
  const R = regleCombines(opts.regles);
  if (!R) return { candidatsPar: candidatsPar, versions_faciles: 0 };
  const fluxPar = estObjet(opts.fluxPar) ? opts.fluxPar : {};
  const out = {};
  let n = 0;
  (matchs || []).forEach(function (m) {
    if (!m || m.id == null) return;
    const k = String(m.id);
    const liste = Array.isArray(candidatsPar && candidatsPar[k]) ? candidatsPar[k] : [];
    const ancre = m.market_id != null ? String(m.market_id) : null;
    const c = liste.find(function (x) { return x && String(x.market_id) === ancre; }) || null;
    if (!c) return; // pas de pari affiche publie : pas de jambe
    if (ancreSuffit(c, R)) { out[k] = [c]; return; }
    if (!R.versions_faciles) return;
    const f = fluxPar[k];
    const v = versionsFaciles(m, ancre, f && f.raw ? f.raw : null, c, R);
    if (v.length) { out[k] = v; n++; }
  });
  return { candidatsPar: out, versions_faciles: n };
}

module.exports = { candidatsCombines, versionsFaciles, ancreSuffit, regleCombines };
