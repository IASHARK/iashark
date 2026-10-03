"use strict";
// IASHARK — langue du compte partout (02/10/2026) : UNE source,
// public.user_preferences.language, lue par le site (redirection a la
// connexion), les e-mails et le robot Telegram. Et l'espace Pro sans cle
// brute ni texte reste en francais dans les 7 langues.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const L = require("../lib/langue-compte.js");
const Lifecycle = require("../lib/lifecycle-email.js");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const get = (o, k) => k.split(".").reduce((c, p) => (c == null ? null : c[p]), o);

test("redirection : meme page dans la langue du compte, jamais quand on la lit deja", () => {
  const loc = (pathname, search = "", hash = "") => ({ pathname, search, hash });
  assert.equal(L.cible("es", loc("/fr/pro.html", "?x=1", "#combo")), "/es/pro.html?x=1#combo");
  assert.equal(L.cible("fr", loc("/es/compte.html")), "/fr/compte.html");
  assert.equal(L.cible("es", loc("/es/pro.html")), null, "deja en espagnol");
  assert.equal(L.cible("es", loc("/mx/pro.html")), null, "un Mexicain reste sur /mx/");
  assert.equal(L.cible("en", loc("/gb/pro.html")), null, "un Britannique reste sur /gb/");
  assert.equal(L.cible("en", loc("/za/")), null);
  assert.equal(L.cible("en", loc("/fr/")), "/en/");
  // de, it, pt : versions retirees du site -> /en/ ; une page anglaise convient deja.
  assert.equal(L.cible("de", loc("/fr/pro.html")), "/en/pro.html");
  assert.equal(L.cible("pt", loc("/gb/pro.html")), null);
  // Jamais : page sans prefixe, page d'authentification, langue inconnue.
  assert.equal(L.cible("es", loc("/match/123.html")), null);
  assert.equal(L.cible("es", loc("/")), null);
  ["connexion.html", "inscription.html", "mot-de-passe-oublie.html", "reinitialiser-mot-de-passe.html", "checkout-succes.html"]
    .forEach((p) => assert.equal(L.cible("es", loc("/fr/" + p)), null, p));
  assert.equal(L.cible("xx", loc("/fr/pro.html")), null);
  assert.equal(L.cible(null, loc("/fr/pro.html")), null);
  // Destination apres connexion.
  assert.equal(L.destinationPour("es", "/fr/compte.html"), "/es/compte.html");
  assert.equal(L.destinationPour("es", "/fr/match.html?id=7#a"), "/es/match.html?id=7#a");
  assert.equal(L.destinationPour("es", "/match/7.html"), "/match/7.html");
  assert.equal(L.destinationPour("fr", "/fr/pro.html"), "/fr/pro.html");
});

test("inscription : la langue du compte est celle de la page ou il s'inscrit", () => {
  assert.equal(L.langueDeLaPage("/es/inscription.html"), "es");
  assert.equal(L.langueDeLaPage("/mx/inscription.html"), "es");
  assert.equal(L.langueDeLaPage("/gb/inscription.html"), "en");
  assert.equal(L.langueDeLaPage("/fr/inscription.html"), "fr");
  assert.equal(L.langueDeLaPage("/inscription.html"), "fr");
  const auth = read("auth-pages.js");
  assert.match(auth, /await enregistrerLangueInscription\(nouvelleSession\.user && nouvelleSession\.user\.id\);/);
  assert.match(auth, /from\('user_preferences'\)\.upsert\(\{ user_id: userId, language: L\.langueDeLaPage\(location\.pathname\) \}, \{ onConflict: 'user_id', ignoreDuplicates: true \}\)/,
    "jamais d'ecrasement d'une langue deja posee");
  // Et la base fait de meme (0044), y compris pour les comptes deja inscrits.
  const sql = read("supabase/migrations/0044_pro_langue.sql");
  assert.match(sql, /create trigger on_auth_user_created_language\s+after insert on auth\.users/);
  assert.match(sql, /split_part\(coalesce\(new\.raw_user_meta_data ->> 'iashark_locale', ''\), '-', 1\)/, "es-mx -> es");
  assert.match(sql, /on conflict \(user_id\) do nothing/);
  for (const p of ["inscription.html", "connexion.html", "es/inscription.html", "es/connexion.html"]) assert.match(read(p), /<script src="\/lib\/langue-compte\.js" defer><\/script>\s*<script src="\/auth-pages\.js" defer>/, p);
});

