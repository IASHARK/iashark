"use strict";
// Backtest OFFLINE du moteur DETERMINISTE ACTUEL (lib/engine.js#calcFinalProbs,
// lib/models.js — Poisson + Dixon-Coles rho=-0.0845 + Monte-Carlo seedable)
// contre des matchs historiques REELS des 5 ligues deja en ligne aujourd'hui
// (config/leagues.json : Premier League, La Liga, Bundesliga, Ligue 1, Serie
// A), en rejouant a chaque match uniquement les donnees qui auraient ete
// disponibles avant son coup d'envoi.
//
// POURQUOI CE SCRIPT EXISTE : scripts/backtest_historique.js (l'ANCIEN
// backtest, contre historique.json) documente explicitement dans son en-tete
// qu'il ne peut PAS mesurer la calibration du moteur deterministe actuel,
// pour deux raisons : (1) historique.json ne stocke jamais la probabilite
// modele brute par prediction, seulement conf (confiance LLM, ancien
// pipeline) et cote ; (2) recalculer retroactivement demanderait
// APISPORTS_KEY (acces API live), non disponible dans cette session (voir
// .env). Ce script contourne le probleme (2) : data/gate-b1/*-all-seasons.json
// contient deja des saisons completes (scores finaux, horodatage de coup
// d'envoi, ids d'equipe) collectees offline pour un usage different (Score
// Lab Factory V2, voir lib/score-lab-factory-v2/), mais suffisantes pour
// rejouer le moteur SANS acces API live. AUCUNE cote n'existe dans ce jeu de
// donnees (confirme par audit manuel d'un enregistrement) : ce script mesure
// donc la CALIBRATION (une prediction a X% de confiance arrive-t-elle
// vraiment ~X% du temps ?), jamais l'edge/ROI/Kelly (qui restent la
// responsabilite de la collecte forward via match_snapshots/predictions_archive,
// migrations 0004/0005 — see DATA_LEAKAGE_POLICY.md).
//
// METHODOLOGIE ANTI-LEAKAGE (voir DATA_LEAKAGE_POLICY.md) : reutilise TEL
// QUEL lib/data/production-replay.js#computeM0Lambdas — deja documente dans
// ce codebase comme "la SEULE fonction que production/backtest/tests
// doivent utiliser pour reconstruire un state M0 point-in-time" (corrige un
// bug de fuite inter-saison deja trouve une fois, CHAMPION_REPLAY_MISMATCH
// du 2026-09-05). Ce module route lui-meme vers lib/data/team-state.js
// #buildTeamState, qui filtre STRICTEMENT kickoff_timestamp < cutoff (jamais
// <=) et scope a la seule saison du match predit (jamais une autre saison,
// jamais le match lui-meme, jamais un match futur). Rien de ce fichier ne
// re-implemente cette logique — importee, jamais copiee.
//
// PERIMETRE HONNETE (a ne jamais confondre avec le pipeline live complet
// .github/workflows/update-data.yml) : ce backtest rejoue le moteur COEUR
// (calcLambdas + calcFinalProbs, state saison-courante-uniquement) — EXACTEMENT
// ce que lib/data/production-replay.js expose deja comme "etat M0 canonique"
// pour ce type de travail (score-lab-factory-v2). Il ne rejoue PAS les
// enrichissements suivants du pipeline live, tous impossibles a deriver de
// data/gate-b1 (qui ne contient ni xG, ni tirs, ni cotes, ni Elo) :
//   - blendEarlySeasonRate (blend avec la saison precedente en debut de
//     saison courante) — nous utilisons le state brut saison-courante-only ;
//   - blend xG 0.6/0.4 quand >=5 matchs de stats de tir disponibles ;
//   - facteur de qualite de tir (shotQualityFactor) ;
//   - cas particulier Coupe du Monde ;
//   - Elo (de toute facon documente comme non branche dans calcFinalProbs :
//     eloStats est un parametre inutilise dans son corps, voir lib/engine.js) ;
//   - tout ancrage marche (MARKET_CONSENSUS/MARKET_AWARE) — aucune cote ici.
// C'est un choix de perimetre EXPLICITE, pas un oubli : le moteur coeur est
// ce que la consigne de cette tache designe ("lib/engine.js, lib/models.js —
// Poisson + Dixon-Coles... lib/decision.js#pickMarketDeterministic"), et
// c'est deja ce que ce codebase traite ailleurs comme LE remplacement testable
// du calcul de probabilite (lib/data/production-replay.js). pickMarketDeterministic
// lui-meme filtre par cote (market.cote) — indisponible ici — donc seule la
// probabilite brute par marche est evaluee, jamais "quel pari aurait ete
// recommande".
//
// Constantes de ligue (leagueAvgH/leagueAvgA) : le pipeline LIVE reel
// (.github/workflows/update-data.yml, ligne ~2343) appelle
// calcLambdas(...,null,null,lg.id) — les moyennes de ligue "reelles" par
// competition (comme utilisees par lib/score-lab-factory-v2, experimental,
// pas encore promu) ne sont PAS utilisees en production aujourd'hui. Ce
// script reproduit fidelement le pipeline LIVE : leagueAvgH=null,
// leagueAvgA=null (donc 1.35/1.10 par defaut, memes constantes pour les 5
// ligues) — PAS les moyennes reelles par ligue du score-lab. Voir le rapport
// pour la justification complete.
//
// Usage : node scripts/backtest-current-engine-offline.js
//   [--min-matches=8] [--out=CURRENT_ENGINE_CALIBRATION_REPORT.md]

