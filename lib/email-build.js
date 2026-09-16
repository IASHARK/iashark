"use strict";
/* IASHARK — generateur du module embarque par la fonction Edge
   supabase/functions/send-transactional-email/.

   Une fonction Edge deployee ne peut lire ni lib/ ni emails/templates/ a
   l'execution : ce script recopie lib/email-render.js et les gabarits dans
   email-bundle.generated.mjs (module ES importable par Deno ET par node).

   Apres TOUTE modification d'un gabarit ou de lib/email-render.js :
     node lib/email-build.js
   tests/email-templates.test.js echoue si le module genere n'est plus a jour. */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT, "emails", "templates");
const RENDER_LIB = path.join(__dirname, "email-render.js");
const BUNDLE_PATH = path.join(ROOT, "supabase", "functions", "send-transactional-email", "email-bundle.generated.mjs");

// <type> -> <marche> -> nom de fichier (sans extension) dans emails/templates/.
const TEMPLATE_FILES = {
  purchase_confirmation: { fr: "purchase-confirmation.fr", gb: "purchase-confirmation.gb" },
  renewal_reminder: { mx: "renewal-reminder.mx" },
  // Gabarit commun a tous les repertoires (textes par langue dans lib/email-render.js).
  annual_renewal_reminder: { all: "annual-renewal-reminder" }
};

function loadTemplates(dir) {
  const base = dir || TEMPLATE_DIR;
  const out = {};
  for (const kind of Object.keys(TEMPLATE_FILES)) {
    out[kind] = {};
    for (const market of Object.keys(TEMPLATE_FILES[kind])) {
      const name = TEMPLATE_FILES[kind][market];
      out[kind][market] = {
        html: fs.readFileSync(path.join(base, name + ".html"), "utf8"),
        text: fs.readFileSync(path.join(base, name + ".txt"), "utf8")
      };
    }
  }
  return out;
}

const EXPORTED = [
  "SITE_URL", "SUPPORT_EMAIL", "MARKETS", "TEMPLATE_KINDS", "ANNUAL_KIND", "REMINDER_DIRS", "ANNUAL_REMINDER_DAYS", "COMPANY_FIELDS", "DEFAULT_REMINDER_DAYS",
  "MIN_RECOMMENDED_REMINDER_DAYS", "EmailRenderError", "escapeHtml", "isValidEmail", "maskEmail", "formatMoney",
  "companyFromEnv", "purchaseConfirmationFromStripe", "renewalReminderSkipReason", "renewalReminderFromStripe",
  "reminderKindFor", "reminderDirFor", "annualRenewalReminderFromStripe",
  "parseReminderDays", "renewalWindow", "localDateKey", "cleanIdempotencyKey", "safeEqual"
];

function buildBundleSource() {
  const lib = fs.readFileSync(RENDER_LIB, "utf8");
  return [
    "// FICHIER GENERE par `node lib/email-build.js` - NE PAS MODIFIER A LA MAIN.",
    "// Sources : lib/email-render.js + emails/templates/*.html|*.txt",
    "// Verifie par tests/email-templates.test.js (doit rester identique a la regeneration).",
    "/* eslint-disable */",
    "// deno-lint-ignore-file",
    "const module = { exports: {} };",
    lib,
    "const api = module.exports;",
    "export const TEMPLATES = " + JSON.stringify(loadTemplates(), null, 2) + ";",
    "export function renderEmail(kind, market, data, options) {",
    "  return api.renderEmail(TEMPLATES, kind, market, data, options);",
    "}",
    "export const {",
    EXPORTED.map((k) => "  " + k).join(",\n"),
    "} = api;",
    "export default api;",
    ""
  ].join("\n");
}

function writeBundle() {
  fs.writeFileSync(BUNDLE_PATH, buildBundleSource());
  return BUNDLE_PATH;
}

if (require.main === module) {
  console.log("[email-build] ecrit " + path.relative(ROOT, writeBundle()));
}

module.exports = { ROOT, TEMPLATE_DIR, TEMPLATE_FILES, BUNDLE_PATH, EXPORTED, loadTemplates, buildBundleSource, writeBundle };
