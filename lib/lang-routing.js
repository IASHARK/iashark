"use strict";
// IASHARK — aiguillage automatique de la RACINE "/" par pays puis par langue
// du navigateur (demande du proprietaire du 19/09/2026 : « quand quelqu'un
// vient d'un autre pays, qu'on lui mette sa langue direct »).
//
// Source unique des regles "/" de _redirects : scripts/build-locales.js les
// ecrit a partir de rootRedirectRules() ; tests/lang-routing.test.js verifie
// que _redirects contient exactement ces regles, dans cet ordre, et rejoue
// l'algorithme de Netlify (routeRoot) pays par pays.
//
// Module Node uniquement (build + tests) : jamais charge par une page, donc
// jamais publie dans dist/ (scripts/build-public.js ne copie que les fichiers
// references par une page ou un script publie).
//
// Semantique Netlify (docs.netlify.com, « Redirect by country or language »,
// relue le 19/09/2026) :
// - Country = code ISO 3166-1 alpha-2 deduit de l'IP (GeoIP), remplace par le
//   cookie nf_country s'il existe ;
// - Language = PREMIERE langue de l'en-tete Accept-Language, quel que soit son
//   poids q (remplacee par le cookie nf_lang s'il existe) ; "de" couvre aussi
//   de-CH, de-AT... (sous-etiquettes de region traitees hierarchiquement) ;
// - Country et Language sur une meme regle : les deux doivent correspondre ;
// - la premiere regle qui correspond gagne ; "!" (force) obligatoire car un
//   index.html existe a la racine ;
// - aucun parametre d'URL ne permet de simuler un pays (seulement les cookies).
//
// Principe (ordre des blocs = ordre des regles) :
//   1. marches pays a devise propre (config/markets.json : gb GBP, za ZAR,
//      mx MXN) : le pays decide seul, quelle que soit la langue du
//      navigateur (prix, CGV et aide au jeu du pays) ;
//   2. pays multilingues : pays + langue du navigateur (Suisse, Belgique,
//      Luxembourg, Canada, Cameroun...) ;
//   3. pays -> langue principale du pays (versions EUR internationales /fr/
//      /es/ /pt/ /de/ /it/ /en/) ;
//   4. autres pays : langue du navigateur si le site la propose ;
//   5. pays dont la langue n'a pas de version (nl, sv, pl, ja...) : /en/,
//      comme le x-default hreflang (config/markets.json#_hreflangXDefault) ;
//   6. tout le reste (pays inconnu, langue non proposee) : /fr/ (repertoire
//      historique, config/markets.json#_xDefaultDir), comme avant.
// Jamais de regle pays/langue ailleurs que sur "/" exactement : les pages
// profondes ne sont JAMAIS redirigees selon le visiteur (seulement un bandeau
// de suggestion cote navigateur, lib/lang-suggest.js).

// 1. Marches pays a devise propre. Un pays n'y figure que s'il est le "country"
// d'un marche de config/markets.json (verifie par le test) : un visiteur n'est
// jamais envoye vers une devise/offre qui ne s'applique pas a lui.
var MARKET_COUNTRIES = [
  ["gb", ["gb"]],
  ["za", ["za"]],
  ["mx", ["mx"]]
];

// 2. Pays multilingues : [pays, [[langue du navigateur, repertoire], ...]].
// Sans correspondance, le pays suit sa liste du bloc 3 (repertoire par defaut
// indique en commentaire).
var MULTILINGUAL = [
  ["ch", [["fr", "fr"], ["it", "it"], ["en", "en"]]], // Suisse : defaut de (majorite germanophone)
  ["be", [["de", "de"], ["en", "en"], ["nl", "en"]]], // Belgique : defaut fr ; neerlandophones -> anglais (pas de version nl)
  ["lu", [["de", "de"], ["en", "en"]]],               // Luxembourg : defaut fr
  ["ca", [["fr", "fr"]]],                             // Canada : defaut en ; navigateur francais (Quebec...) -> fr
  ["cm", [["en", "en"]]],                             // Cameroun : defaut fr ; regions anglophones -> en
  ["mu", [["en", "en"]]],                             // Maurice : defaut fr
  ["rw", [["fr", "fr"]]],                             // Rwanda : defaut en
  ["sc", [["fr", "fr"]]],                             // Seychelles : defaut en
  ["ad", [["fr", "fr"]]],                             // Andorre : defaut es
  ["pr", [["en", "en"]]]                              // Porto Rico : defaut es
];

