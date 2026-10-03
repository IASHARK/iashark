"use strict";
// Programme de partenaires (03/10/2026, decisions de Clement) : 40 % de chaque
// paiement encaisse (semaine, mois, annee), a vie, un seul niveau, pas de
// « mois offert », validation d'un clic par Clement.
//
// 1) Module pur _shared/affiliation.ts : commission 40 % du HT encaisse, rien
//    pendant l'essai, reprise sur remboursement, auto-affiliation refusee
//    (compte, e-mail normalise, client Stripe, carte), essai coupe quand la
//    carte a deja servi, seuil 50 et attente 30 jours, lots de versement.
// 2) Parcours de bout en bout simule : lien -> inscription -> checkout ->
//    invoice.paid -> commission ; affilie suspendu = rien.
// 3) Gardes statiques : webhook, checkout, inscription, suivi du lien (60
//    jours, premier clic), migrations 0050/0051, pages et dictionnaires (7
//    langues, aucune mise ni promesse de gain), admin.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const mod = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/affiliation.ts")).href);
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const { PUBLIC_DIRS } = require("./helpers/public-dirs.js");

// ---------------------------------------------------------------------------
// 1) Module pur
// ---------------------------------------------------------------------------
test("commission : 40 % du HT reellement encaisse (apres remise, hors TVA), arrondi au centime", async () => {
  const A = await mod();
  assert.equal(A.COMMISSION_RATE, 0.4);
  assert.equal(A.COMMISSION_RATE_BP, 4000);
  // 19,95 EUR TTC, franchise de TVA : HT = TTC.
  assert.deepEqual(A.commissionFromInvoice({ status: "paid", amount_paid: 1995, total_excluding_tax: 1995, tax: 0, currency: "eur" }), { ok: true, baseCents: 1995, commissionCents: 798, currency: "eur" });
  // 6,99 EUR / semaine.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 699, total_excluding_tax: 699, currency: "eur" }).commissionCents, 280);
  // Annee 199 EUR.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 19900, total_excluding_tax: 19900, currency: "eur" }).commissionCents, 7960);
  // Avec TVA : la base est le HT (total_excluding_tax), jamais le TTC.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 1200, total_excluding_tax: 1000, tax: 200, currency: "eur" }).commissionCents, 400);
  // Sans total_excluding_tax : amount_paid - tax.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 1200, tax: 200, currency: "eur" }).commissionCents, 400);
  // Remise : base = ce qui est encaisse.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 995, total_excluding_tax: 995, currency: "eur" }).commissionCents, 398);
  // USD / GBP : devise conservee en minuscules.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 1999, total_excluding_tax: 1999, currency: "USD" }).currency, "usd");
});

test("essai = pas de commission (facture a 0) ; facture impayee = rien", async () => {
  const A = await mod();
  assert.deepEqual(A.commissionFromInvoice({ status: "paid", amount_paid: 0, total_excluding_tax: 0, currency: "eur", billing_reason: "subscription_create" }), { ok: false, reason: "zero_amount" });
  assert.deepEqual(A.commissionFromInvoice({ status: "open", amount_paid: 0, currency: "eur" }), { ok: false, reason: "not_paid" });
  assert.deepEqual(A.commissionFromInvoice({ status: "paid", amount_paid: 100, total_excluding_tax: 0, tax: 100, currency: "eur" }).ok, false);
});

test("remboursement = reprise proportionnelle, plafonnee a la commission", async () => {
  const A = await mod();
  assert.equal(A.reversalAmount(798, 1995, 1995), 798, "remboursement total");
  assert.equal(A.reversalAmount(798, 1995, 998), 399, "remboursement de moitie");
  assert.equal(A.reversalAmount(798, 1995, 5000), 798, "jamais plus que la commission");
  assert.equal(A.reversalAmount(798, 1995, 0), 0);
  assert.equal(A.reversalAmount(0, 1995, 1995), 0);
});

