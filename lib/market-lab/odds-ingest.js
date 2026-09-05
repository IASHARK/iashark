"use strict";
// MARKET LAB - PHASE 2 (2026-09-05), items 1-4. Ingestion des cotes
// bookmaker AVEC IDENTITE PRESERVEE - jamais fusionnees avant le devig
// (item 1). Reutilise EXCLUSIVEMENT lib/odds.js#extractRawOffers pour le
// parsing brut (deja audite, deja teste par tests/odds-bookmaker-identity.test.js) :
// ce module ne reimplemente aucune extraction, il ajoute par-dessus le
// mapping canonique (item 2), la validation stricte (item 3) et le
// contrat temporel pre-match (item 4).

const { extractRawOffers } = require("../odds.js");

// Mapping canonique STRICT : (market, selection) tels que produits par
// extractRawOffers -> (canonical_market_id, canonical_selection) tels
// que produits par lib/market-lab/market-catalogue.js. Couvre
// UNIQUEMENT les marches V1 reellement disponibles cote source
// aujourd'hui (verifie contre 62 snapshots reels en base -
// odds_snapshots, 34 fixtures, 13 bookmakers). Ne jamais ajouter une
// entree pour un marche que la source ne fournit pas reellement : un
// market/selection absent de cette table devient UNMAPPED_ODDS_MARKET
// (item 2), jamais synthetise.
//
// MARKET LAB PHASE 2.5 (2026-09-05, items 1-2) : extractRawOffers a ete
// etendu pour capturer 0.5/1.5/2.5/3.5/4.5 (Total buts, les DEUX cotes)
// et 0.5/1.5/2.5/3.5 (Team Totals Home/Away) - les lignes 0.5/4.5 et le
// cote UNDER de la ligne 1.5 existaient DEJA dans le payload reel,
// simplement jamais extraites (voir lib/odds.js). Toutes desormais
// mappees ci-dessous.
//
// Ecart restant, structurel (pas un bug d'extraction) :
//   - Draw No Bet (match complet) : AUCUNE cote directe dans le
//     catalogue API-Football observe (seules "Draw No Bet (1st Half)"
//     et "(2nd Half)" existent, jamais le marche plein temps) -> FT_DNB
//     n'a AUCUNE entree de mapping, jamais synthetise depuis 1X2. Voir
//     EXECUTABLE_DNB_AVAILABLE ci-dessous.
const TOTAL_GOALS_MAP_LINES = ["0.5", "1.5", "2.5", "3.5", "4.5"];
const TEAM_TOTAL_MAP_LINES = ["0.5", "1.5", "2.5", "3.5"];

const CANONICAL_MARKET_MAP = new Map([
  ["1x2|home", { canonicalMarketId: "FT_1X2_HOME", canonicalSelection: "HOME" }],
  ["1x2|draw", { canonicalMarketId: "FT_1X2_DRAW", canonicalSelection: "DRAW" }],
  ["1x2|away", { canonicalMarketId: "FT_1X2_AWAY", canonicalSelection: "AWAY" }],
  ["double_chance|1x", { canonicalMarketId: "FT_DC_1X", canonicalSelection: "1X" }],
  ["double_chance|x2", { canonicalMarketId: "FT_DC_X2", canonicalSelection: "X2" }],
  ["double_chance|12", { canonicalMarketId: "FT_DC_12", canonicalSelection: "12" }],
  ["btts|yes", { canonicalMarketId: "FT_BTTS_YES", canonicalSelection: "YES" }],
  ["btts|no", { canonicalMarketId: "FT_BTTS_NO", canonicalSelection: "NO" }],
  ...TOTAL_GOALS_MAP_LINES.flatMap((line) => [
    [`goals_ou|over_${line}`, { canonicalMarketId: `FT_TOTAL_${line}_OVER`, canonicalSelection: "OVER" }],
    [`goals_ou|under_${line}`, { canonicalMarketId: `FT_TOTAL_${line}_UNDER`, canonicalSelection: "UNDER" }],
  ]),
  ...TEAM_TOTAL_MAP_LINES.flatMap((line) => {
    const key = line.replace(".", "");
    return [
      [`home_over${key}|yes`, { canonicalMarketId: `FT_TEAM_TOTAL_HOME_${line}_OVER`, canonicalSelection: "OVER" }],
      [`home_under${key}|yes`, { canonicalMarketId: `FT_TEAM_TOTAL_HOME_${line}_UNDER`, canonicalSelection: "UNDER" }],
      [`away_over${key}|yes`, { canonicalMarketId: `FT_TEAM_TOTAL_AWAY_${line}_OVER`, canonicalSelection: "OVER" }],
      [`away_under${key}|yes`, { canonicalMarketId: `FT_TEAM_TOTAL_AWAY_${line}_UNDER`, canonicalSelection: "UNDER" }],
    ];
  }),
]);

// item 4 : reste FALSE tant qu'aucune cote FT DNB directe n'existe dans
// la source (voir ci-dessus) - jamais deduit de la presence/absence
// d'une entree FT_DNB dans CANONICAL_MARKET_MAP par un appelant, cette
// constante EST la source de verite unique pour cette question.
const EXECUTABLE_DNB_AVAILABLE = false;

