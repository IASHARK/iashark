"use strict";
// « Mes inscrits » (admin.html) : helpers purs (statuts, email masque,
// « il y a X jours », barre des 7 jours, retention, parcours par jour), rendu
// dans un faux navigateur AVEC et SANS la migration 0025, garde-fous
// statiques de la migration (admin seulement, lecture seule, anon revoque,
// comptes internes exclus, refus du suivi respecte).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const H = require("../admin-dashboard.js");
const sql = read("supabase/migrations/0025_admin_members.sql");
const code = sql.replace(/--.*$/gm, "");
const html = read("admin.html");
const js = read("admin-dashboard.js");
const NOW = "2026-09-15T10:00:00Z";
const before = (days) => new Date(Date.parse(NOW) - days * 864e5).toISOString();
const NAMES = { "42": { home: "PSG", away: "OM", league: "Ligue 1" } };
const nb = (s) => String(s).replace(/[  ]/g, " ");

function fnBlock(name) {
  const start = sql.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, name + " definie");
  const end = sql.indexOf("$$;", sql.indexOf("as $$", start));
  return sql.slice(start, end);
}

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------
test("maskEmail : 1 ou 2 premiers caracteres, domaine visible, adresses invalides => null", () => {
  assert.equal(H.maskEmail("leo.martin@gmail.com"), "le***@gmail.com");
  assert.equal(H.maskEmail("ab@x.fr"), "a***@x.fr");
  assert.equal(H.maskEmail("a@x.fr"), "a***@x.fr");
  assert.equal(H.maskEmail("  jean@exemple.com "), "je***@exemple.com");
  assert.equal(H.maskEmail("sans-arobase"), null);
  assert.equal(H.maskEmail("@x.fr"), null);
  assert.equal(H.maskEmail(null), null);
  const block = fnBlock("admin_mask_email");
  assert.match(block, /position\('@' in btrim\(coalesce\(p_email, ''\)\)\) < 2 then null/, "meme regle d'adresse invalide");
  assert.match(block, /<= 2 then 1 else 2 end\)\s+\|\| '\*\*\*@' \|\| split_part\(btrim\(p_email\), '@', 2\)/, "meme masque en SQL");
});

test("memberStatus : Pro, Nouveau, Actif, A relancer, Parti (memes seuils que le SQL)", () => {
  const s = (m) => H.memberStatus(m, NOW).key;
  assert.equal(s({ plan: "pro", created_at: before(90), last_seen_at: before(40) }), "pro");
  assert.equal(s({ plan: "free", created_at: before(3) }), "new");
  assert.equal(s({ plan: "free", created_at: before(6.9) }), "new");
  assert.equal(s({ plan: "free", created_at: before(7) }), "to_nudge", "7 jours pile sans activite");
  assert.equal(s({ plan: "free", created_at: before(20), last_seen_at: before(2) }), "active");
  assert.equal(s({ plan: "free", created_at: before(40), last_sign_in_at: before(10) }), "to_nudge", "une connexion compte comme activite");
  assert.equal(s({ plan: "free", created_at: before(40), last_seen_at: before(29.9) }), "to_nudge");
  assert.equal(s({ plan: "free", created_at: before(60), last_seen_at: before(45), last_sign_in_at: "pas une date" }), "gone");
  assert.equal(H.memberStatus({ plan: "free", created_at: before(40), last_sign_in_at: before(10) }, NOW).idleDays, 10);
  assert.equal(H.memberStatus({ plan: "free", created_at: before(40), last_sign_in_at: before(10) }, NOW).label, "À relancer");
  assert.equal(H.memberLastActivity({ last_seen_at: before(5), last_sign_in_at: before(2) }), before(2));
  assert.equal(H.memberLastActivity({}), null);
  assert.deepEqual(H.MEMBER_STATUS_ORDER, Object.keys(H.MEMBER_STATUS));
  const block = fnBlock("admin_members");
  const m = block.match(/when m\.plan = 'pro' then 'pro'\s+when m\.created_at > now\(\) - interval '7 days' then 'new'\s+when greatest\(m\.created_at, st\.last_seen_at, m\.last_sign_in_at\) > now\(\) - interval '7 days' then 'active'\s+when greatest\(m\.created_at, st\.last_seen_at, m\.last_sign_in_at\) > now\(\) - interval '30 days' then 'to_nudge'\s+else 'gone'/);
  assert.ok(m, "statut SQL : meme ordre et memes seuils que memberStatus()");
  assert.match(js, /MEMBER_NEW_DAYS = 7, MEMBER_IDLE_DAYS = 7, MEMBER_GONE_DAYS = 30/);
  const c = H.memberCounts([{ plan: "pro", created_at: before(1) }, { plan: "free", created_at: before(2) }, { plan: "free", created_at: before(50) }, null], NOW);
  assert.deepEqual({ ...c }, { total: 3, pro: 1, new: 1, active: 0, to_nudge: 0, gone: 1 });
});