test("auto-affiliation refusee : meme compte, meme e-mail normalise (points gmail, +alias, majuscules), meme client Stripe, meme carte", async () => {
  const A = await mod();
  assert.equal(A.normalizeEmail("Jean.Dupont+promo@GMAIL.com"), "jeandupont@gmail.com");
  assert.equal(A.normalizeEmail("j.e.a.n@googlemail.com"), "jean@gmail.com");
  assert.equal(A.normalizeEmail("Jean.Dupont+x@outlook.com"), "jean.dupont@outlook.com", "les points comptent hors gmail");
  const base = { affiliateUserId: "u1", customerUserId: "u2", affiliateEmail: "kevin@gmail.com", customerEmail: "sarah@gmail.com" };
  assert.equal(A.selfReferralReason(base), null);
  assert.equal(A.selfReferralReason({ ...base, customerUserId: "u1" }), "self_account");
  assert.equal(A.selfReferralReason({ ...base, customerEmail: "K.E.V.I.N+iashark@googlemail.com" }), "self_email");
  assert.equal(A.selfReferralReason({ ...base, affiliateStripeCustomerIds: ["cus_A"], customerStripeCustomerId: "cus_A" }), "self_customer");
  assert.equal(A.selfReferralReason({ ...base, affiliateCardFingerprints: ["fp_1"], customerCardFingerprint: "fp_1" }), "self_card");
  assert.equal(A.selfReferralReason({ ...base, affiliateCardFingerprints: ["fp_1"], customerCardFingerprint: "fp_2" }), null);
});

test("faille de l'essai : carte deja utilisee (autre compte ou autre abonnement) = essai coupe ; premiere carte = rien ; re-essai Stripe = rien", async () => {
  const A = await mod();
  const d = (o) => A.trialCutDecision({ status: "trialing", fingerprint: "fp_1", userId: "u2", subscriptionId: "sub_new", knownUses: [], ...o });
  assert.deepEqual(d({}), { cut: false, reason: "first_use" });
  // Autre compte (plusieurs e-mails, meme carte) : coupe.
  assert.deepEqual(d({ knownUses: [{ user_id: "u1", stripe_subscription_id: "sub_old", used_for_trial: true }] }), { cut: true, reason: "card_already_used" });
  // Meme compte, autre abonnement (ancien essai annule puis nouveau) : coupe aussi.
  assert.deepEqual(d({ knownUses: [{ user_id: "u2", stripe_subscription_id: "sub_old", used_for_trial: false }] }), { cut: true, reason: "card_already_used" });
  // Meme abonnement re-vu (re-essai Stripe) : rien.
  assert.deepEqual(d({ knownUses: [{ user_id: "u2", stripe_subscription_id: "sub_new", used_for_trial: true }] }), { cut: false, reason: "first_use" });
  // Pas d'essai (paiement direct) ou pas de carte : rien a couper.
  assert.equal(d({ status: "active", knownUses: [{ user_id: "u1", stripe_subscription_id: "x", used_for_trial: true }] }).cut, false);
  assert.equal(d({ fingerprint: null, knownUses: [{ user_id: "u1", stripe_subscription_id: "x", used_for_trial: true }] }).cut, false);
});

test("affilie suspendu, refuse ou en attente : ne gagne rien", async () => {
  const A = await mod();
  assert.equal(A.affiliateCanEarn("approved"), true);
  for (const s of ["pending", "refused", "suspended", undefined, null]) assert.equal(A.affiliateCanEarn(s), false, String(s));
});

test("attente de 30 jours puis payable ; seuil 50 par devise ; reprises imputees", async () => {
  const A = await mod();
  assert.equal(A.HOLD_DAYS, 30);
  assert.equal(A.PAYOUT_THRESHOLD_CENTS, 5000);
  assert.equal(A.payableAt("2026-10-03T10:00:00.000Z"), "2026-11-02T10:00:00.000Z");
  assert.equal(A.isMature("2026-10-03T10:00:00.000Z", "2026-11-01T10:00:00.000Z"), false);
  assert.equal(A.isMature("2026-10-03T10:00:00.000Z", "2026-11-02T10:00:00.000Z"), true);
  const lines = [
    { id: "a", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "b", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "c", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "d", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "e", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "f", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "g", affiliate_id: "A", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "h", affiliate_id: "B", currency: "eur", amount_cents: 798, kind: "commission" },
    { id: "i", affiliate_id: "C", currency: "usd", amount_cents: 6000, kind: "commission" },
    { id: "j", affiliate_id: "C", currency: "usd", amount_cents: 1500, kind: "reversal" },
  ];
  const b = A.payoutBatches(lines);
  assert.deepEqual(b.map((x) => [x.affiliate_id, x.currency, x.amount_cents, x.line_ids.length]), [["A", "eur", 5586, 7], ["C", "usd", 4500, 2]].filter((x) => x[2] >= 5000));
  assert.equal(b.length, 1, "B (7,98) et C (60 - 15 = 45 USD) sous le seuil");
  const bal = A.balances([
    { kind: "commission", status: "pending", amount_cents: 100, currency: "eur" },
    { kind: "commission", status: "payable", amount_cents: 200, currency: "eur" },
    { kind: "reversal", status: "payable", amount_cents: 50, currency: "eur" },
    { kind: "commission", status: "paid", amount_cents: 300, currency: "eur" },
    { kind: "commission", status: "refused", amount_cents: 999, currency: "eur" },
  ]);
  assert.deepEqual(bal.eur, { pending: 100, payable: 150, paid: 300, reversed: 0, refused: 999 });
});

