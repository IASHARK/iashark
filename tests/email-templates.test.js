"use strict";
// Emails transactionnels : gabarits (emails/templates/), rendu pur
// (lib/email-render.js) et module embarque par la fonction Edge
// send-transactional-email (lib/email-build.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lib = require("../lib/email-render.js");
const build = require("../lib/email-build.js");

const ROOT = path.join(__dirname, "..");
const TEMPLATES = build.loadTemplates();
const NOW = new Date("2026-09-14T15:00:00Z");

const FULL_COMPANY = {
  operatorName: "Exploitant Test",
  address: "1 rue de Test, 75001 Paris, France",
  registration: "000 000 000 00000",
  vat: "FR00000000000",
  phone: "+33 1 00 00 00 00",
  mediator: "Mediateur Test"
};

function purchaseData(over) {
  return Object.assign({
    planName: "IASHARK Pro",
    amountMinor: 1995,
    currency: "EUR",
    interval: "month",
    intervalCount: 1,
    startDate: "2026-09-14T08:00:00Z",
    nextBillingDate: "2026-10-14T08:00:00Z",
    customerEmail: "client@example.com",
    immediateStartRequested: true,
    termsVersion: "2026-09-13",
    consentRecordedAt: "2026-09-14T07:59:00Z",
    reference: "sub_TEST123"
  }, over || {});
}

function reminderData(over) {
  return Object.assign({
    planName: "IASHARK Pro",
    amountMinor: 19900,
    currency: "MXN",
    interval: "month",
    intervalCount: 1,
    renewalDate: "2026-09-21T15:00:00Z",
    customerEmail: "cliente@example.com",
    reference: "sub_MX123"
  }, over || {});
}

const renderFr = (over, opts) => lib.renderEmail(TEMPLATES, "purchase_confirmation", "fr", purchaseData(over), opts || {});
const renderGb = (over, opts) => lib.renderEmail(TEMPLATES, "purchase_confirmation", "gb", purchaseData(Object.assign({ amountMinor: 1499, currency: "GBP" }, over)), opts || {});
const renderMx = (over, opts) => lib.renderEmail(TEMPLATES, "renewal_reminder", "mx", reminderData(over), Object.assign({ now: NOW }, opts || {}));

const ALL = () => [
  { name: "fr", r: renderFr(), dir: "fr" },
  { name: "gb", r: renderGb(), dir: "gb" },
  { name: "mx", r: renderMx(), dir: "mx" }
];

const stripStyle = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, "");
// Intl insere des espaces insecables (U+00A0 / U+202F), ex. "19,95 €".
const norm = (s) => s.replace(/[  ]/g, " ");

// ---------------------------------------------------------------- structure

test("chaque gabarit existe en HTML et en texte, avec une ligne Subject", () => {
  for (const kind of Object.keys(build.TEMPLATE_FILES)) {
    for (const market of Object.keys(build.TEMPLATE_FILES[kind])) {
      const t = TEMPLATES[kind][market];
      assert.ok(t.html.includes("<!DOCTYPE html>"), kind + "." + market + " html");
      assert.match(t.text, /^Subject: \S/, kind + "." + market + " txt");
    }
  }
  assert.deepEqual(Object.keys(build.TEMPLATE_FILES).sort(), Object.keys(lib.TEMPLATE_KINDS).sort());
  for (const kind of Object.keys(lib.TEMPLATE_KINDS)) {
    assert.deepEqual(Object.keys(build.TEMPLATE_FILES[kind]).sort(), lib.TEMPLATE_KINDS[kind].slice().sort(), kind);
  }
});

test("le module de la fonction Edge est a jour (node lib/email-build.js)", () => {
  const onDisk = fs.readFileSync(build.BUNDLE_PATH, "utf8");
  assert.equal(onDisk, build.buildBundleSource(), "email-bundle.generated.mjs perime : lancer node lib/email-build.js");
});

