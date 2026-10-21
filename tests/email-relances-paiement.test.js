"use strict";
// Relances qui font payer (21/10/2026) : paiement abandonne (checkout_abandoned),
// fin d'essai (trial_ending), miroir SQL (0055), match offert identique au site et
// au serveur, regles d'ecriture (signe Clement, tutoiement, un seul bouton, aucune
// emoticone, ni mise ni capital ni esperance, pas de « jouer comporte des risques »),
// module des fonctions Edge, workflow manuel (apercu et test seulement).
// Aucun appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NODE_MODULE = require("node:module");
const { pathToFileURL } = require("node:url");

const L = require("../lib/lifecycle-email.js");
const FREE = require("../lib/free-match.js");
const MT = require("../lib/match-time.js");
const build = require("../lib/lifecycle-email-build.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BUNDLE = build.loadBundle();
const CONFIG = JSON.parse(read("config/markets.json"));
const NOW = new Date("2026-09-17T10:00:00Z"); // jeudi, 12:00 a Paris
const DAY = 86400000;
const HOUR = 3600000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const unsub = (dir) => L.SITE_URL + "/" + dir + "/desinscription-email.html#t=APERCU";

// ------------------------------------------------- paiement abandonne (regles)

function facts(over) {
  return Object.assign({
    market: "fr", plan: "free", role: "customer", marketingOptIn: true, notifyWeeklyRecap: true,
    hasSubscription: false, suppressed: false,
    createdAt: ago(20), lastSignInAt: ago(1.5), lastFunnelAt: ago(1.5), lastCheckoutAt: ago(1.5),
    lastEngagementAt: null, lastMarketingSentAt: null, sentKeys: ["welcome:", "free_match:", "pro_features:"]
  }, over || {});
}
const decide = (over, now) => L.decideCampaign(facts(over), now || NOW);

test("paiement abandonne : de 1 a 3 jours apres le dernier paiement commence, une seule fois", () => {
  assert.deepEqual(decide(), { campaign: "checkout_abandoned", key: "", reason: null });
  assert.equal(decide({ lastCheckoutAt: ago(1.0) }).campaign, "checkout_abandoned", "1 jour pile");
  assert.equal(decide({ lastCheckoutAt: ago(2.99) }).campaign, "checkout_abandoned");
  assert.equal(decide({ lastCheckoutAt: ago(0.9), lastFunnelAt: ago(0.9) }).reason, "nothing_due", "trop tot : il est peut-etre en train de payer");
  assert.equal(decide({ lastCheckoutAt: ago(3), lastFunnelAt: ago(3) }).reason, "nothing_due", "3 jours : trop tard");
  assert.equal(decide({ sentKeys: ["welcome:", "free_match:", "pro_features:", "checkout_abandoned:"] }).reason, "nothing_due", "une seule fois, meme apres un nouveau paiement commence");
  assert.equal(decide({ lastCheckoutAt: null }).reason, "nothing_due");
  assert.equal(L.factsFromRow({ last_checkout_at: ago(2) }).lastCheckoutAt, ago(2));
  assert.equal(L.factsFromRow({}).lastCheckoutAt, null);
});

test("paiement abandonne : consentement obligatoire, jamais la nuit, jamais a un abonne, un Pro ou un admin", () => {
  assert.equal(decide({ marketingOptIn: false }).reason, "not_opted_in");
  assert.equal(decide({}, new Date("2026-09-17T20:30:00Z")).reason, "quiet_hours", "22:30 a Paris");
  assert.equal(decide({ market: "mx" }, new Date("2026-09-17T08:00:00Z")).reason, "quiet_hours", "02:00 a Mexico");
  for (const over of [{ hasSubscription: true }, { plan: "pro" }, { role: "admin" }]) {
    assert.notEqual(decide(over).campaign, "checkout_abandoned", JSON.stringify(over));
  }
  assert.equal(decide({ suppressed: true }).reason, "suppressed");
});

test("paiement abandonne : prioritaire sur les autres relances, au moins 1 jour apres le dernier email marketing", () => {
  // Compte de 2,5 jours : le match offert J2 serait du, le paiement abandonne passe avant.
  assert.equal(decide({ createdAt: ago(2.5), lastSignInAt: ago(1.2), lastFunnelAt: ago(1.2), lastCheckoutAt: ago(1.2), sentKeys: ["welcome:"] }).campaign, "checkout_abandoned");
  // La frequence normale (3 jours) le ferait rater : 1 jour suffit.
  assert.equal(decide({ lastMarketingSentAt: ago(1.5) }).campaign, "checkout_abandoned");
  assert.equal(decide({ lastMarketingSentAt: ago(0.5) }).reason, "frequency_cap", "jamais deux emails marketing le meme jour");
  // La bienvenue (email du compte) reste la premiere.
  assert.equal(decide({ createdAt: ago(2), sentKeys: [] }).campaign, "welcome");
  assert.deepEqual([L.RULES.checkoutFromDays, L.RULES.checkoutUntilDays, L.RULES.checkoutMinDaysSinceMarketing], [1, 3, 1]);
  assert.deepEqual(L.CAMPAIGNS.checkout_abandoned, { marketing: true, needs: null, sender: "send-lifecycle-emails", footer: "marketing" });
});

// ------------------------------------------------- miroir SQL (0055, non appliquee)

const RAW55 = read("supabase/migrations/0055_emails_relances_paiement.sql");
const SQL55 = RAW55.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const body55 = () => {
  const start = SQL55.indexOf("create function public.lifecycle_email_candidates(");
  assert.ok(start !== -1);
  return SQL55.slice(start, SQL55.indexOf("$$;", start) + 3).replace(/\s+/g, " ");
};

test("0055 : liste fermee des envois = campagnes de send-lifecycle-emails + relance (la fin d'essai passe par trial-reminder)", () => {
  const list = SQL55.match(/check \(campaign = any \(array\[([^\]]+)\]\)\)/)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
  const own = Object.keys(L.CAMPAIGNS).filter((c) => L.CAMPAIGNS[c].sender === "send-lifecycle-emails");
  assert.deepEqual(list.slice().sort(), own.concat(["relance"]).sort());
  assert.ok(!list.includes("trial_ending"));
  assert.match(SQL55, /alter table public\.email_sends drop constraint if exists email_sends_campaign_check;/);
});