test("codes : 4 a 20 caracteres, majuscules, jamais tronques, mots reserves refuses ; questionnaire valide", async () => {
  const A = await mod();
  assert.equal(A.normalizeCode("kevin23"), "KEVIN23");
  assert.equal(A.normalizeCode("abc"), null);
  assert.equal(A.normalizeCode("a".repeat(21)), null);
  assert.equal(A.normalizeCode("-abcd"), null);
  assert.equal(A.normalizeCode("IASHARK"), null);
  assert.equal(A.normalizeCode("ke vin"), null);
  const ok = A.cleanApplication({ code: "kevin23", networks: ["https://tiktok.com/@kevin"], audience: "12000", content_style: "analysis", country: "fr", status: "individual", accept_terms: true, accept_rules: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.code, "KEVIN23");
  assert.equal(ok.row.country, "FR");
  const ko = A.cleanApplication({ code: "x", networks: [], audience: "-1", content_style: "zzz", country: "France", status: "other", accept_terms: false, accept_rules: "true" });
  assert.equal(ko.ok, false);
  assert.deepEqual(ko.missing, ["code", "networks", "audience", "content_style", "country", "status", "accept_terms", "accept_rules"]);
  assert.equal(A.referralLink("https://iashark.com/", "KEVIN23"), "https://iashark.com/?ref=KEVIN23");
});

// ---------------------------------------------------------------------------
// 2) Parcours de bout en bout (simule, memes fonctions que le webhook)
// ---------------------------------------------------------------------------
test("parcours : lien -> inscription -> checkout -> invoice.paid -> commission 40 % en attente 30 jours ; essai = 0 ; remboursement = reprise ; suspendu = refuse", async () => {
  const A = await mod();
  // 1. Lien : premier clic gagnant (regle du navigateur, testee aussi dans funnel-track).
  const first = A.normalizeCode("kevin23");
  // 2. Inscription : referred_by = affilie KEVIN23 (trigger affiliate_on_signup).
  const affiliate = { id: "aff_1", user_id: "u_kevin", status: "approved", email: "kevin@gmail.com" };
  const client = { id: "u_sarah", email: "sarah@outlook.com", referred_by: first ? affiliate.id : null };
  assert.equal(client.referred_by, "aff_1");
  // 3. Checkout : essai 7 jours -> facture a 0 : aucune commission.
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 0, total_excluding_tax: 0, currency: "eur" }).ok, false);
  // 4. Fin d'essai : invoice.paid 19,95 -> commission 7,98 en attente, payable 30 jours plus tard.
  const self = A.selfReferralReason({ affiliateUserId: affiliate.user_id, customerUserId: client.id, affiliateEmail: affiliate.email, customerEmail: client.email });
  assert.equal(self, null);
  const calc = A.commissionFromInvoice({ status: "paid", amount_paid: 1995, total_excluding_tax: 1995, currency: "eur" });
  const row = { kind: "commission", status: A.affiliateCanEarn(affiliate.status) && !self ? "pending" : "refused", amount_cents: calc.commissionCents, currency: calc.currency, payable_at: A.payableAt("2026-10-10T00:00:00Z") };
  assert.deepEqual([row.status, row.amount_cents, row.payable_at], ["pending", 798, "2026-11-09T00:00:00.000Z"]);
  // 5. Mois suivant : nouvelle facture, nouvelle commission (a vie).
  assert.equal(A.commissionFromInvoice({ status: "paid", amount_paid: 1995, total_excluding_tax: 1995, currency: "eur" }).commissionCents, 798);
  // 6. Remboursement total : reprise de toute la commission.
  assert.equal(A.reversalAmount(798, 1995, 1995), 798);
  // 7. Affilie suspendu : la facture suivante donne une ligne refusee.
  affiliate.status = "suspended";
  assert.equal(A.affiliateCanEarn(affiliate.status) ? "pending" : "refused", "refused");
  // 8. Auto-affiliation : Kevin s'abonne avec un alias de sa propre adresse -> refuse.
  assert.equal(A.selfReferralReason({ affiliateUserId: "u_kevin", customerUserId: "u_kevin2", affiliateEmail: "kevin@gmail.com", customerEmail: "ke.vin+test@gmail.com" }), "self_email");
});

