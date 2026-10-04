"use strict";
// TICKETS DU JOUR x5 ET x10 (demande de Clement du 04/10/2026 ; regles du trader de
// cotes, regles-tickets.md §2.3). Remplace l'ancien calcul des combines « cote >= 10 »
// (glouton du 06/09 sur les candidats du moteur canonique) : meme nom exporte,
// generateDailyCombos, mais les jambes sont desormais les paris simples PUBLIES du
// jour (lib/run-output/jambes-du-jour.js), jamais un autre calcul.
//
//  - Ticket x5 : 3 ou 4 jambes, cote totale arrondie au centime entre 4,50 et 5,50.
//  - Ticket x10 : 5 ou 6 jambes, cote totale arrondie entre 9,00 et 11,00.
//  (bornes dans config/tickets.json, testees sur la valeur ARRONDIE, celle qu'on affiche).
//  - On essaie TOUTES les combinaisons de jambes (matchs differents) et on garde celle
//    dont le produit exact des chances affichees est le plus grand. Au-dela de
//    jambes_max jambes (40), seules les plus probables sont essayees (regle ecrite).
//  - Egalite, dans l'ordre : moins de jambes ; cote totale la plus proche du centre
//    (5,00 ou 10,00) ; liste des numeros de match (triee) la plus petite. Jamais le
//    hasard, jamais l'ordre d'arrivee.
//  - Aucune combinaison : NO_QUALIFYING_COMBINATION. Jamais un ticket force.
//  - Les deux tickets sont choisis independamment (ils peuvent partager des matchs).
//
// Calcul exact en entiers : cotes en centimes, chances en % entiers. Un produit de
// 6 cotes (<= 99 999 centimes chacune ici <= 2 000) et de 6 chances (<= 99) reste
// bien sous 2^53 ; les comparaisons de chances (fractions de denominateur <= 100^6)
// sont exactes en virgule flottante (division correctement arrondie).

const { centimes, chanceEntiere, coteTotale, chanceTicket, detectResidualDependencyPairs } = require("./combo-math.js");
const REGLES_DEFAUT = require("../../config/tickets.json");

const TYPES = ["x5", "x10"];
const COMBO_ID = { x5: "TICKET_X5", x10: "TICKET_X10" };

function reglesTicket(regles, type) {
  const r = (regles && regles[type]) || REGLES_DEFAUT[type];
  const jambes = Array.isArray(r && r.jambes) ? r.jambes.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const min = Number(r && r.cote_min), max = Number(r && r.cote_max), centre = Number(r && r.centre);
  if (!jambes.length || !(min > 1) || !(max >= min) || !(centre > 0)) throw new Error("config/tickets.json#" + type + " illisible");
  return { jambes: jambes.slice().sort((a, b) => a - b), minC: Math.round(min * 100), maxC: Math.round(max * 100), centreC: Math.round(centre * 100) };
}

// Ordre fixe des jambes candidates : plus grande chance, puis chance calculee avant
// correction, puis coup d'envoi le plus tot, puis plus petit numero de match.
function ordreProbable(a, b) {
  return (b.chance - a.chance)
    || ((b.chance_calculee != null ? b.chance_calculee : b.chance) - (a.chance_calculee != null ? a.chance_calculee : a.chance))
    || String(a.coup_envoi || "").localeCompare(String(b.coup_envoi || ""))
    || (Number(a.fixture_id) - Number(b.fixture_id));
}

// Jambes utilisables : cote et chance lisibles, un seul pari par match (le premier dans
// l'ordre probable si un doublon arrivait), puis au plus jambes_max, triees par numero.
function preparerJambes(jambes, max) {
  const vues = new Set();
  const ok = (jambes || [])
    .filter((j) => j && j.fixture_id != null && centimes(j.cote) !== null && chanceEntiere(j.chance) !== null)
    .slice().sort(ordreProbable)
    .filter((j) => { const k = String(j.fixture_id); if (vues.has(k)) return false; vues.add(k); return true; });
  const limite = Number.isInteger(max) && max > 0 ? ok.slice(0, max) : ok;
  return limite.sort((a, b) => Number(a.fixture_id) - Number(b.fixture_id));
}