test("daysAgo : jours calendaires de Paris, en clair", () => {
  assert.equal(H.daysAgo(before(0.1), NOW), "aujourd'hui");
  assert.equal(H.daysAgo("2026-09-14T22:30:00Z", NOW), "aujourd'hui", "00:30 a Paris le 15");
  assert.equal(H.daysAgo("2026-09-14T21:30:00Z", NOW), "hier", "23:30 a Paris le 14");
  assert.equal(H.daysAgo(before(2), NOW), "il y a 2 jours");
  assert.equal(H.daysAgo(before(45), NOW), "il y a 45 jours");
  assert.equal(H.daysAgo(before(95), NOW), "il y a 3 mois");
  assert.equal(H.daysAgo(null, NOW), "jamais");
});

test("activityBar : 7 derniers jours, du plus ancien a aujourd'hui", () => {
  const bar = H.activityBar(["2026-09-15", "2026-09-13", "2026-09-01", "x", null], NOW, 7);
  assert.equal(bar.length, 7);
  assert.equal(bar[0].day, "2026-09-09");
  assert.equal(bar[6].day, "2026-09-15");
  assert.deepEqual(bar.map((b) => b.active), [false, false, false, false, true, false, true]);
  assert.equal(H.activityBar(null, NOW).filter((b) => b.active).length, 0);
});

test("retention : phrase lisible, trop tot, singulier, taux", () => {
  const c = { week_start: "2026-09-07", signups: 10, eligible_d1: 10, returned_d1: 6, eligible_d7: 10, returned_d7: 4, eligible_d30: 0, returned_d30: 0 };
  assert.equal(nb(H.retentionSentence(c, 7)), "Sur 10 inscrits de la semaine du 7/09, 4 sont revenus après 7 jours.");
  assert.equal(H.retentionSentence(c, 30), "Inscrits de la semaine du 7/09 : trop tôt pour savoir s'ils reviennent après 30 jours.");
  assert.equal(H.retentionSentence({ week_start: "2026-09-07", signups: 10, eligible_d7: 6, returned_d7: 0 }, 7),
    "Sur 6 inscrits de la semaine du 7/09, aucun n'est revenu après 7 jours (4 autres inscrits depuis moins de 7 jours).");
  assert.equal(H.retentionSentence({ week_start: "2026-09-14", signups: 1, eligible_d1: 1, returned_d1: 1 }, 1),
    "Sur 1 inscrit de la semaine du 14/09, 1 est revenu le lendemain ou plus tard.");
  assert.equal(H.retentionRate(c, 7), 40);
  assert.equal(H.retentionRate(c, 30), null);
  assert.equal(H.retentionCell(c, 1).text, "6 sur 10");
  assert.equal(H.shortDay("2026-09-08"), "8/09");
});

