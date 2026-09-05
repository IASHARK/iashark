"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), items 5-8. Schema d'un dataset
// FORWARD de cotes APPEND-ONLY, distinct du cache operationnel
// (odds_snapshots stocke des blobs JSONB bruts par fixture+phase ;
// match_snapshots ECRASE 'prediction'/'closing' a chaque run - ni l'un
// ni l'autre ne conserve une ligne par offre canonicalisee, immuable,
// horodatee). Ce module reste PUR (aucun acces reseau/DB) : la couche
// de lecture/ecriture reelle (Supabase, a construire) appellera ces
// fonctions avec les lignes qu'elle a lues/va persister.

const crypto = require("node:crypto");

// FIRST_SEEN/T72/T24/T6/CLOSE deja collectes en pratique (voir
// scripts/save-odds-snapshot.js). T1 est ajoute au VOCABULAIRE du
// schema (item 6) mais n'est PAS encore produit par la collecte reelle
// aujourd'hui : save-odds-snapshot.js tourne une fois par jour (cron
// update-data.yml, 06:00 UTC), une cadence qui ne permet pas
// d'atteindre fiablement une fenetre T-1h - voir le rapport de retour
// pour le detail. Le schema est pret a recevoir T1 des que
// l'infrastructure de collecte le permettra reellement (closing-odds.yml
// tourne deja toutes les 30 min dans les 3h avant coup d'envoi, la
// cadence necessaire existe deja pour CE job-la).
const SNAPSHOT_PHASES = ["FIRST_SEEN", "T72", "T24", "T6", "T1", "CLOSE"];

function hashRawPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

// UNE ligne par (bookmaker, marche canonique, selection, snapshot) -
// jamais un blob JSONB brut, jamais une ligne qui melange plusieurs
// bookmakers. Gelee (Object.freeze) : une ligne deja construite ne
// peut plus etre mutee en place (item 15#8).
function buildForwardOddsRow({ fixtureId, leagueId, kickoff, snapshotPhase, collectedAt, bookmakerId, bookmakerName, canonicalMarketId, selection, decimalOdds, rawPayloadHash }) {
  if (!SNAPSHOT_PHASES.includes(snapshotPhase)) throw new Error(`buildForwardOddsRow: snapshot_phase inconnu "${snapshotPhase}"`);
  const timeToKickoffHours = (new Date(kickoff).getTime() - new Date(collectedAt).getTime()) / 3600000;
  return Object.freeze({
    fixture_id: fixtureId,
    league_id: leagueId,
    kickoff,
    snapshot_phase: snapshotPhase,
    collected_at: collectedAt,
    time_to_kickoff_hours: timeToKickoffHours,
    bookmaker_id: bookmakerId,
    bookmaker_name: bookmakerName,
    canonical_market_id: canonicalMarketId,
    selection,
    decimal_odds: decimalOdds,
    raw_payload_hash: rawPayloadHash,
  });
}

// item 7 : reconstruit FIRST_SEEN->T72->T24->T6->T1->CLOSE pour une
// fixture a partir de lignes DEJA persistees (jamais une requete live
// ici). Chaque phase reste une serie DISTINCTE, triee par collected_at -
// jamais un remplacement de T24 par CLOSE (item 6).
function loadOddsTimeline(rows, fixtureId) {
  const forFixture = rows.filter((r) => String(r.fixture_id) === String(fixtureId));
  const byPhase = new Map(SNAPSHOT_PHASES.map((p) => [p, []]));
  for (const row of forFixture) {
    if (!byPhase.has(row.snapshot_phase)) byPhase.set(row.snapshot_phase, []);
    byPhase.get(row.snapshot_phase).push(row);
  }
  return {
    fixture_id: fixtureId,
    phases: SNAPSHOT_PHASES.map((phase) => ({
      phase,
      rows: (byPhase.get(phase) || []).slice().sort((a, b) => new Date(a.collected_at) - new Date(b.collected_at)),
    })),
  };
}

// item 8, anti-lookahead OBLIGATOIRE : une decision simulee a
// decisionTime ne voit JAMAIS une offre collectee apres ce moment -
// aucun meilleur prix choisi dans le futur, aucune closing line visible
// avant le CLOSE reel.
function visibleOffersAt(rows, decisionTime) {
  const t = new Date(decisionTime).getTime();
  return rows.filter((r) => new Date(r.collected_at).getTime() <= t);
}

module.exports = { SNAPSHOT_PHASES, hashRawPayload, buildForwardOddsRow, loadOddsTimeline, visibleOffersAt };
