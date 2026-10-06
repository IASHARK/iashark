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
  // 06/10/2026 (paris sur tous les marches) : 2e mi-temps, resultat et double chance de la 1re mi-temps.
  sh_over_one: "2e mi-temps" + NBSP + ": plus de {line} but",
  sh_over_other: "2e mi-temps" + NBSP + ": plus de {line} buts",
  sh_under_one: "2e mi-temps" + NBSP + ": moins de {line} but",
  sh_under_other: "2e mi-temps" + NBSP + ": moins de {line} buts",
  fh_result_win: "1re mi-temps" + NBSP + ": {team} mène",
  fh_result_draw: "1re mi-temps" + NBSP + ": égalité",
  fh_dc_home_or_draw: "1re mi-temps" + NBSP + ": {team} ou égalité",
  fh_dc_draw_or_away: "1re mi-temps" + NBSP + ": égalité ou {team}",
  fh_dc_no_draw: "1re mi-temps" + NBSP + ": pas d'égalité",
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
  player_shots_on_target_named: "{player}" + NBSP + ": tirs cadrés",
  // 06/10/2026 (choix neutre sur tous les marches des bookmakers) : autres marches du releve API-Football, identifies
  // par leur code « F<bet>:<valeur> » (lib/flux-paris.js). fluxLibelle ci-dessous.
  f_period_ht: "{x} (1re mi-temps)",
  f_period_2h: "{x} (2e mi-temps)",
  f_not: "Non" + NBSP + ": {x}",
  f_and: "{a} et {b}",
  f_eh_team: "{team} {line} (handicap à 3 issues)",
  f_eh_draw: "Égalité avec handicap {home} {line} (handicap à 3 issues)",
  f_htft: "Mi-temps" + NBSP + ": {a} / fin" + NBSP + ": {b}",
  f_level: "égalité",
  f_hsh_first: "Plus de buts en 1re mi-temps",
  f_hsh_second: "Plus de buts en 2e mi-temps",
  f_hsh_equal: "Autant de buts dans chaque mi-temps",
  f_team_prefix: "{team}" + NBSP + ": {x}",
  f_odd: "Nombre de buts impair",
  f_even: "Nombre de buts pair",
  f_scoring_draw: "Match nul avec au moins un but",
  f_team_scores_both: "{team} marque dans les deux mi-temps",
  f_btts_both: "Les deux équipes marquent dans chaque mi-temps",
  f_goal_both: "Au moins un but dans chaque mi-temps",
  f_first_team: "{team} marque le premier but",
  f_last_team: "{team} marque le dernier but",
  f_no_goal: "Aucun but",
  f_leads_at: "{team} mène après {n} minutes",
  f_level_at: "Égalité après {n} minutes",
  f_goal_range: "But entre la {a}e et la {b}e minute",
  f_no_goal_range: "Aucun but entre la {a}e et la {b}e minute",
  f_range_over_one: "Plus de {line} but entre la {a}e et la {b}e minute",
  f_range_over_other: "Plus de {line} buts entre la {a}e et la {b}e minute",
  f_range_under_one: "Moins de {line} but entre la {a}e et la {b}e minute",
  f_range_under_other: "Moins de {line} buts entre la {a}e et la {b}e minute"
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
  // Code de marche du flux (« F107:Over 1.5 ») : jamais relu comme un libelle (sinon « plus de 107 buts » et une
  // fausse statistique de face-a-face sous le pari ; avocat du diable, 06/10). Famille « other » = aucune statistique.
  if (/^f\d+:/.test(l)) return out;
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
    if ((m = /^sh-(over|under)-([\d_]+)$/.exec(l))) return { family: "sh", side: null, direction: m[1], line: seuilDepuisSuffixe(m[2]) };
    if ((m = /^fh-(home-win|draw|away-win)$/.exec(l))) return { family: "fh_result", side: m[1] === "draw" ? null : m[1].slice(0, 4), direction: null, line: null };
    if ((m = /^fh-dc-(1x|x2|12)$/.exec(l))) return { family: "fh_dc", side: m[1] === "1x" ? "home" : m[1] === "x2" ? "away" : null, direction: null, line: null };
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
  if (/deuxi[eè]me mi-temps/.test(l) && s !== null) return { family: "sh", side: null, direction: sens, line: s };
  if (/premi[eè]re mi-temps\s+dc\s*(1x|x2|12)/.test(l)) return { family: "fh_dc", side: /1x/.test(l) ? "home" : /x2/.test(l) ? "away" : null, direction: null, line: null };
  if (/premi[eè]re mi-temps\s+(victoire|match nul)/.test(l)) return { family: "fh_result", side: /nul/.test(l) ? null : cote, direction: null, line: null };
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

