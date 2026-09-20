"use strict";
// Tableau de bord admin (proprietaire debutant) : helpers purs
// (admin-dashboard.js), rendu complet dans un faux navigateur (vm) avec des
// RPC simulees (avec / sans villes, vide, erreur), garde-fous statiques des
// migrations 0019 (appliquee) et 0022 (villes, non appliquee) et de admin.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const H = require("../admin-dashboard.js");
const sql = read("supabase/migrations/0019_admin_dashboard_v2.sql");
const sql22 = read("supabase/migrations/0022_admin_geo_city.sql");
const html = read("admin.html");
const js = read("admin-dashboard.js");
const PREFS_KEY_TEST = "iashark_admin_prefs_v3";
const NAMES = { "1557402": { home: "Leeds", away: "Newcastle", league: "Premier League" }, "42": { home: "PSG", away: "OM", league: "Ligue 1" } };
const nb = (s) => s.replace(/[  ]/g, " ");

function fnBlock(source, name) {
  const start = source.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, name + " definie");
  const end = source.indexOf("$$;", source.indexOf("as $$", start));
  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------
test("pageInfo : chemins bruts -> noms lisibles (titre complet et nom court)", () => {
  const t = (p, id) => H.pageInfo(p, id, NAMES).title;
  assert.equal(t("/gb/"), "Accueil (Royaume-Uni)");
  assert.equal(t("/"), "Accueil (France)");
  assert.equal(t("/gb/match.html?id=1557402"), "Match : Leeds – Newcastle (UK)");
  assert.equal(t("/match/42.html"), "Match : PSG – OM (FR)");
  assert.equal(t("/mx/match.html", "999"), "Match n° 999 (MX)");
  assert.equal(t("/mx/abonnement.html"), "Abonnement (Mexique)");
  assert.equal(t("/en/blog/guides/xg-expected-goals-guide-complet"), "Blog : xG (expected goals) : calcul et lecture (International EN)");
  assert.equal(t("/fr/leagues/premier-league.html"), "Ligue : Premier League (France)");
  assert.equal(t("/gb/clubs/leeds-united"), "Club : Leeds united (Royaume-Uni)");
  assert.equal(t(null), "Page inconnue");
  assert.equal(H.pageInfo("/fr/match.html", "42", NAMES).name, "Match PSG – OM");
  assert.equal(H.pageInfo("/za/match.html").name, "Page match");
  assert.equal(H.pageInfo("/gb/abonnement").name, "Abonnement");
  assert.equal(H.pageInfo("/fr/<img src=x onerror=alert(1)>").base, "<img src=x onerror=alert(1)>", "donnee visiteur jamais interpretee");
});

test("safeHref : lien seulement pour un chemin sur", () => {
  assert.equal(H.safeHref("/gb/match", "1557402"), "/gb/match.html?id=1557402");
  assert.equal(H.safeHref("/gb/pro"), "/gb/pro");
  assert.equal(H.safeHref("javascript:alert(1)"), null);
  assert.equal(H.safeHref("//evil.example/x"), null);
  assert.equal(H.safeHref('/fr/"onmouseover=1'), null);
});

test("sourceGroup : Google, TikTok, Instagram, Facebook, X, WhatsApp, Bing, Direct, Autres", () => {
  const cases = [
    [["tiktok", null, null], "tiktok"], [[null, "www.tiktok.com", null], "tiktok"], [[null, "l.instagram.com", null], "instagram"],
    [["ig", null, null], "instagram"], [[null, "m.facebook.com", null], "facebook"], [[null, "t.co", null], "x"],
    [[null, "www.google.co.uk", null], "google"], [[null, "com.google.android.googlequicksearchbox", null], "google"],
    [[null, "www.bing.com", null], "bing"], [[null, "wa.me", null], "whatsapp"], [[null, null, "TikTok (app)"], "tiktok"],
    [[null, null, null], "direct"], [["  ", " ", null], "direct"], [[null, "duckduckgo.com", null], "other"], [[null, "mybingo.com", null], "other"],
  ];
  for (const [args, want] of cases) assert.equal(H.sourceGroup(...args), want, JSON.stringify(args));
  assert.equal(H.sourceLabel("x"), "X / Twitter");
  assert.equal(H.sourceLabel("direct"), "Direct");
});

test("parite : memes regles de sources dans admin-dashboard.js et admin_source_group (SQL 0019)", () => {
  const block = fnBlock(sql, "admin_source_group");
  const rules = [...block.matchAll(/when x\.s ~ '([^']+)' then '(\w+)'/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(rules, H.SOURCE_RULES);
});

test("formats : durees, pourcentages, argent, variations", () => {
  assert.equal(H.fmtDur(200), "3 min 20");
  assert.equal(H.fmtDur(3900), "1 h 05");
  assert.equal(nb(H.fmtInt(1234)), "1 234");
  assert.equal(nb(H.fmtPct(33.33)), "33,3 %");
  assert.equal(nb(H.fmtMoney(1990, "eur")), "19,90 €");
  assert.deepEqual(H.fmtDelta(118, 100), { dir: "up", text: "+18 %", good: true });
  assert.equal(H.fmtDelta(5, 0).dir, "new");
  assert.equal(H.fmtDelta(0, 0).dir, "flat");
  assert.equal(H.fmtDelta(5, 3, { previousComplete: false }).dir, "none");
  assert.equal(nb(H.revenueText({ first_payments: [{ currency: "eur", amount_cents: 1990, payments: 1 }], renewals: [{ currency: "eur", amount_cents: 1990, payments: 1 }] })), "39,80 €");
  assert.equal(nb(H.revenueText({})), "0,00 €");
});

