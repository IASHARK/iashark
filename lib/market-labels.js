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

// Meme objectif que marketLabelFr, mais pour l'identifiant technique du
// moteur deterministe (lib/decision.js#pickMarketDeterministic / donnees
// reelles du pipeline), du type "btts-yes", "over-25" ou
// "total-shots-on-target-over-7_5" - jamais le libelle bookmaker
// "BTTS Oui" que marketLabelFr sait parser. Mapping direct plutot que de
// reformater l'id en libelle bookmaker puis le reparser : moins fragile,
// un seul endroit a maintenir quand le moteur gagne un nouveau marche.
//
// Deux conventions de seuil coexistent dans les ids reels, gerees par
// seuilDepuisSuffixe ci-dessous :
//   - buts/mi-temps : dernier chiffre = decimale, le reste = partie
//     entiere ("25" -> 2.5, "35" -> 3.5) ;
//   - tirs : underscore explicite ("26_5" -> 26.5).
function seuilDepuisSuffixe(suffixe) {
  if (suffixe.indexOf("_") !== -1) {
    var v = parseFloat(suffixe.replace("_", "."));
    return Number.isFinite(v) ? v : null;
  }
  if (!/^\d+$/.test(suffixe) || suffixe.length < 2) return null;
  var v2 = parseFloat(suffixe.slice(0, -1) + "." + suffixe.slice(-1));
  return Number.isFinite(v2) ? v2 : null;
}

function marketIdLabelFr(marketId, equipes) {
  var id = String(marketId == null ? "" : marketId).trim();
  if (!id) return id;
  var e = equipes || {};
  var dom = e.home || "l’équipe à domicile";
  var ext = e.away || "l’équipe à l’extérieur";

  var direct = {
    "home-win": "Victoire de " + dom,
    "draw": "Match nul",
    "away-win": "Victoire de " + ext,
    "dc-1x": dom + " gagne ou match nul",
    "dc-x2": ext + " gagne ou match nul",
    "dc-12": dom + " ou " + ext + " gagne, sans match nul",
    "btts-yes": "Les deux équipes marquent",
    "btts-no": "Au moins une équipe ne marque pas",
    "home-win-to-nil": dom + " gagne sans encaisser de but",
    "away-win-to-nil": ext + " gagne sans encaisser de but",
    "home-clean-sheet": dom + " n’encaisse aucun but",
    "away-clean-sheet": ext + " n’encaisse aucun but",
  };
  if (direct[id]) return direct[id];

  var patterns = [
    { re: /^total-shots-on-target-(over|under)-([\d_]+)$/, build: function(sens, seuil) {
      return (sens === "over" ? "Au moins " + auMoins(seuil) : "Au plus " + auPlus(seuil)) + " tirs cadrés dans le match";
    }},
    { re: /^total-shots-(over|under)-([\d_]+)$/, build: function(sens, seuil) {
      return (sens === "over" ? "Au moins " + auMoins(seuil) : "Au plus " + auPlus(seuil)) + " tirs dans le match";
    }},
    { re: /^fh-(over|under)-([\d_]+)$/, build: function(sens, seuil) {
      return sens === "over"
        ? (auMoins(seuil) === 1 ? "Au moins 1 but en première mi-temps" : "Au moins " + but(auMoins(seuil)) + " en première mi-temps")
        : (auPlus(seuil) === 0 ? "Aucun but en première mi-temps" : "Au plus " + but(auPlus(seuil)) + " en première mi-temps");
    }},
    { re: /^(home|away)-team-(over|under)-([\d_]+)$/, build: function(sens, seuil, cote) {
      var equipeCible = cote === "home" ? dom : ext;
      return equipeCible + " marque " + (sens === "over" ? "au moins " + but(auMoins(seuil)) : "au plus " + but(auPlus(seuil)));
    }},
    { re: /^(home|away)-win-(over|under)-([\d_]+)$/, build: function(sens, seuil, cote) {
      var equipeCombo = cote === "home" ? dom : ext;
      return equipeCombo + " gagne et " + (sens === "over" ? "au moins " + but(auMoins(seuil)) : "au plus " + but(auPlus(seuil))) + " dans le match";
    }},
    { re: /^(over|under)-([\d_]+)$/, build: function(sens, seuil) {
      return (sens === "over" ? "Au moins " + but(auMoins(seuil)) : "Au plus " + but(auPlus(seuil))) + " dans le match";
    }},
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i].re.exec(id);
    if (!m) continue;
    // Les motifs a 3 groupes ont (equipe, sens, seuil) ; les autres (sens, seuil).
    var hasEquipe = m.length === 4;
    var sens = hasEquipe ? m[2] : m[1];
    var suffixe = hasEquipe ? m[3] : m[2];
    var seuil = seuilDepuisSuffixe(suffixe);
    if (seuil == null) continue;
    return hasEquipe ? patterns[i].build(sens, seuil, m[1]) : patterns[i].build(sens, seuil);
  }

  // Id non reconnu (nouveau marche ajoute cote moteur, pas encore
  // mappe ici) : on rend l'id tel quel plutot qu'une traduction
  // fausse - visible et signalable, jamais silencieux.
  return id;
}

