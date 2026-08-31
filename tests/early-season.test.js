"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { blendEarlySeasonRate } = require("../lib/markets/early-season.js");

test("blendEarlySeasonRate: a la deuxieme journee, regularise la saison courante vers le prior historique", () => {
  const result = blendEarlySeasonRate({
    current: { events: 4, matches: 1 },
    previous: { events: 38, matches: 38 },
    leaguePrior: { rate: 1.35, equivalentMatches: 6 },
  });
  assert.ok(result.rate > 1 && result.rate < 2, "rate=" + result.rate);
  assert.equal(result.currentMatches, 1);
});

test("blendEarlySeasonRate: les amicaux ne modifient pas le modele principal", () => {
  const base = {
    current: { events: 2, matches: 2 },
    previous: { events: 45, matches: 38 },
    leaguePrior: { rate: 1.35, equivalentMatches: 6 },
  };
  const withoutFriendlies = blendEarlySeasonRate(base);
  const withFriendlies = blendEarlySeasonRate({ ...base, friendlies: { events: 20, matches: 4 } });
  assert.equal(withFriendlies.rate, withoutFriendlies.rate);
  assert.equal(withFriendlies.friendliesUsed, false);
});

test("blendEarlySeasonRate: rejette les donnees impossibles plutot que fabriquer un taux", () => {
  assert.throws(() => blendEarlySeasonRate({
    current: { events: -1, matches: 2 },
    previous: { events: 10, matches: 10 },
    leaguePrior: { rate: 1.2, equivalentMatches: 6 },
  }), /events/);
});