test("periodes : aujourd'hui, 7 jours, 30 jours, personnalisee bornee", () => {
  const today = "2026-09-14";
  const d = H.periodRange("today", today);
  assert.deepEqual([d.from, d.to, d.days, d.label], [today, today, 1, "aujourd'hui"]);
  const w = H.periodRange("7", today);
  assert.deepEqual([w.from, w.to, w.days], ["2026-09-08", today, 7]);
  assert.equal(H.periodRange("30", today).from, "2026-08-16");
  const c = H.periodRange("custom", today, { from: "2026-09-20", to: "2026-09-01" });
  assert.deepEqual([c.from, c.to], ["2026-09-01", today]);
  assert.equal(H.periodRange("custom", today, { from: "pas-une-date" }).key, "today");
  assert.equal(H.parisToday(new Date("2026-09-13T22:30:00Z")), "2026-09-14");
});

test("resume du jour : une phrase simple, singulier, pluriel, zero", () => {
  assert.equal(H.todaySentence({ visitors: 12, signups: 1, newPro: 0 }), "12 personnes sont venues aujourd'hui, 1 s'est inscrite, aucun nouvel abonné.");
  assert.equal(H.todaySentence({ visitors: 1, signups: 0, newPro: 1 }), "1 personne est venue aujourd'hui, personne ne s'est inscrit, 1 nouvel abonné.");
  assert.equal(H.todaySentence({ visitors: 40, signups: 3, newPro: 2 }), "40 personnes sont venues aujourd'hui, 3 se sont inscrites, 2 nouveaux abonnés.");
  assert.equal(H.todaySentence({ visitors: 0, signups: 0, newPro: 0 }), "Aucune visite pour l'instant aujourd'hui, aucune inscription, aucun nouvel abonné.");
  assert.equal(H.todaySentence({ visitors: 5, signups: 2, newPro: null }), "5 personnes sont venues aujourd'hui, 2 se sont inscrites.");
  assert.match(H.todaySentence({}), /pas disponibles/);
});

