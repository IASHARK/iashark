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
//  - RECHERCHE EXACTE (controle du mathematicien du 04/10/2026, methode (e)) : on garde, parmi
//    TOUTES les combinaisons de jambes (matchs differents), celle dont le produit exact des
//    chances affichees est le plus grand, sans plafond de jambes (l'ancien plafond de 40 jambes
//    ratait le meilleur ticket un jour charge sur cinq). Pour un meme jeu de cotes, la meilleure
//    combinaison prend, a chaque cote, les jambes de plus grande chance (puis les plus petits
//    numeros de match) : on enumere donc les jeux de cotes (31 cotes possibles de 1,40 a 1,70,
//    6 jambes au plus), en quelques millisecondes ; verifie contre la recherche exhaustive
//    (tests/tickets-du-jour.test.js).
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

const { centimes, chanceEntiere, coteTotale, coteTotaleCentimes, chanceTicket, detectResidualDependencyPairs } = require("./combo-math.js");
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
// l'ordre probable si un doublon arrivait), triees par numero. Aucun plafond (recherche exacte).
function preparerJambes(jambes) {
  const vues = new Set();
  const ok = (jambes || [])
    .filter((j) => j && j.fixture_id != null && centimes(j.cote) !== null && chanceEntiere(j.chance) !== null)
    .slice().sort(ordreProbable)
    .filter((j) => { const k = String(j.fixture_id); if (vues.has(k)) return false; vues.add(k); return true; });
  return ok.sort((a, b) => Number(a.fixture_id) - Number(b.fixture_id));
}

