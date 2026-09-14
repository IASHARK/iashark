"use strict";
// Tableau de bord admin v2 : helpers purs (admin-dashboard.js), parite des
// regles de sources avec le SQL, garde-fous statiques de la migration 0019 et
// de admin.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const H = require("../admin-dashboard.js");
const sql = read("supabase/migrations/0019_admin_dashboard_v2.sql");
const html = read("admin.html");
const js = read("admin-dashboard.js");
const NAMES = { "1557402": { home: "Leeds", away: "Newcastle", league: "Premier League" }, "42": { home: "PSG", away: "OM", league: "Ligue 1" } };
const nb = (s) => s.replace(/[  ]/g, " ");

function fnBlock(name) {
  const start = sql.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, name + " definie");
  const end = sql.indexOf("$$;", sql.indexOf("as $$", start));
  return sql.slice(start, end);
}

test("pageInfo : chemins bruts -> noms lisibles avec la version du site", () => {
  const t = (p, id) => H.pageInfo(p, id, NAMES).title;
  assert.equal(t("/gb/"), "Accueil (Royaume-Uni)");
  assert.equal(t("/gb/index.html"), "Accueil (Royaume-Uni)");
  assert.equal(t("/"), "Accueil (France)");
  assert.equal(t("/gb/match.html?id=1557402"), "Match : Leeds – Newcastle (UK)");
  assert.equal(t("/fr/match", "1557402"), "Match : Leeds – Newcastle (FR)");
  assert.equal(t("/match/42.html"), "Match : PSG – OM (FR)");
  assert.equal(t("/mx/match.html", "999"), "Match n° 999 (MX)");
  assert.equal(t("/za/match.html"), "Page match (ZA)");
  assert.equal(t("/mx/abonnement"), "Abonnement (Mexique)");
  assert.equal(t("/mx/abonnement.html"), "Abonnement (Mexique)");
  assert.equal(t("/en/blog/guides/xg-expected-goals-guide-complet"), "Blog : xG (expected goals) : calcul et lecture (International EN)");
  assert.equal(t("/fr/blog/guides/nouvel-article-inconnu"), "Blog : Nouvel article inconnu (France)");
  assert.equal(t("/mx/blog/"), "Blog (Mexique)");
  assert.equal(t("/fr/leagues/premier-league.html"), "Ligue : Premier League (France)");
  assert.equal(t("/gb/clubs/leeds-united"), "Club : Leeds united (Royaume-Uni)");
  assert.equal(t("/de/page-inexistante"), "Page introuvable (International DE)");
  assert.equal(t("/za/checkout-succes"), "Paiement réussi (Afrique du Sud)");
  assert.equal(t(null), "Page inconnue");
  // Donnee visiteur : jamais interpretee, le nom reste du texte.
  assert.equal(H.pageInfo("/fr/<img src=x onerror=alert(1)>").base, "<img src=x onerror=alert(1)>");
});

test("safeHref : lien seulement pour un chemin sur", () => {
  assert.equal(H.safeHref("/gb/match", "1557402"), "/gb/match.html?id=1557402");
  assert.equal(H.safeHref("/gb/pro"), "/gb/pro");
  assert.equal(H.safeHref("javascript:alert(1)"), null);
  assert.equal(H.safeHref("//evil.example/x"), null, "jamais de lien protocol-relative vers un autre site");
  assert.equal(H.safeHref('/fr/"onmouseover=1'), null);
});

test("sourceGroup : TikTok, Instagram, Facebook, Google, Bing, X, WhatsApp, Direct, Autres", () => {
  const cases = [
    [["tiktok", null, null], "tiktok"], [[null, "www.tiktok.com", null], "tiktok"], [[null, "l.instagram.com", null], "instagram"],
    [["ig", null, null], "instagram"], [[null, "m.facebook.com", null], "facebook"], [["fb", null, null], "facebook"],
    [[null, "t.co", null], "x"], [[null, "x.com", null], "x"], [["Twitter", null, null], "x"], [[null, "www.google.com", null], "google"],
    [[null, "www.google.co.uk", null], "google"], [[null, "com.google.android.googlequicksearchbox", null], "google"],
    [[null, "www.bing.com", null], "bing"], [[null, "web.whatsapp.com", null], "whatsapp"], [[null, "wa.me", null], "whatsapp"],
    [[null, null, "TikTok (app)"], "tiktok"], [[null, null, "Instagram (app)"], "instagram"], [[null, null, "Facebook (app)"], "facebook"],
    [[null, null, null], "direct"], [["  ", " ", null], "direct"], [[null, "duckduckgo.com", null], "other"], [["newsletter", null, null], "other"],
    [[null, "mybingo.com", null], "other"], [[null, "xbox.com", null], "other"], [["tt", null, null], "tiktok"], [[null, "lm.facebook.com", "Chrome"], "facebook"],
  ];
  for (const [args, want] of cases) assert.equal(H.sourceGroup(...args), want, JSON.stringify(args));
  assert.equal(H.sourceLabel("x"), "X / Twitter");
  assert.equal(H.sourceLabel("other"), "Autres sites");
  assert.equal(H.sourceLabel("direct"), "Direct");
});

