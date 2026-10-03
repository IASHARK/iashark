"use strict";
// E-mails enfin declenches (audit V3 du 02/10/2026, point I7) : confirmation
// d'achat depuis le webhook Stripe, rappels de renouvellement planifies (0048),
// jamais dans une autre langue que celle du compte.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Email = require("../lib/email-render.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function abonnement(meta) {
  return {
    id: "sub_TEST123", status: "active", metadata: meta, created: 1790000000, start_date: 1790000000,
    customer: { email: "client@example.com" },
    items: { data: [{ quantity: 1, current_period_end: 1792600000, price: { unit_amount: 1999, currency: "eur", recurring: { interval: "month", interval_count: 1 } } }] },
  };
}

test("confirmation d'achat : envoyee en francais seulement a qui a paye depuis /fr/", () => {
  assert.equal(Email.purchaseConfirmationFromStripe({ subscription: abonnement({ market: "fr", consent_dir: "fr" }) }).ok, true);
  assert.equal(Email.purchaseConfirmationFromStripe({ subscription: abonnement({ market: "fr" }) }).ok, true);
  const es = Email.purchaseConfirmationFromStripe({ subscription: abonnement({ market: "fr", consent_dir: "es" }) });
  assert.equal(es.ok, false);
  assert.equal(es.reason, "no_template_for_language");
  assert.equal(Email.purchaseConfirmationFromStripe({ subscription: abonnement({ market: "gb", consent_dir: "gb" }) }).ok, true);
});

test("le webhook Stripe demande la confirmation apres un checkout reussi, sans jamais bloquer le paiement", () => {
  const src = read("supabase/functions/stripe-webhook/index.ts");
  const bloc = src.slice(src.indexOf('case "checkout.session.completed"'), src.indexOf('case "customer.subscription.created"'));
  assert.match(bloc, /await applySubscription\(sub, false\);\s*\n[\s\S]*await demanderConfirmationAchat\(subscriptionId\)/);
  const fn = src.slice(src.indexOf("async function demanderConfirmationAchat"), src.indexOf("async function demanderConfirmationAchat") + 1500);
  assert.match(fn, /functions\/v1\/send-transactional-email/);
  assert.match(fn, /"x-internal-secret": EMAIL_INTERNAL_SECRET/);
  assert.match(fn, /type: "purchase_confirmation"/);
  assert.match(fn, /catch \(err\)/);
  assert.doesNotMatch(fn, /throw /);
});

test("0048 planifie les rappels promis (FR annuel J-45, MX annuel J-30/J-7, mensuel J-7, hebdo J-2)", () => {
  const sql = read("supabase/migrations/0048_schedule_renewal_reminders.sql");
  for (const corps of [
    '{"type":"renewal_reminder_scan","market":"fr","interval":"year","daysBefore":45}',
    '{"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":30}',
    '{"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":7}',
    '{"type":"renewal_reminder_scan","market":"mx","interval":"month","daysBefore":7}',
    '{"type":"renewal_reminder_scan","market":"mx","interval":"week","daysBefore":2}',
  ]) assert.ok(sql.includes(corps), corps);
  assert.match(sql, /functions\/v1\/send-transactional-email/);
  assert.match(sql, /vault\.decrypted_secrets where name = 'email_internal_secret'/);
  for (const [m, i] of [["fr", "year"], ["gb", "year"], ["mx", "year"], ["mx", "month"], ["mx", "week"]]) {
    assert.ok(Email.reminderKindFor(m, i), m + "/" + i + " doit avoir un gabarit");
  }
});
