"use strict";
// Libelles de marches, dans la langue active, ECRITS COMME CHEZ UN BOOKMAKER.
//
// Le moteur produit des libelles internes : "DC 12", "Over 2.5", "BTTS Oui",
// "Premiere mi-temps moins de 1.5 but". Affiches tels quels, ils sortent sans
// accents, avec un point decimal et un vocabulaire d'initie.
//
// REGLE DU PROPRIETAIRE (revision du 14/09/2026, fixtures des tests mises a
// jour deliberement) : un pari s'ecrit comme les parieurs et les bookmakers
// l'ecrivent, court et standard, dans toutes les langues. Jamais une phrase
// ("L'equipe a domicile ne marque pas plus d'un but"), toujours la forme
// courte ("Domicile : moins de 1,5 but", "Leeds : moins de 1,5 but").
//
//   Total de buts      Plus de 2,5 buts            Over 2.5 goals
//   Buts d'une equipe  Leeds : moins de 1,5 but    Leeds under 1.5 goals
//   Les deux marquent  Les deux équipes marquent : Oui   Both teams to score – Yes
//   Resultat           Victoire Leeds / Match nul  Leeds to win / Draw
//   Double chance      Leeds ou nul (double chance) / Nul ou Newcastle (double chance)
//   Rembourse si nul   Leeds (remboursé si nul)    Leeds (draw no bet)
//   Handicap           Leeds -1 (handicap)         Leeds -1 (handicap)
//   Tirs/corners/cartons  Plus de 9,5 tirs cadrés  Over 9.5 shots on target
//   Joueur             Elanga buteur               Anytime goalscorer: Elanga
//
// Couverture : TOUS les market_id du pipeline (.github/workflows/update-data.yml,
// lib/decision.js) - resultat, double chance, rembourse si nul, handicap,
// BTTS, totaux, buts par equipe, victoire + buts, victoire sans encaisser,
// clean sheet, victoire dans les deux mi-temps, 1re mi-temps, tirs, tirs
// cadres, corners, cartons, score exact. Voir tests/market-labels.test.js.
//
// 1. LA LIGNE DU MARCHE EST CONSERVEE, avec le separateur decimal de la langue
//    ("2,5" en francais, "2.5" en anglais et en espagnol du Mexique).
// 2. LE NOM DES EQUIPES plutot que "Domicile" et "Exterieur", quand on les
//    connait. Sans nom : "Extérieur : moins de 1,5 but".
// 3. Espace insecable avant les deux-points en francais.
//
// La traduction se fait a l'AFFICHAGE, jamais dans les donnees : les
// identifiants et libelles stockes restent ceux du moteur, sur lesquels
// s'appuient la selection du marche et le tableau comparatif.
//
// Un libelle non reconnu est renvoye tel quel (seul le separateur decimal est
// adapte a la langue) : mieux vaut le terme d'origine qu'une reformulation
// approximative d'un marche qu'on n'a pas prevu.
//
// i18n. Les gabarits vivent dans le namespace "market_labels" des
// dictionnaires i18n/dict/<locale>.json (alimentes par
// i18n/parts/match.<locale>.json, qui prime sur app.<locale>.json). Ce
// fichier embarque le jeu francais (FR_TEMPLATES), source de
// marketLabelFr()/marketIdLabelFr() et repli sans dictionnaire.
// marketLabel()/marketIdLabel() sont les versions a utiliser pour afficher :
//   - navigateur : langue et gabarits lus dans window.I18N, repli francais ;
//   - Node (pipeline) : passer { locale, dict } explicitement.
//
// Variables des gabarits : {team}, {home}, {away}, {line} (ligne formatee,
// "1,5"), {player}, {score}. {n} vaut {line}, pour les dictionnaires anciens.

var NBSP = "\u00a0";

