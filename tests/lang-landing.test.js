"use strict";
// Langue de la page d'arrivee (i18n/i18n.js, 31/10/2026) : un visiteur dont le
// telephone n'est pas dans la langue de la PREMIERE page vue est envoye sur la
// meme page dans sa langue, une seule fois, jamais apres un choix, jamais pour
// un robot, jamais sur connexion / inscription / compte / paiement.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "i18n/i18n.js"), "utf8");

const CHROME_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ALTS = { fr: "/fr/match.html", "en-gb": "/gb/match.html", "en-za": "/za/match.html", en: "/en/match.html", "es-mx": "/mx/match.html", es: "/es/match.html" };

// Navigateur simule complet : location (replace observable), sessionStorage,
// localStorage, document (hreflang, referrer, cookie, body).
function browser(opts) {
  opts = opts || {};
  const url = new URL(opts.url || "https://iashark.com/fr/match.html?id=1&utm_source=x");
  const ss = Object.assign({}, opts.session || {});
  const ls = Object.assign({}, opts.local || {});
  const store = (o) => ({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null),
    setItem: (k, v) => { o[k] = String(v); },
    removeItem: (k) => { delete o[k]; }
  });
  const replaced = [];
  const appended = [];
  const alts = opts.alternates === undefined ? ALTS : opts.alternates;
  const links = Object.keys(alts).map((hl) => ({ getAttribute: (a) => (a === "hreflang" ? hl : a === "href" ? "https://iashark.com" + alts[hl] : null) }));
  const el = () => ({
    setAttribute() {}, addEventListener() {}, appendChild() {},
    querySelector: () => ({ addEventListener() {} }),
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
  });
  const body = { appendChild: (e) => appended.push(e) };
  const doc = {
    referrer: opts.referrer || "",
    cookie: opts.cookie || "",
    body: opts.noBody ? null : body,
    head: { appendChild() {} },
    documentElement: { getAttribute: () => (url.pathname.startsWith("/en/") ? "en" : "fr") },
    querySelector: () => null,
    querySelectorAll: (sel) => (/alternate/.test(sel) ? links : []),
    getElementById: () => null,
    createElement: el,
    addEventListener() {}
  };
  const win = {
    location: {
      pathname: url.pathname, search: url.search, hash: url.hash, hostname: url.hostname, protocol: url.protocol,
      replace: (h) => replaced.push(h)
    },
    navigator: { languages: opts.languages || ["en-US"], language: (opts.languages || ["en-US"])[0], userAgent: opts.ua || CHROME_UA, webdriver: !!opts.webdriver },
    sessionStorage: opts.noSession ? undefined : store(ss),
    localStorage: store(ls),
    document: doc,
    URL,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: opts.tz || "America/New_York" }) }) }
  };
  vm.runInContext(SRC, vm.createContext({ window: win }));
  return { win, replaced, appended, ss, ls };
}

test("telephone anglais sur /fr/match.html depuis X : meme page en /en/, utm et ancre gardes", () => {
  const b = browser({ url: "https://iashark.com/fr/match.html?id=1&utm_source=x#marches", referrer: "https://t.co/abc" });
  assert.deepEqual(b.replaced, ["/en/match.html?id=1&utm_source=x#marches"]);
  const info = JSON.parse(b.ss.iashark_lang_auto);
  assert.equal(info.from, "fr");
  assert.equal(info.to, "en");
  assert.equal(info.back, "/fr/match.html?id=1&utm_source=x#marches");
  assert.equal(info.ref, "t.co");
  assert.equal(b.win.__iasharkLangRedirecting, true);
});

test("table des langues : fr, es (mx au Mexique), en et toute autre langue -> anglais (gb/za selon le fuseau)", () => {
  const I = browser({ noSession: true }).win.I18N;
  const cases = [
    ["fr-FR", "Europe/Paris", "fr"], ["fr-CA", "America/Toronto", "fr"],
    ["es-ES", "Europe/Madrid", "es"], ["es-MX", "America/Mexico_City", "mx"], ["es-US", "America/Tijuana", "mx"],
    ["en-US", "America/New_York", "en"], ["en-GB", "Europe/London", "gb"], ["en-ZA", "Africa/Johannesburg", "za"],
    ["tr-TR", "Europe/Istanbul", "en"], ["pt-BR", "America/Sao_Paulo", "en"], ["id-ID", "Asia/Jakarta", "en"],
    ["de-DE", "Europe/Berlin", "en"], ["ko-KR", "Asia/Seoul", "en"], ["sv-SE", "Europe/Stockholm", "en"],
    ["vi-VN", "Asia/Ho_Chi_Minh", "en"], ["nb-NO", "Europe/Oslo", "en"], ["ar-SA", "Asia/Riyadh", "en"],
    ["ar", "Europe/London", "gb"], ["", "Europe/Paris", ""], [undefined, "", ""]
  ];
  for (const [lang, tz, want] of cases) assert.equal(I.autoTargetDir(lang, tz), want, lang + " / " + tz);
});