test("comparaison du jour : fleche et phrase vs hier et vs 7 jours", () => {
  const series = [
    { t: "2026-09-13T00:00:00", visitors: 50 }, // jour du lancement (partiel) : ignore
    { t: "2026-09-14T00:00:00", visitors: 10 }, { t: "2026-09-15T00:00:00", visitors: 6 },
  ];
  assert.deepEqual(H.dailyAverage(series), { avg: 8, days: 2 });
  assert.equal(H.dailyAverage([{ t: "2026-09-13T00:00:00", visitors: 9 }]), null);
  const up = H.compareToday({ today: 12, yesterday: 8, yesterdayComplete: true, average: { avg: 9, days: 7 } });
  assert.deepEqual(up.map((l) => l.dir), ["up", "up"]);
  assert.equal(up[0].text, "4 visiteurs de plus qu'hier à la même heure (hier : 8).");
  assert.match(up[1].text, /^Moyenne des 7 derniers jours : 9 visiteurs par jour\. Aujourd'hui fait déjà mieux\.$/);
  const down = H.compareToday({ today: 3, yesterday: 4, yesterdayComplete: true, average: { avg: 8.5, days: 3 } });
  assert.deepEqual(down.map((l) => l.dir), ["down", "down"]);
  assert.equal(down[0].text, "1 visiteur de moins qu'hier à la même heure (hier : 4).");
  assert.match(nb(down[1].text), /Moyenne des 3 derniers jours : 8,5 visiteurs par jour\. Aujourd'hui : 3 pour l'instant \(la journée n'est pas finie\)\./);
  assert.equal(H.compareToday({ today: 4, yesterday: 4, yesterdayComplete: true, average: null })[0].dir, "flat");
  const none = H.compareToday({ today: 4, yesterday: 0, yesterdayComplete: false, average: null });
  assert.deepEqual(none.map((l) => l.dir), ["none", "none"]);
  assert.match(none[0].text, /Pas encore de comparaison avec hier/);
  assert.deepEqual(H.compareToday({ today: null }), []);
});

test("du visiteur au client : nombres, % et « c'est ici que tu perds le plus de monde »", () => {
  const steps = H.journeySteps({ visitors: 200, match_page: 120, pricing_page: 30, checkout_started: 6, checkout_success: 2, home_page: 999 });
  assert.deepEqual(steps.map((s) => s.label), ["Visite", "Page match", "Page abonnement", "Paiement commencé", "Abonné"]);
  assert.deepEqual(steps.map((s) => Math.round(s.pctOfFirst * 10) / 10), [100, 60, 15, 3, 1]);
  assert.deepEqual(steps.map((s) => s.pctOfPrev === null ? null : Math.round(s.pctOfPrev * 10) / 10), [null, 60, 25, 20, 33.3]);
  const leak = H.biggestLeak(steps);
  assert.deepEqual([leak.from, leak.to, leak.lost, leak.index], ["Page match", "Page abonnement", 90, 2]);
  assert.equal(nb(leak.sentence), "C'est ici que tu perds le plus de monde : entre « Page match » et « Page abonnement », 90 personnes sur 120 s'arrêtent (75 %).");
  assert.equal(H.biggestLeak(H.journeySteps({ visitors: 0, match_page: 0 })), null, "aucun visiteur : pas de phrase");
  assert.equal(H.biggestLeak(H.journeySteps({ visitors: 2, match_page: 2, pricing_page: 3, checkout_started: 3, checkout_success: 3 })), null, "personne perdu");
  const one = H.biggestLeak(H.journeySteps({ visitors: 1, match_page: 0, pricing_page: 0, checkout_started: 0, checkout_success: 0 }));
  assert.equal(nb(one.sentence), "C'est ici que tu perds le plus de monde : entre « Visite » et « Page match », 1 personne sur 1 s'arrête (100 %).");
  assert.equal(H.journeySteps({ visitors: 5, match_page: null })[2].pctOfPrev, null, "pas de taux apres une etape inconnue");
});

test("feu tricolore : vert, orange, rouge, inconnu, avec quoi faire", () => {
  const now = "2026-09-14T12:00:00Z";
  const home = { ok: true, generated_at: "2026-09-14T06:10:00Z" };
  const health = { last_page_view_at: "2026-09-14T11:58:00Z", last_billing_event_at: "2026-09-10T09:00:00Z" };
  const green = H.healthLights({ home, health, activePro: 2, now });
  assert.equal(green.level, "green");
  assert.equal(green.title, "Tout va bien");
  assert.deepEqual(green.checks.map((c) => [c.key, c.level]), [["pronos", "ok"], ["visits", "ok"], ["payments", "ok"]]);
  assert.match(green.checks[1].text, /il y a 2 min/);

  const amber = H.healthLights({ home: { ok: true, generated_at: "2026-09-13T06:00:00Z" }, health, activePro: 0, now });
  assert.equal(amber.level, "amber");
  assert.match(amber.checks[0].text, /Update IASHARK Daily/);

  const red = H.healthLights({ home, health: { last_page_view_at: "2026-09-11T12:00:00Z" }, activePro: 0, now });
  assert.equal(red.level, "red");
  assert.match(red.checks[1].text, /depuis 3 jours/);
  assert.equal(H.healthLights({ home: { ok: false }, health, now }).level, "red");

  const noStripe = H.healthLights({ home, health: { last_page_view_at: now }, activePro: 3, now });
  assert.equal(noStripe.checks[2].level, "warn");
  assert.match(noStripe.checks[2].text, /webhook Stripe/);
  assert.equal(H.healthLights({ home, health: { last_page_view_at: now }, activePro: 0, now }).checks[2].level, "ok", "aucun paiement au lancement : normal");
  const oldPay = H.healthLights({ home, health: { last_page_view_at: now, last_billing_event_at: "2026-07-01T00:00:00Z" }, activePro: 1, now });
  assert.equal(oldPay.checks[2].level, "warn");

  const unknown = H.healthLights({ home: undefined, health: null, healthError: true, now });
  assert.equal(unknown.level, "unknown");
  assert.match(unknown.checks[1].text, /Réessaie/);
});

test("humain / robot : badge et raison expliquee ; repartition des visites retirees", () => {
  assert.deepEqual([H.visitorKind({ is_internal: false }).human, H.visitorKind({}).label], [true, "Humain"]);
  const bot = H.visitorKind({ is_internal: true, internal_reason: "bot" });
  assert.equal(bot.label, "Robot / test");
  assert.match(bot.why, /^Robot ou navigateur automatique : pas compté/);
  assert.equal(H.visitorKind({ is_internal: true }).human, false, "0019 sans raison : robot / test");
  assert.equal(H.reasonLabel("emulated"), "Écran simulé");
  assert.equal(H.reasonLabel("internal"), "Ton appareil");

  const exact = H.reasonBreakdown({ internal_sessions: 9, internal_reasons: [{ reason: "bot", visitors: 2 }, { reason: "emulated", visitors: 6 }, { reason: null, visitors: 1 }] });
  assert.equal(exact.source, "period");
  assert.equal(exact.total, 9);
  assert.deepEqual(exact.rows.map((r) => [r.reason, r.visitors]), [["emulated", 6], ["bot", 2], ["account", 1]]);
  const sample = H.reasonBreakdown({ internal_sessions: 40 }, [{ is_internal: true, internal_reason: "qa" }, { is_internal: true, internal_reason: "qa" }, { is_internal: true, internal_reason: "internal" }, { is_internal: false }]);
  assert.equal(sample.source, "sample");
  assert.equal(sample.sampled, 3);
  assert.deepEqual(sample.rows.map((r) => [r.reason, r.visitors]), [["qa", 2], ["internal", 1]]);
  assert.equal(H.reasonBreakdown({ internal_sessions: 0 }).source, "none");
});

test("pays et villes : avec ou sans la migration 0022", () => {
  const without = H.geoState({ countries: [{ country: "FR", visitors: 3 }] });
  assert.deepEqual([without.available, without.cities.length], [false, 0]);
  const withCities = H.geoState({ cities: [{ country: "FR", region: "Occitanie", city: "Toulouse", visitors: 2 }, { city: null, visitors: 1 }], geo: { cities_available: true, visitors: 5, visitors_with_city: 2 } });
  assert.deepEqual([withCities.available, withCities.cities.length, withCities.withCity, withCities.visitors], [true, 1, 2, 5]);
  assert.equal(H.geoState({ cities: [], geo: { cities_available: true } }).available, true, "migration appliquee, pas encore de ville");
  assert.equal(H.placeLabel({ country: "FR", city: "Lyon" }), "Lyon, France");
  assert.equal(H.placeLabel({ country: "MX" }), "Mexique");
  assert.equal(H.placeLabel({}), "Lieu inconnu");
  const sr = H.shareRows([{ k: "a", visitors: 5 }, { k: "b", visitors: 3 }, { k: "c", visitors: 1 }, { k: "d", visitors: 1 }, { k: "e", visitors: 0 }], "k", 3);
  assert.deepEqual(sr.rows.map((r) => [r.key, r.visitors, Math.round(r.pct)]), [["a", 5, 50], ["b", 3, 30], ["__other", 2, 20]]);
});

test("heures : Paris et heure locale du visiteur quand le fuseau est connu", () => {
  const iso = "2026-09-14T12:32:00Z";
  assert.deepEqual(H.visitClock(iso, "America/Mexico_City"), { paris: "14:32", local: "06:32", text: "14:32 à Paris · 06:32 chez le visiteur" });
  assert.equal(H.visitClock(iso, "Europe/Brussels").text, "14:32 à Paris, même heure chez le visiteur");
  assert.equal(H.visitClock(iso, null).text, "14:32 (Paris)");
  assert.equal(H.visitClock(iso, "Pas/Un/Fuseau/Valide;").local, null);
  assert.equal(H.visitClock(iso, "Mars/Olympus_Mons").local, null, "fuseau inconnu du navigateur : ignore");
  assert.equal(H.ago("2026-09-14T11:59:30Z", "2026-09-14T12:00:00Z"), "il y a 30 s");
  assert.equal(H.onSiteFor("2026-09-14T11:56:10Z", "2026-09-14T12:00:00Z"), "sur le site depuis 3 min");
  assert.equal(H.onSiteFor("2026-09-14T11:59:30Z", "2026-09-14T12:00:00Z"), "sur le site depuis moins d'une minute");
});

test("phrases de visite : ville si connue, sinon pays", () => {
  assert.equal(H.sessionSentence({ country: "MX", device: "mobile", source_group: "tiktok", page_views: 4, duration_sec: 200, signed_up: true }),
    "Visiteur au Mexique · téléphone · arrivé via TikTok · 4 pages · 3 min 20 · s'est inscrit");
  assert.equal(H.sessionSentence({ country: "FR", city: "Lyon", device: "desktop", source_group: "direct", page_views: 1, duration_sec: 12, checkout_success: true }),
    "Visiteur à Lyon (France) · ordinateur · venu en direct · 1 page · 12 s · a payé");
  assert.match(H.sessionSentence({}), /^Visiteur \(lieu inconnu\) · appareil inconnu · source inconnue · 0 page$/);
});

test("esc : toute donnee visiteur est echappee", () => {
  assert.equal(H.esc(`<script>"'&\``), "&lt;script&gt;&quot;&#39;&amp;&#96;");
  assert.equal(H.esc(null), "");
});

// ---------------------------------------------------------------------------
// Rendu complet dans un faux navigateur, RPC simulees
// ---------------------------------------------------------------------------
function makeEl(id) {
  return {
    id, innerHTML: "", textContent: "", hidden: false, value: "", max: "", className: "", disabled: false, open: false,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, focus() {},
  };
}
function nowMinus(min) { return new Date(Date.now() - min * 60000).toISOString(); }

function scenario(kind) {
  const withGeo = kind === "geo";
  const empty = kind === "empty";
  const a = empty ? {
    range: { previous_complete: true }, kpis: { visitors: 0, signups: 0 }, previous: { visitors: 0 }, internal_sessions: 0,
    series: [], top_pages: [], top_matches: [], sources: [], countries: [], funnel: { visitors: 0, match_page: 0, pricing_page: 0, checkout_started: 0, checkout_success: 0 },
  } : {
    range: { previous_complete: true }, kpis: { visitors: 12, signups: 1 }, previous: { visitors: 8 }, internal_sessions: 5,
    series: [], top_pages: [{ page: "/fr/match.html", match_id: "42", views: 9, visitors: 5 }], top_matches: [{ match_id: "42", views: 9, visitors: 5 }],
    sources: [{ source_group: "google", visitors: 7 }, { source_group: "tiktok", visitors: 5 }],
    countries: [{ country: "FR", visitors: 10 }, { country: "MX", visitors: 2 }],
    funnel: { visitors: 12, match_page: 8, pricing_page: 2, checkout_started: 1, checkout_success: 0 },
  };
  if (withGeo) {
    a.cities = [{ country: "FR", region: "Auvergne-Rhône-Alpes", city: "Lyon", visitors: 4 }, { country: "FR", region: "x", city: "<img src=x onerror=alert(1)>", visitors: 1 }];
    a.geo = { cities_available: true, visitors: 12, visitors_with_city: 5 };
    a.internal_reasons = [{ reason: "emulated", visitors: 3 }, { reason: "bot", visitors: 2 }];
  }
  const business = { accounts_created: empty ? 0 : 1, accounts_created_prev: 0, subscriptions: { active: empty ? 0 : 2, new_in_period: 0, past_due: 0 }, first_payments: [], renewals: [] };
  const live = {
    visitors: empty ? [] : [
      { session_id: "v_1", last_at: nowMinus(0.2), first_at: nowMinus(4), page: "/fr/match.html", match_id: "42", country: "FR", device: "mobile", source_group: "google", is_internal: false, ...(withGeo ? { city: "Lyon", tz: "America/Mexico_City" } : {}) },
      { session_id: "v_2", last_at: nowMinus(1), first_at: nowMinus(2), page: "/gb/", country: "US", device: "desktop", source_group: "direct", is_internal: true, ...(withGeo ? { internal_reason: "bot" } : {}) },
    ],
  };
  const sessions = empty ? [] : [{ session_id: "v_1", first_at: nowMinus(30), last_at: nowMinus(20), entry_page: "/fr/", country: "FR", device: "mobile", source_group: "google", page_views: 3, duration_sec: 240, signed_up: true, pages: [], events: [] }];
  const internalSample = [{ session_id: "b1", is_internal: true, internal_reason: "bot" }, { session_id: "b2", is_internal: true, internal_reason: "internal" }];
  return function (name, args) {
    if (kind === "error" && name === "admin_analytics") return { error: { message: "Failed to fetch" } };
    switch (name) {
      case "admin_analytics": {
        const out = JSON.parse(JSON.stringify(a));
        // Plusieurs jours demandes : serie journaliere (buckets 'day' comme 0022).
        if (args && args.p_from && args.p_to && args.p_from !== args.p_to && !empty) {
          out.series = [];
          for (let d = new Date(args.p_from + "T12:00:00Z"); d.toISOString().slice(0, 10) <= args.p_to; d = new Date(d.getTime() + 864e5)) {
            out.series.push({ t: d.toISOString().slice(0, 10) + "T00:00:00", visitors: 3, page_views: 7 });
          }
        }
        return { data: out };
      }
      case "admin_business": return { data: business };
      case "admin_recent_sessions": return { data: args && args.p_include_internal ? internalSample : sessions };
      case "admin_recent_signups": return { data: empty ? [] : [{ email: "client@exemple.fr", created_at: nowMinus(60), plan: "free", is_internal: false }, { email: "moi@admin.fr", created_at: nowMinus(90), plan: "pro", role: "admin", is_internal: true }] };
      case "admin_health": return { data: { last_page_view_at: nowMinus(2), last_billing_event_at: empty ? null : nowMinus(600) } };
      case "admin_live_view": return { data: live };
      case "admin_stats": return { data: { pro_users: 0 } };
      default: return { error: { code: "PGRST202", message: "Could not find the function" } };
    }
  };
}

async function renderDashboard(kind, opts) {
  opts = opts || {};
  const els = {};
  const calls = [];
  const handler = scenario(kind);
  const document = {
    hidden: false,
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "admin" } }) }) }) }),
    rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(handler(name, args)); },
  };
  const ls = storage();
  if (opts.period) ls.setItem(PREFS_KEY_TEST, JSON.stringify({ period: opts.period }));
  const ctx = {
    document, localStorage: ls, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    fetch: (url) => Promise.resolve(url === "/data-home.json"
      ? { ok: true, json: () => Promise.resolve({ generated_at: new Date().toISOString(), matchs: [{ id: 42, home: "PSG", away: "OM", league: "Ligue 1" }] }) }
      : { ok: false, json: () => Promise.resolve(null) }),
    supabase: { createClient: () => client },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 5));
  return { els, calls, text: (id) => els[id] ? els[id].innerHTML + els[id].textContent : "" };
}