const fs = require("fs");
const path = require("path");

const { computeM0Lambdas } = require("../lib/data/production-replay.js");
const { calcFinalProbs } = require("../lib/engine.js");
const { brierScore, logLoss, calibrationTable, expectedCalibrationError } = require("../lib/calibration.js");
const LEAGUES_CONFIG = require("../config/leagues.json");

const REPO_ROOT = path.join(__dirname, "..");
const GATE_B1_DIR = path.join(REPO_ROOT, "data", "gate-b1");

// Les 5 ligues REELLEMENT en ligne aujourd'hui (config/leagues.json) —
// mapping cle config -> prefixe de fichier data/gate-b1 (les deux
// nomenclatures different pour "premier"/"premier-league"). apiFootballId
// vient de config/leagues.json (source unique), jamais duplique a la main.
const TARGET_LEAGUES = [
  { configKey: "premier", fileBase: "premier-league" },
  { configKey: "laliga", fileBase: "laliga" },
  { configKey: "bundesliga", fileBase: "bundesliga" },
  { configKey: "ligue1", fileBase: "ligue1" },
  { configKey: "seriea", fileBase: "seriea" },
];

const SEASONS = [2021, 2022, 2023, 2024, 2025];

// Seuil de "warmup" : nombre minimum de matchs DEJA JOUES CETTE SAISON par
// CHAQUE equipe (domicile et exterieur) avant qu'une prediction ne soit
// generee pour un de leurs matchs. Choix documente : la consigne de cette
// tache suggere "les ~8-10 premieres journees de chaque equipe" pour que le
// state ait quelque chose de reel a calculer. On retient 8 (borne basse de
// cette fourchette, pour ne pas sacrifier trop de matchs evaluables sur des
// saisons a 30-38 journees) EN PLUS du garde-fou deja integre au moteur
// lui-meme (calcCriteres exige stats.fixtures.played.total>=3, via
// lib/data/production-replay.js#isM0Available) — donc strictement PLUS
// strict que le minimum du moteur, jamais moins. Ce seuil s'applique au
// total de matchs joues (playedTotal), pas seulement aux matchs a domicile/
// exterieur specifiquement utilises par calcLambdas — qui peuvent donc,
// meme apres ce warmup, rester bas en debut de saison si le calendrier d'une
// equipe a ete deséquilibre (ex: beaucoup de matchs exterieurs d'affilee) ;
// c'est un comportement DEJA present dans le moteur de production
// (calcLambdas retombe alors sur un ratio neutre =1 pour le cote sous-alimente,
// jamais invente) — ce script ne le corrige pas, il le rejoue fidelement.
const DEFAULT_MIN_MATCHES_PLAYED = 8;

function parseArgs(argv) {
  const out = { minMatches: DEFAULT_MIN_MATCHES_PLAYED, outFile: path.join(REPO_ROOT, "CURRENT_ENGINE_CALIBRATION_REPORT.md") };
  for (const a of argv) {
    const mm = /^--min-matches=(\d+)$/.exec(a);
    if (mm) out.minMatches = parseInt(mm[1], 10);
    const of = /^--out=(.+)$/.exec(a);
    if (of) out.outFile = path.isAbsolute(of[1]) ? of[1] : path.join(process.cwd(), of[1]);
  }
  return out;
}

function loadLeagueFixtures(fileBase) {
  const all = [];
  const perSeasonInfo = [];
  for (const season of SEASONS) {
    const p = path.join(GATE_B1_DIR, `${fileBase}-${season}.json`);
    if (!fs.existsSync(p)) {
      perSeasonInfo.push({ season, found: false, n: 0 });
      continue;
    }
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    perSeasonInfo.push({ season, found: true, n: data.length });
    for (const f of data) all.push(f);
  }
  return { allFixtures: all, perSeasonInfo };
}

function isEvaluable(f) {
  return f.status === "FINISHED" && f.goals_home_90 != null && f.goals_away_90 != null;
}