test("0055 : regle checkout_abandoned identique a decideCampaign (fenetre, consentement, frequence, ordre)", () => {
  const c = body55();
  const R = L.RULES;
  const rule = "when not f.no_sales and f.last_checkout_at is not null"
    + " and p_now - f.last_checkout_at >= interval '" + R.checkoutFromDays + " days' and p_now - f.last_checkout_at < interval '" + R.checkoutUntilDays + " days'"
    + " and (f.last_marketing_sent_at is null or p_now - f.last_marketing_sent_at >= interval '" + R.checkoutMinDaysSinceMarketing + " days')"
    + " and not ('checkout_abandoned:' = any (f.sent_keys)) then 'checkout_abandoned'";
  assert.ok(c.includes(rule), "regle SQL");
  const at = c.indexOf(rule);
  assert.ok(c.indexOf("when not f.marketing_opt_in then null") < at, "consentement avant");
  assert.ok(c.indexOf("when f.local_hour < " + R.quietEndHour + " or f.local_hour >= " + R.quietStartHour + " then null") < at, "nuit avant");
  assert.ok(at < c.indexOf("p_now - f.last_marketing_sent_at < interval '" + R.minDaysBetweenMarketing + " days' then null"), "avant la frequence de 3 jours");
  assert.ok(at < c.indexOf("'free_match'"), "avant le match offert");
  // « Paiement commence » : evenement checkout_started, clic sur un bouton de paiement actif, page checkout-annule.
  assert.ok(c.includes("f.event_type = 'checkout_started'"));
  assert.ok(c.includes("(f.event_type = 'click' and f.metadata->>'kind' = 'checkout' and coalesce(f.metadata->>'ready', 'true') <> 'false')"));
  assert.ok(c.includes("(f.event_type in ('page_view', 'checkout_cancel_view') and f.page ~ '/checkout-annule(\\.html)?$')"));
  const re = /\/checkout-annule(\.html)?$/;
  for (const page of ["/fr/checkout-annule.html", "/gb/checkout-annule", "/checkout-annule.html", "/mx/checkout-annule"]) assert.match(page, re, page);
  for (const page of ["/fr/checkout-succes.html", "/fr/abonnement.html"]) assert.doesNotMatch(page, re, page);
  assert.ok(c.includes("d.last_funnel_at, d.last_checkout_at, d.last_activity_at"), "colonne renvoyee a la fonction Edge");
  assert.ok(c.includes("security definer") && c.includes("set search_path = public"));
  assert.match(SQL55, /drop function if exists public\.lifecycle_email_candidates\(timestamptz, integer\);/);
  assert.match(SQL55, /revoke all on function public\.lifecycle_email_candidates\(timestamptz, integer\) from public, anon, authenticated;/);
  assert.match(SQL55, /grant execute on function public\.lifecycle_email_candidates\(timestamptz, integer\) to service_role;/);
  // Le reste des regles ne bouge pas (meme texte que 0024).
  const c24 = read("supabase/migrations/0024_email_preferences.sql").replace(/\s+/g, " ");
  for (const k of ["'free_match'", "'pro_features'", "'inactive_30d'", "'inactive_7d'", "'pro_weekly_summary'"]) {
    const line = (s) => s.slice(s.lastIndexOf(" when ", s.indexOf("then " + k)), s.indexOf("then " + k));
    assert.equal(line(c), line(c24), k);
  }
});

