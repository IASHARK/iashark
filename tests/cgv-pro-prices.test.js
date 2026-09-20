"use strict";
// CGV des 9 versions (legal/<dir>/cgv.html, recopiees dans /<dir>/cgv.html) :
// prix et valeurs calculees de l'offre Pro identiques a config/markets.json
// (source unique des prix), UNIQUEMENT pour les durees payables en ligne
// (checkoutOpen, decisions du proprietaire du 19/09/2026), ZA sans annuel,
// date de mise a jour = version des CGV envoyee avec le consentement
// (lib/checkout-consent.js), texte en REVIEW (commentaire LEGAL REVIEW, a
// faire relire), franchise en base de TVA (art. 293 B du CGI) dans chaque
// langue, tolerance d'impaye 1 jour hebdo / 4 jours, versions precedentes
// archivees.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const MARKETS = JSON.parse(read("config/markets.json"));
const DIRS = Object.keys(MARKETS._dirs);
const TERMS_VERSION = (read("lib/checkout-consent.js").match(/var TERMS_VERSION = "(\d{4}-\d{2}-\d{2})";/) || [])[1];
// Version propre a un repertoire (lib/checkout-consent.js#TERMS_VERSIONS), sinon la version commune.
const consentLib = (() => { const w = {}; new Function("window", read("lib/checkout-consent.js"))(w); return w.IasharkCheckoutConsent; })();
const versionFor = (d) => consentLib.termsVersionFor(d);
// Durees payables en ligne (config/markets.json#<marche>.checkoutOpen) ; absent = toutes.
const isOpen = (m, iv) => !Array.isArray(m.checkoutOpen) || m.checkoutOpen.includes(iv);
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const dateOf = (html) => ((html.match(/<div class="page-date">([^<]*)<\/div>/) || [])[1] || "").replace(/[  ]/g, " ");
const longDate = (iso, intlLocale) => new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z")).replace(/[  ]/g, " ");

// Montants tels qu'ecrits dans les CGV de chaque langue (sans decimales nulles).
function money(amount, dir, currency) {
  const fixed = Number(amount).toFixed(2).replace(/\.00$/, "");
  if (currency === "EUR") return dir === "en" ? "€" + fixed : fixed.replace(".", ",") + " €";
  if (currency === "GBP") return "£" + fixed;
  if (currency === "MXN") return "MX$" + Number(fixed).toLocaleString("en-US", { minimumFractionDigits: fixed.includes(".") ? 2 : 0 });
  if (currency === "ZAR") return "R" + fixed;
  // USD de /en/ apres config/markets.json#_usdSwitch (prix ecrits par data-market-price).
  if (currency === "USD") return "$" + fixed;
  throw new Error(currency);
}

// Franchise en base de TVA (decision du proprietaire du 19/09/2026), dans la
// langue de chaque version ; plus aucune mention « TTC / VAT included ».
const VAT = {
  fr: /TVA non applicable, article 293 B du CGI\./,
  en: /VAT not applicable, Article 293 B of the French General Tax Code \(CGI\)\./,
  gb: /VAT not applicable, Article 293 B of the French General Tax Code \(CGI\)\./,
  za: /VAT not applicable, Article 293 B of the French General Tax Code \(CGI\)\./,
  es: /IVA no aplicable, artículo 293 B del Código General de Impuestos francés \(CGI\)\./,
  mx: /IVA no aplicable, artículo 293 B del Código General de Impuestos francés \(CGI\)\./,
  de: /Umsatzsteuer nicht anwendbar, Artikel 293 B des französischen Steuergesetzbuchs \(Code général des impôts, CGI\)\./,
  it: /IVA non applicabile, articolo 293 B del Codice generale delle imposte francese \(CGI\)\./,
  pt: /IVA não aplicável, artigo 293 B do Código Geral dos Impostos francês \(CGI\)\./,
};
const TAX_INCLUDED = /\bTTC\b|VAT included|including any applicable taxes|IVA incluid[oa]|impuestos aplicables incluidos|inkl\. MwSt|IVA inclusa|IVA incluído/i;