// Construit les lignes {prob, outcome} par marche pour UN match deja predit
// (finalProbs = sortie de calcFinalProbs).
//
// IMPORTANT (recalibration post-hoc, 2026-09-13 - voir
// ENGINE_RECALIBRATION_REPORT.md) : lit les probabilites depuis
// finalProbs.derived, JAMAIS depuis finalProbs.p1/over25/bttsY directement.
// Raison : lib/engine.js#calcFinalProbs applique desormais une
// recalibration post-hoc SUR ses champs top-level (p1/pN/p2/over25/bttsY)
// quand lib/data/calibration-params.json marque un marche wired:true -
// mais `derived` reste TOUJOURS la sortie BRUTE du Dixon-Coles (jamais
// touchee par la calibration, par construction de calcFinalProbs). Lire
// les champs top-level ici casserait silencieusement la portee documentee
// de ce script ("mesure le moteur COEUR", voir en-tete) des qu'une
// calibration est branchee, ET fausserait tout refit futur
// (scripts/fit-and-validate-calibration.js fitterait alors une correction
// par-dessus une correction deja appliquee). Equivalent mathematiquement a
// l'ancien code quand aucune calibration n'est branchee (pct() ne fait
// qu'un *100 sans arrondi) - aucun changement retroactif des chiffres deja
// publies dans CURRENT_ENGINE_CALIBRATION_REPORT.md.
//
// over15Raw/over35Raw (pourcentage 0-100) : ajoutes uniquement sur la ligne
// OVER_2_5, pour permettre a un script de validation externe de reproduire
// EXACTEMENT le garde-fou de monotonie (Over1.5>=Over2.5>=Over3.5) que
// lib/engine.js applique en production avant de mesurer un effet "avant/
// apres" honnete (voir scripts/fit-and-validate-calibration.js).
function buildCalibrationRows(finalProbs, homeGoals, awayGoals, meta) {
  const isHome = homeGoals > awayGoals;
  const isDraw = homeGoals === awayGoals;
  const isAway = homeGoals < awayGoals;
  const total = homeGoals + awayGoals;
  const isOver25 = total > 2.5;
  const isBtts = homeGoals > 0 && awayGoals > 0;
  // derived_raw : copie PRE-calibration exposee par lib/engine.js depuis que
  // calcFinalProbs calibre aussi les familles derivees en place (18/09/2026).
  // Sans elle, tout refit fitterait une correction par-dessus une correction.
  const d = finalProbs.derived_raw || finalProbs.derived;
  const rows = [
    { prob: d.p1, outcome: isHome ? 1 : 0, market: "1X2", outcomeLabel: "HOME", ...meta },
    { prob: d.pN, outcome: isDraw ? 1 : 0, market: "1X2", outcomeLabel: "DRAW", ...meta },
    { prob: d.p2, outcome: isAway ? 1 : 0, market: "1X2", outcomeLabel: "AWAY", ...meta },
    {
      prob: d.overUnder["2.5"].over, outcome: isOver25 ? 1 : 0, market: "OVER_2_5", outcomeLabel: "OVER_2_5",
      over15Raw: d.overUnder["1.5"].over * 100, over35Raw: d.overUnder["3.5"].over * 100, ...meta,
    },
    { prob: d.btts.yes, outcome: isBtts ? 1 : 0, market: "BTTS_YES", outcomeLabel: "BTTS_YES", ...meta },
  ];
  // Familles DERIVEES de la meme matrice (18/09/2026). Constat sur les 290
  // picks reels resolus du moteur deterministe : double chance et totaux par
  // equipe, jamais calibres, gagnaient l'argmax de selection avec des
  // probabilites gonflees puis perdaient (~-12% de ROI chacune), pendant que
  // les marches calibres gagnaient. Une seule ligne binaire par match et par
  // marche, toutes resolubles depuis le score final - rien d'invente.
  const one = (market, prob, outcome) => rows.push({ prob, outcome: outcome ? 1 : 0, market, outcomeLabel: market, ...meta });
  one("DC_12", d.doubleChance.oneTwo, !isDraw);
  one("OVER_1_5", d.overUnder["1.5"].over, total > 1.5);
  one("OVER_3_5", d.overUnder["3.5"].over, total > 3.5);
  one("HOME_TEAM_OVER_1_5", d.teamTotals.home["1.5"].over, homeGoals > 1.5);
  one("AWAY_TEAM_OVER_1_5", d.teamTotals.away["1.5"].over, awayGoals > 1.5);
  one("HOME_CLEAN_SHEET", d.cleanSheet.home, awayGoals === 0);
  one("AWAY_CLEAN_SHEET", d.cleanSheet.away, homeGoals === 0);
  one("HOME_WIN_TO_NIL", d.winToNil.home, isHome && awayGoals === 0);
  one("AWAY_WIN_TO_NIL", d.winToNil.away, isAway && homeGoals === 0);
  one("HOME_WIN_OVER_1_5", d.resultTotals.home.over1_5, isHome && total > 1.5);
  one("HOME_WIN_OVER_2_5", d.resultTotals.home.over2_5, isHome && total > 2.5);
  one("HOME_WIN_OVER_3_5", d.resultTotals.home.over3_5, isHome && total > 3.5);
  one("HOME_WIN_UNDER_2_5", d.resultTotals.home.under2_5, isHome && total < 2.5);
  one("HOME_WIN_UNDER_3_5", d.resultTotals.home.under3_5, isHome && total < 3.5);
  one("AWAY_WIN_OVER_1_5", d.resultTotals.away.over1_5, isAway && total > 1.5);
  one("AWAY_WIN_OVER_2_5", d.resultTotals.away.over2_5, isAway && total > 2.5);
  one("AWAY_WIN_OVER_3_5", d.resultTotals.away.over3_5, isAway && total > 3.5);
  one("AWAY_WIN_UNDER_2_5", d.resultTotals.away.under2_5, isAway && total < 2.5);
  one("AWAY_WIN_UNDER_3_5", d.resultTotals.away.under3_5, isAway && total < 3.5);
  return rows;
}

function probabilityDecileBucket(prob) {
  const pct = Math.round(prob * 100);
  const lo = Math.max(0, Math.min(90, Math.floor(pct / 10) * 10));
  return `${lo}-${lo + 10}%`;
}