test("0055 : ecrite, pas appliquee ; planification en commentaire seulement, toujours dans la region us-east-2", () => {
  assert.match(RAW55, /STATUT : ECRITE, PAS APPLIQUEE/);
  assert.doesNotMatch(SQL55, /cron\.schedule|net\.http_post|create extension/i, "aucune planification active");
  assert.equal((RAW55.match(/^--\s+'x-region', 'us-east-2',$/gm) || []).length, 2, "x-region dans les deux taches");
  assert.match(RAW55, /functions\/v1\/send-lifecycle-emails/);
  assert.match(RAW55, /functions\/v1\/trial-reminder/);
  assert.match(RAW55, /LIFECYCLE_SENDING_ENABLED/);
  assert.doesNotMatch(RAW55, /xkeysib-|sk_live|re_[A-Za-z0-9]{10,}/, "aucun secret");
});

// ------------------------------------------------- fin d'essai (regles)

const sub = (over) => Object.assign({ status: "trialing", cancel_at_period_end: false, trial_reminder_sent_at: null, current_period_end: new Date(NOW.getTime() + 48 * HOUR).toISOString() }, over || {});

test("fin d'essai : rappel du quand la fin tombe dans 36 a 60 heures, essai en cours, sans annulation ni rappel deja envoye", () => {
  assert.deepEqual(L.decideTrialEnding(sub(), NOW), { due: true, reason: null });
  const end = (h) => new Date(NOW.getTime() + h * HOUR).toISOString();
  assert.equal(L.decideTrialEnding(sub({ current_period_end: end(36) }), NOW).due, true);
  assert.equal(L.decideTrialEnding(sub({ current_period_end: end(59.9) }), NOW).due, true);
  assert.equal(L.decideTrialEnding(sub({ current_period_end: end(60) }), NOW).reason, "too_early");
  assert.equal(L.decideTrialEnding(sub({ current_period_end: end(35) }), NOW).reason, "too_late");
  assert.equal(L.decideTrialEnding(sub({ current_period_end: end(-1) }), NOW).reason, "trial_over");
  assert.equal(L.decideTrialEnding(sub({ status: "active" }), NOW).reason, "not_trialing");
  assert.equal(L.decideTrialEnding(sub({ cancel_at_period_end: true }), NOW).reason, "cancel_scheduled");
  assert.equal(L.decideTrialEnding(sub({ trial_reminder_sent_at: ago(0.1) }), NOW).reason, "already_sent");
  assert.equal(L.decideTrialEnding(sub({ current_period_end: "pas une date" }), NOW).reason, "invalid_end");
  assert.equal(L.decideTrialEnding(null, NOW).reason, "invalid_row");
  assert.deepEqual(L.trialWindow(NOW), { fromIso: end(36), toIso: end(60) });
  assert.deepEqual(L.CAMPAIGNS.trial_ending, { marketing: false, needs: "trial", sender: "trial-reminder", footer: "billing" });
});

