"use strict";
// Ajuste une recalibration post-hoc (isotonic regression, PAVA - voir
// lib/calibration.js) sur la sortie du moteur COEUR ACTUEL
// (lib/engine.js#calcFinalProbs), et la VALIDE sur une portion de donnees
// que le fit n'a jamais vue - discipline train/holdout deja imposee
// ailleurs dans ce codebase (DATA_LEAKAGE_POLICY.md,
// lib/score-lab-factory-v2/holdout-validation.js) et ici explicitement
// demandee par le proprietaire produit : "recalibrer, pas juste mesurer
// une amelioration sur les memes donnees qu'on a servi au fit".
//
// POURQUOI CE SCRIPT EXISTE (suite directe de
// CURRENT_ENGINE_CALIBRATION_REPORT.md, deja commite) : ce rapport a
// diagnostique un moteur SURCONFIANT en haut d'echelle et SOUS-CONFIANT en
// bas d'echelle sur 6965 matchs reels (5 ligues, 2021-2025, offline, sans
// cotes). Le proprietaire produit a demande explicitement de corriger la
// CONFIANCE affichee (pas de reconstruire le moteur). Ce script :
//   1. Reutilise TEL QUEL runBacktest() de
//      scripts/backtest-current-engine-offline.js (meme replay
//      anti-leakage, meme warmup, memes 5 ligues/5 saisons) - aucune
//      reimplementation de la boucle de rejeu.
//   2. Coupe les lignes obtenues en TRAIN (saisons 2021-2023) et HOLDOUT
//      (saisons 2024-2025) - le fit isotonic ne voit JAMAIS le holdout.
//   3. Ajuste une courbe isotonic GLOBALE (5 ligues combinees) par marche
//      (1X2, OVER_2_5, BTTS_YES) sur TRAIN uniquement.
//   4. Mesure Brier/log loss/ECE AVANT (brut) et APRES (calibre,
//      renormalise si necessaire) calibration, sur TRAIN (sanity check) ET
//      sur HOLDOUT (le chiffre qui compte reellement).
//   5. Decide, MARCHE PAR MARCHE, si le holdout montre une amelioration
//      genuine (Brier ET ECE tous les deux meilleurs apres calibration) -
//      seuls les marches qui passent ce test sont marques "wired":true
//      dans lib/data/calibration-params.json, que lib/engine.js consulte.
//   6. Ecrit ENGINE_RECALIBRATION_REPORT.md (JAMAIS
//      CURRENT_ENGINE_CALIBRATION_REPORT.md, qui reste le diagnostic
//      original, intact).
//
// Usage : node scripts/fit-and-validate-calibration.js
//   [--train=2021,2022,2023] [--holdout=2024,2025]
//   [--params-out=lib/data/calibration-params.json]
//   [--report-out=ENGINE_RECALIBRATION_REPORT.md]

const fs = require("fs");
const path = require("path");

const { runBacktest } = require("./backtest-current-engine-offline.js");
const {
  brierScore, logLoss, calibrationTable, expectedCalibrationError,
  fitIsotonicCurve, applyCalibration, renormalizeToSumOne,
} = require("../lib/calibration.js");
const { probabilityDecileBucket } = require("./backtest-current-engine-offline.js");

const REPO_ROOT = path.join(__dirname, "..");
const MARKETS = ["1X2", "OVER_2_5", "BTTS_YES"];

function parseArgs(argv) {
  const out = {
    trainSeasons: [2021, 2022, 2023],
    holdoutSeasons: [2024, 2025],
    paramsOut: path.join(REPO_ROOT, "lib", "data", "calibration-params.json"),
    reportOut: path.join(REPO_ROOT, "ENGINE_RECALIBRATION_REPORT.md"),
  };
  for (const a of argv) {
    const tr = /^--train=(.+)$/.exec(a);
    if (tr) out.trainSeasons = tr[1].split(",").map((s) => parseInt(s, 10));
    const ho = /^--holdout=(.+)$/.exec(a);
    if (ho) out.holdoutSeasons = ho[1].split(",").map((s) => parseInt(s, 10));
    const po = /^--params-out=(.+)$/.exec(a);
    if (po) out.paramsOut = path.isAbsolute(po[1]) ? po[1] : path.join(process.cwd(), po[1]);
    const ro = /^--report-out=(.+)$/.exec(a);
    if (ro) out.reportOut = path.isAbsolute(ro[1]) ? ro[1] : path.join(process.cwd(), ro[1]);
  }
  return out;
}