var FR_TEMPLATES = {
  decimal_separator: ",",
  team_home_generic: "Domicile",
  team_away_generic: "Extérieur",
  team_home_short: "Domicile",
  team_away_short: "Extérieur",
  result_win: "Victoire {team}",
  result_draw: "Match nul",
  // Double chance dans l'ordre du ticket : 1X = "Leeds ou nul", X2 = "Nul ou
  // Newcastle". dc_win_or_draw reste le repli des dictionnaires anciens.
  dc_home_or_draw: "{team} ou nul (double chance)",
  dc_draw_or_away: "Nul ou {team} (double chance)",
  dc_win_or_draw: "{team} ou nul (double chance)",
  dc_no_draw: "{home} ou {away} (double chance)",
  dnb: "{team} (remboursé si nul)",
  handicap: "{team} {line} (handicap)",
  btts_yes: "Les deux équipes marquent" + NBSP + ": Oui",
  btts_no: "Les deux équipes marquent" + NBSP + ": Non",
  fh_over_one: "1re mi-temps" + NBSP + ": plus de {line} but",
  fh_over_other: "1re mi-temps" + NBSP + ": plus de {line} buts",
  fh_under_one: "1re mi-temps" + NBSP + ": moins de {line} but",
  fh_under_other: "1re mi-temps" + NBSP + ": moins de {line} buts",
  win_both_halves: "{team} gagne les deux mi-temps",
  shots_on_over: "Plus de {line} tirs cadrés",
  shots_on_under: "Moins de {line} tirs cadrés",
  shots_over: "Plus de {line} tirs",
  shots_under: "Moins de {line} tirs",
  corners_over: "Plus de {line} corners",
  corners_under: "Moins de {line} corners",
  cards_over: "Plus de {line} cartons",
  cards_under: "Moins de {line} cartons",
  team_clean_sheet: "{team}" + NBSP + ": clean sheet",
  team_win_to_nil: "Victoire {team} sans encaisser",
  team_win_goals_over_one: "Victoire {team} et plus de {line} but",
  team_win_goals_over_other: "Victoire {team} et plus de {line} buts",
  team_win_goals_under_one: "Victoire {team} et moins de {line} but",
  team_win_goals_under_other: "Victoire {team} et moins de {line} buts",
  team_goals_over_one: "{team}" + NBSP + ": plus de {line} but",
  team_goals_over_other: "{team}" + NBSP + ": plus de {line} buts",
  team_goals_under_one: "{team}" + NBSP + ": moins de {line} but",
  team_goals_under_other: "{team}" + NBSP + ": moins de {line} buts",
  total_over_one: "Plus de {line} but",
  total_over_other: "Plus de {line} buts",
  total_under_one: "Moins de {line} but",
  total_under_other: "Moins de {line} buts",
  score_exact: "Score exact" + NBSP + ": {score}",
  player_goalscorer: "Buteur",
  player_shots: "Tirs",
  player_shots_on_target: "Tirs cadrés",
  player_goalscorer_named: "{player} buteur",
  player_shots_named: "{player}" + NBSP + ": tirs",
  player_shots_on_target_named: "{player}" + NBSP + ": tirs cadrés"
};

// Separateur decimal par langue, si le dictionnaire ne le precise pas.
// es-MX ecrit "1.5" (point decimal au Mexique), es-ES "1,5".
var DECIMAL_SEPARATOR = { fr: ",", en: ".", es: ",", "es-mx": ".", de: ",", it: ",", pt: "," };

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
  locale = locale ? String(locale).toLowerCase() : null;
  if (!dictNs || !locale || locale === "fr") return { tpl: FR_TEMPLATES, locale: "fr" };
  return { tpl: dictNs, locale: locale };
}
var CONTEXTE_FR = { tpl: FR_TEMPLATES, locale: "fr" };

