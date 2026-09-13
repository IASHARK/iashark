"use strict";
// Structure GEO : repertoires publics (langues + marches pays), I18N.href,
// selecteur langue/pays, lib/market-config.js, _redirects, retrait de
// l'historique, liens internes des pages generees et des landings pays.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;
const DIR_CODES = Object.keys(DIRS);
const PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
const LEGAL = Object.keys(MARKETS._legalFiles).map(function (k) { return MARKETS._legalFiles[k]; });
const builder = require(path.join(ROOT, "scripts/build-locales.js"));

function plain(v) { return JSON.parse(JSON.stringify(v)); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

function loadI18n(pathname, search, store) {
  store = store || {};
  var win = {
    location: { pathname: pathname, search: search || "", hash: "" },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    }
  };
  vm.runInContext(read("i18n/i18n.js"), vm.createContext({ window: win }));
  return win.I18N;
}

function loadMarket(pathname) {
  var win = { location: { pathname: pathname } };
  vm.runInContext(read("lib/market-config.js"), vm.createContext({ window: win }));
  return win;
}

function fakeEl(tag, attrs) {
  return {
    tagName: tag, attrs: Object.assign({}, attrs), textContent: "orig", hidden: false,
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    removeAttribute: function (k) { delete this.attrs[k]; }
  };
}
function fakeRoot(els) {
  return {
    querySelectorAll: function (sel) {
      var attr = sel.replace(/^\[|\]$/g, "");
      return els.filter(function (e) { return Object.prototype.hasOwnProperty.call(e.attrs, attr); });
    }
  };
}

test("config : repertoires publics et prix des marches conformes aux docs 06/07/08", () => {
  assert.deepEqual(DIR_CODES, ["fr", "gb", "za", "en", "mx", "es", "de", "it", "pt"]);
  assert.deepEqual([DIRS.gb.htmlLang, DIRS.za.htmlLang, DIRS.mx.htmlLang], ["en-GB", "en-ZA", "es-MX"]);
  assert.deepEqual([DIRS.gb.locale, DIRS.za.locale, DIRS.mx.locale], ["en", "en", "es-mx"]);
  ["en", "es", "de", "it", "pt", "fr"].forEach(function (d) { assert.equal(DIRS[d].market, "fr", d + " = marche EUR par defaut"); });
  function amounts(m) { return ["free", "pro", "edge", "annual_edge"].map(function (k) { return MARKETS[m].prices[k] && MARKETS[m].prices[k].amount; }); }
  assert.deepEqual(amounts("gb"), [0, 14.99, 24.99, 199]);
  assert.deepEqual(amounts("mx"), [0, 199, 299, 1990]);
  assert.deepEqual(amounts("za"), [0, 199, 299, 1999]);
  assert.deepEqual([MARKETS.gb.currency, MARKETS.mx.currency, MARKETS.za.currency, MARKETS.fr.currency], ["GBP", "MXN", "ZAR", "EUR"]);
  assert.equal(MARKETS.mx.helpline.phone, "800 911 2000", "MX : Línea de la Vida (CONASAMA), verifiee par l'agent juridique (legal/README.md)");
});

test("i18n.js : table des repertoires identique a config/markets.json#_dirs", () => {
  var dirs = plain(loadI18n("/").dirs);
  assert.deepEqual(dirs.map(function (d) { return d.dir; }), DIR_CODES);
  dirs.forEach(function (d) {
    var c = DIRS[d.dir];
    assert.deepEqual([d.locale, d.htmlLang, d.market, d.label], [c.locale, c.htmlLang, c.market, c.label], d.dir);
  });
  assert.deepEqual(dirs.map(function (d) { return d.label; }), [
    "Français", "English (UK)", "English (South Africa)", "English (International)",
    "Español (México)", "Español", "Deutsch", "Italiano", "Português"
  ]);
});