test("parite : memes regles de sources dans admin-dashboard.js et admin_source_group (SQL)", () => {
  const block = fnBlock("admin_source_group");
  const rules = [...block.matchAll(/when x\.s ~ '([^']+)' then '(\w+)'/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(rules, H.SOURCE_RULES);
  assert.match(block, /ilike 'TikTok%' then 'tiktok'/);
  assert.match(block, /ilike 'Instagram%' then 'instagram'/);
  assert.match(block, /ilike 'Facebook%' then 'facebook'/);
});

test("CSV : separateur ;, guillemets, retours ligne, anti-injection de formule", () => {
  assert.equal(H.csvCell(null), "");
  assert.equal(H.csvCell(12.5), "12,5");
  assert.equal(H.csvCell(true), "oui");
  assert.equal(H.csvCell("simple"), "simple");
  assert.equal(H.csvCell('il a dit "oui"'), '"il a dit ""oui"""');
  assert.equal(H.csvCell("a;b"), '"a;b"');
  assert.equal(H.csvCell("ligne1\nligne2"), '"ligne1\nligne2"');
  assert.equal(H.csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(H.csvCell("+33"), "'+33");
  assert.equal(H.csvCell("@cmd"), "'@cmd");
  assert.equal(H.toCsv([{ key: "a", label: "A" }, { label: "B", csv: (r) => r.b * 2 }], [{ a: "x;y", b: 2 }]), 'A;B\r\n"x;y";4');
});

test("formats : durees, pourcentages, variations", () => {
  assert.equal(H.fmtDur(200), "3 min 20");
  assert.equal(H.fmtDur(45), "45 s");
  assert.equal(H.fmtDur(180), "3 min");
  assert.equal(H.fmtDur(3900), "1 h 05");
  assert.equal(H.fmtDur(null), "—");
  assert.equal(nb(H.fmtInt(1234)), "1 234");
  assert.equal(nb(H.fmtPct(33.33)), "33,3 %");
  assert.deepEqual(H.fmtDelta(118, 100), { dir: "up", text: "+18 %", good: true });
  assert.equal(H.fmtDelta(40, 50, { lowerIsBetter: true, points: true }).good, true);
  assert.equal(H.fmtDelta(5, 0).dir, "new");
  assert.equal(H.fmtDelta(0, 0).dir, "flat");
  assert.equal(H.fmtDelta(5, 3, { previousComplete: false }).dir, "none");
  assert.equal(H.fmtDelta(null, 3).dir, "none");
});

test("periodes : aujourd'hui, hier, N jours, personnalise borne", () => {
  const today = "2026-09-14";
  assert.deepEqual([H.periodRange("today", today).from, H.periodRange("today", today).to], [today, today]);
  const y = H.periodRange("yesterday", today);
  assert.deepEqual([y.from, y.to, y.days, y.legacyDays], ["2026-09-13", "2026-09-13", 1, null]);
  const w = H.periodRange("7", today);
  assert.deepEqual([w.from, w.to, w.days, w.legacyDays], ["2026-09-08", today, 7, 7]);
  const c = H.periodRange("custom", today, { from: "2026-09-20", to: "2026-09-01" });
  assert.deepEqual([c.from, c.to], ["2026-09-01", today]);
  assert.equal(H.periodRange("custom", today, { from: "pas-une-date" }).key, "7");
  assert.equal(H.parisToday(new Date("2026-09-13T22:30:00Z")), "2026-09-14");
  assert.equal(H.bucketLabel("2026-09-14T15:00:00", true), "15 h");
});

test("phrases : parcours et resume en francais simple", () => {
  assert.equal(
    H.sessionSentence({ country: "MX", device: "mobile", source_group: "tiktok", page_views: 4, duration_sec: 200, signed_up: true }),
    "Visiteur au Mexique · mobile · arrivé via TikTok · 4 pages · 3 min 20 · s'est inscrit"
  );
  assert.equal(
    H.sessionSentence({ country: "US", device: "desktop", source_group: "direct", page_views: 1, duration_sec: 12, checkout_success: true }),
    "Visiteur aux États-Unis · ordinateur · venu en direct · 1 page · 12 s · a payé"
  );
  assert.match(H.sessionSentence({}), /^Visiteur \(pays inconnu\) · appareil inconnu · source inconnue · 0 page$/);
  assert.equal(H.inCountry("FR"), "en France");
  assert.equal(H.fromCountry("ZA"), "d'Afrique du Sud");
  const a = {
    range: { previous_complete: true },
    kpis: { visitors: 118, signups: 3, checkout_success: 0 }, previous: { visitors: 100 },
    countries: [{ country: "MX", visitors: 70 }, { country: null, visitors: 80 }], sources: [{ source_group: "tiktok", visitors: 60 }],
    top_pages: [{ page: "/gb/match", match_id: "1557402", views: 20 }],
  };
  assert.equal(nb(H.summarize(a, { label: "Hier", names: NAMES })),
    "Hier : 118 visiteurs (+18 %), surtout du Mexique via TikTok, 3 inscriptions. Page la plus vue : Match : Leeds – Newcastle (UK).");
  assert.equal(H.summarize({ kpis: { visitors: 0 } }, { label: "Aujourd'hui" }), "Aujourd'hui : aucun visiteur enregistré pour l'instant.");
});

test("agregats : tunnel, carte de chaleur, ligues, repli 0015", () => {
  const f = { visitors: 100, home_page: 50, match_page: 40, signup_page: 20, signed_up: 5, pricing_page: 10, checkout_started: 2, checkout_success: 1 };
  const steps = H.funnelSteps(f, "purchase");
  assert.deepEqual(steps.map((s) => s.label), ["Visite", "Accueil", "Page match", "Abonnement", "Paiement commencé", "Payé"]);
  assert.equal(steps[1].pctOfPrev, 50);
  assert.equal(steps[2].pctOfPrev, 80);
  assert.equal(steps[3].pctOfPrev, 25);
  assert.equal(steps[0].pctOfPrev, null);
  assert.deepEqual(H.funnelSteps(f).map((s) => s.key), steps.map((s) => s.key), "tunnel d'achat par defaut");
  const signup = H.funnelSteps(f, "signup");
  assert.deepEqual(signup.map((s) => s.label), ["Visite", "Page inscription", "Inscrit"]);
  assert.equal(signup[2].pctOfPrev, 25);
  // Repli 0015 : etapes non mesurees => null, jamais 0 invente.
  const old = H.funnelSteps({ visitors: 10, home_page: null, match_page: null, pricing_page: 4 }, "purchase");
  assert.equal(old[1].value, null);
  assert.equal(old[1].pctOfFirst, null);
  assert.equal(old[3].pctOfPrev, null, "pas de taux apres une etape inconnue");
  assert.equal(H.legacyAnalytics({ funnel: { visits: 3 } }).funnel.home_page, null);
  const g = H.heatmapGrid([{ dow: 1, hour: 0, visitors: 3 }, { dow: 1, hour: 2, visitors: 2 }, { dow: 9, hour: 3, visitors: 99 }], 3);
  assert.equal(g.rows[0].cells.length, 8);
  assert.equal(g.rows[0].cells[0].visitors, 5);
  assert.equal(g.max, 5);
  const leagues = H.leaguesFromMatches([{ match_id: "1557402", views: 5, visitors: 3 }, { match_id: "42", views: 9, visitors: 4 }, { match_id: "7", views: 1, visitors: 1 }], NAMES);
  assert.deepEqual(leagues.map((l) => l.league), ["Ligue 1", "Premier League", "Ligue inconnue"]);
  const legacy = H.legacyAnalytics({ kpis: { visitors: 10, sessions: 12, signup_sessions: 1, checkout_sessions: 0 }, sources: [{ source: "(direct)", visits: 4 }, { source: "l.instagram.com", visits: 2 }, { source: "ig", visits: 1 }], funnel: { visits: 12, checkout_success: 0 } });
  assert.equal(legacy.kpis.visits, 12);
  assert.equal(legacy.kpis.signup_rate, 10);
  assert.deepEqual(legacy.sources.map((s) => [s.source_group, s.visitors]), [["direct", 4], ["instagram", 3]]);
  assert.equal(legacy.heatmap, null);
});

test("conversions : visite -> inscription -> Pro, jamais de division par zero", () => {
  const r = H.conversionRates({ visitors: 200, signups: 4, newPro: 1, accountsCreated: 5 });
  assert.equal(r.visitToSignup, 2);
  assert.equal(r.signupToPro, 20);
  assert.equal(r.visitToPro, 0.5);
  const z = H.conversionRates({ visitors: 0, signups: 0, newPro: null, accountsCreated: 0 });
  assert.deepEqual([z.visitToSignup, z.signupToPro, z.visitToPro], [null, null, null]);
  assert.equal(H.fmtPct(z.signupToPro), "—");
});

test("pipeline quotidien : fraicheur de data-home.json (a jour, en retard, bloque, inconnu)", () => {
  const now = "2026-09-14T12:00:00Z";
  assert.equal(H.pipelineStatus("2026-09-14T06:10:00Z", now).level, "ok");
  assert.equal(H.pipelineStatus("2026-09-13T11:11:16Z", now).level, "ok");
  assert.equal(H.pipelineStatus("2026-09-13T06:00:00Z", now).level, "warn");
  const bad = H.pipelineStatus("2026-09-10T06:00:00Z", now);
  assert.equal(bad.level, "bad");
  assert.match(bad.text, /il y a 4 jours/);
  assert.match(bad.text, /Update IASHARK Daily/);
  assert.equal(H.pipelineStatus(null, now).level, "unknown");
  assert.equal(H.pipelineStatus("pas une date", now).level, "unknown");
  assert.equal(H.internalReasonLabel("account"), "Compte admin ou de test");
});

test("esc : toute donnee visiteur est echappee", () => {
  assert.equal(H.esc(`<script>"'&\``), "&lt;script&gt;&quot;&#39;&amp;&#96;");
  assert.equal(H.esc(null), "");
});

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
    const block = fnBlock(name);
    assert.match(block, /security definer/, name);
    assert.match(block, /set search_path = public/, name);
    assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied'/, name);
    assert.ok(sql.includes("revoke all on function public." + name + "(" + sig + ") from public, anon;"), name + " revoque");
    assert.ok(sql.includes("grant execute on function public." + name + "(" + sig + ") to authenticated;"), name + " accorde");
    const code = block.replace(/--.*$/gm, "");
    if (name === "admin_exclude_session") {
      assert.ok(!/\b(insert|delete|truncate|alter|drop)\b/i.test(code), "exclusion : UPDATE uniquement");
      assert.match(code, /update public\.funnel_events\s+set metadata =/);
      const setCols = [...code.matchAll(/update public\.funnel_events\s+set (\w+)/g)].map((m) => m[1]);
      assert.deepEqual(setCols, ["metadata", "metadata"], "seule la colonne metadata est modifiee");
    } else {
      assert.ok(!/\b(insert|update|delete|truncate|alter|drop)\b/i.test(code), name + " en lecture seule");
    }
  }
  for (const [helper, sig] of [["admin_internal_reason", "jsonb"], ["admin_source_group", "text, text, text"], ["admin_internal_account", "text, text"]]) {
    assert.ok(sql.includes("revoke all on function public." + helper + "(" + sig + ") from public, anon, authenticated;"), helper);
  }
  assert.ok(!/\bdelete\s+from\b/i.test(sql.replace(/--.*$/gm, "")), "aucune suppression");
  assert.match(sql, /p_include_internal boolean default false/);
  assert.match(sql, /p_since timestamptz default '2026-09-13 19:00:00\+00'/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("0019 : exclusion du trafic interne, QA, robots, ecrans emules ; nombres valides avant conversion", () => {
  const reason = fnBlock("admin_internal_reason");
  for (const r of ["excluded", "internal", "qa", "bot", "emulated"]) assert.ok(reason.includes("'" + r + "'"), r);
  assert.match(reason, /ilike 'qa%'/);
  const code = sql.replace(/--.*$/gm, "");
  const casts = code.match(/->>'\w+'\)::(int|bigint)\b/g) || [];
  const guarded = code.match(/case when [\w.]+(?:->'[\w]+')*->>'\w+' ~ '\^\[0-9\]\{1,\d{1,2}\}\$' then (?:least\()?\([\w.]+(?:->'[\w]+')*->>'\w+'\)::(int|bigint)/g) || [];
  assert.equal(guarded.length, casts.length, "chaque conversion numerique est protegee par une regex dans un CASE");
});

test("0019 : comptes admin/test exclus partout, tunnel accueil -> match, paiement commence = clic", () => {
  const account = fnBlock("admin_internal_account");
  assert.match(account, /coalesce\(p_role, ''\) = 'admin'/);
  assert.match(account, /e2e\|playwright/);
  // Chaque detection de trafic interne inclut les visites portees par un compte interne.
  const flags = sql.match(/admin_internal_reason\([ex]\.metadata\) is not null or [ex]\.session_id ilike 'qa%'\s+or [ex]\.user_id in \(select u\.id from public\.users u where public\.admin_internal_account\(u\.email, u\.role\)\)/g) || [];
  assert.equal(flags.length, 3, "admin_analytics, admin_live_view, admin_recent_sessions");
  const analytics = fnBlock("admin_analytics");
  for (const k of ["home_page", "match_page", "pricing_page", "checkout_started", "checkout_success", "signup_page", "signed_up"]) {
    assert.ok(analytics.includes(" as " + k), "tunnel : " + k);
  }
  assert.match(analytics, /event_type = 'click' and md->>'kind' = 'checkout'/);
  assert.match(fnBlock("admin_recent_sessions"), /e\.event_type = 'click' and e\.md->>'kind' = 'checkout'/);
  const biz = fnBlock("admin_business");
  assert.ok(!/role is distinct from 'admin'/.test(biz), "plus de filtre admin seul");
  assert.match(biz, /ext_subs/);
  assert.match(fnBlock("admin_recent_signups"), /public\.admin_internal_account\(u\.email, u\.role\) as is_internal/);
  const health = fnBlock("admin_health");
  for (const k of ["last_event_at", "events_24h", "flagged_events_24h", "last_signup_at", "last_billing_event_at"]) assert.ok(health.includes("'" + k + "'"), k);
});

test("admin.html : onglets accessibles, panneaux relies, bouton Exclure cet appareil", () => {
  const tabs = [...html.matchAll(/role="tab" id="tabbtn-(\w+)" data-tab="\1" aria-controls="tab-\1"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["apercu", "direct", "audience", "pages", "conversion", "visites", "inscrits", "sante"]);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1, "un seul onglet actif au chargement");
  for (const t of tabs) {
    assert.match(html, new RegExp('role="tabpanel" id="tab-' + t + '" aria-labelledby="tabbtn-' + t + '"'), "panneau " + t);
  }
  assert.match(js, /var TABS = \["apercu", "direct", "audience", "pages", "conversion", "visites", "inscrits", "sante"\]/);
  assert.match(html, /id="deviceBtn"[^>]*>Exclure cet appareil</);
  assert.match(js, /localStorage\.setItem\(INTERNAL_KEY, "1"\)/);
  assert.match(js, /var INTERNAL_KEY = "iashark_internal";/, "meme cle que funnel-track.js");
  assert.match(read("funnel-track.js"), /localStorage\.getItem\("iashark_internal"\) === "1"/);
  for (const label of ["Visiteurs uniques", "Sessions", "Inscriptions", "Visite → inscription", "Nouveaux abonnés Pro", "Inscription → Pro", "Abonnés Pro actifs", "Encaissé"]) {
    assert.ok(js.includes('label: "' + label + '"'), "KPI " + label);
  }
});

test("admin.html : noindex, script dedie, Chart.js epingle, pas de Google Analytics sur la page admin", () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<script src="\/admin-dashboard\.js" defer><\/script>/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.1\/dist\/chart\.umd\.min\.js/);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/admin\.css">/);
  assert.ok(!html.includes("site-prefs.js"), "pas de GA ni de suivi sur la page admin");
  assert.ok(!/fixture|demo|lorem|Math\.random/i.test(html + js), "aucune donnee de demonstration livree");
  const headers = read("_headers");
  assert.match(headers, /script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(headers, /connect-src[^;]*https:\/\/ksvjraqitxouwiabecai\.supabase\.co/);
  // Chaque id reference par le script existe dans la page.
  const ids = new Set([...js.matchAll(/\$\("([A-Za-z][\w-]*)"\)/g)].map((m) => m[1]));
  for (const id of ids) {
    if (/^jd$/.test(id)) continue;
    assert.ok(html.includes('id="' + id + '"'), "id manquant dans admin.html : " + id);
  }
});
