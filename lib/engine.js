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
  return {
    p1:pct(markets.p1), pN:pct(markets.pN), p2:pct(markets.p2),
    over15:pct(markets.overUnder['1.5'].over), over25:pct(markets.overUnder['2.5'].over),
    under25:pct(markets.overUnder['2.5'].under), over35:pct(markets.overUnder['3.5'].over),
    under35:pct(markets.overUnder['3.5'].under), bttsY:pct(markets.btts.yes), bttsN:pct(markets.btts.no),
    derived:markets,
    poisson:{p1:po.p1,pN:po.pN,p2:po.p2,over25:po.over25,bttsN:po.bttsN},
    dixon:{p1:dc.p1,pN:dc.pN,p2:dc.p2,over25:dc.over25,bttsN:dc.bttsN},
    montecarlo:{p1:mc.p1,pN:mc.pN,p2:mc.p2,over25:mc.over25,bttsN:mc.bttsN,top_scores:mc.top_scores||[],top_scores_full:mc.top_scores_full||[],simulations:mc.simulations||null},
    elo_used:false,
    matrix_max_goal:adaptive.maxGoal,
    matrix_tail_mass:adaptive.tailMass,
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