test("fin d'essai : prix catalogue de secours (config/markets.json), jamais invente", () => {
  assert.deepEqual(L.catalogAmount(CONFIG, "fr", "month"), { amountMinor: 1995, currency: "EUR" });
  assert.deepEqual(L.catalogAmount(CONFIG, "gb", "month"), { amountMinor: 1499, currency: "GBP" });
  assert.deepEqual(L.catalogAmount(CONFIG, "mx", "month"), { amountMinor: 19900, currency: "MXN" });
  assert.equal(L.catalogAmount(CONFIG, "za", "year"), null, "ZA : pas d'annuel");
  assert.equal(L.catalogAmount(CONFIG, "nl", "month"), null);
  assert.equal(L.catalogAmount(CONFIG, "_dirs", "month"), null);
  assert.equal(L.catalogAmount(CONFIG, "fr", "jour"), null);
  const fr = L.siteContext(BUNDLE.markets, "fr");
  assert.deepEqual(L.sampleTrial(fr, NOW), { endsAt: new Date(NOW.getTime() + 48 * HOUR).toISOString(), amountMinor: 1995, currency: "EUR", interval: "month" });
});

test("fin d'essai : date et heure de fin avec le fuseau, montant, duree, annulation, raison « abonnement » (9 versions)", () => {
  const trial = { endsAt: "2026-09-19T10:00:00Z", amountMinor: 1795, currency: "EUR", interval: "month" };
  for (const dir of L.DIRS) {
    const r = L.renderLifecycleEmail(BUNDLE, "trial_ending", dir, { trial }, { unsubscribeUrl: unsub(dir), now: NOW });
    const c = BUNDLE.copy[r.locale];
    assert.equal(r.marketing, false, dir);
    assert.ok(r.text.includes(c.common.footer_reason_billing), dir + " : raison abonnement");
    assert.ok(!r.text.includes(c.common.footer_reason_marketing), dir);
    assert.match(r.subject, /2/, dir);
    assert.ok(r.text.includes(c.common.per_month), dir + " : par mois");
    assert.ok(r.html.includes('href="https://iashark.com/' + dir + '/pro.html"'), dir + " : bouton vers Pro");
    assert.ok(r.html.includes('href="https://iashark.com/' + dir + '/compte.html#abonnement"'), dir + " : gerer / annuler");
    assert.match(r.text, /19/, dir + " : jour de fin");
    assert.match(r.text, /(UTC|GMT|BST|CEST|MESZ|SAST)/, dir + " : fuseau affiche");
  }
  const fr = L.renderLifecycleEmail(BUNDLE, "trial_ending", "fr", { trial }, { unsubscribeUrl: unsub("fr"), now: NOW });
  assert.equal(fr.subject, "Ton essai IASHARK Pro se termine dans 2 jours");
  assert.ok(fr.text.includes("se termine le samedi 19 septembre à 12:00 UTC+2."));
  assert.ok(fr.text.replace(/[  ]/g, " ").includes("17,95 € par mois, prélevés sur ta carte enregistrée"), "montant de la prochaine facture (promo comprise)");
  assert.ok(fr.text.includes("annule avant cette date dans Mon compte, rubrique Abonnement : rien ne sera prélevé"));
  const gb = L.renderLifecycleEmail(BUNDLE, "trial_ending", "gb", { trial: Object.assign({}, trial, { amountMinor: 1499, currency: "GBP" }) }, { unsubscribeUrl: unsub("gb"), now: NOW });
  assert.ok(gb.text.includes("ends on Saturday 19 September at 11:00 BST") && gb.text.includes("£14.99 per month"));
  const mx = L.renderLifecycleEmail(BUNDLE, "trial_ending", "mx", { trial: Object.assign({}, trial, { amountMinor: 19900, currency: "MXN" }) }, { unsubscribeUrl: unsub("mx"), now: NOW });
  assert.ok(mx.text.includes("$199.00 MXN al mes"), mx.text);
  const code = (c) => (e) => e && e.code === c;
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "trial_ending", "fr", {}, { unsubscribeUrl: unsub("fr") }), code("missing_trial"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "trial_ending", "fr", { trial: Object.assign({}, trial, { interval: "jour" }) }, { unsubscribeUrl: unsub("fr") }), code("missing_trial"));
  assert.equal(L.campaignData("trial_ending", null, NOW, L.siteContext(BUNDLE.markets, "fr"), {}).reason, "no_trial");
});

