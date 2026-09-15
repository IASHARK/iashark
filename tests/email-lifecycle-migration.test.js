"use strict";
// Analyse statique de supabase/migrations/0024_email_preferences.sql (non
// appliquee) : RLS, aucun acces anon, fonctions reservees au role service,
// regles de selection alignees sur lib/lifecycle-email.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const L = require("../lib/lifecycle-email.js");
const ROOT = path.join(__dirname, "..");
const RAW = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0024_email_preferences.sql"), "utf8");
// Commentaires retires (le plan pg_cron commente ne doit jamais s'executer).
const SQL = RAW.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const fnBody = (name) => {
  const start = SQL.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, "fonction " + name);
  return SQL.slice(start, SQL.indexOf("$$;", start) + 3);
};

test("tables email_preferences et email_sends : RLS active, consentement faux par defaut, unicite des envois", () => {
  assert.match(SQL, /create table if not exists public\.email_preferences \(/);
  assert.match(SQL, /create table if not exists public\.email_sends \(/);
  assert.match(SQL, /alter table public\.email_preferences enable row level security;/);
  assert.match(SQL, /alter table public\.email_sends enable row level security;/);
  assert.match(SQL, /marketing_opt_in boolean not null default false/);
  assert.match(SQL, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(SQL, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(SQL, /unique \(user_id, campaign, campaign_key\)/);
  for (const col of ["opt_in_at", "opt_in_source", "unsubscribed_at", "locale", "market", "sent_at", "message_id", "status"]) assert.ok(SQL.includes(col + " "), col);
  const campaigns = SQL.match(/campaign text not null check \(campaign in \(([^)]+)\)\)/)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual(campaigns.sort(), Object.keys(L.CAMPAIGNS).sort());
});

test("aucun acces anon ; l'utilisateur lit et modifie SA preference ; seul le role service ecrit les envois", () => {
  assert.doesNotMatch(SQL, /\bto anon\b/i, "aucun grant ni policy vers anon");
  assert.match(SQL, /revoke all on public\.email_preferences from anon, authenticated;/);
  assert.match(SQL, /revoke all on public\.email_sends from anon, authenticated;/);
  for (const op of ["select", "insert", "update"]) {
    assert.match(SQL, new RegExp("create policy email_preferences_" + op + "_own on public\\.email_preferences\\s+for " + op + " to authenticated"), op);
  }
  assert.match(SQL, /using \(\(select auth\.uid\(\)\) = user_id\)\s+with check \(\(select auth\.uid\(\)\) = user_id\);/);
  assert.doesNotMatch(SQL, /create policy [a-z_]+ on public\.email_sends/, "aucune policy : ni lecture ni ecriture client");
  assert.doesNotMatch(SQL, /grant [^;]* on public\.email_sends/i);
  assert.doesNotMatch(SQL, /for delete to authenticated/);
  // Colonnes modifiables par le client : jamais les horodatages de preuve.
  const grants = SQL.match(/grant (insert|update) \(([^)]+)\) on public\.email_preferences to authenticated;/g) || [];
  assert.equal(grants.length, 2);
  for (const g of grants) assert.doesNotMatch(g, /opt_in_at|unsubscribed_at|unsubscribe_source|created_at|updated_at/);
  const stamp = fnBody("email_preferences_stamp");
  assert.match(stamp, /new\.opt_in_at := now\(\)/);
  assert.match(stamp, /new\.unsubscribed_at := now\(\)/);
});

test("fonctions SECURITY DEFINER : search_path fixe, EXECUTE retire au public, reservees au role service", () => {
  for (const name of ["lifecycle_email_candidates", "email_reserve_send", "email_complete_send", "email_unsubscribe", "email_record_event", "handle_new_user_email_preferences", "admin_email_stats"]) {
    const body = fnBody(name);
    assert.match(body, /security definer/, name);
    assert.match(body, /set search_path = public/, name);
  }
  for (const name of ["lifecycle_email_candidates", "email_reserve_send", "email_complete_send", "email_unsubscribe", "email_record_event"]) {
    assert.match(SQL, new RegExp("revoke all on function public\\." + name + "\\([^)]*\\) from public, anon, authenticated;"), name);
    assert.match(SQL, new RegExp("grant execute on function public\\." + name + "\\([^)]*\\) to service_role;"), name);
    assert.doesNotMatch(SQL, new RegExp("grant execute on function public\\." + name + "\\([^)]*\\) to (anon|authenticated|public)"), name);
  }
  assert.match(SQL, /revoke execute on function public\.handle_new_user_email_preferences\(\) from public, anon, authenticated;/);
});

test("tableau de bord admin : lecture seule, verification admin, agregats sans email", () => {
  const body = fnBody("admin_email_stats");
  assert.match(body, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied'/);
  assert.doesNotMatch(body, /\bemail\b(?!_)/, "aucune adresse email exposee");
  assert.doesNotMatch(body, /\b(insert|update|delete)\b/i);
  assert.match(SQL, /revoke all on function public\.admin_email_stats\(integer\) from public, anon;/);
  for (const k of ["'opted_in'", "'unsubscribes_period'", "'campaigns'", "as opened", "as clicked", "as bounced", "as complained", "'sends_by_day'"]) assert.ok(body.includes(k), k);
});

test("comptes existants sans ligne = aucun consentement ; declencheur d'inscription lit les metadonnees de la case", () => {
  const cand = fnBody("lifecycle_email_candidates");
  assert.match(cand, /\(coalesce\(ep\.marketing_opt_in, false\) and ep\.unsubscribed_at is null\) as marketing_opt_in/);
  assert.match(cand, /left join public\.email_preferences ep/);
  const trig = fnBody("handle_new_user_email_preferences");
  assert.match(trig, /coalesce\(meta->>'iashark_marketing_opt_in', ''\) = 'true'/);
  const auth = fs.readFileSync(path.join(ROOT, "auth-pages.js"), "utf8");
  for (const k of ["iashark_marketing_opt_in", "iashark_locale", "iashark_market", "iashark_marketing_text_version"]) {
    assert.ok(trig.includes("'" + k + "'") && auth.includes(k), k);
  }
  assert.match(SQL, /create trigger on_auth_user_created_email_preferences\s+after insert on auth\.users/);
});

test("regles de selection SQL alignees sur decideCampaign (lib/lifecycle-email.js)", () => {
  const c = fnBody("lifecycle_email_candidates").replace(/\s+/g, " ");
  const R = L.RULES;
  assert.ok(c.includes("when f.suppressed then null"));
  assert.ok(c.includes("p_now - f.created_at <= interval '" + R.welcomeWindowDays + " days' and not ('welcome:' = any (f.sent_keys)) then 'welcome'"));
  assert.ok(c.indexOf("'welcome'") < c.indexOf("when not f.marketing_opt_in then null"), "bienvenue avant le filtre de consentement");
  assert.ok(c.indexOf("when not f.marketing_opt_in then null") < c.indexOf("'free_match'"), "consentement avant toute campagne marketing");
  assert.ok(c.includes("when f.local_hour < " + R.quietEndHour + " or f.local_hour >= " + R.quietStartHour + " then null"));
  assert.ok(c.includes("p_now - f.last_marketing_sent_at < interval '" + R.minDaysBetweenMarketing + " days' then null"));
  assert.ok(c.includes("p_now - f.last_engagement_at > interval '" + R.stopAfterInactiveDays + " days' then null"));
  assert.ok(c.includes("x.campaign <> 'welcome' and x.status in ('pending', 'sent')"), "la bienvenue ne compte pas dans la frequence");
  assert.ok(c.includes("(f.plan = 'pro' or f.has_subscription or f.role = 'admin') as no_sales"));
  assert.ok(c.indexOf("when f.no_sales then") < c.indexOf("'free_match'"), "Pro : jamais de sequence de vente");
  assert.ok(c.includes("interval '" + R.freeMatchFromDays + " days' and p_now - f.created_at < interval '" + R.freeMatchUntilDays + " days'"));
  assert.ok(c.includes("interval '" + R.proFeaturesFromDays + " days' and p_now - f.created_at < interval '" + R.proFeaturesUntilDays + " days'"));
  assert.ok(c.includes("interval '" + R.inactive30Days + " days' and p_now - f.last_activity_at < interval '" + R.stopAfterInactiveDays + " days'"));
  assert.ok(c.includes("interval '" + R.inactive7Days + " days' and p_now - f.last_activity_at < interval '" + R.inactive30Days + " days'"));
  assert.equal((c.match(new RegExp("isodow|local_dow in \\(" + R.weekendDows.join(", ") + "\\)", "g")) || []).length >= 2, true);
  assert.ok(c.includes("to_char(f.local_ts, 'IYYY-\"W\"IW') as iso_week"));
  assert.ok(c.includes("to_char(f.last_activity_at at time zone 'UTC', 'YYYY-MM-DD') as episode"));
  assert.ok(c.includes("greatest(b.created_at, coalesce(b.last_sign_in_at, b.created_at), coalesce(b.last_funnel_at, b.created_at))"));
  for (const [market, tz] of Object.entries(L.MARKET_TIMEZONES)) {
    if (market === "fr") assert.ok(c.includes("else '" + tz + "' end"), tz);
    else assert.ok(c.includes("when '" + market + "' then '" + tz + "'"), tz);
  }
  assert.ok(c.includes("status in ('bounced', 'complained')"));
});

test("envoi unique : reservation atomique, 3 tentatives maximum ; plainte = retrait du consentement", () => {
  const r = fnBody("email_reserve_send").replace(/\s+/g, " ");
  assert.ok(r.includes("on conflict (user_id, campaign, campaign_key) do update"));
  assert.ok(r.includes("where public.email_sends.status = 'failed' and public.email_sends.attempts < 3"));
  const e = fnBody("email_record_event").replace(/\s+/g, " ");
  assert.ok(e.includes("set marketing_opt_in = false, unsubscribe_source = 'complaint'"));
});

test("pg_cron : plan horaire propose en commentaire uniquement, jamais applique", () => {
  assert.doesNotMatch(SQL, /cron\.schedule|net\.http_post|create extension/i, "aucune planification active");
  assert.match(RAW, /^-- select cron\.schedule\($/m);
  assert.match(RAW, /^--   '11 \* \* \* \*',$/m);
  assert.match(RAW, /functions\/v1\/send-lifecycle-emails/);
  assert.match(RAW, /MIGRATION NON APPLIQUEE/);
  assert.doesNotMatch(RAW, /re_[A-Za-z0-9]{10,}|sk_live|service_role_key\s*=/i, "aucun secret");
});