test("le module genere s'importe en ESM et rend le meme email que la lib", async () => {
  const mod = await import(require("node:url").pathToFileURL(build.BUNDLE_PATH).href);
  for (const name of build.EXPORTED) assert.ok(name in mod, "export " + name);
  const a = mod.renderEmail("renewal_reminder", "mx", reminderData(), { now: NOW });
  const b = renderMx();
  assert.equal(a.html, b.html);
  assert.equal(a.text, b.text);
  assert.equal(a.subject, b.subject);
});

test("les donnees marche du rendu refletent config/markets.json", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "markets.json"), "utf8"));
  for (const key of Object.keys(lib.MARKETS)) {
    const m = lib.MARKETS[key];
    assert.equal(m.currency, cfg[key].currency, key + " devise");
    assert.equal(m.intlLocale, cfg[key].intlLocale, key + " intlLocale");
    assert.equal(m.htmlLang, cfg[key].htmlLang, key + " htmlLang");
    assert.ok(cfg._dirs[m.dir] && cfg._dirs[m.dir].market === key, key + " repertoire " + m.dir);
    assert.equal(m.helpline.phone, cfg[key].helpline.phone, key + " telephone d'aide");
    assert.equal(m.helpline.url, cfg[key].helpline.url, key + " url d'aide");
  }
});

// ------------------------------------------------------------ placeholders

test("aucun placeholder non resolu hors BLOCKED_DECISION (HTML, texte, objet)", () => {
  for (const { name, r } of ALL()) {
    for (const [part, value] of [["subject", r.subject], ["html", r.html], ["text", r.text]]) {
      assert.doesNotMatch(value, /\{\{|\}\}/, name + " " + part + " : balise {{ }}");
      assert.doesNotMatch(value, /\b(undefined|NaN)\b|\[object |\bnull\b/, name + " " + part + " : valeur vide");
      assert.doesNotMatch(value, /à compléter|to be completed|\[pendiente\]|lorem ipsum/i, name + " " + part);
      assert.doesNotMatch(value, /\b(TODO|FIXME|XXX)\b/, name + " " + part);
    }
    const brackets = (stripStyle(r.html) + "\n" + r.text + "\n" + r.subject).match(/\[[^\]]*\]/g) || [];
    for (const b of brackets) assert.match(b, /^\[BLOCKED_DECISION: COMPANY_[A-Z_]+\]$/, name + " crochet inattendu : " + b);
  }
});

test("identite vendeur absente : marqueurs BLOCKED_DECISION visibles et listes, jamais inventes", () => {
  const fr = renderFr();
  assert.deepEqual(fr.blockedDecisions, ["COMPANY_OPERATOR_NAME", "COMPANY_ADDRESS", "COMPANY_REGISTRATION", "COMPANY_VAT", "COMPANY_PHONE", "COMPANY_MEDIATOR"]);
  const gb = renderGb();
  assert.deepEqual(gb.blockedDecisions, ["COMPANY_OPERATOR_NAME", "COMPANY_ADDRESS", "COMPANY_REGISTRATION", "COMPANY_VAT", "COMPANY_PHONE"]);
  const mx = renderMx();
  assert.deepEqual(mx.blockedDecisions, ["COMPANY_OPERATOR_NAME", "COMPANY_ADDRESS", "COMPANY_REGISTRATION", "COMPANY_PHONE"]);
  for (const r of [fr, gb, mx]) {
    for (const key of r.blockedDecisions) {
      assert.ok(r.html.includes("[BLOCKED_DECISION: " + key + "]"), key + " html");
      assert.ok(r.text.includes("[BLOCKED_DECISION: " + key + "]"), key + " texte");
    }
    assert.doesNotMatch(r.text, /\b\d{3} ?\d{3} ?\d{3} ?\d{5}\b/, "aucun SIRET invente");
  }
});

test("identite vendeur fournie : plus aucun BLOCKED_DECISION", () => {
  for (const r of [renderFr({}, { company: FULL_COMPANY }), renderGb({}, { company: FULL_COMPANY }), renderMx({}, { company: FULL_COMPANY })]) {
    assert.deepEqual(r.blockedDecisions, []);
    assert.ok(!r.html.includes("BLOCKED_DECISION") && !r.text.includes("BLOCKED_DECISION"));
    assert.ok(r.text.includes(FULL_COMPANY.address));
  }
});

