"use strict";
/* IASHARK — generateur du module embarque par les fonctions Edge
   send-lifecycle-emails et email-unsubscribe :
   supabase/functions/_shared/lifecycle-email-bundle.generated.mjs

   Une fonction Edge deployee ne lit ni lib/, ni emails/, ni config/ : ce script
   recopie lib/email-render.js, lib/lifecycle-email.js, le gabarit
   emails/lifecycle/layout.*, les textes emails/lifecycle/copy.*.json et le
   sous-ensemble utile de config/markets.json (repertoires, devise, prix Pro,
   aide jeu responsable).

   Apres TOUTE modification de l'une de ces sources :
     node lib/lifecycle-email-build.js
   tests/email-lifecycle.test.js echoue si le module genere n'est plus a jour. */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const LIFECYCLE_DIR = path.join(ROOT, "emails", "lifecycle");
const RENDER_LIB = path.join(__dirname, "email-render.js");
const LIFECYCLE_LIB = path.join(__dirname, "lifecycle-email.js");
const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const BUNDLE_PATH = path.join(ROOT, "supabase", "functions", "_shared", "lifecycle-email-bundle.generated.mjs");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

function marketsSubset(cfg) {
  const out = { _dirs: {}, _helplines: cfg._helplines || {} };
  for (const dir of Object.keys(cfg._dirs)) {
    const d = cfg._dirs[dir];
    out._dirs[dir] = { market: d.market, locale: d.locale, htmlLang: d.htmlLang, intlLocale: d.intlLocale, label: d.label };
    if (d.helpline) out._dirs[dir].helpline = d.helpline;
  }
  for (const key of new Set(Object.values(cfg._dirs).map((d) => d.market))) {
    const m = cfg[key];
    out[key] = { currency: m.currency, intlLocale: m.intlLocale, priceIntlLocale: m.priceIntlLocale || null, helpline: m.helpline, prices: { pro: (m.prices && m.prices.pro) || null } };
  }
  return out;
}

function loadBundle() {
  const copy = {};
  for (const loc of LOCALES) copy[loc] = JSON.parse(fs.readFileSync(path.join(LIFECYCLE_DIR, "copy." + loc + ".json"), "utf8"));
  return {
    layout: {
      html: fs.readFileSync(path.join(LIFECYCLE_DIR, "layout.html"), "utf8"),
      text: fs.readFileSync(path.join(LIFECYCLE_DIR, "layout.txt"), "utf8")
    },
    copy,
    markets: marketsSubset(JSON.parse(fs.readFileSync(MARKETS_PATH, "utf8")))
  };
}

function buildBundleSource() {
  return [
    "// FICHIER GENERE par `node lib/lifecycle-email-build.js` - NE PAS MODIFIER A LA MAIN.",
    "// Sources : lib/email-render.js, lib/lifecycle-email.js, emails/lifecycle/*, config/markets.json",
    "// Verifie par tests/email-lifecycle.test.js (doit rester identique a la regeneration).",
    "/* eslint-disable */",
    "// deno-lint-ignore-file",
    "const Render = (function () {",
    "const module = { exports: {} };",
    fs.readFileSync(RENDER_LIB, "utf8"),
    "return module.exports;",
    "})();",
    "const Lifecycle = (function () {",
    "const module = { exports: {} };",
    "const require = function () { return Render; };",
    fs.readFileSync(LIFECYCLE_LIB, "utf8"),
    "return module.exports;",
    "})();",
    "export const BUNDLE = " + JSON.stringify(loadBundle(), null, 2) + ";",
    "export { Render, Lifecycle };",
    "export default Lifecycle;",
    ""
  ].join("\n");
}

function writeBundle() {
  fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
  fs.writeFileSync(BUNDLE_PATH, buildBundleSource());
  return BUNDLE_PATH;
}

if (require.main === module) {
  console.log("[lifecycle-email-build] ecrit " + path.relative(ROOT, writeBundle()));
}

module.exports = { ROOT, LIFECYCLE_DIR, BUNDLE_PATH, LOCALES, marketsSubset, loadBundle, buildBundleSource, writeBundle };