test("CGV : prix de chaque duree PAYABLE, equivalent mensuel et economie de l'annuel repris de config/markets.json ; duree non payable absente", () => {
  assert.match(TERMS_VERSION || "", /^\d{4}-\d{2}-\d{2}$/);
  for (const d of DIRS) {
    const conf = MARKETS._dirs[d], m = MARKETS[conf.market], pro = m.prices.pro;
    // CGV dont les prix sont ecrits par le build (data-market-price, /en/ depuis
    // l'offre USD du 19/09/2026) : texte de la page generee.
    const src = read("legal/" + d + "/cgv.html");
    const text = visible(/data-market-price=/.test(src) ? read(d + "/cgv.html") : src);
    for (const iv of ["week", "month", "year"]) {
      if (!pro[iv]) continue;
      // 19/09/2026 : seules les durees payables en ligne figurent dans les CGV
      // (ex. /gb/ : mensuel seul, semaine et annee sans Price Stripe).
      if (!isOpen(m, iv)) { assert.ok(!text.includes(money(pro[iv].amount, d, m.currency)), d + " : prix " + iv + " non payable absent des CGV"); continue; }
      assert.ok(text.includes(money(pro[iv].amount, d, m.currency)), d + " : prix " + iv + " " + money(pro[iv].amount, d, m.currency));
    }
    if (pro.year && isOpen(m, "year")) {
      const equiv = Math.ceil(Math.round(pro.year.amount * 100) / 12) / 100;
      const pct = Math.floor((1 - (pro.year.amount * 100) / (pro.month.amount * 1200)) * 100 + 1e-9);
      assert.ok(text.includes(money(equiv, d, m.currency)), d + " : equivalent mensuel " + money(equiv, d, m.currency));
      assert.match(text, new RegExp("\\b" + pct + " ?%"), d + " : economie " + pct + " %");
      assert.ok(text.includes(money(Math.round(pro.month.amount * 1200) / 100, d, m.currency)), d + " : 12 mois au tarif mensuel");
    } else {
      assert.doesNotMatch(text, /\b1[67] ?%/, d + " : aucune economie annuelle sans annuel payable");
    }
    assert.match(read(d + "/cgv.html"), new RegExp(money(pro.month.amount, d, m.currency).replace(/[$.]/g, "\\$&")), d + "/cgv.html : page generee a jour");
    // TVA : franchise en base, aucune mention « TTC / VAT included ».
    assert.match(text, VAT[d], d + " : mention de franchise en base de TVA");
    assert.doesNotMatch(text, TAX_INCLUDED, d + " : plus de « TTC / VAT included »");
  }
  // /en/ : texte ecrit pour l'offre USD (devise nommee) ; toute bascule inverse
  // de config/markets.json#_dirs.en.market doit passer par une reecriture des CGV.
  assert.equal(MARKETS[MARKETS._dirs.en.market].currency, "USD", "CGV /en/ ecrites pour l'offre USD : les reecrire si /en/ change de marche");
  assert.match(visible(read("en/cgv.html")), /Monthly: \$19\.99 per month\. .* Price in US dollars \(USD\)\./);
});

test("CGV ZA : ni prix ni option annuelle au lancement ; tolerance d'impaye par duree dans chaque version", () => {
  const za = visible(read("legal/za/cgv.html"));
  assert.doesNotMatch(za, /R ?1[ ,]?999|Annual \(fixed-term\) plans|12-month term/);
  assert.match(za, /No annual plan is offered at present/);
  assert.match(read("legal/za/cgv.html"), /BLOCKED_DECISION: annual plan not offered in South Africa at launch/);
  // Mensuel seul (/en/ USD, /gb/) : 4 jours, jamais de regle hebdomadaire.
  const GRACE = { fr: /1 jour après la fin de la période payée pour la formule hebdomadaire, et pendant 4 jours/, en: /maintained for 4 days after the end of the paid period;/, gb: /continues for 4 days after the end of the paid period;/, za: /1 day[\s\S]*4 days/, es: /1 día[\s\S]*4 días/, mx: /1 día[\s\S]*4 días/, de: /1 Tag[\s\S]*4 Tage/, it: /1 giorno[\s\S]*4 giorni/, pt: /1 dia[\s\S]*4 dias/ };
  for (const d of DIRS) assert.match(visible(read("legal/" + d + "/cgv.html")), GRACE[d], d + " : tolerance d'impaye");
  for (const d of ["en", "gb"]) assert.doesNotMatch(visible(read("legal/" + d + "/cgv.html")), /1 day|weekly plan/, d + " : aucune regle hebdomadaire");
});

