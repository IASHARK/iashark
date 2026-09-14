"use strict";
// Version PUBLIQUE du bloc run_output ecrit dans data.json.
//
// Audit du 14/09/2026 : data.json publiait en clair la SAFE_PICK_OF_THE_DAY
// (marche, probabilite, cote), les combines du jour (jambes = paris) et le top
// buteurs. Depuis que l'analyse offerte du jour est le match a plus forte
// valeur (et plus forcement la SAFE_PICK), ces blocs pouvaient reveler le pari
// d'un match PAYANT. Aucune page ne les lit : on ne publie donc que leur statut
// et leurs compteurs, et la SAFE_PICK complete uniquement si elle porte sur le
// match offert (is_free), deja public par definition.

function freeFixtureIds(matchsPublics) {
  return (matchsPublics || [])
    .filter(function (m) { return m && m.is_free === true; })
    .map(function (m) { return String(m.id); });
}

function publicSafePick(safePick, matchsPublics) {
  if (!safePick || typeof safePick !== "object") return safePick == null ? null : { redacted: true };
  var fixtureId = safePick.fixture && safePick.fixture.fixture_id != null ? String(safePick.fixture.fixture_id) : null;
  if (fixtureId && freeFixtureIds(matchsPublics).indexOf(fixtureId) !== -1) return safePick;
  return {
    generated_at: safePick.generated_at || null,
    status: safePick.status || null,
    evaluated_count: safePick.evaluated_count != null ? safePick.evaluated_count : null,
    redacted: true,
  };
}

function publicTopScorers(top) {
  if (!top || typeof top !== "object") return top == null ? null : { redacted: true };
  return {
    generated_at: top.generated_at || null,
    eligible_player_count: top.eligible_player_count != null ? top.eligible_player_count : null,
    count_returned: top.count_returned != null ? top.count_returned : (Array.isArray(top.players) ? top.players.length : null),
    redacted: true,
  };
}

function publicDailyCombos(combos) {
  if (!combos || typeof combos !== "object") return combos == null ? null : { redacted: true };
  var list = Array.isArray(combos.combos) ? combos.combos : [];
  return {
    generated_at: combos.generated_at || null,
    eligible_pool_size: combos.eligible_pool_size != null ? combos.eligible_pool_size : null,
    combos: list.map(function (c) { return { combo_id: c && c.combo_id, status: c && c.status }; }),
    redacted: true,
  };
}

module.exports = { publicSafePick: publicSafePick, publicTopScorers: publicTopScorers, publicDailyCombos: publicDailyCombos, freeFixtureIds: freeFixtureIds };