test("I18N.href : chaque page publique reste dans le repertoire courant", () => {
  var gb = loadI18n("/gb/match.html");
  assert.deepEqual([gb.dir, gb.locale, gb.htmlLang, gb.market], ["gb", "en", "en-GB", "gb"]);
  assert.equal(gb.href("compte.html#plan"), "/gb/compte.html#plan");
  assert.equal(gb.href("/match.html?id=42"), "/gb/match.html?id=42");
  assert.equal(gb.href("index.html"), "/gb/");
  assert.equal(gb.href(""), "/gb/");
  assert.equal(gb.href("cgv.html"), "/gb/cgv.html");
  assert.equal(gb.href("blog.html"), "/en/blog/");
  assert.equal(gb.href("data.json"), "/data.json");
  assert.equal(gb.href("https://example.com/x"), "https://example.com/x");
  PAGES.map(function (p) { return p.file; }).concat(LEGAL).forEach(function (file) {
    assert.equal(gb.hrefFor(file, "za"), file === "index.html" ? "/za/" : "/za/" + file, file);
  });

  var mx = loadI18n("/mx/");
  assert.deepEqual([mx.locale, mx.htmlLang], ["es-mx", "es-MX"]);
  assert.equal(mx.href("pro.html"), "/mx/pro.html");
  assert.equal(mx.href("blog.html"), "/mx/blog/");
  assert.equal(mx.href("blog/guides/x.html"), "/mx/blog/guides/x.html");
  assert.equal(loadI18n("/za/cgv.html").href("blog/guides/x.html"), "/en/blog/guides/x.html");
  assert.equal(loadI18n("/za/").htmlLang, "en-ZA");
  assert.equal(loadI18n("/de/pro.html").href("blog.html"), "/de/blog/");
  assert.equal(loadI18n("/fr/").href("blog.html"), "/blog.html");

  var root = loadI18n("/blog/guides/x.html");
  assert.equal(root.dir, "");
  // Page sans prefixe : jamais un lien racine (redirige vers /fr/ en
  // production) - version memorisee du visiteur, sinon /fr/ (audit QA 14/09/2026).
  assert.equal(root.href("compte.html"), "/fr/compte.html");
  assert.equal(loadI18n("/match/123.html", "", { iashark_dir: "gb" }).href("pro.html"), "/gb/pro.html");
});

test("selecteur langue/pays : 9 options, meme page dans le repertoire cible", () => {
  var I = loadI18n("/gb/match.html", "?id=7");
  var opts = plain(I.switcherOptions());
  assert.deepEqual(opts.map(function (o) { return o.dir; }), ["fr", "gb", "za", "en", "mx", "es", "de", "it", "pt"]);
  var byDir = {};
  opts.forEach(function (o) { byDir[o.dir] = o; });
  assert.equal(byDir.mx.href, "/mx/match.html?id=7");
  assert.equal(byDir.fr.href, "/fr/match.html?id=7");
  assert.equal(byDir.gb.active, true);
  assert.equal(byDir.za.hreflang, "en-ZA");
  assert.equal(loadI18n("/match/123.html").switchHref("za"), "/za/match.html?id=123");
  assert.equal(loadI18n("/en/blog/guides/x.html").switchHref("mx"), "/mx/blog/");
  assert.equal(loadI18n("/en/blog/guides/x.html").switchHref("fr"), "/blog.html");
  assert.match(I.switcherHtml(), /English \(South Africa\)/);
});

test("lib/market-config.js : donnees synchronisees depuis config/markets.json, prix formates, remplissage DOM", () => {
  assert.deepEqual(plain(loadMarket("/").IasharkMarketConfig.data), plain(builder.marketRuntimeData()),
    "bloc de donnees perime : relancer node scripts/build-locales.js");

  var gb = loadMarket("/gb/pro.html").IASHARK_MARKET;
  assert.deepEqual([gb.code, gb.dir, gb.lang, gb.currency, gb.checkoutMarket], ["gb", "gb", "en-GB", "GBP", "gb"]);
  assert.equal(gb.formatPrice("pro"), new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(14.99));
  assert.match(gb.formatPrice("annual_edge"), /199/);
  assert.equal(gb.legal.pages.terms, "/gb/cgv.html");
  assert.equal(gb.helpline.phone, "0808 8020 133");

  var mx = loadMarket("/mx/").IASHARK_MARKET;
  assert.deepEqual([mx.code, mx.currency, mx.lang], ["mx", "MXN", "es-MX"]);
  assert.match(mx.helpline.name, /^Línea de la Vida/);
  assert.match(mx.formatPrice("pro"), /199/);

  var za = loadMarket("/za/").IASHARK_MARKET;
  assert.deepEqual([za.currency, za.lang], ["ZAR", "en-ZA"]);
  assert.match(za.formatPrice("annual_edge"), /1\D?999/);

  var en = loadMarket("/en/").IASHARK_MARKET;
  assert.deepEqual([en.code, en.currency, en.checkoutMarket], ["fr", "EUR", null]);
  assert.equal(en.formatPrice("edge"), null, "aucun prix EUR Edge : jamais invente");
  assert.equal(en.legal.pages.privacy, "/en/confidentialite.html");

  // Remplissage : prix absent -> texte intact + attribut ; aide ; devise ; lien legal.
  var price = fakeEl("SPAN", { "data-market-price": "edge" });
  var pro = fakeEl("SPAN", { "data-market-price": "pro" });
  var cur = fakeEl("SPAN", { "data-market-currency": "" });
  var help = fakeEl("SPAN", { "data-market-helpline": "" });
  var legal = fakeEl("A", { "data-market-legal": "terms", href: "/cgv.html" });
  en.apply(fakeRoot([price, pro, cur, help, legal]));
  assert.equal(price.textContent, "orig");
  assert.ok(Object.prototype.hasOwnProperty.call(price.attrs, "data-market-price-unavailable"));
  assert.match(pro.textContent, /19[.,]95/);
  assert.equal(cur.textContent, "EUR");
  // /en/ /es/ /de/ /it/ /pt/ : ressource internationale (config/markets.json
  // #_helplines.international), sans numero ; /fr/ : Joueurs Info Service.
  assert.equal(help.textContent, "Gambling Therapy");
  var frHelp = fakeEl("SPAN", { "data-market-helpline": "" });
  var frPhone = fakeEl("SPAN", { "data-market-helpline": "phone" });
  var frIf = fakeEl("SPAN", { "data-market-helpline-if": "phone" });
  loadMarket("/fr/").IASHARK_MARKET.apply(fakeRoot([frHelp, frPhone, frIf]));
  assert.equal(frHelp.textContent, "Joueurs Info Service · 09 74 75 13 13");
  assert.equal(frPhone.textContent, "09 74 75 13 13");
  assert.equal(frIf.hidden, false);
  var enPhone = fakeEl("SPAN", { "data-market-helpline": "phone" });
  var enIf = fakeEl("SPAN", { "data-market-helpline-if": "phone" });
  en.apply(fakeRoot([enPhone, enIf]));
  assert.equal(enPhone.hidden, true, "pas de numero invente pour la ressource internationale");
  assert.equal(enIf.hidden, true);
  assert.equal(mx.formatPrice("pro"), "MX$199", "MXN jamais affiche comme un simple $ (ambigu avec l'USD)");
  assert.equal(legal.attrs.href, "/en/cgv.html");

  var mxHelp = fakeEl("A", { "data-market-helpline": "phone" });
  mx.apply(fakeRoot([mxHelp]));
  assert.equal(mxHelp.textContent, "800 911 2000");
  assert.equal(mxHelp.attrs.href, "tel:8009112000");
  assert.equal(mxHelp.hidden, false);
});