// Convertit un market_id vers le format de libelle "moteur" que
// marketLabelFr() sait deja parser (celui qu'occupait raw.pari_rec avant
// que le moteur deterministe ne le remplace par market_id/marche). Utilise
// par match-view-model.js pour que recommendation.market reste au format
// attendu par TOUS les appelants existants de marcheFr()/marketLabelFr()
// dans match-page.js, sans les toucher.
//
// N'utilise JAMAIS "over"/"under" pour les seuils par equipe, tirs ou
// mi-temps : ces branches de marketLabelFr ne reconnaissent que "plus
// de"/"moins de" pour le sens (seul le total du match accepte aussi
// "over"). Passer "over" a ces branches inverse silencieusement le sens
// (deja constate ici avant correction - voir tests).
function marketIdToEngineLabel(marketId) {
  var id = String(marketId == null ? "" : marketId).trim();
  if (!id) return id;

  var direct = {
    "home-win": "Victoire domicile",
    "draw": "Match nul",
    "away-win": "Victoire exterieur",
    "dc-1x": "DC 1X",
    "dc-x2": "DC X2",
    "dc-12": "DC 12",
    "btts-yes": "BTTS Oui",
    "btts-no": "BTTS Non",
    "home-win-to-nil": "Domicile gagne sans encaisser",
    "away-win-to-nil": "Exterieur gagne sans encaisser",
    "home-clean-sheet": "Domicile clean sheet",
    "away-clean-sheet": "Exterieur clean sheet",
  };
  if (direct[id]) return direct[id];

  function seuilTexte(suffixe) {
    var v = seuilDepuisSuffixe(suffixe);
    return v == null ? null : String(v);
  }
  function sensMot(sens) { return sens === "over" ? "Plus de" : "Moins de"; }

  var m;
  if ((m = /^total-shots-on-target-(over|under)-([\d_]+)$/.exec(id))) {
    var s1 = seuilTexte(m[2]);
    return s1 == null ? id : sensMot(m[1]) + " " + s1 + " tirs cadres";
  }
  if ((m = /^total-shots-(over|under)-([\d_]+)$/.exec(id))) {
    var s2 = seuilTexte(m[2]);
    return s2 == null ? id : sensMot(m[1]) + " " + s2 + " tirs";
  }
  if ((m = /^fh-(over|under)-([\d_]+)$/.exec(id))) {
    var s3 = seuilTexte(m[2]);
    // Seule branche mi-temps de marketLabelFr a accepter "over" pour le sens.
    return s3 == null ? id : "Premiere mi-temps " + (m[1] === "over" ? "Over " + s3 : "Under " + s3);
  }
  if ((m = /^(home|away)-team-(over|under)-([\d_]+)$/.exec(id))) {
    var s4 = seuilTexte(m[3]);
    var equipe4 = m[1] === "home" ? "Domicile" : "Exterieur";
    return s4 == null ? id : equipe4 + " " + sensMot(m[2]) + " " + s4;
  }
  if ((m = /^(home|away)-win-(over|under)-([\d_]+)$/.exec(id))) {
    var s5 = seuilTexte(m[3]);
    var equipe5 = m[1] === "home" ? "Domicile" : "Exterieur";
    return s5 == null ? id : equipe5 + " gagne + " + sensMot(m[2]) + " " + s5;
  }
  if ((m = /^(over|under)-([\d_]+)$/.exec(id))) {
    var s6 = seuilTexte(m[2]);
    // Seule branche a accepter "Over"/"Under" directement (total du match).
    return s6 == null ? id : (m[1] === "over" ? "Over " : "Under ") + s6;
  }

  return id;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { marketLabelFr, marketIdLabelFr, marketIdToEngineLabel, seuilEntier };
}
if (typeof window !== "undefined") {
  window.IasharkMarketLabels = { marketLabelFr: marketLabelFr, marketIdLabelFr: marketIdLabelFr, marketIdToEngineLabel: marketIdToEngineLabel };
}