test("companyFromEnv lit les secrets COMPANY_* sans rien inventer", () => {
  const env = { COMPANY_ADDRESS: "  1 rue X, Paris  ", COMPANY_VAT: "" };
  const c = lib.companyFromEnv((k) => env[k]);
  assert.deepEqual(c, { operatorName: null, address: "1 rue X, Paris", registration: null, vat: null, phone: null, mediator: null });
});

// ------------------------------------------------------ pays, langue, devise

test("FR : francais, EUR TTC, 14 jours + demande d'execution immediate, ANJ 18+ et Joueurs Info Service", () => {
  const r = renderFr();
  assert.equal(r.locale, "fr");
  assert.equal(r.currency, "EUR");
  assert.match(r.html, /<html lang="fr"/);
  assert.equal(r.subject, "Confirmation de votre abonnement IASHARK Pro");
  for (const s of [norm(r.html), norm(r.text)]) {
    assert.ok(s.includes("19,95 €"), "prix formate fr-FR");
    assert.ok(s.includes("TTC") && s.includes("EUR"));
    assert.ok(s.includes("14 septembre 2026"), "date de debut");
    assert.ok(s.includes("14 octobre 2026"), "prochain prelevement");
    assert.ok(s.includes("Mensuelle"), "periodicite");
    assert.ok(s.includes("28 septembre 2026"), "fin du delai de 14 jours");
    assert.ok(s.includes("L221-18") && s.includes("L221-25"));
    assert.ok(s.includes("Modèle de formulaire de rétractation"));
    assert.ok(s.includes("ANJ") && s.includes("09 74 75 13 13") && s.includes("Joueurs Info Service"));
    assert.ok(s.includes("interdits aux mineurs") && s.includes("18+"));
    assert.ok(s.includes("Gérer mon abonnement"), "chemin de resiliation");
    assert.ok(s.includes("13 septembre 2026"), "version des CGV acceptee");
    assert.doesNotMatch(s, /£|MXN|GBP|\$/);
  }
});

test("GB : anglais UK, GBP, Consumer Contracts Regulations 14 jours + consentement expres, 18+ BeGambleAware", () => {
  const r = renderGb();
  assert.equal(r.locale, "en-GB");
  assert.equal(r.currency, "GBP");
  assert.match(r.html, /<html lang="en-GB"/);
  assert.equal(r.subject, "Your IASHARK Pro subscription is confirmed");
  for (const s of [norm(r.html), norm(r.text)]) {
    assert.ok(s.includes("£14.99") && s.includes("GBP"));
    assert.ok(s.includes("14 September 2026") && s.includes("14 October 2026") && s.includes("28 September 2026"));
    assert.ok(s.includes("Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013"));
    assert.ok(s.includes("express consent") && s.includes("regulation 37"));
    assert.ok(s.includes("Model cancellation form"));
    assert.ok(s.includes("BeGambleAware.org") && s.includes("18+") && s.includes("0808 8020 133"));
    assert.ok(s.includes("Manage my subscription"));
    assert.doesNotMatch(s, /€|MXN|EUR|\$|TTC/);
  }
});

test("MX : espagnol du Mexique, MXN, date, J-7, annulation en ligne, PROFECO, 18+", () => {
  const r = renderMx();
  assert.equal(r.locale, "es-MX");
  assert.equal(r.currency, "MXN");
  assert.match(r.html, /<html lang="es-MX"/);
  assert.equal(r.subject, "Tu suscripción IASHARK Pro se renueva el 21 de septiembre de 2026");
  for (const s of [norm(r.html), norm(r.text)]) {
    assert.ok(s.includes("$199.00 MXN"), "montant sans ambiguite peso/dollar");
    assert.ok(s.includes("21 de septiembre de 2026"));
    assert.ok(s.includes("7 días"));
    assert.ok(s.toLowerCase().includes("cómo cancelar en línea") && s.includes("Gestionar mi suscripción"));
    assert.ok(s.includes("sin costo y sin penalización"));
    assert.ok(s.includes("no se hará este cobro"));
    assert.ok(s.includes("Ley Federal de Protección al Consumidor") && s.includes("PROFECO") && s.includes("800 468 8722"));
    assert.ok(s.includes("menores de 18 años") && s.includes("18+"));
    assert.doesNotMatch(s, /€|£|EUR|GBP|TTC/);
  }
  assert.ok(renderMx({ renewalDate: "2026-09-15T15:00:00Z" }).text.includes("1 día"), "singulier");
});

