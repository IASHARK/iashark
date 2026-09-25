"use strict";
// Aiguillage automatique de la RACINE "/" par la langue du navigateur (plus
// par pays depuis le 25/09/2026) : table lib/lang-routing.js, regles "/" de _redirects,
// choix explicite du visiteur (cookies nf_country / nf_lang poses par
// i18n/i18n.js). Les pages profondes ne sont jamais redirigees.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const R = require("../lib/lang-routing.js");
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIR_CODES = Object.keys(MARKETS._dirs);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TABLE = R.rootRedirectRules(MARKETS._xDefaultDir);
const FILE_RULES = R.parseRootRules(read("_redirects"));
const route = (country, language, cookies) => R.routeRoot({ country, language, cookies }, TABLE);
const routeFile = (country, language, cookies) => R.routeRoot({ country, language, cookies }, FILE_RULES);

function allRules(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== "#")
    .map((l) => { const p = l.split(/\s+/); return { from: p[0], to: p[1], status: p[2], conds: p.slice(3) }; });
}

// 25/09/2026 (decision proprietaire) : aiguillage de "/" par la SEULE langue
// du navigateur, plus jamais par pays ; versions de/it/pt retirees
// (config/markets.json#_retiredDirs) : leur langue mene au repertoire de
// repli ; sans langue reconnue (Googlebot compris) : accueil francais servi
// en 200 sur "/" (reecriture "/  /fr/index.html  200!").
const { PUBLIC_DIRS, RETIRED_DIRS } = require("./helpers/public-dirs.js");
// Version "langue" d'un repertoire (gb/za -> en, mx -> es) : ce que la racine
// peut encore servir a un visiteur qui l'a choisi, sans regle pays.
const languageDirOf = (dir) => { const base = MARKETS._dirs[dir].locale.split("-")[0]; return PUBLIC_DIRS.includes(base) ? base : MARKETS._xDefaultDir; };

test("marches pays : cles de marche = code pays (lib/lang-suggest.js), mais plus aucune regle pays sur la racine", () => {
  const keys = Object.keys(MARKETS).filter((k) => k[0] !== "_" && k !== MARKETS._defaultMarket);
  for (const k of keys) assert.equal(k, MARKETS[k].country.toLowerCase(), "cle de marche " + k + " != pays " + MARKETS[k].country);
  assert.deepEqual([R.MARKET_COUNTRIES, R.MULTILINGUAL, R.COUNTRY_DIRS, R.ENGLISH_FALLBACK_COUNTRIES], [[], [], [], []]);
  assert.deepEqual(R.mappedCountries(), []);
  TABLE.forEach((r) => assert.equal(r.countries, null, "regle pays : " + r.cond));
  // Le pays ne change jamais le resultat.
  for (const l of ["", "fr-FR", "en-GB", "es-MX", "de-DE", "ja"]) {
    for (const c of ["GB", "ZA", "MX", "US", "FR", "DE", ""]) assert.equal(route(c, l), route("", l), c + " / " + l);
  }
});

test("tables : repertoires publics, langues retirees vers leur repli, derniere regle = reecriture sans condition", () => {
  TABLE.forEach((r) => assert.ok(PUBLIC_DIRS.includes(r.to), "repertoire non public " + r.to));
  const last = TABLE[TABLE.length - 1];
  assert.equal(last.to, MARKETS._xDefaultDir);
  assert.equal(last.cond, "", "la derniere regle est sans condition");
  assert.equal(last.rewrite, true, "la derniere regle est une reecriture 200");
  TABLE.slice(0, -1).forEach((r) => { assert.ok(!r.rewrite); assert.ok(r.languages && r.languages.length, "regle sans langue"); });
  // Jamais un marche pays (devise propre) par la seule langue.
  const marketDirs = Object.keys(MARKETS).filter((k) => k[0] !== "_" && MARKETS._dirs[k]);
  R.LANGUAGE_DIRS.forEach((l) => assert.ok(!marketDirs.includes(l[1]), "langue " + l[0] + " -> marche pays " + l[1]));
  // Chaque version retiree : sa langue mene au repertoire de repli.
  Object.keys(RETIRED_DIRS).forEach((d) => assert.ok(R.LANGUAGE_DIRS.some((l) => l[0] === d && l[1] === RETIRED_DIRS[d]), d + " -> " + RETIRED_DIRS[d]));
  const seen = {};
  R.LANGUAGE_DIRS.forEach((l) => { assert.match(l[0], /^[a-z]{2}$/); assert.ok(!seen[l[0]], "langue en double " + l[0]); seen[l[0]] = true; });
});