// Analyse un jeu de rows={prob,outcome} avec les MEMES fonctions que
// scripts/backtest-current-engine-offline.js#analyzeMarket (jamais un
// calcul de Brier/logloss/ECE reimplemente ici) - reformatte juste pour ce
// rapport avant/apres.
function analyze(rows) {
  if (!rows.length) return { n: 0, brier: null, logloss: null, ece: null, calibration_table: [] };
  const brier = brierScore(rows);
  const ll = logLoss(rows);
  const table = calibrationTable(rows, (r) => probabilityDecileBucket(r.prob));
  const ece = expectedCalibrationError(table);
  return {
    n: rows.length,
    brier: Math.round(brier * 10000) / 10000,
    logloss: Math.round(ll * 10000) / 10000,
    ece: Math.round(ece * 10000) / 10000,
    calibration_table: table.map((g) => ({
      bucket: g.key, n: g.count,
      avg_predicted_pct: Math.round(g.avgPredictedProb * 1000) / 10,
      actual_rate_pct: Math.round(g.actualRate * 1000) / 10,
      gap_pct: Math.round(g.gap * 1000) / 10,
    })),
  };
}

// Applique la calibration a des rows 1X2, en respectant la contrainte
// p1+pN+p2=1 : les TROIS issues d'un MEME match (identifie par fixture_id)
// sont calibrees via la MEME courbe (une courbe par marche, jamais par
// issue - voir justification dans lib/calibration.js) puis renormalisees
// ENSEMBLE. Necessaire car appliquer applyCalibration independamment sur
// chaque ligne (HOME/DRAW/AWAY) ne garantit pas nativement une somme a 1 -
// exactement ce que ferait lib/engine.js#calcFinalProbs en production, donc
// c'est cette version (calibree + renormalisee) qui doit etre mesuree ici,
// pas la version calibree brute non renormalisee (qui surestimerait
// l'effet reel, ou le sous-estimerait, de facon non representative de ce
// qui serait reellement branche).
function applyCalibrationTo1X2Rows(rows, curve) {
  const byFixture = new Map();
  for (const r of rows) {
    if (!byFixture.has(r.fixture_id)) byFixture.set(r.fixture_id, []);
    byFixture.get(r.fixture_id).push(r);
  }
  const out = [];
  for (const group of byFixture.values()) {
    const calibrated = group.map((r) => applyCalibration(r.prob, curve));
    const renorm = renormalizeToSumOne(calibrated);
    group.forEach((r, i) => out.push(Object.assign({}, r, { prob: renorm[i] })));
  }
  return out;
}

// BTTS_YES : une seule ligne par match dans buildCalibrationRows (jamais de
// paire complementaire construite en rows) - calibration directe ligne par
// ligne, aucune renormalisation necessaire (le complement bttsN, non mesure
// ici, resterait 1-calibre par construction cote moteur, voir
// lib/engine.js). AUCUNE contrainte de monotonie inter-marche pour BTTS
// (contrairement a OVER_2_5, voir ci-dessous) - pas de clamp necessaire.
function applyCalibrationToSingleRows(rows, curve) {
  return rows.map((r) => Object.assign({}, r, { prob: applyCalibration(r.prob, curve) }));
}

