"use strict";
// Essai gratuit de 7 jours remis le 02/10/2026 (decision de Clement) :
// - Stripe Checkout : 7 jours, carte demandee, 0 EUR avant le 8e jour ;
// - un seul essai par personne, decide cote serveur (trial.ts#trialForAccount) :
//   nouveau compte ou compte gratuit jamais abonne = essai ; ancien abonne ou
//   ancien essai (base OU client Stripe de la meme adresse) = paiement direct ;
//   abonne actif, en essai ou en impaye = aucun nouvel abonnement ;
// - statut Stripe "trialing" = Pro ; premier prelevement refuse apres l'essai
//   = acces coupe (pas de periode gratuite de plus) ;
// - annonce de la page d'abonnement dans la langue de la page.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const trialMod = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/trial.ts")).href);
const DICTS = Object.fromEntries(["fr", "en", "es", "es-mx", "de", "it", "pt"].map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));

test("Checkout : 7 jours par defaut, carte demandee, rien preleve avant la fin, arret si la carte manque", async () => {
  const t = await trialMod();
  const days = t.trialDays(() => undefined);
  assert.equal(days, 7, "TRIAL_DAYS absent = 7 jours");
  assert.equal(t.trialDays(() => "0"), 0, "TRIAL_DAYS = 0 recoupe l'essai");
  const p = t.trialSessionParams(days, { market: "fr", plan: "pro", interval: "month" });
  assert.equal(p.payment_method_collection, "always");
  assert.equal(p.subscription_data.trial_period_days, 7);
  assert.equal(p.subscription_data.trial_settings.end_behavior.missing_payment_method, "cancel");
  assert.equal(p.subscription_data.metadata.trial_days, "7");
  assert.equal(p.subscription_data.metadata.interval, "month", "metadata de l'abonnement conservees");
  // Branchement : parametres de l'essai poses sur la session, avant sa creation.
  const idx = read("supabase/functions/create-checkout-session/index.ts");
  const at = (s) => idx.indexOf(s);
  assert.ok(at("trialSessionParams(trial.days") > 0 && at("trialSessionParams(trial.days") < at("stripe.checkout.sessions.create"));
  assert.match(idx, /payment_method_collection: tp\.payment_method_collection, subscription_data: tp\.subscription_data/);
  // Disponibilites : la page apprend du serveur combien de jours annoncer.
  assert.match(idx, /mode: "availability", intervals: availability\(getEnv, requestedMarket\), trial_days: trialDays\(getEnv\)/);
});

