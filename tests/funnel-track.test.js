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

function run({ hostname = "iashark.com", pathname = "/", search = "", referrer = "", ua = IPHONE_UA, timeZone = "Europe/Paris", webdriver = false, screenW = 390, maxTouchPoints = 5, local = {}, extraGlobals = {}, session = {}, geo = () => Promise.resolve({ ok: false }), manualTimers = false } = {}) {
  const sent = [];
  const geoCalls = [];
  const timers = [];
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
    navigator: { userAgent: ua, language: "fr-FR", maxTouchPoints, webdriver },
    screen: { width: screenW },
    innerHeight: 800,
    pageYOffset: 0,
    document,
    sessionStorage: (() => { const st = storage(); Object.keys(session).forEach((k) => st.setItem(k, session[k])); return st; })(),
    localStorage: (() => { const st = storage(); Object.keys(local).forEach((k) => st.setItem(k, local[k])); return st; })(),
    URL,
    URLSearchParams,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    setTimeout: (fn) => { if (manualTimers) timers.push(fn); else fn(); return 0; },
    Date,
    Math,
    JSON,
    String,
    parseInt,
    fetch: (url, opts) => {
      if (url === "/api/geo") { geoCalls.push(opts); return geo(); }
      sent.push({ url, opts, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true });
    },
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
  };
  Object.assign(ctx, extraGlobals);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return {
    ctx,
    sent,
    geoCalls,
    runTimers: () => timers.splice(0).forEach((fn) => fn()),
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

test("rien n'est envoye hors production, sur admin.html ou pour un robot d'indexation", () => {
  assert.equal(run({ hostname: "localhost" }).sent.length, 0);
  assert.equal(run({ pathname: "/admin.html" }).sent.length, 0);
  assert.equal(run({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }).sent.length, 0);
});

test("visiteur reel : aucun marqueur interne, qa ou bot", () => {
  const md = run({ search: "?utm_source=tiktok" }).events()[0].metadata;
  assert.equal(md.internal, undefined);
  assert.equal(md.qa, undefined);
  assert.equal(md.bot, undefined);
  const desktop = run({ ua: DESKTOP_CHROME_UA, screenW: 1920, maxTouchPoints: 0 }).events()[0].metadata;
  assert.equal(desktop.bot, undefined);
});

test("navigateur pilote : suivi mais marque bot:true (webdriver, headless, Playwright, ecran emule)", () => {
  for (const opts of [
    { webdriver: true },
    { ua: DESKTOP_CHROME_UA.replace("Chrome/", "HeadlessChrome/") },
    { extraGlobals: { __playwright__binding__: {} } },
    { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", screenW: 390, maxTouchPoints: 0 },
  ]) {
    const events = run(opts).events();
    assert.ok(events.length > 0, "toujours envoye");
    assert.ok(events.every((e) => e.metadata.bot === true), JSON.stringify(opts));
  }
});

test("trafic interne : localStorage iashark_internal, ?internal=1 le pose, ?internal=0 l'efface", () => {
  const marked = run({ local: { iashark_internal: "1" } });
  assert.ok(marked.events().every((e) => e.metadata.internal === true));
  marked.ctx.iasharkTrack("signup_completed", { a: 1 });
  assert.equal(marked.events().at(-1).metadata.internal, true);
  assert.equal(marked.events().at(-1).metadata.a, 1);
  const set = run({ search: "?internal=1" });
  assert.equal(set.ctx.localStorage.getItem("iashark_internal"), "1");
  assert.equal(set.events()[0].metadata.internal, true);
  const cleared = run({ search: "?internal=0", local: { iashark_internal: "1" } });
  assert.equal(cleared.ctx.localStorage.getItem("iashark_internal"), null);
  assert.equal(cleared.events()[0].metadata.internal, undefined);
});

test("QA : utm_source commencant par qa => qa:true sur tous les evenements de l'onglet", () => {
  const b = run({ pathname: "/gb/", search: "?utm_source=qa_lead_check" });
  assert.equal(b.events()[0].metadata.qa, true);
  assert.equal(b.ctx.sessionStorage.getItem("iashark_visit_qa"), "1");
  b.ctx.document.visibilityState = "hidden";
  b.fireDoc("visibilitychange");
  assert.ok(b.events().every((e) => e.metadata.qa === true));
  assert.equal(run({ search: "?utm_source=QA-diag" }).events()[0].metadata.qa, true);
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

// 16/09/2026 : liste des matchs de l'accueil (home-list.js). Kinds dedies,
// liste fermee, sans donnee personnelle (libelle fixe ou cle de competition).
test("click : kinds dedies de l'accueil (banniere, cadenas, rappel, favori), liste fermee", () => {
  const b = run({ pathname: "/gb/" });
  const click = (spec) => b.fireDoc("click", { target: b.el(spec) });
  click({ tag: "a", href: "/gb/abonnement.html", attrs: { "data-track": "home_banner_ready", "data-track-kind": "home_banner_ready" }, text: "See plans" });
  click({ tag: "a", href: "/gb/match.html?id=1570383", attrs: { "data-track": "home_row_lock", "data-track-kind": "home_row_lock" }, text: "Alaves Valencia" });
  click({ tag: "a", href: "/gb/abonnement.html", attrs: { "data-track": "home_list_upsell", "data-track-kind": "home_list_upsell" }, text: "See plans" });
  click({ tag: "button", attrs: { "data-track": "laliga", "data-track-kind": "home_fav_add" }, text: "" });
  click({ tag: "a", href: "/gb/", attrs: { "data-track": "x", "data-track-kind": "user_email" }, text: "x" });
  const clicks = b.events().filter((e) => e.event_type === "click").map((e) => e.metadata);
  assert.deepEqual(clicks.map((c) => c.kind), ["home_banner_ready", "home_row_lock", "home_list_upsell", "home_fav_add", "cta"]);
  assert.equal(clicks[0].target, "/gb/abonnement.html");
  assert.equal(clicks[1].match_id, "1570383");
  assert.equal(clicks[1].label, "home_row_lock");
  assert.equal(clicks[3].label, "laliga");
  assert.equal(clicks[3].target, undefined);
  assert.ok(b.events().filter((e) => e.event_type === "click").every((e) => e.user_id === null));
});

// 16/09/2026 : page match V8 (match-page.js, visiteur). Un kind par bouton
// « Debloquer » : avis, rappel apres les stats, analyse fermee, FAQ, barre mobile.
test("click : kinds dedies de la page match (boutons Debloquer), liste fermee", () => {
  const b = run({ pathname: "/gb/match.html", search: "?id=1570383" });
  const click = (spec) => b.fireDoc("click", { target: b.el(spec) });
  const kinds = ["match_avis_unlock", "match_recall_unlock", "match_analysis_unlock", "match_faq_unlock", "match_bar_unlock"];
  for (const k of kinds) {
    click({ tag: "a", href: "/gb/abonnement.html", attrs: { "data-track": k, "data-track-kind": k }, text: "Unlock" });
  }
  click({ tag: "a", href: "/gb/abonnement.html", attrs: { "data-track": "match_x", "data-track-kind": "match_other_unlock" }, text: "Unlock" });
  const clicks = b.events().filter((e) => e.event_type === "click").map((e) => e.metadata);
  assert.deepEqual(clicks.map((c) => c.kind), kinds.concat(["cta"]), "kind hors liste => cta");
  assert.ok(clicks.slice(0, 5).every((c) => c.target === "/gb/abonnement.html" && c.label === c.kind));
  const js = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  for (const k of kinds) assert.match(js, new RegExp("suivi\\('" + k + "'\\)"), k + " absent de match-page.js");
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

const tick = () => new Promise((resolve) => setImmediate(resolve));
const geoOk = (body) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

test("ville approximative : /api/geo appele une fois, geo_country/region/city ajoutes a la page_view, jamais d'IP", async () => {
  const b = run({ pathname: "/gb/", manualTimers: true, geo: geoOk({ country: "GB", countryName: "United Kingdom", subdivision: "England", city: "Leeds", timezone: "Europe/London", ip: "203.0.113.9" }) });
  assert.equal(b.geoCalls.length, 1);
  assert.equal(b.geoCalls[0].credentials, "omit");
  assert.equal(b.events().length, 0, "la page_view attend la reponse (au plus 1,2 s)");
  await tick(); await tick(); await tick();
  const pv = b.events().find((e) => e.event_type === "page_view");
  assert.ok(pv, "page_view envoyee apres la reponse");
  assert.equal(pv.metadata.geo_country, "GB");
  assert.equal(pv.metadata.geo_region, "England");
  assert.equal(pv.metadata.geo_city, "Leeds");
  assert.ok(!JSON.stringify(pv).includes("203.0.113.9"), "aucune IP");
  assert.deepEqual(JSON.parse(b.ctx.sessionStorage.getItem("iashark_geo_v1")), { country: "GB", region: "England", city: "Leeds" });
  b.runTimers();
  assert.equal(b.events().filter((e) => e.event_type === "page_view").length, 1, "jamais deux page_view");
});

test("ville approximative : deja connue dans l'onglet => aucun nouvel appel, page_view immediate", () => {
  const b = run({ session: { iashark_geo_v1: JSON.stringify({ country: "MX", region: "Jalisco", city: "Guadalajara" }) } });
  assert.equal(b.geoCalls.length, 0);
  const md = b.events()[0].metadata;
  assert.deepEqual([md.geo_country, md.geo_region, md.geo_city], ["MX", "Jalisco", "Guadalajara"]);
  const none = run({ session: { iashark_geo_v1: "none" } });
  assert.equal(none.geoCalls.length, 0, "un echec n'est pas retente dans le meme onglet");
  assert.equal(none.events()[0].metadata.geo_city, undefined);
  const hostile = run({ session: { iashark_geo_v1: JSON.stringify({ country: "fr<", city: "<b>Lille</b>" }) } });
  assert.equal(hostile.events()[0].metadata.geo_country, undefined);
  assert.equal(hostile.events()[0].metadata.geo_city, "bLille/b");
});

test("ville approximative : echec, lenteur ou depart de la page => rien ne casse, page_view sans ville", async () => {
  const failed = run({ manualTimers: true, geo: () => Promise.reject(new Error("offline")) });
  await tick(); await tick();
  assert.equal(failed.events()[0].event_type, "page_view");
  assert.equal(failed.events()[0].metadata.geo_city, undefined);
  assert.equal(failed.ctx.sessionStorage.getItem("iashark_geo_v1"), "none");

  const slow = run({ manualTimers: true, geo: () => new Promise(() => {}) });
  assert.equal(slow.events().length, 0);
  slow.runTimers();
  assert.equal(slow.events()[0].event_type, "page_view", "delai depasse : envoyee sans ville");

  const leaving = run({ pathname: "/mx/inscription.html", manualTimers: true, geo: () => new Promise(() => {}) });
  leaving.ctx.document.visibilityState = "hidden";
  leaving.fireDoc("visibilitychange");
  assert.deepEqual(leaving.events().map((e) => e.event_type), ["page_view", "signup_started", "page_leave"], "page_view toujours avant page_leave");

  const thrower = run({ geo: () => { throw new Error("boom"); } });
  assert.equal(thrower.events()[0].event_type, "page_view");
  assert.equal(run({ hostname: "localhost" }).geoCalls.length, 0, "jamais hors production");
});