// 3. Pays -> repertoire de langue (offre EUR internationale).
var COUNTRY_DIRS = [
  ["fr", [
    "fr", "mc", "be", "lu",
    // Outre-mer (codes ISO propres) :
    "gp", "mq", "gf", "re", "yt", "pm", "bl", "mf", "wf", "pf", "nc",
    // Afrique francophone, Maghreb, Haiti :
    "sn", "ci", "ml", "bf", "ne", "gn", "bj", "tg", "cm", "ga", "cg", "cd", "cf", "td",
    "dj", "km", "mg", "bi", "mu", "ma", "dz", "tn", "mr", "ht"
  ]],
  // Espagne + Amerique latine hispanophone HORS Mexique. /es/ et non /mx/ :
  // /mx/ est le marche Mexique (prix en MXN, CGV et aide au jeu mexicaines,
  // paiement Stripe du marche mx) ; /es/ est la version espagnole
  // internationale (EUR, ressource d'aide internationale Gambling Therapy),
  // la seule qui s'applique a un visiteur d'Argentine, de Colombie, du Chili...
  ["es", [
    "es", "ad", "gq",
    "ar", "bo", "cl", "co", "cr", "cu", "do", "ec", "sv", "gt", "hn", "ni", "pa", "py", "pe", "pr", "uy", "ve"
  ]],
  ["pt", ["pt", "br", "ao", "mz", "cv", "gw", "st", "tl"]],
  ["de", ["de", "at", "ch", "li"]],
  ["it", ["it", "sm", "va"]],
  // Pays anglophones hors marches gb/za : version anglaise internationale
  // (EUR). Dependances de la Couronne (im, je, gg) et voisins du Rand (na, bw,
  // ls, sz) compris : les offres GBP/ZAR ne couvrent que GB et ZA.
  ["en", [
    "us", "ca", "au", "nz", "ie",
    "ng", "gh", "ke", "ug", "tz", "zm", "zw", "bw", "na", "ls", "sz", "mw", "sl", "lr", "gm", "ss", "rw", "sc",
    "in", "pk", "bd", "lk", "sg", "my", "ph", "hk",
    "jm", "tt", "bb", "bs", "bz", "gy",
    "mt", "cy", "im", "je", "gg", "gi", "fj", "pg"
  ]]
];

// 4. Langue du navigateur -> repertoire (pays absents des blocs 1 a 3). Jamais
// vers un marche pays : un navigateur en-GB ou es-MX hors du Royaume-Uni ou
// du Mexique va vers /en/ ou /es/ (offre EUR internationale).
var LANGUAGE_DIRS = [["fr", "fr"], ["en", "en"], ["es", "es"], ["pt", "pt"], ["de", "de"], ["it", "it"]];

// 5. Pays sans version dans leur langue : anglais international.
var ENGLISH_FALLBACK_COUNTRIES = [
  "nl", "se", "no", "dk", "fi", "is",
  "pl", "cz", "sk", "hu", "ro", "bg", "gr", "hr", "si", "rs", "ba", "me", "mk", "al", "xk",
  "ee", "lv", "lt", "ua", "md", "by", "ru", "ge", "am", "az", "tr", "il",
  "jp", "kr", "cn", "tw", "mo", "vn", "th", "id", "kh", "mm", "mn", "kz", "uz", "np",
  "ae", "sa", "qa", "kw", "bh", "om", "jo", "lb", "eg", "iq", "ly",
  "et", "so", "sd"
];

var DEFAULT_DIR = "fr";

function cond(countries, languages) {
  var parts = [];
  if (countries && countries.length) parts.push("Country=" + countries.join(","));
  if (languages && languages.length) parts.push("Language=" + languages.join(","));
  return parts.join(" ");
}

// Regles de la racine, dans l'ordre de _redirects :
// [{ to: "<repertoire>", countries: [...]|null, languages: [...]|null, cond: "Country=.. Language=.." }]
function rootRedirectRules(defaultDir) {
  var rules = [];
  function push(to, countries, languages) {
    rules.push({ to: to, countries: countries || null, languages: languages || null, cond: cond(countries, languages) });
  }
  MARKET_COUNTRIES.forEach(function (m) { push(m[0], m[1].slice(), null); });
  // Pays multilingues : une regle par couple (langue, repertoire), pays
  // regroupes dans l'ordre de la table.
  var groups = [];
  var byKey = {};
  MULTILINGUAL.forEach(function (m) {
    m[1].forEach(function (pair) {
      var key = pair[0] + ">" + pair[1];
      if (!byKey[key]) { byKey[key] = { lang: pair[0], dir: pair[1], countries: [] }; groups.push(byKey[key]); }
      byKey[key].countries.push(m[0]);
    });
  });
  groups.forEach(function (g) { push(g.dir, g.countries, [g.lang]); });
  COUNTRY_DIRS.forEach(function (c) { push(c[0], c[1].slice(), null); });
  LANGUAGE_DIRS.forEach(function (l) { push(l[1], null, [l[0]]); });
  push("en", ENGLISH_FALLBACK_COUNTRIES.slice(), null);
  push(defaultDir || DEFAULT_DIR, null, null);
  return rules;
}