// AUTRES MARCHES DES BOOKMAKERS (06/10/2026) : code « F<bet>:<valeur> » (lib/flux-paris.js) -> libelle dans la langue.
// Construit a partir du CODE (jamais d'un texte deja redige : relire « Albanie : plus de 1,5 but (2e mi-temps) » comme un
// libelle moteur en faisait « 1re mi-temps... », controle de l'avocat du diable du 06/10). Code inconnu : null.
var F_PER = { ft: "", ht: "f_period_ht", "2h": "f_period_2h" };
var F_RES = { 1: "ft", 13: "ht", 3: "2h" }, F_DC = { 12: "ft", 20: "ht", 33: "2h" }, F_TOT = { 5: "ft", 50: "ft", 6: "ht", 72: "ht", 26: "2h" };
var F_TEAM = { 16: ["home", "ft"], 17: ["away", "ft"], 105: ["home", "ht"], 106: ["away", "ht"], 107: ["home", "2h"], 108: ["away", "2h"] };
var F_AH = { 4: "ft", 19: "ht", 104: "2h" }, F_EH = { 9: "ft", 18: "ht", 181: "2h" }, F_BTTS = { 8: "ft", 34: "ht", 35: "2h" };
var F_HSH = { 11: null, 192: "home", 193: "away" };
var F_OE = { 21: [null, "ft"], 22: [null, "ht"], 63: [null, "2h"], 23: ["home", "ft"], 60: ["away", "ft"] };
var F_MIN = { 54: 10, 136: 15, 139: 30, 137: 60, 138: 75 };
var F_RANGE = { 144: [1, 15], 145: [16, 30], 146: [31, 45], 147: [46, 60], 148: [61, 75], 149: [76, 90] };
var F_RANGE_OU = { 197: [16, 30], 198: [31, 45] };
// Oui / non : [cle du « oui », cote (home/away/null), periode, ligne pour « marque » (plus/moins de 0,5)].
var F_OUI = {
  27: ["team_clean_sheet", "home"], 28: ["team_clean_sheet", "away"], 29: ["team_win_to_nil", "home"], 30: ["team_win_to_nil", "away"],
  37: ["win_both_halves", "home"], 53: ["win_both_halves", "away"], 110: ["f_scoring_draw", null], 111: ["f_team_scores_both", "home"],
  112: ["f_team_scores_both", "away"], 113: ["f_btts_both", null], 184: ["f_goal_both", null],
  43: ["but", "home", "ft"], 44: ["but", "away", "ft"], 114: ["but", "home", "ht"], 115: ["but", "home", "2h"], 116: ["but", "away", "ht"], 117: ["but", "away", "2h"]
};
function decap(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function fluxLibelle(code, equipes, L) {
  var r = /^F(\d+):(.+?)(?:#\d+)?$/.exec(String(code == null ? "" : code).trim());
  if (!r) return null;
  var b = Number(r[1]), v = r[2].trim(), lv = v.toLowerCase();
  var eq = equipesPour(L, equipes);
  var nomDe = function (c) { return c === "home" ? eq.domCourt : c === "away" ? eq.extCourt : null; };
  var per = function (txt, p) { return p && F_PER[p] ? phrase(L, F_PER[p], { x: txt }) : txt; };
  var resultat = function (x) { return x === "draw" ? phrase(L, "result_draw") : x === "home" || x === "away" ? phrase(L, "result_win", { team: x === "home" ? eq.dom : eq.ext }) : null; };
  var ou = function (x) { var m = /^(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(x); return m ? { sens: m[1].toLowerCase(), l: Number(m[2]) } : null; };
  var total = function (o) { return phraseLigne(L, o.sens === "over" ? "total_over" : "total_under", o.l, null, true); };
  var bttsTxt = function (oui) { return phrase(L, oui ? "btts_yes" : "btts_no"); };
  var et = function (a, c) { return a && c ? finaliser(remplir(gabarit(L, "f_and"), { a: a, b: decap(c) })) : null; };
  var m;
  if (F_RES[b] && /^(home|draw|away)$/.test(lv)) return per(resultat(lv), F_RES[b]);
  if (F_DC[b]) {
    var dc = lv === "home/draw" ? doubleChance(L, "home", eq.dom) : lv === "draw/away" ? doubleChance(L, "away", eq.ext) : lv === "home/away" ? phrase(L, "dc_no_draw", { home: eq.dom, away: eq.ext }) : null;
    return dc ? per(dc, F_DC[b]) : null;
  }
  if (F_TOT[b] && (m = ou(v))) return per(total(m), F_TOT[b]);
  if (F_TEAM[b] && (m = ou(v))) return per(phraseLigne(L, m.sens === "over" ? "team_goals_over" : "team_goals_under", m.l, { team: nomDe(F_TEAM[b][0]) }, true), F_TEAM[b][1]);
  if ((F_AH[b] || F_EH[b]) && (m = /^(home|away|draw)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(v))) {
    var cote = m[1].toLowerCase(), l = Number(m[2]);
    if (F_AH[b]) return cote === "draw" ? null : per(handicap(L, nomDe(cote), cote === "home" ? l : -l), F_AH[b]);
    if (cote === "draw") return per(finaliser(remplir(gabarit(L, "f_eh_draw"), { home: eq.domCourt, line: formatHandicap(L, l) })), F_EH[b]);
    return per(finaliser(remplir(gabarit(L, "f_eh_team"), { team: nomDe(cote), line: formatHandicap(L, cote === "home" ? l : -l) })), F_EH[b]);
  }
  if (b === 7 && (m = /^(home|draw|away)\/(home|draw|away)$/.exec(lv))) {
    var qui = function (x) { return x === "draw" ? gabarit(L, "f_level") : nomDe(x); };
    return finaliser(remplir(gabarit(L, "f_htft"), { a: qui(m[1]), b: qui(m[2]) }));
  }
  if (Object.prototype.hasOwnProperty.call(F_HSH, b)) {
    var h = { "1st half": "f_hsh_first", "2nd half": "f_hsh_second", draw: "f_hsh_equal" }[lv];
    if (!h) return null;
    return F_HSH[b] ? phrase(L, "f_team_prefix", { team: nomDe(F_HSH[b]), x: decap(phrase(L, h)) }) : phrase(L, h);
  }
  if (F_BTTS[b] && (lv === "yes" || lv === "no")) return per(bttsTxt(lv === "yes"), F_BTTS[b]);
  if (F_OE[b] && (lv === "odd" || lv === "even")) {
    var oe = phrase(L, lv === "odd" ? "f_odd" : "f_even");
    return per(F_OE[b][0] ? phrase(L, "f_team_prefix", { team: nomDe(F_OE[b][0]), x: decap(oe) }) : oe, F_OE[b][1]);
  }
  if (b === 24 && (m = /^(home|draw|away)\/(yes|no)$/.exec(lv))) return et(resultat(m[1]), bttsTxt(m[2] === "yes"));
  if ((b === 25 || b === 78) && (m = /^(home|draw|away)\/(over|under)\s+(\d+(?:\.\d+)?)$/.exec(lv))) return per(et(resultat(m[1]), total({ sens: m[2], l: Number(m[3]) })), b === 78 ? "ht" : "ft");
  if (b === 49 && (m = /^([ou])\/(yes|no)\s+(\d+(?:\.\d+)?)$/.exec(lv))) return et(total({ sens: m[1] === "o" ? "over" : "under", l: Number(m[3]) }), bttsTxt(m[2] === "yes"));
  if (b === 349) return lv === "under 2 goals" ? total({ sens: "under", l: 1.5 }) : lv === "over 3 goals" ? total({ sens: "over", l: 3.5 }) : null;
  if (F_OUI[b] && (lv === "yes" || lv === "no")) {
    var d = F_OUI[b];
    if (d[0] === "but") return per(phraseLigne(L, lv === "yes" ? "team_goals_over" : "team_goals_under", 0.5, { team: nomDe(d[1]) }, true), d[2]);
    var oui = phrase(L, d[0], { team: d[1] === "home" ? eq.dom : d[1] === "away" ? eq.ext : "" });
    return lv === "yes" ? oui : phrase(L, "f_not", { x: oui });
  }
  if ((b === 14 || b === 15) && /^(home|away|no goal)$/.test(lv)) return lv === "no goal" ? phrase(L, "f_no_goal") : phrase(L, b === 14 ? "f_first_team" : "f_last_team", { team: nomDe(lv) });
  if (F_MIN[b] && /^(home|draw|away)$/.test(lv)) return lv === "draw" ? phrase(L, "f_level_at", { n: F_MIN[b] }) : phrase(L, "f_leads_at", { team: nomDe(lv), n: F_MIN[b] });
  if (F_RANGE[b] && (lv === "yes" || lv === "no")) return phrase(L, lv === "yes" ? "f_goal_range" : "f_no_goal_range", { a: F_RANGE[b][0], b: F_RANGE[b][1] });
  if (F_RANGE_OU[b] && (m = ou(v))) return phraseLigne(L, m.sens === "over" ? "f_range_over" : "f_range_under", m.l, { a: F_RANGE_OU[b][0], b: F_RANGE_OU[b][1] }, true);
  return null;
}

function libelleCore(libelle, equipes, L) {
  if (/^F\d+:/.test(String(libelle == null ? "" : libelle).trim())) { var fl = fluxLibelle(libelle, equipes, L); if (fl) return fl; }
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
  if (/deuxi[eè]me mi-temps/.test(l) && s !== null) {
    return phraseLigne(L, /plus de|over/.test(l) ? "sh_over" : "sh_under", s, null, true);
  }
  var dcMt = /premi[eè]re mi-temps\s+dc\s*(1x|x2|12)/.exec(l);
  if (dcMt) {
    if (dcMt[1] === "1x") return phrase(L, "fh_dc_home_or_draw", { team: dom });
    if (dcMt[1] === "x2") return phrase(L, "fh_dc_draw_or_away", { team: ext });
    return phrase(L, "fh_dc_no_draw", { home: dom, away: ext });
  }
  if (/premi[eè]re mi-temps\s+match nul/.test(l)) return phrase(L, "fh_result_draw");
  if (/premi[eè]re mi-temps\s+victoire/.test(l) && cote) return phrase(L, "fh_result_win", { team: cote === "home" ? dom : ext });
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
  if (/^F\d+:/.test(id)) { var fl = fluxLibelle(id, equipes, L); return fl || id; }
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
    "away-win-both-halves": function () { return phrase(L, "win_both_halves", { team: ext }); },
    "fh-home-win": function () { return phrase(L, "fh_result_win", { team: dom }); },
    "fh-draw": function () { return phrase(L, "fh_result_draw"); },
    "fh-away-win": function () { return phrase(L, "fh_result_win", { team: ext }); },
    "fh-dc-1x": function () { return phrase(L, "fh_dc_home_or_draw", { team: dom }); },
    "fh-dc-x2": function () { return phrase(L, "fh_dc_draw_or_away", { team: ext }); },
    "fh-dc-12": function () { return phrase(L, "fh_dc_no_draw", { home: dom, away: ext }); }
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
    { re: /^sh-(over|under)-([\d_]+)$/, build: function (sens, seuil) { return phraseLigne(L, sens === "over" ? "sh_over" : "sh_under", seuil, null, true); } },
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
    "fh-home-win": "Premiere mi-temps victoire domicile",
    "fh-draw": "Premiere mi-temps match nul",
    "fh-away-win": "Premiere mi-temps victoire exterieur",
    "fh-dc-1x": "Premiere mi-temps DC 1X",
    "fh-dc-x2": "Premiere mi-temps DC X2",
    "fh-dc-12": "Premiere mi-temps DC 12",
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
  if ((m = /^sh-(over|under)-([\d_]+)$/.exec(id))) {
    var s9 = seuilTexte(m[2]);
    return s9 == null ? id : "Deuxieme mi-temps " + (m[1] === "over" ? "plus de " : "moins de ") + s9 + (Number(s9) < 2 ? " but" : " buts");
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
  fluxLibelle: function (code, equipes, opts) { return fluxLibelle(code, equipes, opts ? contexte(opts) : CONTEXTE_FR); },
  seuilEntier: seuilEntier,
  FR_TEMPLATES: FR_TEMPLATES
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
}
if (typeof window !== "undefined") {
  window.IasharkMarketLabels = API;
}
