"use strict";
// Tableau de bord analytics admin : garde-fous statiques sur la migration
// 0011 (fonctions admin-only, lecture seule) et sur admin.html (jamais
// indexe, jamais genere par repertoire, aucune donnee de demonstration).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sql = read("supabase/migrations/0015_admin_analytics.sql");
const admin = read("admin.html");

function fnBlock(name) {
  const start = sql.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, name + " definie");
  const end = sql.indexOf("$$;", sql.indexOf("as $$", start));
  return sql.slice(start, end);
}

test("0011 : event_type accepte page_leave et click sans retirer les types existants", () => {
  const m = sql.match(/add constraint funnel_events_event_type_check check \(event_type in \(([\s\S]*?)\)\);/);
  assert.ok(m);
  for (const t of ["landing_view", "signup_started", "signup_completed", "login_completed", "onboarding_dismissed",
    "tool_page_view", "paywall_view", "checkout_started", "checkout_unavailable", "checkout_success_view",
    "checkout_cancel_view", "page_view", "page_leave", "click"]) {
    assert.ok(m[1].includes("'" + t + "'"), t);
  }
});

test("0011 : fonctions admin SECURITY DEFINER, refus explicite, jamais executables par anon", () => {
  for (const [name, sig] of [["admin_analytics", "integer"], ["admin_live_view", ""], ["admin_recent_sessions", "integer"], ["admin_recent_signups", "integer"]]) {
    const block = fnBlock(name);
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = public/);
    assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied'/);
    assert.ok(!/\b(insert|update|delete|truncate|alter|drop)\b/i.test(block.replace(/--.*$/gm, "")), name + " en lecture seule");
    assert.ok(sql.includes("revoke all on function public." + name + "(" + sig + ") from public, anon;"), name + " revoque");
    assert.ok(sql.includes("grant execute on function public." + name + "(" + sig + ") to authenticated;"), name + " accorde");
  }
});

test("0011 : purge limitee a 13 mois et reservee a service_role, sans planification", () => {
  const block = fnBlock("purge_old_funnel_events");
  assert.match(block, /interval '13 months'/);
  assert.ok(sql.includes("revoke all on function public.purge_old_funnel_events() from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.purge_old_funnel_events() to service_role;"));
  assert.ok(!/cron\./i.test(sql), "aucune planification");
});

test("0011 : les nombres lus dans metadata (ecrit par anon) sont valides avant conversion", () => {
  const casts = sql.match(/->>'(sec|scroll)'\)::int/g) || [];
  assert.ok(casts.length > 0);
  const guarded = sql.match(/~ '\^\[0-9\]\{1,\d\}\$' then least\(\([\w.]*->>'(sec|scroll)'\)::int/g) || [];
  assert.equal(guarded.length, casts.length, "chaque conversion est protegee par une regex");
});

test("admin.html : noindex, exclu des robots, des sitemaps et des repertoires generes", () => {
  assert.match(admin, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(read("robots.txt"), /^Disallow: \/admin\.html$/m);
  const manifest = read("scripts/i18n-manifest.js");
  assert.ok(!manifest.includes("admin.html"), "absent du manifeste i18n");
  for (const f of fs.readdirSync(root).filter((n) => /^sitemap.*\.xml$/.test(n))) {
    assert.ok(!read(f).includes("admin.html"), f);
  }
  for (const dir of ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"]) {
    assert.ok(!fs.existsSync(path.join(root, dir, "admin.html")), "/" + dir + "/admin.html absent");
  }
});

test("admin.html : garde admin conservee, RPC attendues, migration absente geree, aucune donnee factice", () => {
  const page = admin + "\n" + read("admin-dashboard.js");
  assert.match(page, /\.eq\('id', res\.data\.session\.user\.id\)/);
  assert.match(page, /role !== 'admin'/);
  for (const rpc of ["admin_stats", "admin_analytics", "admin_live_view", "admin_recent_sessions", "admin_recent_signups", "admin_business", "admin_exclude_session"]) {
    assert.ok(page.includes("'" + rpc + "'") || page.includes('"' + rpc + '"'), rpc);
  }
  assert.match(page, /PGRST202/);
  assert.match(page, /0019_admin_dashboard_v2\.sql/);
  assert.ok(!/fixture|demo|lorem|Math\.random/i.test(page), "aucune donnee de demonstration dans la page");
  // Toute donnee issue de funnel_events (ecrite par anon) passe par esc().
  assert.match(page, /function esc\(/);
});
