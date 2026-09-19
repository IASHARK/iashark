"use strict";
// Offre Pro unique vendue en 3 durees : duree enregistree en base par les deux
// chemins independants (stripe-webhook et sync-subscription), tolerance
// d'impaye par duree (1 jour pour l'hebdomadaire, 4 jours sinon), migration
// 0026 (non appliquee) et portail client (changement de duree).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const HOOK = read("supabase/functions/stripe-webhook/index.ts");
const SYNC = read("supabase/functions/sync-subscription/index.ts");

function slice(src, startMarker, fnName) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf("\n}\n", src.indexOf("function " + fnName + "("));
  assert.ok(start > 0 && end > start, fnName + " introuvable");
  return src.slice(start, end + 2);
}
const billingSrc = (src) => slice(src, "const BILLING_INTERVALS", "billingFields");
const graceSrc = (src) => slice(src, "const PAST_DUE_GRACE_DAYS = 4;", "grantsProAccess");
// TypeScript -> JavaScript pour ces petites fonctions pures.
function stripTs(code) {
  return code
    .replace(/: \{ billing_interval: string \| null; billing_interval_count: number \| null; market: string \| null \}/g, "")
    .replace(/\((\w+): Stripe\.Subscription\)/g, "($1)")
    .replace(/ as Record<string, string> \| null/g, "")
    .replace(/(\w+): string \| null/g, "$1")
    .replace(/(\w+): string/g, "$1")
    .replace(/\): (boolean|number) \{/g, ") {");
}

test("stripe-webhook et sync-subscription : memes billingFields et meme tolerance d'impaye, duree ecrite dans subscriptions", () => {
  assert.equal(billingSrc(HOOK), billingSrc(SYNC), "copies divergentes de billingFields");
  assert.equal(graceSrc(HOOK), graceSrc(SYNC), "copies divergentes de la tolerance d'impaye");
  for (const [name, src, v] of [["webhook", HOOK, "sub"], ["sync", SYNC, "subscription"]]) {
    assert.match(src, new RegExp("const billing = billingFields\\(" + v + "\\);"), name);
    assert.match(src, /\.\.\.billing,\n\s*\}, \{ onConflict: "stripe_subscription_id" \}\)/, name + " : colonnes de duree dans l'upsert");
    // Le plan ne depend que du statut et de la tolerance ; aucun autre droit par duree.
    assert.match(src, /grantsProAccess\(status, periodEnd, billing\.billing_interval\) \? "pro" : "free"/, name);
  }
  assert.match(SYNC, /billing_interval: billing\.billing_interval \}\);/, "sync-subscription renvoie la duree");
});

test("billingFields : duree du Price Stripe, marche des metadata, valeurs inconnues -> NULL", () => {
  const billingFields = new Function("console", stripTs(billingSrc(HOOK)) + "\nreturn billingFields;")({ error() {} });
  const sub = (interval, count, market) => ({ id: "sub_1", metadata: market === undefined ? {} : { market }, items: { data: [{ price: { recurring: { interval, interval_count: count } } }] } });
  assert.deepEqual(billingFields(sub("year", 1, "gb")), { billing_interval: "year", billing_interval_count: 1, market: "gb" });
  assert.deepEqual(billingFields(sub("week", 1, "MX")), { billing_interval: "week", billing_interval_count: 1, market: "mx" });
  assert.deepEqual(billingFields(sub("month", 1)), { billing_interval: "month", billing_interval_count: 1, market: "fr" }, "flux historique sans metadata = fr");
  assert.deepEqual(billingFields(sub("day", 1, "xx")), { billing_interval: null, billing_interval_count: 1, market: null });
  // Offre USD de /en/ (config/markets.json#_usdSwitch) : marche us enregistre.
  assert.deepEqual(billingFields(sub("month", 1, "us")), { billing_interval: "month", billing_interval_count: 1, market: "us" });
});