test("routeRoot : langue du navigateur seule (decision du 25/09/2026)", () => {
  const cases = [
    // [pays, Accept-Language, repertoire attendu]
    ["GB", "en-GB,en;q=0.9", "en"], ["GB", "fr-FR", "fr"], ["ZA", "en-ZA", "en"], ["ZA", "af", "fr"],
    ["MX", "es-MX", "es"], ["MX", "en-US", "en"],
    ["ES", "es-ES", "es"], ["AR", "es-AR", "es"], ["CL", "es-419", "es"], ["PE", "", "fr"],
    ["PT", "pt-PT", "en"], ["BR", "pt-BR", "en"], ["DE", "de-DE", "en"], ["AT", "de-AT", "en"], ["IT", "it-IT", "en"],
    ["FR", "fr-FR", "fr"], ["FR", "en-US,en", "en"], ["MA", "ar-MA", "fr"],
    ["US", "en-US", "en"], ["CH", "de-CH", "en"], ["CH", "fr-CH", "fr"], ["BE", "nl-BE", "fr"],
    ["NL", "de-DE", "en"], ["JP", "ja-JP", "fr"], ["", "es-ES", "es"], ["", "pt-BR", "en"], ["", "", "fr"],
    // Premiere langue seulement, quel que soit q (semantique Netlify).
    ["", "nl-NL,en;q=0.9", "fr"], ["", "it;q=0.1,es;q=0.9", "en"]
  ];
  for (const [c, l, want] of cases) assert.equal(route(c, l), want, (c || "?") + " / " + (l || "-"));
  // Googlebot (IP des Etats-Unis, sans Accept-Language) : accueil francais en 200.
  assert.equal(route("US", ""), MARKETS._xDefaultDir);
  assert.equal(routeFile("US", ""), MARKETS._xDefaultDir);
  // Un navigateur en-GB / es-MX n'obtient jamais GBP / MXN par la racine.
  assert.equal(route("GB", "en-GB"), "en");
  assert.equal(route("MX", "es-MX"), "es");
});

test("_redirects : regles de la racine = table lib/lang-routing.js, en premier, 302! par langue puis reecriture 200! finale", () => {
  const rules = allRules(read("_redirects"));
  const root = rules.filter((r) => r.from === "/");
  assert.deepEqual(rules.slice(0, root.length), root, "les regles de la racine doivent venir en premier");
  assert.deepEqual(FILE_RULES.map((r) => [r.to, r.cond]), TABLE.map((r) => [r.to, r.cond]));
  FILE_RULES.slice(0, -1).forEach((r) => {
    assert.equal(r.status, "302!", "racine : 302 force attendu");
    assert.equal(r.countries, null, "racine : aucune condition pays");
  });
  const last = root[root.length - 1];
  assert.deepEqual([last.to, last.status, last.conds], ["/" + MARKETS._xDefaultDir + "/index.html", "200!", []], "reecriture finale vers l'accueil francais");
  // Versions retirees : 301 permanente vers le repli, juste apres la racine.
  Object.keys(RETIRED_DIRS).forEach((d) => {
    const to = "/" + RETIRED_DIRS[d];
    assert.ok(rules.some((r) => r.from === "/" + d && r.to === to + "/" && r.status === "301!" && !r.conds.length), "/" + d);
    const i = rules.findIndex((r) => r.from === "/" + d + "/*" && r.to === to + "/:splat" && r.status === "301!" && !r.conds.length);
    assert.ok(i !== -1, "/" + d + "/*");
    assert.ok(!rules.slice(0, i).some((r) => r.from.startsWith("/" + d + "/")), "/" + d + "/* masquee par une regle precedente");
  });
});

test("_redirects rejoue comme Netlify : chaque langue arrive au meme repertoire que routeRoot", () => {
  const langs = ["", "en-US", "fr-FR", "de-DE", "es-ES", "es-MX", "it-IT", "pt-BR", "nl-NL", "ja"];
  for (const c of ["", "us", "gb", "mx", "fr", "aq"]) {
    for (const l of langs) assert.equal(routeFile(c, l), route(c, l), c + " / " + l);
  }
});

