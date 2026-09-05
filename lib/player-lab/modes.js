"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 1. Deux modes scientifiques
// STRICTEMENT separes - jamais melanges dans une meme metrique/rapport.
//
// PRE_LINEUP : backtest historique autorise. La lineup du match CIBLE
// ne peut JAMAIS servir de feature - uniquement de LABEL (starter/bench/
// played). Toute feature doit venir de player-match rows avec
// kickoff < cutoff du match cible.
//
// POST_LINEUP_CONDITIONAL : la lineup officielle du match cible PEUT
// servir de condition connue POUR LE BACKTEST HISTORIQUE UNIQUEMENT.
// Tag obligatoire LINEUP_TIMING_EVIDENCE=ORACLE_HISTORICAL - ceci ne
// PROUVE PAS que notre collecte live aurait fourni cette lineup a T-60
// (aucun horodatage de confirmation historique n'a jamais existe, voir
// PLAYER LAB DATA GATE). Le mode operationnel reel (POST_LINEUP_OPERATIONAL)
// n'existera que lorsque first_seen_lineup_at sera capture en forward
// (voir lib/player-lab/forward-lineup-timing.js) sur assez de fixtures.

const MODE = {
  PRE_LINEUP: "PRE_LINEUP",
  POST_LINEUP_CONDITIONAL: "POST_LINEUP_CONDITIONAL",
  POST_LINEUP_OPERATIONAL: "POST_LINEUP_OPERATIONAL", // pas encore atteignable, voir ci-dessus
};

const LINEUP_TIMING_EVIDENCE = {
  ORACLE_HISTORICAL: "ORACLE_HISTORICAL", // lineup connue apres coup, jamais un vrai T-60 historique
  FORWARD_CAPTURED: "FORWARD_CAPTURED", // first_seen_lineup_at reellement capture en direct
};

// item 15 : couverture historique des injuries jugee PARTIAL (voir
// PLAYER LAB DATA GATE) et timing historique jamais demontre - AUCUNE
// feature d'injury dans le modele PRE_LINEUP V1. Explicite, pas un
// simple champ omis silencieusement.
const INJURY_FEATURES = "DISABLED";

module.exports = { MODE, LINEUP_TIMING_EVIDENCE, INJURY_FEATURES };