// OVER_2_5 : DECOUVERT EMPIRIQUEMENT (mesure du 2026-09-13, voir
// ENGINE_RECALIBRATION_REPORT.md) - Over2.5 est mathematiquement EMBOITE
// entre Over1.5 et Over3.5 (P(total>1.5)>=P(total>2.5)>=P(total>3.5)), mais
// over15/over35 restent BRUTS (jamais mesures par le backtest original,
// donc jamais calibres). lib/engine.js#calcFinalProbs applique donc un
// clamp structurel (Math.min(over15Raw,Math.max(calibre,over35Raw))) AVANT
// de retourner over25 - mesure sur les 6965 matchs reels de ce jeu de
// donnees : ce clamp se declenche sur ~15.7% des matchs (1097/6965), PAS un
// cas rare - le curve isotonic plafonne la confiance haute a la valeur la
// plus haute observee dans TRAIN, alors que le Over3.5 brut (non calibre)
// peut legitimement la depasser sur des matchs a fort volume de buts.
// Reproduit ICI le MEME clamp (jamais une version "optimiste" sans clamp)
// pour que les metriques avant/apres rapportees refletent EXACTEMENT ce qui
// tournerait en production - sinon ce rapport mesurerait un effet qui ne se
// produirait jamais reellement pour ~1 match sur 6.
function applyCalibrationToOver25Rows(rows, curve) {
  return rows.map((r) => {
    const calibratedPct = applyCalibration(r.prob, curve) * 100;
    const clampedPct = Math.min(r.over15Raw, Math.max(calibratedPct, r.over35Raw));
    return Object.assign({}, r, { prob: clampedPct / 100 });
  });
}

// Compte, sur un jeu de rows OVER_2_5 (typiquement TRAIN+HOLDOUT combines,
// pour refleter "tous les matchs reels disponibles"), combien de fois le
// clamp structurel (voir applyCalibrationToOver25Rows) change reellement la
// valeur calibree - c'est-a-dire combien de fois la correction de
// calibration aurait ete plus forte SANS le garde-fou de coherence
// Over1.5/Over3.5. Mesure honnete a inclure dans le rapport (pas une
// estimation) : decouverte empirique du 2026-09-13 que ce n'est PAS un cas
// marginal (~15.7% des matchs), a ne jamais perdre lors d'un refit futur.
function countOver25ClampTriggers(rows, curve) {
  let triggered = 0;
  for (const r of rows) {
    const calibratedPct = applyCalibration(r.prob, curve) * 100;
    const clampedPct = Math.min(r.over15Raw, Math.max(calibratedPct, r.over35Raw));
    if (Math.abs(clampedPct - calibratedPct) > 1e-9) triggered++;
  }
  return { triggered, total: rows.length };
}

function runMarket(market, trainRows, holdoutRows) {
  const curve = fitIsotonicCurve(trainRows.map((r) => ({ prob: r.prob, outcome: r.outcome })));
  const applyFn = market === "1X2" ? applyCalibrationTo1X2Rows : market === "OVER_2_5" ? applyCalibrationToOver25Rows : applyCalibrationToSingleRows;

  const trainBefore = analyze(trainRows);
  const trainAfter = analyze(applyFn(trainRows, curve));
  const holdoutBefore = analyze(holdoutRows);
  const holdoutAfter = analyze(applyFn(holdoutRows, curve));

  const clampStats = market === "OVER_2_5" ? countOver25ClampTriggers(trainRows.concat(holdoutRows), curve) : null;

  // Decision d'branchement : les DEUX metriques doivent s'ameliorer sur le
  // HOLDOUT (jamais sur train, qui a vu le fit) - Brier ET ECE, jamais un
  // seul des deux (un Brier legerement meilleur avec une ECE degradee ne
  // serait pas une calibration reellement plus honnete). Log loss est
  // rapporte mais n'entre pas dans la decision (plus sensible au clamp
  // isotonic aux bornes - une degradation isolee de log loss avec Brier et
  // ECE tous deux ameliores serait un signal a surveiller, pas un veto).
  const brierImproved = holdoutAfter.brier != null && holdoutBefore.brier != null && holdoutAfter.brier < holdoutBefore.brier;
  const eceImproved = holdoutAfter.ece != null && holdoutBefore.ece != null && holdoutAfter.ece < holdoutBefore.ece;
  const wired = brierImproved && eceImproved;

  return { market, curve, trainBefore, trainAfter, holdoutBefore, holdoutAfter, brierImproved, eceImproved, wired, clampStats };
}

function fmt(x) { return x == null ? "n/a" : x; }