test("variantes du consentement d'execution immediate (FR et GB)", () => {
  const frYes = renderFr({ immediateStartRequested: true }).text;
  const frNo = renderFr({ immediateStartRequested: false }).text;
  assert.ok(frYes.includes("demandé expressément") && !frYes.includes("Aucune demande d’exécution immédiate"));
  assert.ok(frNo.includes("Aucune demande d’exécution immédiate") && !frNo.includes("demandé expressément"));
  const gbYes = renderGb({ immediateStartRequested: true }).text;
  const gbNo = renderGb({ immediateStartRequested: false }).text;
  assert.ok(gbYes.includes("express consent for your subscription to start immediately"));
  assert.ok(gbNo.includes("No express consent to an immediate start"));
  assert.ok(!renderFr({ immediateStartRequested: "true" }).text.includes("demandé expressément"), "seul le booleen true compte");
});

test("champs optionnels : montant paye different, resiliation programmee, sans version de CGV", () => {
  const r = renderFr({ amountPaidMinor: 995, nextBillingDate: null, termsVersion: null, consentRecordedAt: null, reference: null });
  assert.ok(norm(r.text).includes("Montant payé aujourd’hui : 9,95 € TTC"));
  assert.ok(r.text.includes("Aucun : résiliation déjà programmée"));
  assert.ok(!r.text.includes("dans leur version du"));
  assert.ok(!r.text.includes("Référence"));
  assert.ok(!renderFr({ amountPaidMinor: 1995 }).text.includes("Montant payé aujourd’hui"), "identique au prix : non repete");
});

// -------------------------------------------------------------------- liens

const EXTERNAL_ALLOWED = [
  "https://www.joueurs-info-service.fr",
  "https://www.begambleaware.org",
  "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000",
  "https://www.gob.mx/profeco",
  "mailto:contact@iashark.com"
];

