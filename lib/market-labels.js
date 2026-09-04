"use strict";
// Libelles de marches en francais courant.
//
// Le moteur produit des libelles de bookmaker : "DC 12", "Over 2.5",
// "BTTS Oui", "Premiere mi-temps moins de 1.5 but". Quelqu'un qui decouvre le
// site ne les comprend pas, et c'est la premiere chose qu'il lit.
//
// Deux regles, appliquees partout :
//
// 1. AUCUN SEUIL A VIRGULE. Le ".5" des bookmakers sert a exclure l'egalite,
//    il ne veut rien dire pour un lecteur. "Over 2.5" devient "au moins
//    3 buts", "Under 3.5" devient "au plus 3 buts". C'est exactement
//    equivalent - un match ne peut pas avoir 2,5 but - et c'est lisible.
//
// 2. LE NOM DES EQUIPES plutot que "Domicile" et "Exterieur", quand on les
//    connait.
//
// La traduction se fait a l'AFFICHAGE, jamais dans les donnees : les
// identifiants et libelles stockes restent ceux du moteur, sur lesquels
// s'appuient la selection du marche et le tableau comparatif.
//
// Un libelle non reconnu est renvoye tel quel : mieux vaut le terme d'origine
// qu'une reformulation approximative d'un marche qu'on n'a pas prevu.

// "2.5" -> 2 (le nombre entier atteint des qu'on depasse le seuil).
function seuilEntier(texte) {
  var m = String(texte).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  var v = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function auMoins(seuil) { return Math.floor(seuil) + 1; }
function auPlus(seuil) { return Math.floor(seuil); }
function but(n) { return n + " but" + (n > 1 ? "s" : ""); }

function marketLabelFr(libelle, equipes) {
  var brut = String(libelle == null ? "" : libelle).trim();
  if (!brut) return brut;
  var e = equipes || {};
  var dom = e.home || "l’équipe à domicile";
  var ext = e.away || "l’équipe à l’extérieur";
  var l = brut.toLowerCase();
  var s = seuilEntier(brut);

  // --- Resultat ---
  if (l === "victoire domicile") return "Victoire de " + dom;
  if (l === "victoire exterieur" || l === "victoire extérieur") return "Victoire de " + ext;
  if (l === "match nul") return "Match nul";

  // --- Double chance ---
  if (/^dc\s*1x$/.test(l)) return dom + " gagne ou match nul";
  if (/^dc\s*x2$/.test(l)) return ext + " gagne ou match nul";
  if (/^dc\s*12$/.test(l)) return dom + " ou " + ext + " gagne, sans match nul";

  // --- Les deux equipes marquent ---
  if (/^btts\s*oui$/.test(l) || /deux [eé]quipes marquent oui/.test(l)) return "Les deux équipes marquent";
  if (/^btts\s*non$/.test(l) || /deux [eé]quipes marquent non/.test(l)) return "Au moins une équipe ne marque pas";

  // --- Mi-temps ---
  if (/mi-temps/.test(l) && s !== null && !/gagne/.test(l)) {
    if (/plus de|over/.test(l)) {
      return auMoins(s) === 1 ? "Au moins 1 but en première mi-temps"
        : "Au moins " + but(auMoins(s)) + " en première mi-temps";
    }
    return auPlus(s) === 0 ? "Aucun but en première mi-temps"
      : "Au plus " + but(auPlus(s)) + " en première mi-temps";
  }
  if (/gagne les deux mi-temps/.test(l)) {
    return (/^domicile/.test(l) ? dom : ext) + " gagne les deux mi-temps";
  }

  // --- Tirs ---
  if (/tirs? cadr/.test(l) && s !== null) {
    return (/over|plus de/.test(l) ? "Au moins " + auMoins(s) : "Au plus " + auPlus(s)) + " tirs cadrés dans le match";
  }
  if (/tirs?/.test(l) && s !== null) {
    return (/over|plus de/.test(l) ? "Au moins " + auMoins(s) : "Au plus " + auPlus(s)) + " tirs dans le match";
  }

  // --- Buts d'une equipe, seul ou combine a une victoire ---
  var equipe = /^domicile/.test(l) ? dom : /^ext[eé]rieur/.test(l) ? ext : null;
  if (equipe) {
    if (/clean sheet/.test(l)) return equipe + " n’encaisse aucun but";
    if (/gagne sans encaisser/.test(l)) return equipe + " gagne sans encaisser de but";
    if (/gagne \+/.test(l) && s !== null) {
      return equipe + " gagne et " + (/plus de/.test(l) ? "au moins " + but(auMoins(s)) : "au plus " + but(auPlus(s))) + " dans le match";
    }
    if (s !== null) {
      return equipe + " marque " + (/plus de/.test(l) ? "au moins " + but(auMoins(s)) : "au plus " + but(auPlus(s)));
    }
  }

  // --- Total de buts du match ---
  if (s !== null && /over|under|plus de|moins de/.test(l)) {
    return (/over|plus de/.test(l) ? "Au moins " + but(auMoins(s)) : "Au plus " + but(auPlus(s))) + " dans le match";
  }

  // Marche non prevu : on rend le libelle d'origine plutot qu'une
  // reformulation approximative.
  return brut;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { marketLabelFr, seuilEntier };
}
if (typeof window !== "undefined") {
  window.IasharkMarketLabels = { marketLabelFr: marketLabelFr };
}