test("connexion : destination dans la langue du compte ; une seule fois par session, jamais de boucle", () => {
  const auth = read("auth-pages.js");
  assert.match(auth, /location\.href = await destinationLangueCompte\(destination\(\)\);/);
  assert.match(auth, /function marquerLangueAppliquee\(\)[\s\S]*?sessionStorage\.setItem/);
  const app = read("app-client.js");
  // La cle de session est posee AVANT la lecture et le depart : un retour sur la page ne relance rien.
  const iCle = app.indexOf("sessionStorage.setItem(CLE,'1')"), iLecture = app.indexOf("from('user_preferences')"), iDepart = app.indexOf("location.replace(c)");
  assert.ok(iCle > 0 && iCle < iLecture && iLecture < iDepart, "cle posee avant de partir");
  assert.match(app, /sessionStorage\.getItem\(CLE\)\)return;/, "deja faite dans la session : rien");
  assert.match(app, /\^\\\/\(fr\|en\|es\|gb\|za\|mx\)\\\//, "pages prefixees seulement");
  assert.equal(L.CLE_SESSION, "iashark_langue_compte_appliquee");
  assert.ok(app.includes("'" + L.CLE_SESSION + "'"), "meme cle que lib/langue-compte.js");
});

test("compte : selecteur de langue = user_preferences.language ; changer de langue rouvre la page dans cette langue", () => {
  const acc = read("account-page.js");
  assert.match(acc, /language: \$\('langue'\)\.value,/);
  assert.match(acc, /L\.cible\(ligne\.language, \{ pathname: location\.pathname, search: '\?langue=1', hash: '#preferences' \}\)/);
  // Une ligne creee depuis les notifications garde la langue de la page (jamais le 'fr' par defaut de la base).
  assert.match(acc, /language: langueDuCompte\(\),\s*notify_match_analysis/);
  assert.match(read("compte.html"), /<script src="\/lib\/langue-compte\.js"><\/script>/);
  // Questionnaire Pro : meme source.
  assert.match(read("pro-onboarding.js"), /sb\.from\('user_preferences'\)\.upsert\(\{ user_id: ctx\.user\.id, language: etat\.langue \}, \{ onConflict: 'user_id' \}\)/);
});