test("_redirects : pays puis langue puis /fr/ sur la racine, anciennes URLs, historique, 404 en dernier", () => {
  var rules = read("_redirects").split("\n")
    .filter(function (l) { return l.trim() && l.trim().charAt(0) !== "#"; })
    .map(function (l) { return l.trim().split(/\s+/); });
  var rootRules = rules.filter(function (r) { return r[0] === "/"; });
  assert.deepEqual(rootRules.map(function (r) { return r.slice(1).join(" "); }), [
    "/gb/ 302! Country=gb", "/za/ 302! Country=za", "/mx/ 302! Country=mx", "/en/ 302! Country=us,ca,au,ie,nz",
    "/en/ 302! Language=en", "/es/ 302! Language=es", "/de/ 302! Language=de", "/it/ 302! Language=it", "/pt/ 302! Language=pt",
    "/fr/ 302!"
  ]);
  assert.deepEqual(rules.slice(0, rootRules.length), rootRules, "les regles de la racine doivent venir en premier");
  function has(from, to, status) { return rules.some(function (r) { return r[0] === from && r[1] === to && r[2] === status; }); }
  assert.ok(has("/index.html", "/fr/", "301!"));
  PAGES.forEach(function (p) {
    if (p.file === "index.html" || p.file === "404.html") return;
    assert.ok(has("/" + p.file, "/fr/" + p.file, "301!"), p.file);
  });
  assert.ok(has("/historique.html", "/fr/", "301!"));
  DIR_CODES.forEach(function (d) { assert.ok(has("/" + d + "/historique.html", "/" + d + "/", "301!"), d); });
  assert.ok(has("/legal/*", "/:splat", "301!"));
  var tail = rules.slice(-DIR_CODES.length);
  assert.deepEqual(tail.map(function (r) { return r[0] + " " + r[1] + " " + r[2]; }),
    DIR_CODES.map(function (d) { return "/" + d + "/* /" + d + "/404.html 404"; }));
});

test("historique retire du site public", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "historique.html")));
  DIR_CODES.forEach(function (d) { assert.ok(!fs.existsSync(path.join(ROOT, d, "historique.html")), d + "/historique.html"); });
  assert.ok(!PAGES.some(function (p) { return p.file === "historique.html"; }));
  assert.doesNotMatch(read("bottom-navigation.js"), /historique\.html/);
  fs.readdirSync(ROOT).filter(function (f) { return /^sitemap.*\.xml$/.test(f); }).forEach(function (f) {
    assert.doesNotMatch(read(f), /historique/, f);
  });
});