test("paiement abandonne : texte, un seul bouton vers l'abonnement, reponse a Clement", () => {
  const r = L.renderLifecycleEmail(BUNDLE, "checkout_abandoned", "fr", { marketingOptIn: true }, { unsubscribeUrl: unsub("fr"), now: NOW });
  assert.equal(r.subject, "Ton abonnement Pro n'est pas allé au bout");
  assert.ok(r.text.includes("Rien n'a été prélevé."));
  assert.ok(r.text.includes("Reprendre mon abonnement : https://iashark.com/fr/abonnement.html"));
  assert.ok(r.text.includes("Un souci de carte ou une question sur l'offre ? Réponds simplement à cet e-mail"), "reponse personnelle a la place de la phrase generique");
  assert.ok(!r.text.includes("c'est moi qui lis.\n"), "pas deux fois la meme invitation a repondre");
  for (const dir of L.DIRS) {
    const x = L.renderLifecycleEmail(BUNDLE, "checkout_abandoned", dir, { marketingOptIn: true }, { unsubscribeUrl: unsub(dir), now: NOW });
    assert.ok(x.html.includes('href="https://iashark.com/' + dir + '/abonnement.html"'), dir);
    assert.ok(x.text.includes(BUNDLE.copy[x.locale].common.footer_reason_marketing), dir + " : email marketing (consentement)");
  }
});

// ------------------------------------------------- regles d'ecriture (8 campagnes x 9 versions)

const stripStyle = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, "");
const visible = (html) => stripStyle(html).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
const FORBIDDEN_FOR_CLEMENT = {
  fr: /\bmises?\b|\bcapital\b|espérance|bankroll|comportent? des risques|jouer comporte/i,
  en: /\bstakes?\b|\bcapital\b|expected value|bankroll|involves? risks?/i,
  es: /bankroll|valor esperado|\bcapital\b|(implica|conlleva)n? riesgos/i,
  "es-mx": /bankroll|valor esperado|\bcapital\b|(implica|conlleva)n? riesgos/i,
  de: /\bEinsatz|Bankroll|Erwartungswert|\bKapital\b|mit Risiken verbunden/i,
  it: /bankroll|puntat[ae]|valore atteso|\bcapitale\b|comporta rischi/i,
  pt: /bankroll|valor esperado|\bcapital\b|envolve riscos/i
};

function renderEverything() {
  const MATCHES = [
    { id: 1570385, sport: "football", home: { n: "Barcelona" }, away: { n: "Racing Santander" }, date: "2026-09-17 21:30", league: "La Liga", is_free: true },
    { id: 2001, sport: "football", home: { n: "Paris SG" }, away: { n: "Marseille" }, date: "2026-09-19 21:00", league: "Ligue 1" }
  ];
  const out = [];
  for (const dir of L.DIRS) {
    const ctx = L.siteContext(BUNDLE.markets, dir);
    for (const campaign of Object.keys(L.CAMPAIGNS)) {
      for (const optIn of campaign === "welcome" ? [true, false] : [true]) {
        const d = L.campaignData(campaign, MATCHES, NOW, ctx, { marketingOptIn: optIn, trial: L.sampleTrial(ctx, NOW) });
        assert.ok(d.data, dir + "/" + campaign + " : " + d.reason);
        out.push({ dir, campaign, r: L.renderLifecycleEmail(BUNDLE, campaign, dir, d.data, { unsubscribeUrl: unsub(dir), now: NOW }) });
      }
    }
  }
  return out;
}

test("ecriture : signe Clement, un seul bouton, aucune emoticone, ni mise ni capital ni esperance, pas de « jouer comporte des risques »", () => {
  const all = renderEverything();
  assert.equal(all.length, 9 * 9);
  for (const { dir, campaign, r } of all) {
    const where = dir + "/" + campaign;
    const words = r.subject + "\n" + visible(r.html) + "\n" + r.text;
    assert.doesNotMatch(words, /\p{Extended_Pictographic}/u, where + " : emoticone");
    assert.doesNotMatch(words, FORBIDDEN_FOR_CLEMENT[r.locale], where);
    assert.deepEqual(L.findForbiddenWords(words, r.locale), [], where);
    assert.ok(r.text.includes("Clément, IASHARK") && r.html.includes("<strong>Clément, IASHARK</strong>"), where + " : signature");
    assert.equal((r.html.match(/<td align="center" bgcolor="#0a6d8f"/g) || []).length, 1, where + " : un seul bouton");
    if (r.locale === "fr") assert.doesNotMatch(visible(r.html) + r.subject, /\b(vous|votre|vos)\b/i, where + " : tutoiement");
    if (r.locale === "de") assert.doesNotMatch(visible(r.html), /\b(Sie|Ihr|Ihre|Ihnen)\b/, where + " : duzen");
  }
  for (const loc of build.LOCALES) {
    const raw = read("emails/lifecycle/copy." + loc + ".json");
    assert.doesNotMatch(raw, /\p{Extended_Pictographic}/u, loc);
    assert.doesNotMatch(raw, FORBIDDEN_FOR_CLEMENT[loc], loc);
  }
});