const REJECT_REASON = {
  INVALID_ODDS: "INVALID_ODDS",
  UNKNOWN_BOOKMAKER: "UNKNOWN_BOOKMAKER",
  DUPLICATE_INCONSISTENT: "DUPLICATE_INCONSISTENT",
};

function isValidExecutableOdds(odds) {
  return typeof odds === "number" && Number.isFinite(odds) && odds > 1;
}

// context = { fixtureId, retrievedAt (ISO), kickoff (ISO, optionnel),
// oddsSnapshotId (optionnel) }. rawOddsPayload = payload brut
// api-football tel que passe a extractRawOffers (o.bookmakers[...]).
//
// Retour : { valid, rejected, unmapped } - AUCUNE fusion de bookmakers
// (item 1), chaque offre valide porte fixture_id, bookmaker_id,
// bookmaker_name, market (nom source), canonical_market_id, selection,
// decimal_odds, retrieved_at, odds_snapshot_id, kickoff,
// excluded_post_kickoff, time_to_kickoff_hours.
function buildBookmakerOffers(rawOddsPayload, context) {
  context = context || {};
  const fixtureId = context.fixtureId != null ? context.fixtureId : null;
  const retrievedAt = context.retrievedAt || null;
  const kickoff = context.kickoff || null;
  const oddsSnapshotId = context.oddsSnapshotId != null ? context.oddsSnapshotId : null;

  const rawOffers = extractRawOffers(rawOddsPayload, { fixtureId, capturedAt: retrievedAt });

  const timeToKickoffHours = kickoff && retrievedAt ? (new Date(kickoff).getTime() - new Date(retrievedAt).getTime()) / 3600000 : null;
  const excludedPostKickoff = timeToKickoffHours != null && timeToKickoffHours <= 0;

  const valid = [];
  const rejected = [];
  const unmapped = [];
  const seenKeys = new Map(); // dedup deterministe (item 3 doublons, item 15#10)

  for (const offer of rawOffers) {
    const mapping = CANONICAL_MARKET_MAP.get(`${offer.market}|${offer.selection}`);
    const base = {
      fixture_id: offer.fixture_id,
      bookmaker_id: offer.bookmaker_id,
      bookmaker_name: offer.bookmaker_name,
      market: offer.market,
      selection: offer.selection,
      decimal_odds: offer.odds,
      retrieved_at: retrievedAt,
      odds_snapshot_id: oddsSnapshotId,
    };

    if (!mapping) {
      unmapped.push({ ...base, reason: "UNMAPPED_ODDS_MARKET" });
      continue;
    }
    if (!isValidExecutableOdds(offer.odds)) {
      rejected.push({ ...base, canonical_market_id: mapping.canonicalMarketId, reason: REJECT_REASON.INVALID_ODDS });
      continue;
    }
    if (offer.bookmaker_id == null && !offer.bookmaker_name) {
      rejected.push({ ...base, canonical_market_id: mapping.canonicalMarketId, reason: REJECT_REASON.UNKNOWN_BOOKMAKER });
      continue;
    }

    const canonicalOffer = {
      fixture_id: fixtureId,
      bookmaker_id: offer.bookmaker_id,
      bookmaker_name: offer.bookmaker_name,
      market: offer.market,
      canonical_market_id: mapping.canonicalMarketId,
      selection: mapping.canonicalSelection,
      decimal_odds: offer.odds,
      retrieved_at: retrievedAt,
      odds_snapshot_id: oddsSnapshotId,
      kickoff,
      time_to_kickoff_hours: timeToKickoffHours,
      excluded_post_kickoff: excludedPostKickoff,
    };

    const dedupKey = `${canonicalOffer.bookmaker_id}|${canonicalOffer.canonical_market_id}|${oddsSnapshotId}`;
    const prior = seenKeys.get(dedupKey);
    if (prior) {
      if (prior.decimal_odds !== canonicalOffer.decimal_odds) {
        prior.__inconsistentDuplicate = true;
        rejected.push({ ...base, canonical_market_id: mapping.canonicalMarketId, reason: REJECT_REASON.DUPLICATE_INCONSISTENT });
        rejected.push({ ...canonicalOffer, reason: REJECT_REASON.DUPLICATE_INCONSISTENT });
      }
      // doublon IDENTIQUE (memes cotes) : ignore silencieusement la
      // repetition, la premiere occurrence (ordre stable) fait deja foi.
      continue;
    }
    seenKeys.set(dedupKey, canonicalOffer);
    valid.push(canonicalOffer);
  }

  // Retire de `valid` les entrees dont le doublon s'est revele
  // incoherent APRES coup (la premiere occurrence avait ete acceptee
  // avant de decouvrir la seconde) - jamais une correction silencieuse,
  // les deux versions restent dans `rejected` pour audit.
  const inconsistentKeys = new Set(rejected.filter((r) => r.reason === REJECT_REASON.DUPLICATE_INCONSISTENT).map((r) => `${r.bookmaker_id}|${r.canonical_market_id}`));
  const finalValid = valid.filter((o) => !inconsistentKeys.has(`${o.bookmaker_id}|${o.canonical_market_id}`));

  return { valid: finalValid, rejected, unmapped };
}

module.exports = { buildBookmakerOffers, CANONICAL_MARKET_MAP, REJECT_REASON, isValidExecutableOdds, EXECUTABLE_DNB_AVAILABLE };
