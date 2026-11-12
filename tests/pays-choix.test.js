"use strict";
// Choix du pays (lib/pays-choix.js, 09/11/2026). 12/11/2026 : plus de fenetre a l'arrivee ; une bande
// discrete en bas, seulement si le pays devine a une autre version du site que la page.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../lib/pays-choix.js");

const base = { pageDir: "fr", pathname: "/fr/", userAgent: "Mozilla/5.0 (iPhone)", webdriver: false, storageOk: true };

test("premiere visite d'un humain : on peut proposer quelque chose (la suite depend du pays)", () => {
  assert.equal(P.decide(base).show, true);
});

test("12/11 : rien si la page est deja dans la version du pays, une bande sinon, jamais de fenetre a l'arrivee", () => {
  // Deja la bonne version (le cas de presque tout le monde) : rien.
  assert.equal(P.proposition("fr", "FR", "fr-FR"), null);
  assert.equal(P.proposition("fr", "BE", "fr-BE"), null);
  assert.equal(P.proposition("fr", "CI", "fr"), null);
  assert.equal(P.proposition("pt", "BR", "pt-BR"), null);
  assert.equal(P.proposition("fr", "CA", "fr-CA"), null);
  // Pays inconnu, hors liste ou page sans version : rien (le bandeau de langue reprend la main).
  assert.equal(P.proposition("fr", null, "fr"), null);
  assert.equal(P.proposition("fr", "ZZ", "fr"), null);
  assert.equal(P.proposition("", "BR", "pt"), null);
  // Autre version : la bande, dans la langue de la version proposee.
  assert.deepEqual(P.proposition("fr", "BR", "pt-BR"), { code: "BR", name: "Brasil", dir: "pt", lang: "pt" });
  assert.deepEqual(P.proposition("fr", "GB", "en-GB"), { code: "GB", name: "United Kingdom", dir: "gb", lang: "en" });
  assert.deepEqual(P.proposition("en", "MX", "es-MX"), { code: "MX", name: "México", dir: "mx", lang: "es" });
  assert.deepEqual(P.proposition("en", "FR", "fr-FR"), { code: "FR", name: "France", dir: "fr", lang: "fr" });
  assert.equal(P.proposition("fr", "CA", "en-CA").dir, "en");
  for (const l of ["fr", "en", "es", "pt"]) for (const k of ["go", "other", "close", "label"]) assert.ok(String(P.BANDE[l][k] || "").trim(), l + " " + k);
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "pays-choix.js"), "utf8");
  const run = src.slice(src.indexOf("  function run(I18N, w, fin) {"), src.indexOf("    // LA LISTE COMPLETE"));
  // A l'arrivee : jamais la fenetre, jamais de defilement bloque ; la bande ne se pose que sur une proposition.
  assert.doesNotMatch(run, /aria-modal|overflow = "hidden"|ouvrirListe\(\)/);
  assert.match(run, /var p = proposition\(pageDir, code, phoneLang\);\n\s*if \(!p \|\| w\.__iasharkPaysShown \|\| !doc\.body\) \{ finir\(false\); return; \}/);
  // La liste complete ne s'ouvre qu'a la demande (« Autre pays » de la bande).
  assert.equal((src.match(/ouvrirListe\(/g) || []).length, 2, "une definition, un seul appel");
  assert.match(src, /querySelector\("\.ipb-autre"\)\.addEventListener\("click", function \(\) \{ suivre\("pays_bande_autre"\); retirer\(\); ouvrirListe\(p\.code\); \}\);/);
  // Fermer la bande : elle ne revient plus. Elle se pose au-dessus de la barre d'onglets, jamais dessus.
  assert.match(src, /suivre\("pays_bande_fermer"\); safeSet\(ls, KEYS\.ferme, "1"\); retirer\(\);/);
  assert.match(src, /doc\.querySelector\("\.site-bottom-nav"\)\) bande\.className = "ip-nav";/);
  // Rien a proposer : le bandeau de langue du navigateur reprend la main (i18n/i18n.js).
  const i18n = fs.readFileSync(path.join(__dirname, "..", "i18n", "i18n.js"), "utf8");
  assert.match(i18n, /if \(!montre\)\{ global\.__iasharkPaysRien = true; loadLangHint\(\); \}/);
  assert.match(i18n, /\(global\.__iasharkPaysLoad && !global\.__iasharkPaysRien\)/);
  const ft = fs.readFileSync(path.join(__dirname, "..", "funnel-track.js"), "utf8");
  for (const k of ["pays_bande_changer", "pays_bande_fermer", "pays_bande_autre"]) assert.match(ft, new RegExp(k + ": true"));
});

test("jamais pour un robot, apres un choix, apres fermeture, sans stockage", () => {
  assert.equal(P.decide({ ...base, userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }).show, false);
  assert.equal(P.decide({ ...base, webdriver: true }).show, false);
  assert.equal(P.decide({ ...base, pays: "BR" }).show, false);
  assert.equal(P.decide({ ...base, ferme: "1" }).show, false);
  assert.equal(P.decide({ ...base, chosen: true }).show, false);
  assert.equal(P.decide({ ...base, choiceCookie: true }).show, false);
  assert.equal(P.decide({ ...base, storageOk: false }).show, false);
});

test("jamais sur connexion, inscription, compte, paiement, admin", () => {
  ["/fr/connexion.html", "/en/inscription.html", "/fr/compte.html", "/gb/abonnement.html", "/fr/checkout-succes.html", "/admin.html"].forEach((p) => {
    assert.equal(P.decide({ ...base, pathname: p }).show, false, p);
  });
  assert.equal(P.decide({ ...base, pageDir: "" }).show, false);
});

test("pays -> version du site", () => {
  assert.equal(P.dirFor("BR"), "pt");
  assert.equal(P.dirFor("PT"), "pt");
  assert.equal(P.dirFor("CI"), "fr");
  assert.equal(P.dirFor("SN"), "fr");
  assert.equal(P.dirFor("US"), "en");
  assert.equal(P.dirFor("GB"), "gb");
  assert.equal(P.dirFor("ZA"), "za");
  assert.equal(P.dirFor("MX"), "mx");
  assert.equal(P.dirFor("AR"), "es");
  assert.equal(P.dirFor("CA", "fr-CA"), "fr");
  assert.equal(P.dirFor("CA", "en-CA"), "en");
  assert.equal(P.dirFor("ZZ"), "");
});

test("chaque pays pointe vers une version publiee du site", () => {
  const markets = require("../config/markets.json");
  const live = Object.keys(markets._dirs).filter((d) => !(d in (markets._retiredDirs || {})));
  Object.keys(P.PAYS).forEach((c) => {
    const d = P.dirFor(c, "fr");
    assert.ok(live.includes(d), c + " -> " + d);
  });
});

test("le pays devine passe en tete de liste, sans doublon", () => {
  const l = P.orderedList("BR");
  assert.equal(l[0].code, "BR");
  assert.equal(new Set(l.map((x) => x.code)).size, l.length);
  assert.equal(l.length, Object.keys(P.PAYS).length);
});
