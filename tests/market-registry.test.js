"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { MARKET_REGISTRY, getMarket, getMarketsByStatus } = require("../lib/market-registry.js");

const VALID_STATUSES = ["MODELLED_AND_VALIDATED", "MODELLED_EXPERIMENTAL", "ODDS_ONLY", "INSUFFICIENT_DATA", "NOT_SUPPORTED", "UNSUPPORTED"];

test("MARKET_REGISTRY: chaque entree a tous les champs obligatoires (MASTER V2.1 §8)", () => {
  for (const m of MARKET_REGISTRY) {
    assert.ok(m.id, "id manquant");
    assert.ok(m.category, m.id + ": category manquante");
    assert.ok(m.label_fr, m.id + ": label_fr manquant");
    assert.ok(m.model_function, m.id + ": model_function manquant");
    assert.ok(m.resolver_function, m.id + ": resolver_function manquant");
    assert.ok(m.availability_status, m.id + ": availability_status manquant");
    assert.ok(m.version, m.id + ": version manquant");
  }
});

test("MARKET_REGISTRY: pas d'id duplique", () => {
  const ids = MARKET_REGISTRY.map((m) => m.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, "ids en double: " + ids.filter((id, i) => ids.indexOf(id) !== i).join(", "));
});

test("MARKET_REGISTRY: chaque statut est une valeur reconnue", () => {
  for (const m of MARKET_REGISTRY) {
    assert.ok(VALID_STATUSES.includes(m.availability_status), m.id + ": statut invalide '" + m.availability_status + "'");
  }
});

test("MARKET_REGISTRY: un marche MODELLED_AND_VALIDATED ne peut pas avoir de resolver NOT_IMPLEMENTED (regle §8 : modele ET resolver testes)", () => {
  for (const m of MARKET_REGISTRY) {
    if (m.availability_status === "MODELLED_AND_VALIDATED") {
      assert.ok(!m.resolver_function.includes("NOT_IMPLEMENTED"), m.id + " est MODELLED_AND_VALIDATED mais son resolver n'existe pas");
      assert.ok(!m.model_function.includes("NOT_IMPLEMENTED"), m.id + " est MODELLED_AND_VALIDATED mais son modele n'existe pas");
    }
  }
});

test("getMarket: retrouve une entree par id, null si absente", () => {
  assert.equal(getMarket("MATCH_WINNER").category, "1X2");
  assert.equal(getMarket("INCONNU_XYZ"), null);
});

test("getMarketsByStatus: filtre correctement", () => {
  const validated = getMarketsByStatus("MODELLED_AND_VALIDATED");
  assert.ok(validated.length > 0);
  assert.ok(validated.every((m) => m.availability_status === "MODELLED_AND_VALIDATED"));
});