test("CGV : date de mise a jour = version du consentement, texte en REVIEW, durees et reconduction decrites par version, aucune offre Edge", () => {
  for (const d of DIRS) {
    const conf = MARKETS._dirs[d];
    const html = read("legal/" + d + "/cgv.html");
    const expected = longDate(versionFor(d), conf.intlLocale);
    assert.ok(dateOf(html).includes(expected), d + " : date " + dateOf(html) + " / " + expected);
    assert.match(html, /<!-- LEGAL REVIEW: [^>]*16\/09\/2026[^>]*REVIEW/, d + " : statut REVIEW (a faire relire)");
    assert.match(html, /<!-- LEGAL REVIEW: 19\/09\/2026 - [^>]*Status: REVIEW\. -->|<!-- LEGAL REVIEW: 19\/09\/2026 - [^>]*Statut : REVIEW\. -->/, d + " : note de revue du 19/09/2026");
    assert.doesNotMatch(html, /\bEdge\b|annual_edge/, d);
    assert.doesNotMatch(visible(html), /\[TODO|BLOCKED_DECISION/, d + " : aucune note interne visible");
  }
  // Une seule version des CGV le 19/09/2026 (9 versions, pages racine comprises).
  assert.equal(TERMS_VERSION, "2026-09-19");
  for (const d of DIRS.concat([""])) assert.equal(versionFor(d), "2026-09-19", (d || "racine") + " : version des CGV envoyee avec le consentement");

  // FR (et versions EUR) : trois durees payables, conditions de l'annuel et du changement de duree.
  const fr = visible(read("legal/fr/cgv.html"));
  assert.match(fr, /se souscrit au choix pour une période hebdomadaire, mensuelle ou annuelle/);
  assert.match(fr, /au plus tôt trois mois et au plus tard un mois avant l'échéance/);
  assert.match(fr, /Changement de durée\./);
  assert.match(fr, /Un abonnement en cours ne peut pas être souscrit une seconde fois/);
  assert.match(fr, /la version acceptée, la langue, la date et la période choisie sont enregistrées/);
  assert.doesNotMatch(fr, /ne sont pas ouvertes à la souscription/);
  for (const d of ["fr", "es", "de", "it", "pt", "mx"]) {
    assert.match(read("legal/" + d + "/cgv.html"), /<!-- BLOCKED_DECISION: (formule annuelle|annual plan) - /, d + " : remboursement de l'annuel en cours d'annee a trancher");
  }
  assert.match(read("legal/mx/cgv.html"), /<!-- BLOCKED_DECISION: weekly plan notice 2 days before each charge/);
  // /gb/ et /en/ : mensuel seul, aucune clause propre a la semaine ou a l'annee.
  const gb = visible(read("legal/gb/cgv.html"));
  assert.match(gb, /Pro is paid monthly ; no weekly or annual plan is offered at present\./);
  assert.doesNotMatch(gb, /At least 30 days before your annual subscription renews|Changing billing period|£4\.99|£149|week, month or year/);
  const en = visible(read("legal/en/cgv.html"));
  assert.match(en, /No weekly or annual plan is offered on this version of the site\./);
  assert.doesNotMatch(en, /Annual plan|Changing billing period|week, month or year|weekly \/ monthly \/ annual|L215-1/);
  assert.match(visible(read("legal/mx/cgv.html")), /plan anual, 30 días y 7 días antes; plan mensual, 7 días antes; plan semanal, 2 días antes/);
});

test("CGV : versions precedentes archivees (non publiees), chacune a la date de son nom", () => {
  const ARCHIVES = { fr: ["2026-09-16", "2026-09-18"] };
  for (const d of DIRS) {
    for (const date of ARCHIVES[d] || ["2026-09-16"]) {
      const f = "legal/" + d + "/archives/cgv-" + date + ".html";
      assert.ok(fs.existsSync(path.join(ROOT, f)), f + " absente");
      const html = read(f);
      assert.ok(dateOf(html).includes(longDate(date, MARKETS._dirs[d].intlLocale)), f + " : date " + dateOf(html));
      assert.notEqual(html, read("legal/" + d + "/cgv.html"), f + " : identique a la version en vigueur");
    }
  }
  // legal/ n'est jamais publie (scripts/build-public.js), archives comprises.
  assert.match(read("scripts/build-public.js"), /const FORBIDDEN = \/\^\([^)]*\blegal\b[^)]*\)\\\//);
});