test("journeyDays : un bloc par jour (plus recent d'abord), noms lisibles, matchs, clics, duree, avant l'inscription", () => {
  const items = [
    { type: "page_view", at: "2026-09-10T08:00:00Z", page: "/inscription.html", sec: null, before_signup: true },
    { type: "signup_completed", at: "2026-09-10T08:02:00Z", page: "/inscription.html" },
    { type: "page_view", at: "2026-09-15T07:00:00Z", page: "/", sec: 20 },
    { type: "click", at: "2026-09-15T07:00:15Z", kind: "match", label: "PSG - OM", match_id: "42" },
    { type: "page_view", at: "2026-09-15T07:00:20Z", page: "/fr/match.html", match_id: "42", sec: 180 },
    { type: "mystere", at: "2026-09-14T12:00:00Z" },
    { type: "page_view", at: "pas une date", page: "/" },
  ];
  const days = H.journeyDays(items, NAMES, NOW);
  assert.deepEqual(days.map((d) => d.title), ["Aujourd'hui", "Hier", "Jeudi 10 septembre"]);
  const today = days[0];
  assert.equal(today.summary, "2 pages · 1 match · 1 clic · 3 min 20");
  assert.deepEqual(today.entries.map((e) => e.text), ["Accueil", "Clic sur match : « PSG - OM » → PSG – OM", "Match PSG – OM"]);
  assert.equal(days[1].entries[0].text, "Autre action", "type inconnu jamais affiche brut");
  assert.equal(days[1].summary, "0 page");
  assert.equal(days[2].entries[0].beforeSignup, true);
  assert.equal(days[2].entries[1].win, true);
  assert.equal(days[2].summary, "1 page", "duree inconnue non inventee");
});