function linksOf(r) {
  const hrefs = [...r.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const textUrls = [...r.text.matchAll(/\b(?:https?:\/\/|www\.)[^\s)]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
  return { hrefs, textUrls };
}

test("tous les liens sont absolus : pages iashark.com du bon pays, existantes dans le depot", () => {
  for (const { name, r, dir } of ALL()) {
    const { hrefs, textUrls } = linksOf(r);
    assert.ok(hrefs.length > 5 && textUrls.length > 3, name);
    for (const url of hrefs.concat(textUrls)) {
      if (EXTERNAL_ALLOWED.includes(url)) continue;
      assert.ok(url.startsWith("https://iashark.com/"), name + " lien non absolu ou hors iashark.com : " + url);
      const rel = url.slice("https://iashark.com/".length);
      assert.ok(rel.startsWith(dir + "/"), name + " lien d'un autre pays : " + url);
      const file = rel.endsWith("/") ? rel + "index.html" : rel;
      assert.ok(fs.existsSync(path.join(ROOT, file)), name + " page inexistante : " + url);
    }
    assert.ok(hrefs.includes("https://iashark.com/" + dir + "/compte.html"), name + " lien page compte");
    assert.doesNotMatch(r.html, /href="(?!https:\/\/|mailto:)/, name + " href relatif");
    const withoutNamespace = (r.html + r.text).replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
    assert.doesNotMatch(withoutNamespace, /http:\/\//, name + " http non chiffre");
  }
});

test("lien direct du portail Stripe : optionnel, affiche seulement s'il est valide", () => {
  const url = "https://billing.stripe.com/p/login/test_123";
  const r = renderMx({}, { portalUrl: url });
  assert.ok(r.html.includes('href="' + url + '"') && r.text.includes(url));
  assert.ok(!renderMx().text.includes("billing.stripe.com"));
  assert.throws(() => renderFr({}, { portalUrl: "https://evil.example/login" }), (e) => e.code === "invalid_portal_url");
  assert.throws(() => renderFr({}, { portalUrl: "javascript:alert(1)" }), (e) => e.code === "invalid_portal_url");
});

// --------------------------------------------------- compatibilite clients

test("HTML compatible clients mail : CSS inline, mode sombre, ni script ni image distante", () => {
  for (const { name, r } of ALL()) {
    const h = r.html;
    assert.match(h, /<meta name="color-scheme" content="light dark">/, name);
    assert.match(h, /<meta name="supported-color-schemes" content="light dark">/, name);
    assert.match(h, /@media \(prefers-color-scheme: dark\)/, name);
    assert.match(h, /\[data-ogsc\]/, name + " Outlook.com");
    assert.match(h, /<title>[^<]+<\/title>/, name);
    assert.doesNotMatch(h, /<script|<img|<link|<iframe|<form|javascript:|url\(/i, name);
    const body = stripStyle(h);
    const tags = body.match(/<(p|h1|h2|td|th|table|a)\b[^>]*>/g) || [];
    assert.ok(tags.length > 30, name);
    for (const tag of tags) assert.match(tag, /style="[^"]+"/, name + " style inline manquant : " + tag.slice(0, 80));
    assert.ok(Buffer.byteLength(h) < 102 * 1024, name + " < 102 Ko (troncature Gmail)");
    assert.match(r.text, /\S/);
    assert.doesNotMatch(r.text, /<[a-z]/i, name + " texte sans HTML");
  }
});

test("echappement HTML des valeurs dynamiques", () => {
  const r = renderFr({ planName: "Pro <b>\"x\"</b> & co" });
  assert.ok(r.html.includes("Pro &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; co"));
  assert.ok(!r.html.includes("<b>\"x\"</b>"));
  assert.ok(r.text.includes("Pro <b>\"x\"</b> & co"), "texte brut non echappe");
});

test("aucune promesse de gains, avertissement present", () => {
  const PROMISES = /gains? (assurés?|garantis?|sûrs?|faciles?)|revenus? garantis?|gagner à coup sûr|rentabilit|guaranteed (profit|win|return)|sure win|easy money|make money|beat the bookies|ganancias? (seguras|garantizadas|fáciles)|dinero fácil|gana dinero/i;
  for (const { name, r } of ALL()) {
    assert.doesNotMatch(r.html + r.text + r.subject, PROMISES, name);
  }
  assert.ok(renderFr().text.includes("aucun gain n’est garanti"));
  assert.ok(renderGb().text.includes("no winnings are guaranteed"));
  assert.ok(renderMx().text.includes("no garantiza ganancias"));
});

// ------------------------------------------------------------------ erreurs

test("refus : mauvaise devise, marche sans gabarit, donnees invalides", () => {
  const code = (c) => (e) => e instanceof lib.EmailRenderError && e.code === c;
  assert.throws(() => renderFr({ currency: "GBP" }), code("currency_mismatch"));
  assert.throws(() => renderGb({ currency: "EUR" }), code("currency_mismatch"));
  assert.throws(() => renderMx({ currency: "USD" }), code("currency_mismatch"));
  assert.throws(() => lib.renderEmail(TEMPLATES, "purchase_confirmation", "za", purchaseData({ currency: "ZAR" }), {}), code("unsupported_market"));
  assert.throws(() => lib.renderEmail(TEMPLATES, "purchase_confirmation", "mx", purchaseData({ currency: "MXN" }), {}), code("unsupported_market"));
  assert.throws(() => lib.renderEmail(TEMPLATES, "renewal_reminder", "fr", reminderData({ currency: "EUR" }), { now: NOW }), code("unsupported_market"));
  assert.throws(() => lib.renderEmail(TEMPLATES, "welcome", "fr", {}, {}), code("unknown_kind"));
  assert.throws(() => renderFr({ amountMinor: 19.95 }), code("invalid_amount"));
  assert.throws(() => renderFr({ startDate: "hier" }), code("invalid_date"));
  assert.throws(() => renderFr({ customerEmail: "pas-un-email" }), code("invalid_email"));
  assert.throws(() => renderFr({ interval: "week" }), code("invalid_interval"));
  assert.throws(() => renderFr({ planName: "" }), code("invalid_plan"));
  assert.throws(() => renderMx({ renewalDate: "2026-09-01T00:00:00Z" }), code("renewal_in_past"));
  assert.throws(() => renderMx({ amountMinor: 0 }), code("invalid_amount"));
  assert.throws(() => lib.renderEmail(TEMPLATES, "renewal_reminder", "mx", reminderData(), {}), code("invalid_now"));
});

test("le moteur de gabarit echoue sur une variable absente au lieu d'envoyer un trou", () => {
  assert.throws(() => lib.renderTemplate("Bonjour {{prenom}}", {}, true), (e) => e.code === "unresolved_placeholder");
  assert.throws(() => lib.renderTemplate("{{#a}}x", { a: true }, true), (e) => e.code === "unresolved_placeholder");
  assert.equal(lib.renderTemplate("{{! c }}{{#a}}A{{#b}}B{{/b}}{{/a}}{{^a}}N{{/a}}", { a: true, b: false }, true), "A");
});

// ----------------------------------------------------- Stripe -> donnees

function stripeSub(over) {
  return Object.assign({
    id: "sub_ABC",
    status: "active",
    start_date: 1789372800, // 2026-09-14T08:00:00Z
    cancel_at_period_end: false,
    customer: { id: "cus_1", email: "client@example.com" },
    metadata: { market: "gb", consent_waiver: "true", consent_terms_version: "2026-09-13", consent_server_ts: "2026-09-14T07:59:00.000Z" },
    items: { data: [{ quantity: 1, current_period_end: 1791964800, price: { unit_amount: 1499, currency: "gbp", recurring: { interval: "month", interval_count: 1 }, product: { name: "IASHARK Pro" } } }] },
    latest_invoice: { id: "in_1", amount_paid: 1499, customer_email: "client@example.com" }
  }, over || {});
}

test("purchaseConfirmationFromStripe : abonnement dahlia -> donnees de rendu", () => {
  const m = lib.purchaseConfirmationFromStripe({ subscription: stripeSub() });
  assert.equal(m.ok, true);
  assert.equal(m.market, "gb");
  assert.equal(m.to, "client@example.com");
  assert.equal(m.idempotencyKey, "purchase_confirmation:gb:sub_ABC");
  assert.equal(m.data.amountMinor, 1499);
  assert.equal(m.data.currency, "GBP");
  assert.equal(m.data.immediateStartRequested, true);
  assert.equal(m.data.nextBillingDate, "2026-10-14T08:00:00.000Z");
  const r = lib.renderEmail(TEMPLATES, m.kind, m.market, m.data, {});
  assert.ok(r.text.includes("£14.99"));

  const legacy = lib.purchaseConfirmationFromStripe({ subscription: stripeSub({ metadata: {}, items: { data: [{ current_period_end: 1791964800, price: { unit_amount: 1995, currency: "eur", recurring: { interval: "month" } } }] } }) });
  assert.equal(legacy.market, "fr", "flux historique sans marche = FR");
  assert.equal(legacy.data.immediateStartRequested, false);

  assert.equal(lib.purchaseConfirmationFromStripe({ subscription: stripeSub({ metadata: { market: "za" } }) }).reason, "no_template_for_market");
  assert.equal(lib.purchaseConfirmationFromStripe({ subscription: stripeSub({ status: "incomplete" }) }).reason, "subscription_not_active");
  assert.equal(lib.purchaseConfirmationFromStripe({ subscription: stripeSub({ customer: "cus_1", latest_invoice: null }) }).reason, "customer_email_missing");
  assert.equal(lib.purchaseConfirmationFromStripe({ subscription: stripeSub({ cancel_at_period_end: true }) }).data.nextBillingDate, null);
});

test("renewalReminderFromStripe : MX uniquement, montant de l'apercu Stripe, cle par date locale", () => {
  const sub = stripeSub({
    metadata: { market: "mx" },
    items: { data: [{ current_period_end: Date.parse("2026-09-21T15:00:00Z") / 1000, price: { unit_amount: 19900, currency: "mxn", recurring: { interval: "month" } } }] }
  });
  const preview = { amount_due: 19900, currency: "mxn" };
  const m = lib.renewalReminderFromStripe({ subscription: sub, preview, now: NOW });
  assert.equal(m.ok, true);
  assert.equal(m.idempotencyKey, "renewal_reminder:mx:sub_ABC:2026-09-21");
  assert.equal(m.renewalLocalDate, "2026-09-21");
  assert.equal(m.data.currency, "MXN");
  assert.equal(lib.renewalReminderFromStripe({ subscription: stripeSub(), preview, now: NOW }).reason, "not_mx_market");
  assert.equal(lib.renewalReminderFromStripe({ subscription: Object.assign({}, sub, { cancel_at_period_end: true }), preview, now: NOW }).reason, "cancel_at_period_end");
  assert.equal(lib.renewalReminderFromStripe({ subscription: Object.assign({}, sub, { status: "past_due" }), preview, now: NOW }).reason, "subscription_not_active");
  assert.equal(lib.renewalReminderFromStripe({ subscription: sub, preview: null, now: NOW }).reason, "amount_unavailable");
  assert.equal(lib.renewalReminderFromStripe({ subscription: sub, preview: { amount_due: 0, currency: "mxn" }, now: NOW }).reason, "nothing_to_charge");
  assert.equal(lib.renewalReminderFromStripe({ subscription: sub, preview, now: new Date("2026-09-30T00:00:00Z") }).reason, "renewal_in_past");
});

// ------------------------------------------------------------ planification

test("renewalWindow : jour calendaire local (Mexique sans heure d'ete, Paris au changement d'heure)", () => {
  assert.deepEqual(lib.renewalWindow(NOW, 7, "America/Mexico_City"), {
    daysBefore: 7, timeZone: "America/Mexico_City", localDate: "2026-09-21",
    start: "2026-09-21T06:00:00.000Z", end: "2026-09-22T06:00:00.000Z"
  });
  // 23:30 UTC le 13/09 = 17:30 le 13/09 a Mexico : J+7 = 20/09.
  assert.equal(lib.renewalWindow(new Date("2026-09-13T23:30:00Z"), 7, "America/Mexico_City").localDate, "2026-09-20");
  const dst = lib.renewalWindow(new Date("2026-03-28T23:30:00Z"), 1, "Europe/Paris");
  assert.equal(dst.localDate, "2026-03-30");
  assert.equal(dst.start, "2026-03-29T22:00:00.000Z");
  assert.equal(dst.end, "2026-03-30T22:00:00.000Z");
});

test("parseReminderDays : defaut 7, parametrable, bornes 1..30", () => {
  assert.equal(lib.DEFAULT_REMINDER_DAYS, 7);
  assert.equal(lib.parseReminderDays(undefined), 7);
  assert.equal(lib.parseReminderDays(""), 7);
  assert.equal(lib.parseReminderDays("10"), 10);
  assert.equal(lib.parseReminderDays(3), 3);
  for (const bad of [0, 31, 2.5, "abc", "-1", {}]) assert.throws(() => lib.parseReminderDays(bad), (e) => e.code === "invalid_reminder_days", String(bad));
});

test("utilitaires : safeEqual, maskEmail, cleanIdempotencyKey", () => {
  assert.equal(lib.safeEqual("secret-123", "secret-123"), true);
  assert.equal(lib.safeEqual("secret-123", "secret-124"), false);
  assert.equal(lib.safeEqual("secret", "secret-123"), false);
  assert.equal(lib.safeEqual("", ""), false, "secret vide jamais accepte");
  assert.equal(lib.maskEmail("client@example.com"), "c***@example.com");
  assert.equal(lib.maskEmail("nope"), "(aucune)");
  assert.equal(lib.cleanIdempotencyKey("purchase_confirmation:fr:sub_1"), "purchase_confirmation:fr:sub_1");
  assert.equal(lib.cleanIdempotencyKey("a b"), null);
});
