"use strict";
// Haut de « Mon compte » d'un compte gratuit (lib/activation-compte.js, 27/10/2026) :
// match offert = meme source que l'accueil, date du premier prelevement calculee,
// bouton avant la case obligatoire, lien Telegram, textes dans les 7 langues.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const A = require("../lib/activation-compte.js");
const MT = require("../lib/match-time.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("date du premier prelevement : maintenant + jours d'essai, jour et mois en toutes lettres", () => {
  const now = Date.parse("2026-10-27T09:00:00Z");
  assert.equal(A.datePremierPrelevement(now, 7, "fr-FR", "Europe/Paris"), "3 novembre");
  assert.equal(A.datePremierPrelevement(now, 7, "es-ES", "Europe/Paris"), "3 de noviembre");
  assert.match(A.datePremierPrelevement(now, 7, "en-US", "Europe/Paris"), /November 3/);
  // Changement d'heure (25/10/2026) : la date est celle de l'instant reel de fin d'essai
  // (Stripe : + 7 x 24 h) ; inscrit le 25/10 a 00 h 30, l'essai finit le 31/10 a 23 h 30.
  assert.equal(A.datePremierPrelevement(Date.parse("2026-10-24T22:30:00Z"), 7, "fr-FR", "Europe/Paris"), "31 octobre");
  assert.equal(A.datePremierPrelevement(now, 0, "fr-FR"), null, "pas d'essai : pas de date");
  assert.equal(A.datePremierPrelevement(NaN, 7, "fr-FR"), null);
});

test("zero dans la devise du marche, sans decimales", () => {
  assert.equal(A.zero("EUR", "fr-FR").replace(/\s/g, " "), "0 €");
  assert.equal(A.zero("USD", "en-US"), "$0");
  assert.equal(A.zero("GBP", "en-GB"), "£0");
});

test("ligne du match offert : aujourd'hui, demain ou plus tard ; noms echappes", () => {
  const m = { id: 1550174, home: { n: "Sassuolo" }, away: { n: "Lazio" }, date: "2026-10-27 18:30" };
  const horloge = { day: "2026-10-27", tomorrow: "2026-10-28" };
  const i = A.infosMatch(m, MT, horloge, "fr-FR");
  assert.equal(i.quand, "today");
  assert.equal(i.equipes, "Sassuolo – Lazio");
  assert.equal(A.infosMatch(Object.assign({}, m, { date: "2026-10-28 20:45" }), MT, horloge, "fr-FR").quand, "tomorrow");
  assert.equal(A.infosMatch(Object.assign({}, m, { date: "2026-10-30 20:45" }), MT, horloge, "fr-FR").quand, "later");
  assert.equal(A.infosMatch(null, MT, horloge, "fr-FR"), null, "aucun match designe : aucune ligne");
  const h = A.htmlMatch(i, "/fr/match.html?id=1550174");
  assert.match(h, /Ton match offert d’aujourd’hui/);
  assert.match(h, /href="\/fr\/match\.html\?id=1550174"/);
  assert.match(h, /Sassuolo – Lazio/);
  const evil = A.htmlMatch(Object.assign({}, i, { equipes: "<b>A</b> – B" }), "/x");
  assert.ok(evil.includes("&lt;b&gt;A&lt;/b&gt;") && !evil.includes("<b>A</b>"));
});