// ---------------------------------------------------------------------------
// Migration 0025 (non appliquee)
// ---------------------------------------------------------------------------
test("0025 : fonctions admin SECURITY DEFINER, refus explicite, lecture seule, jamais executables par anon", () => {
  assert.match(sql, /NON APPLIQUEE/);
  for (const [name, sig] of [["admin_members", "integer, boolean"], ["admin_member_journey", "uuid, integer"], ["admin_retention", "boolean"]]) {
    const block = fnBlock(name);
    assert.match(block, /returns json\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/, name);
    assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied' using errcode = '42501';/, name);
    assert.ok(sql.includes("revoke all on function public." + name + "(" + sig + ") from public, anon;"), name + " revoque");
    assert.ok(sql.includes("grant execute on function public." + name + "(" + sig + ") to authenticated;"), name + " accorde");
  }
  for (const [name, sig] of [["admin_mask_email", "text"], ["admin_member_events", ""]]) {
    const block = fnBlock(name);
    assert.ok(!/security definer/.test(block), name + " : helper sans privilege propre");
    assert.ok(sql.includes("revoke all on function public." + name + "(" + sig + ") from public, anon, authenticated;"), name + " non expose");
  }
  const body = code.replace(/create or replace function/g, "");
  assert.ok(!/\b(insert|update|delete|truncate|alter|drop|create)\b/i.test(body), "aucune ecriture ni DDL hors create or replace function");
  assert.ok(!/grant[^;]*\banon\b/i.test(code), "rien n'est accorde a anon");
  assert.ok(!/\bip\b|ip_address|x-forwarded/i.test(code), "aucune adresse IP");
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("0025 : comptes internes exclus par defaut, refus du suivi respecte, sources et derniere connexion", () => {
  assert.match(fnBlock("admin_members"), /p_days integer default 30,\s+p_include_internal boolean default false/);
  assert.match(fnBlock("admin_retention"), /p_include_internal boolean default false/);
  assert.match(fnBlock("admin_member_journey"), /p_user_id uuid,\s+p_limit integer default 200/);
  for (const name of ["admin_members", "admin_retention"]) {
    assert.match(fnBlock(name), /where p\.with_internal or not public\.admin_internal_account\(u\.email, u\.role\)/, name);
    assert.match(fnBlock(name), /au\.last_sign_in_at/, name);
  }
  const events = fnBlock("admin_member_events");
  assert.match(events, /raw_user_meta_data->>'tracking_opt_out', ''\) = 'true'/);
  assert.match(events, /not in \(select o\.id from opted_out o\)/, "aucun evenement lu pour un compte ayant refuse");
  assert.match(events, /e\.event_type = 'signup_completed' and e\.user_id is not null/, "session d'inscription");
  const members = fnBlock("admin_members");
  assert.match(members, /'email_masked', public\.admin_mask_email\(r\.email\)/);
  assert.match(members, /'page_views', case when r\.opted_out then null/);
  assert.match(members, /public\.admin_source_group\(r\.origin_md->>'utm_source', r\.origin_md->>'ref', r\.origin_md->>'browser'\)/);
  assert.match(members, /'\/\(abonnement\|pro\|landing\)\(\\\.html\)\?\$'/, "meme definition de la page abonnement que 0019/0022");
  assert.match(members, /x\.md->>'kind' = 'checkout'/, "clic sur payer = meme regle que le tunnel");
  assert.match(fnBlock("admin_retention"), /count\(\*\) filter \(where pm\.age_days >= 7 and pm\.r7\) as returned_d7/);
  // Conversions numeriques depuis metadata (ecrit par le navigateur) protegees.
  const casts = code.match(/->>'\w+'\)::(int|bigint)\b/g) || [];
  const guarded = code.match(/case when [\w.]+->>'\w+' ~ '\^\[0-9\]\{1,\d{1,2}\}\$' then least\(\([\w.]+->>'\w+'\)::int/g) || [];
  assert.ok(casts.length > 0);
  assert.equal(guarded.length, casts.length, "chaque conversion est protegee par une regex");
});

// ---------------------------------------------------------------------------
// Rendu dans un faux navigateur
// ---------------------------------------------------------------------------
function makeEl(id) {
  return {
    id, innerHTML: "", textContent: "", hidden: false, value: "", max: "", className: "", disabled: false, open: false,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, focus() {},
  };
}
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
const ymd = (days) => new Date(Date.now() - days * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

function handler(withMembers) {
  const analytics = {
    range: { previous_complete: true }, kpis: { visitors: 3, signups: 1 }, previous: { visitors: 2 }, internal_sessions: 0,
    series: [], top_pages: [], top_matches: [], sources: [], countries: [],
    funnel: { visitors: 3, match_page: 1, pricing_page: 0, checkout_started: 0, checkout_success: 0 },
  };
  const members = {
    tracking_since: ago(1), days: 30,
    members: [
      { user_id: "5b1f0c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e", email: "leo.martin@gmail.com", email_masked: "le***@gmail.com", plan: "free", created_at: ago(20), last_seen_at: ago(2), last_sign_in_at: ago(9),
        active_days_7: 2, active_days_30: 5, active_dates: [ymd(2), ymd(5)], page_views: 12, matches_viewed: 3, saw_pricing: true, clicked_pay: false, source_group: "tiktok", country: "FR", origin_basis: "signup" },
      { user_id: "6c2f0c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e", email: "<img src=x onerror=alert(1)>@x.fr", email_masked: "<i***@x.fr", plan: "free", created_at: ago(40), last_sign_in_at: ago(10),
        active_days_7: 0, active_days_30: 1, active_dates: [], page_views: 0, matches_viewed: 0, saw_pricing: false, clicked_pay: false, source_group: null, country: null, origin_basis: null },
      { user_id: "7d3f0c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e", email: "pro@exemple.fr", email_masked: "pr***@exemple.fr", plan: "pro", created_at: ago(3), last_seen_at: ago(0), tracking_opt_out: true,
        active_days_7: 1, active_days_30: 1, active_dates: [ymd(0)], page_views: null, matches_viewed: null, saw_pricing: null, clicked_pay: null },
    ],
  };
  const retention = {
    tracking_since: ago(1), members_total: 3, active: { today: 1, week: 2, month: 3 },
    overall: { eligible_d1: 3, returned_d1: 2, eligible_d7: 2, returned_d7: 1, eligible_d30: 1, returned_d30: 0 },
    cohorts: [{ week_start: "2026-09-07", signups: 10, eligible_d1: 10, returned_d1: 6, eligible_d7: 10, returned_d7: 4, eligible_d30: 0, returned_d30: 0 }],
  };
  return (name) => {
    switch (name) {
      case "admin_analytics": return { data: JSON.parse(JSON.stringify(analytics)) };
      case "admin_business": return { data: { accounts_created: 1, accounts_created_prev: 0, subscriptions: { active: 1, new_in_period: 0, past_due: 0 }, first_payments: [], renewals: [] } };
      case "admin_recent_sessions": return { data: [] };
      case "admin_recent_signups": return { data: [] };
      case "admin_health": return { data: { last_page_view_at: ago(0.001), last_billing_event_at: null } };
      case "admin_live_view": return { data: { visitors: [] } };
      case "admin_members": return withMembers ? { data: members } : { error: { code: "PGRST202", message: "Could not find the function" } };
      case "admin_retention": return withMembers ? { data: retention } : { error: { code: "PGRST202", message: "Could not find the function" } };
      case "admin_unlock_clicks": return withMembers
        ? { data: { total_clicks: 4, rows: [{ kind: "match_avis_unlock", clicks: 3, visitors: 3 }, { kind: "match_bar_unlock", clicks: 1, visitors: 1 }] } }
        : { error: { code: "PGRST202", message: "Could not find the function" } };
      default: return { error: { code: "PGRST202", message: "Could not find the function" } };
    }
  };
}

async function renderDashboard(withMembers) {
  const els = {};
  const calls = [];
  const h = handler(withMembers);
  const document = { hidden: false, getElementById: (id) => (els[id] = els[id] || makeEl(id)), querySelectorAll: () => [], addEventListener() {} };
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "admin" } }) }) }) }),
    rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(h(name, args)); },
  };
  const ctx = {
    document, localStorage: storage(), setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    supabase: { createClient: () => client },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  return { els, calls, text: (id) => (els[id] ? els[id].innerHTML + els[id].textContent : "") };
}

