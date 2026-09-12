"use strict";
// Moteur de score de production (GATE A1, extraction pure) — extrait au
// caractere pres de .github/workflows/update-data.yml (calcFinalProbs
// lignes 488-508, calcLambdas lignes 509-529, calcCriteres lignes
// 1041-1066, calcFatigue lignes 1067-1076 au moment de l'extraction,
// SHA 04825140). ZERO changement mathematique : meme formules, memes
// bornes, meme ordre d'operations, memes arrondis. Verifie par
// tests/engine.golden-master.test.js (comparaison a 1e-12 contre un
// golden master capture depuis l'ancien code inline avant extraction).
//
// Objectif de cette extraction (GATE A1 du protocole SPEC LAB PRO v1.0) :
// que production, backtest et tests appellent tous la meme implementation
// (§19 du protocole), au lieu du pipeline qui redefinissait ces fonctions
// inline dans le YAML. Le pipeline (update-data.yml) doit desormais
// importer ce module au lieu de redefinir ces fonctions.
//
// eloWinProb n'est PAS extrait ici : son parametre eloStats est deja
// inutilise dans le corps de calcFinalProbs (elo_used:false en dur,
// confirme par audit) - hors perimetre de cette extraction, qui ne touche
// que les 4 fonctions listees dans le protocole.

const {
  calcPoissonProbs,
  calcDixonColesProbs,
  calcMonteCarlo,
  seedFromLambdas,
} = require("./models.js");
const {
  blendMatrices,
  deriveMarketsFromMatrix,
  buildAdaptiveDixonColesMatrix,
} = require("./markets/score-matrix.js");
const { applyCalibration, renormalizeToSumOne } = require("./calibration.js");

// Recalibration post-hoc (2026-09-13, voir ENGINE_RECALIBRATION_REPORT.md) :
// diagnostic prealable (CURRENT_ENGINE_CALIBRATION_REPORT.md, 6965 matchs
// reels 2021-2025, 5 ligues) - moteur SURCONFIANT en haut d'echelle et
// SOUS-CONFIANT en bas d'echelle sur 1X2/Over-Under 2.5/BTTS. Correction
// demandee explicitement par le proprietaire produit : recalibrer la
// confiance affichee SANS toucher au calcul Poisson/Dixon-Coles lui-meme -
// exactement ce que ce bloc fait : courbes isotonic regression (PAVA)
// fittees hors-ligne sur les saisons 2021-2023, VALIDEES sur les saisons
// 2024-2025 jamais vues par le fit (Brier ET ECE ameliores sur les TROIS
// marches mesures sur ce holdout - voir le rapport pour le detail chiffre
// complet). lib/data/calibration-params.json est charge UNE SEULE FOIS ici
// (mis en cache par require() de Node, jamais relu par prediction) ;
// applyCalibration()/lib/calibration.js#applyIsotonicCurve fait une
// recherche binaire O(log n) sur quelques dizaines de points - cout
// negligeable, mesure dans le rapport. Repli silencieux sur les
// probabilites BRUTES (jamais de crash) si le fichier de parametres est
// absent ou si un marche n'y est pas marque wired:true - le fit n'est
// jamais suppose exister a coup sur (ex: avant le premier
// `node scripts/fit-and-validate-calibration.js`, ou en environnement de
// test qui ne l'aurait pas encore genere).
let CALIBRATION_PARAMS = null;
try {
  CALIBRATION_PARAMS = require("./data/calibration-params.json");
} catch (e) {
  CALIBRATION_PARAMS = null;
}
function calibrationCurveFor(marketKey) {
  const entry = CALIBRATION_PARAMS && CALIBRATION_PARAMS.markets && CALIBRATION_PARAMS.markets[marketKey];
  return entry && entry.wired ? entry.curve : null;
}

// Meme source que le pipeline (config/leagues.json via LEAGUES_CONFIG) -
// identique a LEAGUE_IDS calcule en tete de update-data.yml, pour que
// isTop/isWC dans calcLambdas se comportent exactement pareil.
const LEAGUES_CONFIG = require("../config/leagues.json");
const LEAGUE_IDS = LEAGUES_CONFIG.leagues.map(function (l) {
  return l.apiFootballId;
});

