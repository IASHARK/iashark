"use strict";
// funnel-track.js : suivi interne anonyme. Execute le script dans un faux
// navigateur (vm) et verifie ce qui partirait vers funnel_events, sans aucun
// appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "funnel-track.js"), "utf8");

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function fakeElement({ tag = "a", href = null, text = "", attrs = {}, className = "", id = "" } = {}, origin = "https://iashark.com") {
  const el = {
    tagName: tag.toUpperCase(),
    textContent: text,
    className,
    id,
    href: href ? new URL(href, origin + "/").href : undefined,
    getAttribute(name) {
      if (name === "href") return href;
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    closest(selector) {
      if (selector === "[data-track]") return attrs["data-track"] ? el : null;
      if (selector === ".lang-switch-item") return className.split(/\s+/).includes("lang-switch-item") ? el : null;
      if (selector === "button") return tag === "button" ? el : null;
      if (selector === "a[href]") return tag === "a" && href ? el : null;
      return null;
    },
  };
  return el;
}

function run({ hostname = "iashark.com", pathname = "/", search = "", referrer = "", ua = IPHONE_UA, timeZone = "Europe/Paris", webdriver = false } = {}) {
  const sent = [];
  const docListeners = {};
  const winListeners = {};
  const origin = "https://" + hostname;
  const document = {
    referrer,
    visibilityState: "visible",
    documentElement: { scrollHeight: 2000, clientHeight: 800, scrollTop: 0 },
    body: { scrollHeight: 2000 },
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  const ctx = {
    location: { hostname, pathname, search, origin, href: origin + pathname + search },
    navigator: { userAgent: ua, language: "fr-FR", maxTouchPoints: 5, webdriver },
    screen: { width: 390 },
    innerHeight: 800,
    pageYOffset: 0,
    document,
    sessionStorage: storage(),
    localStorage: storage(),
    URL,
    URLSearchParams,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    setTimeout: (fn) => { fn(); return 0; },
    Date,
    Math,
    JSON,
    String,
    parseInt,
    fetch: (url, opts) => { sent.push({ url, opts, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); },
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return {
    ctx,
    sent,
    events: () => sent.map((s) => s.body),
    fireDoc: (type, event) => (docListeners[type] || []).forEach((fn) => fn(event || {})),
    fireWin: (type, event) => (winListeners[type] || []).forEach((fn) => fn(event || {})),
    el: (spec) => fakeElement(spec, origin),
  };
}

test("page_view : metadonnees grossieres, anonymes, pays estime depuis le fuseau", () => {
  const b = run({ pathname: "/match/1490469.html", search: "?utm_source=tiktok&utm_medium=social&utm_campaign=sept", referrer: "https://www.google.com/" });
  const pv = b.events().find((e) => e.event_type === "page_view");
  assert.ok(pv, "page_view envoye");
  assert.equal(pv.user_id, null);
  assert.equal(pv.page, "/match/1490469.html");
  assert.equal(pv.locale, "fr");
  assert.match(pv.session_id, /^v_/);
  const m = pv.metadata;
  assert.equal(m.device, "mobile");
  assert.equal(m.browser, "Safari");
  assert.equal(m.os, "iOS");
  assert.equal(m.country_guess, "FR");
  assert.equal(m.tz, "Europe/Paris");
  assert.equal(m.lang, "fr-FR");
  assert.equal(m.screen_w, 390);
  assert.equal(m.match_id, "1490469");
  assert.equal(m.landing, true);
  assert.equal(m.seq, 1);
  assert.equal(m.ref, "www.google.com");
  assert.equal(m.utm_source, "tiktok");
  assert.equal(m.utm_medium, "social");
  assert.equal(m.utm_campaign, "sept");
  assert.match(m.pv, /^p_/);
  const body = JSON.stringify(pv);
  assert.ok(!/@/.test(body), "aucun email");
  assert.ok(!/ip/i.test(Object.keys(m).join(",")), "aucune IP");
  assert.equal(b.sent[0].opts.keepalive, true);
  assert.equal(b.sent[0].opts.headers.Authorization, undefined);
});

test("match.html?id= et fuseau inconnu : match_id lu, country_guess null", () => {
  const b = run({ pathname: "/gb/match.html", search: "?id=123", ua: DESKTOP_CHROME_UA, timeZone: "Antarctica/Troll" });
  const pv = b.events()[0];
  assert.equal(pv.locale, "gb");
  assert.equal(pv.metadata.match_id, "123");
  assert.equal(pv.metadata.country_guess, null);
  assert.equal(pv.metadata.device, "desktop");
  assert.equal(pv.metadata.browser, "Chrome");
  assert.equal(pv.metadata.os, "Windows");
});

test("rien n'est envoye hors production, sur admin.html ou pour un robot", () => {
  assert.equal(run({ hostname: "localhost" }).sent.length, 0);
  assert.equal(run({ pathname: "/admin.html" }).sent.length, 0);
  assert.equal(run({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }).sent.length, 0);
  assert.equal(run({ webdriver: true }).sent.length, 0);
});

test("signup_started automatique sur la page d'inscription de chaque version", () => {
  const types = run({ pathname: "/mx/inscription.html" }).events().map((e) => e.event_type);
  assert.deepEqual(types, ["page_view", "signup_started"]);
  assert.ok(!run({ pathname: "/connexion.html" }).events().some((e) => e.event_type === "signup_started"));
});

test("page_leave : temps actif + scroll, meme pv que la page_view, sans doublon au pagehide", () => {
  const b = run({ pathname: "/pro.html" });
  const pvId = b.events()[0].metadata.pv;
  b.ctx.pageYOffset = 1200;
  b.ctx.document.visibilityState = "hidden";
  b.fireDoc("visibilitychange");
  b.fireWin("pagehide");
  const leaves = b.events().filter((e) => e.event_type === "page_leave");
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].metadata.pv, pvId);
  assert.equal(typeof leaves[0].metadata.sec, "number");
  assert.equal(leaves[0].metadata.scroll, 100);
  assert.equal(leaves[0].user_id, null);
});

test("click : seulement les actions significatives, libelles sans email, anti-rafale", () => {
  const b = run({ pathname: "/" });
  const click = (spec) => b.fireDoc("click", { target: b.el(spec) });
  click({ tag: "a", href: "/inscription.html", text: "  Créer un compte  " });
  click({ tag: "a", href: "/inscription.html", text: "  Créer un compte  " }); // doublon < 1 s
  click({ tag: "a", href: "/compte.html", text: "jean.dupont@example.com" });
  click({ tag: "a", href: "/match/42.html", text: "PSG - OM" });
  click({ tag: "a", href: "/blog.html", text: "Blog" }); // non significatif
  click({ tag: "a", href: "https://twitter.com/x", text: "Twitter" }); // externe
  click({ tag: "button", id: "subscribeProBtn", text: "Unlock Pro" });
  click({ tag: "button", id: "tabToday", text: "TODAY" }); // bouton d'interface
  click({ tag: "a", href: "/gb/", className: "lang-switch-item active", attrs: { "data-dir": "gb" }, text: "UK English" });
  click({ tag: "a", href: "/", attrs: { "data-track": "hero_cta" }, text: "Voir" });
  const clicks = b.events().filter((e) => e.event_type === "click").map((e) => e.metadata);
  assert.deepEqual(clicks.map((c) => c.kind), ["inscription", "compte", "match", "checkout", "lang_switch", "cta"]);
  assert.equal(clicks[0].label, "Créer un compte");
  assert.equal(clicks[1].label, "compte");
  assert.equal(clicks[2].match_id, "42");
  assert.equal(clicks[4].label, "gb");
  assert.equal(clicks[5].label, "hero_cta");
  assert.ok(!JSON.stringify(clicks).includes("@"));
  assert.ok(b.events().filter((e) => e.event_type === "click").every((e) => e.user_id === null));
});

test("user_id transmis uniquement avec le jeton du compte, jamais sur les evenements de navigation", () => {
  const b = run({ hostname: "iashark.com", pathname: "/inscription.html" });
  const track = b.ctx.iasharkTrack;
  const before = b.sent.length;
  track("signup_completed", {}, "11111111-1111-1111-1111-111111111111");
  track("signup_completed", {}, "11111111-1111-1111-1111-111111111111", "jwt-token");
  track("page_view", {}, "11111111-1111-1111-1111-111111111111", "jwt-token");
  const [noToken, withToken, pageView] = b.sent.slice(before);
  assert.equal(noToken.body.user_id, null);
  assert.equal(noToken.opts.headers.Authorization, undefined);
  assert.equal(withToken.body.user_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(withToken.opts.headers.Authorization, "Bearer jwt-token");
  assert.equal(pageView.body.user_id, null);
  assert.equal(pageView.opts.headers.Authorization, undefined);
});

test("auth-pages.js : login_completed anonyme, signup_completed avec le jeton du compte", () => {
  const auth = fs.readFileSync(path.join(root, "auth-pages.js"), "utf8");
  assert.match(auth, /iasharkTrack\('login_completed', \{\}\)/);
  assert.match(auth, /iasharkTrack\('signup_completed', \{\}, nouvelleSession\.user && nouvelleSession\.user\.id, nouvelleSession\.access_token\)/);
});
