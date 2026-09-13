"use strict";
// Libelles de marches en langage courant, dans la langue active.
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
//
// i18n (13/09/2026). Les phrases vivent dans des GABARITS (namespace
// "market_labels" des dictionnaires i18n/dict/<locale>.json, alimentes par
// i18n/parts/app.<locale>.json). Ce fichier embarque seulement le jeu
// francais (FR_TEMPLATES), qui sert :
//   - de source a marketLabelFr()/marketIdLabelFr(), dont la sortie reste
//     STRICTEMENT identique a l'ancienne version (tests et appelants
//     existants) ;
//   - de repli quand aucun dictionnaire n'est disponible.
// marketLabel()/marketIdLabel() sont les versions a utiliser pour afficher :
//   - navigateur : langue et gabarits lus dans window.I18N (une fois
//     I18N.init() resolu), repli francais sinon ;
//   - Node (pipeline) : passer { locale, dict } explicitement.

var FR_TEMPLATES = {
  team_home_generic: "l’équipe à domicile",
  team_away_generic: "l’équipe à l’extérieur",
  result_win: "Victoire de {team}",
  result_draw: "Match nul",
  dc_win_or_draw: "{team} gagne ou match nul",
  dc_no_draw: "{home} ou {away} gagne, sans match nul",
  btts_yes: "Les deux équipes marquent",
  btts_no: "Au moins une équipe ne marque pas",
  fh_over_one: "Au moins {n} but en première mi-temps",
  fh_over_other: "Au moins {n} buts en première mi-temps",
  fh_under_zero: "Aucun but en première mi-temps",
  fh_under_one: "Au plus {n} but en première mi-temps",
  fh_under_other: "Au plus {n} buts en première mi-temps",
  win_both_halves: "{team} gagne les deux mi-temps",
  shots_on_over: "Au moins {n} tirs cadrés dans le match",
  shots_on_under: "Au plus {n} tirs cadrés dans le match",
  shots_over: "Au moins {n} tirs dans le match",
  shots_under: "Au plus {n} tirs dans le match",
  corners_over: "Au moins {n} corners dans le match",
  corners_under: "Au plus {n} corners dans le match",
  cards_over: "Au moins {n} cartons dans le match",
  cards_under: "Au plus {n} cartons dans le match",
  team_clean_sheet: "{team} n’encaisse aucun but",
  team_win_to_nil: "{team} gagne sans encaisser de but",
  team_win_goals_over_one: "{team} gagne et au moins {n} but dans le match",
  team_win_goals_over_other: "{team} gagne et au moins {n} buts dans le match",
  team_win_goals_under_one: "{team} gagne et au plus {n} but dans le match",
  team_win_goals_under_other: "{team} gagne et au plus {n} buts dans le match",
  team_goals_over_one: "{team} marque au moins {n} but",
  team_goals_over_other: "{team} marque au moins {n} buts",
  team_goals_under_one: "{team} marque au plus {n} but",
  team_goals_under_other: "{team} marque au plus {n} buts",
  total_over_one: "Au moins {n} but dans le match",
  total_over_other: "Au moins {n} buts dans le match",
  total_under_one: "Au plus {n} but dans le match",
  total_under_other: "Au plus {n} buts dans le match",
  player_goalscorer: "Buteur",
  player_shots: "Tirs",
  player_shots_on_target: "Tirs cadrés"
};

// Contexte de langue : { tpl, locale }. `opts` explicite (pipeline Node) >
// window.I18N (navigateur) > francais embarque.
function contexte(opts) {
  var dictNs = null, locale = null;
  if (opts && (opts.dict || opts.locale)) {
    dictNs = opts.dict ? (opts.dict.market_labels || opts.dict) : null;
    locale = opts.locale || null;
  } else if (typeof window !== "undefined" && window.I18N && window.I18N.dict) {
    dictNs = window.I18N.dict.market_labels || null;
    locale = window.I18N.locale || null;
  }
  if (!dictNs || !locale || locale === "fr") return { tpl: FR_TEMPLATES, locale: "fr" };
  return { tpl: dictNs, locale: locale };
}
var CONTEXTE_FR = { tpl: FR_TEMPLATES, locale: "fr" };