// ------------------------------------------------- match offert = site = serveur

async function chargerRepliServeur() {
  if (typeof NODE_MODULE.stripTypeScriptTypes !== "function") return null;
  let code = read("supabase/functions/match-data/index.ts");
  code = NODE_MODULE.stripTypeScriptTypes(code, { mode: "strip" });
  code = code.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = () => ({});");
  globalThis.Deno = { env: { get: () => "x" }, serve: () => {} };
  const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  return mod.idOffertRepli;
}

const m = (id, date, extra) => Object.assign({ id, date, sport: "football", home: { n: "Dom " + id }, away: { n: "Ext " + id }, league: "L", has_signal: true, is_free: false, data_quality_score: 50 }, extra || {});
const site = (list, now, ctx) => FREE.pickFreeMatchId(list, MT.localClock(now, ctx.timeZone), ctx.market);

test("match offert de l'email = celui du site (lib/free-match.js) = celui que le serveur ouvre (match-data#idOffertRepli)", async (t) => {
  const repli = await chargerRepliServeur();
  const fr = L.siteContext(BUNDLE.markets, "fr");
  const mx = L.siteContext(BUNDLE.markets, "mx");
  const now = new Date("2026-10-21T08:00:00Z"); // 10:00 a Paris
  // 1. Aucune designation (cas reel depuis le 05/10) : repli identique partout.
  const sans = [m(1, "2026-10-21 21:00", { data_quality_score: 90 }), m(2, "2026-10-21 18:45", { data_quality_score: 70 }), m(3, "2026-10-22 21:00", { data_quality_score: 99 })];
  assert.equal(L.pickFreeMatch(sans, now, fr).id, 1);
  assert.equal(site(sans, now, fr), 1);
  assert.equal(L.serverFreeMatchId(sans, now), "1");
  // 2. Designation du pipeline (a nouveau a partir du 22/10) : elle fait autorite.
  const designe = sans.concat([m(4, "2026-10-21 20:00", { is_free: true, free_markets: ["default"], data_quality_score: 10 })]);
  assert.equal(L.pickFreeMatch(designe, now, fr).id, 4);
  assert.equal(site(designe, now, fr), 4);
  assert.equal(L.serverFreeMatchId(designe, now), null, "designation : pas de repli serveur, le match designe est ouvert");
  // 3. Designation Liga MX pour le Mexique.
  const pays = designe.concat([m(5, "2026-10-22 04:00", { is_free: true, free_markets: ["mx"] })]);
  assert.equal(L.pickFreeMatch(pays, now, mx).id, 5);
  assert.equal(site(pays, now, mx), 5);
  assert.equal(L.pickFreeMatch(pays, now, fr).id, 4);
  // 4. Match offert du jour deja commence : le site le garde, l'email attend le suivant.
  const soir = new Date("2026-10-21T19:30:00Z"); // 21:30 a Paris
  assert.equal(site(sans, soir, fr), 1);
  assert.equal(L.pickFreeMatch(sans, soir, fr), null);
  // 5. Mexico, fin d'apres-midi : le jour de Paris a deja change, le repli du serveur
  //    (heure de Paris) differe de celui du site (heure locale) : aucun email plutot
  //    qu'un lien vers une analyse que le serveur garderait fermee.
  const mexico = new Date("2026-10-21T23:30:00Z"); // 17:30 a Mexico, 01:30 a Paris le 22
  const decale = [m(11, "2026-10-21 21:00", { has_signal: false, no_signal: true }), m(12, "2026-10-22 03:00", { data_quality_score: 60 }), m(13, "2026-10-22 21:00", { data_quality_score: 99 })];
  assert.equal(site(decale, mexico, mx), 12);
  assert.equal(L.serverFreeMatchId(decale, mexico), "13");
  assert.equal(L.pickFreeMatch(decale, mexico, mx), null);
  // Meme regle que le serveur reel (copie dans match-data/index.ts).
  if (!repli) { t.diagnostic("node:module#stripTypeScriptTypes indisponible : comparaison au serveur sautee"); return; }
  for (const [list, when] of [[sans, now], [designe, now], [decale, mexico], [sans, soir], [sans.map((x) => Object.assign({}, x, { is_free: x.id === 2, date: x.id === 2 ? "2026-10-19 18:45" : x.date })), now]]) {
    assert.equal(L.serverFreeMatchId(list, when), repli(list, when));
  }
});