test("Un seul essai par personne (cas 1 a 5) : nouveau / gratuit jamais abonne = essai ; ancien abonne = paiement direct ; abonne actif ou impaye = rien", async () => {
  const t = await trialMod();
  const d = (statuses, stripeHasHistory = false) => t.trialForAccount({ days: 7, interval: "month", statuses, stripeHasHistory });
  // Cas 1 et 2 : nouveau compte, ou compte gratuit qui n'a jamais ete abonne ni en essai.
  assert.deepEqual(d([]), { trial: true, days: 7 });
  // Cas 3 : ancien abonne (meme annule), ancien essai, abonnement jamais finalise.
  for (const s of [["canceled"], ["unpaid"], ["incomplete_expired"], ["canceled", "canceled"]]) {
    assert.deepEqual(d(s), { trial: false, reason: "already_had_subscription" }, s.join());
  }
  // Cas 3 bis : compte supprime puis recree avec la meme adresse (plus aucune ligne en base) :
  // le client Stripe garde l'historique.
  assert.deepEqual(d([], true), { trial: false, reason: "already_had_subscription" });
  // Lecture impossible = jamais d'essai par erreur.
  assert.equal(d(null).trial, false);
  // Cas 4 et 5 : abonne actif, en essai, ou en impaye : ni essai ni second abonnement.
  for (const s of [["active"], ["trialing"], ["past_due"], ["canceled", "active"]]) {
    assert.deepEqual(d(s), { trial: false, reason: "already_subscribed" }, s.join());
  }
  // Essai coupe (TRIAL_DAYS = 0) : personne n'en a.
  assert.equal(t.trialForAccount({ days: 0, interval: "month", statuses: [], stripeHasHistory: false }).trial, false);

  // Cote serveur : la decision vient de la base (toutes les lignes du compte, sous RLS)
  // puis de Stripe (meme adresse), jamais du navigateur ; refus avant toute session.
  const idx = read("supabase/functions/create-checkout-session/index.ts");
  const at = (s) => idx.indexOf(s);
  assert.match(idx, /\.from\("subscriptions"\)\s*\.select\("status"\)\s*\.eq\("user_id", user\.id\);/);
  assert.ok(at("statuses.some(isLiveStatus)") > at("auth.getUser()") && at('reason: "already_subscribed"') < at("stripe.checkout.sessions.create"));
  assert.match(idx, /stripe\.customers\.list\(\{ email: user\.email, limit: 20 \}\)/);
  assert.match(idx, /stripeHasHistory = true;\n\s*\}/, "lecture Stripe impossible = pas d'essai");
  assert.doesNotMatch(idx, /requestedTrial|body\?\.trial/, "le navigateur ne decide jamais de l'essai");
  // Page d'abonnement : un abonne (cas 4) ou un compte deja abonne ne voit jamais l'essai.
  const page = read("abonnement-page.js");
  assert.match(page, /var ok=ANNONCE_ESSAI&&!essai\.pro&&essai\.offreOuverte&&essai\.serveur>0&&essai\.compte===true&&DUREES_ESSAI\.indexOf\(dureeChoisie\(\)\)!==-1;/);
  assert.match(page, /fin\(!r\.error&&r\.count===0\)/);
  // Compte en impaye (cas 5) : « Mettre à jour ma carte » (portail Stripe).
  const compte = read("account-page.js");
  assert.match(compte, /function impaye\(\) \{ return !!abo && \(abo\.status === 'past_due' \|\| abo\.status === 'unpaid'\); \}/);
  assert.match(compte, /boutonPrimaire\('portail', impaye\(\) \? tr\('pro_trial\.update_card_cta'/);
  assert.match(compte, /function essaiPossible\(\) \{ return !abo && !aboInconnu && essaiServeur > 0; \}/);
});

test("statut trialing = Pro ; carte refusee au 8e jour = acces coupe, sans tolerance d'impaye", () => {
  const HOOK = read("supabase/functions/stripe-webhook/index.ts");
  const SYNC = read("supabase/functions/sync-subscription/index.ts");
  for (const src of [HOOK, SYNC]) assert.match(src, /const ACTIVE_LIKE_STATUSES = new Set\(\["active", "trialing"\]\);/);
  const slice = (src, start, fn) => {
    const a = src.indexOf(start), b = src.indexOf("\n}\n", src.indexOf("function " + fn + "("));
    assert.ok(a > 0 && b > a, fn);
    return src.slice(a, b + 2);
  };
  const grace = slice(HOOK, "const PAST_DUE_GRACE_DAYS = 4;", "grantsProAccess");
  const unpaid = slice(HOOK, "// Essai termine sans premier paiement", "unpaidAfterTrial");
  assert.equal(unpaid, slice(SYNC, "// Essai termine sans premier paiement", "unpaidAfterTrial"), "copies identiques");
  const js = (grace + "\n" + unpaid)
    .replace(/\((\w+): Stripe\.Subscription, (\w+): string\)/g, "($1, $2)")
    .replace(/ as unknown as Record<string, unknown>( \| undefined)?/g, "")
    .replace(/ as number \| null \| undefined/g, "").replace(/ as number \| undefined/g, "")
    .replace(/(\w+): string \| null/g, "$1").replace(/(\w+): string/g, "$1")
    .replace(/\): (boolean|number) \{/g, ") {");
  const api = new Function("ACTIVE_LIKE_STATUSES", js + "\nreturn { grantsProAccess, unpaidAfterTrial };")(new Set(["active", "trialing"]));
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString();
  assert.equal(api.grantsProAccess("trialing", inAWeek, "month"), true, "essai en cours = Pro");
  assert.equal(api.grantsProAccess("canceled", inAWeek, "month"), false, "essai annule puis termine = gratuit");
  const now = Math.floor(Date.now() / 1000);
  const sub = (start, trialEnd) => ({ trial_end: trialEnd, items: { data: [{ current_period_start: start }] } });
  assert.equal(api.unpaidAfterTrial(sub(now, now), "past_due"), true, "premier prelevement refuse a la fin de l'essai");
  assert.equal(api.unpaidAfterTrial(sub(now, now - 30 * 86400), "past_due"), false, "renouvellement refuse plus tard : tolerance normale");
  assert.equal(api.unpaidAfterTrial(sub(now, null), "past_due"), false, "abonnement sans essai");
  assert.equal(api.unpaidAfterTrial(sub(now, now), "trialing"), false);
  assert.equal(api.unpaidAfterTrial(sub(now, now), "active"), false, "premier paiement passe");
  assert.match(HOOK, /const newPlan = !unpaidAfterTrial\(sub, status\) && grantsProAccess\(status, periodEnd, billing\.billing_interval\) \? "pro" : "free";/);
  assert.match(SYNC, /const plan = !unpaidAfterTrial\(subscription, status\) && grantsProAccess\(status, periodEnd, billing\.billing_interval\) \? "pro" : "free";/);
  // Admin : les essais sont comptes a part et n'entrent pas dans le MRR.
  const rev = read("supabase/functions/admin-revenue/index.ts");
  assert.match(rev, /const trials = \{ in_progress: 0, cancelled: 0, ending_48h: 0/);
  assert.match(rev, /\} else if \(live && !s\.cancel_at_period_end\) mrrByCurrency/);
  assert.match(read("admin-dashboard.js"), /label: "Essais gratuits"/);
});

test("page d'abonnement : annonce de l'essai en francais et en anglais, prix du marche, aucune promesse de gain", () => {
  // Ligne de prix calculee par abonnement-page.js#prixApresEssai (prix MENSUEL de
  // config/markets.json : l'essai ne concerne que l'abonnement mensuel, 02/10/2026).
  const page = read("abonnement-page.js");
  const fn = page.slice(page.indexOf("  function prixApresEssai(){"), page.indexOf("  function majEssai(){"));
  const lib = {}; new Function("window", read("lib/market-config.js"))(lib);
  const headline = (dir, locale, durees) => {
    const dict = DICTS[locale];
    const t = (k, fb) => { const v = k.split(".").reduce((o, p) => (o ? o[p] : undefined), dict); return typeof v === "string" ? v : fb; };
    const win = { IASHARK_MARKET: lib.IasharkMarketConfig.build(dir) };
    const prix = new Function("window", "essai", "t", fn + "\nreturn prixApresEssai();")(win, { durees }, t);
    return prix ? t("essai_mensuel.headline").split("{days}").join("7").split("{price}").join(prix).replace(/[\u00a0\u202f]/g, " ") : "";
  };
  assert.equal(headline("fr", "fr", ["week", "month", "year"]), "7 jours gratuits sur l’abonnement mensuel, puis 19,95 € / mois, annulable en 1 clic");
  assert.equal(headline("gb", "en", ["month"]), "7 days free on the monthly plan, then £14.99 / month, cancel in 1 click");
  assert.equal(headline("fr", "fr", ["week", "year"]), "", "mois non payable : aucune annonce");
  // Pages generees : encart dans la langue de la page.
  assert.match(read("fr/abonnement.html"), /<li data-i18n="pro_trial\.line2">Un e-mail te prévient 2 jours avant la fin de l'essai\.<\/li>/);
  assert.match(read("en/abonnement.html"), /<li data-i18n="pro_trial\.line1">[^<]*nothing is charged for 7 days\.<\/li>/);
  // Compte : « Essai gratuit jusqu'au JJ/MM » dans les 7 langues, memes marqueurs.
  for (const [l, d] of Object.entries(DICTS)) {
    for (const k of ["headline", "until", "until_detail", "update_card_cta", "join_or"]) assert.ok(d.pro_trial[k], l + " : pro_trial." + k);
    assert.match(d.pro_trial.headline, /\{days\}[\s\S]*\{prices\}/, l);
    assert.match(d.pro_trial.until, /\{date\}/, l);
    assert.doesNotMatch(JSON.stringify(d.pro_trial), /gagn|winn|ganan|gewinn|vinc|garanti|guarantee|risque|risk/i, l);
  }
  assert.equal(DICTS.fr.pro_trial.until.split("{date}").join("09/10"), "Essai gratuit jusqu'au 09/10");
  assert.match(read("account-page.js"), /tr\('pro_trial\.until', 'Essai gratuit jusqu’au \{date\}'\)\.split\('\{date\}'\)\.join\(court\)/);
});

test("CGV du 02/10/2026 : article sur l'essai dans les 9 versions (7 jours, rien preleve, rappel, 1 clic, une seule fois)", () => {
  const MARKERS = {
    fr: ["Article 6 bis — Essai gratuit de 7 jours", "aucun montant n'est prélevé pendant l'essai", "une seule fois par personne"],
    en: ["Article 6A — 7-day free trial", "nothing is charged during the trial", "once per person"],
    es: ["Artículo 6 bis — Prueba gratuita de 7 días", "no se cobra ningún importe durante la prueba", "una sola vez por persona"],
    de: ["Artikel 6a — Kostenloser Test über 7 Tage", "während des Tests wird kein Betrag abgebucht", "nur einmal gewährt"],
    it: ["Articolo 6-bis — Prova gratuita di 7 giorni", "durante la prova non viene addebitato alcun importo", "una sola volta per persona"],
    pt: ["Artigo 6.º-A — Teste gratuito de 7 dias", "nenhum montante é cobrado durante o teste", "uma única vez por pessoa"],
    gb: ["6A. 7-day free trial", "nothing is charged during the trial", "once per person"],
    za: ["6A. 7-day free trial", "nothing is charged during the trial", "once per person"],
    mx: ["6 bis. Prueba gratis de 7 días", "no se te cobra nada durante la prueba", "una sola vez por persona"],
  };
  for (const [d, marks] of Object.entries(MARKERS)) {
    const files = ["legal/" + d + "/cgv.html"].concat(fs.existsSync(path.join(ROOT, d + "/cgv.html")) ? [d + "/cgv.html"] : []);
    for (const f of files) {
      const html = read(f);
      for (const m of marks) assert.ok(html.includes(m), f + " : " + m);
      assert.match(html, /\b2\b[^<]{0,40}(jours|days|días|Tage|giorni|dias)/, f + " : rappel 2 jours avant");
      assert.match(html, /1 (clic|click|Klick|clique)/, f + " : annulation en 1 clic");
    }
    // Version precedente archivee, sans l'article.
    const arch = read("legal/" + d + "/archives/cgv-2026-10-01.html");
    assert.ok(!arch.includes(marks[0]), d + " : archive du 01/10 sans l'essai");
  }
});

test("essai sur l'ABONNEMENT MENSUEL seulement (02/10/2026) : semaine et annee payees tout de suite, meme requete bricolee", async () => {
  const t = await trialMod();
  assert.deepEqual(t.TRIAL_INTERVALS, ["month"]);
  const d = (interval) => t.trialForAccount({ days: 7, interval, statuses: [], stripeHasHistory: false });
  assert.deepEqual(d("month"), { trial: true, days: 7 }, "mois : essai");
  for (const iv of ["week", "year", undefined, null, "", "MONTH", "month ", ["month"], { interval: "month" }]) {
    assert.deepEqual(d(iv), { trial: false, reason: "interval_not_eligible" }, "pas d'essai : " + JSON.stringify(iv));
  }
  // Abonne actif : toujours « deja abonne », quelle que soit la duree.
  assert.equal(t.trialForAccount({ days: 7, interval: "week", statuses: ["active"], stripeHasHistory: false }).reason, "already_subscribed");
  // Cote serveur : la duree vient du Price RESOLU (resolvePriceId), jamais d'un champ « trial » du navigateur.
  const idx = read("supabase/functions/create-checkout-session/index.ts");
  assert.match(idx, /trialForAccount\(\{ days: trialDays\(getEnv\), interval: usedInterval, statuses, stripeHasHistory \}\)/);
  assert.match(idx, /const usedInterval = resolution\.interval;/);
  assert.match(idx, /trialDays\(getEnv\) > 0 && trialAllowedForInterval\(usedInterval\) && statuses && statuses\.length === 0/, "pas de lecture Stripe pour une semaine ou une annee");
  // Les parametres d'essai (trial_period_days) ne sont poses que si trial.trial.
  const at = (s) => idx.indexOf(s);
  assert.ok(at("if (trial.trial) {") > 0 && at("if (trial.trial) {") < at("trialSessionParams(trial.days"));
  assert.equal((idx.match(/trial_period_days/g) || []).length, 0, "trial_period_days uniquement via trialSessionParams");
  // Reponse « availability » : l'essai concerne le mois.
  assert.match(idx, /mode: "availability", intervals: availability\(getEnv, requestedMarket\), trial_days: trialDays\(getEnv\), trial_intervals: TRIAL_INTERVALS/);
});

test("page d'abonnement : encart d'essai et bouton d'essai seulement sur le Mois (masques sur Semaine et Annee)", () => {
  const page = read("abonnement-page.js");
  // Simulation de majEssai avec une fausse page.
  const start = page.indexOf("  var ANNONCE_ESSAI=true;"), end = page.indexOf("  function verifierCompteEssai(ctx){");
  const lib = {}; new Function("window", read("lib/market-config.js"))(lib);
  const run = (interval) => {
    const els = { proTrialInfo: { hidden: true, removeAttribute() {} }, proTrialHeadline: { textContent: "", removeAttribute() {} } };
    const button = { textContent: "", setAttribute() {} };
    const document = { getElementById: (id) => els[id] || null };
    const window = { IASHARK_MARKET: lib.IasharkMarketConfig.build("fr") };
    const picker = { interval: () => interval };
    const montrer = (el, v) => { if (el) el.hidden = !v; };
    const t = (k, fb) => fb;
    const api = new Function("document", "window", "picker", "montrer", "t", "button",
      page.slice(start, end) + "\nessai.serveur=7;essai.compte=true;essai.offreOuverte=true;essai.durees=['week','month','year'];majEssai();return {els:els=document,button};")(document, window, picker, montrer, t, button);
    return { box: els.proTrialInfo.hidden, titre: els.proTrialHeadline.textContent, bouton: button.textContent };
  };
  const mois = run("month");
  assert.equal(mois.box, false, "Mois : encart visible");
  assert.equal(mois.bouton, "Commencer l’essai gratuit");
  assert.match(mois.titre.replace(/[  ]/g, " "), /^7 jours gratuits sur l’abonnement mensuel, puis 19,95 € \/ mois, annulable en 1 clic$/);
  for (const iv of ["week", "year"]) {
    const r = run(iv);
    assert.equal(r.box, true, iv + " : encart masque");
    assert.equal(r.bouton, "Devenir Pro", iv + " : bouton « Devenir Pro »");
  }
  // Changement de duree dans la grille : l'encart est recalcule.
  assert.match(page, /onChange:function\(\)\{if\(output\.classList\.contains\('error'\)\)message\('',false\);majEssai\(\);\}/);
  // Compte : meme regle (encart et bouton selon la duree choisie).
  const compte = read("account-page.js");
  assert.match(compte, /function essaiAffiche\(\) \{ return essaiPossible\(\) && dureeChoisie\(\) === 'month'; \}/);
  assert.match(compte, /onChange: majEssaiCompte,/);
});