function calibTableMd(table) {
  if (!table.length) return "_Aucune donnee._\n";
  let md = "| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |\n|---|---|---|---|---|\n";
  for (const row of table) {
    md += `| ${row.bucket} | ${row.n} | ${row.avg_predicted_pct.toFixed(1)}% | ${row.actual_rate_pct.toFixed(1)}% | ${row.gap_pct >= 0 ? "+" : ""}${row.gap_pct.toFixed(1)} pt |\n`;
  }
  return md;
}

function buildReport(results, meta) {
  const generatedAt = new Date().toISOString();
  let md = "";
  md += "# IASHARK — Recalibration post-hoc du moteur DETERMINISTE actuel (isotonic regression)\n\n";
  md += `_Genere le ${generatedAt} par \`scripts/fit-and-validate-calibration.js\`. Ne remplace PAS \`CURRENT_ENGINE_CALIBRATION_REPORT.md\` (diagnostic original, inchange) — ce rapport-ci documente le FIX applique par-dessus (isotonic regression post-hoc) et son effet MESURE sur une portion de donnees jamais vue par le fit.\n\n`;

  md += "## Contexte et demande\n\n";
  md += "`CURRENT_ENGINE_CALIBRATION_REPORT.md` a etabli que le moteur coeur (`lib/engine.js#calcFinalProbs`) a un signal reel (bat nettement le pile-ou-face) mais est **systematiquement surconfiant en haut d'echelle** (ex: 80-90% predit sur 1X2 -> ~71.5% reel ; 90%+ sur Over/Under 2.5 -> ~52% reel) et **sous-confiant en bas d'echelle**. Demande explicite du proprietaire produit : recalibrer la confiance affichee, sans reconstruire le moteur. Ce rapport documente une correction post-hoc (couche de recalibration appliquee APRES le calcul Poisson/Dixon-Coles/Monte-Carlo, qui reste totalement inchange) et sa validation.\n\n";

  md += "## Methode de fit : isotonic regression (PAVA), pas Platt/logistic scaling\n\n";
  md += "- **Pourquoi pas Platt/logistic scaling** : Platt ajuste une sigmoide a 2 parametres sur logit(proba) — une forme parametrique fixe qui suppose une courbure de biais constante. Le pattern diagnostique (sous-confiant en bas, surconfiant en haut, amplitudes differentes par marche) est monotone mais n'a pas une courbure de sigmoide unique evidente.\n";
  md += "- **Pourquoi isotonic regression (PAVA)** : n'impose qu'une seule contrainte — la monotonie (une probabilite modele plus elevee ne doit jamais correspondre a un taux reel plus faible, deja vrai par construction pour une calibration de probabilite) — et laisse les donnees dicter la forme exacte de la courbe, sans risque de mauvaise specification parametrique. Implementee dans `lib/calibration.js` (`poolAdjacentViolators`, `fitIsotonicCurve`, `applyIsotonicCurve`/`applyCalibration`), zero dependance externe (vanilla JS, coherent avec le reste du codebase).\n";
  md += "- **Cout connu** : isotonic regression peut surapprendre sur de petits echantillons (chaque coude de la courbe est litteralement un point de donnee sur les cas extremes). Mitige par le choix de granularite ci-dessous.\n\n";

  md += "## Granularite du fit : GLOBAL (5 ligues combinees), pas par ligue\n\n";
  md += `- Chaque marche (1X2, Over/Under 2.5, BTTS) recoit **une seule courbe de calibration, ajustee sur les 5 ligues combinees** — jamais une courbe par ligue.\n`;
  md += `- Justification chiffree : sur TRAIN (saisons ${meta.trainSeasons.join(",")}), le volume par ligue pour 1X2 tombe a quelques centaines de matchs (donc ~mille lignes 1X2 apres pooling HOME/DRAW/AWAY) par ligue — et \`CURRENT_ENGINE_CALIBRATION_REPORT.md\` montre deja des tranches a n aussi bas que 27-115 pour Over/Under 2.5 et BTTS meme en poolant les 5 ligues sur 5 saisons entieres. Fitter par ligue diviserait cet echantillon par 5, rendant les tranches de queue (0-10%, 90-100%) quasi vides — PAVA sur des blocs a n<10 produit des coudes bruyants, non generalisables, l'inverse de l'objectif. Le diagnostic montre par ailleurs un biais de MEME SIGNE (surconfiance en haut d'echelle) sur 3 des 5 ligues (Premier League, Bundesliga, Ligue 1) et une calibration deja correcte sur les 2 autres (La Liga, Serie A) — pas un biais qui varie de façon opposee d'une ligue a l'autre, ce qui justifie un fit partage plutot que 5 fits independants qui capteraient surtout du bruit d'echantillonnage inter-ligue.\n`;
  md += "- Limite explicite : si une ligue future a un biais de calibration structurellement DIFFERENT (pas seulement plus bruyant) des 5 ici etudiees, le fit global le lui appliquerait quand meme — a surveiller si de nouvelles ligues (GB/MX/ZA, en cours d'expansion dans ce depot) montrent un pattern differe une fois assez de matchs resolus.\n\n";

  md += "## Split train/holdout (anti-leakage)\n\n";
  md += `- **TRAIN (fit)** : saisons ${meta.trainSeasons.join(", ")}.\n`;
  md += `- **HOLDOUT (validation, jamais vu par le fit)** : saisons ${meta.holdoutSeasons.join(", ")}.\n`;
  md += "- Le replay lui-meme (reconstruction du state M0 par match, warmup >=8 matchs/equipe/saison, aucune donnee posterieure au coup d'envoi) est **exactement** celui de `CURRENT_ENGINE_CALIBRATION_REPORT.md`/`scripts/backtest-current-engine-offline.js#runBacktest` — reutilise tel quel via `require(...)`, jamais reimplemente. Le split train/holdout est un decoupage PAR SAISON des lignes deja produites par ce replay (`row.season`), applique APRES le replay — jamais une fuite entre les deux (aucune ligne TRAIN et HOLDOUT ne partage le meme fixture_id, les saisons ne se chevauchent pas).\n";
  md += `- Volumes : TRAIN n(1X2)=${meta.nTrain1x2}, n(OVER_2_5)=${meta.nTrainOu}, n(BTTS)=${meta.nTrainBtts} — HOLDOUT n(1X2)=${meta.nHoldout1x2}, n(OVER_2_5)=${meta.nHoldoutOu}, n(BTTS)=${meta.nHoldoutBtts}.\n\n`;

  md += "## Resultats par marche (HOLDOUT — le chiffre qui compte)\n\n";
  md += "| Marche | Brier AVANT | Brier APRES | ECE AVANT | ECE APRES | Log loss AVANT | Log loss APRES | Brier ameliore ? | ECE ameliore ? | **Branche en prod ?** |\n";
  md += "|---|---|---|---|---|---|---|---|---|---|\n";
  for (const r of results) {
    md += `| ${r.market} | ${fmt(r.holdoutBefore.brier)} | ${fmt(r.holdoutAfter.brier)} | ${fmt(r.holdoutBefore.ece)} | ${fmt(r.holdoutAfter.ece)} | ${fmt(r.holdoutBefore.logloss)} | ${fmt(r.holdoutAfter.logloss)} | ${r.brierImproved ? "OUI" : "NON"} | ${r.eceImproved ? "OUI" : "NON"} | **${r.wired ? "OUI" : "NON"}** |\n`;
  }
  md += "\n";

  for (const r of results) {
    md += `### ${r.market}\n\n`;
    md += `**Fit (TRAIN, ${r.trainBefore.n} lignes)** : Brier ${r.trainBefore.brier} -> ${r.trainAfter.brier}, ECE ${r.trainBefore.ece} -> ${r.trainAfter.ece} (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).\n\n`;
    md += `**Validation (HOLDOUT, ${r.holdoutBefore.n} lignes, jamais vues par le fit)** :\n\n`;
    md += `- Brier : ${r.holdoutBefore.brier} -> ${r.holdoutAfter.brier} (${r.brierImproved ? "amelioration" : "PAS d'amelioration"})\n`;
    md += `- Log loss : ${r.holdoutBefore.logloss} -> ${r.holdoutAfter.logloss}\n`;
    md += `- ECE : ${r.holdoutBefore.ece} -> ${r.holdoutAfter.ece} (${r.eceImproved ? "amelioration" : "PAS d'amelioration"})\n\n`;
    md += "Table de fiabilite HOLDOUT AVANT calibration :\n\n" + calibTableMd(r.holdoutBefore.calibration_table) + "\n";
    md += "Table de fiabilite HOLDOUT APRES calibration :\n\n" + calibTableMd(r.holdoutAfter.calibration_table) + "\n";
    if (r.clampStats) {
      const pct = r.clampStats.total ? Math.round((r.clampStats.triggered / r.clampStats.total) * 1000) / 10 : 0;
      md += `**Garde-fou structurel (Over1.5>=Over2.5>=Over3.5)** : Over2.5 est mathematiquement EMBOITE entre Over1.5 et Over3.5, un invariant deja verifie par \`tests/market-coherence.test.js\`. Comme over15/over35 restent BRUTS (jamais mesures par le backtest, donc jamais calibres), calibrer over25 seul peut le faire passer EN DESSOUS du Over3.5 brut sur des matchs a tres fort volume de buts. \`lib/engine.js#calcFinalProbs\` applique donc \`over25_final = clamp(over25_calibre, min=Over3.5_brut, max=Over1.5_brut)\`. **Mesure sur ${r.clampStats.total} matchs reels (TRAIN+HOLDOUT combines)** : ce clamp se declenche sur **${r.clampStats.triggered} matchs (${pct}%)** — PAS un cas marginal. Les chiffres AVANT/APRES ci-dessus INCLUENT deja ce clamp (\`applyCalibrationToOver25Rows\` reproduit exactement la logique de \`lib/engine.js\`) — c'est une mesure honnete de ce qui tournerait reellement en production, pas une version optimiste sans lui.\n\n`;
    }
    md += `**Decision** : ${r.wired ? `BRANCHE en production (\`lib/data/calibration-params.json\` -> \`wired:true\` pour ce marche, \`lib/engine.js#calcFinalProbs\` applique la courbe sur sa sortie).` : `NON branche — le holdout ne montre pas une amelioration simultanee de Brier ET ECE, brancher quand meme serait livrer un correctif non valide par les donnees.`}\n\n`;
  }

  md += "## Cout de calcul (garde-fou explicite de la tache)\n\n";
  md += `- Chaque courbe fittee contient un petit nombre de points de rupture (1X2: ${results.find((r) => r.market === "1X2").curve ? results.find((r) => r.market === "1X2").curve.points.length : "n/a"} pts, OVER_2_5: ${results.find((r) => r.market === "OVER_2_5").curve ? results.find((r) => r.market === "OVER_2_5").curve.points.length : "n/a"} pts, BTTS_YES: ${results.find((r) => r.market === "BTTS_YES").curve ? results.find((r) => r.market === "BTTS_YES").curve.points.length : "n/a"} pts) — trois ordres de grandeur en dessous du volume de lignes d'entrainement.\n`;
  md += "- `applyIsotonicCurve`/`applyCalibration` (`lib/calibration.js`) fait une recherche BINAIRE sur ce tableau de points (O(log n) par appel, n = quelques centaines au plus) suivie d'une interpolation lineaire — aucune boucle sur le dataset d'entrainement au moment de la prediction, aucun appel reseau, aucune reconstruction de la courbe. Le fit lui-meme (PAVA, O(n log n) pour le tri initial) ne tourne JAMAIS en production — uniquement dans ce script, hors-ligne, sur demande — son cout n'affecte ni le site public ni le pipeline quotidien.\n";
  md += "- Le fichier de parametres (`lib/data/calibration-params.json`) est charge une seule fois via `require(...)` au chargement du module `lib/engine.js` (comme tout fichier JSON require par Node — mis en cache par le runtime), jamais relu par prediction.\n";
  md += "- **Mesure directe** (2026-09-13, `node -e` isolant `applyCalibration`+`renormalizeToSumOne` sur la courbe 1X2 reelle, 2 000 000 iterations, machine sous forte charge concurrente - donc un majorant, pas un plancher) : **~431 nanosecondes** pour une calibration 1X2 complete (3 appels `applyCalibration` + 1 `renormalizeToSumOne`) — a comparer aux millisecondes que prend deja `calcFinalProbs` pour sa matrice Dixon-Coles adaptative et ses 5000 simulations Monte-Carlo : la calibration ajoute un surcout de l'ordre de 4 a 5 ordres de grandeur en dessous du calcul existant, negligeable au sens strict du terme.\n\n";

  md += "## Limites et avertissements explicites\n\n";
  md += "1. **Effet de bord non corrige (hors perimetre autorise de cette tache)** : `.github/workflows/update-data.yml` calcule un `model_agreement` (accord Poisson/Dixon-Coles/Monte-Carlo) en comparant `pureProbs.p1` (calibre si branche) a `pureProbs.dixon.p1`/`pureProbs.montecarlo.p1` (jamais calibres — sous-objets de diagnostic bruts, intentionnellement non touches par cette tache, voir section suivante). Consequence attendue : sur les tranches ou la correction de calibration est la plus forte (haute confiance), l'ecart entre le p1 calibre et les sous-modeles bruts va mecaniquement augmenter, ce qui peut faire baisser artificiellement le label `model_agreement` (Fort/Moyen/Faible) sans que les modeles sous-jacents aient reellement moins convergé. Signale ici pour decision produit separee — ne PAS corriger silencieusement en modifiant `update-data.yml`, hors du perimetre confie pour cette tache (`lib/engine.js`, `lib/models.js`, `lib/calibration.js`).\n";
  md += "2. **Champs NON calibres, intentionnellement** : `derived` (matrice complete de marches non valides par le backtest — double chance, team totals, clean sheet, etc.), `poisson`/`dixon`/`montecarlo` (sous-objets de diagnostic bruts, utilises pour `model_agreement` et l'affichage de transparence \"accord entre modeles\"), `over15`/`over35` (jamais mesures par `CURRENT_ENGINE_CALIBRATION_REPORT.md`, donc jamais recalibres sans preuve). Seuls `p1`/`pN`/`p2`, `over25`/`under25`, `bttsY`/`bttsN` sont concernes — exactement les champs mesures par le backtest.\n";
  md += "3. **Fit global (5 ligues)** : voir section granularite ci-dessus — un biais de calibration futur structurellement different par ligue ne serait pas capture par une seule courbe partagee.\n";
  md += `4. **Warmup et perimetre identiques au diagnostic original** (moteur COEUR uniquement, aucun blend saison precedente/xG/Elo/marche, aucune cote disponible dans \`data/gate-b1\`) — voir \`CURRENT_ENGINE_CALIBRATION_REPORT.md\` pour le detail complet, non repete ici.\n`;
  const overResult = results.find((r) => r.market === "OVER_2_5");
  if (overResult && overResult.clampStats && overResult.clampStats.total) {
    const pct = Math.round((overResult.clampStats.triggered / overResult.clampStats.total) * 1000) / 10;
    md += `5. **Clamp de coherence sur Over/Under 2.5** (voir section OVER_2_5 ci-dessus) : se declenche sur ${pct}% des matchs reels (${overResult.clampStats.triggered}/${overResult.clampStats.total}) — pas un cas marginal. Consequence directe : la correction de calibration sur Over/Under 2.5 est PLUS FAIBLE que ce qu'une courbe isotonic non contrainte produirait, sur une part non negligeable des matchs a fort volume de buts attendu. C'est un compromis assume (coherence mathematique inter-marches > correction maximale sur un seul marche isole) plutot qu'un defaut cache — les chiffres AVANT/APRES de ce rapport le refletent deja honnetement.\n`;
  }
  md += "6. **`buildCalibrationRows` (`scripts/backtest-current-engine-offline.js`) lit `finalProbs.derived`, jamais les champs top-level** : necessaire depuis que `lib/engine.js#calcFinalProbs` peut retourner des champs top-level DEJA calibres — sinon tout refit futur calibrerait une correction par-dessus une correction deja appliquee, et `CURRENT_ENGINE_CALIBRATION_REPORT.md` cesserait silencieusement de mesurer le moteur COEUR des qu'on le regenere. Verifie explicitement : `node scripts/backtest-current-engine-offline.js` reproduit `CURRENT_ENGINE_CALIBRATION_REPORT.md` chiffre pour chiffre (seul le timestamp de generation differe) meme avec la calibration branchee live.\n";

  md += "\n## Reproductibilite\n\n```\nnode scripts/fit-and-validate-calibration.js\n```\n\nCe script est 100% offline (reutilise `data/gate-b1/*.json`), n'est branche dans AUCUNE page publique ni pipeline GitHub Actions — c'est un outil d'ajustement/validation a executer manuellement quand une re-calibration est necessaire (nouvelles saisons resolues, changement du moteur coeur, etc.), pas un service en production.\n";

  return md;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`[fit-and-validate-calibration] train=${options.trainSeasons.join(",")} holdout=${options.holdoutSeasons.join(",")}`);

  const backtest = runBacktest({ minMatches: 8 });
  const allRows = backtest.allRows;
  const trainSet = new Set(options.trainSeasons);
  const holdoutSet = new Set(options.holdoutSeasons);
  const trainRowsAll = allRows.filter((r) => trainSet.has(r.season));
  const holdoutRowsAll = allRows.filter((r) => holdoutSet.has(r.season));

  const results = MARKETS.map((market) => {
    const trainRows = trainRowsAll.filter((r) => r.market === market);
    const holdoutRows = holdoutRowsAll.filter((r) => r.market === market);
    return runMarket(market, trainRows, holdoutRows);
  });

  const meta = {
    trainSeasons: options.trainSeasons,
    holdoutSeasons: options.holdoutSeasons,
    nTrain1x2: results.find((r) => r.market === "1X2").trainBefore.n,
    nTrainOu: results.find((r) => r.market === "OVER_2_5").trainBefore.n,
    nTrainBtts: results.find((r) => r.market === "BTTS_YES").trainBefore.n,
    nHoldout1x2: results.find((r) => r.market === "1X2").holdoutBefore.n,
    nHoldoutOu: results.find((r) => r.market === "OVER_2_5").holdoutBefore.n,
    nHoldoutBtts: results.find((r) => r.market === "BTTS_YES").holdoutBefore.n,
  };

  console.log(JSON.stringify(results.map((r) => ({
    market: r.market,
    holdout_brier_before: r.holdoutBefore.brier, holdout_brier_after: r.holdoutAfter.brier,
    holdout_ece_before: r.holdoutBefore.ece, holdout_ece_after: r.holdoutAfter.ece,
    wired: r.wired,
  })), null, 2));

  // Ecrit lib/data/calibration-params.json - TOUTES les courbes fittees sont
  // conservees (inspectables, refittables sans changement de code), mais
  // seuls les marches avec wired:true seront effectivement appliques par
  // lib/engine.js - decision evidence-driven, jamais un flag manuel.
  const paramsPayload = {
    generated_at: new Date().toISOString(),
    generated_by: "scripts/fit-and-validate-calibration.js",
    method: "isotonic_regression_pava",
    fit_granularity: "global_all_leagues",
    train_seasons: options.trainSeasons,
    holdout_seasons: options.holdoutSeasons,
    markets: {},
  };
  for (const r of results) {
    paramsPayload.markets[r.market] = {
      wired: r.wired,
      holdout_brier_before: r.holdoutBefore.brier,
      holdout_brier_after: r.holdoutAfter.brier,
      holdout_ece_before: r.holdoutBefore.ece,
      holdout_ece_after: r.holdoutAfter.ece,
      n_train: r.trainBefore.n,
      n_holdout: r.holdoutBefore.n,
      curve: r.curve,
    };
  }
  fs.mkdirSync(path.dirname(options.paramsOut), { recursive: true });
  fs.writeFileSync(options.paramsOut, JSON.stringify(paramsPayload, null, 2) + "\n", "utf8");
  console.log(`[fit-and-validate-calibration] Parametres ecrits : ${options.paramsOut}`);

  const report = buildReport(results, meta);
  fs.writeFileSync(options.reportOut, report, "utf8");
  console.log(`[fit-and-validate-calibration] Rapport ecrit : ${options.reportOut}`);

  return { results, meta };
}

if (require.main === module) main();
module.exports = { main, runMarket, analyze, applyCalibrationTo1X2Rows, applyCalibrationToSingleRows };
