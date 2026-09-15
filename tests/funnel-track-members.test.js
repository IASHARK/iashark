"use strict";
// funnel-track.js : suivi des INSCRITS connectes. page_view / page_leave /
// click portent le user_id (avec le jeton du compte) seulement si une session
// Supabase valide est presente et que le refus du suivi n'est pas active.
// Jamais d'email ni de jeton dans le corps envoye. Faux navigateur (vm),
// aucun appel reseau reel. Harnais independant de tests/funnel-track.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "funnel-track.js"), "utf8");
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const AUTH_KEY = "sb-ksvjraqitxouwiabecai-auth-token";
const UID = "5b1f0c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.jeton-du-membre.signature";
const nowSec = () => Math.floor(Date.now() / 1000);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function sessionObj({ uid = UID, token = TOKEN, expiresIn = 3600, meta = {} } = {}) {
  return {
    access_token: token, token_type: "bearer", expires_in: 3600, expires_at: nowSec() + expiresIn, refresh_token: "rafraichir",
    user: { id: uid, email: "jean.dupont@example.com", user_metadata: meta, app_metadata: {} },
  };
}
const session = (o) => JSON.stringify(sessionObj(o));

function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function run({ hostname = "iashark.com", pathname = "/", local = {}, manualTimers = false, extraGlobals = {} } = {}) {
  const sent = [];
  const timers = [];
  const docListeners = {};
  const winListeners = {};
  const origin = "https://" + hostname;
  const document = {
    referrer: "",
    visibilityState: "visible",
    documentElement: { scrollHeight: 2000, clientHeight: 800, scrollTop: 0 },
    body: { scrollHeight: 2000 },
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  const ctx = {
    location: { hostname, pathname, search: "", origin, href: origin + pathname },
    navigator: { userAgent: UA, language: "fr-FR", maxTouchPoints: 5, webdriver: false },
    screen: { width: 390 },
    innerHeight: 800,
    pageYOffset: 0,
    document,
    // Localisation deja connue dans l'onglet : la page_view n'attend que l'identite.
    sessionStorage: storage({ iashark_geo_v1: "none" }),
    localStorage: storage(local),
    URL,
    URLSearchParams,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Europe/Paris" }) }) },
    setTimeout: (fn) => { if (manualTimers) timers.push(fn); else fn(); return 0; },
    Date,
    Math,
    JSON,
    String,
    parseInt,
    fetch: (url, opts) => {
      if (url === "/api/geo") return new Promise(() => {});
      sent.push({ url, opts, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true });
    },
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
  };
  Object.assign(ctx, extraGlobals);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const matchLink = {
    tagName: "A", textContent: "PSG - OM", className: "", id: "", href: origin + "/match/42.html",
    getAttribute: (n) => (n === "href" ? "/match/42.html" : null),
    closest: (sel) => (sel === "a[href]" ? matchLink : null),
  };
  return {
    ctx,
    sent,
    events: () => sent.map((s) => s.body),
    runTimers: () => timers.splice(0).forEach((fn) => fn()),
    leave: () => { ctx.document.visibilityState = "hidden"; (docListeners.visibilitychange || []).forEach((fn) => fn({})); },
    clickMatch: () => (docListeners.click || []).forEach((fn) => fn({ target: matchLink })),
  };
}

function navEvents(b) {
  return b.sent.filter((s) => ["page_view", "page_leave", "click"].includes(s.body.event_type));
}

test("inscrit connecte : page_view, page_leave et click portent son user_id, envoyes avec son jeton", () => {
  const b = run({ pathname: "/gb/", local: { [AUTH_KEY]: session() } });
  b.leave();
  b.clickMatch();
  const nav = navEvents(b);
  assert.deepEqual(nav.map((s) => s.body.event_type), ["page_view", "page_leave", "click"]);
  for (const s of nav) {
    assert.equal(s.body.user_id, UID, s.body.event_type);
    assert.equal(s.opts.headers.Authorization, "Bearer " + TOKEN, s.body.event_type + " : jeton du compte (RLS funnel_events_insert_own)");
  }
});

test("inscrit connecte : jamais d'email, de jeton ni de donnee du compte dans ce qui est envoye", () => {
  const b = run({ pathname: "/compte.html", local: { [AUTH_KEY]: session({ meta: { display_name: "Jean", fav_leagues: ["ligue-1"] } }) } });
  b.leave();
  b.clickMatch();
  const bodies = JSON.stringify(b.events());
  assert.ok(b.events().length >= 3);
  assert.ok(!bodies.includes("@"), "aucun email");
  assert.ok(!bodies.includes("jean.dupont"));
  assert.ok(!bodies.includes(TOKEN), "le jeton ne part que dans l'en-tete");
  assert.ok(!/display_name|fav_leagues|Jean/.test(bodies), "aucune donnee du profil");
  for (const e of b.events()) assert.ok(!Object.keys(e.metadata).some((k) => /user|email|mail|token/i.test(k)), JSON.stringify(e.metadata));
});

test("visiteur non connecte : comportement inchange, anonyme et sans en-tete Authorization", () => {
  const b = run({ pathname: "/" });
  b.leave();
  b.clickMatch();
  const nav = navEvents(b);
  assert.equal(nav.length, 3);
  assert.ok(nav.every((s) => s.body.user_id === null && s.opts.headers.Authorization === undefined));
});

test("refus du suivi : localStorage iashark_tracking_opt_out=1 ou user_metadata.tracking_opt_out => aucun user_id", () => {
  for (const local of [
    { [AUTH_KEY]: session(), iashark_tracking_opt_out: "1" },
    { [AUTH_KEY]: session({ meta: { tracking_opt_out: true } }) },
    { [AUTH_KEY]: session({ meta: { tracking_opt_out: "true" } }) },
  ]) {
    const b = run({ local });
    b.leave();
    b.clickMatch();
    const nav = navEvents(b);
    assert.equal(nav.length, 3, "toujours mesure, mais anonymement");
    assert.ok(nav.every((s) => s.body.user_id === null && s.opts.headers.Authorization === undefined), JSON.stringify(Object.keys(local)));
  }
  const back = run({ local: { [AUTH_KEY]: session({ meta: { tracking_opt_out: false } }) } });
  assert.equal(back.events()[0].user_id, UID, "refus retire => suivi lie au compte");
});

test("jeton expire : la page_view attend le renouvellement par le client deja charge, puis porte le user_id", async () => {
  const fresh = sessionObj({ token: "eyJhbGciOiJIUzI1NiJ9.jeton-renouvele.signature" });
  let calls = 0;
  const b = run({
    local: { [AUTH_KEY]: session({ expiresIn: -120 }) },
    manualTimers: true,
    extraGlobals: { IasharkApp: { supabase: { auth: { getSession: () => { calls++; return Promise.resolve({ data: { session: fresh } }); } } } } },
  });
  assert.equal(b.events().length, 0, "page_view en attente");
  await tick(); await tick();
  assert.equal(calls, 1);
  const pv = b.sent.find((s) => s.body.event_type === "page_view");
  assert.ok(pv, "page_view envoyee apres le renouvellement");
  assert.equal(pv.body.user_id, UID);
  assert.equal(pv.opts.headers.Authorization, "Bearer " + fresh.access_token);
  b.runTimers();
  assert.equal(b.events().filter((e) => e.event_type === "page_view").length, 1, "jamais deux page_view");
});

test("jeton expire sans client disponible : page_view anonyme apres l'attente, jamais bloquee", () => {
  const b = run({ local: { [AUTH_KEY]: session({ expiresIn: -120 }) }, manualTimers: true });
  assert.equal(b.events().length, 0);
  for (let i = 0; i < 8; i++) b.runTimers();
  const pv = b.sent.filter((s) => s.body.event_type === "page_view");
  assert.equal(pv.length, 1);
  assert.equal(pv[0].body.user_id, null);
  assert.equal(pv[0].opts.headers.Authorization, undefined);
});

test("session illisible, identifiant invalide ou deconnexion => anonyme", () => {
  for (const raw of ["{pas du json", JSON.stringify({ access_token: TOKEN, expires_at: nowSec() + 3600, user: { id: "admin" } }), JSON.stringify({ user: { id: UID } })]) {
    const b = run({ local: { [AUTH_KEY]: raw } });
    assert.equal(b.events()[0].user_id, null, raw);
  }
  const b = run({ local: { [AUTH_KEY]: session() } });
  assert.equal(b.events()[0].user_id, UID);
  b.ctx.localStorage.removeItem(AUTH_KEY);
  b.leave();
  const leave = b.sent.find((s) => s.body.event_type === "page_leave");
  assert.equal(leave.body.user_id, null, "deconnecte pendant la visite");
  assert.equal(leave.opts.headers.Authorization, undefined);
});

test("user_id jamais pris chez l'appelant pour la navigation ; signup_completed inchange", () => {
  const OTHER = "11111111-1111-1111-1111-111111111111";
  const anon = run({ pathname: "/inscription.html" });
  anon.ctx.iasharkTrack("page_view", {}, OTHER, "autre-jeton");
  anon.ctx.iasharkTrack("signup_completed", {}, OTHER, "autre-jeton");
  const [pv, signup] = anon.sent.slice(-2);
  assert.equal(pv.body.user_id, null);
  assert.equal(pv.opts.headers.Authorization, undefined);
  assert.equal(signup.body.user_id, OTHER);
  assert.equal(signup.opts.headers.Authorization, "Bearer autre-jeton");

  const member = run({ pathname: "/", local: { [AUTH_KEY]: session() } });
  member.ctx.iasharkTrack("click", { kind: "cta" }, OTHER, "autre-jeton");
  const last = member.sent.at(-1);
  assert.equal(last.body.user_id, UID, "toujours la session de ce navigateur");
  assert.equal(last.opts.headers.Authorization, "Bearer " + TOKEN);
  member.ctx.iasharkTrack("login_completed", {});
  assert.equal(member.sent.at(-1).body.user_id, null, "les autres etapes restent anonymes sans jeton explicite");
});

test("hors production ou sur admin.html : rien n'est envoye, meme connecte", () => {
  assert.equal(run({ hostname: "localhost", local: { [AUTH_KEY]: session() } }).sent.length, 0);
  assert.equal(run({ pathname: "/admin.html", local: { [AUTH_KEY]: session() } }).sent.length, 0);
});

test("compte.html : interrupteur « Ne pas lier mes visites a mon compte », meme cle et meme drapeau que funnel-track.js", () => {
  const account = fs.readFileSync(path.join(root, "account-page.js"), "utf8");
  assert.match(code, /var OPT_OUT_KEY = "iashark_tracking_opt_out";/);
  assert.match(code, /tracking_opt_out === true/);
  assert.match(account, /'iashark_tracking_opt_out'/);
  assert.match(account, /interrupteur\('refusSuivi'/);
  assert.match(account, /Ne pas lier mes visites à mon compte/);
  assert.match(account, /updateUser\(\{ data: \{ tracking_opt_out: refus \} \}\)/);
  assert.ok(!/updateUser\(\{[^}]*email/.test(account.split("function basculerSuivi")[1] || ""), "le refus n'ecrit que le drapeau");
});