function gabarit(L, cle) {
  var v = L.tpl[cle];
  return v != null ? v : FR_TEMPLATES[cle];
}
function separateur(L) {
  if (L.tpl.decimal_separator) return L.tpl.decimal_separator;
  var s = DECIMAL_SEPARATOR[L.locale];
  return s != null ? s : ".";
}
// 2.5 -> "2,5" (fr) / "2.5" (en, es-MX).
function formatLigne(L, v) {
  var txt = String(Math.round(Math.abs(v) * 100) / 100);
  return (v < 0 ? "-" : "") + txt.replace(".", separateur(L));
}
// Ligne de handicap : toujours signee ("-1", "+1,5"), sauf 0.
function formatHandicap(L, v) {
  if (v === 0) return "0";
  return (v > 0 ? "+" : "") + formatLigne(L, v);
}
// Accord du nom apres la ligne : en francais, singulier sous 2 ("1,5 but") ;
// dans les autres langues du site, singulier pour 1 seulement ("1.5 goals").
function formePlurielle(L, base, v) {
  var one = L.locale === "fr" ? Math.abs(v) < 2 : v === 1;
  var cle = base + (one ? "_one" : "_other");
  return L.tpl[cle] != null || FR_TEMPLATES[cle] != null ? gabarit(L, cle) : gabarit(L, base);
}
function remplir(texte, vars) {
  return String(texte).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
}
// Majuscule initiale (les noms propres gardent leur casse : seule la premiere
// lettre est touchee).
function finaliser(texte) {
  if (!texte) return texte;
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
function phrase(L, cle, vars) { return finaliser(remplir(gabarit(L, cle), vars || {})); }
function phraseLigne(L, base, seuil, vars, pluriel) {
  var v = vars || {};
  v.line = formatLigne(L, seuil);
  v.n = v.line;
  return finaliser(remplir(pluriel ? formePlurielle(L, base, seuil) : gabarit(L, base), v));
}

// "2.5" -> 2.5 (nombre lu dans le libelle).
function seuilEntier(texte) {
  var m = String(texte).match(/(\d+(?:[.,_]\d+)?)/);
  if (!m) return null;
  var v = parseFloat(m[1].replace(/[,_]/, "."));
  return Number.isFinite(v) ? v : null;
}
// "-1.5" / "+1" -> nombre signe (handicap).
function seuilSigne(texte) {
  var m = String(texte).match(/([+\-−]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  var v = parseFloat(m[1].replace(/\s/g, "").replace("−", "-").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function equipesPour(L, equipes) {
  var e = equipes || {};
  return {
    dom: e.home || gabarit(L, "team_home_generic"),
    ext: e.away || gabarit(L, "team_away_generic"),
    domCourt: e.home || gabarit(L, "team_home_short"),
    extCourt: e.away || gabarit(L, "team_away_short")
  };
}

function premiereMiTemps(L, sens, seuil) {
  return phraseLigne(L, sens === "over" ? "fh_over" : "fh_under", seuil, null, true);
}
function compteur(L, famille, sens, seuil) {
  return phraseLigne(L, famille + (sens === "over" ? "_over" : "_under"), seuil, null, false);
}
// Double chance cote equipe : "Leeds ou nul" (1X) / "Nul ou Newcastle" (X2).
// Un dictionnaire sans les cles dediees retombe sur dc_win_or_draw.
function doubleChance(L, cote, equipe) {
  var cle = cote === "home" ? "dc_home_or_draw" : "dc_draw_or_away";
  if (L.tpl[cle] == null && L.tpl.dc_win_or_draw != null) cle = "dc_win_or_draw";
  return phrase(L, cle, { team: equipe });
}
function handicap(L, equipe, ligne) {
  return finaliser(remplir(gabarit(L, "handicap"), { team: equipe, line: formatHandicap(L, ligne) }));
}

// Libelle non reconnu : rendu tel quel, separateur decimal de la langue.
function brutLocalise(L, brut) {
  if (separateur(L) === ".") return brut;
  return brut.replace(/(\d)\.(\d)/g, "$1" + separateur(L) + "$2");
}

// Famille d'un libelle moteur (ou d'un id) : sert a la page match pour choisir
// les raisons pertinentes d'un pari, sans reparser le texte affiche.
// { family, side: "home"|"away"|null, direction: "over"|"under"|"yes"|"no"|null, line }
function marketFamily(libelleOuId) {
  var brut = String(libelleOuId == null ? "" : libelleOuId).trim();
  var l = brut.toLowerCase();
  var out = { family: "other", side: null, direction: null, line: null };
  if (!l) return out;
  var s = seuilEntier(brut);
  var id = /^[a-z0-9_-]+$/.test(l) && l.indexOf("-") !== -1 || l === "draw";
  if (id) {
    var m;
    if (l === "home-win" || l === "away-win") return { family: "result", side: l.slice(0, 4) === "home" ? "home" : "away", direction: null, line: null };
    if (l === "draw") return { family: "result", side: null, direction: null, line: null };
    if (/^dc-/.test(l)) return { family: "dc", side: l === "dc-1x" ? "home" : l === "dc-x2" ? "away" : null, direction: null, line: null };
    if (/^btts-/.test(l)) return { family: "btts", side: null, direction: l === "btts-yes" ? "yes" : "no", line: null };
    if ((m = /^(home|away)-dnb$|^dnb-(home|away)$/.exec(l))) return { family: "dnb", side: m[1] || m[2], direction: null, line: null };
    if ((m = /^(home|away)-win-both-halves$/.exec(l))) return { family: "win_both_halves", side: m[1], direction: null, line: null };
    if ((m = /^(home|away)-(clean-sheet|win-to-nil)$/.exec(l))) return { family: m[2] === "clean-sheet" ? "clean_sheet" : "win_to_nil", side: m[1], direction: null, line: null };
    if ((m = /^total-(shots-on-target|shots|corners|cards)-(over|under)-([\d_]+)$/.exec(l))) return { family: { "shots-on-target": "shots_on", shots: "shots", corners: "corners", cards: "cards" }[m[1]], side: null, direction: m[2], line: seuilDepuisSuffixe(m[3]) };
    if ((m = /^fh-(over|under)-([\d_]+)$/.exec(l))) return { family: "fh", side: null, direction: m[1], line: seuilDepuisSuffixe(m[2]) };
    if ((m = /^(home|away)-team-(over|under)-([\d_]+)$/.exec(l))) return { family: "team_goals", side: m[1], direction: m[2], line: seuilDepuisSuffixe(m[3]) };
    if ((m = /^(home|away)-win-(over|under)-([\d_]+)$/.exec(l))) return { family: "win_goals", side: m[1], direction: m[2], line: seuilDepuisSuffixe(m[3]) };
    if ((m = /^(over|under)-([\d_]+)$/.exec(l))) return { family: "total", side: null, direction: m[1], line: seuilDepuisSuffixe(m[2]) };
    if ((m = /^(home|away)-(?:ah|handicap)-(minus|plus|m|p)?-?([\d_]+)$/.exec(l))) return { family: "handicap", side: m[1], direction: null, line: null };
    if (/^(?:exact-score|score)-\d+-\d+$/.test(l)) return { family: "exact_score", side: null, direction: null, line: null };
    return out;
  }
  var cote = /\bdomicile\b/.test(l) ? "home" : /ext[eé]rieur/.test(l) ? "away" : null;
  var sens =/over|plus de/.test(l) ? "over" : /under|moins de/.test(l) ? "under" : null;
  if (l === "victoire domicile") return { family: "result", side: "home", direction: null, line: null };
  if (l === "victoire exterieur" || l === "victoire extérieur") return { family: "result", side: "away", direction: null, line: null };
  if (l === "match nul") return { family: "result", side: null, direction: null, line: null };
  if (/^dc\s*(1x|x2|12)$/.test(l)) return { family: "dc", side: /1x/.test(l) ? "home" : /x2/.test(l) ? "away" : null, direction: null, line: null };
  if (/btts|deux [eé]quipes marquent/.test(l)) return { family: "btts", side: null, direction: /non/.test(l) ? "no" : "yes", line: null };
  if (/draw no bet|\bdnb\b|rembours/.test(l)) return { family: "dnb", side: cote, direction: null, line: null };
  if (/handicap|^ah\b/.test(l)) return { family: "handicap", side: cote, direction: null, line: seuilSigne(brut) };
  if (/score exact/.test(l)) return { family: "exact_score", side: null, direction: null, line: null };
  if (/mi-temps/.test(l) && !/gagne/.test(l) && s !== null) return { family: "fh", side: null, direction: sens, line: s };
  if (/gagne les deux mi-temps/.test(l)) return { family: "win_both_halves", side: cote, direction: null, line: null };
  if (/tirs? cadr/.test(l) && s !== null) return { family: "shots_on", side: null, direction: sens, line: s };
  if (/tirs?/.test(l) && s !== null) return { family: "shots", side: null, direction: sens, line: s };
  if (/corners?/.test(l) && s !== null) return { family: "corners", side: null, direction: sens, line: s };
  if (/cartons?/.test(l) && s !== null) return { family: "cards", side: null, direction: sens, line: s };
  if (cote) {
    if (/clean sheet/.test(l)) return { family: "clean_sheet", side: cote, direction: null, line: null };
    if (/gagne sans encaisser/.test(l)) return { family: "win_to_nil", side: cote, direction: null, line: null };
    if (/gagne \+/.test(l) && s !== null) return { family: "win_goals", side: cote, direction: sens, line: s };
    if (s !== null) return { family: "team_goals", side: cote, direction: sens, line: s };
  }
  if (s !== null && sens) return { family: "total", side: null, direction: sens, line: s };
  return out;
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
  if (/^dc\s*1x$/.test(l)) return doubleChance(L, "home", dom);
  if (/^dc\s*x2$/.test(l)) return doubleChance(L, "away", ext);
  if (/^dc\s*12$/.test(l)) return phrase(L, "dc_no_draw", { home: dom, away: ext });

  // --- Les deux equipes marquent ---
  if (/^btts\s*(oui|yes)$/.test(l) || /deux [eé]quipes marquent\s*:?\s*oui/.test(l)) return phrase(L, "btts_yes");
  if (/^btts\s*(non|no)$/.test(l) || /deux [eé]quipes marquent\s*:?\s*non/.test(l)) return phrase(L, "btts_no");

  // Cote cite n'importe ou dans le libelle ("Handicap Domicile -1", "DNB Exterieur").
  var cote = /\bdomicile\b/.test(l) ? "home" : /ext[eé]rieur/.test(l) ? "away" : null;

  // --- Rembourse si nul / handicap ---
  if (/draw no bet|\bdnb\b|rembours[eé] si nul/.test(l) && cote) {
    return phrase(L, "dnb", { team: cote === "home" ? dom : ext });
  }
  if (/handicap|^ah\b/.test(l) && cote) {
    var ligneH = seuilSigne(brut.replace(/^(ah|handicap)\s*/i, "").replace(/domicile|ext[eé]rieur/i, ""));
    if (ligneH !== null) return handicap(L, cote === "home" ? eq.domCourt : eq.extCourt, ligneH);
  }

  // --- Score exact ---
  var sc = /^score exact\s*:?\s*(\d+)\s*[-–]\s*(\d+)$/.exec(l);
  if (sc) return phrase(L, "score_exact", { score: sc[1] + "-" + sc[2] });

  // --- Mi-temps ---
  if (/mi-temps/.test(l) && s !== null && !/gagne/.test(l)) {
    return premiereMiTemps(L, /plus de|over/.test(l) ? "over" : "under", s);
  }
  if (/gagne les deux mi-temps/.test(l)) {
    return phrase(L, "win_both_halves", { team: /^domicile/.test(l) ? dom : ext });
  }

  // --- Tirs, corners, cartons ---
  var sensOver = /over|plus de/.test(l) ? "over" : "under";
  if (/tirs? cadr/.test(l) && s !== null) return compteur(L, "shots_on", sensOver, s);
  if (/tirs?/.test(l) && s !== null) return compteur(L, "shots", sensOver, s);
  if (/corners?/.test(l) && s !== null) return compteur(L, "corners", sensOver, s);
  if (/cartons?/.test(l) && s !== null) return compteur(L, "cards", sensOver, s);

  // --- Buts d'une equipe, seul ou combine a une victoire ---
  if (/^domicile|^ext[eé]rieur/.test(l)) {
    var cote2 = /^domicile/.test(l) ? "home" : "away";
    var equipe = cote2 === "home" ? dom : ext;
    var equipeCourt = cote2 === "home" ? eq.domCourt : eq.extCourt;
    if (/clean sheet/.test(l)) return phrase(L, "team_clean_sheet", { team: equipe });
    if (/gagne sans encaisser/.test(l)) return phrase(L, "team_win_to_nil", { team: equipe });
    if (/gagne \+/.test(l) && s !== null) {
      return phraseLigne(L, /plus de/.test(l) ? "team_win_goals_over" : "team_win_goals_under", s, { team: equipe }, true);
    }
    if (s !== null) {
      return phraseLigne(L, /plus de/.test(l) ? "team_goals_over" : "team_goals_under", s, { team: equipeCourt }, true);
    }
  }

  // --- Total de buts du match ---
  if (s !== null && /over|under|plus de|moins de/.test(l)) {
    return phraseLigne(L, sensOver === "over" ? "total_over" : "total_under", s, null, true);
  }

  // Marche non prevu : on rend le libelle d'origine plutot qu'une
  // reformulation approximative.
  return brutLocalise(L, brut);
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
    "dc-1x": function () { return doubleChance(L, "home", dom); },
    "dc-x2": function () { return doubleChance(L, "away", ext); },
    "dc-12": function () { return phrase(L, "dc_no_draw", { home: dom, away: ext }); },
    "home-dnb": function () { return phrase(L, "dnb", { team: dom }); },
    "away-dnb": function () { return phrase(L, "dnb", { team: ext }); },
    "dnb-home": function () { return phrase(L, "dnb", { team: dom }); },
    "dnb-away": function () { return phrase(L, "dnb", { team: ext }); },
    "btts-yes": function () { return phrase(L, "btts_yes"); },
    "btts-no": function () { return phrase(L, "btts_no"); },
    "home-win-to-nil": function () { return phrase(L, "team_win_to_nil", { team: dom }); },
    "away-win-to-nil": function () { return phrase(L, "team_win_to_nil", { team: ext }); },
    "home-clean-sheet": function () { return phrase(L, "team_clean_sheet", { team: dom }); },
    "away-clean-sheet": function () { return phrase(L, "team_clean_sheet", { team: ext }); },
    "home-win-both-halves": function () { return phrase(L, "win_both_halves", { team: dom }); },
    "away-win-both-halves": function () { return phrase(L, "win_both_halves", { team: ext }); }
  };
  if (Object.prototype.hasOwnProperty.call(direct, id)) return direct[id]();

  var ah = /^(home|away)-(?:ah|handicap)-(minus|plus|m|p)?-?([\d_]+)$/.exec(id);
  if (ah) {
    var brutH = ah[3].indexOf("_") !== -1 ? parseFloat(ah[3].replace("_", ".")) : parseFloat(ah[3]);
    if (Number.isFinite(brutH)) {
      var signe = ah[2] === "plus" || ah[2] === "p" ? 1 : -1;
      return handicap(L, ah[1] === "home" ? eq.domCourt : eq.extCourt, signe * brutH);
    }
  }
  var score = /^(?:exact-score|score)-(\d+)-(\d+)$/.exec(id);
  if (score) return phrase(L, "score_exact", { score: score[1] + "-" + score[2] });

  var famille = function (nom) {
    return function (sens, seuil) { return compteur(L, nom, sens, seuil); };
  };
  var patterns = [
    { re: /^total-shots-on-target-(over|under)-([\d_]+)$/, build: famille("shots_on") },
    { re: /^total-shots-(over|under)-([\d_]+)$/, build: famille("shots") },
    { re: /^total-corners-(over|under)-([\d_]+)$/, build: famille("corners") },
    { re: /^total-cards-(over|under)-([\d_]+)$/, build: famille("cards") },
    { re: /^fh-(over|under)-([\d_]+)$/, build: function (sens, seuil) { return premiereMiTemps(L, sens, seuil); } },
    { re: /^(home|away)-team-(over|under)-([\d_]+)$/, build: function (sens, seuil, cote) {
      var equipeCible = cote === "home" ? eq.domCourt : eq.extCourt;
      return phraseLigne(L, sens === "over" ? "team_goals_over" : "team_goals_under", seuil, { team: equipeCible }, true);
    }},
    { re: /^(home|away)-win-(over|under)-([\d_]+)$/, build: function (sens, seuil, cote) {
      var equipeCombo = cote === "home" ? dom : ext;
      return phraseLigne(L, sens === "over" ? "team_win_goals_over" : "team_win_goals_under", seuil, { team: equipeCombo }, true);
    }},
    { re: /^(over|under)-([\d_]+)$/, build: function (sens, seuil) {
      return phraseLigne(L, sens === "over" ? "total_over" : "total_under", seuil, null, true);
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

// Score exact dans la forme standard ("Score exact : 1-1", "Correct score: 1-1").
function exactScoreLabel(score, opts) {
  var s = String(score == null ? "" : score).replace(/\s/g, "").replace("–", "-");
  return /^\d+-\d+$/.test(s) ? phrase(contexte(opts), "score_exact", { score: s }) : String(score == null ? "" : score);
}

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
// Avec le nom du joueur : "Elanga buteur", "Anytime goalscorer: Elanga".
function playerMarketLabelFor(code, player, opts) {
  var cle = PLAYER_MARKET_KEYS[code];
  var nom = String(player == null ? "" : player).trim();
  if (!cle) return String(code == null ? "" : code);
  if (!nom) return playerMarketLabel(code, opts);
  var L = contexte(opts);
  return remplir(gabarit(L, cle + "_named"), { player: nom });
}

// Convertit un market_id vers le format de libelle "moteur" que
// marketLabelFr() sait deja parser (celui qu'occupait raw.pari_rec avant
// que le moteur deterministe ne le remplace par market_id/marche). Utilise
// par match-view-model.js pour que recommendation.market reste au format
// attendu par TOUS les appelants existants. Ce n'est PAS un texte affiche :
// il ne se traduit jamais (sortie inchangee par la revision du 14/09/2026).
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
    "home-win-both-halves": "Domicile gagne les deux mi-temps",
    "away-win-both-halves": "Exterieur gagne les deux mi-temps",
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
  if ((m = /^total-(corners|cards)-(over|under)-([\d_]+)$/.exec(id))) {
    var s7 = seuilTexte(m[3]);
    return s7 == null ? id : sensMot(m[2]) + " " + s7 + (m[1] === "corners" ? " corners" : " cartons");
  }
  if ((m = /^(home|away)-dnb$|^dnb-(home|away)$/.exec(id))) {
    return "DNB " + ((m[1] || m[2]) === "home" ? "Domicile" : "Exterieur");
  }
  if ((m = /^(home|away)-(?:ah|handicap)-(minus|plus|m|p)?-?([\d_]+)$/.exec(id))) {
    var brut8 = parseFloat(m[3].replace("_", "."));
    if (Number.isFinite(brut8)) {
      var signe8 = m[2] === "plus" || m[2] === "p" ? "+" : "-";
      return "Handicap " + (m[1] === "home" ? "Domicile" : "Exterieur") + " " + signe8 + String(brut8);
    }
  }
  if ((m = /^(?:exact-score|score)-(\d+)-(\d+)$/.exec(id))) return "Score exact " + m[1] + "-" + m[2];
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
  playerMarketLabelFor: playerMarketLabelFor,
  exactScoreLabel: exactScoreLabel,
  marketFamily: marketFamily,
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
