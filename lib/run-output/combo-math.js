"use strict";
// CALCUL D'UN TICKET (tickets du jour, demande de Clement du 04/10/2026 ; regles du
// trader de cotes, regles-tickets.md §2.4 et §2.6). Remplace l'ancien calcul des
// combines « cote >= 10 » du 06/09 (probabilite du modele amortie de 0,985 par paire).
//
// Une jambe = un pari simple DEJA publie sur sa page match : sa cote (cote_rec, au
// centime) et sa chance AFFICHEE (chance_iashark, entier en %). Aucun nouveau calcul
// de probabilite ici.
//
//  - cote totale = produit des cotes, arrondi au centime, moitie vers le haut. Calcul
//    en entiers (centimes) : exact, sans erreur d'ecriture binaire (4,495 -> 4,50).
//  - chance du ticket = produit des chances affichees des jambes ; affichee en entier
//    arrondi VERS LE BAS, au moins 1 % (0,66 x 0,64 x 0,65 x 0,63 = 17,3 % -> 17 %).
//    Calcul en entiers aussi. Pas d'amortissement de correlation : il rendrait le
//    chiffre different du produit des chances visibles (la correlation mesuree entre
//    deux matchs de la meme ligue le meme jour est positive : le produit est prudent).
//  - detectResidualDependencyPairs : diagnostic INTERNE seulement (paires de jambes de
//    la meme ligue au meme coup d'envoi), garde pour le mathematicien, jamais affiche.

// Cote (nombre ou texte « 1,55 ») -> centimes entiers, ou null.
function centimes(cote) {
  const x = Number(String(cote == null ? "" : cote).replace(",", "."));
  if (!Number.isFinite(x) || x <= 1) return null;
  return Math.round(Number((x * 100).toPrecision(12)));
}

// Chance affichee (entier 1-99) ou null.
function chanceEntiere(c) {
  const x = Number(c);
  return Number.isInteger(x) && x >= 1 && x <= 99 ? x : null;
}

// Produit des cotes en centimes, arrondi au centime (moitie vers le haut) -> entier.
// produit exact = P / 100^k ; en centimes : P / 100^(k-1), arrondi.
function coteTotaleCentimes(jambes) {
  if (!Array.isArray(jambes) || !jambes.length) return null;
  let p = 1n;
  for (const j of jambes) {
    const c = centimes(j && j.cote);
    if (c === null) return null;
    p *= BigInt(c);
  }
  // Entiers exacts (BigInt) quel que soit le nombre de jambes.
  const div = 100n ** BigInt(jambes.length - 1);
  return Number((p * 2n + div) / (div * 2n));
}

function coteTotale(jambes) {
  const c = coteTotaleCentimes(jambes);
  return c === null ? null : c / 100;
}

// -> { chance (entier, vers le bas, >= 1), chance_exacte (fraction, 4 decimales) } ou null.
function chanceTicket(jambes) {
  if (!Array.isArray(jambes) || !jambes.length) return null;
  let p = 1n;
  for (const j of jambes) {
    const c = chanceEntiere(j && j.chance);
    if (c === null) return null;
    p *= BigInt(c);
  }
  // p / 100^k en fraction ; en % : p / 100^(k-1), vers le bas (division entiere).
  const k = BigInt(jambes.length);
  const chance = Math.max(1, Number(p / 100n ** (k - 1n)));
  // 4 decimales de la fraction : p / 100^k arrondi a 1/10000 (moitie vers le haut).
  const div4 = 100n ** k;
  const exacte = Number((p * 20000n + div4) / (div4 * 2n)) / 10000;
  return { chance: chance, chance_exacte: exacte };
}

function detectResidualDependencyPairs(legs) {
  const pairs = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.fixture_id === b.fixture_id) continue;
      const la = a.ligue_key != null ? a.ligue_key : a.league_key;
      const lb = b.ligue_key != null ? b.ligue_key : b.league_key;
      const ka = a.coup_envoi != null ? a.coup_envoi : a.kickoff;
      const kb = b.coup_envoi != null ? b.coup_envoi : b.kickoff;
      if (la != null && la === lb && ka != null && ka === kb) pairs.push([a.fixture_id, b.fixture_id]);
    }
  }
  return pairs;
}

module.exports = { centimes, chanceEntiere, coteTotaleCentimes, coteTotale, chanceTicket, detectResidualDependencyPairs };