// Enveloppe fine autour de lib/calibration.js — n'implemente AUCUN calcul de
// Brier/log loss/ECE lui-meme, uniquement l'agregation/le formatage. Toute
// la mathematique vient de lib/calibration.js (brierScore/logLoss/
// calibrationTable/expectedCalibrationError), reutilisee telle quelle.
function analyzeMarket(rows) {
  if (!rows.length) return { n: 0, brier: null, logloss: null, ece: null, calibration_table: [] };
  const brier = brierScore(rows);
  const ll = logLoss(rows);
  const table = calibrationTable(rows, (r) => probabilityDecileBucket(r.prob));
  const ece = expectedCalibrationError(table);
  return {
    n: rows.length,
    brier: brier != null ? Math.round(brier * 10000) / 10000 : null,
    logloss: ll != null ? Math.round(ll * 10000) / 10000 : null,
    ece: ece != null ? Math.round(ece * 10000) / 10000 : null,
    calibration_table: table.map((g) => ({
      bucket: g.key,
      n: g.count,
      avg_predicted_pct: Math.round(g.avgPredictedProb * 1000) / 10,
      actual_rate_pct: Math.round(g.actualRate * 1000) / 10,
      gap_pct: Math.round(g.gap * 1000) / 10,
    })),
  };
}

function runBacktest(options) {
  const minMatches = options.minMatches;
  const perLeagueResults = [];
  const allRows = []; // toutes les lignes de calibration, toutes ligues/marches confondues
  const seasonOnlyRows2025 = [];
  let totalFixturesSeen = 0;
  let totalSkippedNotFinished = 0;
  let totalSkippedWarmup = 0;
  let totalSkippedEngineGate = 0;
  let totalEvaluatedMatches = 0;

  for (const target of TARGET_LEAGUES) {
    const leagueConfig = (LEAGUES_CONFIG.leagues || []).find((l) => l.key === target.configKey);
    if (!leagueConfig) throw new Error(`League config introuvable pour key=${target.configKey} (config/leagues.json)`);
    const leagueId = leagueConfig.apiFootballId;
    const { allFixtures, perSeasonInfo } = loadLeagueFixtures(target.fileBase);

    const leagueRows = [];
    let leagueEvaluated = 0;
    let leagueSkippedNotFinished = 0;
    let leagueSkippedWarmup = 0;
    let leagueSkippedEngineGate = 0;
    let leagueFixturesSeen = 0;
    const perSeasonEvaluated = {};

    for (const season of SEASONS) {
      const seasonFixtures = allFixtures.filter((f) => f.season === season);
      if (!seasonFixtures.length) continue;
      const chronological = seasonFixtures.slice().sort((a, b) => new Date(a.kickoff_timestamp).getTime() - new Date(b.kickoff_timestamp).getTime());
      perSeasonEvaluated[season] = 0;

      for (const f of chronological) {
        leagueFixturesSeen++;
        if (!isEvaluable(f)) {
          leagueSkippedNotFinished++;
          continue;
        }

        const m0 = computeM0Lambdas({
          allFixtures,
          season,
          homeTeamId: f.home_team_id,
          awayTeamId: f.away_team_id,
          cutoff: f.kickoff_timestamp,
          leagueAvgH: null, // fidele au pipeline LIVE reel (update-data.yml) : jamais de moyenne "reelle" par ligue en production aujourd'hui
          leagueAvgA: null,
          leagueId,
          seasonFixtures,
        });

        if (!m0.valid) {
          leagueSkippedEngineGate++;
          continue;
        }
        if (m0.homeState.playedTotal < minMatches || m0.awayState.playedTotal < minMatches) {
          leagueSkippedWarmup++;
          continue;
        }

        const finalProbs = calcFinalProbs(m0.lambdas.lambdaH, m0.lambdas.lambdaA, null);
        const meta = { league: target.configKey, season, fixture_id: f.fixture_id };
        const rows = buildCalibrationRows(finalProbs, f.goals_home_90, f.goals_away_90, meta);
        for (const r of rows) {
          leagueRows.push(r);
          allRows.push(r);
          if (season === 2025) seasonOnlyRows2025.push(r);
        }
        leagueEvaluated++;
        perSeasonEvaluated[season]++;
      }
    }

    totalFixturesSeen += leagueFixturesSeen;
    totalSkippedNotFinished += leagueSkippedNotFinished;
    totalSkippedWarmup += leagueSkippedWarmup;
    totalSkippedEngineGate += leagueSkippedEngineGate;
    totalEvaluatedMatches += leagueEvaluated;

    perLeagueResults.push({
      league: target.configKey,
      displayName: leagueConfig.displayName,
      apiFootballId: leagueId,
      seasonsAvailable: perSeasonInfo,
      fixturesSeen: leagueFixturesSeen,
      skippedNotFinished: leagueSkippedNotFinished,
      skippedEngineGate: leagueSkippedEngineGate,
      skippedWarmup: leagueSkippedWarmup,
      evaluatedMatches: leagueEvaluated,
      evaluatedPerSeason: perSeasonEvaluated,
      markets: {
        "1X2": analyzeMarket(leagueRows.filter((r) => r.market === "1X2")),
        OVER_2_5: analyzeMarket(leagueRows.filter((r) => r.market === "OVER_2_5")),
        BTTS_YES: analyzeMarket(leagueRows.filter((r) => r.market === "BTTS_YES")),
      },
    });
  }

  const overall = {
    "1X2": analyzeMarket(allRows.filter((r) => r.market === "1X2")),
    OVER_2_5: analyzeMarket(allRows.filter((r) => r.market === "OVER_2_5")),
    BTTS_YES: analyzeMarket(allRows.filter((r) => r.market === "BTTS_YES")),
  };
  const overall2025Only = {
    "1X2": analyzeMarket(seasonOnlyRows2025.filter((r) => r.market === "1X2")),
    OVER_2_5: analyzeMarket(seasonOnlyRows2025.filter((r) => r.market === "OVER_2_5")),
    BTTS_YES: analyzeMarket(seasonOnlyRows2025.filter((r) => r.market === "BTTS_YES")),
  };

  return {
    minMatches,
    totals: {
      fixturesSeen: totalFixturesSeen,
      skippedNotFinished: totalSkippedNotFinished,
      skippedEngineGate: totalSkippedEngineGate,
      skippedWarmup: totalSkippedWarmup,
      evaluatedMatches: totalEvaluatedMatches,
    },
    perLeagueResults,
    overall,
    overall2025Only,
    // allRows : ajoute pour la tache de recalibration (ENGINE_RECALIBRATION_REPORT.md,
    // scripts/fit-and-validate-calibration.js) - chaque ligne {prob, outcome, market,
    // league, season, fixture_id, outcomeLabel} deja construite par
    // buildCalibrationRows(), simplement exposee ici en plus des agregats
    // (overall/perLeagueResults) deja retournes, pour permettre a un script
    // externe de repartir train/holdout par saison SANS rejouer le replay -
    // reutilise TEL QUEL, aucune reimplementation de la boucle anti-leakage
    // ci-dessus. N'affecte aucun consommateur existant (champ additif).
    allRows,
  };
}