// Meilleure combinaison pour un type -> { indices, P (centimes), Q (chances), k } ou null.
function meilleureCombinaison(J, R) {
  const n = J.length;
  const c = J.map((j) => centimes(j.cote));
  const h = J.map((j) => chanceEntiere(j.chance));
  const ids = J.map((j) => Number(j.fixture_id));
  const cMin = Math.min.apply(null, c), cMax = Math.max.apply(null, c);
  let best = null;

  function meilleur(cand) {
    if (!best) return true;
    if (cand.chance !== best.chance) return cand.chance > best.chance;
    if (cand.k !== best.k) return cand.k < best.k;
    if (cand.ecart !== best.ecart) return cand.ecart < best.ecart;
    for (let i = 0; i < Math.min(cand.indices.length, best.indices.length); i++) {
      if (ids[cand.indices[i]] !== ids[best.indices[i]]) return ids[cand.indices[i]] < ids[best.indices[i]];
    }
    return false;
  }

  R.jambes.forEach(function (k) {
    if (k > n) return;
    const div = Math.pow(100, k - 1);
    // arrondi(P / div) dans [minC, maxC]  <=>  (2 minC - 1) div <= 2P < (2 maxC + 1) div
    const bas = (2 * R.minC - 1) * div, haut = (2 * R.maxC + 1) * div;
    const pile = [];
    (function rec(debut, P, Q) {
      const reste = k - pile.length;
      if (reste === 0) {
        if (2 * P < bas || 2 * P >= haut) return;
        const arrondi = Math.floor((2 * P + div) / (2 * div));
        const cand = { indices: pile.slice(), P: P, Q: Q, k: k, chance: Q / Math.pow(100, k), ecart: Math.abs(arrondi - R.centreC) };
        if (meilleur(cand)) best = cand;
        return;
      }
      // Elagage par la cote : meme avec les plus petites (grandes) cotes restantes,
      // la cote finale sortirait de la fourchette.
      if (2 * P * Math.pow(cMin, reste) >= haut) return;
      if (2 * P * Math.pow(cMax, reste) < bas) return;
      for (let i = debut; i <= n - reste; i++) {
        pile.push(i);
        rec(i + 1, P * c[i], Q * h[i]);
        pile.pop();
      }
    })(0, 1, 1);
  });
  return best;
}

// Operateur commun a toutes les jambes, sinon null (la page dit alors « meilleures
// cotes relevees chez les operateurs agrees »).
function operateurUnique(jambes) {
  const ops = new Set(jambes.map((j) => (j && typeof j.operateur === "string" && j.operateur) || ""));
  return ops.size === 1 && !ops.has("") ? jambes[0].operateur : null;
}

// Copie figee d'une jambe (ce qui part dans la table et, selon le niveau, au site).
function jambeFigee(j) {
  return {
    fixture_id: Number(j.fixture_id), domicile: j.domicile || null, exterieur: j.exterieur || null,
    ligue: j.ligue || null, ligue_key: j.ligue_key || null, ligue_id: j.ligue_id != null ? Number(j.ligue_id) : null,
    coup_envoi: j.coup_envoi || null, coup_envoi_ms: Number.isFinite(Number(j.coup_envoi_ms)) ? Number(j.coup_envoi_ms) : null,
    pari: j.pari || null, market_id: j.market_id || null, famille: j.famille || null,
    cote: centimes(j.cote) / 100, operateur: j.operateur || null, chance: chanceEntiere(j.chance),
    chance_calculee: j.chance_calculee != null && Number.isFinite(Number(j.chance_calculee)) ? Number(j.chance_calculee) : null,
  };
}

// Ticket a partir d'une liste de jambes deja choisie (aussi : « sans les matchs reportes »).
function decrireTicket(type, jambes) {
  const figees = jambes.map(jambeFigee);
  const ch = chanceTicket(figees);
  return {
    combo_id: COMBO_ID[type], type: type, status: "GENERATED",
    nb_matchs: figees.length, cote_totale: coteTotale(figees),
    chance: ch ? ch.chance : null, chance_exacte: ch ? ch.chance_exacte : null,
    operateur_unique: operateurUnique(figees),
    jambes: figees,
    // Diagnostic interne (mathematicien) : jamais affiche ni renvoye au site.
    paires_meme_ligue_meme_heure: detectResidualDependencyPairs(figees).length,
  };
}

// { jambes (lib/run-output/jambes-du-jour.js#jambesDuJour), snapshotTime, regles (config/tickets.json) }
// -> { generated_at, regle_version, combos: [TICKET_X5, TICKET_X10] }.
function generateDailyCombos({ jambes, snapshotTime, regles }) {
  if (!snapshotTime) throw new Error("generateDailyCombos: snapshotTime requis (determinisme)");
  const cfg = regles || REGLES_DEFAUT;
  const J = preparerJambes(jambes, Number(cfg.jambes_max != null ? cfg.jambes_max : REGLES_DEFAUT.jambes_max));
  const combos = TYPES.map(function (type) {
    const R = reglesTicket(cfg, type);
    const best = J.length ? meilleureCombinaison(J, R) : null;
    if (!best) return { combo_id: COMBO_ID[type], type: type, status: "NO_QUALIFYING_COMBINATION", generated_at: snapshotTime };
    return Object.assign(decrireTicket(type, best.indices.map((i) => J[i])), { generated_at: snapshotTime });
  });
  return { generated_at: snapshotTime, regle_version: cfg.regle_version || REGLES_DEFAUT.regle_version, combos: combos };
}

// Avant la publication des paris (runOutputForSnapshot est appele trop tot dans le
// pipeline) : les deux emplacements existent, sans ticket. Le pipeline les remplace
// apres la publication des paris (lib/tickets-du-jour.js).
function combosEnAttente(snapshotTime) {
  return { generated_at: snapshotTime || null, regle_version: REGLES_DEFAUT.regle_version,
    combos: TYPES.map((type) => ({ combo_id: COMBO_ID[type], type: type, status: "PENDING_PUBLISHED_PICKS", generated_at: snapshotTime || null })) };
}

module.exports = { generateDailyCombos, combosEnAttente, decrireTicket, jambeFigee, operateurUnique, preparerJambes, reglesTicket, ordreProbable, TYPES, COMBO_ID };
