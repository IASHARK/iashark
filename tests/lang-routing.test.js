"use strict";
// Aiguillage automatique de la RACINE "/" par pays (GeoIP Netlify) puis par
// langue du navigateur : table lib/lang-routing.js, regles "/" de _redirects,
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

test("marches pays : seuls les pays des marches a devise propre de config/markets.json", () => {
  const keys = Object.keys(MARKETS).filter((k) => k[0] !== "_" && k !== MARKETS._defaultMarket);
  // Marche pays = marche qui a SON repertoire (/gb/ /za/ /mx/). Un marche servi
  // par un repertoire de langue (us : offre USD de /en/, config/markets.json
  // #_usdSwitch) n'en est pas un : son pays est route par pays vers ce
  // repertoire (bloc COUNTRY_DIRS), jamais comme marche pays.
  const expected = keys.filter((k) => MARKETS._dirs[k])
    .map((k) => {
      // lib/lang-suggest.js (countryMarket) suppose cle de marche = code pays.
      assert.equal(k, MARKETS[k].country.toLowerCase(), "cle de marche " + k + " != pays " + MARKETS[k].country);
      assert.equal(MARKETS[k].dirs.length, 1, k + " : un seul repertoire attendu");
      return [MARKETS[k].dirs[0], [MARKETS[k].country.toLowerCase()]];
    });
  const sort = (a) => a.slice().sort((x, y) => x[0].localeCompare(y[0]));
  assert.deepEqual(sort(R.MARKET_COUNTRIES), sort(expected));
  const languageMarkets = keys.filter((k) => !MARKETS._dirs[k]);
  assert.deepEqual(languageMarkets, ["us"]);
  for (const k of languageMarkets) {
    const country = MARKETS[k].country;
    assert.equal(k, country.toLowerCase(), "cle de marche " + k + " != pays " + country);
    assert.deepEqual(MARKETS[k].dirs, ["en"], k + " : repertoire de langue prevu");
    assert.ok(!R.MARKET_COUNTRIES.some((m) => m[0] === MARKETS[k].dirs[0]), k + " : /en/ n'est pas un repertoire de marche pays");
    assert.equal(route(country, "en-US"), "en", country + " -> /en/");
    assert.equal(routeFile(country, ""), "en", country + " -> /en/ (_redirects)");
  }
});

test("tables : repertoires existants, codes ISO, aucun pays en double, jamais un marche pays par la langue", () => {
  TABLE.forEach((r) => assert.ok(DIR_CODES.includes(r.to), "repertoire inconnu " + r.to));
  assert.equal(TABLE[TABLE.length - 1].to, MARKETS._xDefaultDir);
  assert.equal(TABLE[TABLE.length - 1].cond, "", "la derniere regle est sans condition");
  const seen = {};
  const lists = R.MARKET_COUNTRIES.map((m) => m[1]).concat(R.COUNTRY_DIRS.map((c) => c[1]), [R.ENGLISH_FALLBACK_COUNTRIES]);
  lists.forEach((list) => list.forEach((c) => {
    assert.match(c, /^[a-z]{2}$/);
    assert.ok(!seen[c], "pays en double : " + c);
    seen[c] = true;
  }));
  const countryDirs = {};
  R.COUNTRY_DIRS.forEach((c) => c[1].forEach((x) => { countryDirs[x] = c[0]; }));
  R.MULTILINGUAL.forEach((m) => {
    assert.ok(countryDirs[m[0]], m[0] + " : pays multilingue sans repertoire par defaut");
    m[1].forEach((pair) => assert.ok(DIR_CODES.includes(pair[1])));
  });
  const marketDirs = R.MARKET_COUNTRIES.map((m) => m[0]);
  R.LANGUAGE_DIRS.forEach((l) => assert.ok(!marketDirs.includes(l[1]), "langue " + l[0] + " -> marche pays " + l[1]));
  R.MULTILINGUAL.forEach((m) => m[1].forEach((p) => assert.ok(!marketDirs.includes(p[1]))));
});