test("pages generees : tous les liens internes restent dans le repertoire", () => {
  var localized = new Set(PAGES.map(function (p) { return p.file; }).concat(LEGAL));
  DIR_CODES.forEach(function (d) {
    PAGES.map(function (p) { return p.file; }).concat(LEGAL).forEach(function (file) {
      if (file === "landing.html" && DIRS[d].customLanding) return;
      var abs = path.join(ROOT, d, file);
      if (!fs.existsSync(abs)) return; // existence couverte par i18n-build (pages) ; legales = optionnelles
      var html = fs.readFileSync(abs, "utf8");
      var re = /(?:href|src|action)\s*=\s*\\?["'](\/[^"'\\\s<>?#]*)/g;
      var m;
      while ((m = re.exec(html))) {
        var p = m[1];
        var bare = p.replace(/^\/+/, "");
        assert.ok(!(p === "/" || localized.has(bare) || bare === "historique.html"), d + "/" + file + " : lien racine " + p);
        var other = p.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)\//);
        if (other) assert.ok(other[1] === d || /^\/[a-z]{2}\/blog\//.test(p), d + "/" + file + " : lien vers un autre repertoire " + p);
      }
      if (d !== "fr") assert.doesNotMatch(html, /\/match\/['"]\s*\+/, d + "/" + file + " : lien vers une page match statique FR");
    });
  });
});

test("pages legales : chaque source legal/<dir>/ est recopiee dans /<dir>/ avec canonical et navigation", () => {
  DIR_CODES.forEach(function (d) {
    LEGAL.forEach(function (file) {
      if (!fs.existsSync(path.join(ROOT, "legal", d, file))) return;
      var out = path.join(ROOT, d, file);
      assert.ok(fs.existsSync(out), d + "/" + file + " non genere");
      var html = fs.readFileSync(out, "utf8");
      assert.match(html, new RegExp('<link rel="canonical" href="https://iashark\\.com/' + d + '/' + file.replace(/\./g, "\\.") + '">'), d + "/" + file);
      assert.match(html, new RegExp('<html[^>]*\\slang="' + DIRS[d].htmlLang + '"'), d + "/" + file);
      assert.match(html, /\/bottom-navigation\.js/, d + "/" + file);
    });
  });
});

test("landings pays gb/za/mx : aucun historique ni 'public record', liens dans le repertoire, prix via market-config", () => {
  ["gb", "za", "mx"].forEach(function (d) {
    var html = read(d + "/landing.html");
    var visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    assert.doesNotMatch(visible, /historique|track record|public record|on the record|historial p[uú]blico|pr[oó]ximamente/i, d);
    Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map(function (m) { return m[1]; }).forEach(function (h) {
      if (!/\.html$|\/$/.test(h)) return; // ressources partagees (favicon, assets)
      assert.ok(h.indexOf("/" + d + "/") === 0 || /^\/(en|es|mx)\/blog\//.test(h), d + "/landing.html : lien hors repertoire " + h);
    });
    assert.match(html, /<script src="\/lib\/market-config\.js"><\/script>/, d);
    ["free", "pro"].forEach(function (k) { assert.match(html, new RegExp('data-market-price="' + k + '"'), d + " " + k); });
    // Audit QA 14/09/2026 : checkout = un seul prix Stripe par marche. Tant que
    // des prix par plan n'existent pas cote serveur, aucun plan Edge / Annual
    // Edge (ni prix, ni bouton) n'est propose : rien ne peut facturer le
    // mauvais plan.
    ["edge", "annual_edge"].forEach(function (k) { assert.doesNotMatch(visible, new RegExp('data-market-price="' + k + '"'), d + " " + k + " visible"); });
    assert.doesNotMatch(visible, /subscribe(Edge|Annual)Btn/, d + " : bouton Edge/Annual visible");
    assert.doesNotMatch(read(d + "/" + d + "-page.js"), /wireCheckout\("subscribe(Edge|Annual)Btn"/, d + " : bouton Edge/Annual encore cable");
    // Aucune note interne visible (TODO juridique) : commentaire HTML seulement.
    assert.doesNotMatch(visible, /legal-todo|\[TODO/, d + " : TODO juridique visible");
    assert.match(html, /<!-- LEGAL REVIEW:/, d + " : information juridique a conserver en commentaire");
    assert.match(html, new RegExp('<meta name="iashark-market" content="' + d + '">'), d);
  });
  assert.match(read("mx/landing.html"), /Liga MX ya está cubierta/);
  assert.match(read("mx/landing.html"), /800 911 2000/);
  // Meme systeme visuel que le site principal (index.html) : Tailwind + tokens.
  ["gb", "za", "mx"].forEach(function (d) {
    var html = read(d + "/landing.html");
    assert.match(html, /<link rel="stylesheet" href="\/assets\/tailwind\.css">/, d);
    assert.match(html, /class="hdr"/, d);
    assert.match(html, /class="brand-logo"/, d);
  });
});