function fmtPct(x) {
  return x == null ? "n/a" : `${x.toFixed(1)}%`;
}

function calibrationTableToMarkdown(table) {
  if (!table.length) return "_Aucune donnee._\n";
  let md = "| Tranche predite | n | Proba. moyenne predite | Taux reel observe | Ecart |\n";
  md += "|---|---|---|---|---|\n";
  for (const row of table) {
    md += `| ${row.bucket} | ${row.n} | ${row.avg_predicted_pct.toFixed(1)}% | ${row.actual_rate_pct.toFixed(1)}% | ${row.gap_pct >= 0 ? "+" : ""}${row.gap_pct.toFixed(1)} pt |\n`;
  }
  return md;
}

function verdictForMarket(marketResult) {
  if (!marketResult || marketResult.n < 30) return "ECHANTILLON TROP PETIT pour conclure (n<30).";
  const gaps = marketResult.calibration_table.filter((r) => r.n >= 10).map((r) => r.gap_pct);
  if (!gaps.length) return "Pas assez de tranches avec n>=10 pour conclure finement.";
  const meanAbsGap = gaps.reduce((s, g) => s + Math.abs(g), 0) / gaps.length;
  const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const brierRef = 0.25; // pile ou face constant a 50% pour un evenement binaire equilibre — repere, pas un seuil absolu (voir lib/calibration.js)
  let verdict;
  if (meanAbsGap <= 3) verdict = "BIEN CALIBRE";
  else if (meanGap < -3) verdict = "SURCONFIANT (le modele annonce plus de certitude que ce qui se realise)";
  else if (meanGap > 3) verdict = "SOUS-CONFIANT (le modele annonce moins de certitude que ce qui se realise)";
  else verdict = "CALIBRATION MOYENNE, sans biais clair dans un sens";
  const brierNote = marketResult.brier != null ? ` Brier=${marketResult.brier} (repere pile-ou-face=${brierRef}).` : "";
  return `${verdict} (ecart moyen absolu ${meanAbsGap.toFixed(1)} pt sur les tranches n>=10).${brierNote}`;
}