test("routeRoot : demande du proprietaire, pays par pays", () => {
  const cases = [
    // [pays, Accept-Language, repertoire attendu]
    ["GB", "en-GB,en;q=0.9", "gb"], ["GB", "fr-FR", "gb"], ["ZA", "en-ZA", "za"], ["ZA", "af", "za"],
    ["MX", "es-MX", "mx"], ["MX", "en-US", "mx"],
    ["ES", "es-ES", "es"], ["AR", "es-AR", "es"], ["CO", "es-CO", "es"], ["CL", "es-419", "es"], ["PE", "", "es"], ["VE", "es", "es"],
    ["PT", "pt-PT", "pt"], ["BR", "pt-BR", "pt"], ["AO", "pt", "pt"], ["MZ", "", "pt"],
    ["DE", "de-DE", "de"], ["AT", "de-AT", "de"], ["IT", "it-IT", "it"], ["SM", "", "it"],
    ["FR", "fr-FR", "fr"], ["FR", "en-US,en", "fr"], ["MC", "fr", "fr"], ["RE", "", "fr"],
    ["SN", "fr-SN", "fr"], ["CI", "fr", "fr"], ["CD", "", "fr"], ["MA", "ar-MA", "fr"], ["DZ", "ar", "fr"], ["TN", "fr-TN", "fr"],
    ["US", "en-US", "en"], ["US", "", "en"], ["NG", "en-NG", "en"], ["AU", "en-AU", "en"], ["IE", "en-IE", "en"],
    ["NZ", "en", "en"], ["KE", "sw", "en"], ["IN", "hi-IN", "en"], ["GH", "", "en"],
    // Pays multilingues : pays + langue du navigateur.
    ["CH", "de-CH", "de"], ["CH", "fr-CH", "fr"], ["CH", "it-CH", "it"], ["CH", "en", "en"], ["CH", "rm", "de"], ["CH", "", "de"],
    ["BE", "fr-BE", "fr"], ["BE", "nl-BE", "en"], ["BE", "de-BE", "de"], ["BE", "", "fr"],
    ["LU", "lb", "fr"], ["LU", "de-LU", "de"], ["CA", "fr-CA", "fr"], ["CA", "en-CA", "en"], ["CA", "", "en"],
    ["CM", "fr-CM", "fr"], ["CM", "en-CM", "en"], ["PR", "es-PR", "es"], ["PR", "en-US", "en"],
    // Autres pays : langue du navigateur, sinon anglais (pays sans version), sinon /fr/.
    ["NL", "de-DE", "de"], ["NL", "nl-NL", "en"], ["NL", "fr", "fr"], ["SE", "sv", "en"], ["JP", "ja-JP", "en"], ["PL", "", "en"],
    ["", "es-ES", "es"], ["", "pt-BR", "pt"], ["", "ja", "fr"], ["", "", "fr"], ["AQ", "", "fr"],
    // Premiere langue seulement, quel que soit q (semantique Netlify).
    ["", "nl-NL,en;q=0.9", "fr"], ["", "it;q=0.1,de;q=0.9", "it"]
  ];
  for (const [c, l, want] of cases) assert.equal(route(c, l), want, (c || "?") + " / " + (l || "-"));
  // Googlebot (IP des Etats-Unis, sans Accept-Language) : meme page que le x-default hreflang.
  assert.equal(route("US", ""), MARKETS._hreflangXDefault[0]);
  // Un navigateur en-GB / es-MX hors du pays du marche n'obtient jamais GBP / MXN.
  assert.equal(route("NL", "en-GB"), "en");
  assert.equal(route("", "es-MX"), "es");
});

test("_redirects : regles de la racine = table lib/lang-routing.js, en premier, toutes 302! ; chaque pays y figure", () => {
  const rules = allRules(read("_redirects"));
  const root = rules.filter((r) => r.from === "/");
  assert.deepEqual(rules.slice(0, root.length), root, "les regles de la racine doivent venir en premier");
  assert.deepEqual(FILE_RULES.map((r) => [r.to, r.cond]), TABLE.map((r) => [r.to, r.cond]));
  FILE_RULES.forEach((r) => assert.equal(r.status, "302!", "racine : 302 force attendu"));
  const inFile = new Set();
  FILE_RULES.forEach((r) => (r.countries || []).forEach((c) => inFile.add(c)));
  R.mappedCountries().forEach((c) => assert.ok(inFile.has(c), "pays absent de _redirects : " + c));
});

test("_redirects rejoue comme Netlify : chaque pays mappe arrive au meme repertoire que routeRoot", () => {
  const langs = ["", "en-US", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "nl-NL", "ja"];
  for (const c of R.mappedCountries().concat(["", "aq"])) {
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

test("choix explicite : nf_country / nf_lang de chaque version ramenent \"/\" vers elle, quel que soit le pays reel", () => {
  const probe = loadI18n();
  assert.deepEqual(Object.keys(probe.I18N.choiceCookies).sort(), DIR_CODES.slice().sort());
  for (const dir of DIR_CODES) {
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
        assert.equal(route(country, lang, set), dir, dir + " depuis " + country + "/" + lang);
        assert.equal(routeFile(country, lang, set), dir, dir + " (_redirects) depuis " + country + "/" + lang);
      }
    }
  }
  // Pas de Secure en http (serveur local) ; repertoire inconnu : rien.
  const local = loadI18n("http:");
  local.I18N.rememberChoice("de");
  local.cookies.forEach((c) => assert.doesNotMatch(c, /Secure/));
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
