"use strict";
// Bandeau de suggestion de langue des pages profondes (lib/lang-suggest.js,
// charge a la demande par i18n/i18n.js) : decision, textes, affichage, et
// jamais de redirection automatique.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const S = require("../lib/lang-suggest.js");
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
// 25/09/2026 : table servie par i18n/i18n.js = repertoires publics (de/it/pt
// retires, config/markets.json#_retiredDirs : leur langue est suggeree en anglais).
const DIRS = require("./helpers/public-dirs.js").PUBLIC_DIRS.map((d) => ({
  dir: d, locale: MARKETS._dirs[d].locale, htmlLang: MARKETS._dirs[d].htmlLang, market: MARKETS._dirs[d].market
}));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ALL_ALTS = {};
DIRS.forEach((d) => { ALL_ALTS[d.htmlLang.toLowerCase()] = "/" + d.dir + "/pro.html"; });

function mem(init) {
  const data = Object.assign({}, init);
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}
function env(over) {
  return Object.assign({
    pageDir: "fr", pageLocale: "fr", pathname: "/fr/pro.html", dirs: DIRS,
    languages: ["en-US", "en"], userAgent: CHROME, webdriver: false,
    storage: mem(), cookie: "", geoCountry: null, alternates: ALL_ALTS, fallbackHref: null
  }, over || {});
}
const decide = (over) => S.decide(env(over));
const pageEnv = (dir, over) => {
  const d = DIRS.find((x) => x.dir === dir);
  return Object.assign({ pageDir: dir, pageLocale: d.locale, pathname: "/" + dir + "/pro.html" }, over || {});
};

test("cas nominal : navigateur anglais sur une page francaise -> version anglaise equivalente (hreflang)", () => {
  const d = decide();
  assert.equal(d.show, true);
  assert.equal(d.target, "en");
  assert.equal(d.href, "/en/pro.html");
  assert.equal(d.text.lang, "en");
  // Langues des versions retirees (de/it/pt) : version anglaise, jamais /de/.
  assert.equal(decide({ languages: ["de-AT"] }).href, "/en/pro.html");
  assert.equal(decide({ languages: ["pt-BR", "en"] }).target, "en");
  assert.equal(decide({ languages: ["it-IT"] }).target, "en");
  assert.equal(decide(Object.assign(pageEnv("es"), { languages: ["fr-CH"] })).href, "/fr/pro.html");
});

test("meme langue ou langue non proposee : pas de bandeau", () => {
  assert.equal(decide({ languages: ["fr-FR", "en"] }).reason, "same-language");
  assert.equal(decide(Object.assign(pageEnv("gb"), { languages: ["en-US"] })).reason, "same-language");
  assert.equal(decide(Object.assign(pageEnv("es"), { languages: ["es-MX"] })).reason, "same-language");
  assert.equal(decide(Object.assign(pageEnv("mx"), { languages: ["es-ES"] })).reason, "same-language");
  assert.equal(decide({ languages: ["nl-NL", "en"] }).reason, "unsupported-language");
  assert.equal(decide({ languages: [] }).reason, "unsupported-language");
});