test("rendu : resume, 6 cartes, feu, parcours, sources, humain/robot, sans villes (0019 seule)", async () => {
  const d = await renderDashboard("nogeo");
  assert.equal(d.els.stateDenied.hidden, true);
  assert.equal(d.els.dash.hidden, false);
  assert.equal(d.els.heroText.textContent, "12 personnes sont venues aujourd'hui, 1 s'est inscrite, aucun nouvel abonné.");
  assert.match(d.text("heroCompare"), /4 visiteurs de plus qu&#39;hier à la même heure/);
  const cards = d.text("cards");
  assert.equal((cards.match(/class="kcard /g) || []).length, 6);
  for (const label of ["Visiteurs", "Inscriptions", "Abonnés Pro actifs", "Argent encaissé", "Revenu mensuel (MRR)", "En ce moment"]) assert.ok(cards.includes(">" + label + "<"), label);
  assert.equal((cards.match(/Ce que ça veut dire/g) || []).length, 6);
  assert.equal((cards.match(/class="info"/g) || []).length, 6, "un bouton i par carte");
  assert.match(cards, /1 personne navigue sur le site en ce moment/, "le robot n'est pas compte");
  assert.match(d.text("health"), /Tout va bien/);
  assert.match(d.text("funnel"), /C&#39;est ici que tu perds le plus de monde/);
  assert.match(d.text("sources"), /Google/);
  assert.match(d.text("countries"), /France/);
  assert.match(d.text("cities"), /Villes disponibles après activation/);
  const live = d.text("live");
  assert.match(live, /badge human" title="Visite normale, comptée dans tes chiffres\.">Humain/);
  assert.match(live, /badge robot" title="Robot, test ou ton appareil/);
  assert.match(live, /Match PSG – OM/);
  assert.match(d.text("pages"), /Match PSG – OM/);
  assert.match(d.text("matches"), /PSG – OM/);
  assert.match(d.text("bots"), />5</);
  assert.match(d.text("bots"), /estimation faite sur les 2 dernières visites retirées/, "sans 0022 : raisons estimees");
  assert.match(d.text("visits"), /Visiteur en France/);
  assert.match(d.text("signups"), /client@exemple\.fr/);
  assert.ok(!d.text("signups").includes("moi@admin.fr"), "comptes admin masques");
  const live30 = d.calls.find((c) => c[0] === "admin_live_view");
  assert.equal(live30[1].p_include_internal, true, "le direct montre aussi les robots, avec badge");
  assert.ok(d.calls.filter((c) => c[0] === "admin_analytics").every((c) => c[1].p_include_internal === false), "chiffres : vrais humains seulement");
});

test("rendu : avec villes (0022), raisons exactes, heure locale, donnees visiteur echappees", async () => {
  const d = await renderDashboard("geo");
  const cities = d.text("cities");
  assert.match(cities, /Lyon/);
  assert.ok(!cities.includes("<img src=x"), "ville echappee");
  assert.match(cities, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(cities, /Ville connue pour 5 visiteurs sur 12/);
  assert.match(d.text("bots"), /Écran simulé/);
  assert.ok(!/estimation/.test(d.text("bots")));
  assert.ok(!d.calls.some((c) => c[0] === "admin_recent_sessions" && c[1].p_include_internal), "pas d'echantillon quand 0022 est la");
  assert.match(d.text("live"), /Lyon, France/);
  assert.match(d.text("live"), /chez cette personne/);
  assert.match(d.text("live"), /Robot ou navigateur automatique : pas compté/);
});

test("rendu : etats vides rassurants", async () => {
  const d = await renderDashboard("empty");
  assert.equal(d.els.heroText.textContent, "Aucune visite pour l'instant aujourd'hui, aucune inscription, aucun nouvel abonné.");
  assert.match(d.text("funnel"), /Aucun visiteur sur cette période/);
  assert.match(d.text("sources"), /Pas encore de visiteurs sur cette période/);
  assert.match(d.text("countries"), /Aucun pays pour l&#39;instant/);
  assert.match(d.text("live"), /Personne sur le site en ce moment/);
  assert.match(d.text("pages"), /Aucune page vue sur cette période/);
  assert.match(d.text("matches"), /Aucun match regardé sur cette période/);
  assert.match(d.text("bots"), /Aucun robot ni test repéré/);
  assert.match(d.text("visits"), /Aucune visite sur cette période/);
  assert.match(d.text("signups"), /Aucun inscrit pour le moment/);
  assert.match(d.text("cards"), /Personne n&#39;est encore venu sur cette période/);
});

test("rendu : erreur reseau expliquee en clair, avec quoi faire", async () => {
  const d = await renderDashboard("error");
  assert.equal(d.els.noticeError.hidden, false);
  assert.match(d.els.noticeErrorText.textContent, /Pas de connexion au serveur.*Vérifie ta connexion Internet/);
  assert.match(d.text("funnel"), /Réessayer/);
  assert.match(d.text("live"), /Humain/, "le direct continue de fonctionner");
});

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
test("0019 : fonctions admin SECURITY DEFINER, refus explicite, jamais executables par anon", () => {
  for (const [name, sig] of [
    ["admin_analytics", "integer, boolean, date, date, timestamptz, text, text, text"],
    ["admin_live_view", "boolean, text, text, text"],
    ["admin_recent_sessions", "integer, boolean, date, date, timestamptz, text, text, text"],
    ["admin_recent_signups", "integer"],
    ["admin_business", "integer, date, date"],
    ["admin_exclude_session", "text, boolean"],
    ["admin_health", ""],
  ]) {
    const block = fnBlock(sql, name);
    assert.match(block, /security definer/, name);
    assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied'/, name);
    assert.ok(sql.includes("revoke all on function public." + name + "(" + sig + ") from public, anon;"), name + " revoque");
    const code = block.replace(/--.*$/gm, "");
    if (name !== "admin_exclude_session") assert.ok(!/\b(insert|update|delete|truncate|alter|drop)\b/i.test(code), name + " en lecture seule");
  }
  const reason = fnBlock(sql, "admin_internal_reason");
  for (const r of ["excluded", "internal", "qa", "bot", "emulated"]) assert.ok(reason.includes("'" + r + "'"), r);
});

test("0022 (non appliquee) : villes / regions / fuseau, memes signatures, admin seulement, lecture seule", () => {
  assert.match(sql22, /NON APPLIQUEE/);
  assert.ok(!/\bdrop\s+function\b/i.test(sql22), "create or replace uniquement, aucune signature changee");
  const sigs = {
    admin_analytics: "integer, boolean, date, date, timestamptz, text, text, text",
    admin_live_view: "boolean, text, text, text",
    admin_recent_sessions: "integer, boolean, date, date, timestamptz, text, text, text",
  };
  assert.equal((sql22.match(/create or replace function public\./g) || []).length, 3);
  for (const [name, sig] of Object.entries(sigs)) {
    const block = fnBlock(sql22, name);
    const orig = fnBlock(sql, name);
    assert.equal(block.slice(0, block.indexOf(")\nreturns")), orig.slice(0, orig.indexOf(")\nreturns")), name + " : memes parametres que 0019");
    assert.match(block, /returns json\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/, name);
    assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied' using errcode = '42501';/, name);
    assert.ok(!/\b(insert|update|delete|truncate|alter|drop|grant all)\b/i.test(block.replace(/--.*$/gm, "")), name + " en lecture seule");
    assert.ok(sql22.includes("revoke all on function public." + name + "(" + sig + ") from public, anon;"), name + " revoque");
    assert.ok(sql22.includes("grant execute on function public." + name + "(" + sig + ") to authenticated;"), name + " accorde");
    assert.match(block, /left\(nullif\(btrim\([\w.]+->>'geo_city'\), ''\), 60\) as city/, name + " : ville bornee");
    assert.match(block, /->>'tz' ~ '\^\[A-Za-z_\]\+/, name + " : fuseau valide par regex");
  }
  const an = fnBlock(sql22, "admin_analytics");
  assert.match(an, /group by 1, 2, 3 order by visitors desc, city limit 30/);
  assert.match(an, /'cities', \(select coalesce\(json_agg/);
  assert.match(an, /'cities_available', true/);
  assert.match(an, /'internal_reasons'/);
  assert.match(fnBlock(sql22, "admin_live_view"), /'internal_reason', a\.internal_reason, 'region', a\.region, 'city', a\.city, 'tz', a\.tz/);
  assert.match(fnBlock(sql22, "admin_recent_sessions"), /'region', d\.region, 'city', d\.city, 'tz', d\.tz/);
  assert.ok(!/\bip\b|ip_address|x-forwarded/i.test(sql22.replace(/--.*$/gm, "")), "aucune adresse IP");
  const code = sql22.replace(/--.*$/gm, "");
  const casts = code.match(/->>'\w+'\)::(int|bigint)\b/g) || [];
  const guarded = code.match(/case when [\w.]+(?:->'[\w]+')*->>'\w+' ~ '\^\[0-9\]\{1,\d{1,2}\}\$' then (?:least\()?\([\w.]+(?:->'[\w]+')*->>'\w+'\)::(int|bigint)/g) || [];
  assert.equal(guarded.length, casts.length, "chaque conversion numerique est protegee");
  assert.match(sql22, /notify pgrst, 'reload schema';/);
});

// ---------------------------------------------------------------------------
// admin.html
// ---------------------------------------------------------------------------
test("admin.html : sections dans l'ordre, periodes, aide i reliee, Exclure cet appareil, Details replies", () => {
  const order = ["heroText", "cards", "health", "funnel", "sources", "countries", "cities", "live", "pages", "matches", "bots", "deviceBtn", "details", "visits", "signups"];
  let last = -1;
  for (const id of order) {
    const at = html.indexOf('id="' + id + '"');
    assert.ok(at > last, "section " + id + " presente et dans l'ordre");
    last = at;
  }
  assert.deepEqual([...html.matchAll(/data-period="(\w+)"/g)].map((m) => m[1]), ["today", "yesterday", "7", "15", "30"]);
  // Suivi jour par jour (19/09/2026) : fleches et tableau.
  ["dayNav", "dayPrev", "dayNext", "dayNavLabel", "dailySection", "daily"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"'), id));
  assert.match(html, /<details class="details section" id="details">/, "Details replies par defaut");
  assert.ok(!/<details[^>]* open/.test(html));
  for (const m of html.matchAll(/class="info" aria-expanded="false" aria-controls="(\w+)"/g)) {
    assert.match(html, new RegExp('id="' + m[1] + '" hidden'), "aide " + m[1] + " reliee et repliee");
  }
  const infoClasses = [...(html + js).matchAll(/class="([^"]*)"/g)].map((m) => m[1]).filter((c) => /(^|\s)info(\s|$)/.test(c));
  assert.ok(infoClasses.every((c) => c === "info"), "la classe .info (bouton rond d'aide) n'est jamais combinee a un autre bloc : " + infoClasses.join(", "));
  assert.match(html, /id="deviceBtn">Exclure cet appareil</);
  assert.match(js, /var INTERNAL_KEY = "iashark_internal";/, "meme cle que funnel-track.js");
  assert.match(read("funnel-track.js"), /localStorage\.getItem\("iashark_internal"\) === "1"/);
  assert.ok(!/âge|sexe|genre|homme|femme/i.test(html + js), "aucune donnee d'age ou de sexe");
  assert.match(read("assets/admin.css"), /font-variant-numeric:tabular-nums/);
  assert.match(read("assets/admin.css"), /@media \(max-width:640px\)/);
});

test("admin.html : noindex, script dedie, pas de Google Analytics, CSP, ids existants", () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<script src="\/admin-dashboard\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/admin\.css">/);
  assert.ok(!html.includes("site-prefs.js"), "pas de GA ni de suivi sur la page admin");
  assert.ok(!/fixture|demo|lorem|Math\.random/i.test(html + js), "aucune donnee de demonstration livree");
  const headers = read("_headers");
  assert.match(headers, /script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(headers, /connect-src[^;]*https:\/\/ksvjraqitxouwiabecai\.supabase\.co/);
  const ids = new Set([...js.matchAll(/\$\("([A-Za-z][\w-]*)"\)/g)].map((m) => m[1]));
  assert.ok(ids.size > 20);
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), "id manquant dans admin.html : " + id);
});

test("suivi jour par jour : hier, 15 jours, un jour precis, lignes « Jour par jour »", () => {
  const today = "2026-09-19";
  const y = H.periodRange("yesterday", today);
  assert.deepEqual([y.from, y.to, y.days, y.label], ["2026-09-18", "2026-09-18", 1, "hier"]);
  const q = H.periodRange("15", today);
  assert.deepEqual([q.from, q.to, q.days], ["2026-09-05", "2026-09-19", 15]);
  const d = H.periodRange("day", today, { from: "2026-09-12" });
  assert.deepEqual([d.from, d.to, d.days, d.key], ["2026-09-12", "2026-09-12", 1, "day"]);
  assert.match(d.label, /^le samedi 12 septembre$/);
  assert.equal(H.periodRange("day", today, { from: "2026-09-17" }).label, "avant-hier");
  assert.equal(H.periodRange("day", today, { from: "2026-09-18" }).key, "yesterday");
  assert.equal(H.periodRange("day", today, { from: "2026-09-19" }).key, "today", "aujourd'hui ou futur : repli sur aujourd'hui");
  assert.equal(H.periodRange("day", today, { from: "2026-12-01" }).key, "today");
  assert.equal(H.periodRange("day", today, { from: "n'importe quoi" }).key, "today");
  // Lignes : du plus recent au plus ancien, bornees a la periode, jour en cours signale.
  const series = [
    { t: "2026-09-12T00:00:00", visitors: 4, page_views: 9 },
    { t: "2026-09-13T00:00:00", visitors: 0, page_views: 0 },
    { t: "2026-09-18T00:00:00", visitors: 7, page_views: 20 },
    { t: "2026-09-19T00:00:00", visitors: 2, page_views: 3 },
    { t: "2026-09-01T00:00:00", visitors: 99, page_views: 99 }
  ];
  const rows = H.dailyRows(series, H.periodRange("7", today), today);
  assert.deepEqual(rows.map((r) => r.day), ["2026-09-19", "2026-09-18", "2026-09-13"]);
  assert.equal(rows[0].title, "Aujourd'hui");
  assert.equal(rows[0].partial, true);
  assert.equal(rows[1].title, "Hier");
  assert.equal(rows[1].visitors, 7);
  assert.equal(rows[1].pageViews, 20);
  // Un seul jour (serie horaire) ou donnees absentes : aucune ligne, jamais d'erreur.
  assert.deepEqual(H.dailyRows(series, H.periodRange("today", today), today), []);
  assert.deepEqual(H.dailyRows([{ t: "2026-09-18T10:00:00", visitors: 1 }, { t: "2026-09-18T11:00:00", visitors: 1 }], H.periodRange("7", today), today), []);
  assert.deepEqual(H.dailyRows(null, H.periodRange("7", today), today), []);
  assert.deepEqual(H.dailyRows(series, null, today), []);
});

test("rendu : 7 jours -> tableau « Jour par jour » cliquable, pas de fleches ; un jour -> fleches, pas de tableau", async () => {
  const w = await renderDashboard("nogeo", { period: "7" });
  assert.equal(w.els.dailySection.hidden, false);
  const daily = w.text("daily");
  assert.equal((daily.match(/class="day-link"/g) || []).length, 7, "une ligne par jour");
  assert.match(daily, /data-day="\d{4}-\d{2}-\d{2}">Aujourd&#39;hui<\/button><small>en cours<\/small>/);
  assert.match(daily, />Hier</);
  assert.match(daily, />3<small>visiteurs · 7 pages vues<\/small>/);
  assert.equal(w.els.dayNav.hidden, true);
  const t = await renderDashboard("nogeo");
  assert.equal(t.els.dailySection.hidden, true);
  assert.equal(t.els.dayNav.hidden, false);
  assert.equal(t.els.dayNavLabel.textContent, "Aujourd'hui");
  assert.equal(t.els.dayNext.disabled, true, "pas de jour d'apres aujourd'hui");
  const y = await renderDashboard("nogeo", { period: "yesterday" });
  assert.equal(y.els.dayNavLabel.textContent, "Hier");
  assert.equal(y.els.dayNext.disabled, false);
});