// ------------------------------------------------- module des fonctions Edge

test("module genere : free-match et match-time embarques, meme match offert que la lib", async () => {
  assert.equal(fs.readFileSync(build.BUNDLE_PATH, "utf8"), build.buildBundleSource(), "lancer node lib/lifecycle-email-build.js");
  const mod = await import(pathToFileURL(build.BUNDLE_PATH).href);
  assert.equal(typeof mod.FreeMatch.pickFreeMatch, "function");
  assert.equal(typeof mod.MatchTime.localClock, "function");
  const list = [m(1, "2026-10-21 21:00", { data_quality_score: 90 }), m(2, "2026-10-21 18:45")];
  const now = new Date("2026-10-21T08:00:00Z");
  for (const dir of ["fr", "mx", "gb"]) {
    const a = mod.Lifecycle.pickFreeMatch(list, now, mod.Lifecycle.siteContext(mod.BUNDLE.markets, dir));
    const b = L.pickFreeMatch(list, now, L.siteContext(BUNDLE.markets, dir));
    assert.deepEqual(a, b, dir);
  }
  assert.equal(mod.Lifecycle.TEST_RECIPIENT, L.TEST_RECIPIENT);
});

// ------------------------------------------------- workflow manuel

test("workflow emails-automatiques : manuel, modes apercu et test seulement, region us-east-2, jamais d'envoi reel", () => {
  const wf = read(".github/workflows/emails-automatiques.yml");
  assert.match(wf, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(wf, /^\s*(schedule|push|pull_request|cron):/m, "aucune programmation");
  assert.match(wf, /options: \[apercu, test\]/);
  assert.doesNotMatch(wf, /confirmation|ENVOYER/i, "aucun mode d'envoi reel");
  assert.deepEqual(wf.slice(wf.indexOf("    inputs:"), wf.indexOf("permissions:")).match(/^      [a-z_]+:$/gm), ["      mode:"], "une seule entree : le mode");
  assert.doesNotMatch(wf, /LIFECYCLE_SENDING_ENABLED=/, "l'envoi reel n'est jamais active par ce workflow");
  assert.match(wf, /-H "x-region: us-east-2"/);
  assert.match(wf, /-H "x-relance-secret: \$RELANCE_SECRET"/);
  assert.match(wf, /for fonction in send-lifecycle-emails trial-reminder; do\n\s+npx -y supabase@2 functions deploy "\$fonction" --project-ref ksvjraqitxouwiabecai --use-api --no-verify-jwt/);
  assert.match(wf, /node --test tests\/email-lifecycle\.test\.js[^\n]*tests\/trial-reminder\.test\.js/, "tests avant l'installation");
  assert.match(wf, /uses: actions\/upload-artifact@v4[\s\S]*name: emails-apercu/);
  assert.match(wf, /if: always\(\) && inputs\.mode == 'apercu'/);
  assert.doesNotMatch(wf, /yaramode81|@gmail\.com/, "l'adresse de test n'est jamais saisie dans le workflow");
  // L'adresse du mode test n'existe qu'a un seul endroit du code des e-mails.
  for (const f of ["supabase/functions/send-lifecycle-emails/handler.ts", "supabase/functions/trial-reminder/handler.ts", "supabase/functions/_shared/brevo.ts", "scripts/emails-apercu.js"]) {
    assert.doesNotMatch(read(f), /yaramode81/, f);
  }
  assert.equal((read("lib/lifecycle-email.js").match(/yaramode81@gmail\.com/g) || []).length, 1);
});