test("rendu AVEC 0025 : cartes, liste (email masque, statut colore, derniere visite en clair, barre 7 jours), retention", async () => {
  const d = await renderDashboard(true);
  assert.equal(d.els.dash.hidden, false);
  const call = d.calls.find((c) => c[0] === "admin_members");
  assert.deepEqual({ ...call[1] }, { p_days: 30, p_include_internal: false });
  assert.deepEqual({ ...d.calls.find((c) => c[0] === "admin_retention")[1] }, { p_include_internal: false });

  const cards = nb(d.text("memberCards"));
  assert.equal((cards.match(/class="kcard /g) || []).length, 4);
  for (const label of ["Actifs aujourd&#39;hui", "Actifs cette semaine", "À relancer", "Reviennent après 7 jours"]) assert.ok(cards.includes(label), label);
  assert.match(cards, /50 %/, "1 inscrit sur 2 eligibles");
  assert.match(cards, /1 inscrit n&#39;est plus venu depuis au moins 7 jours/);

  const list = nb(d.text("members"));
  assert.ok(list.includes("le***@gmail.com"), "email masque par defaut");
  assert.ok(!list.includes("leo.martin@gmail.com"), "email complet cache tant que le bouton n'est pas touche");
  assert.ok(!list.includes("<img"), "donnees echappees");
  assert.match(list, /Dernière visite : il y a 2 jours/);
  assert.match(list, /class="mstatus st-active"/);
  assert.match(list, /class="mstatus st-nudge"/);
  assert.match(list, /class="mstatus st-pro"/);
  assert.match(list, /via TikTok · France/);
  assert.match(list, /a refusé le suivi de ses visites/);
  assert.match(list, /2 j sur 7 · 5 j sur 30/);
  assert.equal((list.match(/class="m-bar"/g) || []).length, 3);
  assert.equal(d.els.membersEmails.hidden, false);

  const ret = nb(d.text("retention"));
  assert.match(ret, /Sur 10 inscrits de la semaine du 7\/09, 4 sont revenus après 7 jours\./);
  assert.match(ret, /Inscrits venus : 1 aujourd&#39;hui · 2 sur 7 jours · 3 sur 30 jours/);
  assert.match(ret, /trop tôt/);
  assert.equal(d.els.membersBody.hidden, false);
  assert.equal(d.els.membersNote.hidden, false);
  assert.match(d.els.membersNote.textContent, /Visites des inscrits suivies depuis le .*rien n'est reconstitué/);

  const unlock = nb(d.text("unlockClicks"));
  assert.match(unlock, /Clics « Débloquer » par emplacement/);
  assert.match(unlock, /Avis de l&#39;IA/);
  assert.match(unlock, /Barre en bas de l&#39;écran/);
  assert.match(unlock, /Le bouton le plus cliqué : « Avis de l&#39;IA » \(3 clics sur 4\)/);
  const uc = d.calls.find((c) => c[0] === "admin_unlock_clicks");
  assert.ok(uc && uc[1].p_include_internal === false && /^\d{4}-\d{2}-\d{2}$/.test(uc[1].p_from), "periode choisie, trafic interne exclu");
});

test("rendu SANS 0025 : message « a activer », le reste du tableau de bord fonctionne", async () => {
  const d = await renderDashboard(false);
  assert.equal(d.els.dash.hidden, false);
  assert.equal(d.els.stateDenied.hidden, true);
  const cards = d.text("memberCards");
  assert.match(cards, /Suivi des inscrits à activer/);
  assert.match(cards, /0025_admin_members\.sql/);
  assert.equal(d.els.membersBody.hidden, true);
  assert.match(d.text("cards"), /class="kcard /, "les cartes principales s'affichent toujours");
  assert.match(d.text("unlockClicks"), /À activer/);
});

// ---------------------------------------------------------------------------
// Clics « Debloquer » de la page match par emplacement
// ---------------------------------------------------------------------------
const UNLOCK_KINDS = ["match_avis_unlock", "match_recall_unlock", "match_analysis_unlock", "match_faq_unlock", "match_bar_unlock"];

test("unlockRows : 5 emplacements toujours presents, parts, phrase du bouton le plus clique", () => {
  const u = H.unlockRows({ rows: [{ kind: "match_bar_unlock", clicks: 6, visitors: 5 }, { kind: "match_avis_unlock", clicks: 2, visitors: 2 }, { kind: "inconnu", clicks: 99 }] });
  assert.deepEqual(u.rows.map((r) => r.kind), UNLOCK_KINDS);
  assert.equal(u.total, 8, "kind inconnu ignore");
  assert.equal(u.rows[4].pct, 75);
  assert.equal(u.sentence, "Le bouton le plus cliqué : « Barre en bas de l'écran » (6 clics sur 8).");
  assert.equal(H.unlockRows(null).sentence, "Aucun clic sur un bouton « Débloquer » de la page match sur cette période.");
  assert.deepEqual(H.UNLOCK_PLACES.map((p) => p[0]), UNLOCK_KINDS);
  const tracker = read("funnel-track.js");
  const matchPage = read("match-page.js");
  for (const k of UNLOCK_KINDS) {
    assert.match(tracker, new RegExp("\\b" + k + ": true"), k + " accepte par funnel-track.js");
    assert.match(matchPage, new RegExp("suivi\\('" + k + "'\\)"), k + " emis par match-page.js");
  }
  const journey = H.journeyDays([{ type: "click", at: NOW, kind: "match_faq_unlock", label: "match_faq_unlock" }], {}, NOW);
  assert.equal(journey[0].entries[0].text, "Clic sur « Débloquer » (FAQ)", "libelle technique jamais affiche");
});

test("0025 : admin_unlock_clicks admin seulement, lecture seule, 5 emplacements, trafic interne exclu", () => {
  const block = fnBlock("admin_unlock_clicks");
  assert.match(block, /returns json\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/);
  assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied' using errcode = '42501';/);
  assert.match(block, /p_include_internal boolean default false/);
  assert.ok(sql.includes("revoke all on function public.admin_unlock_clicks(date, date, boolean, timestamptz) from public, anon;"));
  assert.ok(sql.includes("grant execute on function public.admin_unlock_clicks(date, date, boolean, timestamptz) to authenticated;"));
  const kinds = [...block.matchAll(/\('(match_\w+_unlock)', \d\)/g)].map((m) => m[1]);
  assert.deepEqual(kinds, UNLOCK_KINDS);
  assert.match(block, /public\.admin_internal_reason\(e\.metadata\) is not null or e\.session_id ilike 'qa%'/);
  assert.match(block, /public\.admin_internal_account\(u\.email, u\.role\)/);
  assert.ok(!/\b(insert|update|delete|truncate|alter|drop)\b/i.test(block.replace(/--.*$/gm, "")));
});

test("admin.html : section « Mes inscrits » apres « Qui est la maintenant », ids relies, aide repliee", () => {
  const at = (id) => html.indexOf('id="' + id + '"');
  assert.ok(at("maintenant") < at("inscrits") && at("inscrits") < at("pages"));
  for (const id of ["membersTitle", "membersNote", "memberCards", "membersBody", "members", "membersEmails", "retention", "helpMembers", "helpRetention"]) {
    assert.ok(at(id) !== -1, id);
  }
  assert.match(html, /id="helpMembers" hidden/);
  assert.match(html, /id="helpRetention" hidden/);
  assert.match(js, /var MEMBERS_FILE = "0025_admin_members\.sql";/);
  assert.match(read("assets/admin.css"), /\.m-row\{grid-template-columns:minmax\(0,1fr\);gap:8px\}/, "liste lisible a 375 px");
});