test("langues etrangeres sur une page francaise -> anglais ; francais sur /en/ -> /fr/ ; arabe sur /en/ reste", () => {
  for (const lang of ["tr-TR", "pt-BR", "id-ID", "de-DE", "ko-KR", "sv-SE", "vi-VN", "nb-NO", "es-ES", "ar-SA"]) {
    const b = browser({ languages: [lang], tz: "Asia/Dubai" });
    const want = lang === "es-ES" ? "/es/match.html?id=1&utm_source=x" : "/en/match.html?id=1&utm_source=x";
    assert.deepEqual(b.replaced, [want], lang);
  }
  const fr = browser({ url: "https://iashark.com/en/pro.html?utm_source=telegram", languages: ["fr-FR"], tz: "Europe/Paris", alternates: {} });
  assert.deepEqual(fr.replaced, ["/fr/pro.html?utm_source=telegram"]);
  const ar = browser({ url: "https://iashark.com/en/match.html?id=1", languages: ["ar-SA"] });
  assert.deepEqual(ar.replaced, []);
  // Meme langue, autre marche : rien (anglais sur /gb/, espagnol sur /mx/).
  assert.deepEqual(browser({ url: "https://iashark.com/gb/match.html?id=1", languages: ["en-US"] }).replaced, []);
  assert.deepEqual(browser({ url: "https://iashark.com/mx/match.html?id=1", languages: ["es-ES"], tz: "Europe/Madrid" }).replaced, []);
  // Telephone francais sur /fr/ : rien.
  assert.deepEqual(browser({ languages: ["fr-FR"], tz: "Europe/Paris" }).replaced, []);
});

test("accueil / et pages match statiques /match/<id>.html (francaises)", () => {
  assert.deepEqual(browser({ url: "https://iashark.com/?utm_source=x", languages: ["tr-TR"], tz: "Europe/Istanbul", alternates: {} }).replaced, ["/en/?utm_source=x"]);
  assert.deepEqual(browser({ url: "https://iashark.com/match/123.html?utm_source=x&id=9#a", languages: ["en-US"], alternates: {} }).replaced,
    ["/en/match.html?id=123&utm_source=x#a"]);
});

test("jamais : robots, choix deja fait, navigation interne, visite commencee, sans sessionStorage", () => {
  const no = (o) => assert.deepEqual(browser(Object.assign({ languages: ["en-US"] }, o)).replaced, [], JSON.stringify(o));
  no({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  no({ ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)" });
  no({ ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36" });
  no({ ua: "TelegramBot (like TwitterBot)" });
  no({ webdriver: true });
  no({ local: { iashark_dir_chosen: "fr" } });
  no({ cookie: "nf_lang=fr; nf_country=fr" });
  no({ referrer: "https://iashark.com/fr/" });
  no({ session: { iashark_visit_pages: "1" } });
  no({ session: { iashark_lang_landing: "1" } });
  no({ session: { iashark_lang_auto: "{\"from\":\"fr\",\"to\":\"en\"}" } });
  no({ noSession: true });
});

test("jamais sur connexion, inscription, compte, paiement ; jamais sans equivalent dans la langue cible", () => {
  for (const p of ["connexion", "inscription", "mot-de-passe-oublie", "reinitialiser-mot-de-passe", "compte", "abonnement", "checkout-succes", "checkout-annule", "desinscription-email", "404"]) {
    assert.deepEqual(browser({ url: "https://iashark.com/fr/" + p + ".html?x=1", alternates: {} }).replaced, [], p);
  }
  // Article de blog (slug traduit) ou page hors liste : rien.
  assert.deepEqual(browser({ url: "https://iashark.com/fr/blog/un-article.html", alternates: {} }).replaced, []);
  // hreflang present sans la version cible : rien.
  assert.deepEqual(browser({ alternates: { fr: "/fr/match.html", es: "/es/match.html" } }).replaced, []);
});

test("pas de boucle : la page de destination ne redirige plus et affiche le lien de retour une seule fois", () => {
  const first = browser({ referrer: "https://x.com/" });
  assert.equal(first.replaced.length, 1);
  // Page de destination, meme onglet (sessionStorage conserve), referent = page d'origine.
  const second = browser({ url: "https://iashark.com" + first.replaced[0], session: first.ss, referrer: "https://iashark.com/fr/match.html?id=1&utm_source=x" });
  assert.deepEqual(second.replaced, []);
  assert.equal(second.appended.length, 1, "lien de retour affiche");
  assert.match(second.appended[0].innerHTML, /Lire en français/);
  assert.match(second.appended[0].innerHTML, /href="\/fr\/match\.html\?id=1&amp;utm_source=x"/);
  // Rechargement : plus de lien, toujours pas de redirection.
  const third = browser({ url: "https://iashark.com" + first.replaced[0], session: second.ss });
  assert.deepEqual(third.replaced, []);
  assert.equal(third.appended.length, 0);
  // Retour sur la page francaise (bouton precedent) : pas de nouvelle redirection.
  assert.deepEqual(browser({ session: second.ss }).replaced, []);
});

test("lien de retour dans la langue d'origine (anglais, espagnol)", () => {
  const a = browser({ url: "https://iashark.com/en/pro.html", languages: ["fr-FR"], alternates: {} });
  const b = browser({ url: "https://iashark.com" + a.replaced[0], session: a.ss, alternates: {} });
  assert.match(b.appended[0].innerHTML, /Read in English/);
  const c = browser({ url: "https://iashark.com/es/pro.html", languages: ["fr-FR"], alternates: {} });
  const d = browser({ url: "https://iashark.com" + c.replaced[0], session: c.ss, alternates: {} });
  assert.match(d.appended[0].innerHTML, /Leer en español/);
});

test("decision pure exposee : raisons explicites", () => {
  const I = browser({ noSession: true }).win.I18N;
  const base = { pathname: "/fr/pro.html", languages: ["en-US"], sessionOk: true, host: "iashark.com", alternates: {} };
  assert.deepEqual({ ...I.decideLandingRedirect(base) }, { redirect: true, from: "fr", to: "en", href: "/en/pro.html" });
  assert.equal(I.decideLandingRedirect(Object.assign({}, base, { pathname: "/de/pro.html" })).reason, "no-page-dir");
  assert.equal(I.decideLandingRedirect(Object.assign({}, base, { languages: [] })).reason, "no-language");
  assert.equal(I.decideLandingRedirect(Object.assign({}, base, { pathname: "/blog/x.html" })).reason, "no-page-dir");
});
