"use strict";
// Fenetre « Choisis ton pays » (lib/pays-choix.js, 09/11/2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../lib/pays-choix.js");

const base = { pageDir: "fr", pathname: "/fr/", userAgent: "Mozilla/5.0 (iPhone)", webdriver: false, storageOk: true };

test("premiere visite d'un humain : la fenetre s'affiche", () => {
  assert.equal(P.decide(base).show, true);
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