test("e-mails : la langue du compte decide ; le repertoire d'inscription seulement s'il la parle deja", () => {
  assert.equal(Lifecycle.dirForLanguage("es", "fr"), "es");
  assert.equal(Lifecycle.dirForLanguage("fr", "es"), "fr");
  assert.equal(Lifecycle.dirForLanguage("es", "mx"), "mx", "espagnol du Mexique garde");
  assert.equal(Lifecycle.dirForLanguage("en", "gb"), "gb");
  assert.equal(Lifecycle.dirForLanguage("en", "fr"), "en");
  assert.equal(Lifecycle.dirForLanguage("de", "fr"), "de");
  assert.equal(Lifecycle.dirForLanguage(null, "gb"), "gb", "langue absente : comme avant");
  assert.equal(Lifecycle.dirForLanguage("xx", "zz"), "fr");
  assert.match(read("supabase/functions/send-lifecycle-emails/handler.ts"), /const dir = Lifecycle\.dirForLanguage\(row\.language, row\.market\);/);
  assert.match(read("supabase/functions/send-lifecycle-emails/index.ts"), /from\("user_preferences"\)\.select\("user_id,language"\)/);
  // Module embarque par la fonction Edge a jour.
  assert.match(read("supabase/functions/_shared/lifecycle-email-bundle.generated.mjs"), /function dirForLanguage\(language, market\)/);
  // Resiliation : la langue du compte d'abord.
  assert.match(read("supabase/functions/cancel-subscription/index.ts"), /const locale = compte && !\(page && page\.split\("-"\)\[0\] === compte\) \? compte : \(page \|\| compte\);/);
  // Robot Telegram : la meme colonne.
  assert.match(read("scripts/canal-pro/taches.mjs"), /db\.select\("user_preferences"/);
});

/* ---------------- Espace Pro traduit : aucune cle brute, aucun reste de francais ---------------- */
const FICHIERS_PRO = ["pro-onboarding.js", "tools-page.js", "account-page.js", "pro.html", "accueil-pro.html", "compte.html"];
function clesUtilisees() {
  const cles = new Set();
  for (const f of FICHIERS_PRO) {
    const src = read(f);
    for (const m of src.matchAll(/\b(?:tr|t)\(\s*'((?:pro_onboarding|pro_perso|pro_space|compte_page|tools_page|lancement)\.[a-z0-9_]+)'/g)) cles.add(m[1]);
    for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) cles.add(m[1]);
  }
  const P = require("../lib/pro-preferences.js");
  P.PAYS.forEach((c) => cles.add("pro_onboarding.country_" + c));
  P.MARCHES.forEach((m) => cles.add("pro_onboarding.market_" + m));
  ["compositions", "cotes", "meteo", "nuit", "programme"].forEach((a) => cles.add("pro_onboarding.alert_" + a));
  ["pays", "cote_min_perso", "limite_paris_jour"].forEach((e) => cles.add("pro_onboarding.err_" + e));
  return [...cles];
}

test("espace Pro : chaque texte existe dans les 7 langues (aucune cle brute a l'ecran)", () => {
  const cles = clesUtilisees();
  assert.ok(cles.length > 150, "cles trouvees : " + cles.length);
  for (const l of LOCALES) {
    // Les prefixes dynamiques (« country_ » + pays...) sont developpes plus haut.
    const manquantes = cles.filter((k) => !k.endsWith("_") && typeof get(DICTS[l], k) !== "string");
    assert.deepEqual(manquantes, [], l + " : cles manquantes");
  }
});

test("espace Pro en espagnol : aucun texte du questionnaire ni du bandeau resté en francais ; marqueurs {n} {h} {name} gardes", () => {
  for (const sec of ["pro_onboarding", "pro_perso"]) {
    for (const [k, fr] of Object.entries(DICTS.fr[sec])) {
      for (const l of LOCALES.filter((x) => x !== "fr")) {
        const v = DICTS[l][sec][k];
        assert.ok(typeof v === "string" && v.trim(), l + "." + sec + "." + k);
        if (fr.length > 14) assert.notEqual(v, fr, l + "." + sec + "." + k + " : reste en francais");
        (fr.match(/\{[a-z]+\}/g) || []).forEach((mk) => assert.ok(v.includes(mk), l + "." + sec + "." + k + " : " + mk));
      }
    }
  }
  // Pages generees /es/ : chaque data-i18n a son texte espagnol.
  for (const p of ["es/pro.html", "es/compte.html", "es/accueil-pro.html", "mx/pro.html", "en/accueil-pro.html"]) {
    const dict = DICTS[p.startsWith("mx/") ? "es-mx" : p.slice(0, 2)];
    const html = read(p);
    const manquantes = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]).filter((k) => typeof get(dict, k) !== "string");
    assert.deepEqual(manquantes, [], p);
    assert.match(html, /<html lang="(es|es-MX|en)"/, p);
  }
  assert.doesNotMatch(read("es/accueil-pro.html"), /Ta langue, ton pays|Règle ton espace Pro/, "meta en francais");
});

test("regles : aucune mise, aucune promesse de gain, pas de « jouer comporte des risques » dans les nouveaux textes", () => {
  // Textes ajoutes le 02/10/2026 (i18n/parts/pro_langue.<langue>.json).
  const txt = LOCALES.map((l) => read("i18n/parts/pro_langue." + l + ".json")).join("\n");
  assert.doesNotMatch(txt, /mise\b|stake|apuesta mínima|capital|bankroll|banca|espérance|expected value|garanti|guarantee|gagner à coup sûr|comporte des risques/i);
  // Tableau de bord ouvert le 03/10/2026 (0040/0041 appliquees) : toujours pilote par l'interrupteur.
  assert.match(read("tools-page.js"), /var TABLEAU_OUVERT = !!\(window\.IASHARK_OUVERTURE && window\.IASHARK_OUVERTURE\.tableauPro === true\);/);
  assert.match(read("pro.html"), /data-tool="tableau"/);
});
