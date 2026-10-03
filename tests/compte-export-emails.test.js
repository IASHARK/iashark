"use strict";
// Export « Mes donnees » (compte.html) : les preferences d'emails
// (public.email_preferences, migration 0024) sont incluses, en lecture de SA
// ligne uniquement, et omises sans erreur si la table n'existe pas encore.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const js = fs.readFileSync(path.join(__dirname, "..", "account-page.js"), "utf8");
const exporter = js.slice(js.indexOf("async function exporter"), js.indexOf("function brancherDialogues"));

test("export : preferences d'emails lues pour ce compte seulement, sans ecriture", () => {
  assert.match(exporter, /sb\.from\('email_preferences'\)\.select\('marketing_opt_in,opt_in_at,opt_in_source,opt_in_text_version,unsubscribed_at,unsubscribe_source,locale,market,created_at,updated_at'\)\s*\.eq\('user_id', ctx\.user\.id\)\.maybeSingle\(\)/);
  const call = exporter.slice(exporter.indexOf("sb.from('email_preferences')"), exporter.indexOf("]);", exporter.indexOf("sb.from('email_preferences')")));
  assert.ok(!/\.(upsert|insert|update|delete)\(/.test(call), "lecture seule");
});

test("export : table absente ou lecture refusee => cle omise, l'export continue", () => {
  assert.match(exporter, /preferences_emails: res\[5\]\.error \? undefined : \(res\[5\]\.data \|\| null\)/);
  assert.equal(JSON.stringify({ a: 1, preferences_emails: undefined }), '{"a":1}', "undefined n'est pas ecrit dans le fichier");
  const promiseList = exporter.slice(exporter.indexOf("Promise.all(["), exporter.indexOf("]);"));
  assert.equal((promiseList.match(/sb\.from\(/g) || []).length, 6, "6 lectures, index res[5] = email_preferences");
});