test("marches acceptes par stripe-webhook / sync-subscription = cles de config/markets.json ; migration 0030 (us)", () => {
  const cfg = JSON.parse(read("config/markets.json"));
  const keys = Object.keys(cfg).filter((k) => k[0] !== "_").sort();
  for (const [name, src] of [["webhook", HOOK], ["sync", SYNC]]) {
    const m = src.match(/const BILLING_MARKETS = new Set\((\[[^\]]*\])\);/);
    assert.ok(m, name);
    assert.deepEqual(JSON.parse(m[1]).sort(), keys, name + " : marche de config/markets.json oublie (sa colonne market resterait NULL)");
  }
  const sql = read("supabase/migrations/0030_subscriptions_market_us.sql");
  assert.match(sql, /add column if not exists market text/);
  assert.match(sql, /drop constraint if exists subscriptions_market_check/);
  const list = (sql.match(/market in \(([^)]*)\)/) || [])[1] || "";
  assert.deepEqual(list.split(",").map((x) => x.trim().replace(/'/g, "")).sort(), keys, "contrainte = cles de marche");
  assert.doesNotMatch(sql, /alter table public\.users\b|\bdrop column\b|\bdelete\b|\bupdate\b/i, "additive : aucune donnee ni droit modifie");
  assert.match(sql, /NON APPLIQUEE/);
});

test("tolerance d'impaye : 1 jour pour l'hebdomadaire, 4 jours pour le mensuel, l'annuel et une duree inconnue", () => {
  const api = new Function("ACTIVE_LIKE_STATUSES", stripTs(graceSrc(HOOK)) + "\nreturn { grantsProAccess, pastDueGraceDays };")(new Set(["active", "trialing"]));
  const H = 3600000;
  const endedAgo = (hours) => new Date(Date.now() - hours * H).toISOString();
  assert.equal(api.pastDueGraceDays("week"), 1);
  assert.equal(api.pastDueGraceDays("month"), 4);
  assert.equal(api.pastDueGraceDays("year"), 4);
  assert.equal(api.pastDueGraceDays(null), 4);
  assert.equal(api.grantsProAccess("past_due", endedAgo(12), "week"), true, "hebdo : 12 h apres l'echeance");
  assert.equal(api.grantsProAccess("past_due", endedAgo(30), "week"), false, "hebdo : 30 h apres l'echeance, coupe");
  assert.equal(api.grantsProAccess("past_due", endedAgo(3 * 24), "month"), true);
  assert.equal(api.grantsProAccess("past_due", endedAgo(5 * 24), "month"), false);
  assert.equal(api.grantsProAccess("past_due", endedAgo(3 * 24), "year"), true);
  assert.equal(api.grantsProAccess("past_due", endedAgo(3 * 24), null), true, "abonnement pas encore synchronise : regle historique");
  assert.equal(api.grantsProAccess("active", endedAgo(100 * 24), "week"), true);
  assert.equal(api.grantsProAccess("canceled", endedAgo(1), "month"), false);
  assert.equal(api.grantsProAccess("past_due", null, "week"), false);
});

test("migration 0026 : colonnes additives, contraintes, index, balayage d'impaye 1 jour hebdo, users.plan inchange", () => {
  const files = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  assert.ok(files.includes("0026_subscription_interval.sql"));
  assert.ok(!files.some((f) => /^0023_/.test(f)), "numero 0023 non utilise");
  assert.equal(files.filter((f) => /^0026_/.test(f)).length, 1);
  const sql = read("supabase/migrations/0026_subscription_interval.sql");
  assert.match(sql, /add column if not exists billing_interval text/);
  assert.match(sql, /add column if not exists billing_interval_count integer/);
  assert.match(sql, /add column if not exists market text/);
  assert.match(sql, /billing_interval in \('week', 'month', 'year'\)/);
  assert.match(sql, /market in \('fr', 'gb', 'mx', 'za'\)/);
  assert.match(sql, /create index if not exists subscriptions_renewal_scan_idx/);
  assert.match(sql, /create or replace function public\.expire_past_due_access\(\)/);
  assert.match(sql, /case when s\.billing_interval = 'week' then interval '1 day' else interval '4 days' end/);
  assert.match(sql, /revoke all on function public\.expire_past_due_access\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /alter table public\.users\b|\bdrop column\b|'edge'/i, "ni users.plan, ni suppression, ni valeur Edge");
  assert.match(read("supabase/migrations/0001_users_table.sql"), /check \(plan in \('free','pro'\)\)/);
  // 0011 (4 jours) reste l'historique ; 0026 remplace la fonction sans modifier 0011.
  assert.match(read("supabase/migrations/0011_past_due_grace_period.sql"), /interval '4 days'/);
});

test("portail client : retour dans le repertoire, changement de duree sur l'abonnement vivant, configuration optionnelle", () => {
  const src = read("supabase/functions/create-portal-session/index.ts");
  assert.match(src, /ALLOWED_DIRS\.includes\(dirKey\)/);
  assert.match(src, /"\/compte\.html#abonnement"/);
  assert.match(src, /body\.flow === "change_interval"/);
  assert.match(src, /type: "subscription_update"/);
  assert.match(src, /\.in\("status", \["active", "trialing"\]\)/);
  assert.match(src, /if \(STRIPE_PORTAL_CONFIGURATION_ID\) params\.configuration = STRIPE_PORTAL_CONFIGURATION_ID;/);
  assert.doesNotMatch(src, /return_url: SITE_URL \+ "\/compte\.html" \}/, "retour FR force supprime");
});