// ---------------------------------------------------------------------------
// 3) Gardes statiques
// ---------------------------------------------------------------------------
test("webhook : empreinte de carte a chaque abonnement, commission sur invoice.paid (jamais payment_failed), reprise sur remboursement et contestation, jamais bloquant", () => {
  const hook = read("supabase/functions/stripe-webhook/index.ts");
  assert.match(hook, /import \{ recordCardAndGuardTrial, recordCommission, reverseCommission \} from "\.\/affiliation-hooks\.ts";/);
  assert.match(hook, /const uid = await applySubscription\(sub, false\);\s*\n\s*\/\/[^\n]*\n\s*await recordCardAndGuardTrial\(hooks, sub, uid\);/, "checkout.session.completed");
  assert.match(hook, /if \(event\.type !== "customer\.subscription\.deleted"\) await recordCardAndGuardTrial\(hooks, sub, uid\);/);
  assert.match(hook, /if \(event\.type !== "invoice\.payment_failed"\) await recordCommission\(hooks, invoice, sub, uid\);/);
  assert.match(hook, /case "charge\.refunded":\s*\n\s*case "charge\.dispute\.created":/);
  const hooks = read("supabase/functions/stripe-webhook/affiliation-hooks.ts");
  assert.match(hooks, /trial_end: "now"/);
  assert.match(hooks, /trial_cut_reason: "card_already_used"/);
  assert.match(hooks, /card\?\.fingerprint/);
  assert.doesNotMatch(hooks, /last4|exp_month|exp_year|card\.number/, "jamais le numero de carte");
  assert.match(hooks, /from\("users"\)\.select\("referred_by,email"\)/, "source de verite : users.referred_by");
  assert.match(hooks, /error\.code === "23505"/, "unique par facture : re-essai Stripe ignore");
  // Chaque crochet attrape ses erreurs : un detail du programme ne bloque jamais l'acces Pro.
  for (const fn of ["recordCardAndGuardTrial", "recordCommission", "reverseCommission"]) {
    const body = hooks.slice(hooks.indexOf("export async function " + fn));
    assert.match(body.slice(0, body.indexOf("\n}\n")), /\} catch \(err\) \{\s*\n\s*fail\(/, fn + " non bloquant");
  }
});

test("checkout : code saisi pris seulement si referred_by est vide, jamais un parrain change ; affilie dans les metadata session ET abonnement", () => {
  const idx = read("supabase/functions/create-checkout-session/index.ts");
  assert.match(idx, /requestedRef = body\?\.ref;/);
  assert.match(idx, /if \(codeSaisi && !me\?\.referred_by\) \{\s*\n\s*const \{ data: attach \} = await supabaseAuth\.rpc\("affiliate_attach_referral", \{ p_code: codeSaisi \}\);/);
  assert.match(idx, /Object\.assign\(baseSession\.metadata, affiliateMeta\);\s*\n\s*Object\.assign\(baseSession\.subscription_data\.metadata, affiliateMeta\);/);
  assert.ok(idx.indexOf("Object.assign(baseSession.metadata, affiliateMeta)") < idx.indexOf("stripe.checkout.sessions.create"), "avant la creation de la session");
  assert.doesNotMatch(idx, /update\(\{ referred_by/, "le checkout n'ecrit jamais referred_by directement");
  // Page d'abonnement : champ facultatif, envoye seulement s'il est valide.
  const page = read("abonnement-page.js");
  assert.match(page, /var ref=codePartenaire\(\);if\(ref\)body\.ref=ref;/);
  assert.match(page, /rpc\('affiliate_code_exists',\{p_code:v\}\)/);
  assert.match(read("abonnement.html"), /<details id="refCodeBox" class="ref-code" data-market-open-if="pro">/);
  assert.ok(read("abonnement.html").indexOf('id="refCodeBox"') < read("abonnement.html").indexOf('id="checkoutConsent"'));
});

test("suivi du lien : ?ref= premier clic gagnant, 60 jours, cookie + localStorage ; inscription transmet le code ; clic compte apres la page vue", () => {
  const ft = read("funnel-track.js");
  assert.match(ft, /var AFFILIATE_DAYS = 60;/);
  assert.match(ft, /var AFFILIATE_COOKIE = "iashark_ref";/);
  assert.match(ft, /first: cur\.first \|\| code,/, "premier clic gagnant");
  assert.match(ft, /if \(!\(age >= 0 && age <= AFFILIATE_DAYS\)\) \{\s*\n\s*cur = \{\};\s*\n\s*try \{ localStorage\.removeItem\(AFFILIATE_KEY\); \} catch \(e\) \{\}/, "expiration a 60 jours, memoire effacee");
  assert.match(ft, /Max-Age=" \+ \(AFFILIATE_DAYS \* 86400\)/);
  assert.match(ft, /rest\/v1\/rpc\/affiliate_track_click/);
  assert.ok(ft.indexOf('window.iasharkTrack("page_view", pageViewMeta);') < ft.indexOf("sendAffiliateClick();"), "clic apres la page vue");
  const auth = read("auth-pages.js");
  assert.match(auth, /if \(aff && aff\.first\) data\.referred_by = aff\.first;/);
});

test("suivi du lien (navigateur simule) : premier code garde, second ignore, code expire remplace, cookie restaure, clic compte apres la page vue", () => {
  const vm = require("node:vm");
  const src = read("funnel-track.js");
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  function run(search, local, cookie) {
    const store = Object.assign({}, local || {});
    const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sent = [];
    const document = { cookie: cookie || "", referrer: "", visibilityState: "visible", documentElement: { scrollHeight: 0, clientHeight: 0, scrollTop: 0 }, body: { scrollHeight: 0 }, addEventListener() {} };
    const ctx = {
      location: { hostname: "iashark.com", pathname: "/fr/", search, origin: "https://iashark.com", href: "https://iashark.com/fr/" + search, protocol: "https:" },
      navigator: { userAgent: "Mozilla/5.0 (iPhone) Safari", language: "fr-FR", maxTouchPoints: 5, webdriver: false }, screen: { width: 390 }, innerHeight: 800, pageYOffset: 0,
      document, sessionStorage: storage, localStorage: storage, URL, URLSearchParams, Date, Math, JSON, String, parseInt,
      Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Europe/Paris" }) }) },
      setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
      fetch: (url, opts) => { if (url === "/api/geo") return Promise.resolve({ ok: false }); sent.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); },
      addEventListener() {},
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { aff: JSON.parse(store.iashark_affiliate || "null"), cookie: document.cookie, api: ctx.iasharkAffiliate(), sent };
  }
  const a = run("?ref=kevin23", {}, "");
  assert.deepEqual([a.aff.first, a.aff.first_d, a.aff.last], ["KEVIN23", day(0), "KEVIN23"]);
  assert.equal(a.cookie, "iashark_ref=KEVIN23%7C" + day(0) + "; Max-Age=5184000; Path=/; SameSite=Lax; Secure");
  // Le clic est compte (RPC), apres la page vue, avec le code et la visite.
  const pv = a.sent.findIndex((s) => s.body && s.body.event_type === "page_view");
  const click = a.sent.findIndex((s) => /rpc\/affiliate_track_click$/.test(s.url));
  assert.ok(pv !== -1 && click > pv, "clic apres la page vue");
  assert.deepEqual([a.sent[click].body.p_code, a.sent[click].body.p_dir], ["KEVIN23", "fr"]);
  // Second lien 10 jours plus tard : le premier reste gagnant (premier clic).
  const old = { first: "KEVIN23", first_d: day(10), last: "KEVIN23", last_d: day(10) };
  const b = run("?ref=SARAH", { iashark_affiliate: JSON.stringify(old) }, "iashark_ref=KEVIN23%7C" + day(10));
  assert.deepEqual([b.aff.first, b.aff.last, b.api.first], ["KEVIN23", "SARAH", "KEVIN23"]);
  // Plus de 60 jours : le premier a expire, le nouveau prend sa place.
  const expired = { first: "KEVIN23", first_d: day(61), last: "KEVIN23", last_d: day(61) };
  const c = run("?ref=SARAH", { iashark_affiliate: JSON.stringify(expired) }, "");
  assert.deepEqual([c.aff.first, c.aff.first_d], ["SARAH", day(0)]);
  // Expire et aucun nouveau lien : plus rien.
  assert.equal(run("", { iashark_affiliate: JSON.stringify(expired) }, "").api, null);
  // localStorage efface, cookie encore la : restaure, sans compter un clic.
  const d = run("", {}, "iashark_ref=KEVIN23%7C" + day(20));
  assert.deepEqual([d.aff.first, d.aff.first_d, d.api.first], ["KEVIN23", day(20), "KEVIN23"]);
  assert.ok(!d.sent.some((s) => /affiliate_track_click/.test(s.url)), "pas de clic sans ?ref=");
  // Rien nulle part : rien.
  assert.equal(run("", {}, "").aff, null);
});

test("migration 0050 : tables, referred_by fige, journal immuable, RLS, RPC ; 0051 : versement le 5 du mois", () => {
  const sql = read("supabase/migrations/0050_affiliation.sql");
  assert.match(sql, /^-- IASHARK — Programme de partenaires/);
  assert.match(sql, /NON APPLIQUEE/);
  for (const t of ["affiliates", "affiliate_clicks", "affiliate_commissions", "affiliate_payouts", "affiliate_ledger", "card_fingerprints"]) {
    assert.match(sql, new RegExp("create table if not exists public\\." + t + " \\("), t);
    assert.match(sql, new RegExp("alter table public\\." + t + " enable row level security;"), t + " RLS");
  }
  assert.match(sql, /alter table public\.users add column if not exists referred_by uuid references public\.affiliates\(id\)/);
  assert.match(sql, /raise exception 'referred_by est fige une fois pose'/);
  assert.match(sql, /raise exception 'journal des commissions : suppression interdite'/);
  assert.match(sql, /raise exception 'journal des commissions : montants et liens immuables'/);
  assert.match(sql, /\(old\.status = 'pending' and new\.status in \('payable', 'reversed', 'refused'\)\)/);
  assert.match(sql, /\(old\.status = 'payable' and new\.status in \('paid', 'reversed', 'refused'\)\)/);
  assert.match(sql, /create unique index if not exists affiliate_commissions_invoice_idx/, "une commission par facture");
  assert.match(sql, /rate_bp integer not null default 4000/);
  assert.match(sql, /trial_cut_reason in \('card_already_used'\)/);
  assert.match(sql, /unique \(fingerprint, stripe_subscription_id\)/);
  assert.doesNotMatch(sql, /last4|card_number|pan\b/i, "jamais le numero de carte");
  // Auto-affiliation refusee des l'attribution (compte, e-mail normalise) ; affilie valide seulement.
  assert.match(sql, /if a\.status <> 'approved' then return 'affiliate_not_active'; end if;/);
  assert.match(sql, /if a\.user_id = p_user then return 'self_account'; end if;/);
  assert.match(sql, /return 'self_email'/);
  assert.match(sql, /if u\.referred_by is not null then return 'already_referred'; end if;/);
  // Maturite : 30 jours ET affilie valide (suspendu = rien).
  assert.match(sql, /a\.status = 'approved' and c\.status = 'pending' and c\.payable_at is not null and c\.payable_at <= now\(\)/);
  // Suspension / refus : commissions en attente ou payables -> refusees.
  assert.match(sql, /set status = 'refused', reason = 'affiliate_' \|\| p_status\s*\n\s*where affiliate_id = p_id and status in \('pending', 'payable'\)/);
  // Droits : rien en ecriture depuis le navigateur ; RPC admin derriere admin_is_admin().
  assert.match(sql, /revoke insert, update, delete on public\.affiliate_commissions from authenticated;/);
  assert.match(sql, /revoke all on public\.card_fingerprints from anon, authenticated;/);
  for (const fn of ["admin_affiliates", "admin_affiliate_set_status", "admin_affiliate_commissions", "admin_affiliate_mark_paid"]) {
    const start = sql.indexOf("create or replace function public." + fn + "(");
    assert.ok(start > 0, fn);
    assert.match(sql.slice(start, start + 1200), /if not public\.admin_is_admin\(\) then raise exception 'access_denied'/, fn + " garde admin");
  }
  for (const fn of ["affiliate_apply(jsonb)", "affiliate_me()", "affiliate_dashboard()", "affiliate_attach_referral(text)"]) {
    assert.match(sql, new RegExp("grant execute on function public\\." + fn.replace(/[()]/g, "\\$&") + " to authenticated;"), fn);
  }
  assert.match(sql, /grant execute on function public\.affiliate_track_click\(text, text, text\) to anon, authenticated;/);
  assert.match(sql, /md5\(p_session\)/, "session hachee, jamais stockee en clair");
  const cron = read("supabase/migrations/0051_schedule_affiliate_payouts.sql");
  assert.match(cron, /cron\.schedule\(\s*\n\s*'affiliate-payouts',\s*\n\s*'0 9 5 \* \*'/);
  assert.match(cron, /functions\/v1\/affiliate-payouts/);
  assert.match(cron, /email_internal_secret/);
});

test("versements : Connect Express (identite verifiee par Stripe) sinon mode manuel ; seuil 50 ; idempotence par affilie, devise et mois", () => {
  const pay = read("supabase/functions/affiliate-payouts/index.ts");
  assert.match(pay, /const CONNECT_ON = \(Deno\.env\.get\("AFFILIATE_CONNECT"\) \|\| ""\)\.toLowerCase\(\) === "on";/);
  assert.match(pay, /supabase\.rpc\("affiliate_mature_commissions"\)/);
  assert.match(pay, /payoutBatches\(/);
  assert.match(pay, /idempotencyKey: "aff-payout-" \+ b\.affiliate_id \+ "-" \+ b\.currency \+ "-" \+ period/);
  assert.match(pay, /reason: !CONNECT_ON \? "connect_off" : !a\?\.stripe_account_id \? "no_stripe_account" : "account_not_ready"/);
  assert.match(pay, /safeEqual\(secret, INTERNAL_SECRET\)/);
  const connect = read("supabase/functions/affiliate-connect/index.ts");
  assert.match(connect, /type: "express"/);
  assert.match(connect, /capabilities: \{ transfers: \{ requested: true \} \}/);
  assert.match(connect, /type: "account_onboarding"/);
  assert.match(connect, /if \(aff\.status !== "approved"\) return json\(200, \{ ok: true, processed: false, reason: "affiliate_not_active"/);
  assert.match(connect, /reason: "connect_not_enabled", payout_mode: "manual"/);
  // Admin : export CSV + « Marquer paye » (mode manuel) + lancement des virements.
  const adm = read("admin-dashboard.js");
  assert.match(adm, /rpc\("admin_affiliate_mark_paid", \{ p_affiliate_id: id, p_currency: cur, p_reference: ref \}\)/);
  assert.match(adm, /a\.download = "iashark-partenaires-" \+ \(d\.month \|\| AFF\.month\) \+ "\.csv";/);
  assert.match(adm, /sb\.functions\.invoke\("affiliate-payouts", \{ body: \{\} \}\)/);
  for (const st of ["approved", "refused", "suspended"]) assert.match(adm, new RegExp('b\\("' + st + '", '), "bouton " + st);
  const html = read("admin.html");
  for (const id of ["partenaires", "affList", "affDue", "affLines", "affExport", "affRunPayouts", "affMonth"]) assert.match(html, new RegExp('id="' + id + '"'), id);
});

test("pages : partenaires (7 langues, telephone d'abord), conditions, succes (essai coupe), compte ; liens formation et kit ; aucune mise ni promesse de gain", () => {
  const page = read("partenaires.html");
  assert.match(page, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(page, /id="partnerApp"/);
  assert.match(page, /data-i18n="affiliation\.title"/);
  assert.match(page, /qrcode-generator\/1\.4\.4\/qrcode\.min\.js/);
  const js = read("partenaires-page.js");
  for (const rpc of ["affiliate_me", "affiliate_dashboard", "affiliate_apply"]) assert.match(js, new RegExp("sb\\.rpc\\('" + rpc + "'"), rpc);
  assert.match(js, /functions\/v1\/affiliate-connect/);
  assert.match(js, /lien\('partenaires-formation\.html'\)/);
  assert.match(js, /lien\('partenaires-kit\.html'\)/);
  assert.match(js, /accept_terms: g\('paTerms'\)\.checked === true,\s*\n\s*accept_rules: g\('paRules'\)\.checked === true,/);
  assert.match(js, /me\.status === 'pending'/);
  assert.match(js, /me\.status === 'refused' \|\| me\.status === 'suspended'/);
  const terms = read("partenaires-conditions.html");
  for (const k of ["a2_box", "a3_p1", "a4_p1", "a5_l1", "a5_l2", "a5_l3", "a5_l5", "a6_p", "a7_p1"]) assert.match(terms, new RegExp('data-i18n="affiliation\\.terms\\.' + k + '"'), k);
  assert.match(read("checkout-succes.html"), /id="essaiCoupe"/);
  assert.match(read("checkout-succes.html"), /abo\.trial_cut_reason==='card_already_used'/);
  assert.match(read("account-page.js"), /\{ id: 'partenaires', titre: 'Partenaires', rendu: partenaires \}/);
  // Enregistrement de la page dans le generateur GEO et le routeur i18n.
  assert.match(read("scripts/i18n-manifest.js"), /\{file: "partenaires\.html"\},\s*\n\s*\{file: "partenaires-conditions\.html", noSitemap: true\}/);
  assert.match(read("i18n/i18n.js"), /"partenaires\.html","partenaires-conditions\.html"/);
  for (const d of PUBLIC_DIRS) {
    assert.ok(fs.existsSync(path.join(ROOT, d, "partenaires.html")), d + "/partenaires.html genere");
    assert.ok(fs.existsSync(path.join(ROOT, d, "partenaires-conditions.html")), d + "/partenaires-conditions.html genere");
  }
  // Dictionnaires : memes cles dans les 7 langues, 40 %, un seul niveau, 30 jours, 50, regles de communication.
  const flat = (o, p) => Object.keys(o).sort().flatMap((k) => (o[k] && typeof o[k] === "object" ? flat(o[k], p + k + ".") : [p + k]));
  const ref = flat(DICTS.fr.affiliation, "");
  assert.ok(ref.length > 120);
  for (const l of LOCALES) {
    const a = DICTS[l].affiliation;
    assert.deepEqual(flat(a, ""), ref, l + " : memes cles que fr");
    const all = JSON.stringify(a);
    assert.match(all, /40 ?%/, l + " : 40 %");
    assert.match(a.terms.a4_p1, /30/, l + " : 30 jours");
    assert.match(a.terms.a4_p1, /50/, l + " : seuil 50");
    assert.match(a.terms.a5_l2, /18/, l + " : 18 ans");
    assert.match(a.terms.a2_p2, /\w/, l + " : un seul niveau");
    assert.ok(DICTS[l].geo.meta.partenaires.title && DICTS[l].geo.meta["partenaires-conditions"].title, l + " : titres des pages");
    // Jamais de mise, d'unite, de capital, d'esperance ; aucune promesse de gain ; pas de « jouer comporte des risques ».
    assert.doesNotMatch(all, /\bmise\b|\bmises\b|\bunit[ée]s? de mise|\bcapital\b|esp[ée]rance|\bstake\b|\bbankroll\b|jouer comporte des risques/i, l + " : mots interdits");
    assert.doesNotMatch(all, /gain garanti|guaranteed (win|profit)|ganancias? garantizad|garantierte gewinn|vincit[ae] garantit|ganhos? garantid/i, l + " : promesse de gain");
    assert.doesNotMatch(all, /\bANJ\b|Gambling Commission|\bARJEL\b/i, l + " : aucun regulateur hors pages legales");
  }
});