// Meilleure combinaison pour un type -> { indices, P (centimes), Q (chances), k } ou null.
// Recherche exacte par jeux de cotes : les jambes sont groupees par cote (centimes) ; dans un groupe,
// triees par chance decroissante puis numero de match croissant. Pour un jeu de cotes donne (k et cote
// totale fixes), prendre les n premieres jambes de chaque groupe donne la plus grande chance et, a
// chance egale, la plus petite liste de numeros : c'est donc la meilleure combinaison de ce jeu, et le
// meilleur de tous les jeux est la meilleure de toutes les combinaisons (meme departage partout).
function meilleureCombinaison(J, R) {
  const c = J.map((j) => centimes(j.cote));
  const h = J.map((j) => chanceEntiere(j.chance));
  const ids = J.map((j) => Number(j.fixture_id));
  if (!J.length) return null;
  const groupes = new Map();
  c.forEach((v, i) => { if (!groupes.has(v)) groupes.set(v, []); groupes.get(v).push(i); });
  const valeurs = Array.from(groupes.keys()).sort((a, b) => a - b);
  const membres = valeurs.map((v) => groupes.get(v).sort((a, b) => (h[b] - h[a]) || (ids[a] - ids[b])));
  const cMax = valeurs[valeurs.length - 1];
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

  // Produits par groupe : puissances de la cote et produit des x meilleures chances (aucune allocation
  // pendant la recherche). hMax : plus grande chance, pour couper une branche qui ne peut plus battre
  // le meilleur ticket deja trouve (coupure stricte : une egalite est toujours examinee).
  const puiss = valeurs.map((v, g) => { const a = [1]; for (let x = 1; x <= membres[g].length; x++) a.push(a[x - 1] * v); return a; });
  const prodH = membres.map((mb) => { const a = [1]; for (let x = 1; x <= mb.length; x++) a.push(a[x - 1] * h[mb[x - 1]]); return a; });
  const hMax = Math.max.apply(null, h);
  const pris = new Array(valeurs.length).fill(0);

  R.jambes.forEach(function (k) {
    if (k > J.length) return;
    const div = Math.pow(100, k - 1), base = Math.pow(100, k);
    // arrondi(P / div) dans [minC, maxC]  <=>  (2 minC - 1) div <= 2P < (2 maxC + 1) div
    const bas = (2 * R.minC - 1) * div, haut = (2 * R.maxC + 1) * div;
    (function rec(vi, reste, P, Q) {
      if (reste === 0) {
        if (2 * P < bas || 2 * P >= haut) return;
        const chance = Q / base;
        if (best && chance < best.chance) return;
        const indices = [];
        for (let g = 0; g < vi; g++) for (let x = 0; x < pris[g]; x++) indices.push(membres[g][x]);
        indices.sort((a, b) => a - b);
        const arrondi = Math.floor((2 * P + div) / (2 * div));
        const cand = { indices: indices, P: P, Q: Q, k: k, chance: chance, ecart: Math.abs(arrondi - R.centreC) };
        if (meilleur(cand)) best = cand;
        return;
      }
      if (vi >= valeurs.length) return;
      // Elagage par la cote : meme avec les plus petites (grandes) cotes restantes, la cote finale
      // sortirait de la fourchette.
      if (2 * P * Math.pow(valeurs[vi], reste) >= haut) return;
      if (2 * P * Math.pow(cMax, reste) < bas) return;
      // Elagage par la chance (strict) : meme avec les meilleures chances, moins bien que le meilleur.
      if (best && (Q * Math.pow(hMax, reste)) / base < best.chance) return;
      const n = Math.min(reste, membres[vi].length);
      for (let x = n; x >= 0; x--) {
        pris[vi] = x;
        rec(vi + 1, reste - x, P * puiss[vi][x], Q * prodH[vi][x]);
      }
      pris[vi] = 0;
    })(0, k, 1, 1);
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

// =====================================================================================
// COMBINES SUR TOUS LES MARCHES (demande de Clement du 06/10/2026). Les jambes candidates peuvent etre
// PLUSIEURS par match (tous les marches surs du match, lib/run-output/jambes-du-jour.js#candidatsDuJour) ;
// un combine garde au plus UNE jambe par match. Recherche par programmation dynamique sur les matchs
// (ordre des numeros) : pour chaque nombre de jambes k et chaque « case » de cote totale (logarithme de la
// cote par pas de PAS_LOG), la plus grande somme des log(chance). Les cases proches des bornes sont
// reconstruites et verifiees EXACTEMENT (cote totale arrondie au centime, combo-math.js), puis le meilleur
// est choisi : plus grande chance (produit des chances), puis moins de jambes, puis cote totale la plus
// proche du centre, puis liste des numeros de match la plus petite. Aucune combinaison : pas de combine.
// Pas de 0,0005 : deux combinaisons de la meme case ont des cotes a 0,4 % pres au plus (8 jambes) ; la
// meilleure de la case est gardee (verifie contre la recherche exhaustive, tests/combines-tous-marches.test.js).
const PAS_LOG = 0.0005;
function meilleurCombine(J, R) {
  const c = J.map((j) => centimes(j.cote));
  const h = J.map((j) => chanceEntiere(j.chance));
  const ids = J.map((j) => Number(j.fixture_id));
  const ok = J.map((j, i) => c[i] !== null && h[i] !== null && Number.isFinite(ids[i]));
  const groupes = new Map();
  J.forEach((j, i) => { if (!ok[i]) return; if (!groupes.has(ids[i])) groupes.set(ids[i], []); groupes.get(ids[i]).push(i); });
  const fixtures = Array.from(groupes.keys()).sort((a, b) => a - b);
  const K = Math.max.apply(null, R.jambes);
  if (!fixtures.length || fixtures.length < Math.min.apply(null, R.jambes)) return null;
  const lc = c.map((v) => (v === null ? 0 : Math.round(Math.log(v / 100) / PAS_LOG)));
  const lh = h.map((v) => (v === null ? -Infinity : Math.log(v / 100)));
  const NB = Math.ceil(Math.log((R.maxC / 100) * 1.01) / PAS_LOG) + K + 2;
  let score = new Float64Array((K + 1) * NB).fill(-Infinity);
  score[0] = 0;
  const choix = [];
  fixtures.forEach(function (f) {
    const idx = groupes.get(f);
    const next = score.slice();
    const ch = new Uint16Array((K + 1) * NB);
    for (let k = 0; k < K; k++) {
      for (let b = 0; b < NB; b++) {
        const s = score[k * NB + b];
        if (s === -Infinity) continue;
        for (let t = 0; t < idx.length; t++) {
          const i = idx[t];
          const nb = b + lc[i];
          if (nb >= NB || nb < 0) continue;
          const ns = s + lh[i];
          const cible = (k + 1) * NB + nb;
          if (ns > next[cible] + 1e-12) { next[cible] = ns; ch[cible] = i + 1; }
        }
      }
    }
    choix.push(ch);
    score = next;
  });
  let best = null;
  function meilleur(x) {
    if (!best) return true;
    if (Math.abs(x.chance - best.chance) > 1e-15) return x.chance > best.chance;
    if (x.k !== best.k) return x.k < best.k;
    if (x.ecart !== best.ecart) return x.ecart < best.ecart;
    for (let i = 0; i < Math.min(x.ids.length, best.ids.length); i++) if (x.ids[i] !== best.ids[i]) return x.ids[i] < best.ids[i];
    return false;
  }
  R.jambes.forEach(function (k) {
    if (k > K) return;
    const bMin = Math.floor(Math.log((R.minC - 0.5) / 100) / PAS_LOG) - k - 1;
    const bMax = Math.ceil(Math.log((R.maxC + 0.5) / 100) / PAS_LOG) + k + 1;
    for (let b = Math.max(0, bMin); b <= Math.min(NB - 1, bMax); b++) {
      if (score[k * NB + b] === -Infinity) continue;
      // Reconstruction (du dernier match au premier).
      const indices = [];
      let kk = k, bb = b;
      for (let mi = fixtures.length - 1; mi >= 0 && kk > 0; mi--) {
        const v = choix[mi][kk * NB + bb];
        if (v) { const i = v - 1; indices.push(i); bb -= lc[i]; kk--; }
      }
      if (kk !== 0 || indices.length !== k) continue;
      indices.sort((x, y) => ids[x] - ids[y]);
      const legs = indices.map((i) => J[i]);
      const coteC = coteTotaleCentimes(legs);
      if (coteC === null || coteC < R.minC || coteC > R.maxC) continue;
      const chance = indices.reduce((p, i) => p * (h[i] / 100), 1);
      const cand = { indices: indices, k: k, chance: chance, ecart: Math.abs(coteC - R.centreC), ids: indices.map((i) => ids[i]) };
      if (meilleur(cand)) best = cand;
    }
  });
  return best;
}

// Jambes qui vont dans le meme sens que toutes les selections deja engagees sur leur match (pari affiche :
// deja filtre par candidatsDuJour ; ici la Selection en or et l'autre combine). lib/marches-paris.js#coherent.
function jambesCoherentes(jambes, engagees, matchParId, seuil) {
  const MP = require("../marches-paris.js");
  return (jambes || []).filter(function (j) {
    const m = matchParId ? matchParId[String(j.fixture_id)] : null;
    return (engagees || []).every(function (e) {
      return !e || Number(e.fixture_id) !== Number(j.fixture_id) || MP.coherent(m || {}, e.market_id, j.market_id, MP.NIVEAU.JAMBE, seuil).ok;
    });
  });
}

// { jambes (candidates, plusieurs par match possibles), snapshotTime, regles (config/tickets.json),
//   engagees ([{ fixture_id, market_id }] deja publiees aujourd'hui : Selection en or, combine deja publie),
//   matchParId (grilles de scores), deja ({ x5: contenu publie, x10: contenu publie }) }
// -> { generated_at, regle_version, combos: [TICKET_X5, TICKET_X10] }. Le petit combine est cherche d'abord ;
// ses jambes sont engagees pour le grand (jamais deux jambes contraires sur un match).
function generateDailyCombos({ jambes, snapshotTime, regles, engagees, matchParId, deja }) {
  if (!snapshotTime) throw new Error("generateDailyCombos: snapshotTime requis (determinisme)");
  const cfg = regles || REGLES_DEFAUT;
  const seuil = cfg.coherence && Number.isFinite(Number(cfg.coherence.seuil_jambe)) ? Number(cfg.coherence.seuil_jambe) : 0.8;
  let eng = (engagees || []).slice();
  const combos = TYPES.map(function (type) {
    const publie = deja && deja[type] && Array.isArray(deja[type].jambes) ? deja[type].jambes : null;
    if (publie) {
      publie.forEach((j) => eng.push({ fixture_id: j.fixture_id, market_id: j.market_id }));
      return { combo_id: COMBO_ID[type], type: type, status: "ALREADY_PUBLISHED", generated_at: snapshotTime };
    }
    const R = reglesTicket(cfg, type);
    const J = jambesCoherentes(jambes, eng, matchParId, seuil);
    const best = J.length ? meilleurCombine(J, R) : null;
    if (!best) return { combo_id: COMBO_ID[type], type: type, status: "NO_QUALIFYING_COMBINATION", generated_at: snapshotTime };
    const legs = best.indices.map((i) => J[i]);
    legs.forEach((j) => eng.push({ fixture_id: j.fixture_id, market_id: j.market_id }));
    return Object.assign(decrireTicket(type, legs), { generated_at: snapshotTime });
  });
  return { generated_at: snapshotTime, regle_version: cfg.regle_version || REGLES_DEFAUT.regle_version, combos: combos, engagees: eng };
}

// Avant la publication des paris (runOutputForSnapshot est appele trop tot dans le
// pipeline) : les deux emplacements existent, sans ticket. Le pipeline les remplace
// apres la publication des paris (lib/tickets-du-jour.js).
function combosEnAttente(snapshotTime) {
  return { generated_at: snapshotTime || null, regle_version: REGLES_DEFAUT.regle_version,
    combos: TYPES.map((type) => ({ combo_id: COMBO_ID[type], type: type, status: "PENDING_PUBLISHED_PICKS", generated_at: snapshotTime || null })) };
}

module.exports = { generateDailyCombos, combosEnAttente, decrireTicket, jambeFigee, operateurUnique, preparerJambes, reglesTicket, ordreProbable, meilleureCombinaison, meilleurCombine, jambesCoherentes, TYPES, COMBO_ID };
