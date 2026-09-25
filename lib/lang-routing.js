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
// Principe (refonte du 25/09/2026, decision proprietaire : « reperer d'ou vient
// la personne et afficher sa langue, tout simplement » + option B : site en
// francais, anglais et espagnol seulement) :
//   - l'aiguillage se fait UNIQUEMENT sur la langue du navigateur (Accept-Language
//     ou cookie nf_lang), plus jamais sur le pays (GeoIP) ;
//   - navigateur en anglais -> /en/, en espagnol -> /es/ ; langues dont la
//     version a ete retiree (de, it, pt : config/markets.json#_retiredDirs) ->
//     leur repertoire de repli (/en/) ;
//   - tout le reste (navigateur francais, langue non proposee, et SURTOUT les
//     robots comme Googlebot qui n'envoient pas de langue) : la racine "/" sert
//     l'accueil francais en 200 (reecriture vers /fr/index.html), sans
//     redirection. Avant ce changement Googlebot (explorant depuis les USA)
//     etait redirige vers /en/ : Google prenait l'anglais pour la page
//     d'accueil du site et n'affichait pas de sitelinks en France.
// Jamais de regle pays/langue ailleurs que sur "/" exactement : les pages
// profondes ne sont JAMAIS redirigees selon le visiteur (seulement un bandeau
// de suggestion cote navigateur, lib/lang-suggest.js).

// Anciennes tables par pays conservees vides pour compatibilite des imports.
var MARKET_COUNTRIES = [];
var MULTILINGUAL = [];
var COUNTRY_DIRS = [];
var ENGLISH_FALLBACK_COUNTRIES = [];

// Langue du navigateur -> repertoire. Ordre = ordre des regles.
var LANGUAGE_DIRS = [["en", "en"], ["es", "es"], ["de", "en"], ["it", "en"], ["pt", "en"]];

var DEFAULT_DIR = "fr";

function cond(countries, languages) {
  var parts = [];
  if (countries && countries.length) parts.push("Country=" + countries.join(","));
  if (languages && languages.length) parts.push("Language=" + languages.join(","));
  return parts.join(" ");
}

// Regles de la racine, dans l'ordre de _redirects :
// [{ to: "<repertoire>", countries: null, languages: [...]|null, cond, rewrite }]
// La derniere regle (rewrite: true) sert l'accueil du repertoire par defaut en
// 200 sur "/" : ecrite "/  /fr/index.html  200!" par scripts/build-locales.js.
function rootRedirectRules(defaultDir) {
  var rules = [];
  LANGUAGE_DIRS.forEach(function (l) {
    rules.push({ to: l[1], countries: null, languages: [l[0]], cond: cond(null, [l[0]]) });
  });
  rules.push({ to: defaultDir || DEFAULT_DIR, countries: null, languages: null, cond: "", rewrite: true });
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
      var m = p[1].match(/^\/([a-z]{2})\/(?:index\.html)?$/);
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
