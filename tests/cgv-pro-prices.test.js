"use strict";
// CGV des 9 versions (legal/<dir>/cgv.html, recopiees dans /<dir>/cgv.html) :
// prix et valeurs calculees de l'offre Pro identiques a config/markets.json
// (source unique des prix), ZA sans annuel au lancement, date de mise a jour =
// TERMS_VERSION (lib/checkout-consent.js), texte en REVIEW (commentaire
// LEGAL REVIEW, a faire relire), tolerance d'impaye 1 jour hebdo / 4 jours.
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

// Montants tels qu'ecrits dans les CGV de chaque langue (sans decimales nulles).
function money(amount, dir, currency) {
  const fixed = Number(amount).toFixed(2).replace(/\.00$/, "");
  if (currency === "EUR") return dir === "en" ? "€" + fixed : fixed.replace(".", ",") + " €";
  if (currency === "GBP") return "£" + fixed;
  if (currency === "MXN") return "MX$" + Number(fixed).toLocaleString("en-US", { minimumFractionDigits: fixed.includes(".") ? 2 : 0 });
  if (currency === "ZAR") return "R" + fixed;
  throw new Error(currency);
}

test("CGV : prix de chaque duree vendue, equivalent mensuel et economie de l'annuel repris de config/markets.json", () => {
  assert.match(TERMS_VERSION || "", /^\d{4}-\d{2}-\d{2}$/);
  for (const d of DIRS) {
    const conf = MARKETS._dirs[d], m = MARKETS[conf.market], pro = m.prices.pro;
    const text = visible(read("legal/" + d + "/cgv.html"));
    for (const iv of ["week", "month", "year"]) {
      if (!pro[iv]) continue;
      // CGV FR (18/09/2026) : seules les durees ouvertes au paiement y figurent.
      if (d === "fr" && !isOpen(m, iv)) { assert.ok(!text.includes(money(pro[iv].amount, d, m.currency)), d + " : prix " + iv + " non souscriptible absent des CGV"); continue; }
      assert.ok(text.includes(money(pro[iv].amount, d, m.currency)), d + " : prix " + iv + " " + money(pro[iv].amount, d, m.currency));
    }
    if (pro.year && (d !== "fr" || isOpen(m, "year"))) {
      const equiv = Math.ceil(Math.round(pro.year.amount * 100) / 12) / 100;
      const pct = Math.floor((1 - (pro.year.amount * 100) / (pro.month.amount * 1200)) * 100 + 1e-9);
      assert.ok(text.includes(money(equiv, d, m.currency)), d + " : equivalent mensuel " + money(equiv, d, m.currency));
      assert.match(text, new RegExp("\\b" + pct + " ?%"), d + " : economie " + pct + " %");
      assert.ok(text.includes(money(Math.round(pro.month.amount * 1200) / 100, d, m.currency)), d + " : 12 mois au tarif mensuel");
    }
    assert.match(read(d + "/cgv.html"), new RegExp(money(pro.month.amount, d, m.currency).replace(/[$.]/g, "\\$&")), d + "/cgv.html : page generee a jour");
  }
});

test("CGV ZA : ni prix ni option annuelle au lancement ; tolerance d'impaye par duree dans chaque version", () => {
  const za = visible(read("legal/za/cgv.html"));
  assert.doesNotMatch(za, /R ?1[ ,]?999|Annual \(fixed-term\) plans|12-month term/);
  assert.match(za, /No annual plan is offered at present/);
  assert.match(read("legal/za/cgv.html"), /BLOCKED_DECISION: annual plan not offered in South Africa at launch/);
  const GRACE = { fr: /maintenu pendant 4 jours/, en: /1 day[\s\S]*4 days/, gb: /1 day[\s\S]*4 days/, za: /1 day[\s\S]*4 days/, es: /1 día[\s\S]*4 días/, mx: /1 día[\s\S]*4 días/, de: /1 Tag[\s\S]*4 Tage/, it: /1 giorno[\s\S]*4 giorni/, pt: /1 dia[\s\S]*4 dias/ };
  for (const d of DIRS) assert.match(visible(read("legal/" + d + "/cgv.html")), GRACE[d], d + " : tolerance d'impaye");
});

test("CGV : date de mise a jour = TERMS_VERSION, texte en REVIEW, changement de duree et reconduction annuelle decrits, aucune offre Edge", () => {
  for (const d of DIRS) {
    const conf = MARKETS._dirs[d];
    const date = new Date(versionFor(d) + "T12:00:00Z");
    const html = read("legal/" + d + "/cgv.html");
    const expected = new Intl.DateTimeFormat(conf.intlLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    const pageDate = ((html.match(/<div class="page-date">([^<]*)<\/div>/) || [])[1] || "").replace(/[  ]/g, " ");
    assert.ok(pageDate.includes(expected.replace(/[  ]/g, " ")), d + " : date " + pageDate + " / " + expected);
    assert.match(html, /<!-- LEGAL REVIEW: [^>]*16\/09\/2026[^>]*REVIEW/, d + " : statut REVIEW (a faire relire)");
    assert.doesNotMatch(html, /\bEdge\b|annual_edge/, d);
    assert.doesNotMatch(visible(html), /\[TODO|BLOCKED_DECISION/, d + " : aucune note interne visible");
  }
  const fr = visible(read("legal/fr/cgv.html"));
  // CGV FR du 18/09/2026 : abonnement mensuel seul, formules hebdomadaire et
  // annuelle annoncees comme non ouvertes, aucune clause qui ne s'applique qu'a elles.
  assert.match(fr, /se souscrit pour une période mensuelle/);
  assert.match(fr, /hebdomadaire et annuelle[^.]*ne sont pas ouvertes à la souscription à ce jour/);
  assert.doesNotMatch(fr, /Changement de durée|au plus tôt trois mois|Formule annuelle|semaine, mois ou année/);
  assert.match(fr, /Un abonnement en cours ne peut pas être souscrit une seconde fois/);
  assert.ok(fs.existsSync(path.join(ROOT, "legal/fr/archives/cgv-2026-09-16.html")), "version acceptee par les premiers abonnes archivee");
  assert.match(visible(read("legal/gb/cgv.html")), /At least 30 days before your annual subscription renews/);
  assert.match(visible(read("legal/mx/cgv.html")), /plan anual, 30 días y 7 días antes; plan mensual, 7 días antes; plan semanal, 2 días antes/);
});