function gabarit(L, cle) {
  var v = L.tpl[cle];
  return v != null ? v : FR_TEMPLATES[cle];
}
// Pluriel : en francais, 0 et 1 sont au singulier ("au plus 0 but",
// comportement historique) ; dans les autres langues du site, seul 1 l'est.
function formePlurielle(L, base, n) {
  var one = L.locale === "fr" ? n <= 1 : n === 1;
  var cle = base + (one ? "_one" : "_other");
  return L.tpl[cle] != null || FR_TEMPLATES[cle] != null ? gabarit(L, cle) : gabarit(L, base);
}
function remplir(texte, vars) {
  return String(texte).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
}
// Les gabarits non francais commencent parfois par un nom d'equipe generique
// en minuscule ("the home team...") : on met la premiere lettre en capitale.
// Jamais en francais, pour garder la sortie historique a l'identique.
function finaliser(L, texte) {
  if (L.locale === "fr" || !texte) return texte;
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
function phrase(L, cle, vars) { return finaliser(L, remplir(gabarit(L, cle), vars || {})); }
function phrasePlurielle(L, base, n, vars) {
  var v = vars || {};
  v.n = n;
  return finaliser(L, remplir(formePlurielle(L, base, n), v));
}

// "2.5" -> 2.5 (nombre lu dans le libelle).
function seuilEntier(texte) {
  var m = String(texte).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  var v = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function auMoins(seuil) { return Math.floor(seuil) + 1; }
function auPlus(seuil) { return Math.floor(seuil); }

function equipesPour(L, equipes) {
  var e = equipes || {};
  return {
    dom: e.home || gabarit(L, "team_home_generic"),
    ext: e.away || gabarit(L, "team_away_generic")
  };
}

function premiereMiTemps(L, sens, seuil) {
  if (sens === "over") return phrasePlurielle(L, "fh_over", auMoins(seuil));
  return auPlus(seuil) === 0 ? phrase(L, "fh_under_zero") : phrasePlurielle(L, "fh_under", auPlus(seuil));
}

function libelleCore(libelle, equipes, L) {
  var brut = String(libelle == null ? "" : libelle).trim();
  if (!brut) return brut;
  var eq = equipesPour(L, equipes);
  var dom = eq.dom, ext = eq.ext;
  var l = brut.toLowerCase();
  var s = seuilEntier(brut);

  // --- Resultat ---
  if (l === "victoire domicile") return phrase(L, "result_win", { team: dom });
  if (l === "victoire exterieur" || l === "victoire extérieur") return phrase(L, "result_win", { team: ext });
  if (l === "match nul") return phrase(L, "result_draw");

  // --- Double chance ---
  if (/^dc\s*1x$/.test(l)) return phrase(L, "dc_win_or_draw", { team: dom });
  if (/^dc\s*x2$/.test(l)) return phrase(L, "dc_win_or_draw", { team: ext });
  if (/^dc\s*12$/.test(l)) return phrase(L, "dc_no_draw", { home: dom, away: ext });

  // --- Les deux equipes marquent ---
  if (/^btts\s*oui$/.test(l) || /deux [eé]quipes marquent oui/.test(l)) return phrase(L, "btts_yes");
  if (/^btts\s*non$/.test(l) || /deux [eé]quipes marquent non/.test(l)) return phrase(L, "btts_no");

  // --- Mi-temps ---
  if (/mi-temps/.test(l) && s !== null && !/gagne/.test(l)) {
    return premiereMiTemps(L, /plus de|over/.test(l) ? "over" : "under", s);
  }
  if (/gagne les deux mi-temps/.test(l)) {
    return phrase(L, "win_both_halves", { team: /^domicile/.test(l) ? dom : ext });
  }

  // --- Tirs, corners, cartons ---
  var sensOver = /over|plus de/.test(l);
  if (/tirs? cadr/.test(l) && s !== null) {
    return phrase(L, sensOver ? "shots_on_over" : "shots_on_under", { n: sensOver ? auMoins(s) : auPlus(s) });
  }
  if (/tirs?/.test(l) && s !== null) {
    return phrase(L, sensOver ? "shots_over" : "shots_under", { n: sensOver ? auMoins(s) : auPlus(s) });
  }
  if (/corners?/.test(l) && s !== null) {
    return phrase(L, sensOver ? "corners_over" : "corners_under", { n: sensOver ? auMoins(s) : auPlus(s) });
  }
  if (/cartons?/.test(l) && s !== null) {
    return phrase(L, sensOver ? "cards_over" : "cards_under", { n: sensOver ? auMoins(s) : auPlus(s) });
  }

  // --- Buts d'une equipe, seul ou combine a une victoire ---
  var equipe = /^domicile/.test(l) ? dom : /^ext[eé]rieur/.test(l) ? ext : null;
  if (equipe) {
    if (/clean sheet/.test(l)) return phrase(L, "team_clean_sheet", { team: equipe });
    if (/gagne sans encaisser/.test(l)) return phrase(L, "team_win_to_nil", { team: equipe });
    if (/gagne \+/.test(l) && s !== null) {
      return /plus de/.test(l)
        ? phrasePlurielle(L, "team_win_goals_over", auMoins(s), { team: equipe })
        : phrasePlurielle(L, "team_win_goals_under", auPlus(s), { team: equipe });
    }
    if (s !== null) {
      return /plus de/.test(l)
        ? phrasePlurielle(L, "team_goals_over", auMoins(s), { team: equipe })
        : phrasePlurielle(L, "team_goals_under", auPlus(s), { team: equipe });
    }
  }

  // --- Total de buts du match ---
  if (s !== null && /over|under|plus de|moins de/.test(l)) {
    return sensOver ? phrasePlurielle(L, "total_over", auMoins(s)) : phrasePlurielle(L, "total_under", auPlus(s));
  }

  // Marche non prevu : on rend le libelle d'origine plutot qu'une
  // reformulation approximative.
  return brut;
}

// Meme objectif, mais pour l'identifiant technique du moteur deterministe
// (lib/decision.js#pickMarketDeterministic / donnees reelles du pipeline),
// du type "btts-yes", "over-25" ou "total-shots-on-target-over-7_5" - jamais
// le libelle bookmaker "BTTS Oui". Mapping direct plutot que de reformater
// l'id en libelle bookmaker puis le reparser : moins fragile.
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

function idLibelleCore(marketId, equipes, L) {
  var id = String(marketId == null ? "" : marketId).trim();
  if (!id) return id;
  var eq = equipesPour(L, equipes);
  var dom = eq.dom, ext = eq.ext;

  var direct = {
    "home-win": function () { return phrase(L, "result_win", { team: dom }); },
    "draw": function () { return phrase(L, "result_draw"); },
    "away-win": function () { return phrase(L, "result_win", { team: ext }); },
    "dc-1x": function () { return phrase(L, "dc_win_or_draw", { team: dom }); },
    "dc-x2": function () { return phrase(L, "dc_win_or_draw", { team: ext }); },
    "dc-12": function () { return phrase(L, "dc_no_draw", { home: dom, away: ext }); },
    "btts-yes": function () { return phrase(L, "btts_yes"); },
    "btts-no": function () { return phrase(L, "btts_no"); },
    "home-win-to-nil": function () { return phrase(L, "team_win_to_nil", { team: dom }); },
    "away-win-to-nil": function () { return phrase(L, "team_win_to_nil", { team: ext }); },
    "home-clean-sheet": function () { return phrase(L, "team_clean_sheet", { team: dom }); },
    "away-clean-sheet": function () { return phrase(L, "team_clean_sheet", { team: ext }); }
  };
  if (Object.prototype.hasOwnProperty.call(direct, id)) return direct[id]();

  var compteur = function (cleOver, cleUnder) {
    return function (sens, seuil) {
      return phrase(L, sens === "over" ? cleOver : cleUnder, { n: sens === "over" ? auMoins(seuil) : auPlus(seuil) });
    };
  };
  var patterns = [
    { re: /^total-shots-on-target-(over|under)-([\d_]+)$/, build: compteur("shots_on_over", "shots_on_under") },
    { re: /^total-shots-(over|under)-([\d_]+)$/, build: compteur("shots_over", "shots_under") },
    { re: /^total-corners-(over|under)-([\d_]+)$/, build: compteur("corners_over", "corners_under") },
    { re: /^total-cards-(over|under)-([\d_]+)$/, build: compteur("cards_over", "cards_under") },
    { re: /^fh-(over|under)-([\d_]+)$/, build: function (sens, seuil) { return premiereMiTemps(L, sens, seuil); } },
    { re: /^(home|away)-team-(over|under)-([\d_]+)$/, build: function (sens, seuil, cote) {
      var equipeCible = cote === "home" ? dom : ext;
      return sens === "over"
        ? phrasePlurielle(L, "team_goals_over", auMoins(seuil), { team: equipeCible })
        : phrasePlurielle(L, "team_goals_under", auPlus(seuil), { team: equipeCible });
    }},
    { re: /^(home|away)-win-(over|under)-([\d_]+)$/, build: function (sens, seuil, cote) {
      var equipeCombo = cote === "home" ? dom : ext;
      return sens === "over"
        ? phrasePlurielle(L, "team_win_goals_over", auMoins(seuil), { team: equipeCombo })
        : phrasePlurielle(L, "team_win_goals_under", auPlus(seuil), { team: equipeCombo });
    }},
    { re: /^(over|under)-([\d_]+)$/, build: function (sens, seuil) {
      return sens === "over" ? phrasePlurielle(L, "total_over", auMoins(seuil)) : phrasePlurielle(L, "total_under", auPlus(seuil));
    }}
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

  // Id non reconnu (nouveau marche ajoute cote moteur, pas encore mappe
  // ici) : on rend l'id tel quel plutot qu'une traduction fausse - visible
  // et signalable, jamais silencieux.
  return id;
}

// API historique : TOUJOURS en francais, quelle que soit la langue de la page.
function marketLabelFr(libelle, equipes) { return libelleCore(libelle, equipes, CONTEXTE_FR); }
function marketIdLabelFr(marketId, equipes) { return idLibelleCore(marketId, equipes, CONTEXTE_FR); }

// API d'affichage : dans la langue active (voir contexte()).
function marketLabel(libelle, equipes, opts) { return libelleCore(libelle, equipes, contexte(opts)); }
function marketIdLabel(marketId, equipes, opts) { return idLibelleCore(marketId, equipes, contexte(opts)); }

// Marches joueur du Player Engine (codes stables du pipeline).
var PLAYER_MARKET_KEYS = {
  ANYTIME_GOALSCORER: "player_goalscorer",
  PLAYER_SHOTS: "player_shots",
  PLAYER_SHOTS_ON_TARGET: "player_shots_on_target"
};
function playerMarketLabel(code, opts) {
  var cle = PLAYER_MARKET_KEYS[code];
  return cle ? phrase(contexte(opts), cle) : String(code == null ? "" : code);
}

// Convertit un market_id vers le format de libelle "moteur" que
// marketLabelFr() sait deja parser (celui qu'occupait raw.pari_rec avant
// que le moteur deterministe ne le remplace par market_id/marche). Utilise
// par match-view-model.js pour que recommendation.market reste au format
// attendu par TOUS les appelants existants. Ce n'est PAS un texte affiche :
// il ne se traduit jamais.
//
// N'utilise JAMAIS "over"/"under" pour les seuils par equipe, tirs ou
// mi-temps : ces branches ne reconnaissent que "plus de"/"moins de" pour le
// sens (seul le total du match accepte aussi "over"). Passer "over" a ces
// branches inverse silencieusement le sens (deja constate ici avant
// correction - voir tests).
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
    // Seule branche mi-temps a accepter "over" pour le sens.
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

var API = {
  marketLabelFr: marketLabelFr,
  marketIdLabelFr: marketIdLabelFr,
  marketLabel: marketLabel,
  marketIdLabel: marketIdLabel,
  playerMarketLabel: playerMarketLabel,
  marketIdToEngineLabel: marketIdToEngineLabel,
  seuilEntier: seuilEntier,
  FR_TEMPLATES: FR_TEMPLATES
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
}
if (typeof window !== "undefined") {
  window.IasharkMarketLabels = API;
}