// Premiere langue d'un en-tete Accept-Language ("fr-CH, fr;q=0.9, en;q=0.8"
// -> "fr-ch"), ou d'une liste (navigator.languages). "" si absente.
function firstLanguage(accept) {
  var first = Array.isArray(accept) ? accept[0] : String(accept || "").split(",")[0];
  return String(first || "").split(";")[0].trim().toLowerCase().replace(/_/g, "-");
}

function languageMatches(ruleLang, tag) {
  var l = String(ruleLang).toLowerCase();
  return tag === l || tag.indexOf(l + "-") === 0;
}

// Une regle correspond-elle a la requete ? req = { country: "GB"|"gb"|"",
// language: "fr-CH, fr;q=0.9"|["fr-CH"]|"" } — cookies nf_country / nf_lang
// deja appliques par l'appelant (routeRoot).
function ruleMatches(rule, req) {
  var country = String(req.country || "").toLowerCase();
  var tag = firstLanguage(req.language);
  if (rule.countries && rule.countries.indexOf(country) === -1) return false;
  if (rule.languages && !rule.languages.some(function (l) { return languageMatches(l, tag); })) return false;
  return true;
}

// Repertoire servi pour "/" : simulation de Netlify. req.cookies optionnel
// ({ nf_country, nf_lang }) : un choix explicite du visiteur remplace le pays
// et la langue detectes.
function routeRoot(req, rules) {
  req = req || {};
  var cookies = req.cookies || {};
  var effective = {
    country: cookies.nf_country || req.country || "",
    language: cookies.nf_lang || req.language || ""
  };
  rules = rules || rootRedirectRules();
  for (var i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], effective)) return rules[i].to;
  }
  return null;
}

// Lecture des regles "/" d'un fichier _redirects (tests) : memes objets que
// rootRedirectRules() (+ status), dans l'ordre du fichier.
function parseRootRules(text) {
  return String(text).split(/\r?\n/)
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l && l.charAt(0) !== "#"; })
    .map(function (l) { return l.split(/\s+/); })
    .filter(function (p) { return p[0] === "/"; })
    .map(function (p) {
      var countries = null, languages = null;
      p.slice(3).forEach(function (c) {
        var kv = c.split("=");
        if (kv[0] === "Country") countries = kv[1].split(",").map(function (x) { return x.toLowerCase(); });
        else if (kv[0] === "Language") languages = kv[1].split(",").map(function (x) { return x.toLowerCase(); });
      });
      var m = p[1].match(/^\/([a-z]{2})\/$/);
      return { to: m ? m[1] : p[1], status: p[2], countries: countries, languages: languages, cond: p.slice(3).join(" ") };
    });
}

// Tous les pays cites explicitement (tests, rapport).
function mappedCountries() {
  var out = [];
  function add(c) { if (out.indexOf(c) === -1) out.push(c); }
  MARKET_COUNTRIES.forEach(function (m) { m[1].forEach(add); });
  MULTILINGUAL.forEach(function (m) { add(m[0]); });
  COUNTRY_DIRS.forEach(function (c) { c[1].forEach(add); });
  ENGLISH_FALLBACK_COUNTRIES.forEach(add);
  return out;
}

module.exports = {
  MARKET_COUNTRIES: MARKET_COUNTRIES,
  MULTILINGUAL: MULTILINGUAL,
  COUNTRY_DIRS: COUNTRY_DIRS,
  LANGUAGE_DIRS: LANGUAGE_DIRS,
  ENGLISH_FALLBACK_COUNTRIES: ENGLISH_FALLBACK_COUNTRIES,
  DEFAULT_DIR: DEFAULT_DIR,
  rootRedirectRules: rootRedirectRules,
  routeRoot: routeRoot,
  ruleMatches: ruleMatches,
  firstLanguage: firstLanguage,
  parseRootRules: parseRootRules,
  mappedCountries: mappedCountries
};