function buildMarkdownReport(result, generatedAt) {
  const { totals, perLeagueResults, overall, overall2025Only, minMatches } = result;

  let md = "";
  md += "# IASHARK — Backtest offline du moteur DETERMINISTE actuel (Track Record V2 candidat)\n\n";
  md += `_Genere le ${generatedAt} par \`scripts/backtest-current-engine-offline.js\`. Ne PAS confondre avec \`CALIBRATION_REPORT.md\` (qui documente l'ANCIEN pipeline LLM-confiance, historique.json) — ce rapport-ci mesure le NOUVEAU moteur deterministe (lib/engine.js/lib/models.js/lib/decision.js) contre de vrais resultats historiques, jamais rejoue jusqu'ici (voir en-tete de \`scripts/backtest_historique.js\`)._\n\n`;

  md += "## Ce que ce rapport mesure, et ce qu'il ne mesure PAS\n\n";
  md += "- **Mesure** : la calibration du moteur coeur (Poisson/Dixon-Coles rho=-0.0845/Monte-Carlo seedable, `lib/engine.js#calcFinalProbs`) sur des matchs REELS des 5 ligues deja en ligne aujourd'hui (Premier League, La Liga, Bundesliga, Ligue 1, Serie A), en respectant strictement l'anti-leakage (voir section methode ci-dessous).\n";
  md += "- **Ne mesure PAS** : l'edge, le ROI, ou la valeur Kelly d'un pari. `data/gate-b1/*-all-seasons.json` (source de ce backtest) ne contient AUCUNE cote (confirme par audit manuel des enregistrements) — impossible de comparer une probabilite modele a un prix de marche ici. Cette validation-la reste la responsabilite de la collecte forward reelle (`match_snapshots`/`predictions_archive`, migrations 0004/0005) — hors perimetre de ce script, qui reste 100% offline et n'est branche nulle part (ni page publique, ni pipeline GitHub Actions).\n";
  md += "- **Ne rejoue PAS** les enrichissements du pipeline LIVE (`update-data.yml`) impossibles a deriver de ce jeu de donnees : blend saison precedente en debut de saison (`blendEarlySeasonRate`), blend xG (0.6/0.4 quand disponible), facteur de qualite de tir, cas Coupe du Monde, Elo (de toute facon non branche dans `calcFinalProbs`, parametre inutilise), tout ancrage marche. C'est le moteur COEUR qui est teste ici — deja ce que ce codebase traite ailleurs comme \"l'etat M0 canonique\" reutilisable pour ce type de travail (`lib/data/production-replay.js`).\n\n";

  md += "## Methode anti-leakage\n\n";
  md += `- Chaque match est trie chronologiquement (\`kickoff_timestamp\`) au sein de sa propre saison (une saison = 1 competition, jamais melangee avec une autre saison — corrige un bug de fuite inter-saison deja documente dans ce codebase, "CHAMPION_REPLAY_MISMATCH" du 2026-09-05).\n`;
  md += "- L'etat de chaque equipe (matchs joues, buts pour/contre, forme) au moment du coup d'envoi est reconstruit UNIQUEMENT a partir des matchs de CETTE MEME SAISON dont `kickoff_timestamp` est **strictement anterieur** (jamais egal) au coup d'envoi du match predit — jamais le match lui-meme, jamais un match futur, jamais une autre saison.\n";
  md += "- Cette reconstruction reutilise **telle quelle** `lib/data/production-replay.js#computeM0Lambdas` (qui route vers `lib/data/team-state.js#buildTeamState`) — deja la fonction canonique documentee dans ce codebase pour cet usage exact, pas une reimplementation parallele.\n";
  md += `- **Fenetre de warmup** : une prediction n'est generee que si les DEUX equipes ont deja joue au moins **${minMatches} matchs cette saison** (en plus du garde-fou deja integre au moteur lui-meme : \`calcCriteres\` exige >=3 matchs joues). Choix documente : la consigne de cette tache suggerait "les 8-10 premieres journees" pour que le state ait quelque chose de reel a calculer ; ${minMatches} a ete retenu comme borne raisonnable (strictement plus stricte que le minimum du moteur) sans sacrifier une part trop importante de chaque saison (30-38 journees selon la ligue).\n`;
  md += "- Aucune cote, aucun score du match lui-meme, aucune donnee posterieure au coup d'envoi n'entre a aucun moment dans le calcul de la prediction.\n\n";

  md += "## Volume de donnees\n\n";
  md += `- Fixtures examinees (toutes ligues, saisons 2021-2025) : **${totals.fixturesSeen}**\n`;
  md += `- Ecartees car non terminees / score manquant : ${totals.skippedNotFinished}\n`;
  md += `- Ecartees par le garde-fou du moteur (\`calcCriteres\`, <3 matchs joues pour au moins une equipe) : ${totals.skippedEngineGate}\n`;
  md += `- Ecartees par la fenetre de warmup (<${minMatches} matchs joues cette saison pour au moins une equipe) : ${totals.skippedWarmup}\n`;
  md += `- **Matchs effectivement predits et evalues : ${totals.evaluatedMatches}**\n\n`;

  md += "## Repartition par ligue\n\n";
  md += "| Ligue | Saisons couvertes | Matchs evalues | Brier 1X2 | Log loss 1X2 | ECE 1X2 | Brier O/U2.5 | Brier BTTS |\n";
  md += "|---|---|---|---|---|---|---|---|\n";
  for (const lg of perLeagueResults) {
    const seasonsStr = lg.seasonsAvailable.filter((s) => s.found).map((s) => s.season).join(", ");
    md += `| ${lg.displayName} | ${seasonsStr} | ${lg.evaluatedMatches} | ${lg.markets["1X2"].brier ?? "n/a"} | ${lg.markets["1X2"].logloss ?? "n/a"} | ${lg.markets["1X2"].ece ?? "n/a"} | ${lg.markets.OVER_2_5.brier ?? "n/a"} | ${lg.markets.BTTS_YES.brier ?? "n/a"} |\n`;
  }
  md += "\n";
  for (const lg of perLeagueResults) {
    md += `### ${lg.displayName}\n\n`;
    if (lg.evaluatedMatches < 100) {
      md += `**AVERTISSEMENT** : seulement ${lg.evaluatedMatches} matchs evalues pour cette ligue — echantillon limite, interpreter les chiffres ci-dessous avec prudence.\n\n`;
    }
    md += `Matchs evalues par saison : ${Object.entries(lg.evaluatedPerSeason).map(([s, n]) => `${s}=${n}`).join(", ")}\n\n`;
    md += `- 1X2 : n=${lg.markets["1X2"].n}, Brier=${lg.markets["1X2"].brier}, log loss=${lg.markets["1X2"].logloss}, ECE=${lg.markets["1X2"].ece}\n`;
    md += `- Over/Under 2.5 : n=${lg.markets.OVER_2_5.n}, Brier=${lg.markets.OVER_2_5.brier}, log loss=${lg.markets.OVER_2_5.logloss}, ECE=${lg.markets.OVER_2_5.ece}\n`;
    md += `- BTTS (oui) : n=${lg.markets.BTTS_YES.n}, Brier=${lg.markets.BTTS_YES.brier}, log loss=${lg.markets.BTTS_YES.logloss}, ECE=${lg.markets.BTTS_YES.ece}\n`;
    md += `- Verdict 1X2 : ${verdictForMarket(lg.markets["1X2"])}\n\n`;
  }

  md += "## Resultat global (5 ligues combinees)\n\n";
  md += `### Marche 1X2 (Domicile / Nul / Exterieur, n=${overall["1X2"].n})\n\n`;
  md += `- Brier score : **${overall["1X2"].brier}** (repere pile-ou-face constant a 50% pour un evenement binaire equilibre : 0.25 — pas directement comparable a un marche a 3 issues desequilibrees, donne a titre de repere seulement)\n`;
  md += `- Log loss : **${overall["1X2"].logloss}**\n`;
  md += `- Expected Calibration Error (ECE) : **${overall["1X2"].ece}**\n\n`;
  md += calibrationTableToMarkdown(overall["1X2"].calibration_table);
  md += `\n**Verdict 1X2** : ${verdictForMarket(overall["1X2"])}\n\n`;

  md += `### Marche Over/Under 2.5 buts (n=${overall.OVER_2_5.n})\n\n`;
  md += `- Brier score : **${overall.OVER_2_5.brier}** (repere pile-ou-face : 0.25)\n`;
  md += `- Log loss : **${overall.OVER_2_5.logloss}**\n`;
  md += `- ECE : **${overall.OVER_2_5.ece}**\n\n`;
  md += calibrationTableToMarkdown(overall.OVER_2_5.calibration_table);
  md += `\n**Verdict Over 2.5** : ${verdictForMarket(overall.OVER_2_5)}\n\n`;

  md += `### Marche BTTS - Oui (n=${overall.BTTS_YES.n})\n\n`;
  md += `- Brier score : **${overall.BTTS_YES.brier}** (repere pile-ou-face : 0.25)\n`;
  md += `- Log loss : **${overall.BTTS_YES.logloss}**\n`;
  md += `- ECE : **${overall.BTTS_YES.ece}**\n\n`;
  md += calibrationTableToMarkdown(overall.BTTS_YES.calibration_table);
  md += `\n**Verdict BTTS** : ${verdictForMarket(overall.BTTS_YES)}\n\n`;

  md += "## Focus recence — saison 2025 uniquement (la plus recente saison complete, 5 ligues combinees)\n\n";
  md += "_Reflete le plus fidelement \"ce que le moteur dirait aujourd'hui\", au prix d'un echantillon plus petit._\n\n";
  md += `| Marche | n | Brier | Log loss | ECE |\n|---|---|---|---|---|\n`;
  md += `| 1X2 | ${overall2025Only["1X2"].n} | ${overall2025Only["1X2"].brier ?? "n/a"} | ${overall2025Only["1X2"].logloss ?? "n/a"} | ${overall2025Only["1X2"].ece ?? "n/a"} |\n`;
  md += `| Over/Under 2.5 | ${overall2025Only.OVER_2_5.n} | ${overall2025Only.OVER_2_5.brier ?? "n/a"} | ${overall2025Only.OVER_2_5.logloss ?? "n/a"} | ${overall2025Only.OVER_2_5.ece ?? "n/a"} |\n`;
  md += `| BTTS (oui) | ${overall2025Only.BTTS_YES.n} | ${overall2025Only.BTTS_YES.brier ?? "n/a"} | ${overall2025Only.BTTS_YES.logloss ?? "n/a"} | ${overall2025Only.BTTS_YES.ece ?? "n/a"} |\n\n`;

  md += "## Verdict honnete en langage clair\n\n";
  md += `- **1X2 (5 ligues, ${overall["1X2"].n} observations)** : ${verdictForMarket(overall["1X2"])}\n`;
  md += `- **Over/Under 2.5 (${overall.OVER_2_5.n} observations)** : ${verdictForMarket(overall.OVER_2_5)}\n`;
  md += `- **BTTS (${overall.BTTS_YES.n} observations)** : ${verdictForMarket(overall.BTTS_YES)}\n`;
  const sorted1x2 = perLeagueResults.slice().filter((l) => l.markets["1X2"].n >= 100).sort((a, b) => (a.markets["1X2"].brier ?? 1) - (b.markets["1X2"].brier ?? 1));
  if (sorted1x2.length >= 2) {
    md += `- Ligue la mieux calibree sur 1X2 (Brier le plus bas, echantillon>=100) : **${sorted1x2[0].displayName}** (Brier=${sorted1x2[0].markets["1X2"].brier}). Ligue la moins bien calibree : **${sorted1x2[sorted1x2.length - 1].displayName}** (Brier=${sorted1x2[sorted1x2.length - 1].markets["1X2"].brier}).\n`;
  }
  md += "\n";

  md += "## Limites et avertissements explicites\n\n";
  md += "1. **Aucune donnee de cote dans `data/gate-b1`** : ce rapport ne peut pas et ne pretend pas mesurer l'edge, le ROI ou la valeur d'un pari — seulement si la probabilite annoncee correspond a la frequence reelle observee (calibration pure).\n";
  md += `2. **Fenetre de warmup = ${minMatches} matchs/equipe/saison**, choix documente ci-dessus mais reste un choix — un warmup different (ex: 5 ou 12) deplacerait legerement les chiffres, en particulier pour les ligues avec moins de matchs par saison (Bundesliga : 308 matchs/saison contre 380 pour Premier League/La Liga/Serie A).\n`;
  md += "3. **Perimetre = moteur COEUR uniquement** (voir section \"Ce que ce rapport mesure\") — le pipeline LIVE reel produit des probabilites legerement differentes des ici presentees des qu'un match a des donnees xG/tirs suffisantes (blend 0.6/0.4) ou tombe en debut de saison (blend saison precedente), aucun des deux non reproductible depuis ce jeu de donnees hors-ligne.\n";
  md += "4. **MODEL_ARCHITECTURE.md decrit un ensemble pondere historique (0.32/0.36/0.22/0.10 avec Elo)** qui ne correspond plus au code actuel de `lib/engine.js#calcFinalProbs` (Dixon-Coles pur rho=-0.0845 depuis GATE A3, blend algebriquement demontre equivalent — voir commentaires en tete de `lib/engine.js` et `lib/models.js`). Ce rapport suit fidelement le CODE reel (source de verite pour cette tache), pas la documentation prose, qui semble ne pas avoir ete mise a jour apres ce changement — a signaler separement, hors perimetre de correction ici (ce script ne modifie aucun fichier existant).\n";
  md += "5. **`goals_home_90`/`goals_away_90`** (jamais `goals_*_final`) sont utilises a la fois pour construire l'etat des equipes ET pour juger le resultat reel — coherent avec le choix deja documente dans `lib/data/team-state.js` (evite qu'un but de prolongation fausse le calcul). Un seul cas rencontre sur les donnees auditees manuellement (Ligue 1 2023-24, barrage de relegation Metz-Saint Etienne, `status_short=\"AET\"`) confirme que ce choix est actif et coherent avec le score officiel `_90`.\n";
  md += `6. **Determinisme** : \`calcFinalProbs\` seede son sous-calcul Monte-Carlo a partir des lambdas eux-memes (\`seedFromLambdas\`, voir \`lib/models.js\`) — deux executions de ce script sur les memes donnees produisent EXACTEMENT le meme rapport (verifie).\n`;
  const smallLeagues = perLeagueResults.filter((l) => l.evaluatedMatches < 300);
  if (smallLeagues.length) {
    md += `7. **Echantillon plus limite** pour : ${smallLeagues.map((l) => `${l.displayName} (n=${l.evaluatedMatches})`).join(", ")} — a interpreter avec prudence supplementaire.\n`;
  } else {
    md += "7. Aucune ligue n'a un echantillon jugé insuffisant (toutes >=300 matchs evalues) pour cette premiere passe.\n";
  }

  md += "\n## Reproductibilite\n\n";
  md += "```\nnode scripts/backtest-current-engine-offline.js\n```\n\n";
  md += "Ce script est 100% offline (aucun appel reseau/API), lit uniquement `data/gate-b1/*.json` deja present dans le depot, et n'est branche dans AUCUNE page publique ni dans le pipeline GitHub Actions quotidien — c'est un outil d'analyse a executer manuellement, pas un service en production. Toute decision de construire une page publique \"Track Record\" a partir de ces chiffres reste une decision business a prendre separement par le proprietaire du produit.\n";

  return md;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`[backtest-current-engine-offline] warmup=${options.minMatches} matchs/equipe/saison, leagues=${TARGET_LEAGUES.map((l) => l.fileBase).join(",")}`);
  const result = runBacktest(options);
  console.log(JSON.stringify({
    totals: result.totals,
    overall: {
      "1X2": { n: result.overall["1X2"].n, brier: result.overall["1X2"].brier, logloss: result.overall["1X2"].logloss, ece: result.overall["1X2"].ece },
      OVER_2_5: { n: result.overall.OVER_2_5.n, brier: result.overall.OVER_2_5.brier, logloss: result.overall.OVER_2_5.logloss, ece: result.overall.OVER_2_5.ece },
      BTTS_YES: { n: result.overall.BTTS_YES.n, brier: result.overall.BTTS_YES.brier, logloss: result.overall.BTTS_YES.logloss, ece: result.overall.BTTS_YES.ece },
    },
    per_league: result.perLeagueResults.map((l) => ({
      league: l.league,
      evaluatedMatches: l.evaluatedMatches,
      brier_1x2: l.markets["1X2"].brier,
    })),
  }, null, 2));

  const generatedAt = new Date().toISOString();
  const md = buildMarkdownReport(result, generatedAt);
  fs.writeFileSync(options.outFile, md, "utf8");
  console.log(`[backtest-current-engine-offline] Rapport ecrit : ${options.outFile}`);
  return result;
}

if (require.main === module) main();
module.exports = { main, runBacktest, analyzeMarket, buildCalibrationRows, probabilityDecileBucket };
