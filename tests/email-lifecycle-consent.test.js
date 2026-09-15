"use strict";
// Consentement aux emails de relance cote site : case d'inscription jamais
// pre-cochee, interrupteur Mon compte, textes i18n (7 langues), pages de
// desinscription par repertoire (sans connexion, jeton lu dans le fragment).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const L = require("../lib/lifecycle-email.js");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const CONFIG = JSON.parse(read("config/markets.json"));
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const PARTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/parts/emails." + l + ".json")).email_prefs]));
const STATES = { loading: "unsub_loading", done: "unsub_done", already: "unsub_already", invalid: "unsub_invalid", expired: "unsub_expired", error: "unsub_error" };

test("inscription : case facultative, jamais pre-cochee, libellee et traduisible", () => {
  const html = read("inscription.html");
  const input = html.match(/<input id="emailMarketing"[^>]*>/);
  assert.ok(input, "case absente");
  assert.match(input[0], /type="checkbox"/);
  assert.doesNotMatch(input[0], /\bchecked\b|\brequired\b/, "case pre-cochee ou obligatoire");
  assert.match(html, /<label for="emailMarketing"[^>]*data-i18n="email_prefs\.signup_label">Recevoir les analyses offertes et conseils d’utilisation par email<\/label>/);
  assert.ok(html.includes(PARTS.fr.signup_label) && html.includes(PARTS.fr.signup_hint));
});

test("inscription : seul un clic reel sur la case vaut consentement (metadonnees de signUp)", () => {
  const js = read("auth-pages.js");
  assert.match(js, /donneesEmails\(!!caseEmails && caseEmails\.checked === true\)/);
  assert.match(js, /iashark_marketing_opt_in: consenti \? 'true' : 'false'/);
  assert.match(js, /if \(consenti\) data\.iashark_marketing_text_version = EMAIL_CONSENT_TEXT_VERSION;/);
  // Execution reelle de la fonction, hors navigateur.
  const src = js.slice(js.indexOf("var EMAIL_CONSENT_TEXT_VERSION"), js.indexOf("/* ---------- Inscription ---------- */"));
  const make = (pathname) => Function("location", src + "\nreturn donneesEmails;")({ pathname });
  assert.deepEqual(make("/mx/inscription.html")(true), { iashark_marketing_opt_in: "true", iashark_locale: "es-mx", iashark_market: "mx", iashark_marketing_text_version: "2026-09-15" });
  assert.deepEqual(make("/inscription.html")(false), { iashark_marketing_opt_in: "false", iashark_locale: "fr", iashark_market: "fr" });
  assert.equal(make("/gb/inscription.html")(false).iashark_locale, "en");
});

test("Mon compte : interrupteur lie a email_preferences, indisponible tant que la migration n'est pas appliquee", () => {
  const js = read("account-page.js");
  const bloc = js.slice(js.indexOf("function emailsRelance"), js.indexOf("function securite"));
  assert.match(bloc, /interrupteur\('emailMarketing'/);
  assert.match(bloc, /emailPrefs\.etat === 'ok'/);
  assert.match(bloc, /email_prefs\.account_unavailable/);
  assert.match(bloc, /sb\.from\('email_preferences'\)\.upsert\(ligne, \{ onConflict: 'user_id' \}\)/);
  assert.match(bloc, /opt_in_source: 'account'/);
  assert.doesNotMatch(bloc, /opt_in_at|unsubscribed_at/, "horodatages poses par le serveur uniquement");
  assert.match(js, /sb\.from\('email_preferences'\)\.select\('marketing_opt_in'\)\.eq\('user_id', ctx\.user\.id\)\.maybeSingle\(\)/);
  assert.match(js, /marketing_opt_in === true/);
  assert.match(js, /\$\('emailMarketing'\)\.addEventListener\('click', enregistrerEmailMarketing\)/);
  // Colonnes envoyees = colonnes autorisees par la migration.
  const sql = read("supabase/migrations/0024_email_preferences.sql");
  const allowed = sql.match(/grant update \(([^)]+)\) on public\.email_preferences to authenticated;/)[1].split(",").map((s) => s.trim());
  for (const col of ["user_id", "marketing_opt_in", "opt_in_source", "market", "locale", "opt_in_text_version"]) {
    assert.ok(allowed.includes(col), col + " non modifiable par le client");
    assert.ok(bloc.includes(col), col);
  }
});