test("pages profondes : aucune redirection selon le pays, la langue ou un cookie ailleurs que sur \"/\"", () => {
  const rules = allRules(read("_redirects"));
  rules.filter((r) => r.conds.length).forEach((r) => {
    assert.equal(r.from, "/", "regle conditionnelle hors racine : " + r.from + " " + r.conds.join(" "));
    assert.equal(r.status, "302!");
  });
  // Aucune redirection conditionnelle declaree dans netlify.toml non plus.
  assert.doesNotMatch(read("netlify.toml"), /conditions\s*=\s*\{[^}]*(Country|Language|Cookie)/);
  // Cote navigateur : ni i18n.js ni le bandeau ne changent de page d'eux-memes.
  ["i18n/i18n.js", "lib/lang-suggest.js"].forEach((f) => {
    assert.doesNotMatch(read(f), /location\.(href\s*=[^=]|replace\(|assign\()|location\s*=[^=]/, f);
  });
});

// i18n/i18n.js dans un bac a sable, avec document.cookie observable.
function loadI18n(protocol) {
  const store = {};
  const cookies = [];
  const win = {
    location: { pathname: "/fr/pro.html", search: "", hash: "", protocol: protocol || "https:" },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: { querySelector: () => null, documentElement: { getAttribute: () => "fr" } }
  };
  Object.defineProperty(win.document, "cookie", { get: () => "", set: (v) => cookies.push(v) });
  vm.runInContext(read("i18n/i18n.js"), vm.createContext({ window: win }));
  return { I18N: win.I18N, store, cookies };
}
function parseSetCookies(list) {
  const out = {};
  list.forEach((c) => { const kv = c.split(";")[0].split("="); out[kv[0]] = kv[1]; });
  return out;
}

// 25/09/2026 : sans regle pays, un choix de /gb/ /za/ /mx/ ramene "/" vers la
// version de sa langue (/en/, /es/) ; fr, en, es : exactement la version choisie.
test("choix explicite : nf_lang de chaque version ramene \"/\" vers elle (ou sa langue pour gb/za/mx), quelle que soit la langue reelle", () => {
  const probe = loadI18n();
  assert.deepEqual(Object.keys(probe.I18N.choiceCookies).sort(), PUBLIC_DIRS.slice().sort());
  for (const dir of PUBLIC_DIRS) {
    const { I18N, store, cookies } = loadI18n();
    assert.equal(I18N.chosenDir(), "");
    I18N.rememberChoice(dir);
    assert.equal(store.iashark_dir_chosen, dir);
    assert.equal(I18N.chosenDir(), dir);
    assert.equal(cookies.length, 2);
    cookies.forEach((c) => assert.match(c, /; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/));
    const set = parseSetCookies(cookies);
    for (const country of ["FR", "GB", "US", "CH", "BE", "MX", "JP", ""]) {
      for (const lang of ["fr-FR", "en-GB", "nl", "de-CH", ""]) {
        assert.equal(route(country, lang, set), languageDirOf(dir), dir + " depuis " + country + "/" + lang);
        assert.equal(routeFile(country, lang, set), languageDirOf(dir), dir + " (_redirects) depuis " + country + "/" + lang);
      }
    }
  }
  for (const dir of ["fr", "en", "es"]) assert.equal(languageDirOf(dir), dir);
  // Pas de Secure en http (serveur local) ; repertoire inconnu ou retire : rien.
  const local = loadI18n("http:");
  local.I18N.rememberChoice("es");
  assert.equal(local.cookies.length, 2);
  local.cookies.forEach((c) => assert.doesNotMatch(c, /Secure/));
  for (const d of Object.keys(RETIRED_DIRS)) {
    const retired = loadI18n();
    retired.I18N.rememberChoice(d);
    assert.equal(retired.cookies.length, 0, d + " : version retiree, aucun cookie de choix");
  }
  const bad = loadI18n();
  bad.I18N.rememberChoice("xx");
  assert.equal(bad.cookies.length, 0);
  assert.equal(bad.store.iashark_dir_chosen, undefined);
});

// A appliquer par le responsable du depot (scripts/build-locales.js est en
// cours de modification par un autre chantier) : voir
// reports/auto-langue-2026-09-19.md, « Patch du generateur ». Tant que ce
// patch manque, `node scripts/build-locales.js` remettrait l'ancien bloc
// racine dans _redirects - le test « _redirects : regles de la racine »
// ci-dessus echouerait alors immediatement.
test("generateur : scripts/build-locales.js ecrit les memes regles racine que _redirects", () => {
    const generated = R.parseRootRules(require("../scripts/build-locales.js").redirectsContent());
    assert.deepEqual(generated.map((r) => [r.to, r.cond]), FILE_RULES.map((r) => [r.to, r.cond]));
  });