function calcFinalProbs(lambdaH, lambdaA, eloStats) {
  // GATE A3 (SPEC LAB PRO v1.0) : le blend 0.35*Poisson+0.65*DC a ete
  // remplace par Dixon-Coles pur (rho=-0.0845 dans lib/models.js),
  // demontre algebriquement equivalent par EXP-000 (memes lambdas dans
  // les deux matrices -> rho_effectif = 0.65*-0.13). buildPoissonMatrix
  // n'est plus dans le chemin de decision ; blendMatrices reste appele
  // avec une seule matrice, poids 1, uniquement pour reutiliser sa
  // renormalisation deja testee plutot que d'en ecrire une nouvelle copie.
  // GATE A4 (SPEC LAB PRO v1.0 §22) : troncature adaptative plutot que
  // maxGoals=10 fixe - mesure reelle du 2026-09-04 : jusqu'a 1.11e-4 de
  // masse perdue sur des lambdas de production reels avec 10 fixe, six
  // ordres de grandeur au-dessus du seuil <1e-10 exige. Voir
  // lib/markets/score-matrix.js#buildAdaptiveDixonColesMatrix.
  var adaptive=buildAdaptiveDixonColesMatrix(lambdaH,lambdaA);
  var dixonMatrix=adaptive.matrix;
  var matrix=blendMatrices([{matrix:dixonMatrix,weight:1}]);
  var markets=deriveMarketsFromMatrix(matrix);
  function pct(value){return value*100;}
  var po = calcPoissonProbs(lambdaH, lambdaA);
  var dc = calcDixonColesProbs(lambdaH, lambdaA);
  // GATE C9 (SPEC LAB PRO v1.0 §39) : ecart connu de GATE A7 corrige -
  // calcMonteCarlo() etait appele sans seed (Math.random), rendant le
  // sous-objet `montecarlo` non reproductible d'un appel a l'autre pour
  // les memes lambdas. Seed derive deterministe de (lambdaH,lambdaA) :
  // aucun contexte externe requis, memes entrees -> meme sortie complete.
  // N'affecte ni p1/pN/p2/derived/poisson/dixon (deja deterministes,
  // calcules independamment de mc) ni donc jamais market/edge/stake.
  var mc = calcMonteCarlo(lambdaH, lambdaA, { seed: seedFromLambdas(lambdaH, lambdaA) });

  // Probabilites BRUTES (pre-calibration) - exactement ce que ce module
  // retournait avant la recalibration post-hoc. `derived` (marches non
  // valides par le backtest : double chance, team totals, clean sheet...)
  // et les sous-objets `poisson`/`dixon`/`montecarlo` (diagnostics de
  // transparence "accord entre modeles", voir computeModelAgreement dans
  // update-data.yml) restent VOLONTAIREMENT bruts, jamais calibres -
  // seuls les 3 marches reellement mesures par
  // CURRENT_ENGINE_CALIBRATION_REPORT.md (1X2, Over/Under 2.5, BTTS) le
  // sont, sur leurs champs de sortie top-level uniquement (voir
  // ENGINE_RECALIBRATION_REPORT.md, section "Champs NON calibres").
  var rawP1=pct(markets.p1), rawPN=pct(markets.pN), rawP2=pct(markets.p2);
  var rawOver15=pct(markets.overUnder['1.5'].over);
  var rawOver25=pct(markets.overUnder['2.5'].over);
  var rawOver35=pct(markets.overUnder['3.5'].over);
  var rawBttsY=pct(markets.btts.yes);

  var calibrationApplied={"1X2":false,"OVER_2_5":false,"BTTS_YES":false};

  var finalP1=rawP1, finalPN=rawPN, finalP2=rawP2;
  var curve1x2=calibrationCurveFor("1X2");
  if(curve1x2){
    var cal1=applyCalibration(rawP1/100,curve1x2);
    var calN=applyCalibration(rawPN/100,curve1x2);
    var cal2=applyCalibration(rawP2/100,curve1x2);
    // p1/pN/p2 sont mutuellement exclusifs et exhaustifs (une seule et
    // meme courbe leur est appliquee, voir ENGINE_RECALIBRATION_REPORT.md
    // "granularite du fit" - jamais une courbe par issue) - calibrer
    // chaque issue independamment ne garantit pas nativement une somme a 1,
    // renormalisation proportionnelle obligatoire (meme convention que
    // lib/markets/score-matrix.js#blendMatrices) pour ne jamais casser
    // tests/market-coherence.test.js ("1X2 somme a 100%").
    var renorm1x2=renormalizeToSumOne([cal1,calN,cal2]);
    finalP1=renorm1x2[0]*100; finalPN=renorm1x2[1]*100; finalP2=renorm1x2[2]*100;
    calibrationApplied["1X2"]=true;
  }

  var finalOver25=rawOver25;
  var curveOU=calibrationCurveFor("OVER_2_5");
  if(curveOU){
    finalOver25=applyCalibration(rawOver25/100,curveOU)*100;
    // Garde-fou structurel : Over2.5 est mathematiquement EMBOITE entre
    // Over1.5 et Over3.5 (P(total>1.5)>=P(total>2.5)>=P(total>3.5)), mais
    // over15/over35 restent BRUTS (jamais mesures par le backtest, donc
    // jamais calibres sans preuve - voir limite documentee). Sur des
    // lambdas extremes (mesure empirique : lambdaH=3.40/lambdaA=3.00,
    // deux equipes a tres fort volume de buts), la courbe isotonic
    // plafonne a la plus haute valeur observee dans les donnees
    // d'entrainement (~67%) alors qu'Over3.5 brut peut legitimement la
    // depasser - sans ce clamp, la calibration casserait
    // tests/market-coherence.test.js ("monotonie Over1.5>=Over2.5>=Over3.5").
    // PAS un cas marginal : mesure sur les 6965 matchs reels du backtest,
    // ce clamp se declenche sur 1097 d'entre eux (15.7%) - voir
    // ENGINE_RECALIBRATION_REPORT.md section OVER_2_5 pour le detail. Les
    // chiffres avant/apres de ce rapport incluent deja ce clamp (mesure
    // honnete, pas une version optimiste sans lui) et montrent que la
    // correction reste benefique sur le holdout meme avec cette limite.
    finalOver25=Math.min(rawOver15,Math.max(finalOver25,rawOver35));
    calibrationApplied.OVER_2_5=true;
  }
  var finalUnder25=100-finalOver25; // complement exact - jamais calibre independamment (meme evenement binaire vu de l'autre cote, voir ENGINE_RECALIBRATION_REPORT.md)

  var finalBttsY=rawBttsY;
  var curveBtts=calibrationCurveFor("BTTS_YES");
  if(curveBtts){
    finalBttsY=applyCalibration(rawBttsY/100,curveBtts)*100;
    calibrationApplied.BTTS_YES=true;
  }
  var finalBttsN=100-finalBttsY; // complement exact, meme raison que under25 ci-dessus

  return {
    p1:finalP1, pN:finalPN, p2:finalP2,
    over15:rawOver15, over25:finalOver25,
    under25:finalUnder25, over35:rawOver35,
    under35:pct(markets.overUnder['3.5'].under), bttsY:finalBttsY, bttsN:finalBttsN,
    derived:markets,
    poisson:{p1:po.p1,pN:po.pN,p2:po.p2,over25:po.over25,bttsN:po.bttsN},
    dixon:{p1:dc.p1,pN:dc.pN,p2:dc.p2,over25:dc.over25,bttsN:dc.bttsN},
    montecarlo:{p1:mc.p1,pN:mc.pN,p2:mc.p2,over25:mc.over25,bttsN:mc.bttsN,top_scores:mc.top_scores||[],top_scores_full:mc.top_scores_full||[],simulations:mc.simulations||null},
    elo_used:false,
    matrix_max_goal:adaptive.maxGoal,
    matrix_tail_mass:adaptive.tailMass,
    calibration_applied:calibrationApplied,
  };
}
function calcLambdas(bmHdom, beHdom, mdHdom, bmAext, beAext, meAext, leagueAvgH, leagueAvgA, leagueId) {
  var leagAvgH=leagueAvgH||1.35, leagAvgA=leagueAvgA||1.10;
  // La liste de lancement (config/leagues.json) est deja restreinte a 13
  // competitions fortes et bien couvertes : toutes recoivent le seuil
  // "isTop" (avant : sous-liste ad hoc [39,61,140,135,78,2,3] parmi ~35
  // championnats melanges, dont plusieurs seconds/faibles).
  var isTop=leagueId&&LEAGUE_IDS.indexOf(leagueId)!==-1;
  var isWC=leagueId===1;
  var minLH=isWC?0.90:isTop?1.05:0.95;
  var minLA=isWC?0.80:isTop?0.90:0.80;
  var attH=mdHdom>0?(bmHdom/mdHdom)/leagAvgH:1;
  var defH=mdHdom>0?(beHdom/mdHdom)/leagAvgA:1;
  var attA=meAext>0?(bmAext/meAext)/leagAvgA:1;
  var defA=meAext>0?(beAext/meAext)/leagAvgH:1;
  var maxLH=3.4, maxLA=3.0;
  return {
    lambdaH:parseFloat(Math.min(maxLH,Math.max(minLH,attH*defA*leagAvgH)).toFixed(3)),
    lambdaA:parseFloat(Math.min(maxLA,Math.max(minLA,attA*defH*leagAvgA)).toFixed(3))
  };
}
function calcCriteres(stats,isDom,rank){
  if(!stats)return null;
  var total=(stats.fixtures&&stats.fixtures.played&&stats.fixtures.played.total)||0;
  if(total<3)return null;
  var bm=(stats.goals&&stats.goals.for&&stats.goals.for.total&&stats.goals.for.total.total)||0;
  var be=(stats.goals&&stats.goals.against&&stats.goals.against.total&&stats.goals.against.total.total)||0;
  var form=(stats.form||'').slice(-5);
  var formWeights=[1.50,1.35,1.20,1.10,1.00];
  var formChars=form.split('').reverse();
  var ptsW=0,maxPtsW=0;
  formChars.forEach(function(ch,i){
    var w=formWeights[i]||1.00;
    ptsW+=(ch==='W'?3:ch==='D'?1:0)*w;
    maxPtsW+=3*w;
  });
  var fr=Math.round(ptsW/Math.max(maxPtsW,0.01)*100);
  var att=Math.min(100,Math.round(bm/Math.max(total,1)*40));
  var def=Math.max(0,Math.min(100,Math.round((2.5-be/Math.max(total,1))*35)));
  var vd=(stats.fixtures&&stats.fixtures.wins&&stats.fixtures.wins.home)||0;
  var md=(stats.fixtures&&stats.fixtures.played&&stats.fixtures.played.home)||Math.round(total/2);
  var me=(stats.fixtures&&stats.fixtures.played&&stats.fixtures.played.away)||Math.round(total/2);
  var fd=isDom?Math.min(100,Math.round(vd/Math.max(md,1)*100)):Math.min(100,Math.round((stats.fixtures&&stats.fixtures.wins&&stats.fixtures.wins.away||0)/Math.max(me,1)*100));
  var mot=70;
  if(rank){if(rank<=3)mot=95;else if(rank<=6)mot=85;else if(rank<=10)mot=70;else if(rank>=17)mot=90;else mot=60;}
  return{fd:Math.max(0,Math.min(100,fd)),att:Math.max(0,Math.min(100,att)),def:Math.max(0,Math.min(100,def)),fr:Math.max(0,Math.min(100,fr)),mot:Math.max(0,Math.min(100,mot)),fat:50,source:'api-sports-team-statistics',sample_size:total};
}
function calcFatigue(last10){
  if(!last10||!last10.length)return{val:40,info:'Calendrier inconnu'};
  var now=new Date();
  var last=new Date(last10[0].date_full||last10[0].d);
  var daysSince=Math.round((now-last)/(1000*60*60*24));
  var matchesIn14=last10.filter(function(m){return (now-new Date(m.date_full||m.d))/(1000*60*60*24)<=14;}).length;
  var score=0;
  if(daysSince<=2)score=90;else if(daysSince<=4)score=70;else if(daysSince<=6)score=50;else if(daysSince<=8)score=30;else score=15;
  if(matchesIn14>=3)score=Math.min(100,score+20);
  return{val:Math.round(score),info:daysSince<=7?'Dernier match il y a '+daysSince+'j - '+matchesIn14+' match(s) en 14j':'Repos '+daysSince+' jours'};
}

module.exports = { calcFinalProbs, calcLambdas, calcCriteres, calcFatigue, LEAGUE_IDS };