test("offre : bouton « Essayer 7 jours : 0 € aujourd'hui » AVANT la case obligatoire, date du premier prelevement juste dessous", () => {
  const h = A.htmlOffre({ essai: { jours: 7, prixMois: "14,99 €", zero: "0 €", date: "3 novembre" }, autres: ["4,99 € la semaine", "99 € l’an"], avantages: [["chart-column", "Tous les matchs du jour"]] });
  assert.ok(h.includes("Essayer 7 jours : 0 € aujourd’hui"));
  assert.ok(h.includes("Premier prélèvement : 14,99 € le 3 novembre, seulement si tu ne résilies pas avant. Résiliation en ligne depuis Mon compte."));
  assert.ok(h.indexOf('id="souscrire"') < h.indexOf("Premier prélèvement") && h.indexOf("Premier prélèvement") < h.indexOf('id="checkoutConsent"'));
  assert.match(h, /id="checkoutConsent" hidden/, "la case s'ouvre au premier toucher");
  assert.ok(h.includes("Autres durées : 4,99 € la semaine ou 99 € l’an"));
  const sans = A.htmlOffre({ essai: null, prixMois: "14,99 €" });
  assert.ok(!/essai|Essayer|0 €/.test(sans), "ancien abonne ou essai ferme : jamais d'essai annonce");
  assert.ok(sans.includes("Pro : 14,99 € par mois, sans engagement.") && sans.includes('href="#abonnement"'));
  for (const s of [h, sans]) {
    assert.doesNotMatch(s, /\bgain|gagn|mise\b|garanti|esp[ée]rance|derni[eè]re chance|offre limit|%/i);
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  }
});

test("Telegram : le robot ne relie que les comptes Pro, donc lien du canal gratuit ; langue precisee hors francais", () => {
  assert.equal(A.ROBOT_RELIE_LES_GRATUITS, false);
  assert.equal(A.lienTelegram(), "https://t.me/+qCEr2JFPDDBlZTFk");
  assert.match(read("bottom-navigation.js"), /t\.me\/\+qCEr2JFPDDBlZTFk/, "meme canal que la bulle du site");
  assert.ok(A.htmlTelegram(true).includes("Recevoir le match offert chaque matin sur Telegram") && !A.htmlTelegram(true).includes("(en français)"));
  assert.ok(A.htmlTelegram(false).includes("(en français)"));
});

test("Mon compte : meme source que l'accueil (data-home.json + lib/free-match.js), jamais un match ecrit en dur ; gratuit seulement", () => {
  const page = read("account-page.js");
  assert.match(page, /fetch\('\/data-home\.json'/);
  assert.match(page, /FM\.pickFreeMatch\(liste, null, \(mk && mk\.code\) \|\| null\)/);
  assert.match(page, /lien\('match\.html\?id=' \+ encodeURIComponent\(info\.id\)\)/, "meme lien que index.html#lienMatch");
  assert.match(read("index.html"), /function lienMatch\(m\)\{return lien\('match\.html\?id='\+encodeURIComponent\(m\.id\)\);\}/);
  assert.match(page, /t === 'free' && window\.IasharkActivationCompte \? '<div id="activation"/);
  assert.match(page, /jours > 0 && !abo/, "essai seulement pour un compte qui n'a jamais eu d'abonnement");
  for (const f of ["compte.html", "fr/compte.html", "en/compte.html", "es/compte.html", "gb/compte.html", "mx/compte.html", "za/compte.html"]) {
    const html = read(f);
    assert.ok(html.indexOf("/lib/free-match.js") !== -1 && html.indexOf("/lib/activation-compte.js") < html.indexOf("/account-page.js"), f);
  }
});

test("textes du bloc dans les 7 langues (meme cles), tutoiement en francais", () => {
  const ref = Object.keys(JSON.parse(read("i18n/dict/fr.json")).compte_page.activation).sort();
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + loc + ".json")).compte_page.activation;
    assert.deepEqual(Object.keys(d).sort(), ref, loc);
    const part = JSON.parse(read("i18n/parts/compte-activation." + loc + ".json")).compte_page.activation;
    assert.deepEqual(part, d, loc + " : dictionnaire = part (scripts/merge-i18n-parts.js)");
    assert.match(d.trial_cta, /\{n\}/);
    assert.match(d.trial_cta, /\{zero\}/);
    assert.match(d.first_charge, /\{price\}/);
    assert.match(d.first_charge, /\{date\}/);
  }
  const fr = JSON.parse(read("i18n/dict/fr.json")).compte_page;
  assert.doesNotMatch(JSON.stringify(fr.activation), /\bvous\b|\bvotre\b/i);
  assert.equal(fr.msg_welcome_account_created, "Bienvenue. Ton compte gratuit est créé.");
});