test("robots : jamais de bandeau (navigator.webdriver, user-agents de robots)", () => {
  assert.equal(decide({ webdriver: true }).reason, "bot");
  [
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome-Lighthouse",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
    "TelegramBot (like TwitterBot)"
  ].forEach((ua) => assert.equal(decide({ userAgent: ua }).reason, "bot", ua));
  [
    CHROME,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (Linux; Android 9; CUBOT X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
  ].forEach((ua) => assert.equal(S.isBot(ua, false), false, ua));
});

test("choix explicite, fermeture, plafond d'affichages, stockage indisponible", () => {
  assert.equal(decide({ storage: mem({ iashark_dir_chosen: "fr" }) }).reason, "chosen");
  assert.equal(decide({ cookie: "a=1; nf_country=fr; nf_lang=fr" }).reason, "chosen");
  assert.equal(decide({ cookie: "nf_lang=en" }).reason, "chosen");
  assert.equal(decide({ cookie: "xnf_country=1" }).show, true);
  assert.equal(decide({ storage: null }).reason, "no-storage");
  assert.equal(decide({ storage: mem({ iashark_lang_hint_dismissed: "en" }) }).reason, "dismissed");
  assert.equal(decide({ storage: mem({ iashark_lang_hint_dismissed: "de" }) }).show, true);
  assert.equal(decide({ storage: mem({ iashark_lang_hint_seen: String(S.MAX_IMPRESSIONS) }) }).reason, "cap");
  assert.equal(decide({ storage: mem({ iashark_lang_hint_seen: String(S.MAX_IMPRESSIONS - 1) }) }).show, true);
  // Ancien stockage « dernier repertoire consulte » : ce n'est PAS un choix.
  assert.equal(decide({ storage: mem({ iashark_dir: "fr", iashark_lang: "fr" }) }).show, true);
});

test("page equivalente : liens hreflang d'abord, jamais une page absente ni une 404", () => {
  // Hub ligue publie seulement en fr/en : pas de bandeau espagnol.
  const leagueAlts = { fr: "/fr/leagues/bundesliga.html", en: "/en/leagues/bundesliga.html" };
  assert.equal(decide({ alternates: leagueAlts, languages: ["es-ES"] }).reason, "no-equivalent");
  assert.equal(decide({ alternates: leagueAlts }).href, "/en/leagues/bundesliga.html");
  // Liens hreflang presents : le repli n'est jamais utilise.
  assert.equal(decide({ alternates: leagueAlts, languages: ["es"], fallbackHref: () => "/es/" }).reason, "no-equivalent");
  // Aucun lien hreflang : helpers de chemins (null = pas d'equivalent connu).
  assert.equal(decide({ alternates: {}, fallbackHref: () => null }).reason, "no-equivalent");
  assert.equal(decide({ alternates: {}, fallbackHref: (d) => "/" + d + "/compte.html" }).href, "/en/compte.html");
  assert.equal(decide({ alternates: { en: "/en/404.html", fr: "/fr/404.html" } }).reason, "no-equivalent");
  ["/fr/connexion.html", "/fr/inscription.html", "/fr/checkout-succes.html", "/fr/404.html"].forEach((p) =>
    assert.equal(decide({ pathname: p }).reason, "skip-page", p));
});

test("offres pays (GBP, ZAR, MXN) : jamais proposees ni quittees sans pays connu et correspondant", () => {
  // Version pays seulement si le pays du visiteur est connu (cache /api/geo).
  assert.equal(decide({ languages: ["en-GB"] }).target, "en");
  assert.equal(decide({ languages: ["en-GB"], geoCountry: "GB" }).target, "gb");
  assert.equal(decide({ languages: ["en-GB"], geoCountry: "GB" }).href, "/gb/pro.html");
  assert.equal(decide({ languages: ["en-US"], geoCountry: "ZA" }).target, "za");
  assert.equal(decide({ languages: ["es-MX"] }).target, "es");
  assert.equal(decide({ languages: ["es-MX"], geoCountry: "MX" }).target, "mx");
  assert.equal(decide({ languages: ["en-US"], geoCountry: "MX" }).target, "en");
  // Page d'un marche pays : on ne propose d'en sortir que si le visiteur n'en releve pas.
  assert.equal(decide(Object.assign(pageEnv("gb"), { languages: ["fr-FR"] })).reason, "market-unknown-country");
  assert.equal(decide(Object.assign(pageEnv("gb"), { languages: ["fr-FR"], geoCountry: "GB" })).reason, "other-market");
  assert.equal(decide(Object.assign(pageEnv("gb"), { languages: ["es-ES"], geoCountry: "ES" })).target, "es");
  assert.equal(decide(Object.assign(pageEnv("mx"), { languages: ["en-US"], geoCountry: "MX" })).reason, "other-market");
  // Propriete : une suggestion vers ou hors d'une offre PAYS (gb, za, mx)
  // correspond toujours au pays du visiteur. Entre versions de langue (dont
  // /en/, meme en USD apres config/markets.json#_usdSwitch) : libre.
  const countries = [null, "FR", "GB", "ZA", "MX", "US", "DE", "ES", "BR", "JP"];
  const languages = ["fr-FR", "en-US", "en-GB", "en-ZA", "es-ES", "es-MX", "de-DE", "it-IT", "pt-BR"];
  DIRS.forEach((page) => countries.forEach((geo) => languages.forEach((lang) => {
    const d = decide(Object.assign(pageEnv(page.dir), { languages: [lang], geoCountry: geo }));
    if (!d.show) return;
    const target = DIRS.find((x) => x.dir === d.target);
    if (target.market !== page.market && (S.isCountryOffer(target) || S.isCountryOffer(page))) {
      assert.ok(geo, page.dir + " -> " + d.target + " sans pays connu");
      assert.equal(target.market, S.countryMarket(geo, DIRS), page.dir + " -> " + d.target + " pour " + geo);
    }
  })));
  assert.equal(S.countryMarket("GB", DIRS), "gb");
  assert.equal(S.countryMarket("fr", DIRS), "fr");
  assert.equal(S.countryMarket("US", DIRS), "fr");
  assert.equal(S.countryMarket("", DIRS), "");
  // Bascule USD de /en/ (config/markets.json#_usdSwitch) : /en/ reste une version
  // de langue, suggeree comme avant, jamais une offre pays reservee aux Etats-Unis.
  const USD = DIRS.map((d) => (d.dir === "en" ? Object.assign({}, d, { market: "us" }) : d));
  assert.deepEqual(DIRS.filter((d) => S.isCountryOffer(d)).map((d) => d.dir).sort(), ["gb", "mx", "za"]);
  assert.equal(S.isCountryOffer(USD.find((d) => d.dir === "en")), false);
  assert.equal(S.countryMarket("US", USD), "fr");
  assert.equal(decide({ dirs: USD, languages: ["en-US"] }).target, "en", "anglais sur /fr/ -> /en/, pays inconnu");
  assert.equal(decide({ dirs: USD, languages: ["en-US"], geoCountry: "IE" }).target, "en");
  assert.equal(decide({ dirs: USD, languages: ["en-GB"], geoCountry: "GB" }).target, "gb", "offre pays inchangee");
  assert.equal(decide(Object.assign(pageEnv("en"), { dirs: USD, languages: ["fr-FR"] })).target, "fr");
  assert.equal(decide(Object.assign(pageEnv("gb"), { dirs: USD, languages: ["fr-FR"], geoCountry: "US" })).target, "fr", "hors d'une offre pays : pays connu, offre internationale");
});

test("textes : une entree par version, dans la langue proposee (fr, en, es, es-mx, de, it, pt)", () => {
  DIRS.forEach((d) => {
    const t = S.TEXT[d.dir];
    assert.ok(t, "textes manquants : " + d.dir);
    ["lang", "region", "msg", "cta", "close"].forEach((k) => assert.ok(t[k] && t[k].trim(), d.dir + "." + k));
    assert.equal(t.lang.toLowerCase(), d.htmlLang.toLowerCase());
  });
  const msgs = new Set(["fr", "en", "es", "de", "it", "pt"].map((l) => S.TEXT[l].msg));
  assert.equal(msgs.size, 6, "un message distinct par langue");
  Object.keys(S.LANG_DIR).forEach((l) => assert.ok(S.TEXT[S.LANG_DIR[l]]));
});

// ---------------------------------------------------------------------------
// Affichage (run) dans un DOM minimal.
function fakeEl(tag) {
  const el = {
    tagName: tag, attrs: {}, listeners: {}, children: [], parts: {}, parentNode: null, id: "", className: "", innerHTML: "", textContent: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    fire(type, ev) { (this.listeners[type] || []).forEach((fn) => fn(ev || {})); },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    querySelector(sel) { return (this.parts[sel] = this.parts[sel] || fakeEl("part")); }
  };
  return el;
}
function fakeWindow(opts) {
  opts = opts || {};
  const head = fakeEl("head");
  const body = fakeEl("body");
  const all = () => head.children.concat(body.children);
  const links = Object.keys(opts.alternates || {}).map((hl) => {
    const l = fakeEl("link");
    l.attrs = { rel: "alternate", hreflang: hl, href: opts.alternates[hl] };
    return l;
  });
  let navigations = 0;
  const location = { pathname: opts.pathname || "/fr/pro.html", hostname: "iashark.com" };
  let href = "https://iashark.com" + location.pathname;
  Object.defineProperty(location, "href", { get: () => href, set: (v) => { navigations++; href = v; } });
  const win = {
    URL,
    location,
    navigator: { languages: opts.languages || ["en-US", "en"], language: "en-US", userAgent: CHROME, webdriver: !!opts.webdriver },
    localStorage: mem(opts.local),
    sessionStorage: mem(opts.session),
    document: {
      head, body, documentElement: fakeEl("html"), cookie: opts.cookie || "",
      createElement: (tag) => fakeEl(tag),
      getElementById: (id) => all().find((c) => c.id === id) || null,
      querySelector: (sel) => (sel === ".site-bottom-nav" && opts.bottomNav ? fakeEl("nav") : null),
      querySelectorAll: (sel) => (/link\[rel="alternate"\]/.test(sel) ? links : [])
    },
    navigations: () => navigations
  };
  return win;
}
function fakeI18n(dir) {
  const chosen = [];
  return {
    chosen,
    dir, locale: DIRS.find((d) => d.dir === dir).locale, dirs: DIRS,
    hintPageDir: () => dir,
    switchHref: (t) => "/" + t + "/",
    hrefFor: (p, t) => "/" + t + "/",
    rememberChoice: (t) => chosen.push(t)
  };
}

test("run : un seul bandeau accessible, fixe en bas, au-dessus de la barre de navigation ; fermeture et choix memorises", () => {
  const win = fakeWindow({ alternates: Object.assign({ "x-default": "https://iashark.com/en/pro.html" },
    Object.fromEntries(DIRS.map((d) => [d.htmlLang, "https://iashark.com/" + d.dir + "/pro.html"]))), bottomNav: true });
  const i18n = fakeI18n("fr");
  const d = S.run(i18n, win);
  assert.equal(d.show, true);
  assert.equal(d.href, "/en/pro.html");
  const banner = win.document.body.children.find((c) => c.id === "iasharkLangHint");
  assert.ok(banner, "bandeau absent");
  assert.equal(banner.attrs.role, "region");
  assert.equal(banner.attrs.lang, "en");
  assert.equal(banner.attrs["aria-label"], "Language suggestion");
  assert.match(banner.className, /ias-lang-hint--nav/);
  assert.match(banner.innerHTML, /href="\/en\/pro\.html"/);
  assert.match(banner.innerHTML, /Switch to English/);
  assert.match(banner.innerHTML, /<button type="button" class="ias-lang-hint__close" aria-label="Close"/);
  const css = win.document.head.children.find((c) => c.id === "iasharkLangHintCss");
  assert.match(css.textContent, /position:fixed/);
  assert.match(css.textContent, /\.ias-lang-hint--nav\{bottom:calc\(96px/);
  assert.equal(win.localStorage.data.iashark_lang_hint_seen, "1");
  assert.equal(S.run(i18n, win).reason, "already-shown");

  banner.querySelector(".ias-lang-hint__cta").fire("click");
  assert.deepEqual(i18n.chosen, ["en"]);
  banner.querySelector(".ias-lang-hint__close").fire("click");
  assert.equal(win.localStorage.data.iashark_lang_hint_dismissed, "en");
  assert.ok(!win.document.body.children.includes(banner), "bandeau non retire");
  assert.equal(win.navigations(), 0, "jamais de redirection");

  // Echap ferme aussi.
  const win2 = fakeWindow({ alternates: { fr: "/fr/pro.html", en: "/en/pro.html" } });
  S.run(fakeI18n("fr"), win2);
  const b2 = win2.document.body.children[0];
  assert.doesNotMatch(b2.className, /--nav/);
  b2.fire("keydown", { key: "Escape" });
  assert.equal(win2.document.body.children.length, 0);
});

test("run : pays connu par le cache /api/geo, robots, choix deja fait", () => {
  const alternates = Object.fromEntries(DIRS.map((d) => [d.htmlLang, "/" + d.dir + "/pro.html"]));
  const gb = fakeWindow({ alternates, languages: ["en-GB"], session: { iashark_geo_v1: JSON.stringify({ country: "GB", region: null, city: null }) } });
  assert.equal(S.run(fakeI18n("fr"), gb).href, "/gb/pro.html");
  const bot = fakeWindow({ alternates, webdriver: true });
  assert.equal(S.run(fakeI18n("fr"), bot).reason, "bot");
  assert.equal(bot.document.body.children.length, 0);
  const chose = fakeWindow({ alternates, cookie: "nf_country=fr; nf_lang=fr" });
  assert.equal(S.run(fakeI18n("fr"), chose).reason, "chosen");
  // Sans liens hreflang : helpers de chemins, accueil = pas d'equivalent.
  const bare = fakeWindow({ pathname: "/fr/leagues/x.html" });
  assert.equal(S.run(fakeI18n("fr"), bare).reason, "no-equivalent");
  const home = fakeWindow({ pathname: "/fr/" });
  assert.equal(S.run(fakeI18n("fr"), home).href, "/en/");
});

// ---------------------------------------------------------------------------
// Pre-filtre et chargement a la demande dans i18n/i18n.js.
function loadI18n(opts) {
  opts = opts || {};
  const listeners = {};
  const timers = [];
  const appended = [];
  let navigations = 0;
  const location = { pathname: opts.pathname || "/fr/pro.html", search: "", hash: "", protocol: "https:" };
  let href = "https://iashark.com" + location.pathname;
  Object.defineProperty(location, "href", { get: () => href, set: (v) => { navigations++; href = v; } });
  const head = { appendChild: (s) => { appended.push(s); return s; } };
  const win = {
    location,
    navigator: { languages: opts.languages || ["en-US"], webdriver: !!opts.webdriver },
    localStorage: mem(opts.local),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    document: {
      readyState: opts.readyState || "loading", head, cookie: opts.cookie || "",
      documentElement: { getAttribute: () => opts.htmlLang || "fr" },
      querySelector: () => null,
      createElement: (tag) => ({ tagName: tag })
    }
  };
  const ctx = vm.createContext({ window: win });
  const src = read("i18n/i18n.js");
  vm.runInContext(src, ctx);
  if (opts.twice) vm.runInContext(src, ctx);
  return { win, I18N: win.I18N, listeners, timers, appended, navigations: () => navigations };
}

test("i18n.js : pre-filtre gratuit, script charge apres le chargement complet, une seule fois, sans redirection", () => {
  const r = loadI18n({ twice: true });
  assert.equal(r.I18N.langHintWanted(), true);
  assert.equal((r.listeners.load || []).length, 1, "une seule planification");
  r.listeners.load[0]();
  assert.equal(r.timers.length, 1);
  assert.ok(r.timers[0].ms >= 1000, "apres le premier affichage");
  r.timers[0].fn();
  assert.equal(r.appended.length, 1);
  assert.equal(r.appended[0].src, "/lib/lang-suggest.js");
  assert.equal(r.appended[0].async, true);
  r.timers[0].fn();
  assert.equal(r.appended.length, 1, "script charge une seule fois");
  assert.equal(r.navigations(), 0);

  assert.equal(loadI18n({ languages: ["fr-FR", "en"] }).I18N.langHintWanted(), false);
  assert.equal(loadI18n({ languages: ["nl-NL", "en"] }).I18N.langHintWanted(), false);
  assert.equal(loadI18n({ webdriver: true }).I18N.langHintWanted(), false);
  // Version deja choisie : le script du bandeau n'est meme pas telecharge.
  assert.equal(loadI18n({ local: { iashark_dir_chosen: "fr" } }).I18N.langHintWanted(), false);
  assert.equal(loadI18n({ cookie: "nf_country=fr; nf_lang=fr" }).I18N.langHintWanted(), false);
  // Page racine (redirigee en production) ou blog FR racine : pas de bandeau.
  assert.equal(loadI18n({ pathname: "/" }).I18N.langHintWanted(), false);
  assert.equal(loadI18n({ pathname: "/blog.html" }).I18N.langHintWanted(), false);
  // Pages match FR statiques sans prefixe : oui.
  const m = loadI18n({ pathname: "/match/1490478.html" });
  assert.equal(m.I18N.hintPageDir(), "fr");
  assert.equal(m.I18N.langHintWanted(), true);
  assert.equal(loadI18n({ pathname: "/es/pro.html", languages: ["es-MX"] }).I18N.langHintWanted(), false);
  // Document deja charge : planification immediate.
  const done = loadI18n({ readyState: "complete" });
  assert.equal(done.timers.length, 1);
  // Filtre negatif : aucun script telecharge.
  const same = loadI18n({ languages: ["fr-FR"], readyState: "complete" });
  same.timers[0].fn();
  assert.equal(same.appended.length, 0);
});