test("textes i18n (i18n/parts/emails.*.json) : 7 langues, memes cles, aucune valeur vide, vocabulaire autorise", () => {
  const keys = Object.keys(PARTS.fr).sort();
  assert.ok(keys.length >= 15);
  for (const loc of LOCALES) {
    assert.deepEqual(Object.keys(PARTS[loc]).sort(), keys, loc);
    for (const k of keys) assert.ok(typeof PARTS[loc][k] === "string" && PARTS[loc][k].trim(), loc + "." + k);
    assert.deepEqual(L.findForbiddenWords(Object.values(PARTS[loc]).join(" "), loc), [], loc);
  }
  assert.ok(fs.readdirSync(path.join(ROOT, "i18n", "parts")).filter((f) => /^emails\./.test(f)).length === LOCALES.length);
});

test("pages de desinscription : une par repertoire, langue du repertoire, sans connexion, noindex, navigation partagee", () => {
  for (const dir of Object.keys(CONFIG._dirs)) {
    const d = CONFIG._dirs[dir];
    const file = dir + "/desinscription-email.html";
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    const html = read(file);
    assert.match(html, new RegExp('<html lang="' + d.htmlLang + '">'), file);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/, file);
    assert.match(html, /<meta name="referrer" content="no-referrer">/, file);
    assert.match(html, /\/assets\/bottom-navigation\.css/, file);
    assert.match(html, /\/bottom-navigation\.js/, file);
    assert.match(html, /<script src="\/email-unsubscribe-page\.js" defer><\/script>/, file);
    assert.doesNotMatch(html, /supabase\.min\.js|app-client\.js/, file + " : aucune session requise");
    const t = PARTS[d.locale];
    for (const [state, key] of Object.entries(STATES)) {
      const m = html.match(new RegExp('<p data-unsub-state="' + state + '"( hidden)? [^>]*data-i18n="email_prefs\\.' + key + '">([^<]+)</p>'));
      assert.ok(m, file + " etat " + state);
      assert.equal(m[2], t[key], file + " texte de repli " + state);
      assert.equal(!!m[1], state !== "loading", file + " visibilite initiale " + state);
    }
    for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]).filter((h) => h.startsWith("/") && !h.startsWith("/assets/"))) {
      assert.ok(href.startsWith("/" + dir + "/"), file + " lien hors repertoire " + href);
      const rel = href.slice(1).split("#")[0];
      assert.ok(fs.existsSync(path.join(ROOT, rel.endsWith("/") ? rel + "index.html" : rel)), file + " " + href);
    }
  }
});

test("script de la page : jeton lu dans le fragment puis retire, POST uniquement, endpoint autorise par la CSP", () => {
  const js = read("email-unsubscribe-page.js");
  assert.match(js, /location\.hash/);
  assert.match(js, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  assert.match(js, /method: 'POST'/);
  assert.doesNotMatch(js, /localStorage|document\.cookie|location\.search\.match|[?&]t=/);
  const endpoint = js.match(/var ENDPOINT = '([^']+)'/)[1];
  const supa = read("app-client.js").match(/const URL='([^']+)'/)[1];
  assert.equal(endpoint, supa + "/functions/v1/email-unsubscribe");
  assert.ok(read("_headers").includes("connect-src 'self' " + supa), "CSP connect-src");
  for (const state of Object.keys(STATES)) assert.ok(state === "loading" || js.includes("'" + state + "'"), state);
});
